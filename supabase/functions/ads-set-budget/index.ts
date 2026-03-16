/**
 * ads-set-budget — AI Budget Allocation Engine
 *
 * Claude Sonnet allocates advertising budget across platforms and campaigns
 * based on historical ROAS, ML patterns, and tier constraints.
 *
 * Triggered by: ads-loop-orchestrator (every 72H, after ads-pick-content)
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
      max_tokens: 2500,
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
    const body = await req.json().catch(() => ({})) as { brand_id: string; cycle_id?: string };
    if (!body.brand_id) return errorResponse("brand_id required", 400);

    const brandId = body.brand_id;
    const cycleId = body.cycle_id || `budget-${brandId}-${new Date().toISOString().split("T")[0]}`;

    // 1. Get tier quota
    const quota = await getAdTierQuota(supabase, brandId);
    if (!quota) return errorResponse("Brand tier not found", 404);

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-set-budget",
      status: "running",
      cycle_id: cycleId,
    });
    const startTime = Date.now();

    try {
      // 2. Load 30D ROAS/CPC/CPM per platform
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: perfData } = await supabase
        .from("gv_ad_performance")
        .select("platform, spend_usd, roas, cpc_usd, cpm_usd, impressions, clicks, conversions")
        .eq("brand_id", brandId)
        .eq("entity_level", "campaign")
        .gte("snapshot_date", thirtyDaysAgo.toISOString().split("T")[0]);

      // Aggregate by platform
      const platformStats: Record<string, { spend: number; roas_sum: number; cpc_sum: number; count: number }> = {};
      for (const p of perfData || []) {
        const key = p.platform;
        if (!platformStats[key]) platformStats[key] = { spend: 0, roas_sum: 0, cpc_sum: 0, count: 0 };
        platformStats[key].spend += Number(p.spend_usd || 0);
        platformStats[key].roas_sum += Number(p.roas || 0);
        platformStats[key].cpc_sum += Number(p.cpc_usd || 0);
        platformStats[key].count++;
      }

      const platformAvgs = Object.fromEntries(
        Object.entries(platformStats).map(([k, v]) => [k, {
          avg_roas: v.count > 0 ? v.roas_sum / v.count : 0,
          avg_cpc: v.count > 0 ? v.cpc_sum / v.count : 0,
          total_spend: v.spend,
          data_points: v.count,
        }])
      );

      // 3. Load ML patterns
      const { data: patterns } = await supabase
        .from("gv_ad_learned_patterns")
        .select("pattern_type, pattern_key, pattern_value, confidence")
        .eq("brand_id", brandId)
        .in("pattern_type", ["budget_efficiency", "platform_preference"]);

      // 4. Load content picks
      const { data: picks } = await supabase
        .from("gv_ad_content_picks")
        .select("id, platform, ad_potential_score, recommended_objective, recommended_budget_usd, content_preview")
        .eq("brand_id", brandId)
        .in("status", ["candidate", "approved"])
        .order("ad_potential_score", { ascending: false });

      // 5. Get brand context
      const ctx = await getBrandContext(supabase, brandId);

      // 6. Call Claude for budget allocation
      const system = `You are GeoVera's AI Budget Optimizer — God Mode level. Allocate advertising budget to maximize ROAS within tier constraints.

${buildBrandContextBlock(ctx)}

TIER CONSTRAINTS:
- Max daily budget: $${quota.max_daily_budget_usd}
- Max monthly budget: $${quota.max_monthly_budget_usd}
- Allowed platforms: ${quota.platforms_allowed.join(", ")}
- Max campaigns: ${quota.max_campaigns}

Optimize for maximum ROAS. Favor platforms with proven performance.
Be conservative with unproven platforms. Consider seasonality and trends.

Return valid JSON only. No markdown wrapping.`;

      const user = `Allocate budget based on this data:

PLATFORM PERFORMANCE (30 days):
${JSON.stringify(platformAvgs, null, 2)}

ML PATTERNS:
${JSON.stringify(patterns || [], null, 2)}

CONTENT PICKS TO PROMOTE (${picks?.length || 0} candidates):
${JSON.stringify((picks || []).slice(0, 10), null, 2)}

Return JSON:
{
  "total_budget_usd": number (within daily limit),
  "platform_allocations": { "meta": percentage, "tiktok": percentage, "google": percentage },
  "campaign_allocations": [
    {
      "pick_id": "uuid",
      "platform": "meta|tiktok|google",
      "budget_usd": number,
      "objective": "awareness|traffic|conversions",
      "reasoning": "why this allocation"
    }
  ],
  "allocation_strategy": "performance_weighted|equal|aggressive_test",
  "reasoning": "overall budget reasoning"
}`;

      const response = await callClaude(system, user);
      const allocation = parseJSON(response.content);
      const cost = calcClaudeCost(response.inputTokens, response.outputTokens);

      // Enforce tier limits
      if (allocation.total_budget_usd > quota.max_daily_budget_usd) {
        allocation.total_budget_usd = quota.max_daily_budget_usd;
      }

      // 7. Store budget
      const isAutoApproved = quota.auto_execute;
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 3); // 72H period

      await supabase.from("gv_ad_budgets").insert({
        brand_id: brandId,
        cycle_id: cycleId,
        period_start: now.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        total_budget_usd: allocation.total_budget_usd || quota.max_daily_budget_usd,
        platform_allocations: allocation.platform_allocations || {},
        campaign_allocations: allocation.campaign_allocations || [],
        allocation_strategy: allocation.allocation_strategy || "performance_weighted",
        ai_reasoning: allocation.reasoning || "",
        approved: isAutoApproved,
        approved_at: isAutoApproved ? now.toISOString() : null,
      });

      // 8. If auto-approved (enterprise), trigger execute
      if (isAutoApproved && allocation.campaign_allocations?.length > 0) {
        fetch(`${SUPABASE_URL}/functions/v1/ads-execute`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: brandId,
            actions: allocation.campaign_allocations.map((a: any) => ({
              type: "create",
              pick_id: a.pick_id,
              budget_usd: a.budget_usd,
              objective: a.objective,
            })),
          }),
        }).catch(() => {});
      }

      // 9. WA notification for non-auto tiers
      if (!isAutoApproved) {
        const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
        if (brand?.wa_number) {
          const allocSummary = (allocation.campaign_allocations || [])
            .map((a: any, i: number) => `${i + 1}. ${a.platform} — $${a.budget_usd} (${a.objective})`)
            .join("\n");

          await sendAdWA(brandId, brand.wa_number,
            `💰 *GeoVera Ads — Budget Plan*\n\nTotal: $${allocation.total_budget_usd}/hari\nStrategi: ${allocation.allocation_strategy}\n\n${allocSummary}\n\nBalas "APPROVE" untuk aktivasi atau "ADJUST" untuk ubah.`
          );
        }
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: {
            total_budget: allocation.total_budget_usd,
            platforms: allocation.platform_allocations,
            campaigns: allocation.campaign_allocations?.length || 0,
            auto_approved: isAutoApproved,
          },
          duration_ms: Date.now() - startTime,
          cost_usd: cost,
        });
      }

      return jsonResponse({
        ok: true,
        budget: allocation,
        auto_approved: isAutoApproved,
        cost_usd: cost,
      });
    } catch (err) {
      console.error(`[ads-set-budget] ${brandId}:`, err);
      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "error",
          error_message: (err as Error).message,
          duration_ms: Date.now() - startTime,
        });
      }
      return errorResponse((err as Error).message);
    }
  } catch (err) {
    console.error("[ads-set-budget] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
