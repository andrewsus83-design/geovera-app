import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KIE_API_KEY = Deno.env.get("KIE_API_KEY") ?? "";
const KIE_BASE = "https://api.kie.ai/v1";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY") ?? "";
const HEYGEN_BASE = "https://api.heygen.com";

// ── Runway Gen 4 Turbo (video generation) ────────────────────────────────────
const RUNWAY_API_SECRET = Deno.env.get("RUNWAY_API_SECRET") ?? "";
const RUNWAY_BASE = "https://api.runwayml.com";

// ── fal.ai / Modal (Flux Schnell batch image generation) ─────────────────────
const FAL_API_KEY = Deno.env.get("FAL_API_KEY") ?? "";
const MODAL_FLUX_URL = Deno.env.get("MODAL_FLUX_SCHNELL_URL") ?? ""; // Custom Modal endpoint (optional)

// ── Modal FFmpeg stitch endpoint (optional — concat scene clips into final video) ─
const MODAL_FFMPEG_URL = Deno.env.get("MODAL_FFMPEG_URL") ?? "";

// ── Cloudflare R2 (image + video permanent storage) ──────────────────────────
const R2_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "geovera-media";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? ""; // e.g. https://pub-xxx.r2.dev or custom domain

// Cloudflare Workers AI (Llama) — for training prompt engineering
const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "";
const CF_AI_GATEWAY_BASE = Deno.env.get("CF_AI_GATEWAY_BASE") ?? "";
const CF_WORKERS_AI = Deno.env.get("CF_AI_GATEWAY_WORKERS_AI")
  || (CF_AI_GATEWAY_BASE ? `${CF_AI_GATEWAY_BASE}/workers-ai` : "");
const LLAMA_FAST  = "@cf/meta/llama-3.1-8b-instruct";
const LLAMA_HEAVY = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// ── Cloudflare R2 upload (S3-compatible, AWS Sig V4, no external deps) ───────

async function _sha256hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function _hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

async function uploadToR2(path: string, body: Uint8Array, contentType: string): Promise<string | null> {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ACCOUNT_ID) return null;
  try {
    const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");          // YYYYMMDD
    const dtStr  = dateStr + "T" + now.toISOString().slice(11, 19).replace(/:/g, "") + "Z"; // YYYYMMDDTHHmmssZ
    const bodyHash = await _sha256hex(body);

    const canonHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${dtStr}\n`;
    const signedHdrs = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonical  = `PUT\n/${path}\n\n${canonHeaders}\n${signedHdrs}\n${bodyHash}`;
    const scope      = `${dateStr}/auto/s3/aws4_request`;
    const sts        = `AWS4-HMAC-SHA256\n${dtStr}\n${scope}\n${await _sha256hex(canonical)}`;

    const enc = new TextEncoder();
    const k0  = new Uint8Array([...enc.encode(`AWS4${R2_SECRET_ACCESS_KEY}`)]);
    const k1  = await _hmac(k0, dateStr);
    const k2  = await _hmac(k1, "auto");
    const k3  = await _hmac(k2, "s3");
    const k4  = await _hmac(k3, "aws4_request");
    const sig = (await _hmac(k4, sts)).reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");

    const auth = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;
    const res  = await fetch(`https://${host}/${path}`, {
      method: "PUT",
      headers: { "host": host, "content-type": contentType, "x-amz-content-sha256": bodyHash, "x-amz-date": dtStr, "authorization": auth },
      body,
    });
    if (!res.ok) { console.error(`R2 upload failed ${res.status}: ${await res.text()}`); return null; }

    return R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL.replace(/\/$/, "")}/${path}`
      : `https://${host}/${path}`;
  } catch (e) { console.error("R2 upload error:", e); return null; }
}

// Download source URL → upload to R2, fallback to source URL on error
async function fetchAndUploadToR2(sourceUrl: string, path: string, contentType: string): Promise<string> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return sourceUrl;
    const body = new Uint8Array(await res.arrayBuffer());
    return (await uploadToR2(path, body, contentType)) ?? sourceUrl;
  } catch { return sourceUrl; }
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

// ── Runway Gen 4 Turbo helpers ────────────────────────────────────────────────
function runwayHeaders() {
  return {
    "Authorization": `Bearer ${RUNWAY_API_SECRET}`,
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06",
  };
}

async function runwayCreateTask(params: {
  prompt: string; imageUrl?: string | null; duration: 5 | 10; ratio: string;
}): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = {
    model: "gen4_turbo",
    promptText: params.prompt,
    duration: params.duration,
    ratio: params.ratio,
  };
  if (params.imageUrl) body.promptImage = params.imageUrl;
  const path = params.imageUrl ? "/v1/image_to_video" : "/v1/text_to_video";
  const res = await fetch(`${RUNWAY_BASE}${path}`, {
    method: "POST", headers: runwayHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Runway API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function runwayPollTask(taskId: string): Promise<{ status: string; video_url: string | null }> {
  const res = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, { headers: runwayHeaders() });
  if (!res.ok) throw new Error(`Runway poll error ${res.status}`);
  const d = await res.json();
  const rawStatus = (d.status ?? "PENDING") as string;
  return {
    status: rawStatus === "SUCCEEDED" ? "completed" : rawStatus === "FAILED" ? "failed" : "processing",
    video_url: d.output?.[0] ?? null,
  };
}

// ── fal.ai Flux Schnell (batch image generation) ──────────────────────────────
const FAL_RATIO_MAP: Record<string, string> = {
  "1:1": "square_hd", "9:16": "portrait_16_9", "16:9": "landscape_16_9", "4:5": "portrait_4_3",
};

async function falFluxSchnell(prompt: string, aspectRatio: string, numImages: number): Promise<string[]> {
  const imageSize = FAL_RATIO_MAP[aspectRatio] ?? "square_hd";
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: imageSize, num_images: numImages, num_inference_steps: 4, enable_safety_checker: false }),
  });
  if (!res.ok) throw new Error(`fal.ai Flux error ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return (d.images ?? []).map((img: { url: string }) => img.url).filter(Boolean);
}

async function modalFluxGenerate(prompt: string, aspectRatio: string, numImages: number): Promise<string[]> {
  const res = await fetch(MODAL_FLUX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, num_images: numImages }),
  });
  if (!res.ok) throw new Error(`Modal Flux error ${res.status}: ${await res.text()}`);
  const d = await res.json();
  if (Array.isArray(d.images)) return d.images.map((img: { url?: string } | string) => typeof img === "string" ? img : (img.url ?? "")).filter(Boolean);
  if (Array.isArray(d.urls)) return d.urls;
  if (d.url) return [d.url];
  return [];
}

// ── 8-criteria weighted batch image scoring (no reasoning, one call per 20 imgs) ─
// sc=subject clarity×0.20 + mp=motion potential×0.15 + dl=depth layers×0.10
// cam=camera consistency×0.15 + lit=lighting consistency×0.15
// chr=character consistency×0.10 + scon=scene continuity×0.10 + vs=visual simplicity×0.05
async function claudeScoreAndPickN(imageUrls: string[], brief: string, n: number, anthropicKey: string): Promise<string[]> {
  if (imageUrls.length <= 1) return imageUrls;
  const pickN = Math.min(n, imageUrls.length);
  try {
    const batch = imageUrls.slice(0, 20);
    const content: Array<Record<string, unknown>> = [];
    batch.forEach((url, i) => {
      content.push({ type: "text", text: `IMG_${i}:` });
      content.push({ type: "image", source: { type: "url", url } });
    });
    content.push({
      type: "text",
      text: `Brief: "${brief}"\nScore each (1-10): sc×0.20+mp×0.15+dl×0.10+cam×0.15+lit×0.15+chr×0.10+scon×0.10+vs×0.05\nReturn ONLY: {"s":[{"i":0,"t":7.85},{"i":1,"t":6.20},...]}`,
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 256, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) return imageUrls.slice(0, pickN);
    const d = await res.json();
    const raw = d.content?.[0]?.text ?? "{}";
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return imageUrls.slice(0, pickN);
    const scores: Array<{ i: number; t: number }> = JSON.parse(match[0]).s ?? [];
    const scoreMap = new Map(scores.map(s => [s.i, s.t]));
    return imageUrls
      .map((url, i) => ({ url, score: scoreMap.get(i) ?? 5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, pickN)
      .map(x => x.url);
  } catch {
    return imageUrls.slice(0, pickN);
  }
}

function claudeScoreImages(imageUrls: string[], prompt: string, anthropicKey: string): Promise<string[]> {
  return claudeScoreAndPickN(imageUrls, prompt, Math.max(1, Math.ceil(imageUrls.length * 0.15)), anthropicKey);
}

// OpenAI Sora-2 — video generation for long durations (> 10s)
async function openAISoraGenerate(prompt: string, duration: number, aspectRatio: string): Promise<{ job_id: string; status: string }> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const sizeMap: Record<string, string> = { "9:16": "1080x1920", "16:9": "1920x1080", "1:1": "1080x1080" };
  const size = sizeMap[aspectRatio] ?? "1080x1920";
  const res = await fetch("https://api.openai.com/v1/video/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sora-2", prompt, n: 1, size, quality: "high", duration }),
  });
  if (!res.ok) throw new Error(`OpenAI Sora error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { job_id: data.id, status: data.status ?? "queued" };
}

