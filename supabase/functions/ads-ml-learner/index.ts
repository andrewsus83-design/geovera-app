/**
 * ads-ml-learner — ML Pattern Extraction from Ad + Organic Performance
 *
 * Correlates organic GV scores (from Late API) with ad ROAS to learn
 * what makes successful ads. Extracts patterns for future optimization.
 *
 * Triggered by: ads-loop-orchestrator (daily, pro/enterprise only)
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getAdTierQuota,
  logAdLoop,
  updateAdLoopLog,
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
  try { return JSON.parse(cleaned); } catch { return { patterns: [] }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id?: string };

    // Get brands with ad data (pro/enterprise only)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let brandQuery = supabase
      .from("gv_ad_performance")
      .select("brand_id")
      .gte("snapshot_date", thirtyDaysAgo.toISOString().split("T")[0]);
    if (body.brand_id) brandQuery = brandQuery.eq("brand_id", body.brand_id);

    const { data: brandRows } = await brandQuery;
    if (!brandRows?.length) {
      return jsonResponse({ ok: true, message: "No ad data for ML learning", brands_processed: 0 });
    }

    const brandIds = Array.from(new Set(brandRows.map((r: any) => r.brand_id)));
    const results: Array<{ brand_id: string; patterns_updated: number; cost_usd: number }> = [];

    for (const brandId of brandIds) {
      // Check tier (pro/enterprise only)
      const quota = await getAdTierQuota(supabase, brandId);
      if (!quota || quota.tier === "go") continue;

      const logId = await logAdLoop(supabase, {
        brand_id: brandId,
        function_name: "ads-ml-learner",
        status: "running",
      });
      const startTime = Date.now();

      try {
        // 1. Load 30D ad performance
        const { data: adPerf } = await supabase
          .from("gv_ad_performance")
          .select("*, gv_ad_campaigns!inner(name, platform, objective, source_late_post_id)")
          .eq("brand_id", brandId)
          .gte("snapshot_date", thirtyDaysAgo.toISOString().split("T")[0])
          .order("snapshot_date", { ascending: false });

        // 2. Load organic analytics (GV scores)
        const { data: organicScores } = await supabase
          .from("gv_social_analytics")
          .select("late_post_id, platform, overall_score, factor_scores")
          .eq("brand_id", brandId)
          .order("created_at", { ascending: false })
          .limit(50);

        // 3. Load promoted content picks (organic→ad correlation)
        const { data: promotedPicks } = await supabase
          .from("gv_ad_content_picks")
          .select("late_post_id, platform, gv_overall_score, organic_reach, organic_likes, organic_shares, ad_potential_score")
          .eq("brand_id", brandId)
          .eq("status", "promoted");

        // 4. Cross-reference: for promoted posts, find ad ROAS
        const crossRef: any[] = [];
        if (promotedPicks?.length && adPerf?.length) {
          for (const pick of promotedPicks) {
            const adData = adPerf.filter((p: any) =>
              p.gv_ad_campaigns?.source_late_post_id === pick.late_post_id
            );
            if (adData.length > 0) {
              const totalSpend = adData.reduce((s: number, d: any) => s + Number(d.spend_usd || 0), 0);
              const totalConvValue = adData.reduce((s: number, d: any) => s + Number(d.conversion_value_usd || 0), 0);
              crossRef.push({
                late_post_id: pick.late_post_id,
                platform: pick.platform,
                gv_score: pick.gv_overall_score,
                organic_reach: pick.organic_reach,
                ad_spend: totalSpend,
                ad_roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
              });
            }
          }
        }

        // 5. Get brand context
        const ctx = await getBrandContext(supabase, brandId);

        // 6. Call Claude for pattern extraction
        const system = `You are GeoVera's ML Pattern Analyst — God Mode level. Extract actionable patterns from advertising + organic performance data.

${buildBrandContextBlock(ctx)}

PATTERN TYPES TO EXTRACT:
1. audience_affinity — which demographics/interests convert best
2. creative_performance — image vs video, hook types, CTA effectiveness
3. time_optimization — best days/hours for each platform
4. budget_efficiency — optimal daily spend thresholds per platform
5. platform_preference — which platform delivers best ROAS for this brand
6. organic_to_ad — correlation between organic GV score and ad performance

For each pattern, assess confidence (0.0-1.0) based on sample size and consistency.
Higher sample size + consistent results = higher confidence.

Return valid JSON only. No markdown wrapping.`;

        const user = `Extract ML patterns from this data:

AD PERFORMANCE (30 days, ${adPerf?.length || 0} snapshots):
${JSON.stringify((adPerf || []).slice(0, 30), null, 2)}

ORGANIC SCORES (GV Social Analytics, ${organicScores?.length || 0} posts):
${JSON.stringify((organicScores || []).slice(0, 20), null, 2)}

ORGANIC → AD CORRELATION (${crossRef.length} promoted posts):
${JSON.stringify(crossRef, null, 2)}

Return JSON:
{
  "patterns": [
    {
      "type": "audience_affinity|creative_performance|time_optimization|budget_efficiency|platform_preference|organic_to_ad",
      "key": "descriptive_key_name",
      "value": { "insight": "...", "data_points": [...], "recommendation": "..." },
      "confidence": 0.0-1.0,
      "sample_size": number
    }
  ],
  "summary": "high-level learning summary"
}`;

        const response = await callClaude(system, user);
        const result = parseJSON(response.content);
        const cost = calcClaudeCost(response.inputTokens, response.outputTokens);

        // 7. UPSERT patterns
        let patternsUpdated = 0;
        for (const p of result.patterns || []) {
          await supabase
            .from("gv_ad_learned_patterns")
            .upsert({
              brand_id: brandId,
              pattern_type: p.type,
              pattern_key: p.key,
              pattern_value: p.value,
              confidence: p.confidence || 0.5,
              sample_size: p.sample_size || 0,
              last_updated: new Date().toISOString(),
            }, { onConflict: "brand_id,pattern_type,pattern_key" });
          patternsUpdated++;
        }

        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "success",
            output_summary: {
              patterns_updated: patternsUpdated,
              cross_ref_count: crossRef.length,
              summary: result.summary,
            },
            duration_ms: Date.now() - startTime,
            cost_usd: cost,
          });
        }

        results.push({ brand_id: brandId, patterns_updated: patternsUpdated, cost_usd: cost });
      } catch (err) {
        console.error(`[ads-ml-learner] ${brandId}:`, err);
        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "error",
            error_message: (err as Error).message,
            duration_ms: Date.now() - startTime,
          });
        }
      }
    }

    return jsonResponse({ ok: true, brands_processed: results.length, results });
  } catch (err) {
    console.error("[ads-ml-learner] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
