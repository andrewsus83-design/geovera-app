/**
 * ads-pick-content — Organic → Ad Content Selector (Late API Integration)
 *
 * Cross-references Late API organic performance with gv_social_analytics
 * to identify high-performing content worth promoting as ads.
 *
 * PRIMARY Late API integration point for the ads loop.
 *
 * Triggered by: ads-loop-orchestrator (every 72H)
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
  fetchLatePostAnalytics,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";
import { getBrandContext, buildBrandContextBlock } from "../_shared/brandContext.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface PostWithMetrics {
  late_post_id: string;
  platform: string;
  post_url: string;
  content_preview: string;
  // Late API analytics
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_retention: number;
  ctr: number;
  // GV Score
  gv_overall_score: number;
  gv_factor_scores: any;
  // Computed
  engagement_score: number;
  composite_score: number;
}

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
      max_tokens: 2000,
      temperature: 0.5,
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

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1);
  return values.map(v => v / max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id: string };
    if (!body.brand_id) return errorResponse("brand_id required", 400);

    const brandId = body.brand_id;

    // 1. Get tier quota
    const quota = await getAdTierQuota(supabase, brandId);
    const maxPicks = quota?.picks_per_cycle || 2;

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-pick-content",
      status: "running",
    });
    const startTime = Date.now();
    let totalCost = 0;

    try {
      // 2. Fetch published posts from last 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: posts } = await supabase
        .from("social_publish_log")
        .select("late_post_id, platform, post_url, content_preview, created_at")
        .eq("brand_id", brandId)
        .not("late_post_id", "is", null)
        .gte("created_at", fourteenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (!posts?.length) {
        if (logId) await updateAdLoopLog(supabase, logId, { status: "skipped", output_summary: { reason: "No published posts in last 14 days" } });
        return jsonResponse({ ok: true, message: "No published posts to analyze", picks: [] });
      }

      // 3. Fetch Late API analytics + GV scores for each post
      const postsWithMetrics: PostWithMetrics[] = [];

      const metricsTasks = posts.map(async (post: any) => {
        // Late API analytics
        const analytics = await fetchLatePostAnalytics(post.late_post_id);
        if (!analytics) return; // Skip posts without analytics

        // GV social analytics score
        const { data: gvData } = await supabase
          .from("gv_social_analytics")
          .select("overall_score, factor_scores")
          .eq("brand_id", brandId)
          .eq("late_post_id", post.late_post_id)
          .maybeSingle();

        const engagement = analytics.likes + (analytics.comments * 3) + (analytics.shares * 5) + (analytics.saves * 2);

        postsWithMetrics.push({
          late_post_id: post.late_post_id,
          platform: post.platform,
          post_url: post.post_url || "",
          content_preview: post.content_preview || "",
          reach: analytics.reach,
          likes: analytics.likes,
          comments: analytics.comments,
          shares: analytics.shares,
          saves: analytics.saves,
          watch_retention: analytics.watch_retention,
          ctr: analytics.ctr,
          gv_overall_score: gvData?.overall_score || 0,
          gv_factor_scores: gvData?.factor_scores || null,
          engagement_score: engagement,
          composite_score: 0, // Will be calculated
        });
      });

      await Promise.allSettled(metricsTasks);

      if (postsWithMetrics.length === 0) {
        if (logId) await updateAdLoopLog(supabase, logId, { status: "skipped", output_summary: { reason: "No Late API analytics available" } });
        return jsonResponse({ ok: true, message: "No analytics data from Late API", picks: [] });
      }

      // 4. Calculate composite scores
      const reaches = postsWithMetrics.map(p => p.reach);
      const engagements = postsWithMetrics.map(p => p.engagement_score);
      const retentions = postsWithMetrics.map(p => p.watch_retention);
      const ctrs = postsWithMetrics.map(p => p.ctr);

      const normReach = normalize(reaches);
      const normEngagement = normalize(engagements);
      const normRetention = normalize(retentions);
      const normCtr = normalize(ctrs);

      for (let i = 0; i < postsWithMetrics.length; i++) {
        const gvNorm = postsWithMetrics[i].gv_overall_score / 100;
        postsWithMetrics[i].composite_score =
          (0.30 * normReach[i]) +
          (0.25 * normEngagement[i]) +
          (0.20 * gvNorm) +
          (0.15 * normRetention[i]) +
          (0.10 * normCtr[i]);
      }

      // 5. Sort by composite, take top N
      postsWithMetrics.sort((a, b) => b.composite_score - a.composite_score);
      const topPicks = postsWithMetrics.slice(0, maxPicks);

      // 6. Claude assesses ad potential for each pick
      const brandCtx = await getBrandContext(supabase, brandId);
      const brandBlock = buildBrandContextBlock(brandCtx);
      const picks: any[] = [];
      const cycleId = `pick-${brandId}-${new Date().toISOString().split("T")[0]}`;

      for (const post of topPicks) {
        const system = `You are GeoVera's God Mode Ad Potential Assessor. Evaluate organic content for paid ad promotion potential.

${brandBlock}

PLATFORM: ${post.platform}
Assess whether this organic content would perform well as a paid advertisement.
Consider: hook strength, broad appeal, CTA clarity, visual quality signals, audience resonance.

Return valid JSON only. No markdown.`;

        const user = `Assess this organic post for ad potential:

CONTENT: ${post.content_preview}
PLATFORM: ${post.platform}
POST URL: ${post.post_url}

ORGANIC METRICS (from Late API):
- Reach: ${post.reach.toLocaleString()}
- Likes: ${post.likes.toLocaleString()}
- Comments: ${post.comments.toLocaleString()}
- Shares: ${post.shares.toLocaleString()}
- Saves: ${post.saves.toLocaleString()}
- Watch Retention: ${(post.watch_retention * 100).toFixed(1)}%
- CTR: ${(post.ctr * 100).toFixed(2)}%

GV QUALITY SCORE: ${post.gv_overall_score}/100
COMPOSITE SCORE: ${(post.composite_score * 100).toFixed(1)}/100

Return JSON:
{
  "ad_potential_score": 0-100,
  "recommended_objective": "awareness|traffic|engagement|conversions",
  "recommended_budget_usd": number,
  "recommended_audience": { "age_range": "18-35", "interests": ["..."], "lookalike_source": "..." },
  "reasoning": "why this content would/wouldn't work as an ad",
  "expected_roas": number,
  "hook_strength": 0-10,
  "broad_appeal": 0-10
}`;

        const response = await callClaude(system, user);
        const assessment = parseJSON(response.content);
        const cost = calcClaudeCost(response.inputTokens, response.outputTokens);
        totalCost += cost;

        // Insert into gv_ad_content_picks
        const pickRow = {
          brand_id: brandId,
          cycle_id: cycleId,
          late_post_id: post.late_post_id,
          platform: post.platform,
          post_url: post.post_url,
          content_preview: post.content_preview,
          organic_reach: post.reach,
          organic_likes: post.likes,
          organic_comments: post.comments,
          organic_shares: post.shares,
          organic_saves: post.saves,
          organic_ctr: post.ctr,
          organic_watch_retention: post.watch_retention,
          gv_overall_score: post.gv_overall_score,
          gv_factor_scores: post.gv_factor_scores,
          ad_potential_score: assessment.ad_potential_score || 0,
          recommended_objective: assessment.recommended_objective || "awareness",
          recommended_budget_usd: assessment.recommended_budget_usd || 10,
          recommended_audience: assessment.recommended_audience || {},
          pick_reasoning: assessment.reasoning || "",
          status: "candidate",
        };

        await supabase.from("gv_ad_content_picks").insert(pickRow);
        picks.push(pickRow);
      }

      // 7. Send WA notification with top picks
      const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
      if (brand?.wa_number && picks.length > 0) {
        const pickSummary = picks
          .map((p, i) => `${i + 1}. ${p.platform} — Score: ${p.ad_potential_score}/100\n   ${p.content_preview?.slice(0, 80)}...`)
          .join("\n\n");

        await sendAdWA(brandId, brand.wa_number,
          `📊 *GeoVera Ads — Content Picks*\n\n${picks.length} konten organik terbaik untuk dipromosikan:\n\n${pickSummary}\n\nBalas "OK" untuk approve semua, atau sebutkan nomor yang ingin dipromosikan.`
        );
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: {
            posts_analyzed: postsWithMetrics.length,
            picks_made: picks.length,
            top_score: picks[0]?.ad_potential_score || 0,
            cycle_id: cycleId,
          },
          duration_ms: Date.now() - startTime,
          cost_usd: totalCost,
        });
      }

      return jsonResponse({
        ok: true,
        posts_analyzed: postsWithMetrics.length,
        picks: picks.map(p => ({
          late_post_id: p.late_post_id,
          platform: p.platform,
          ad_potential_score: p.ad_potential_score,
          composite_score: p.gv_overall_score,
          recommended_objective: p.recommended_objective,
          recommended_budget_usd: p.recommended_budget_usd,
        })),
      });
    } catch (err) {
      console.error(`[ads-pick-content] ${brandId}:`, err);
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
    console.error("[ads-pick-content] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