async function openAISoraPoll(jobId: string): Promise<{ status: string; video_url: string | null }> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch(`https://api.openai.com/v1/video/generations/${jobId}`, {
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`OpenAI Sora poll error ${res.status}`);
  const data = await res.json();
  const video_url = data.generations?.[0]?.url ?? data.result?.url ?? null;
  return { status: data.status ?? "processing", video_url };
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

// ── Cinematic scene type ──────────────────────────────────────────────────────
interface CinematicScene {
  index: number;
  duration: number; // always 5s (Runway Gen 4 Turbo constraint)
  image_prompt: string; // Flux Schnell optimized — must have visual continuity markers
  runway_prompt: string; // Runway motion/camera prompt with continuity cue
  camera_movement: string;
  mood: string;
  continuity_note: string;
}

// ── Claude Sonnet 4.5 — Senior Cinematographer / Scene Director ───────────────
// Generates ALL scene prompts in ONE call with enforced visual sequence continuity
async function claudeSceneDirector(params: {
  topic: string;
  objective: string;
  brandContext: string;
  totalDuration: number;
  aspectRatio: string;
  platform: string;
  refImageUrls: string[];
  anthropicKey: string;
}): Promise<CinematicScene[]> {
  const { topic, objective, brandContext, totalDuration, aspectRatio, platform, refImageUrls, anthropicKey } = params;
  const numScenes = Math.min(13, Math.max(4, Math.ceil(totalDuration / 5)));

  const systemPrompt = `You are a senior Art Director, AI Director, and Prompt Optimizer Specialist at senior director level inside a world-class creative agency. You design precise cinematic shot sequences for commercial brand videos optimized for AI image-to-video pipelines (Flux Schnell → Runway Gen 4 Turbo).

Every image prompt you write must score 9+ on all 8 quality axes:

1. SUBJECT CLARITY — hero/subject is unmistakably clear, never occluded, always in sharp focus
2. MOTION POTENTIAL — composition invites natural animation (flowing fabric, smoke, water, breeze, slow zoom)
3. DEPTH LAYERS — distinct foreground / midground / background layers for cinematic parallax
4. CAMERA CONSISTENCY — same lens language and focal length feel across ALL scenes
5. LIGHTING CONSISTENCY — identical light source direction, color temperature, and shadow logic in EVERY scene
6. CHARACTER CONSISTENCY — if a character/model appears, same ethnicity, outfit, hair, expression style throughout
7. SCENE CONTINUITY — each scene's framing connects logically to previous and next (no jarring spatial jumps)
8. VISUAL SIMPLICITY — clean, uncluttered compositions; one clear focal point; no visual noise

OBJECTIVE ALIGNMENT: Every prompt must serve the stated video objective (awareness / conversion / engagement / education / brand story). The opening scene must hook, the closing scene must land the brand message.

Rules for image prompts:
- Lock ONE visual anchor across ALL scenes (light direction, color grade, background world)
- Vary ONLY: camera distance, angle, foreground elements — never the core visual language
- 60–90 words per prompt, Flux Schnell optimized, photorealistic, commercial quality
- State the locked anchor in scene 0's prompt, then reference it in all subsequent scenes

Rules for runway prompts:
- Camera movement + motion direction + transition type
- Include continuity cue referencing previous scene (e.g. "continue slow push-in from previous")
- Max 50 words

Return ONLY valid JSON, no explanation, no markdown.`;

  const userPrompt = `Design a ${numScenes}-scene cinematic video breakdown:
Topic: ${topic}
Objective: ${objective}
Brand: ${brandContext}
Platform: ${platform} (${aspectRatio} format)
Duration: ${totalDuration}s total (${numScenes} scenes × 5s each)${refImageUrls.length > 0 ? `\nReference images: ${refImageUrls.length} provided — extract their exact visual identity, color grade, lighting, and style as the locked anchor for ALL scenes` : ""}

CRITICAL: All 8 criteria (subject clarity, motion potential, depth layers, camera consistency, lighting consistency, character consistency, scene continuity, visual simplicity) must be embedded into every image_prompt. Opening scene hooks for the objective; closing scene lands the brand CTA.

Return: {"scenes":[{"index":0,"duration":5,"image_prompt":"<flux schnell prompt — 60-90 words, all 8 criteria + objective embedded>","runway_prompt":"<runway motion + continuity cue, max 50 words>","camera_movement":"<type>","mood":"<mood>","continuity_note":"<spatial/visual connection to next scene>"},...]}`;

  const userContent: Array<Record<string, unknown>> = [
    ...refImageUrls.slice(0, 3).map(url => ({ type: "image", source: { type: "url", url } })),
    { type: "text", text: userPrompt },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`Scene director failed: ${res.status}`);
  const d = await res.json();
  const raw = d.content?.[0]?.text ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Scene director: no JSON in response");
  const parsed = JSON.parse(match[0]);
  return (parsed.scenes ?? []).slice(0, numScenes) as CinematicScene[];
}

// ── Batch weighted scene scoring — ONE Claude Haiku call per 20 images ────────
// No reasoning. 8 criteria: sc×0.20+mp×0.15+dl×0.10+cam×0.15+lit×0.15+chr×0.10+scon×0.10+vs×0.05
async function claudeBatchScoreScenes(
  sceneCandidates: Array<{ sceneIndex: number; urls: string[] }>,
  brief: string,
  anthropicKey: string,
): Promise<string[]> {
  const flat: Array<{ si: number; url: string }> = [];
  for (const sc of sceneCandidates) {
    for (const url of sc.urls) flat.push({ si: sc.sceneIndex, url });
  }
  if (flat.length === 0) return sceneCandidates.map(sc => sc.urls[0] ?? "");

  const scoredMap = new Map<string, number>();
  const BATCH = 20;

  for (let start = 0; start < flat.length; start += BATCH) {
    const batch = flat.slice(start, start + BATCH);
    const content: Array<Record<string, unknown>> = [];
    batch.forEach((item, i) => {
      content.push({ type: "text", text: `IMG_${start + i}:` });
      content.push({ type: "image", source: { type: "url", url: item.url } });
    });
    content.push({
      type: "text",
      text: `Video: "${brief}"\nScore (1-10): sc×0.20+mp×0.15+dl×0.10+cam×0.15+lit×0.15+chr×0.10+scon×0.10+vs×0.05\nReturn ONLY: {"s":[{"i":${start},"t":7.8},...]}`,
    });
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content }] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const raw = d.content?.[0]?.text ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const arr: Array<{ i: number; t: number }> = JSON.parse(match[0]).s ?? [];
      for (const { i, t } of arr) {
        const item = flat[i];
        if (item) scoredMap.set(item.url, t);
      }
    } catch { /* keep default */ }
  }

  return sceneCandidates.map(sc => {
    let best = sc.urls[0] ?? "";
    let bestScore = -1;
    for (const url of sc.urls) {
      const s = scoredMap.get(url) ?? 5;
      if (s > bestScore) { bestScore = s; best = url; }
    }
    return best;
  });
}

