/**
 * ads-wa-handler — WhatsApp CMO Persona Interface for Ads Management
 *
 * Routes WhatsApp messages to the correct ads function based on intent.
 * Acts as the CMO persona with per-platform specialization (Meta, TikTok, Google).
 *
 * Called by: WA webhook router when CMO persona is invoked
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getAdTierQuota,
  sendAdWA,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";
import { getBrandContext, buildBrandContextBlock } from "../_shared/brandContext.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Intent Detection ────────────────────────────────────────────────────────

type AdsIntent =
  | "status"         // "gimana ads gue?" / "campaign status"
  | "approve_picks"  // "OK" / "approve" / "approve 1,3"
  | "approve_budget" // "APPROVE" budget
  | "adjust_budget"  // "ADJUST" budget
  | "pause"          // "pause campaign X"
  | "resume"         // "resume campaign X"
  | "report"         // "report" / "laporan ads"
  | "strategy"       // "strategi ads" / "ad strategy"
  | "fix"            // "fix" / "perbaiki"
  | "help"           // "help" / "bantuan"
  | "chat"           // General ads question → Claude CMO persona
  | "unknown";

function detectIntent(message: string): { intent: AdsIntent; params: Record<string, string> } {
  const msg = message.toLowerCase().trim();
  const params: Record<string, string> = {};

  // Approval patterns
  if (/^(ok|oke|approve|setuju|acc|lanjut|gas)$/i.test(msg)) {
    return { intent: "approve_picks", params: { all: "true" } };
  }
  if (/^(approve|ok|oke)\s+(\d[\d,\s]*)/i.test(msg)) {
    const match = msg.match(/(\d[\d,\s]*)/);
    params.numbers = match?.[1]?.replace(/\s/g, "") || "";
    return { intent: "approve_picks", params };
  }
  if (/^approve\s*(budget)?$/i.test(msg)) {
    return { intent: "approve_budget", params };
  }
  if (/^adjust/i.test(msg)) {
    return { intent: "adjust_budget", params };
  }

  // Action patterns
  if (/\b(pause|stop|hentikan|berhenti)\b/i.test(msg)) {
    return { intent: "pause", params };
  }
  if (/\b(resume|mulai|aktifkan|lanjutkan|start)\b/i.test(msg)) {
    return { intent: "resume", params };
  }

  // Status patterns
  if (/\b(status|gimana|bagaimana|how|performa|performance)\b.*\b(ads?|campaign|iklan)\b/i.test(msg) ||
      /\b(ads?|campaign|iklan)\b.*\b(status|gimana|bagaimana|how|performa)\b/i.test(msg)) {
    return { intent: "status", params };
  }

  // Report patterns
  if (/\b(report|laporan|ringkasan|summary|recap)\b/i.test(msg)) {
    return { intent: "report", params };
  }

  // Strategy patterns
  if (/\b(strateg[iy]|rencana|plan|planning)\b/i.test(msg)) {
    return { intent: "strategy", params };
  }

  // Fix patterns
  if (/\b(fix|perbaiki|optimize|optimalkan|tingkatkan|improve)\b/i.test(msg)) {
    return { intent: "fix", params };
  }

  // Help
  if (/^(help|bantuan|menu|\?)$/i.test(msg)) {
    return { intent: "help", params };
  }

  // Default: general chat with CMO persona
  return { intent: "chat", params };
}

// ─── Intent Handlers ─────────────────────────────────────────────────────────

async function handleStatus(brandId: string): Promise<string> {
  // Get active campaigns
  const { data: campaigns } = await supabase
    .from("gv_ad_campaigns")
    .select("name, platform, status, daily_budget_usd")
    .eq("brand_id", brandId)
    .in("status", ["active", "paused"]);

  // Get today's spend
  const today = new Date().toISOString().split("T")[0];
  const { data: todayPerf } = await supabase
    .from("gv_ad_performance")
    .select("platform, spend_usd, impressions, clicks, ctr, roas")
    .eq("brand_id", brandId)
    .eq("snapshot_date", today);

  // Get pending picks
  const { count: pendingPicks } = await supabase
    .from("gv_ad_content_picks")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("status", "candidate");

  // Get recent alerts
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentAlerts } = await supabase
    .from("gv_ad_analysis")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("analysis_type", "monitor")
    .gte("created_at", oneDayAgo);

  const activeCamps = campaigns?.filter(c => c.status === "active") || [];
  const pausedCamps = campaigns?.filter(c => c.status === "paused") || [];
  const totalSpend = todayPerf?.reduce((s, p) => s + Number(p.spend_usd || 0), 0) || 0;
  const totalImpressions = todayPerf?.reduce((s, p) => s + Number(p.impressions || 0), 0) || 0;

  let msg = `📊 *GeoVera CMO — Ads Status*\n\n`;
  msg += `▸ Active: ${activeCamps.length} campaigns\n`;
  msg += `▸ Paused: ${pausedCamps.length} campaigns\n`;
  msg += `▸ Today spend: $${totalSpend.toFixed(2)}\n`;
  msg += `▸ Impressions: ${totalImpressions.toLocaleString()}\n`;

  if ((recentAlerts || 0) > 0) {
    msg += `\n⚠️ ${recentAlerts} alert(s) dalam 24 jam terakhir`;
  }
  if ((pendingPicks || 0) > 0) {
    msg += `\n📋 ${pendingPicks} content pick menunggu approval`;
  }

  if (activeCamps.length > 0) {
    msg += `\n\n*Active Campaigns:*\n`;
    activeCamps.forEach((c, i) => {
      msg += `${i + 1}. ${c.name} (${c.platform}) — $${c.daily_budget_usd}/day\n`;
    });
  }

  return msg;
}

async function handleApprovePicks(brandId: string, params: Record<string, string>): Promise<string> {
  const { data: picks } = await supabase
    .from("gv_ad_content_picks")
    .select("id, platform, content_preview, ad_potential_score")
    .eq("brand_id", brandId)
    .eq("status", "candidate")
    .order("ad_potential_score", { ascending: false });

  if (!picks?.length) return "Tidak ada content pick yang menunggu approval saat ini.";

  let toApprove = picks;
  if (params.numbers && params.all !== "true") {
    const nums = params.numbers.split(",").map(n => parseInt(n.trim()) - 1);
    toApprove = picks.filter((_, i) => nums.includes(i));
  }

  for (const pick of toApprove) {
    await supabase.from("gv_ad_content_picks").update({ status: "approved" }).eq("id", pick.id);
  }

  return `✅ ${toApprove.length} content pick di-approve!\n\nSystem akan otomatis set budget dan execute sesuai tier kamu.`;
}

async function handleApproveBudget(brandId: string): Promise<string> {
  const { data: budget } = await supabase
    .from("gv_ad_budgets")
    .select("id, total_budget_usd, campaign_allocations")
    .eq("brand_id", brandId)
    .eq("approved", false)
    .gte("period_end", new Date().toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!budget) return "Tidak ada budget plan yang menunggu approval.";

  await supabase.from("gv_ad_budgets").update({
    approved: true,
    approved_at: new Date().toISOString(),
  }).eq("id", budget.id);

  // Trigger execute
  fetch(`${SUPABASE_URL}/functions/v1/ads-execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      brand_id: brandId,
      actions: (budget.campaign_allocations as any[])?.map((a: any) => ({
        type: "create",
        pick_id: a.pick_id,
        budget_usd: a.budget_usd,
        objective: a.objective,
      })) || [],
    }),
  }).catch(() => {});

  return `✅ Budget $${budget.total_budget_usd}/day APPROVED!\n\nCampaign sedang dibuat di platform ads...`;
}

async function handleReport(brandId: string): Promise<string> {
  // Get 7-day summary
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: perf } = await supabase
    .from("gv_ad_performance")
    .select("platform, spend_usd, impressions, clicks, conversions, conversion_value_usd, roas")
    .eq("brand_id", brandId)
    .eq("entity_level", "campaign")
    .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]);

  if (!perf?.length) return "Belum ada data performance ads dalam 7 hari terakhir.";

  const byPlatform: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; convValue: number }> = {};
  for (const p of perf) {
    const key = p.platform;
    if (!byPlatform[key]) byPlatform[key] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0 };
    byPlatform[key].spend += Number(p.spend_usd || 0);
    byPlatform[key].impressions += Number(p.impressions || 0);
    byPlatform[key].clicks += Number(p.clicks || 0);
    byPlatform[key].conversions += Number(p.conversions || 0);
    byPlatform[key].convValue += Number(p.conversion_value_usd || 0);
  }

  let msg = `📈 *GeoVera CMO — 7-Day Ads Report*\n\n`;
  let totalSpend = 0;
  let totalConvValue = 0;

  for (const [platform, stats] of Object.entries(byPlatform)) {
    const roas = stats.spend > 0 ? stats.convValue / stats.spend : 0;
    const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions * 100) : 0;
    msg += `*${platform.toUpperCase()}:*\n`;
    msg += `  Spend: $${stats.spend.toFixed(2)}\n`;
    msg += `  Impressions: ${stats.impressions.toLocaleString()}\n`;
    msg += `  Clicks: ${stats.clicks.toLocaleString()} (CTR: ${ctr.toFixed(2)}%)\n`;
    msg += `  Conversions: ${stats.conversions}\n`;
    msg += `  ROAS: ${roas.toFixed(2)}x\n\n`;
    totalSpend += stats.spend;
    totalConvValue += stats.convValue;
  }

  const overallRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;
  msg += `*TOTAL:* $${totalSpend.toFixed(2)} spend | ${overallRoas.toFixed(2)}x ROAS`;

  return msg;
}

async function handleStrategy(brandId: string): Promise<string> {
  const { data: strategy } = await supabase
    .from("gv_ad_strategy")
    .select("strategy_summary, platform_strategies, kpi_targets, budget_framework, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!strategy) return "Belum ada strategi ads. Strategi akan dibuat otomatis pada siklus 14D berikutnya (pro/enterprise).";

  let msg = `📋 *GeoVera CMO — Strategi Ads Aktif*\n\n`;
  msg += `${strategy.strategy_summary}\n\n`;

  const kpi = strategy.kpi_targets as any;
  if (kpi) {
    msg += `*KPI Targets:*\n`;
    msg += `  ROAS: ${kpi.roas_target || "?"}x\n`;
    msg += `  CPC: $${kpi.cpc_target_usd || "?"}\n`;
    msg += `  CTR: ${kpi.ctr_target_pct || "?"}%\n`;
    msg += `  Daily Spend: $${kpi.daily_spend_target_usd || "?"}\n`;
  }

  const budget = strategy.budget_framework as any;
  if (budget?.platform_split) {
    msg += `\n*Budget Split:*\n`;
    for (const [p, pct] of Object.entries(budget.platform_split)) {
      msg += `  ${p}: ${pct}%\n`;
    }
  }

  return msg;
}

async function handleCMOChat(brandId: string, message: string): Promise<string> {
  const ctx = await getBrandContext(supabase, brandId);
  const brandBlock = buildBrandContextBlock(ctx);
  const quota = await getAdTierQuota(supabase, brandId);

  // Get recent performance for context
  const { data: recentPerf } = await supabase
    .from("gv_ad_performance")
    .select("platform, spend_usd, roas, ctr, impressions")
    .eq("brand_id", brandId)
    .order("snapshot_date", { ascending: false })
    .limit(10);

  // Get ML patterns
  const { data: patterns } = await supabase
    .from("gv_ad_learned_patterns")
    .select("pattern_type, pattern_key, pattern_value")
    .eq("brand_id", brandId)
    .limit(10);

  const system = `Kamu adalah CMO (Chief Marketing Officer) GeoVera — AI persona yang ahli di:
- Meta Ads (Facebook/Instagram) — targeting, creative, ROAS optimization
- TikTok Ads — trend-based ads, UGC, viral campaigns
- Google Ads — search, display, Performance Max, GAQL

${brandBlock}

TIER: ${quota?.tier || "go"} (max $${quota?.max_daily_budget_usd || 10}/hari)

RECENT AD PERFORMANCE:
${JSON.stringify(recentPerf?.slice(0, 5) || [], null, 2)}

ML PATTERNS:
${JSON.stringify(patterns?.slice(0, 5) || [], null, 2)}

Jawab dalam Bahasa Indonesia, singkat dan actionable. Jika user bertanya tentang ads, berikan rekomendasi spesifik berdasarkan data performance dan ML patterns. Jangan generic.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 0.6,
      system,
      messages: [{ role: "user", content: message }],
    }),
  });

  const data = await res.json() as any;
  return data.content?.[0]?.text || "Maaf, tidak bisa memproses pertanyaan saat ini.";
}

function getHelpMessage(): string {
  return `🎯 *GeoVera CMO — Menu Ads*

Perintah yang tersedia:

📊 *"status ads"* — Lihat status campaign
📈 *"report"* — Laporan 7 hari terakhir
📋 *"strategy"* — Strategi ads aktif
🔧 *"fix"* — Diagnosa & perbaiki campaign

✅ *"OK"* — Approve semua content picks
✅ *"OK 1,3"* — Approve pick nomor 1 & 3
✅ *"APPROVE"* — Approve budget plan
⏸ *"pause [nama]"* — Pause campaign
▶️ *"resume [nama]"* — Resume campaign

💬 Atau tanya apapun tentang ads — saya CMO AI kamu!`;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      brand_id: string;
      message: string;
      wa_number?: string;
    };

    if (!body.brand_id || !body.message) {
      return errorResponse("brand_id and message required", 400);
    }

    const { brand_id: brandId, message, wa_number } = body;
    const { intent, params } = detectIntent(message);

    let response: string;

    switch (intent) {
      case "status":
        response = await handleStatus(brandId);
        break;
      case "approve_picks":
        response = await handleApprovePicks(brandId, params);
        break;
      case "approve_budget":
        response = await handleApproveBudget(brandId);
        break;
      case "report":
        response = await handleReport(brandId);
        break;
      case "strategy":
        response = await handleStrategy(brandId);
        break;
      case "fix":
        // Trigger ads-find-fix
        fetch(`${SUPABASE_URL}/functions/v1/ads-find-fix`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ brand_id: brandId }),
        }).catch(() => {});
        response = "🔧 Sedang menganalisis campaign yang perlu diperbaiki... Hasil akan dikirim dalam beberapa menit.";
        break;
      case "pause":
      case "resume":
        response = `⏳ Silakan sebutkan nama campaign yang ingin di-${intent}. Ketik "status ads" untuk melihat daftar campaign.`;
        break;
      case "help":
        response = getHelpMessage();
        break;
      case "chat":
      default:
        response = await handleCMOChat(brandId, message);
        break;
    }

    // Send WA response if wa_number provided
    if (wa_number) {
      await sendAdWA(brandId, wa_number, response);
    }

    return jsonResponse({
      ok: true,
      intent,
      response,
    });
  } catch (err) {
    console.error("[ads-wa-handler] Error:", err);
    return errorResponse("server_error");
  }
});
