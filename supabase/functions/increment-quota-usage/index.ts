import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Maps action → which columns to touch and reset logic
const ACTION_MAP: Record<string, {
  usageCol: string;
  dateCol: string | null; // null = monthly (uses period_start)
}> = {
  ai_chat_message:  { usageCol: "ai_chat_messages_today",   dateCol: "ai_chat_messages_date" },
  suggested_prompt: { usageCol: "suggested_prompts_today",  dateCol: "suggested_prompts_date" },
  content_article:  { usageCol: "articles_this_month",       dateCol: null },
  content_image:    { usageCol: "images_this_month",         dateCol: null },
  content_video:    { usageCol: "videos_this_month",         dateCol: null },
  report:           { usageCol: "reports_this_month",        dateCol: null },
  auto_reply:       { usageCol: "auto_replies_today",        dateCol: "auto_replies_date" },
  auto_publish:     { usageCol: "auto_publishes_this_month", dateCol: null },
};

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { user_id, action, amount = 1 } = await req.json() as {
      user_id: string;
      action: string;
      amount?: number;
    };

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "user_id and action are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const map = ACTION_MAP[action];
    if (!map) {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const monthStart = today.slice(0, 7) + "-01"; // YYYY-MM-01

    // Fetch existing row
    const { data: existing } = await supa
      .from("user_quota_usage")
      .select("*")
      .eq("user_id", user_id)
      .single();

    let newCount: number;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (map.dateCol) {
      // Daily counter
      const lastDate = existing ? (existing[map.dateCol] as string | null) : null;
      const currentVal = lastDate === today ? (existing![map.usageCol] as number ?? 0) : 0;
      newCount = currentVal + amount;
      updates[map.usageCol] = newCount;
      updates[map.dateCol] = today;
    } else {
      // Monthly counter
      const periodStart = existing ? (existing.period_start as string | null) : null;
      const currentVal = periodStart === monthStart ? (existing![map.usageCol] as number ?? 0) : 0;
      newCount = currentVal + amount;
      updates[map.usageCol] = newCount;
      updates.period_start = monthStart;
    }

    if (existing) {
      await supa.from("user_quota_usage").update(updates).eq("user_id", user_id);
    } else {
      // Insert with defaults for all counters
      await supa.from("user_quota_usage").insert({
        user_id,
        period_start: monthStart,
        ai_chat_messages_today: 0,
        ai_chat_messages_date: today,
        suggested_prompts_today: 0,
        suggested_prompts_date: today,
        articles_this_month: 0,
        images_this_month: 0,
        videos_this_month: 0,
        reports_this_month: 0,
        auto_replies_today: 0,
        auto_replies_date: today,
        auto_publishes_this_month: 0,
        ...updates,
      });
    }

    return new Response(JSON.stringify({ success: true, [map.usageCol]: newCount }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[increment-quota-usage] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
