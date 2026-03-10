import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Maps action → { quota field on plan_quotas, usage field on user_quota_usage, period, feature toggle }
const ACTION_MAP: Record<string, {
  quota: string;
  usage: string;
  dateField: string | null; // field that holds the last-reset date (daily), null = monthly
  feature: string;
}> = {
  ai_chat_message:    { quota: "ai_chat_messages_per_day",    usage: "ai_chat_messages_today",    dateField: "ai_chat_messages_date",    feature: "feature_ai_chat_enabled" },
  suggested_prompt:   { quota: "suggested_prompts_per_day",   usage: "suggested_prompts_today",   dateField: "suggested_prompts_date",   feature: "feature_ai_chat_enabled" },
  content_article:    { quota: "content_articles_per_month",  usage: "articles_this_month",        dateField: null,                      feature: "feature_content_enabled" },
  content_image:      { quota: "content_images_per_month",    usage: "images_this_month",          dateField: null,                      feature: "feature_content_enabled" },
  content_video:      { quota: "content_videos_per_month",    usage: "videos_this_month",          dateField: null,                      feature: "feature_content_enabled" },
  report:             { quota: "reports_per_month",           usage: "reports_this_month",         dateField: null,                      feature: "feature_report_enabled" },
  auto_reply:         { quota: "auto_reply_per_day",          usage: "auto_replies_today",         dateField: "auto_replies_date",        feature: "feature_reply_enabled" },
  auto_publish:       { quota: "auto_publish_per_month",      usage: "auto_publishes_this_month",  dateField: null,                      feature: "feature_reply_enabled" },
};

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { action } = await req.json() as { action: string };
    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const map = ACTION_MAP[action];
    if (!map) {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supa = adminClient;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const monthStart = today.slice(0, 7) + "-01"; // YYYY-MM-01

    // 1. Get active plan via subscriptions → plans
    const { data: subRow } = await supa
      .from("subscriptions")
      .select("plan_id, plans!inner(slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const planSlug: string = (subRow?.plans as { slug: string } | null)?.slug ?? "trial";

    // 2. Load plan quotas
    const { data: quota } = await supa
      .from("plan_quotas")
      .select("*")
      .eq("plan_name", planSlug)
      .single();

    if (!quota) {
      // No quota record → allow (fail-open)
      return new Response(JSON.stringify({ allowed: true, remaining: -1, limit: -1, plan: planSlug }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 3. Check feature toggle
    const featureEnabled = quota[map.feature] as boolean;
    if (featureEnabled === false) {
      return new Response(JSON.stringify({ allowed: false, remaining: 0, limit: 0, plan: planSlug, reason: "feature_disabled" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 4. Check quota limit
    const limit = quota[map.quota] as number;
    if (limit === -1) {
      return new Response(JSON.stringify({ allowed: true, remaining: -1, limit: -1, plan: planSlug }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 5. Get current usage
    const { data: usageRow } = await supa
      .from("user_quota_usage")
      .select("*")
      .eq("user_id", user.id)
      .single();

    let currentUsage = 0;

    if (usageRow) {
      if (map.dateField) {
        // Daily counter — reset if date changed
        const lastDate = (usageRow[map.dateField] as string | null);
        currentUsage = lastDate === today ? (usageRow[map.usage] as number ?? 0) : 0;
      } else {
        // Monthly counter — reset if period_start doesn't match current month
        const periodStart = (usageRow.period_start as string | null);
        currentUsage = periodStart === monthStart ? (usageRow[map.usage] as number ?? 0) : 0;
      }
    }

    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return new Response(JSON.stringify({ allowed, remaining, limit, plan: planSlug, used: currentUsage }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[check-quota] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
