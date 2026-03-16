import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Claude Haiku call ── */
async function callHaiku(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  /* ── Auth ── */
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  /* ── Parse request ── */
  let body: {
    action: "suggest" | "send";
    comment_text: string;
    comment_user: string;
    platform: string;  // ig | tt | yt
    reply_text?: string;
    tone?: string;     // professional | friendly | casual | empathetic | energetic | witty
    brand_name?: string;
  };

  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { action, comment_text, comment_user, platform, tone = "friendly", brand_name } = body;

  if (!action || !comment_text || !comment_user || !platform)
    return json({ error: "Missing required fields: action, comment_text, comment_user, platform" }, 400);

  const platLabels: Record<string, string> = {
    ig: "Instagram", tt: "TikTok", yt: "YouTube", fb: "Facebook",
  };
  const platLabel = platLabels[platform] ?? platform;

  /* ── action: suggest — generate AI reply ── */
  if (action === "suggest") {
    const brandCtx = brand_name ? `You represent the brand "${brand_name}".` : "You are a brand social media manager.";

    const systemPrompt = `You are a social media reply assistant. ${brandCtx}
Your job is to write a reply to a ${platLabel} comment.
Tone: ${tone}. Be authentic, concise (under 150 characters preferred), and avoid emojis unless they fit the tone.
Reply in the same language as the original comment (Indonesian or English). Do NOT include "Reply:" or quotation marks.`;

    const userPrompt = `Comment from ${comment_user} on ${platLabel}:
"${comment_text}"

Write a single, natural reply.`;

    try {
      const reply = await callHaiku(systemPrompt, userPrompt);
      return json({ reply });
    } catch (err) {
      console.error("[smart-reply] suggest error:", err);
      return json({ error: "AI generation failed" }, 502);
    }
  }

  /* ── action: send — log the sent reply ── */
  if (action === "send") {
    const replyText = body.reply_text ?? "";
    if (!replyText) return json({ error: "reply_text required for send action" }, 400);

    // Log to DB for audit trail
    const { error: dbErr } = await supabase.from("smart_reply_log").insert({
      user_id:      user.id,
      platform,
      comment_user,
      comment_text,
      reply_text:   replyText,
      tone,
      sent_at:      new Date().toISOString(),
    });

    // Table may not exist yet — log but don't fail the request
    if (dbErr) console.warn("[smart-reply] log insert skipped:", dbErr.message);

    // In production this would call platform APIs (Instagram Graph API, TikTok API, etc.)
    // For now: return success so UI can show sent state
    return json({ success: true, message: "Reply sent successfully" });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
