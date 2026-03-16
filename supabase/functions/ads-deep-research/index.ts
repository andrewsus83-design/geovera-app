/**
 * ads-deep-research — 14D Deep Ads Market Research
 *
 * Perplexity sonar-pro + Claude Opus for deep competitor/market ads research.
 * Feeds into ads-strategy-14d for strategic planning.
 *
 * Triggered by: ads-loop-orchestrator (every 14D, pro/enterprise only)
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
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callPerplexity(query: string): Promise<{ content: string; tokens: number }> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: "You are a digital advertising research analyst. Provide current, data-driven insights with specific numbers and sources." },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  const data = await res.json() as any;
  return {
    content: data.choices?.[0]?.message?.content || "",
    tokens: data.usage?.total_tokens || 0,
  };
}

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
    const body = await req.json().catch(() => ({})) as { brand_id: string };
    if (!body.brand_id) return errorResponse("brand_id required", 400);

    const brandId = body.brand_id;

    // Check tier
    const quota = await getAdTierQuota(supabase, brandId);
    if (!quota || quota.tier === "go") {
      return jsonResponse({ ok: true, message: "Deep research requires pro or enterprise tier" });
    }

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-deep-research",
      status: "running",
    });
    const startTime = Date.now();
    let totalCost = 0;

    try {
      // 1. Get brand context
      const ctx = await getBrandContext(supabase, brandId);
      const brandName = ctx.brand.brand_name || "Brand";
      const category = ctx.brand.brand_category || "general";
      const country = ctx.brand.brand_country || "Indonesia";

      // 2. Get connected platforms
      const platformKeys = await supabase
        .from("gv_ad_platform_keys")
        .select("platform")
        .eq("brand_id", brandId)
        .eq("status", "active");
      const platforms = (platformKeys.data || []).map((k: any) => k.platform).join(", ") || "meta";

      // 3. Run 5 Perplexity research queries in parallel
      const queries = [
        `What are the top performing ad strategies for ${category} brands on ${platforms} in ${country} in 2026? Include CPM ranges, best-performing ad formats, and audience targeting approaches.`,
        `What are current CPM and CPC benchmarks for ${category} advertising on Meta (Facebook/Instagram), TikTok, and Google in ${country} for Q1 2026?`,
        `What audience targeting strategies and lookalike audience approaches work best for ${category} brands similar to ${brandName}? Include demographic, interest, and behavioral targeting insights.`,
        `What creative formats, ad hooks, and visual styles are trending for ${category} advertising on social media in 2026? Include video ad trends, carousel best practices, and UGC ad performance.`,
        `What are the top ${category} brands' paid advertising strategies in ${country}? Who are the biggest ad spenders and what platforms do they prioritize?`,
      ];

      const perplexityResults = await Promise.allSettled(
        queries.map(q => callPerplexity(q))
      );

      const researchData = perplexityResults.map((r, i) => ({
        query: queries[i],
        result: r.status === "fulfilled" ? r.value.content : "Research failed",
        tokens: r.status === "fulfilled" ? r.value.tokens : 0,
      }));

      // Perplexity cost (sonar-pro: $1/1M tokens)
      const perplexityTokens = researchData.reduce((s, r) => s + r.tokens, 0);
      totalCost += (perplexityTokens * 1) / 1_000_000;

      // 4. Load existing ad performance for context
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: adPerf } = await supabase
        .from("gv_ad_performance")
        .select("platform, spend_usd, roas, cpc_usd, impressions, clicks")
        .eq("brand_id", brandId)
        .gte("snapshot_date", thirtyDaysAgo.toISOString().split("T")[0])
        .limit(50);

      // 5. Claude Opus strategic synthesis
      const system = `You are GeoVera's God Mode Ads Research Strategist. Synthesize deep market research into actionable advertising strategy insights for ${brandName}.

${buildBrandContextBlock(ctx)}

Your synthesis must be data-driven, specific to ${country} market, and actionable.
Consider both organic and paid performance. Identify gaps and opportunities.

Return valid JSON only. No markdown wrapping.`;

      const user = `Synthesize this research into strategic ads insights:

RESEARCH DATA:
${researchData.map((r, i) => `\n--- RESEARCH ${i + 1}: ${queries[i].slice(0, 80)}... ---\n${r.result}`).join("\n")}

EXISTING AD PERFORMANCE (30D):
${JSON.stringify(adPerf?.slice(0, 20) || [], null, 2)}

Return JSON:
{
  "competitor_map": [{ "competitor": "name", "platforms": ["meta"], "strategy": "...", "estimated_spend": "..." }],
  "opportunity_gaps": [{ "gap": "...", "platform": "...", "potential_impact": "high|medium|low", "action": "..." }],
  "creative_directions": [{ "format": "video|carousel|image", "style": "...", "hook_type": "...", "expected_ctr": "..." }],
  "audience_expansions": [{ "audience": "...", "platform": "...", "targeting_method": "...", "expected_roas": "..." }],
  "benchmark_data": { "meta_cpm": "...", "tiktok_cpm": "...", "google_cpc": "...", "category_avg_roas": "..." },
  "seasonal_opportunities": [{ "event": "...", "timing": "...", "recommended_action": "..." }],
  "summary": "high-level research summary"
}`;

      const opusResponse = await callClaudeOpus(system, user);
      const synthesis = parseJSON(opusResponse.content);
      const opusCost = calcClaudeCost(opusResponse.inputTokens, opusResponse.outputTokens, "opus");
      totalCost += opusCost;

      // 6. Store research
      await supabase.from("gv_ad_analysis").insert({
        brand_id: brandId,
        analysis_type: "strategy",
        cycle_id: `research-14d-${new Date().toISOString().split("T")[0]}`,
        summary: synthesis.summary || "14D deep research completed",
        findings: synthesis.competitor_map || [],
        recommendations: synthesis.opportunity_gaps || [],
        patterns_detected: synthesis.creative_directions || [],
        ai_model: "claude-opus-4-20250901 + sonar-pro",
        ai_cost_usd: totalCost,
      });

      // 7. Trigger ads-strategy-14d
      fetch(`${SUPABASE_URL}/functions/v1/ads-strategy-14d`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId }),
      }).catch(() => {});

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: {
            research_queries: queries.length,
            competitors_found: synthesis.competitor_map?.length || 0,
            opportunities: synthesis.opportunity_gaps?.length || 0,
          },
          duration_ms: Date.now() - startTime,
          cost_usd: totalCost,
        });
      }

      return jsonResponse({ ok: true, research: synthesis, cost_usd: totalCost });
    } catch (err) {
      console.error(`[ads-deep-research] ${brandId}:`, err);
      if (logId) {
        await updateAdLoopLog(supabase, logId, { status: "error", error_message: (err as Error).message, duration_ms: Date.now() - startTime });
      }
      return errorResponse((err as Error).message);
    }
  } catch (err) {
    console.error("[ads-deep-research] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
