/**
 * ads-find-fix — Ad Diagnostics & Auto-Fix Engine
 *
 * Diagnoses underperforming ads, suggests fixes, auto-executes for enterprise.
 * Uses Claude Sonnet with God Mode prompt engineering for platform-specific fixes.
 *
 * Triggered by: ads-monitor (critical alerts) + ads-loop-orchestrator (every 12H)
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getAdTierQuota,
  logAdLoop,
  updateAdLoopLog,
  sendAdWA,
  calcClaudeCost,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";
import { getBrandContext, buildBrandContextBlock } from "../_shared/brandContext.ts";
import { buildAdAnalysisPrompt, type PromptContext } from "../_shared/adPromptEngineer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callClaude(system: string, user: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json() as any;
  return {
    content: data.content?.[0]?.text || "{}",
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

function parseJSON(text: string): any {
  const cleaned = text.replace(/```json?\n?/g, "").replace(/\n?```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { return { fixes: [] }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id: string; alert_ids?: string[] };
    if (!body.brand_id) return errorResponse("brand_id required", 400);

    const brandId = body.brand_id;

    // Check tier (pro/enterprise only)
    const quota = await getAdTierQuota(supabase, brandId);
    if (!quota || quota.tier === "go") {
      return jsonResponse({ ok: true, message: "Find-fix requires pro or enterprise tier", fixes: [] });
    }

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-find-fix",
      status: "running",
    });
    const startTime = Date.now();

    try {
      // 1. Load recent monitor alerts (last 24h)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data: alerts } = await supabase
        .from("gv_ad_analysis")
        .select("findings, score")
        .eq("brand_id", brandId)
        .eq("analysis_type", "monitor")
        .gte("created_at", oneDayAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      // 2. Load underperforming campaigns (ROAS < 1.0 or no conversions)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: underperformers } = await supabase
        .from("gv_ad_performance")
        .select("*, gv_ad_campaigns!inner(id, name, platform, objective, daily_budget_usd)")
        .eq("brand_id", brandId)
        .eq("entity_level", "campaign")
        .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]);

      // Group by campaign and find underperformers
      const campaignMetrics: Record<string, any> = {};
      for (const row of underperformers || []) {
        const cId = row.gv_ad_campaigns?.id;
        if (!cId) continue;
        if (!campaignMetrics[cId]) {
          campaignMetrics[cId] = {
            campaign: row.gv_ad_campaigns,
            total_spend: 0,
            total_clicks: 0,
            total_impressions: 0,
            total_conversions: 0,
            total_conv_value: 0,
            days: 0,
          };
        }
        campaignMetrics[cId].total_spend += Number(row.spend_usd || 0);
        campaignMetrics[cId].total_clicks += Number(row.clicks || 0);
        campaignMetrics[cId].total_impressions += Number(row.impressions || 0);
        campaignMetrics[cId].total_conversions += Number(row.conversions || 0);
        campaignMetrics[cId].total_conv_value += Number(row.conversion_value_usd || 0);
        campaignMetrics[cId].days++;
      }

      const problemCampaigns = Object.values(campaignMetrics).filter((c: any) => {
        const roas = c.total_spend > 0 ? c.total_conv_value / c.total_spend : 0;
        const ctr = c.total_impressions > 0 ? c.total_clicks / c.total_impressions : 0;
        return roas < 1.0 || ctr < 0.005 || c.total_spend > 10 && c.total_conversions === 0;
      });

      if (problemCampaigns.length === 0 && (!alerts || alerts.length === 0)) {
        if (logId) await updateAdLoopLog(supabase, logId, { status: "skipped", output_summary: { reason: "No issues found" } });
        return jsonResponse({ ok: true, message: "All campaigns performing well", fixes: [] });
      }

      // 3. Load ML patterns
      const { data: patterns } = await supabase
        .from("gv_ad_learned_patterns")
        .select("pattern_type, pattern_key, pattern_value, confidence")
        .eq("brand_id", brandId);

      // 4. Get brand context
      const ctx = await getBrandContext(supabase, brandId);

      // 5. Build prompt and call Claude
      const promptCtx: PromptContext = {
        brand: ctx,
        objective: "conversions",
        platform: "meta",
        contentFormat: "article",
        topic: "Ad fix diagnosis",
        learnedPatterns: patterns ? Object.fromEntries(patterns.map((p: any) => [p.pattern_key, p.pattern_value])) : {},
      };

      const prompt = buildAdAnalysisPrompt(promptCtx, {
        monitor_alerts: (alerts || []).flatMap((a: any) => a.findings || []),
        underperforming_campaigns: problemCampaigns,
        learned_patterns: patterns || [],
      }, "fix");

      const response = await callClaude(prompt.systemPrompt, prompt.userPrompt);
      const result = parseJSON(response.content);
      const cost = calcClaudeCost(response.inputTokens, response.outputTokens);

      // 6. Store fixes
      await supabase.from("gv_ad_analysis").insert({
        brand_id: brandId,
        analysis_type: "fix",
        summary: `${result.fixes?.length || 0} fixes suggested for ${problemCampaigns.length} underperforming campaigns`,
        findings: result.fixes || [],
        recommendations: result.fixes?.filter((f: any) => f.priority === "critical") || [],
        ai_model: "claude-sonnet-4-20250514",
        ai_cost_usd: cost,
      });

      // 7. Enterprise auto-execute critical fixes
      if (quota.auto_execute && result.fixes?.length > 0) {
        const autoActions = result.fixes
          .filter((f: any) => f.fix_type === "pause" && f.confidence > 0.7)
          .map((f: any) => ({
            type: "pause" as const,
            campaign_id: f.campaign_id,
          }));

        if (autoActions.length > 0) {
          fetch(`${SUPABASE_URL}/functions/v1/ads-execute`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ brand_id: brandId, actions: autoActions }),
          }).catch(() => {});
        }
      }

      // 8. WA notification
      const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
      if (brand?.wa_number && result.fixes?.length > 0) {
        const fixSummary = (result.fixes || [])
          .slice(0, 5)
          .map((f: any, i: number) => `${i + 1}. [${f.priority}] ${f.campaign_id ? f.campaign_id.slice(0, 8) : "N/A"}: ${f.diagnosis}\n   Fix: ${f.specific_action}`)
          .join("\n\n");

        await sendAdWA(brandId, brand.wa_number,
          `🔧 *GeoVera Ads — Fix Suggestions*\n\n${result.fixes.length} masalah ditemukan:\n\n${fixSummary}${quota.auto_execute ? "\n\n⚡ Fix kritis sudah dieksekusi otomatis." : "\n\nBalas nomor fix untuk eksekusi."}`
        );
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: {
            problems_found: problemCampaigns.length,
            fixes_suggested: result.fixes?.length || 0,
            auto_executed: quota.auto_execute ? result.fixes?.filter((f: any) => f.fix_type === "pause").length : 0,
          },
          duration_ms: Date.now() - startTime,
          cost_usd: cost,
        });
      }

      return jsonResponse({ ok: true, fixes: result.fixes || [], cost_usd: cost });
    } catch (err) {
      console.error(`[ads-find-fix] ${brandId}:`, err);
      if (logId) {
        await updateAdLoopLog(supabase, logId, { status: "error", error_message: (err as Error).message, duration_ms: Date.now() - startTime });
      }
      return errorResponse((err as Error).message);
    }
  } catch (err) {
    console.error("[ads-find-fix] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
