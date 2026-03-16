/**
 * ads-strategy-14d — Biweekly Ads Strategy Generator
 *
 * Claude Opus creates comprehensive 14-day advertising strategy
 * combining deep research + ML patterns + performance data + god-mode directive.
 *
 * Triggered by: ads-deep-research (after completion) or ads-loop-orchestrator
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callClaudeOpus(system: string, user: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250901",
      max_tokens: 4096,
      temperature: 0.4,
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
  try { return JSON.parse(cleaned); } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id: string };
    if (!body.brand_id) return errorResponse("brand_id required", 400);

    const brandId = body.brand_id;

    // Check tier
    const quota = await getAdTierQuota(supabase, brandId);
    if (!quota || quota.tier === "go") {
      return jsonResponse({ ok: true, message: "14D strategy requires pro or enterprise tier" });
    }

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-strategy-14d",
      status: "running",
    });
    const startTime = Date.now();

    try {
      // 1. Load deep research results
      const { data: research } = await supabase
        .from("gv_ad_analysis")
        .select("findings, recommendations, patterns_detected, summary")
        .eq("brand_id", brandId)
        .eq("analysis_type", "strategy")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Load 14D ad performance
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: adPerf } = await supabase
        .from("gv_ad_performance")
        .select("platform, spend_usd, roas, cpc_usd, cpm_usd, impressions, clicks, conversions, conversion_value_usd")
        .eq("brand_id", brandId)
        .eq("entity_level", "campaign")
        .gte("snapshot_date", fourteenDaysAgo.toISOString().split("T")[0]);

      // Aggregate 14D performance by platform
      const perfByPlatform: Record<string, any> = {};
      for (const p of adPerf || []) {
        const key = p.platform;
        if (!perfByPlatform[key]) perfByPlatform[key] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conv_value: 0, count: 0 };
        perfByPlatform[key].spend += Number(p.spend_usd || 0);
        perfByPlatform[key].impressions += Number(p.impressions || 0);
        perfByPlatform[key].clicks += Number(p.clicks || 0);
        perfByPlatform[key].conversions += Number(p.conversions || 0);
        perfByPlatform[key].conv_value += Number(p.conversion_value_usd || 0);
        perfByPlatform[key].count++;
      }

      // 3. Load ML patterns
      const { data: patterns } = await supabase
        .from("gv_ad_learned_patterns")
        .select("pattern_type, pattern_key, pattern_value, confidence")
        .eq("brand_id", brandId);

      // 4. Load organic analytics aggregate
      const { data: organicData } = await supabase
        .from("gv_social_analytics")
        .select("platform, overall_score")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(30);

      // 5. Load god-mode-14d directive (optional)
      const { data: directive } = await supabase
        .from("directive_14d")
        .select("directive_json")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 6. Get brand context
      const ctx = await getBrandContext(supabase, brandId);
      const brandBlock = buildBrandContextBlock(ctx);
      const brandName = ctx.brand.brand_name || "Brand";

      // 7. Call Claude Opus
      const system = `You are the GeoVera Ads Strategy Architect — God Mode level.
Create a comprehensive 14-day advertising strategy that maximizes ROAS while aligning with brand identity and market conditions.

${brandBlock}

TIER: ${quota.tier} (max $${quota.max_daily_budget_usd}/day, platforms: ${quota.platforms_allowed.join(", ")})

Your strategy must be:
1. Data-driven — based on actual performance metrics, not assumptions
2. Platform-specific — leverage each platform's unique strengths and audience behavior
3. Brand-aligned — consistent with brand DNA, voice, and strategic position
4. Actionable — every recommendation must be specific and executable
5. Budget-efficient — maximize ROAS within tier constraints

Return valid JSON only. No markdown wrapping.`;

      const user = `Create a 14-day ads strategy for ${brandName}:

DEEP RESEARCH INSIGHTS:
${JSON.stringify(research || {}, null, 2)}

14-DAY AD PERFORMANCE BY PLATFORM:
${JSON.stringify(perfByPlatform, null, 2)}

ML LEARNED PATTERNS (${patterns?.length || 0} patterns):
${JSON.stringify(patterns || [], null, 2)}

ORGANIC PERFORMANCE (avg GV scores by platform):
${JSON.stringify(organicData?.slice(0, 15) || [], null, 2)}

${directive ? `GOD MODE 14D DIRECTIVE:\n${JSON.stringify(directive.directive_json, null, 2)}` : ""}

Return JSON:
{
  "strategy_summary": "executive summary of the 14-day strategy",
  "platform_strategies": {
    "meta": { "focus": "...", "budget_pct": 40, "objective": "...", "creative_format": "...", "audience": "...", "schedule": "..." },
    "tiktok": { "focus": "...", "budget_pct": 35, "objective": "...", "creative_format": "...", "audience": "...", "schedule": "..." },
    "google": { "focus": "...", "budget_pct": 25, "objective": "...", "creative_format": "...", "audience": "...", "schedule": "..." }
  },
  "budget_framework": {
    "daily_total_usd": number,
    "platform_split": { "meta": %, "tiktok": %, "google": % },
    "scaling_rules": "when to increase/decrease spend",
    "safety_nets": "conditions to pause spending"
  },
  "audience_insights": {
    "primary": { "description": "...", "size_estimate": "...", "platform": "..." },
    "secondary": { "description": "...", "size_estimate": "...", "platform": "..." },
    "lookalike_suggestions": ["..."]
  },
  "creative_direction": {
    "formats": ["video", "carousel", "image"],
    "hooks": ["hook template 1", "hook template 2"],
    "cta_styles": ["..."],
    "visual_themes": ["..."]
  },
  "competitor_analysis": {
    "threats": ["..."],
    "opportunities": ["..."]
  },
  "kpi_targets": {
    "roas_target": number,
    "cpc_target_usd": number,
    "ctr_target_pct": number,
    "conversion_target": number,
    "daily_spend_target_usd": number
  },
  "week1_actions": ["specific action 1", "action 2"],
  "week2_actions": ["specific action 1", "action 2"]
}`;

      const response = await callClaudeOpus(system, user);
      const strategy = parseJSON(response.content);
      const cost = calcClaudeCost(response.inputTokens, response.outputTokens, "opus");

      // 8. Store strategy
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 14);

      await supabase.from("gv_ad_strategy").insert({
        brand_id: brandId,
        directive_id: `14d-${brandId}-${now.toISOString().split("T")[0]}`,
        period_start: now.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        strategy_summary: strategy.strategy_summary || "",
        platform_strategies: strategy.platform_strategies || {},
        budget_framework: strategy.budget_framework || {},
        audience_insights: strategy.audience_insights || {},
        creative_direction: strategy.creative_direction || {},
        competitor_analysis: strategy.competitor_analysis || {},
        kpi_targets: strategy.kpi_targets || {},
        ai_model: "claude-opus-4-20250901",
        ai_cost_usd: cost,
      });

      // 9. WA summary
      const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
      if (brand?.wa_number) {
        await sendAdWA(brandId, brand.wa_number,
          `📋 *GeoVera Ads — Strategi 14 Hari Baru*\n\n${strategy.strategy_summary || "Strategi baru telah dibuat"}\n\n💰 Budget: $${strategy.budget_framework?.daily_total_usd || "?"}/hari\n🎯 Target ROAS: ${strategy.kpi_targets?.roas_target || "?"}\n\nMinggu 1:\n${(strategy.week1_actions || []).slice(0, 3).map((a: string) => `• ${a}`).join("\n")}`
        );
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: {
            platforms_covered: Object.keys(strategy.platform_strategies || {}).length,
            daily_budget: strategy.budget_framework?.daily_total_usd,
            roas_target: strategy.kpi_targets?.roas_target,
          },
          duration_ms: Date.now() - startTime,
          cost_usd: cost,
        });
      }

      return jsonResponse({ ok: true, strategy, cost_usd: cost });
    } catch (err) {
      console.error(`[ads-strategy-14d] ${brandId}:`, err);
      if (logId) {
        await updateAdLoopLog(supabase, logId, { status: "error", error_message: (err as Error).message, duration_ms: Date.now() - startTime });
      }
      return errorResponse((err as Error).message);
    }
  } catch (err) {
    console.error("[ads-strategy-14d] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
