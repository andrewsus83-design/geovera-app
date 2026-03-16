/**
 * ads-analyze-history — AI-Powered Ad Performance Analysis
 *
 * Claude Sonnet analyzes 14D of ad performance data, identifies patterns,
 * winners/losers, and generates actionable insights.
 *
 * Triggered by: ads-loop-orchestrator (daily, after ads-scrape-history)
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  logAdLoop,
  updateAdLoopLog,
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
      max_tokens: 4000,
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
    const body = await req.json().catch(() => ({})) as { brand_id?: string };

    // Find brands with recent ad performance data
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    let brandQuery = supabase
      .from("gv_ad_performance")
      .select("brand_id")
      .gte("snapshot_date", fourteenDaysAgo.toISOString().split("T")[0]);
    if (body.brand_id) brandQuery = brandQuery.eq("brand_id", body.brand_id);

    const { data: brandRows } = await brandQuery;
    if (!brandRows?.length) {
      return jsonResponse({ ok: true, message: "No performance data to analyze", brands_processed: 0 });
    }

    const brandIds = Array.from(new Set(brandRows.map((r: any) => r.brand_id)));
    const results: Array<{ brand_id: string; insights: number; cost_usd: number }> = [];

    for (const brandId of brandIds) {
      const logId = await logAdLoop(supabase, {
        brand_id: brandId,
        function_name: "ads-analyze-history",
        status: "running",
      });
      const startTime = Date.now();

      try {
        // 1. Load 14D performance grouped by campaign
        const { data: perfData } = await supabase
          .from("gv_ad_performance")
          .select("*, gv_ad_campaigns!inner(name, objective, platform)")
          .eq("brand_id", brandId)
          .gte("snapshot_date", fourteenDaysAgo.toISOString().split("T")[0])
          .order("snapshot_date", { ascending: false });

        if (!perfData?.length) continue;

        // 2. Load learned patterns
        const { data: patterns } = await supabase
          .from("gv_ad_learned_patterns")
          .select("pattern_type, pattern_key, pattern_value, confidence")
          .eq("brand_id", brandId);

        // 3. Get brand context
        const ctx = await getBrandContext(supabase, brandId);
        const brandBlock = buildBrandContextBlock(ctx);

        // 4. Build prompt context
        const promptCtx: PromptContext = {
          brand: ctx,
          objective: "conversions",
          platform: "meta",
          contentFormat: "article",
          topic: "Ad performance analysis",
          learnedPatterns: patterns ? Object.fromEntries(patterns.map((p: any) => [p.pattern_key, p.pattern_value])) : {},
        };

        // 5. Build analysis prompt
        const prompt = buildAdAnalysisPrompt(promptCtx, {
          performance_data: perfData,
          brand_context: brandBlock,
          existing_patterns: patterns || [],
          analysis_period: `${fourteenDaysAgo.toISOString().split("T")[0]} to ${new Date().toISOString().split("T")[0]}`,
        }, "history");

        // 6. Call Claude
        const response = await callClaude(prompt.systemPrompt, prompt.userPrompt);
        const analysis = parseJSON(response.content);
        const cost = calcClaudeCost(response.inputTokens, response.outputTokens);

        // 7. Store analysis
        await supabase.from("gv_ad_analysis").insert({
          brand_id: brandId,
          analysis_type: "history",
          summary: analysis.summary || `14D analysis: ${analysis.winners?.length || 0} winners, ${analysis.losers?.length || 0} losers`,
          findings: analysis.winners || [],
          recommendations: analysis.trends || [],
          patterns_detected: analysis.creative_patterns || [],
          score: analysis.overall_health_score || null,
          ai_model: "claude-sonnet-4-20250514",
          ai_cost_usd: cost,
        });

        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "success",
            output_summary: {
              campaigns_analyzed: perfData.length,
              health_score: analysis.overall_health_score,
              winners: analysis.winners?.length || 0,
              losers: analysis.losers?.length || 0,
            },
            duration_ms: Date.now() - startTime,
            cost_usd: cost,
          });
        }

        results.push({ brand_id: brandId, insights: 1, cost_usd: cost });
      } catch (err) {
        console.error(`[ads-analyze-history] ${brandId}:`, err);
        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "error",
            error_message: (err as Error).message,
            duration_ms: Date.now() - startTime,
          });
        }
      }
    }

    return jsonResponse({
      ok: true,
      brands_processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[ads-analyze-history] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