// ── FFmpeg stitch via external Modal endpoint (MODAL_FFMPEG_URL) ──────────────
async function stitchClips(videoUrls: string[], outputKey: string): Promise<string | null> {
  if (!MODAL_FFMPEG_URL || videoUrls.length === 0) return videoUrls[0] ?? null;
  if (videoUrls.length === 1) return videoUrls[0];
  try {
    const res = await fetch(MODAL_FFMPEG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_urls: videoUrls, output_key: outputKey }),
    });
    if (!res.ok) return videoUrls[0] ?? null;
    const d = await res.json();
    return d.url ?? d.video_url ?? videoUrls[0] ?? null;
  } catch {
    return videoUrls[0] ?? null;
  }
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

  // Verify caller is our Next.js server (must send service role key)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const incomingToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!incomingToken || incomingToken !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
    );

    const body = await req.json();
    const { action, brand_id, ...data } = body;

    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const noKieActions = ["check_daily_usage", "generate_smart_prompt", "submit_feedback", "generate_article", "update_image", "update_video", "update_article"];
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
          .not("status", "in", '("failed","error","cancelled","video_scene")'),
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

    // ── GENERATE IMAGE ───────────────────────────────────────────────────────
    if (action === "generate_image") {
      const {
        prompt: rawPrompt, aspect_ratio = "1:1", negative_prompt = "",
        batch_size = 1, target_count, score_with_claude = true, lora_model = "",
        generate_script = false, objective = "", platform = "",
        // New form params
        topic, description, num_images, include_hashtags = false, uploaded_images: uploadedRefImages,
      } = data;
      const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

      // Resolve final image count: num_images (1-8 user pick) → generate 5× for scoring
      const wantedCount = Math.min(Math.max(1, Number(num_images ?? target_count ?? batch_size ?? 1)), 8);
      const numImages = Math.min(wantedCount * 5, 30); // 5× candidates for Claude scoring

      // ── Auto-generate art-directed prompt from topic+objective if no raw prompt ──
      let prompt = rawPrompt as string | undefined;
      if (!prompt && (topic || objective)) {
        if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        try {
          const refImgUrls = (uploadedRefImages as string[] | null) ?? [];
          const artUser = `Create an optimized Flux Schnell image generation prompt for:
- Topic: ${topic || "brand content"}
- Objective: ${objective || "brand showcase"}
- Aspect ratio: ${aspect_ratio}
${(description as string) ? `- Brief: ${description}` : ""}
${refImgUrls.length > 0 ? `- ${refImgUrls.length} reference image(s) provided — match their visual style/mood` : ""}

Write ONE highly specific, commercially optimized prompt (max 120 words). Include lighting, composition, mood, quality descriptors. Return ONLY the prompt text, no explanation.`;
          const artResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 256, messages: [{ role: "user", content: artUser }] }),
          });
          if (artResp.ok) {
            const artData = await artResp.json();
            prompt = artData.content?.[0]?.text?.trim() ?? "";
          }
        } catch { /* fall through */ }
      }
      if (!prompt) return json({ error: "prompt or topic is required" }, 400);

      let imageUrls: string[] = [];
      let aiProvider = "kie";
      let aiModel = "flux-schnell";

      try {
        if (MODAL_FLUX_URL) {
          imageUrls = await modalFluxGenerate(String(prompt), String(aspect_ratio), numImages);
          aiProvider = "modal"; aiModel = "flux-schnell-modal";
        } else if (FAL_API_KEY) {
          imageUrls = await falFluxSchnell(String(prompt), String(aspect_ratio), numImages);
          aiProvider = "fal"; aiModel = "flux-schnell-fal";
        } else {
          const kieRes = await kiePost("/image/generate", {
            prompt, negative_prompt, aspect_ratio, model: "flux-schnell",
            num_images: 1, ...(lora_model ? { lora_model } : {}),
          });
          const url = kieRes.image_url ?? kieRes.url;
          if (url) imageUrls = [url];
          aiModel = kieRes.model ?? "flux-schnell";
        }
      } catch (e) {
        console.error("Primary image provider failed, falling back to KIE:", e);
        try {
          const kieRes = await kiePost("/image/generate", { prompt, negative_prompt, aspect_ratio, model: "flux-schnell", num_images: 1 });
          const url = kieRes.image_url ?? kieRes.url;
          if (url) { imageUrls = [url]; aiProvider = "kie"; aiModel = "flux-schnell"; }
        } catch (e2) { console.error("KIE fallback also failed:", e2); }
      }

      if (imageUrls.length === 0) return json({ error: "Image generation failed — no images returned" }, 500);

      // Claude scoring: pick exactly wantedCount from the batch
      let approvedUrls = imageUrls;
      if (score_with_claude && imageUrls.length > 1 && ANTHROPIC_KEY) {
        // Modified scoring: sort by score, pick top wantedCount (not just 15%)
        approvedUrls = await claudeScoreAndPickN(imageUrls, String(prompt), wantedCount, ANTHROPIC_KEY);
      } else {
        approvedUrls = imageUrls.slice(0, wantedCount);
      }

      // Generate script + hashtags if requested
      let scriptData: Record<string, unknown> | null = null;
      const wantScriptOrHashtags = Boolean(generate_script) || Boolean(include_hashtags);
      if (wantScriptOrHashtags && ANTHROPIC_KEY) {
        try {
          const { data: bp } = await supabase.from("brand_profiles").select("brand_name, brand_dna").eq("id", brand_id).maybeSingle();
          const brandName = (bp?.brand_name as string) ?? "Brand";
          const scriptResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 600,
              messages: [{ role: "user", content: `Create an engaging social media posting script for ${brandName} with image: "${prompt}". Objective: ${objective || (topic as string) || "brand content"}. Platform: ${platform || "Instagram/TikTok"}.
Return JSON only: {"caption":"Instagram caption (max 200 chars)","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],"tiktok_hook":"TikTok opening hook (max 80 chars)","cta":"call to action (max 60 chars)"}` }],
            }),
          });
          if (scriptResp.ok) {
            const sd = await scriptResp.json();
            const rawScript = sd.content?.[0]?.text ?? "{}";
            const match = rawScript.match(/\{[\s\S]*\}/);
            if (match) scriptData = JSON.parse(match[0]);
          }
        } catch { /* non-fatal */ }
      }

      const refImgUrls = (uploadedRefImages as string[] | null) ?? [];
      const dbPlatform = String(platform || (aspect_ratio === "9:16" ? "instagram" : aspect_ratio === "16:9" ? "youtube" : "instagram"));
      const savedImages = await Promise.all(approvedUrls.map(async (url) => {
        const { data: ins } = await supabase.from("gv_image_generations").insert({
          brand_id,
          prompt_text: prompt,
          negative_prompt,
          aspect_ratio,
          ai_provider: aiProvider,
          ai_model: aiModel,
          image_url: url,
          thumbnail_url: url,
          status: "completed",
          target_platform: dbPlatform,
          style_preset: lora_model || null,
          topic: (topic as string) || null,
          description: (description as string) || null,
          objective: (objective as string) || null,
          include_hashtags: Boolean(include_hashtags),
          hashtag_list: include_hashtags && scriptData?.hashtags ? scriptData.hashtags : null,
          uploaded_images: refImgUrls.length > 0 ? refImgUrls : null,
          metadata: scriptData ? { script: scriptData, objective, platform: dbPlatform } : null,
        }).select("id").single();
        return {
          id: ins?.id ?? null,
          prompt_text: prompt,
          image_url: url,
          thumbnail_url: url,
          status: "completed",
          ai_model: aiModel,
          target_platform: dbPlatform,
          style_preset: lora_model || null,
          objective: (objective as string) || null,
          topic: (topic as string) || null,
          script: scriptData,
          hashtags: include_hashtags ? (scriptData?.hashtags ?? []) : null,
          created_at: new Date().toISOString(),
        };
      }));

      return json({
        success: true,
        images: savedImages,
        image_url: savedImages[0]?.image_url ?? null,
        db_id: savedImages[0]?.id ?? null,
        status: "completed",
        total_generated: imageUrls.length,
        total_approved: approvedUrls.length,
        script: scriptData,
        hashtags: include_hashtags ? (scriptData?.hashtags ?? []) : null,
      });
    }

    // ── GENERATE VIDEO (Cinematic Pipeline: Claude Director → Flux×5 → Batch Score → Runway → Stitch) ──
    if (action === "generate_video") {
      const {
        prompt: rawVideoPrompt, duration = 32, aspect_ratio = "9:16", image_url = "",
        objective = "", platform = "", generate_script = false,
        generate_music = false,
        topic: videoTopic, description: videoDesc, uploaded_images: videoRefImages,
        include_hashtags: videoIncludeHashtags = false, include_script = false, include_music = false,
      } = data;
      const ANTHROPIC_KEY_V = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
      const wantVideoScript = Boolean(generate_script) || Boolean(include_script);
      const wantVideoMusic = Boolean(generate_music) || Boolean(include_music);
      const wantVideoHashtags = Boolean(videoIncludeHashtags);

      if (!ANTHROPIC_KEY_V) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

      const totalDuration = Math.min(64, Math.max(16, Number(duration)));
      // Runway Gen 4 Turbo supports 5s or 10s per clip; 5s is closest to 3-6s per scene
      const clipDuration = 5 as const;
      const ratioMap: Record<string, string> = { "9:16": "720:1280", "1:1": "1280:1280", "16:9": "1280:720" };
      const runwayRatio = ratioMap[String(aspect_ratio)] ?? "720:1280";
      const dbPlatformV = String(platform || (aspect_ratio === "9:16" ? "tiktok" : "youtube"));
      const videoRefImgUrls = (videoRefImages as string[] | null) ?? [];

      // Fetch brand context for scene director
      const { data: bpV } = await supabase.from("brand_profiles")
        .select("brand_name, brand_dna, source_of_truth")
        .eq("id", brand_id).maybeSingle();
      const brandNameV = (bpV?.brand_name as string) ?? "Brand";
      const brandDnaV = bpV?.brand_dna as Record<string, unknown> | null;
      const brandContext = [
        brandNameV,
        (brandDnaV?.mission ?? brandDnaV?.brand_essence ?? "") as string,
        ((bpV?.source_of_truth as Record<string, unknown> | null)?.brand_foundation as Record<string, unknown> | null)?.["voice"] as string ?? "",
      ].filter(Boolean).join(" — ");

      const briefTopic = (videoTopic as string) || (rawVideoPrompt as string) || objective || "brand content";
      const briefObj = (objective as string) || "brand showcase";

      // ── STEP 1: Claude Sonnet 4.5 — Scene Director (ALL scenes in ONE call) ──
      let scenes: CinematicScene[] = [];
      try {
        scenes = await claudeSceneDirector({
          topic: briefTopic, objective: briefObj, brandContext,
          totalDuration, aspectRatio: String(aspect_ratio), platform: dbPlatformV,
          refImageUrls: videoRefImgUrls.slice(0, 3), anthropicKey: ANTHROPIC_KEY_V,
        });
      } catch (e) {
        console.error("Scene director failed, using fallback:", e instanceof Error ? e.message : e);
        const numScenes = Math.min(13, Math.max(4, Math.ceil(totalDuration / 5)));
        scenes = Array.from({ length: numScenes }, (_, i) => ({
          index: i,
          duration: 5,
          image_prompt: `${briefTopic}, ${i === 0 ? "wide establishing shot" : i === numScenes - 1 ? "hero close-up" : "mid shot"}, warm consistent sidelight, cinematic depth, commercial quality, brand photography`,
          runway_prompt: `${briefObj} brand video scene ${i + 1}, ${i === 0 ? "slow zoom in" : i === numScenes - 1 ? "gentle pull back" : "smooth pan"}, cinematic motion, seamless flow`,
          camera_movement: i === 0 ? "slow zoom" : i === numScenes - 1 ? "pull back" : "pan",
          mood: "cinematic",
          continuity_note: i < numScenes - 1 ? "continue to next" : "final scene",
        }));
      }

      if (scenes.length === 0) return json({ error: "Failed to plan cinematic scenes" }, 500);
      const numClips = scenes.length;

      let task_id: string | null = null;
      let video_url: string | null = null;
      let status = "processing";
      let ai_model = "runway-gen4-turbo";
      let generation_mode = "runway";
      let extra_task_ids: string[] = [];
      let scene_image_urls: string[] = [];

      if (RUNWAY_API_SECRET) {
        try {
          // ── STEP 2: Flux Schnell — 2 candidates per scene, max 10 scenes → 20 imgs → 1 scoring call ─────
          const candidatesPerScene = 2;
          const sceneImageBatches = await Promise.all(
            scenes.map(async (scene) => {
              try {
                let urls: string[] = [];
                if (MODAL_FLUX_URL) {
                  urls = await modalFluxGenerate(scene.image_prompt, String(aspect_ratio), candidatesPerScene);
                } else if (FAL_API_KEY) {
                  urls = await falFluxSchnell(scene.image_prompt, String(aspect_ratio), candidatesPerScene);
                }
                // Upload to Cloudflare R2 for permanent storage + scoring access
                if (urls.length > 0 && R2_ACCESS_KEY_ID) {
                  urls = await Promise.all(
                    urls.map((url, i) =>
                      fetchAndUploadToR2(url, `scene-images/${Date.now()}_s${scene.index}_c${i}.webp`, "image/webp")
                    )
                  );
                }
                return { sceneIndex: scene.index, urls };
              } catch {
                return { sceneIndex: scene.index, urls: [] };
              }
            })
          );

          // ── STEP 3: Batch weighted scoring — ONE Claude Haiku call per 20 images ──
          const validBatches = sceneImageBatches.filter(b => b.urls.length > 0);
          const bestPerScene = validBatches.length > 0
            ? await claudeBatchScoreScenes(validBatches, briefTopic, ANTHROPIC_KEY_V)
            : [];

          const bestUrlBySceneIndex = new Map<number, string>();
          validBatches.forEach((batch, i) => {
            if (bestPerScene[i]) bestUrlBySceneIndex.set(batch.sceneIndex, bestPerScene[i]);
          });
          scene_image_urls = scenes.map(s => bestUrlBySceneIndex.get(s.index) ?? "").filter(Boolean);

          // ── STEP 4: Runway Gen 4 Turbo per scene with Claude-written runway prompts ──
          const runwayResults = await Promise.allSettled(
            scenes.map((scene) =>
              runwayCreateTask({
                prompt: scene.runway_prompt,
                imageUrl: bestUrlBySceneIndex.get(scene.index) ?? (image_url ? String(image_url) : null),
                duration: clipDuration,
                ratio: runwayRatio,
              })
            )
          );
          const successfulTasks = runwayResults
            .map((r) => (r.status === "fulfilled" ? r.value : null))
            .filter((t): t is { id: string } => t !== null && !!t.id);
          if (successfulTasks.length === 0) throw new Error("All Runway task creations failed");
          task_id = successfulTasks[0].id;
          extra_task_ids = successfulTasks.slice(1).map(t => t.id);
          status = "processing";
        } catch (e) {
          console.error("Runway cinematic pipeline failed, falling back to KIE:", e);
          generation_mode = "kie"; ai_model = "kling-v2";
          const kiePayload: Record<string, unknown> = { prompt: briefTopic, duration: 8, aspect_ratio, model: "kling-v2", mode: "standard" };
          if (image_url) kiePayload.image_url = image_url;
          const kieRes = await kiePost("/video/generate", kiePayload);
          task_id = kieRes.task_id ?? kieRes.id ?? null;
          video_url = kieRes.video_url ?? null;
          status = kieRes.status ?? "processing";
          ai_model = kieRes.model ?? "kling-v2";
        }
      } else {
        generation_mode = "kie"; ai_model = "kling-v2";
        const kiePayload: Record<string, unknown> = { prompt: briefTopic, duration: 8, aspect_ratio, model: "kling-v2", mode: "standard" };
        if (image_url) kiePayload.image_url = image_url;
        const kieRes = await kiePost("/video/generate", kiePayload);
        task_id = kieRes.task_id ?? kieRes.id ?? null;
        video_url = kieRes.video_url ?? null;
        status = kieRes.status ?? "processing";
        ai_model = kieRes.model ?? "kling-v2";
      }

      // ── STEP 5: Script + hashtags + music ────────────────────────────────────
      let videoScript: Record<string, unknown> | null = null;
      if ((wantVideoScript || wantVideoHashtags || wantVideoMusic) && ANTHROPIC_KEY_V) {
        try {
          const scriptResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_KEY_V, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 600,
              messages: [{ role: "user", content: `Create a posting script for ${brandNameV} video: "${briefTopic}". Objective: ${briefObj}. Platform: ${platform || "TikTok"}. Music: ${wantVideoMusic ? "yes" : "no"}.
Return JSON only: {"caption":"<200 chars>","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],"voiceover":"<1 sentence per scene>","music_mood":"${wantVideoMusic ? "mood, genre, tempo" : ""}","cta":"<60 chars>"}` }],
            }),
          });
          if (scriptResp.ok) {
            const sd = await scriptResp.json();
            const raw = sd.content?.[0]?.text ?? "{}";
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) videoScript = JSON.parse(match[0]);
          }
        } catch { /* non-fatal */ }
      }

      // Store scene images
      if (scene_image_urls.length > 0) {
        await Promise.allSettled(scene_image_urls.map((url, i) =>
          supabase.from("gv_image_generations").insert({
            brand_id, prompt_text: scenes[i]?.image_prompt ?? briefTopic,
            aspect_ratio, ai_provider: MODAL_FLUX_URL ? "modal" : FAL_API_KEY ? "fal" : "kie",
            ai_model: "flux-schnell", image_url: url, thumbnail_url: url,
            status: "video_scene", target_platform: dbPlatformV,
            metadata: { source: "cinematic_pipeline", scene_index: i, mood: scenes[i]?.mood, camera: scenes[i]?.camera_movement, objective: briefObj, platform: dbPlatformV },
          })
        ));
      }

      const { data: inserted, error: insertErr } = await supabase.from("gv_video_generations").insert({
        brand_id, target_platform: dbPlatformV, hook: briefTopic,
        ai_model, status, generation_mode,
        runway_task_id: task_id, video_url,
        video_thumbnail_url: null, video_aspect_ratio: aspect_ratio, video_status: status,
        topic: (videoTopic as string) || null,
        description: (videoDesc as string) || null,
        objective: briefObj || null,
        include_hashtags: wantVideoHashtags,
        hashtag_list: wantVideoHashtags && videoScript?.hashtags ? videoScript.hashtags : null,
        include_music: wantVideoMusic,
        music_suggestion: wantVideoMusic ? String(videoScript?.music_mood ?? "") : null,
        uploaded_images: videoRefImgUrls.length > 0 ? videoRefImgUrls : null,
        metadata: {
          ...(extra_task_ids.length > 0 ? { extra_task_ids } : {}),
          num_clips: numClips, total_duration: totalDuration, clip_duration: clipDuration,
          num_scenes: scenes.length, scene_image_urls,
          scenes: scenes.map(s => ({ index: s.index, mood: s.mood, camera: s.camera_movement, continuity: s.continuity_note })),
          ...(videoScript ? { script: videoScript } : {}),
          objective: briefObj, platform: dbPlatformV,
        },
      }).select("id").single();
      if (insertErr) console.error("generate_video DB insert failed:", insertErr.message);

      return json({
        success: true, task_id, extra_task_ids, num_clips: numClips,
        num_scenes: scenes.length, total_duration: totalDuration, clip_duration: clipDuration,
        video_url, status, db_id: inserted?.id ?? null, ai_model,
        scene_image_urls,
        scenes: scenes.map(s => ({ index: s.index, mood: s.mood, camera: s.camera_movement })),
        script: videoScript,
        hashtags: wantVideoHashtags ? (videoScript?.hashtags ?? []) : null,
        music_suggestion: wantVideoMusic ? String(videoScript?.music_mood ?? "") : null,
      });
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

      if (generation_mode === "runway") {
        const pollRes = await runwayPollTask(String(task_id));
        status = pollRes.status;
        video_url = pollRes.video_url;

        // When main clip completes, poll extra clips → auto-stitch if all done
        if (status === "completed" && db_id) {
          const { data: dbRow } = await supabase.from("gv_video_generations")
            .select("metadata").eq("id", db_id).maybeSingle();
          const extraIds: string[] = ((dbRow?.metadata as Record<string, unknown>)?.extra_task_ids ?? []) as string[];
          if (extraIds.length > 0) {
            const extraResults = await Promise.allSettled(extraIds.map(id => runwayPollTask(id)));
            const allVideoUrls: string[] = [video_url!].filter(Boolean);
            let allDone = true;
            for (const r of extraResults) {
              if (r.status === "fulfilled") {
                if (r.value.status !== "completed") { allDone = false; }
                else if (r.value.video_url) { allVideoUrls.push(r.value.video_url); }
                else { allDone = false; } // completed but no URL — treat as not done
              } else { allDone = false; }
            }
            if (allDone && allVideoUrls.length > 1) {
              // All clips ready — stitch via Modal FFmpeg (or use first clip if not configured)
              const stitched = await stitchClips(allVideoUrls, `stitched_${db_id}`);
              if (stitched) video_url = stitched;
              status = "completed";
            } else if (!allDone) {
              status = "processing"; // extra clips still rendering
            }
          }
        }
      } else if (generation_mode === "openai") {
        const pollRes = await openAISoraPoll(String(task_id));
        status = pollRes.status;
        video_url = pollRes.video_url;
        if (status === "succeeded") status = "completed";
        if (status === "failed") status = "failed";
      } else if (generation_mode === "heygen") {
        const pollRes = await heygenPoll(String(task_id));
        status = pollRes.status;
        video_url = pollRes.video_url;
        thumbnail_url = pollRes.thumbnail_url;
        if (status === "completed") status = "completed";
      } else {
        const kieRes = await kieGet(`/task/${task_id}`);
        status = kieRes.status ?? "processing";
        image_url = kieRes.image_url ?? kieRes.result?.image_url ?? null;
        video_url = kieRes.video_url ?? kieRes.result?.video_url ?? null;
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
          await supabase.from("gv_video_generations").update({
            video_status: "completed",
            video_url,
            video_thumbnail_url: thumbnail_url,
          }).eq("id", db_id);
        }
      }

      return json({ success: true, status, image_url, video_url });
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

      if (type === "all" || type === "article") {
        const { data: articles } = await supabase
          .from("gv_article_generations")
          .select("id, topic, description, objective, length, content, content_very_long, meta_title, meta_description, focus_keywords, social, geo, hashtag_list, script_content, music_suggestion, image_count, image_size, status, scheduled_at, created_at")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        results.articles = articles ?? [];
      }

      if (type === "all" || type === "image") {
        const { data: imgs } = await supabase
          .from("gv_image_generations")
          .select("id, prompt_text, topic, description, objective, image_url, thumbnail_url, status, ai_model, target_platform, style_preset, aspect_ratio, hashtag_list, include_hashtags, scheduled_at, feedback, created_at")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        results.images = imgs ?? [];
      }

      if (type === "all" || type === "video") {
        const { data: vids } = await supabase
          .from("gv_video_generations")
          .select("id, hook, topic, description, objective, video_url, video_thumbnail_url, video_status, ai_model, target_platform, video_aspect_ratio, hashtag_list, include_hashtags, include_music, music_suggestion, scheduled_at, feedback, created_at")
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

    // ── ANALYZE IMAGES (Claude Vision — classifies content type) ─────────────
    if (action === "analyze_images") {
      const { image_urls } = data;
      if (!Array.isArray(image_urls) || image_urls.length === 0) {
        return json({ error: "image_urls array required" }, 400);
      }
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
      if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

      const imageContent = image_urls.slice(0, 10).map((url: string) => ({
        type: "image",
        source: { type: "url", url },
      }));

      const analysisResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: "You are an expert visual analyst for brand content. Analyze images and return ONLY a valid JSON object, no markdown.",
          messages: [{
            role: "user",
            content: [
              ...imageContent,
              {
                type: "text",
                text: `Analyze these ${image_urls.length} image(s) and classify:
Return JSON: {
  "content_type": "single_product_angles"|"multi_product"|"product_character_world"|"world_building"|"character_only"|"lifestyle"|"mixed",
  "description": "brief 1-sentence description of what you see",
  "subjects": ["product","character","person","location","food","fashion","tech","lifestyle"],
  "recommended_objectives": ["multi_angles","theme","new_product","review","ads","mini_story","multi_catalog","education","faq","random"],
  "best_ratio": "1:1"|"9:16"|"16:9",
  "notes": "any important visual notes for prompt engineering"
}
Return ONLY the JSON, no explanation.`,
              },
            ],
          }],
        }),
      });

      if (!analysisResp.ok) return json({ error: `Claude vision error ${analysisResp.status}` }, 502);
      const analysisData = await analysisResp.json();
      const rawText = analysisData.content?.[0]?.text ?? "{}";
      let analysis: Record<string, unknown> = {};
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        analysis = match ? JSON.parse(match[0]) : {};
      } catch { analysis = { content_type: "mixed", recommended_objectives: ["random"], best_ratio: "1:1" }; }

      return json({ success: true, analysis });
    }

    // ── GENERATE ART-DIRECTED PROMPT (Claude as expert art director) ──────────
    if (action === "generate_art_directed_prompt") {
      const { content_type, objective, media_type, ratio, topic, image_urls, notes } = data;
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
      if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

      const generator = media_type === "video" ? "Runway Gen 4 Turbo (cinematic AI video generation model)" : "Flux Schnell (ultra-fast, high-quality image generation model)";
      const ratioDesc = ratio === "9:16" ? "9:16 vertical (TikTok/Instagram Reels/Stories)" : ratio === "16:9" ? "16:9 horizontal (YouTube/Landscape)" : "1:1 square (Instagram Feed/LinkedIn)";

      const systemPrompt = `You are a world-class creative director, senior photographer, cinematographer, and AI prompt engineer.
Your expertise:
- Commercial photography: product, lifestyle, fashion, food, architecture
- Cinematography: shot composition, camera movement, lighting, color grading
- AI generation: Flux (images), Kling AI (videos) — you know exactly how to write prompts for each
- Platform optimization: Instagram, TikTok, YouTube, LinkedIn visual requirements
- Brand storytelling: visual narrative, mood, atmosphere

Write highly technical, precise prompts that produce stunning commercial-quality results.`;

      const userMsg = `Create an optimized ${media_type === "video" ? "VIDEO" : "IMAGE"} generation prompt for:
- Generator: ${generator}
- Content type detected: ${content_type || "product/lifestyle"}
- Creative objective: ${objective || "brand showcase"}
- Aspect ratio: ${ratioDesc}
- Topic/Context: ${topic || "brand content"}
- Visual notes: ${notes || "professional commercial quality"}
${image_urls?.length ? `- Reference images provided: ${image_urls.length} image(s) (use their visual style/mood/subjects as reference)` : ""}

Write the prompt as if you are directing a professional photoshoot/film shoot. Include:
${media_type === "image" ? `- Lighting setup (natural/studio/golden hour/dramatic/soft box etc.)
- Camera angle and lens (low angle, bird's eye, 35mm portrait, macro, etc.)
- Composition (rule of thirds, leading lines, negative space, etc.)
- Color palette and mood
- Post-processing style (clean product, cinematic, editorial, etc.)
- Technical quality markers (8K, hyperrealistic, RAW, commercial, etc.)` : `- Camera movement (dolly zoom, tracking shot, handheld, crane shot, etc.)
- Opening shot to closing shot sequence
- Lighting and atmosphere transitions
- Pacing and rhythm
- Sound/music mood suggestion
- Platform-specific editing style (TikTok punchy cuts, YouTube cinematic, Reels trending format)
- Recommended total duration (16–64 seconds): choose based on content complexity — 16s for simple ads, 32s for storytelling, 64s for documentaries/deep content`}

Return ONLY valid JSON:
{
  "prompt": "the complete optimized generation prompt",
  "negative_prompt": "what to avoid (for image models)",
  "style_notes": "2-sentence creative direction"${media_type === "video" ? `,
  "recommended_duration": <integer 16-64, total seconds based on content complexity and objective>` : ""}
}`;

      const promptResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
        }),
      });

      if (!promptResp.ok) return json({ error: `Claude art director error ${promptResp.status}` }, 502);
      const promptData = await promptResp.json();
      const rawPromptText = promptData.content?.[0]?.text ?? "{}";
      let promptResult: Record<string, string> = {};
      try {
        const match = rawPromptText.match(/\{[\s\S]*\}/);
        promptResult = match ? JSON.parse(match[0]) : {};
      } catch { promptResult = { prompt: topic || "professional commercial photography, high quality", negative_prompt: "blurry, low quality, watermark" }; }

      return json({ success: true, ...promptResult });
    }

    // ── GENERATE ARTICLE (Claude Sonnet 4.6 direct) ───────────────────────────
    if (action === "generate_article") {
      const {
        topic, objective, length, image_urls, brand_context,
        description, uploaded_images, image_count, image_size,
        include_script, include_hashtags, include_music,
      } = data;
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
      if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

      // Fetch brand profile for context
      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("brand_name, country, brand_dna, source_of_truth")
        .eq("id", brand_id)
        .maybeSingle();

      const brandName = bp?.brand_name ?? (brand_context as Record<string, string> | null)?.brand_name ?? "Brand";
      const country = bp?.country ?? (brand_context as Record<string, string> | null)?.country ?? "Indonesia";
      const dna = (bp?.brand_dna ?? {}) as Record<string, unknown>;
      const sot = (bp?.source_of_truth ?? {}) as Record<string, unknown>;
      const kwi = sot.keyword_intelligence as Record<string, unknown> | null;
      const rankingKws = (kwi?.ranking_keywords as string[] ?? []).slice(0, 5).join(", ");

      const objectiveLabels: Record<string, string> = {
        faq:                 "FAQ format — pertanyaan umum pelanggan dengan jawaban detail",
        trend:               "Trend article — topik viral & trending terkini",
        educational:         "Educational — konten edukatif yang menambah wawasan pembaca",
        tips:                "Tips & Tricks — panduan praktis langkah demi langkah",
        tips_tricks:         "Tips & Tricks — panduan praktis langkah demi langkah",
        new_product:         "Product launch — peluncuran produk baru yang menarik",
        seasonal_greetings:  "Seasonal Greetings — konten spesial hari raya dan musim",
        newsletter:          "Newsletter — update berkala yang informatif dan engaging",
        updates:             "Brand updates — berita & perkembangan terbaru brand",
        multi_product:       "Multi Product Catalog — showcase beberapa produk secara menarik",
        ads:                 "Ads copy — teks iklan yang persuasif dan konversi tinggi",
        tutorial:            "Tutorial — panduan how-to yang mudah diikuti",
        review:              "Review & Testimonial — ulasan dan testimoni pelanggan",
        random:              "AI-recommended — konten terbaik berdasarkan rekomendasi AI",
      };
      const objLabel = objectiveLabels[objective as string] ?? "konten brand relevan";

      const wordCounts: Record<string, number> = { short: 300, medium: 800, long: 1500, very_long: 3000 };
      const targetWords = wordCounts[length as string] ?? 800;

      const enrichedTopic = topic
        ? `${topic} (${objLabel})`
        : `${objLabel} untuk ${brandName}`;

      const imgCount = Number(image_count ?? 0);
      const imgSize = String(image_size ?? "1:1");
      const wantScript = Boolean(include_script);
      const wantHashtags = Boolean(include_hashtags);
      const wantMusic = Boolean(include_music);
      const uploadedImgUrls = (uploaded_images as string[] | null) ?? (image_urls as string[] | null) ?? [];

      const systemMsg = `You are an expert content writer and SEO specialist. Write high-quality, engaging content in Indonesian language (Bahasa Indonesia) for digital brands. You always write in proper JSON format.`;

      const extraJsonFields = [
        wantHashtags ? `  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],` : "",
        wantScript ? `  "script": "Full narration script for video/reel (natural spoken tone, 60-90 seconds read time)",` : "",
        wantMusic ? `  "music_suggestion": "Recommended background music style/genre/mood for this content",` : "",
        imgCount > 0 ? `  "image_prompts": [${Array.from({length: imgCount}, (_, i) => `"Detailed image generation prompt ${i+1} (${imgSize} aspect ratio) for this article"`).join(",")}],` : "",
      ].filter(Boolean).join("\n");

      const userMsg = `Write a complete ${targetWords}-word article for this brand:

Brand: ${brandName}
Country/Market: ${country}
Positioning: ${String(dna.positioning ?? "premium brand")}
USP: ${String(dna.usp ?? "")}
Target keywords: ${rankingKws || "brand-related keywords"}

Topic: ${enrichedTopic}
Format: ${objLabel}
Target length: ~${targetWords} words
${(description as string) ? `Additional context/brief: ${description}` : ""}
${uploadedImgUrls.length > 0 ? `Reference images provided: ${uploadedImgUrls.length} image(s) — incorporate their visual content/context into the article` : ""}
${imgCount > 0 ? `Image placeholders needed: ${imgCount} image(s) at ${imgSize} aspect ratio` : ""}
${wantScript ? "Include: full narration script for video/reel" : ""}
${wantHashtags ? "Include: 10 relevant hashtags" : ""}
${wantMusic ? "Include: music/background audio suggestion" : ""}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "article": "full article HTML content (~${targetWords} words, use <h2><h3><p><ul><li> tags)",
  "meta_title": "SEO title (50-60 chars)",
  "meta_description": "SEO description (150-160 chars)",
  "focus_keywords": ["keyword1", "keyword2", "keyword3"],
  "social": {
    "instagram": "Instagram caption (max 150 chars + 5 hashtags)",
    "linkedin": "LinkedIn post (professional, max 200 chars)",
    "tiktok": "TikTok hook (punchy, max 100 chars)"
  },
  "geo": {
    "faq": [
      {"question": "Q1?", "answer": "A1."},
      {"question": "Q2?", "answer": "A2."},
      {"question": "Q3?", "answer": "A3."}
    ]
  }${extraJsonFields ? `,\n${extraJsonFields}` : ""}
}`;

      // Build Claude messages — include uploaded images if provided (vision)
      type ClaudeContent = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
      const userContent: ClaudeContent[] = [];
      for (const imgUrl of uploadedImgUrls.slice(0, 8)) {
        userContent.push({ type: "image", source: { type: "url", url: String(imgUrl) } });
      }
      userContent.push({ type: "text", text: userMsg });

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: systemMsg,
          messages: [{ role: "user", content: uploadedImgUrls.length > 0 ? userContent : userMsg }],
        }),
      });

      if (!claudeResp.ok) {
        return json({ success: false, error: `Article generation failed (${claudeResp.status})` }, 502);
      }

      const claudeData = await claudeResp.json();
      const rawText = (claudeData.content?.[0]?.text ?? "").trim();
      let articleData: Record<string, unknown> = {};
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) articleData = JSON.parse(match[0]);
      } catch {
        articleData = { article: rawText };
      }

      const articleContent = String(articleData.article ?? "");
      const isVeryLong = (length as string) === "very_long";

      // Store in gv_article_generations
      const { data: stored } = await supabase.from("gv_article_generations").insert({
        brand_id,
        topic: enrichedTopic,
        objective,
        length,
        content: isVeryLong ? null : articleContent,
        content_very_long: isVeryLong ? articleContent : null,
        description: (description as string) || null,
        uploaded_images: uploadedImgUrls.length > 0 ? uploadedImgUrls : null,
        image_count: imgCount,
        image_size: imgSize,
        include_script: wantScript,
        include_hashtags: wantHashtags,
        include_music: wantMusic,
        meta_title: String(articleData.meta_title ?? ""),
        meta_description: String(articleData.meta_description ?? ""),
        focus_keywords: articleData.focus_keywords ?? [],
        social: articleData.social ?? {},
        geo: articleData.geo ?? {},
        hashtag_list: wantHashtags ? (articleData.hashtags ?? []) : null,
        script_content: wantScript ? String(articleData.script ?? "") : null,
        music_suggestion: wantMusic ? String(articleData.music_suggestion ?? "") : null,
        status: "done",
      }).select("id").single();

      return json({
        success: true,
        article: {
          id: stored?.id ?? `article-${Date.now()}`,
          topic: enrichedTopic,
          objective,
          length,
          content: articleContent,
          description: (description as string) || null,
          image_count: imgCount,
          image_size: imgSize,
          meta_title: String(articleData.meta_title ?? ""),
          meta_description: String(articleData.meta_description ?? ""),
          focus_keywords: (articleData.focus_keywords as string[]) ?? [],
          social: (articleData.social as Record<string, string>) ?? {},
          geo: (articleData.geo as Record<string, unknown>) ?? {},
          hashtags: wantHashtags ? ((articleData.hashtags as string[]) ?? []) : null,
          script: wantScript ? String(articleData.script ?? "") : null,
          music_suggestion: wantMusic ? String(articleData.music_suggestion ?? "") : null,
          image_prompts: imgCount > 0 ? ((articleData.image_prompts as string[]) ?? []) : null,
          created_at: new Date().toISOString(),
        },
      });
    }

    // ── UPDATE IMAGE STATUS (reject / schedule) ───────────────────────────────
    if (action === "update_image") {
      const { image_id, status: newStatus, scheduled_at } = data;
      if (!image_id) return json({ error: "image_id required" }, 400);
      const updates: Record<string, unknown> = {};
      if (newStatus) updates.status = newStatus;
      if (scheduled_at) updates.scheduled_at = scheduled_at;
      if (!Object.keys(updates).length) return json({ error: "No fields to update" }, 400);
      const { error: upErr } = await supabase
        .from("gv_image_generations")
        .update(updates)
        .eq("id", image_id)
        .eq("brand_id", brand_id);
      if (upErr) return json({ error: "Update failed" }, 500);
      return json({ success: true });
    }

    // ── UPDATE VIDEO STATUS (reject / schedule) ───────────────────────────────
    if (action === "update_video") {
      const { video_id, status: newStatus, scheduled_at } = data;
      if (!video_id) return json({ error: "video_id required" }, 400);
      const updates: Record<string, unknown> = {};
      if (newStatus) updates.video_status = newStatus;
      if (scheduled_at) updates.scheduled_at = scheduled_at;
      if (!Object.keys(updates).length) return json({ error: "No fields to update" }, 400);
      const { error: upErr } = await supabase
        .from("gv_video_generations")
        .update(updates)
        .eq("id", video_id)
        .eq("brand_id", brand_id);
      if (upErr) return json({ error: "Update failed" }, 500);
      return json({ success: true });
    }

    // ── UPDATE ARTICLE STATUS (reject / schedule) ─────────────────────────────
    if (action === "update_article") {
      const { article_id, status: newStatus, content: newContent, scheduled_at } = data;
      if (!article_id) return json({ error: "article_id required" }, 400);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (newStatus) updates.status = newStatus;
      if (newContent) updates.content = newContent;
      if (scheduled_at) updates.scheduled_at = scheduled_at;
      const { error: upErr } = await supabase
        .from("gv_article_generations")
        .update(updates)
        .eq("id", article_id)
        .eq("brand_id", brand_id);
      if (upErr) return json({ error: "Update failed" }, 500);
      return json({ success: true });
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
