import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KIE_API_KEY = Deno.env.get("KIE_API_KEY") ?? "";
const KIE_BASE = "https://api.kie.ai/api/v1";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY") ?? "";
const HEYGEN_BASE = "https://api.heygen.com";

// Cloudflare Workers AI (Llama) — for training prompt engineering
const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "";
const CF_AI_GATEWAY_BASE = Deno.env.get("CF_AI_GATEWAY_BASE") ?? "";
const CF_WORKERS_AI = Deno.env.get("CF_AI_GATEWAY_WORKERS_AI")
  || (CF_AI_GATEWAY_BASE ? `${CF_AI_GATEWAY_BASE}/workers-ai` : "");
const LLAMA_FAST  = "@cf/meta/llama-3.1-8b-instruct";
const LLAMA_HEAVY = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// ── R2 CDN Upload (AWS SigV4) ─────────────────────────────────────────────────

async function _hmacSHA256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function _sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function _sha256hexBin(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Upload text (HTML/JSON) or binary (image/video) to R2
async function uploadToR2(
  accountId: string, accessKeyId: string, secretAccessKey: string,
  bucket: string, key: string, body: string | Uint8Array, contentType: string,
): Promise<boolean> {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const enc = new TextEncoder();
  const bodyBytes = typeof body === "string" ? enc.encode(body) : body;
  const payloadHash = await _sha256hexBin(bodyBytes);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", `/${bucket}/${key}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await _sha256hex(canonicalRequest)].join("\n");
  const kDate    = await _hmacSHA256(enc.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion  = await _hmacSHA256(kDate, "auto");
  const kService = await _hmacSHA256(kRegion, "s3");
  const kSigning = await _hmacSHA256(kService, "aws4_request");
  const sigBuf   = await _hmacSHA256(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${host}/${bucket}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": contentType, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, "Authorization": authorization },
    body: bodyBytes,
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
  return true;
}

// Helper: get R2 env vars — returns null if any missing
function getR2Config(): { accountId: string; accessKeyId: string; secretKey: string; bucket: string; publicUrl: string } | null {
  const accountId  = Deno.env.get("R2_ACCOUNT_ID") || Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
  const secretKey  = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
  const bucket     = Deno.env.get("R2_BUCKET_NAME") || Deno.env.get("R2_BUCKET") || "";
  const publicUrl  = Deno.env.get("R2_PUBLIC_URL") ?? "";
  if (!accountId || !accessKeyId || !secretKey || !bucket || !publicUrl) return null;
  return { accountId, accessKeyId, secretKey, bucket, publicUrl };
}

// Download URL and upload to R2, return public CDN URL or null on failure
async function proxyToR2(sourceUrl: string, r2Key: string, contentType: string): Promise<string | null> {
  const r2 = getR2Config();
  if (!r2) return null;
  try {
    const dlRes = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!dlRes.ok) return null;
    const bytes = new Uint8Array(await dlRes.arrayBuffer());
    await uploadToR2(r2.accountId, r2.accessKeyId, r2.secretKey, r2.bucket, r2Key, bytes, contentType);
    return `${r2.publicUrl}/${r2Key}`;
  } catch (e) {
    console.error("[R2 proxy] failed:", e);
    return null;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function kieHeaders() {
  return { "Authorization": `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" };
}

async function kiePost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${KIE_BASE}${path}`, {
    method: "POST", headers: kieHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KIE API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kieGet(path: string) {
  const res = await fetch(`${KIE_BASE}${path}`, { headers: kieHeaders() });
  if (!res.ok) throw new Error(`KIE API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// KIE API — Runway Gen4.5 image-to-video (5s clip)
async function kieRunwayImageToVideo(imageUrl: string, prompt: string, aspectRatio: string): Promise<{ task_id: string; status: string }> {
  const res = await kiePost("/jobs/createTask", {
    model: "runway/gen4.5-image-to-video",
    image_url: imageUrl,
    prompt,
    aspect_ratio: aspectRatio,
    duration: 5,
  });
  const taskId = res.data?.task_id ?? res.data?.taskId ?? res.task_id ?? res.id ?? null;
  if (!taskId) throw new Error("KIE Runway image-to-video: no task_id in response");
  return { task_id: taskId, status: res.data?.state ?? "processing" };
}

// Poll a KIE task until done or timeout (maxWaitMs)
async function kieWaitForTask(taskId: string, maxWaitMs = 240_000): Promise<{ video_url: string | null; image_url: string | null; status: string }> {
  const interval = 6000;
  const maxTries = Math.ceil(maxWaitMs / interval);
  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, interval));
    const res = await kieGet(`/jobs/recordInfo?taskId=${taskId}`);
    const state: string = res.data?.state ?? res.status ?? "waiting";
    if (state === "success" || state === "DONE" || state === "completed") {
      const resultJson = res.data?.resultJson ? JSON.parse(res.data.resultJson) : null;
      const resultUrls: string[] = resultJson?.resultUrls ?? [];
      return {
        video_url: res.data?.video_url ?? resultUrls.find((u: string) => u.includes(".mp4")) ?? null,
        image_url: resultUrls.find((u: string) => !u.includes(".mp4")) ?? resultUrls[0] ?? null,
        status: "completed",
      };
    }
    if (state === "fail" || state === "failed" || state === "error") {
      return { video_url: null, image_url: null, status: "failed" };
    }
  }
  return { video_url: null, image_url: null, status: "timeout" };
}

// HeyGen — avatar video generation (up to 3 minutes, YouTube format)
async function heygenGenerateAvatar(prompt: string, avatarId: string, voiceId: string): Promise<{ video_id: string }> {
  if (!HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY not configured");
  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: { "x-api-key": HEYGEN_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: "avatar", avatar_id: avatarId },
        voice: { type: "text", input_text: prompt, voice_id: voiceId },
      }],
      dimension: { width: 1920, height: 1080 },
      test: false,
    }),
  });
  if (!res.ok) throw new Error(`HeyGen error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== 100) throw new Error(`HeyGen API error: ${data.message ?? "unknown"}`);
  return { video_id: data.data.video_id };
}

async function heygenPoll(videoId: string): Promise<{ status: string; video_url: string | null; thumbnail_url: string | null }> {
  if (!HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY not configured");
  const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: { "x-api-key": HEYGEN_API_KEY },
  });
  if (!res.ok) throw new Error(`HeyGen poll error ${res.status}`);
  const data = await res.json();
  return {
    status: data.data?.status ?? "processing",
    video_url: data.data?.video_url ?? null,
    thumbnail_url: data.data?.thumbnail_url ?? null,
  };
}

// OpenAI — for high-quality smart prompts in image/video wizard steps
async function openAIChat(systemPrompt: string, userPrompt: string, maxTokens = 300): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Claude Haiku — fast, cheap orchestrator for prompt optimization
async function claudeHaiku(systemPrompt: string, userPrompt: string, maxTokens = 300): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude Haiku error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

// WA callback — sends result directly to WA group when background task completes
async function sendWACallback(waCallback: string, waToken: string, message: string): Promise<void> {
  if (!waCallback || !waToken) return;
  try {
    const isGroup = waCallback.includes('@g.us') || waCallback.includes('-');
    const params: Record<string, string> = { target: waCallback, message, delay: '0' };
    if (!isGroup) params.countryCode = '62';
    await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: waToken, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('[sendWACallback] failed:', (e as Error).message);
  }
}

// Cloudflare Llama — for training prompt engineering + smart looping learning
async function llamaChat(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 600,
  heavy = false,
): Promise<string> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("Cloudflare AI not configured");
  const model = heavy ? LLAMA_HEAVY : LLAMA_FAST;
  const hasGateway = CF_WORKERS_AI.length > 0;
  const url = hasGateway
    ? `${CF_WORKERS_AI}/${model}`
    : `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.result?.response?.trim() ?? "";
}

// ── today midnight UTC ────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { action, brand_id, ...data } = body;

    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const noKieActions = ["check_daily_usage", "generate_smart_prompt", "submit_feedback", "generate_article", "update_article"];
    if (!KIE_API_KEY && !noKieActions.includes(action)) {
      return new Response(JSON.stringify({ error: "KIE_API_KEY not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = (d: unknown, status = 200) =>
      new Response(JSON.stringify(d), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── CHECK DAILY USAGE ────────────────────────────────────────────────────
    if (action === "check_daily_usage") {
      const midnight = todayISO();
      // 7 days ago (weekly window for HeyGen quota)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [imgRes, vidRes, avatarRes] = await Promise.all([
        supabase.from("gv_image_generations")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand_id)
          .gte("created_at", midnight)
          .not("status", "in", '("failed","error","cancelled")'),
        supabase.from("gv_video_generations")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand_id)
          .gte("created_at", midnight)
          .neq("ai_model", "heygen-avatar")
          .not("video_status", "in", '("failed","error","cancelled")'),
        supabase.from("gv_video_generations")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand_id)
          .eq("ai_model", "heygen-avatar")
          .gte("created_at", weekAgo),  // counts ALL attempts (no retry = quota consumed even on fail)
      ]);
      return json({ success: true, images_today: imgRes.count ?? 0, videos_today: vidRes.count ?? 0, avatar_videos_this_week: avatarRes.count ?? 0 });
    }

    // ── GENERATE SMART PROMPT (OpenAI + history learning) ────────────────────
    if (action === "generate_smart_prompt") {
      const { prompt_type = "image", subject_type = "product" } = data;
      // Sanitize user-controlled fields — strip newlines/control chars, cap length (prevent prompt injection)
      const sanitize = (v: unknown, max = 200) =>
        String(v ?? "").replace(/[\n\r\t]/g, " ").replace(/[`${}]/g, "").trim().slice(0, max);
      const model_name  = sanitize(data.model_name);
      const topic_style = sanitize(data.topic_style);
      const task_context = sanitize(data.task_context);

      // Fetch recent successful generations + RLHF feedback learning data
      const [imgHistory, vidHistory, likedImgs, dislikedImgs] = await Promise.all([
        supabase.from("gv_image_generations")
          .select("prompt_text, status, target_platform, style_preset")
          .eq("brand_id", brand_id)
          .in("status", ["completed", "succeeded"])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("gv_video_generations")
          .select("hook, video_status, target_platform")
          .eq("brand_id", brand_id)
          .in("video_status", ["completed", "succeeded"])
          .order("created_at", { ascending: false })
          .limit(3),
        supabase.from("gv_image_generations")
          .select("prompt_text")
          .eq("brand_id", brand_id)
          .eq("feedback", "liked")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("gv_image_generations")
          .select("prompt_text")
          .eq("brand_id", brand_id)
          .eq("feedback", "disliked")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      const recentImgPrompts = (imgHistory.data ?? []).map((r: { prompt_text: string }) => `  - ${r.prompt_text}`).join("\n");
      const recentVidHooks = (vidHistory.data ?? []).map((r: { hook: string }) => `  - ${r.hook}`).join("\n");
      const likedList2 = (likedImgs.data ?? []).map((r: { prompt_text: string }) => r.prompt_text).filter(Boolean);
      const dislikedList2 = (dislikedImgs.data ?? []).map((r: { prompt_text: string }) => r.prompt_text).filter(Boolean);

      // ── Llama reverse engineering step (if feedback exists) ──────────────
      // Llama analyzes liked/disliked patterns → extracts rules → OpenAI uses those rules
      let llamaREInsights = "";
      if (likedList2.length > 0 || dislikedList2.length > 0) {
        try {
          llamaREInsights = await llamaChat(
            `You are an image quality pattern analyst. Reverse-engineer the quality signals from user-rated prompts.
Analyze LIKED vs DISLIKED prompts and extract precise rules:
- Lighting, composition, color, mood, style, background patterns
Output ONLY the structured rules (max 120 words):
✅ REPLICATE: [rules from liked]
❌ AVOID: [rules from disliked]`,
            `${likedList2.length > 0 ? `LIKED (${likedList2.length}): ${likedList2.join(" | ")}` : ""}
${dislikedList2.length > 0 ? `DISLIKED (${dislikedList2.length}): ${dislikedList2.join(" | ")}` : ""}`,
            250,
            false,
          );
        } catch (e) {
          console.error("Llama RE (smart prompt) failed:", e instanceof Error ? e.message : e);
        }
      }

      const subjectLabel = subject_type === "both" ? "character and product together" : subject_type;
      const isVideo = prompt_type === "video";

      const systemPrompt = `You are a world-class ${isVideo ? "video" : "photography"} director and creative AI prompt engineer for social media brands.

Your specialty is crafting highly specific, commercially powerful ${isVideo ? "video" : "image"} generation prompts that produce stunning, viral-worthy content.

Brand context:
- Subject: ${subjectLabel}${model_name ? ` — specifically "${model_name}"` : ""}
- Style/Topic: ${topic_style || "commercial brand content"}
${task_context ? `- Task context: ${task_context}` : ""}

Learning from this brand's recent successful content:
${recentImgPrompts ? `Recent images that worked:\n${recentImgPrompts}` : ""}
${recentVidHooks ? `Recent videos that worked:\n${recentVidHooks}` : ""}${llamaREInsights ? `\n\nRLHF Quality Rules (reverse-engineered by Llama from user ratings):\n${llamaREInsights}` : ""}

Rules:
1. Generate ONE highly detailed, specific prompt only — no explanation, no quotes, just the prompt
2. Include lighting style, composition, mood, setting, technical quality descriptors
3. Make it commercially optimized for social media (Instagram/TikTok)
4. Apply the RLHF quality rules above — replicate liked patterns, eliminate disliked patterns
5. Keep it under 150 words`;

      const userMsg = isVideo
        ? `Generate a compelling ${topic_style} video prompt for ${subjectLabel} content. Include movement, mood, setting, and style direction.`
        : `Generate a stunning commercial ${topic_style || "product"} photography prompt for ${subjectLabel}. Include lighting, composition, setting, and technical quality.`;

      const prompt = await openAIChat(systemPrompt, userMsg, 200);
      return json({ success: true, prompt });
    }

    // ── GENERATE SYNTHETICS (for training — uses Llama + Flux-2 Pro, bypasses daily quota) ──
    if (action === "generate_synthetics") {
      const { name, training_type = "product", count = 8, past_datasets = [] } = data;
      if (!name) return json({ error: "name is required" }, 400);

      const typeLabel = training_type === "character" ? "person/character" : "product";

      // Smart looping learning context from past training datasets
      const pastContext = Array.isArray(past_datasets) && past_datasets.length > 0
        ? `\n\nLearning from ${past_datasets.length} previously trained datasets in this brand:\n${past_datasets.map((d: { dataset_name: string; theme: string }) => `- ${d.dataset_name} (${d.theme})`).join("\n")}\nApply pattern recognition from these to create better-optimized training data.`
        : "";

      // ── STEP 1: Fetch RLHF feedback data for Llama reverse engineering ────
      const [likedRows, dislikedRows] = await Promise.all([
        supabase.from("gv_image_generations")
          .select("prompt_text")
          .eq("brand_id", brand_id)
          .eq("feedback", "liked")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("gv_image_generations")
          .select("prompt_text")
          .eq("brand_id", brand_id)
          .eq("feedback", "disliked")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const likedList = (likedRows.data ?? []).map((r: { prompt_text: string }) => r.prompt_text).filter(Boolean);
      const dislikedList = (dislikedRows.data ?? []).map((r: { prompt_text: string }) => r.prompt_text).filter(Boolean);

      // ── STEP 2: Llama reverse engineering — extract quality rules from feedback ──
      let reverseEngineeredRules = "";
      if (likedList.length > 0 || dislikedList.length > 0) {
        try {
          reverseEngineeredRules = await llamaChat(
            `You are an expert AI image quality analyst. Your job is to reverse-engineer patterns from user feedback to extract actionable quality rules for AI image prompt engineering.

Analyze the LIKED vs DISLIKED image prompts, then extract precise, structured quality rules:
- Examine lighting conditions, composition angles, background types, color tones, mood, style elements
- For LIKED: identify what consistently works — replicate these
- For DISLIKED: identify what consistently fails — eliminate these

Return a structured rule set (max 200 words):
✅ REPLICATE from liked:
- [specific rule]
❌ AVOID from disliked:
- [specific rule]`,
            `${likedList.length > 0 ? `LIKED prompts (${likedList.length}):\n${likedList.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "No liked examples yet."}

${dislikedList.length > 0 ? `DISLIKED prompts (${dislikedList.length}):\n${dislikedList.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "No disliked examples yet."}

Reverse-engineer the quality patterns. Be specific about technical elements (lighting, angles, backgrounds, style).`,
            400,
            true, // heavy Llama (70B) for RE — accuracy over speed for training quality
          );
        } catch (e) {
          console.error("Llama reverse engineering failed:", e instanceof Error ? e.message : e);
        }
      }

      const rlhfContext = reverseEngineeredRules
        ? `\n\nRLHF Reverse-Engineered Quality Rules (derived from this brand's user ratings):\n${reverseEngineeredRules}\n\nApply these rules strictly to every prompt — replicate liked patterns, eliminate disliked patterns.`
        : "";

      // ── STEP 3: Main Llama prompt generation — uses reverse-engineered rules ──
      let prompts: string[] = [];
      try {
        const systemMsg = `You are an expert AI training data engineer specializing in Flux-2 Pro image generation model fine-tuning.

Your task: Generate exactly ${count} highly varied, technically optimized training image prompts for a LoRA fine-tuning dataset.

Subject: ${typeLabel} named "${name}"
Base model: Flux-2 Pro (requires specific prompt format for best results)${pastContext}${rlhfContext}

Requirements for each prompt:
- Different angle/perspective (front, 3/4, side, back, overhead, close-up, environmental)
- Different lighting scenario (studio strobe, natural window, golden hour, dramatic, soft box, ring light)
- Different background context (white studio, gradient, lifestyle, dark, outdoor, textured)
- Include technical photography terms (f-stop, focal length hints, exposure)
- Optimized for Flux-2 Pro: use descriptive, detailed language; avoid vague terms
- Each prompt: 30-60 words, highly specific and distinct
${rlhfContext ? "- Strictly apply the RLHF quality rules above — this is mandatory" : ""}

Return ONLY a valid JSON array of ${count} prompt strings. No explanation, no markdown, just the array.`;

        const raw = await llamaChat(
          systemMsg,
          `Generate ${count} Flux-2 Pro training prompts for "${name}" (${typeLabel}). Make each unique in angle, lighting, and setting.${rlhfContext ? " Apply the RLHF quality rules strictly." : ""}`,
          900,
          true, // heavy Llama (70B) for best JSON reliability and prompt quality
        );

        // Parse JSON array from Llama response
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) prompts = parsed.slice(0, count);
        }
      } catch (e) {
        console.error("Llama prompt generation failed:", e instanceof Error ? e.message : e);
      }

      // Fallback: hardcoded varied prompts if Llama fails
      if (prompts.length === 0) {
        prompts = [
          `${typeLabel} "${name}", front view, white seamless studio background, professional strobe lighting, f/8, sharp detail, commercial product photography, Flux-2 Pro optimized`,
          `${typeLabel} "${name}", 45-degree left angle, soft natural window light, minimalist white backdrop, lifestyle product shot, high-end commercial`,
          `${typeLabel} "${name}", right profile view, dramatic side lighting, dark gradient background, luxury brand aesthetic, cinematic quality`,
          `${typeLabel} "${name}", back view, soft gradient background, editorial photography style, premium quality, studio environment`,
          `${typeLabel} "${name}", overhead top-down flatlay, minimal props arrangement, warm neutral tones, social media lifestyle`,
          `${typeLabel} "${name}", macro close-up detail shot, studio ring light, sharp focus extreme detail, textural quality`,
          `${typeLabel} "${name}", environmental lifestyle context, natural outdoor setting, golden hour warm light, authentic brand story`,
          `${typeLabel} "${name}", hero shot low angle, cinematic dramatic lighting, premium magazine cover quality, high fashion aesthetic`,
        ].slice(0, count);
      }

      // Generate images in parallel batches of 4 using Flux-2 Pro for highest quality training data
      const results: string[] = [];
      const BATCH = 4;
      for (let i = 0; i < prompts.length; i += BATCH) {
        const batch = prompts.slice(i, i + BATCH);
        const settled = await Promise.allSettled(
          batch.map((prompt) => kiePost("/image/generate", { prompt, aspect_ratio: "1:1", model: "flux-2-pro", num_images: 1 }))
        );
        for (const r of settled) {
          if (r.status === "fulfilled") {
            const url = r.value?.image_url ?? r.value?.url ?? null;
            if (url) results.push(url);
          }
        }
      }

      return json({
        success: true,
        synthetic_urls: results,
        count: results.length,
        reverse_engineered_rules: reverseEngineeredRules || null,
        rlhf_applied: likedList.length > 0 || dislikedList.length > 0,
      });
    }

    // ── GENERATE IMAGE (background task — 400s wall clock) ───────────────────
    if (action === "generate_image") {
      const { prompt, aspect_ratio = "1:1" } = data;
      const waCallback  = String(data.wa_callback ?? "");
      const waToken     = String(data.wa_token ?? "");
      const numImages   = Math.min(Math.max(parseInt(String(data.num_images ?? 1)), 1), 4);
      if (!prompt) return json({ error: "prompt is required" }, 400);

      // Insert placeholder for the first image (additional images share same batch)
      const { data: inserted } = await supabase.from("gv_image_generations").insert({
        brand_id,
        prompt_text: String(prompt),
        aspect_ratio,
        status: "processing",
        ai_provider: "processing",
        ai_model: "processing",
        target_platform: String(data.platform ?? "instagram"),
        metadata: { prompt, aspect_ratio, num_images: numImages },
      }).select("id").single();
      const dbId: string | null = inserted?.id ?? null;

      // Background: Haiku optimize → KIE Flux 2 Pro (N tasks in parallel) → DALL-E fallback → WA callback
      const bgTask = (async () => {
        // Step 1: Optimize prompt once with Claude Haiku (shared across all images)
        let optimizedPrompt = String(prompt);
        if (ANTHROPIC_API_KEY) {
          try {
            optimizedPrompt = await claudeHaiku(
              `You are an expert AI image prompt engineer specializing in Flux image generation.
Take the user's simple description and expand it into a detailed, professional image generation prompt.
Include: subject details, lighting (e.g. soft studio light, golden hour), composition (e.g. centered, rule of thirds),
style (e.g. professional photography, cinematic), quality descriptors (e.g. sharp focus, high resolution, 8K).
Keep under 150 words. Return ONLY the optimized prompt, no explanation, no quotes.`,
              `Original description: ${prompt}`,
              200,
            );
            console.log(`[generate_image] optimized: "${String(prompt).slice(0, 60)}" → "${optimizedPrompt.slice(0, 60)}"`);
          } catch (e) {
            console.warn("[generate_image] prompt optimization failed:", (e as Error).message);
          }
        }

        const finalImageUrls: string[] = [];
        let provider = "kie-flux2-pro";

        // Step 2: KIE Flux 2 Pro — launch N tasks in parallel, poll all
        if (KIE_API_KEY) {
          try {
            // Launch all N tasks concurrently
            const taskIds: string[] = [];
            const createResults = await Promise.allSettled(
              Array.from({ length: numImages }, () =>
                kiePost("/jobs/createTask", {
                  model: "flux-2/pro-text-to-image",
                  input: { prompt: optimizedPrompt, aspect_ratio, resolution: "1K" },
                })
              )
            );
            for (const r of createResults) {
              if (r.status === "fulfilled") {
                const tid = r.value?.data?.taskId ?? r.value?.taskId ?? null;
                if (tid) { taskIds.push(String(tid)); console.log(`[generate_image] KIE task: ${tid}`); }
              }
            }
            // Poll all tasks in parallel (max 5 min per task)
            await Promise.allSettled(
              taskIds.map(async (taskId) => {
                for (let i = 0; i < 60; i++) {
                  await new Promise((r) => setTimeout(r, 5000));
                  const pollRes = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: kieHeaders() });
                  if (!pollRes.ok) break;
                  const pollData = await pollRes.json();
                  const state: string = pollData.data?.state ?? pollData.state ?? "waiting";
                  if (state === "success") {
                    const resultJson = pollData.data?.resultJson ?? null;
                    let resultUrls: string[] = [];
                    if (resultJson) try { resultUrls = JSON.parse(resultJson).resultUrls ?? []; } catch { /* */ }
                    const kieUrl = resultUrls[0] ?? null;
                    if (kieUrl) {
                      const r2Key = `images/${brand_id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
                      const cdnUrl = await proxyToR2(kieUrl, r2Key, "image/jpeg") ?? kieUrl;
                      finalImageUrls.push(cdnUrl);
                      console.log(`[generate_image] KIE Flux 2 Pro ✓ → ${cdnUrl}`);
                    }
                    break;
                  }
                  if (state === "fail") { console.error("[generate_image] KIE failed:", pollData.data?.failMsg); break; }
                }
              })
            );
          } catch (e) { console.error("[generate_image] KIE error:", (e as Error).message); }
        }

        // Step 3: Fallback — DALL-E 3 (only if all KIE tasks failed, generates 1 image)
        if (finalImageUrls.length === 0) {
          provider = "dall-e-3";
          const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
          if (OPENAI_KEY) {
            try {
              const sizeMap: Record<string, string> = { "1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792" };
              const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                body: JSON.stringify({ model: "dall-e-3", prompt: optimizedPrompt, n: 1, size: sizeMap[aspect_ratio] ?? "1024x1024", response_format: "url" }),
                signal: AbortSignal.timeout(60_000),
              });
              if (dalleRes.ok) {
                const dalleData = await dalleRes.json();
                const dalleUrl: string | null = dalleData.data?.[0]?.url ?? null;
                if (dalleUrl) {
                  const r2Key = `images/${brand_id}/${Date.now()}.png`;
                  finalImageUrls.push(await proxyToR2(dalleUrl, r2Key, "image/png") ?? dalleUrl);
                  console.log(`[generate_image] DALL-E 3 fallback → ${finalImageUrls[0]}`);
                }
              } else { console.error("[generate_image] DALL-E 3 error:", dalleRes.status); }
            } catch (e) { console.error("[generate_image] DALL-E 3 failed:", e); }
          }
        }

        // Step 4: Update primary DB record with first image; insert additional records for extra images
        if (dbId && finalImageUrls.length > 0) {
          await supabase.from("gv_image_generations").update({
            status: "completed", image_url: finalImageUrls[0],
            ai_provider: provider, ai_model: provider === "dall-e-3" ? "dall-e-3" : "flux-2-pro",
            metadata: { prompt, optimized_prompt: optimizedPrompt, aspect_ratio, provider, num_images: finalImageUrls.length },
          }).eq("id", dbId);
          // Insert additional DB records for images 2+
          if (finalImageUrls.length > 1) {
            await supabase.from("gv_image_generations").insert(
              finalImageUrls.slice(1).map(url => ({
                brand_id, prompt_text: String(prompt), aspect_ratio,
                status: "completed", image_url: url,
                ai_provider: provider, ai_model: provider === "dall-e-3" ? "dall-e-3" : "flux-2-pro",
                target_platform: String(data.platform ?? "instagram"),
                metadata: { prompt, optimized_prompt: optimizedPrompt, aspect_ratio, provider, batch_parent_id: dbId },
              }))
            );
          }
        } else if (dbId) {
          await supabase.from("gv_image_generations").update({ status: "failed" }).eq("id", dbId);
        }

        // Step 5: WA callback — all image URLs
        if (waCallback && waToken) {
          if (finalImageUrls.length > 0) {
            let msg = `🎨 *${finalImageUrls.length} Gambar berhasil di-generate!*`;
            finalImageUrls.forEach((url, i) => { msg += `\n\n🖼️ *${i + 1}.* ${url}`; });
            await sendWACallback(waCallback, waToken, msg);
          } else {
            await sendWACallback(waCallback, waToken, `❌ Gagal generate gambar — KIE Flux 2 Pro & DALL-E 3 tidak tersedia. Coba lagi nanti.`);
          }
        }
      })();

      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(bgTask); } else { await bgTask; }

      return json({ ok: true, success: true, status: "background", db_id: dbId });
    }

    // ── GENERATE VIDEO (5-phase pipeline, resumable) ────────────────────────
    // Option A (image_urls provided): Phase 0 synthetic continuity → Phase 3-5
    //   Phase 0: Claude Haiku extracts style → 6 Flux 2 Pro synthetic images
    // Option B (topic/manual): Phase 1 → Phase 2 → Phase 3-5
    //   Phase 1: KIE Flux 2 Pro → 12 images
    //   Phase 2: Claude Sonnet scores → top 6 (score ≥0.8, continuity-first)
    // Common phases:
    //   Phase 3: KIE Runway 4.5 → 6 × 5s clips
    //   Phase 4: Modal FFmpeg smart loop per-clip → each 5s → 8-10s
    //   Phase 5: Modal FFmpeg stitch → final 45-60s
    if (action === "generate_video") {
      const { prompt, aspect_ratio = "9:16", generation_id } = data;
      const waCallback    = String(data.wa_callback ?? "");
      const waToken       = String(data.wa_token ?? "");
      const inputImageUrls: string[] = Array.isArray(data.image_urls)
        ? (data.image_urls as string[]).filter(Boolean)
        : [];
      if (!prompt) return json({ error: "prompt is required" }, 400);

      // Load existing job for resumability
      let existingRow: Record<string, unknown> | null = null;
      if (generation_id) {
        const { data: row } = await supabase.from("gv_video_generations")
          .select("id, pipeline_step, pipeline_data, video_status")
          .eq("id", String(generation_id)).eq("brand_id", brand_id).maybeSingle();
        existingRow = row as Record<string, unknown> | null;
      }

      const pipelineCache: Record<string, unknown> = (existingRow?.pipeline_data as Record<string, unknown>) ?? {};
      let dbId: string | null = existingRow ? String(existingRow.id) : null;

      const savePhaseData = async (phase: number, note: string, phaseData?: Record<string, unknown>) => {
        if (!dbId) return;
        if (phaseData) Object.assign(pipelineCache, phaseData);
        await supabase.from("gv_video_generations").update({
          pipeline_step: phase,
          status: "processing",
          video_status: "processing",
          pipeline_data: { ...pipelineCache },
        }).eq("id", dbId);
        console.log(`[gen_video] Phase ${phase}: ${note}`);
      };

      if (!dbId) {
        const genMode = inputImageUrls.length > 0 ? "image-to-video" : "text-to-video";
        const { data: inserted } = await supabase.from("gv_video_generations").insert({
          brand_id,
          target_platform: data.platform ?? "tiktok",
          hook: prompt,
          ai_model: "flux2pro+runway-gen4-5",
          status: "processing",
          generation_mode: genMode,
          runway_task_id: null,
          video_url: null,
          video_thumbnail_url: null,
          video_aspect_ratio: aspect_ratio,
          video_status: "processing",
          pipeline_step: 0,
          pipeline_data: {},
        }).select("id").single();
        dbId = inserted?.id ?? null;
      }

      const bgTask = (async () => {
        try {
          // selectedImages is the shared output of Phase 0 or Phase 2
          let selectedImages: string[] = ((pipelineCache.phase2 as { selected_images?: string[] })?.selected_images) ?? [];

          if (inputImageUrls.length > 0) {
            // ── OPTION A: image picker → Phase 0 synthetic generation ──────
            if (selectedImages.length < 6) {
              await savePhaseData(0, `generating 6 synthetic continuity images from ${inputImageUrls.length} reference(s)`);

              // Step 0a: Claude Haiku vision → extract visual style for Flux 2 Pro
              let stylePrompt = `${String(prompt)}, cinematic quality, consistent visual style, 9:16 vertical format`;
              if (ANTHROPIC_API_KEY) {
                try {
                  type CItem = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
                  const visionContent: CItem[] = inputImageUrls.slice(0, 4).map(url => ({
                    type: "image" as const,
                    source: { type: "url" as const, url },
                  }));
                  visionContent.push({
                    type: "text" as const,
                    text: `Analyze these reference images. Extract a precise visual style description for generating 6 synthetic continuity images. Focus on: color palette, lighting direction, mood, composition, background style, subject characteristics. Output ONLY a Flux 2 Pro image generation prompt (max 100 words) that generates new images visually consistent with these references.`,
                  });
                  const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, messages: [{ role: "user", content: visionContent }] }),
                  });
                  if (haikuRes.ok) {
                    const hd = await haikuRes.json();
                    const extracted = hd.content?.[0]?.text?.trim() ?? "";
                    if (extracted) { stylePrompt = extracted; console.log(`[gen_video] Phase 0 style: "${stylePrompt.slice(0, 80)}"`); }
                  }
                } catch (e) {
                  console.warn("[gen_video] Phase 0 style extraction failed:", (e as Error).message);
                }
              }

              // Step 0b: Generate 6 synthetic images via Flux 2 Pro
              const syntheticTaskIds: string[] = [];
              const synBatch = await Promise.allSettled(
                Array.from({ length: 6 }, () =>
                  kiePost("/jobs/createTask", {
                    model: "flux-2/pro-text-to-image",
                    input: { prompt: stylePrompt, aspect_ratio, resolution: "1K" },
                  })
                )
              );
              for (const r of synBatch) {
                if (r.status === "fulfilled") {
                  const tid = r.value?.data?.taskId ?? r.value?.taskId ?? null;
                  if (tid) syntheticTaskIds.push(String(tid));
                }
              }
              // Save task IDs immediately — if function crashes during poll, task IDs are preserved
              await savePhaseData(0, `${syntheticTaskIds.length} tasks created, polling...`, {
                phase0: { style_prompt: stylePrompt, task_ids: syntheticTaskIds },
              });
              const syntheticUrls: string[] = [];
              // Poll concurrently, save after EACH completion (crash recovery at any point)
              await Promise.allSettled(
                syntheticTaskIds.map(async (tid) => {
                  const result = await kieWaitForTask(tid, 300_000);
                  if (result.image_url && result.status === "completed") {
                    syntheticUrls.push(result.image_url);
                    await savePhaseData(0, `${syntheticUrls.length}/${syntheticTaskIds.length} synthetic images`, {
                      phase0: { style_prompt: stylePrompt, task_ids: syntheticTaskIds, partial_urls: [...syntheticUrls] },
                    });
                  }
                })
              );
              console.log(`[gen_video] Phase 0 done: ${syntheticUrls.length}/6 synthetic images`);
              if (syntheticUrls.length === 0) throw new Error("Phase 0 failed: no synthetic images generated");
              selectedImages = syntheticUrls.slice(0, 6);
              await savePhaseData(2, `${selectedImages.length} synthetic images ready`, {
                phase0: { style_prompt: stylePrompt, input_image_count: inputImageUrls.length, synthetic_count: syntheticUrls.length },
                phase2: { selected_images: selectedImages },
              });
            } else {
              console.log(`[gen_video] Phase 0 resumed: ${selectedImages.length} synthetic images from cache`);
            }

          } else {
            // ── OPTION B: topic/manual → Phase 1 + Phase 2 ─────────────────

            // ── PHASE 1: Generate 12 images via KIE Flux 2 Pro ─────────────
            let imageUrls: string[] = ((pipelineCache.phase1 as { image_urls?: string[] })?.image_urls) ?? [];

            if (imageUrls.length < 6) {
              await savePhaseData(1, "generating 12 Flux 2 Pro images");
              const imageTaskIds: string[] = [];
              // Restore task IDs from previous attempt if available
              const savedTaskIds: string[] = (pipelineCache.phase1 as { task_ids?: string[] })?.task_ids ?? [];
              if (savedTaskIds.length > 0) {
                imageTaskIds.push(...savedTaskIds);
                console.log(`[gen_video] Phase 1 resumed: ${savedTaskIds.length} saved task IDs`);
              } else {
                // Create 12 new tasks (3 batches of 4)
                for (let b = 0; b < 3; b++) {
                  const batchResults = await Promise.allSettled(
                    Array.from({ length: 4 }, () =>
                      kiePost("/jobs/createTask", {
                        model: "flux-2/pro-text-to-image",
                        input: { prompt: String(prompt), aspect_ratio, resolution: "1K" },
                      })
                    )
                  );
                  for (const r of batchResults) {
                    if (r.status === "fulfilled") {
                      const tid = r.value?.data?.taskId ?? r.value?.taskId ?? null;
                      if (tid) imageTaskIds.push(String(tid));
                    }
                  }
                }
                // Save task IDs before polling — crash during poll → resume polls same tasks
                await savePhaseData(1, `${imageTaskIds.length} tasks created, polling...`, {
                  phase1: { task_ids: imageTaskIds, image_urls: imageUrls },
                });
              }
              // Poll concurrently, save after EACH completion
              await Promise.allSettled(
                imageTaskIds.map(async (tid) => {
                  const result = await kieWaitForTask(tid, 300_000);
                  if (result.image_url && result.status === "completed") {
                    imageUrls.push(result.image_url);
                    await savePhaseData(1, `${imageUrls.length}/${imageTaskIds.length} images`, {
                      phase1: { task_ids: imageTaskIds, image_urls: [...imageUrls] },
                    });
                  }
                })
              );
              console.log(`[gen_video] Phase 1 done: ${imageUrls.length}/12 images`);
              if (imageUrls.length === 0) throw new Error("Phase 1 failed: no images generated");
              await savePhaseData(1, `${imageUrls.length} images ready`, { phase1: { task_ids: imageTaskIds, image_urls: imageUrls } });
            } else {
              console.log(`[gen_video] Phase 1 resumed: ${imageUrls.length} images from cache`);
            }

            // ── PHASE 2: Claude Sonnet scores → top 6 (score ≥0.8) ─────────
            if (selectedImages.length < 6) {
              await savePhaseData(2, `scoring ${imageUrls.length} images for continuity (threshold ≥0.8)`);
              selectedImages = imageUrls.slice(0, 6); // fallback

              if (ANTHROPIC_API_KEY && imageUrls.length > 1) {
                try {
                  type CItem = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
                  const content: CItem[] = imageUrls.slice(0, 12).flatMap((url, i) => ([
                    { type: "image" as const, source: { type: "url" as const, url } },
                    { type: "text" as const, text: `[Image ${i + 1}] ${url}` },
                  ]));
                  content.push({
                    type: "text" as const,
                    text: `You are a professional video director selecting 6 frames for a cinematic brand video sequence.

PRIORITY #1 — CONTINUITY & CONSISTENCY (non-negotiable):
• All 6 selected images MUST share the same visual world: matching color palette, lighting direction, mood, and aesthetic style
• They must work as a coherent visual sequence — no jarring jumps between cuts
• MINIMUM SCORE THRESHOLD: only select images scoring ≥0.8

Scoring per image (0.0–1.0):
1. Visual continuity fit (30%) — matches the group's color palette, lighting, mood
2. Sequence logic (25%) — works as a sequential frame in a video story
3. Lighting & color consistency (20%) — same light direction and quality as group
4. Technical quality (15%) — sharp, clean, no artifacts
5. Motion-readiness (10%) — suitable for 5s video clip generation

Select exactly TOP 6 images with score ≥0.8, prioritizing the most visually coherent group. If fewer than 6 qualify at ≥0.8, include the next highest-scoring images to reach 6.
Return ONLY valid JSON: {"selected":["url1","url2","url3","url4","url5","url6"],"scores":{"url1":0.92,...},"continuity_note":"one line on what visual element ties them together"}`,
                  });

                  const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content }] }),
                  });
                  if (claudeResp.ok) {
                    const cd = await claudeResp.json();
                    const match = (cd.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
                    if (match) {
                      const parsed = JSON.parse(match[0]);
                      const scores: Record<string, number> = parsed.scores ?? {};
                      const rawSelected: string[] = Array.isArray(parsed.selected) ? parsed.selected : [];
                      // Prefer score ≥ 0.8, pad with highest-scored remaining if needed
                      const qualified = rawSelected.filter(u => (scores[u] ?? 0) >= 0.8);
                      if (qualified.length >= 6) {
                        selectedImages = qualified.slice(0, 6);
                      } else {
                        const qualSet = new Set(qualified);
                        const remaining = imageUrls
                          .filter(u => !qualSet.has(u))
                          .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
                        selectedImages = [...qualified, ...remaining].slice(0, 6);
                      }
                    }
                  }
                } catch (e) {
                  console.warn("[gen_video] Phase 2 Claude failed, using top 6:", (e as Error).message);
                  selectedImages = imageUrls.slice(0, 6);
                }
              }
              console.log(`[gen_video] Phase 2 done: ${selectedImages.length} images selected`);
              await savePhaseData(2, `${selectedImages.length} images selected`, { phase2: { selected_images: selectedImages } });
            } else {
              console.log(`[gen_video] Phase 2 resumed: ${selectedImages.length} images from cache`);
            }
          }

          // ── PHASE 3: KIE Runway 4.5 → 6 × 5s clips ──────────────────────
          let clipUrls: string[] = ((pipelineCache.phase3 as { clip_urls?: string[] })?.clip_urls) ?? [];

          if (clipUrls.length < selectedImages.length) {
            await savePhaseData(3, `generating ${selectedImages.length} × 5s clips via Runway 4.5`);
            const sceneLabels = [
              "opening establishing shot — introduce the scene",
              "build-up — develop the visual story",
              "mid-sequence — continuation with forward momentum",
              "peak moment — visual climax of the story",
              "resolution — wind down, emotional payoff",
              "closing outro — final impression, brand statement",
            ];
            const clipTaskIds: string[] = [];
            // Restore Runway task IDs from previous attempt if saved
            const savedClipTaskIds: string[] = (pipelineCache.phase3 as { task_ids?: string[] })?.task_ids ?? [];
            if (savedClipTaskIds.length > 0) {
              clipTaskIds.push(...savedClipTaskIds);
              console.log(`[gen_video] Phase 3 resumed: ${savedClipTaskIds.length} saved Runway task IDs`);
            } else {
              for (let i = 0; i < selectedImages.length; i++) {
                const sceneLabel = sceneLabels[i] ?? `scene ${i + 1} of ${selectedImages.length}`;
                const seqPrompt = `${String(prompt)} — Scene ${i + 1}/${selectedImages.length}: ${sceneLabel}. Maintain exact visual continuity: same color grade, lighting direction, and atmosphere. Smooth cinematic motion, professional brand video quality.`;
                try {
                  const r = await kieRunwayImageToVideo(selectedImages[i], seqPrompt, aspect_ratio);
                  clipTaskIds.push(r.task_id);
                } catch (e) {
                  console.warn(`[gen_video] Phase 3 clip ${i + 1} task failed:`, (e as Error).message);
                }
              }
              // Save task IDs before polling — crash during poll → resume polls same tasks
              await savePhaseData(3, `${clipTaskIds.length} Runway tasks created, polling...`, {
                phase3: { task_ids: clipTaskIds, clip_urls: clipUrls },
              });
            }
            // Poll concurrently, save after EACH clip completion
            await Promise.allSettled(
              clipTaskIds.map(async (tid) => {
                const result = await kieWaitForTask(tid, 240_000);
                if (result.video_url && result.status === "completed") {
                  clipUrls.push(result.video_url);
                  await savePhaseData(3, `${clipUrls.length}/${clipTaskIds.length} clips`, {
                    phase3: { task_ids: clipTaskIds, clip_urls: [...clipUrls] },
                  });
                }
              })
            );
            console.log(`[gen_video] Phase 3 done: ${clipUrls.length}/${selectedImages.length} clips ready`);
            if (clipUrls.length === 0) throw new Error("Phase 3 failed: no clips generated");
            await savePhaseData(3, `${clipUrls.length} clips ready`, { phase3: { task_ids: clipTaskIds, clip_urls: clipUrls } });
          } else {
            console.log(`[gen_video] Phase 3 resumed: ${clipUrls.length} clips from cache`);
          }

          // ── PHASE 4: Per-clip FFmpeg smart loop → each 5s → 8-10s ────────
          let extendedClipUrls: string[] = ((pipelineCache.phase4 as { extended_clip_urls?: string[] })?.extended_clip_urls) ?? [];
          const MODAL_FFMPEG = Deno.env.get("MODAL_FFMPEG_URL") ?? "";

          if (extendedClipUrls.length < clipUrls.length) {
            const startIdx = extendedClipUrls.length;
            await savePhaseData(4, `extending clips ${startIdx + 1}–${clipUrls.length} to 8-10s each`);

            for (let i = startIdx; i < clipUrls.length; i++) {
              let extendedUrl: string = clipUrls[i]; // fallback to original
              if (MODAL_FFMPEG) {
                try {
                  const loopRes = await fetch(MODAL_FFMPEG, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      clip_urls: [clipUrls[i]],
                      target_duration: 9,
                      aspect_ratio,
                      smart_loop: true,
                      mode: "loop",
                    }),
                    signal: AbortSignal.timeout(90_000),
                  });
                  if (loopRes.ok) {
                    const d = await loopRes.json();
                    extendedUrl = d.video_url ?? d.output_url ?? extendedUrl;
                    console.log(`[gen_video] Phase 4 clip ${i + 1}/${clipUrls.length} → ${extendedUrl}`);
                  } else {
                    console.error(`[gen_video] Phase 4 clip ${i + 1} FFmpeg error: ${loopRes.status} — using original`);
                  }
                } catch (e) {
                  console.error(`[gen_video] Phase 4 clip ${i + 1} failed:`, (e as Error).message, "— using original");
                }
              }
              extendedClipUrls.push(extendedUrl);
              // Save after EVERY clip — crash at clip N resumes from clip N+1
              await savePhaseData(4, `clip ${i + 1}/${clipUrls.length} extended`, {
                phase4: { extended_clip_urls: [...extendedClipUrls] },
              });
            }
            console.log(`[gen_video] Phase 4 done: ${extendedClipUrls.length} clips extended to 8-10s`);
          } else {
            console.log(`[gen_video] Phase 4 resumed: ${extendedClipUrls.length} extended clips from cache`);
          }

          // ── PHASE 5: Stitch all extended clips → final 45-60s ────────────
          let finalVideoUrl: string | null = ((pipelineCache.phase5 as { video_url?: string })?.video_url) ?? null;

          if (!finalVideoUrl) {
            await savePhaseData(5, `stitching ${extendedClipUrls.length} clips → final 45-60s video`);
            let stitchedUrl: string | null = extendedClipUrls[0] ?? null;

            if (MODAL_FFMPEG && extendedClipUrls.length > 0) {
              try {
                const stitchRes = await fetch(MODAL_FFMPEG, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    clip_urls: extendedClipUrls,
                    aspect_ratio,
                    smart_loop: false,
                    transition: "crossfade",
                    mode: "stitch",
                  }),
                  signal: AbortSignal.timeout(120_000),
                });
                if (stitchRes.ok) {
                  const d = await stitchRes.json();
                  stitchedUrl = d.video_url ?? d.output_url ?? stitchedUrl;
                  console.log(`[gen_video] Phase 5 done: ${stitchedUrl}`);
                } else {
                  console.error("[gen_video] Phase 5 FFmpeg stitch error:", stitchRes.status);
                }
              } catch (e) {
                console.error("[gen_video] Phase 5 stitch failed:", (e as Error).message);
              }
            }
            finalVideoUrl = stitchedUrl;
            if (finalVideoUrl) {
              await savePhaseData(5, "stitch complete", { phase5: { video_url: finalVideoUrl } });
            }
          } else {
            console.log(`[gen_video] Phase 5 resumed: final video from cache`);
          }

          // Upload final video to R2 CDN
          if (finalVideoUrl) {
            const r2Key = `videos/${brand_id}/${dbId ?? Date.now()}.mp4`;
            const r2Url = await proxyToR2(finalVideoUrl, r2Key, "video/mp4");
            if (r2Url) finalVideoUrl = r2Url;
          }

          // Final DB update
          if (dbId) {
            await supabase.from("gv_video_generations").update({
              video_status: finalVideoUrl ? "completed" : "failed",
              status: finalVideoUrl ? "completed" : "failed",
              video_url: finalVideoUrl,
              pipeline_step: 5,
              pipeline_data: { ...pipelineCache },
            }).eq("id", dbId);
          }

          // WA callback
          if (waCallback && waToken) {
            if (finalVideoUrl) {
              const n = extendedClipUrls.length;
              const estDur = `${n * 8}–${n * 10}s`;
              await sendWACallback(waCallback, waToken, `🎬 *Video berhasil di-generate!* (${estDur}, ${n} scenes)\n\n🎥 ${finalVideoUrl}`);
            } else {
              await sendWACallback(waCallback, waToken, `❌ Gagal generate video — pipeline error.\n\nResume dengan generation_id: ${dbId}`);
            }
          }
        } catch (e) {
          console.error("[gen_video] pipeline error:", (e as Error).message);
          if (dbId) {
            await supabase.from("gv_video_generations").update({
              video_status: "failed",
              status: "failed",
              pipeline_data: { ...pipelineCache, last_error: (e as Error).message },
            }).eq("id", dbId);
          }
          if (waCallback && waToken) {
            await sendWACallback(waCallback, waToken, `❌ Gagal generate video — ${(e as Error).message}\n\nResume dengan generation_id: ${dbId}`);
          }
        }
      })();

      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(bgTask); } else { await bgTask; }

      return json({ ok: true, success: true, status: "background", db_id: dbId, resumable: true });
    }

    // ── LIST HEYGEN AVATARS ───────────────────────────────────────────────────
    if (action === "list_avatars") {
      if (!HEYGEN_API_KEY) return json({ error: "HEYGEN_API_KEY not configured" }, 503);
      const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
        headers: { "x-api-key": HEYGEN_API_KEY },
      });
      if (!res.ok) throw new Error(`HeyGen list_avatars error ${res.status}`);
      const d = await res.json();
      return json({ success: true, avatars: d.data?.avatars ?? d.avatars ?? d.data ?? [] });
    }

    // ── LIST HEYGEN VOICES ────────────────────────────────────────────────────
    if (action === "list_voices") {
      if (!HEYGEN_API_KEY) return json({ error: "HEYGEN_API_KEY not configured" }, 503);
      const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
        headers: { "x-api-key": HEYGEN_API_KEY },
      });
      if (!res.ok) throw new Error(`HeyGen list_voices error ${res.status}`);
      const d = await res.json();
      return json({ success: true, voices: d.data?.voices ?? d.voices ?? d.data ?? [] });
    }

    // ── GENERATE AVATAR VIDEO (HeyGen — 1/week, max 60s, no retry) ───────────
    if (action === "generate_avatar_video") {
      const {
        prompt,
        avatar_id = "default",
        voice_id = "default",
      } = data;
      if (!prompt) return json({ error: "prompt is required" }, 400);
      if (!HEYGEN_API_KEY) return json({ error: "HEYGEN_API_KEY not configured" }, 503);

      // ── Weekly quota check (1 video/week, no retry — counts all attempts) ──
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: weeklyCount } = await supabase.from("gv_video_generations")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand_id)
        .eq("ai_model", "heygen-avatar")
        .gte("created_at", weekAgo);

      if ((weeklyCount ?? 0) >= 1) {
        return json({
          success: false,
          error: "Weekly HeyGen avatar video limit reached (1 video/week)",
          code: "WEEKLY_QUOTA_EXCEEDED",
          weekly_used: weeklyCount,
          weekly_limit: 1,
        }, 429);
      }

      // ── Cap prompt at 700 chars ≈ 60 seconds of speech ───────────────────
      const cappedPrompt = String(prompt).slice(0, 700);

      // ── Insert to DB FIRST (no-retry: quota consumed even if HeyGen fails) ─
      const { data: inserted, error: insertErr } = await supabase.from("gv_video_generations").insert({
        brand_id,
        target_platform: "youtube",
        hook: cappedPrompt,
        ai_model: "heygen-avatar",
        status: "processing",
        generation_mode: "heygen",
        runway_task_id: null,
        video_url: null,
        video_thumbnail_url: null,
        video_aspect_ratio: "16:9",
        video_status: "processing",
      }).select("id").single();
      if (insertErr) console.error("generate_avatar_video DB insert failed:", insertErr.message);

      // ── Call HeyGen API ───────────────────────────────────────────────────
      let heygenVideoId: string | null = null;
      try {
        const heyRes = await heygenGenerateAvatar(cappedPrompt, String(avatar_id), String(voice_id));
        heygenVideoId = heyRes.video_id;
        // Update DB with task ID
        if (inserted?.id) {
          await supabase.from("gv_video_generations")
            .update({ runway_task_id: heygenVideoId })
            .eq("id", inserted.id);
        }
      } catch (heyErr) {
        // Still return success=false but quota is already consumed
        const errMsg = heyErr instanceof Error ? heyErr.message : "HeyGen API failed";
        if (inserted?.id) {
          await supabase.from("gv_video_generations")
            .update({ video_status: "failed", status: "failed" })
            .eq("id", inserted.id);
        }
        return json({ success: false, error: errMsg, code: "HEYGEN_FAILED", db_id: inserted?.id ?? null }, 500);
      }

      return json({ success: true, task_id: heygenVideoId, status: "processing", db_id: inserted?.id ?? null });
    }

    // ── CHECK TASK STATUS ────────────────────────────────────────────────────
    if (action === "check_task") {
      const { task_id, db_id, task_type, generation_mode = "kie" } = data;
      if (!task_id) return json({ error: "task_id is required" }, 400);

      let status = "processing";
      let image_url: string | null = null;
      let video_url: string | null = null;
      let thumbnail_url: string | null = null;

      if (generation_mode === "heygen") {
        const pollRes = await heygenPoll(String(task_id));
        status = pollRes.status;
        video_url = pollRes.video_url;
        thumbnail_url = pollRes.thumbnail_url;
        if (status === "completed") status = "completed";
      } else {
        const kieRes = await kieGet(`/jobs/recordInfo?taskId=${task_id}`);
        const kState = kieRes.data?.state ?? kieRes.status ?? "processing";
        status = (kState === "DONE" || kState === "success" || kState === "completed") ? "completed" : kState === "failed" ? "failed" : "processing";
        const resultJson = kieRes.data?.resultJson ? JSON.parse(kieRes.data.resultJson) : null;
        const resultUrls: string[] = resultJson?.resultUrls ?? [];
        image_url = resultUrls[0] ?? kieRes.data?.image_url ?? null;
        video_url = kieRes.data?.video_url ?? null;
        thumbnail_url = kieRes.thumbnail_url ?? null;
      }

      if (db_id && ["completed", "succeeded", "success"].includes(status)) {
        if (task_type === "image") {
          await supabase.from("gv_image_generations").update({
            status: "completed",
            image_url,
            thumbnail_url,
          }).eq("id", db_id);
        } else if (task_type === "video") {
          // Proxy completed video to R2 CDN
          let finalVideoUrl = video_url;
          if (video_url) {
            const r2VideoKey = `videos/${brand_id}/${db_id}.mp4`;
            const r2Url = await proxyToR2(video_url, r2VideoKey, "video/mp4");
            if (r2Url) { finalVideoUrl = r2Url; console.log(`[check_task video] R2: ${r2Url}`); }
          }
          await supabase.from("gv_video_generations").update({
            video_status: "completed",
            video_url: finalVideoUrl,
            video_thumbnail_url: thumbnail_url,
          }).eq("id", db_id);
          video_url = finalVideoUrl;
        }
      }

      // Proxy completed image to R2 if not yet done
      if (task_type === "image" && image_url && db_id) {
        const ext = image_url.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const r2ImageKey = `images/${brand_id}/${db_id}.${ext}`;
        const r2Url = await proxyToR2(image_url, r2ImageKey, mime);
        if (r2Url) {
          image_url = r2Url;
          await supabase.from("gv_image_generations").update({ image_url: r2Url }).eq("id", db_id);
          console.log(`[check_task image] R2: ${r2Url}`);
        }
      }

      return json({ ok: true, success: true, status, image_url, video_url, url: image_url || video_url });
    }

    // ── TRAIN PRODUCT / CHARACTER ────────────────────────────────────────────
    if (action === "train_product" || action === "train_character") {
      const { name, trigger_word, image_urls, steps = 1000 } = data;
      const training_type = action === "train_character" ? "character" : "product";
      if (!name || !image_urls?.length) return json({ error: "name and image_urls are required" }, 400);

      const tw = trigger_word ?? name.toLowerCase().replace(/\s+/g, "_");

      const kieRes = await kiePost("/training/create", {
        name, trigger_word: tw, image_urls, training_type, steps,
        base_model: "flux-2-pro", // Optimized Flux-2 Pro base for highest quality LoRA
      });

      await supabase.from("gv_lora_datasets").insert({
        brand_id,
        dataset_name: name,
        theme: training_type,
        image_count: image_urls.length,
        training_status: "training",
        storage_path: `kie://${kieRes.training_id ?? kieRes.id}`,
        metadata: { trigger_word: tw, kie_training_id: kieRes.training_id ?? kieRes.id, steps },
      });

      return json({
        success: true,
        training_id: kieRes.training_id ?? kieRes.id ?? null,
        status: kieRes.status ?? "training",
        trigger_word: tw,
        raw: kieRes,
      });
    }

    // ── CHECK TRAINING STATUS ────────────────────────────────────────────────
    if (action === "check_training") {
      const { training_id } = data;
      if (!training_id) return json({ error: "training_id is required" }, 400);

      const kieRes = await kieGet(`/training/${training_id}`);
      const status = kieRes.status ?? "training";

      if (["completed", "succeeded", "success"].includes(status)) {
        await supabase.from("gv_lora_datasets").update({
          training_status: "completed",
          model_path: kieRes.model_url ?? kieRes.model_path ?? null,
        }).contains("metadata", { kie_training_id: training_id });
      }

      return json({
        success: true, status,
        model_url: kieRes.model_url ?? null,
        progress: kieRes.progress ?? null,
        raw: kieRes,
      });
    }

    // ── GET HISTORY ──────────────────────────────────────────────────────────
    if (action === "get_history") {
      const limit = Number(data.limit ?? 20);
      const type = data.type ?? "all";
      const results: Record<string, unknown> = {};

      if (type === "all" || type === "image") {
        const { data: imgs } = await supabase
          .from("gv_image_generations")
          .select("id, prompt_text, image_url, thumbnail_url, status, ai_model, target_platform, style_preset, created_at, feedback")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        results.images = imgs ?? [];
      }

      if (type === "all" || type === "video") {
        const { data: vids } = await supabase
          .from("gv_video_generations")
          .select("id, hook, video_url, video_thumbnail_url, video_status, ai_model, target_platform, video_aspect_ratio, created_at, feedback")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        results.videos = vids ?? [];
      }

      if (type === "all" || type === "training") {
        const { data: trainings } = await supabase
          .from("gv_lora_datasets")
          .select("id, dataset_name, theme, image_count, training_status, model_path, metadata, created_at")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        results.trainings = trainings ?? [];
      }

      return json({ success: true, ...results });
    }

    // ── SUBMIT FEEDBACK (RLHF — trains smart prompt AI) ─────────────────────
    if (action === "submit_feedback") {
      const { db_id, content_type, feedback } = data;
      if (!db_id || !content_type || !feedback) {
        return json({ error: "db_id, content_type, and feedback are required" }, 400);
      }
      if (!["liked", "disliked"].includes(feedback)) {
        return json({ error: "feedback must be liked or disliked" }, 400);
      }

      let dbError: string | null = null;
      if (content_type === "image") {
        const { error } = await supabase.from("gv_image_generations")
          .update({ feedback })
          .eq("id", db_id)
          .eq("brand_id", brand_id);
        if (error) dbError = error.message;
      } else if (content_type === "video") {
        const { error } = await supabase.from("gv_video_generations")
          .update({ feedback })
          .eq("id", db_id)
          .eq("brand_id", brand_id);
        if (error) dbError = error.message;
      } else {
        return json({ error: "content_type must be image or video" }, 400);
      }

      if (dbError) return json({ error: `Failed to save feedback: ${dbError}` }, 500);
      return json({ success: true, feedback, db_id });
    }

    // ── GENERATE ARTICLE (background task — 400s wall clock) ─────────────────
    if (action === "generate_article" || action === "update_article") {
      if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
      const waCallback = String(data.wa_callback ?? "");
      const waToken    = String(data.wa_token ?? "");

      // Accept 'topic' (UI) or 'prompt' (WA bot) interchangeably
      const topic = String(data.topic || data.prompt || "");
      const objective = String(data.objective || "random");
      const length = String(data.length || "medium");
      const description = data.description as string | undefined;
      const requested_by = data.requested_by as string | undefined;
      const uploadedImgUrls = ((data.uploaded_images || data.image_urls) as string[] | undefined) ?? [];
      const image_count = Number(data.image_count ?? 0);
      const image_size = String(data.image_size ?? "1:1");
      const include_script = Boolean(data.include_script);
      const include_hashtags = Boolean(data.include_hashtags);
      const include_music = Boolean(data.include_music);

      // Fetch brand profile + brands for context
      const [{ data: bp }, { data: brand }] = await Promise.all([
        supabase.from("brand_profiles").select("brand_name, country, brand_dna, source_of_truth").eq("id", brand_id).maybeSingle(),
        supabase.from("brands").select("name, category").eq("id", brand_id).maybeSingle(),
      ]);

      const brandName = bp?.brand_name ?? brand?.name ?? "Brand";
      const country = bp?.country ?? "Indonesia";
      const dna = (bp?.brand_dna ?? {}) as Record<string, unknown>;
      const sot = (bp?.source_of_truth ?? {}) as Record<string, unknown>;
      const kwi = sot.keyword_intelligence as Record<string, unknown> | null;
      const rankingKws = (kwi?.ranking_keywords as string[] ?? []).slice(0, 5).join(", ");

      const objectiveLabels: Record<string, string> = {
        faq: "FAQ format", trend: "Trend article", educational: "Educational",
        tips: "Tips & Tricks", tips_tricks: "Tips & Tricks", new_product: "Product launch",
        seasonal_greetings: "Seasonal Greetings", newsletter: "Newsletter",
        updates: "Brand updates", multi_product: "Multi Product Catalog",
        ads: "Ads copy", tutorial: "Tutorial", review: "Review & Testimonial",
        random: "AI-recommended content",
      };
      const objLabel = objectiveLabels[objective] ?? "konten brand relevan";

      const wordCounts: Record<string, number> = { short: 80, medium: 800, long: 1500, very_long: 3000 };
      const targetWords = wordCounts[length] ?? 800;
      const isShort = length === 'short';
      const enrichedTopic = topic ? `${topic}` : `${objLabel} untuk ${brandName}`;

      const extraJsonFields = [
        include_hashtags ? `  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],` : "",
        include_script   ? `  "script": "Full narration script for video/reel (60-90 seconds)",` : "",
        include_music    ? `  "music_suggestion": "Recommended background music style",` : "",
        image_count > 0  ? `  "image_prompts": [${Array.from({length: image_count}, (_, i) => `"Image prompt ${i+1} (${image_size})"`).join(",")}],` : "",
      ].filter(Boolean).join("\n");

      const systemMsg = `You are an expert content writer and SEO specialist for ${brandName}, a ${brand?.category ?? "brand"} in ${country}. Write high-quality, engaging content in Indonesian (Bahasa Indonesia). Always respond with valid JSON.`;

      const userMsg = `Write a ${isShort ? 'short social media post (max 500 characters total, suitable for X/Twitter and LinkedIn)' : `${targetWords}-word article`}:

Brand: ${brandName}
Positioning: ${String(dna.positioning ?? "premium brand")}
USP: ${String(dna.usp ?? "")}
Keywords: ${rankingKws || "brand-related keywords"}
Topic: ${enrichedTopic}
Format: ${objLabel}
${description ? `Brief: ${description}` : ""}
${uploadedImgUrls.length > 0 ? `Reference images: ${uploadedImgUrls.length} provided` : ""}
${include_script ? "Include: narration script" : ""}
${include_hashtags ? "Include: 10 hashtags" : ""}

Return ONLY valid JSON:
{
  "article": "${isShort ? 'short post text (max 500 chars, plain text or minimal HTML, no headings)' : `full article HTML (~${targetWords} words, use <h2><h3><p><ul><li> tags)`}",
  "meta_title": "SEO title (50-60 chars)",
  "meta_description": "SEO description (150-160 chars)",
  "focus_keywords": ["keyword1", "keyword2", "keyword3"],
  "social": {
    "instagram": "Instagram caption max 150 chars + 5 hashtags",
    "linkedin": "LinkedIn post professional max 200 chars",
    "tiktok": "TikTok hook punchy max 100 chars"
  },
  "geo": {
    "faq": [
      {"question": "Q1?", "answer": "A1."},
      {"question": "Q2?", "answer": "A2."},
      {"question": "Q3?", "answer": "A3."}
    ]
  }${extraJsonFields ? `,\n${extraJsonFields}` : ""}
}`;

      type ClaudeContent = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
      const userContent: ClaudeContent[] = [];
      for (const imgUrl of uploadedImgUrls.slice(0, 8)) {
        userContent.push({ type: "image", source: { type: "url", url: String(imgUrl) } });
      }
      userContent.push({ type: "text", text: userMsg });

      // Insert placeholder immediately — respond before Claude starts
      const { data: placeholder } = await supabase.from("gv_article_generations").insert({
        brand_id, topic: enrichedTopic, objective, length,
        description: description || null, requested_by: requested_by || null, status: "processing",
        image_count, image_size, include_script, include_hashtags, include_music,
        uploaded_images: uploadedImgUrls.length > 0 ? uploadedImgUrls : null,
      }).select("id").single();
      const articlePlaceholderId: string | null = placeholder?.id ?? null;

      // Background: Claude → parse → DB update → R2 → WA callback (400s wall clock)
      const bgTask = (async () => {
        try {
          const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 8192,
              system: systemMsg,
              messages: [{ role: "user", content: uploadedImgUrls.length > 0 ? userContent : userMsg }],
            }),
          });

          if (!claudeResp.ok) {
            console.error(`[generate_article] Claude error ${claudeResp.status}`);
            if (articlePlaceholderId) await supabase.from("gv_article_generations").update({ status: "failed" }).eq("id", articlePlaceholderId);
            if (waCallback && waToken) await sendWACallback(waCallback, waToken, `❌ Gagal generate artikel — Claude API error (${claudeResp.status})`);
            return;
          }

          const claudeData = await claudeResp.json();
          const rawText = (claudeData.content?.[0]?.text ?? "").trim();
          let articleData: Record<string, unknown> = {};
          try { const match = rawText.match(/\{[\s\S]*\}/); if (match) articleData = JSON.parse(match[0]); }
          catch { articleData = { article: rawText }; }

          const articleContent = String(articleData.article ?? "");
          const isVeryLong = length === "very_long";
          const brandSlug = (brand?.name ?? brandName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const DASHBOARD_URL = Deno.env.get("DASHBOARD_URL") || `https://${brandSlug}.geovera.xyz`;

          // Update placeholder with full content
          const articleWordCount = articleContent.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
          const { data: stored } = await supabase.from("gv_article_generations").update({
            status: "done",
            content: isVeryLong ? null : articleContent,
            content_very_long: isVeryLong ? articleContent : null,
            word_count: articleWordCount,
            meta_title: String(articleData.meta_title ?? ""),
            meta_description: String(articleData.meta_description ?? ""),
            focus_keywords: (articleData.focus_keywords as string[]) ?? [],
            social: (articleData.social as Record<string, unknown>) ?? {},
            geo: (articleData.geo as Record<string, unknown>) ?? {},
            hashtag_list: include_hashtags ? ((articleData.hashtags as string[]) ?? []) : null,
            script_content: include_script ? String(articleData.script ?? "") : null,
            music_suggestion: include_music ? String(articleData.music_suggestion ?? "") : null,
          }).eq("id", articlePlaceholderId ?? "").select("id").single();

          const articleId = stored?.id ?? articlePlaceholderId ?? `temp-${Date.now()}`;

          // HMAC access token
          async function genAccessToken(bId: string, aId: string): Promise<string> {
            const secret = Deno.env.get("CONTENT_URL_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "dev";
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
            const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${bId}:${aId}`));
            return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "").slice(0, 16);
          }
          const accessToken = await genAccessToken(brand_id, articleId);
          let article_url = `${DASHBOARD_URL}/articles/${articleId}?t=${accessToken}`;

          // R2 CDN upload
          const R2_ACCOUNT_ID        = Deno.env.get("R2_ACCOUNT_ID") || Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
          const R2_ACCESS_KEY_ID     = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
          const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
          const R2_BUCKET_NAME       = Deno.env.get("R2_BUCKET_NAME") || Deno.env.get("R2_BUCKET") || "";
          const R2_PUBLIC_URL        = Deno.env.get("R2_PUBLIC_URL") ?? "";

          if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL) {
            try {
              const r2Key = `articles/${brand_id}/${articleId}.html`;
              const title = String(articleData.meta_title ?? enrichedTopic).replace(/</g, "&lt;");
              const desc = String(articleData.meta_description ?? "").replace(/"/g, "&quot;");
              const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e14;color:#e2e8f0;min-height:100vh;padding:24px 16px 48px}
article{max-width:720px;margin:0 auto}
h1{font-size:clamp(22px,5vw,36px);font-weight:800;line-height:1.2;margin-bottom:16px;color:#f0f4f8}
h2{font-size:clamp(17px,4vw,24px);font-weight:700;margin:32px 0 12px;color:#cbd5e0}
h3{font-size:clamp(15px,3vw,20px);font-weight:600;margin:24px 0 10px;color:#a0aec0}
p{font-size:15px;line-height:1.75;color:#94a3b8;margin-bottom:16px}
ul,ol{padding-left:20px;margin-bottom:16px}
li{font-size:15px;line-height:1.7;color:#94a3b8;margin-bottom:6px}
strong{color:#e2e8f0}
a{color:#60a5fa;text-decoration:none}
.brand{display:flex;align-items:center;gap:6px;margin-bottom:28px;font-size:12px;color:#4a5568;text-transform:uppercase;letter-spacing:0.08em}
</style>
</head>
<body>
<article>
<div class="brand">GeoVera · AI Content</div>
<h1>${title}</h1>
${articleContent}
</article>
</body>
</html>`;
              await uploadToR2(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, r2Key, htmlContent, "text/html; charset=utf-8");
              // Use CDN URL as primary article_url (publicly accessible via R2 + CDN)
              const r2CdnUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/articles/${brand_id}/${articleId}.html`;
              article_url = r2CdnUrl;
              await supabase.from("gv_article_generations").update({ article_url: r2CdnUrl, r2_key: r2Key }).eq("id", articleId);
              console.log(`[generate_article] R2 CDN ✓ ${r2CdnUrl}`);
            } catch (r2Err) {
              console.error("[generate_article] R2 upload failed:", r2Err);
              await supabase.from("gv_article_generations").update({ article_url }).eq("id", articleId);
            }
          } else {
            await supabase.from("gv_article_generations").update({ article_url }).eq("id", articleId);
          }

          console.log(`[generate_article] Done: ${articleId} → ${article_url}`);

          // Send WA callback with CDN article URL + key stats
          if (waCallback && waToken) {
            const wordCount = articleContent.replace(/<[^>]+>/g, "").trim().split(/\s+/).length;
            const metaTitle = String(articleData.meta_title ?? enrichedTopic).slice(0, 80);
            const waMsg = `📝 *Artikel berhasil di-generate!*\n\n*${metaTitle}*\n\n📊 ~${wordCount} kata | ${length.toUpperCase()}\n\n🔗 ${article_url}`;
            await sendWACallback(waCallback, waToken, waMsg);
          }
        } catch (bgErr) {
          console.error("[generate_article] bg error:", bgErr);
          if (articlePlaceholderId) await supabase.from("gv_article_generations").update({ status: "failed" }).eq("id", articlePlaceholderId);
          if (waCallback && waToken) await sendWACallback(waCallback, waToken, `❌ Gagal generate artikel — error internal`);
        }
      })();

      // EdgeRuntime.waitUntil → 400s wall clock (Supabase Pro)
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(bgTask); } else { await bgTask; }

      return json({ ok: true, success: true, status: "background", db_id: articlePlaceholderId });
    }

    return json({ error: "Invalid action" }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("content-studio-handler error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
