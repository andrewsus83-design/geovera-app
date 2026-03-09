import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Learner (Claude Sonnet 4.6)

   Every 72 hours, Claude does a reverse engineering process on the Brand
   Source of Truth and generates a full intelligence package:

   1. TASKS       — prioritized actions derived from reverse engineering
   2. QA          — quality audit: what's good, broken, missing, urgent
   3. SUGGESTED PROMPTS — ready-to-use AI chat prompts for the user
   4. CONTENT PLAN — structured plan with topics, formats, platforms
   5. BRAND PRESENCE ANALYTICS:
        - keywords (per channel: SEO, GEO, Social Search)
        - topics (per channel)
        - search scores: visibility, discovery, authority

   Runs:
   1. After brand-consolidator sets status = 'sot_ready' (first time)
   2. Every 72H via brand-refresh-scheduler for all sot_ready brands

   Output: brand_profiles.daily_insights JSONB
   UI: Menu 1. Content · 2. AI Chat · 3. Analytics
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const REFRESH_HOURS = 72;

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json() as { brand_profile_id: string; user_id: string };
    const { brand_profile_id, user_id } = body;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, source_of_truth, daily_insights, insights_updated_at, serpapi_data, firecrawl_data, apify_data, perplexity_data")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile?.source_of_truth) {
      return new Response(JSON.stringify({ error: "Source of truth not found — run consolidator first" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // Skip if ran within last 72 hours
    if (profile.insights_updated_at) {
      const lastRun = new Date(profile.insights_updated_at);
      const hoursSince = (Date.now() - lastRun.getTime()) / 3600000;
      if (hoursSince < REFRESH_HOURS) {
        console.log(`[brand-learner] Skipping ${profile.brand_name} — ran ${hoursSince.toFixed(0)}h ago (72H cycle)`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "within_72h_cycle", hours_since: hoursSince.toFixed(0) }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const sot = profile.source_of_truth as Record<string, unknown>;
    const serpData = profile.serpapi_data as Record<string, unknown> | null;
    const firecrawlData = profile.firecrawl_data as Record<string, unknown> | null;
    const apifyData = profile.apify_data as Record<string, unknown> | null;
    const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const systemPrompt = `You are GeoVera's Brand Intelligence AI — Claude Sonnet.
You perform a deep reverse engineering analysis every 72 hours for brand owners in ${profile.country}.
Today: ${today}.

Your job: analyze the brand's Source of Truth + raw research data, then produce a comprehensive intelligence package.
Use plain, direct language. Business owners who are NOT marketing experts should understand everything.
Output ONLY valid JSON. No markdown. No explanations outside the JSON.`;

    // Build compact but rich data summary for Claude
    const sotSummary = JSON.stringify({
      brand: profile.brand_name,
      opportunity_map: sot.opportunity_map,
      competitor_intelligence: (sot.competitor_intelligence as Array<unknown> ?? []).slice(0, 3),
      trend_intelligence: sot.trend_intelligence,
      brand_presence: sot.brand_presence,
      content_intelligence: sot.content_intelligence,
      keyword_intelligence: sot.keyword_intelligence,
      content_calendar: sot.content_calendar,
      market_intelligence: sot.market_intelligence,
    }, null, 0).slice(0, 5000);

    const serpSummary = serpData ? JSON.stringify({
      brand_rankings: serpData.brand_rankings,
      whats_good: serpData.whats_good,
      whats_bad: serpData.whats_bad,
      keyword_intelligence: serpData.keyword_intelligence,
    }, null, 0).slice(0, 2000) : "{}";

    const firecrawlSummary = firecrawlData ? JSON.stringify({
      content_intelligence: firecrawlData.content_intelligence,
      opportunities: firecrawlData.opportunities,
    }, null, 0).slice(0, 1000) : "{}";

    const apifySummary = apifyData ? JSON.stringify({
      instagram: { avg_engagement: (apifyData.instagram as Record<string, unknown>)?.avg_engagement, top_topics: (apifyData.instagram as Record<string, unknown>)?.top_topics },
      tiktok: { avg_views: (apifyData.tiktok as Record<string, unknown>)?.avg_views, top_topics: (apifyData.tiktok as Record<string, unknown>)?.top_topics },
      content_patterns: apifyData.content_patterns,
    }, null, 0).slice(0, 1000) : "{}";

    const userPrompt = `Perform a 72-hour reverse engineering analysis for brand: "${profile.brand_name}" (${profile.country}).

SOURCE OF TRUTH:
${sotSummary}

SERP DATA (Google rankings, keywords):
${serpSummary}

WEBSITE CONTENT DATA:
${firecrawlSummary}

SOCIAL MEDIA DATA (last 14 days):
${apifySummary}

OUTPUT this exact JSON (no other text outside the JSON):
{
  "generated_at": "${new Date().toISOString()}",
  "brand_name": "${profile.brand_name}",
  "cycle": "72h",
  "today_date": "${today}",

  "tasks": [
    {
      "id": "t1",
      "type": "content|seo|competitor|opportunity|fix|engagement|pr",
      "title": "<clear action, max 60 chars>",
      "description": "<what to do and why, plain language, max 150 chars>",
      "priority": "urgent|high|medium|low",
      "effort": "quick|medium|deep",
      "expected_impact": "<specific measurable outcome>",
      "platform": "<platform or null>",
      "deadline": "today|this_week|this_month",
      "menu": "content|analytics|general"
    }
  ],

  "qa": {
    "score": 0,
    "whats_strong": ["<specific strength backed by data>"],
    "whats_broken": ["<specific issue with clear fix suggested>"],
    "whats_missing": ["<gap vs competitors or market standard>"],
    "urgent_fixes": ["<must fix in next 72H — specific>"],
    "quick_wins": ["<easy improvement completable today>"]
  },

  "suggested_prompts": [
    {
      "label": "<short button label, max 30 chars>",
      "prompt": "<full ready-to-use chat prompt>",
      "mode": "strategy|content|competitive|reverse_engineering",
      "why_useful": "<1 sentence why this prompt matters now>"
    }
  ],

  "content_plan": {
    "this_week": [
      {
        "day": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
        "topic": "<specific topic>",
        "format": "reel|short_article|long_article|story|carousel|thread",
        "platform": "<platform>",
        "angle": "<unique hook or angle>",
        "target_keyword": "<keyword to optimize for or null>",
        "estimated_reach": "high|medium|low",
        "priority": "urgent|high|medium"
      }
    ],
    "upcoming_opportunities": ["<trending topic or event to capitalize on>"],
    "content_gaps_to_fill": ["<topics competitor covers that brand doesn't>"]
  },

  "brand_presence_analytics": {
    "overall_score": 0,
    "seo": {
      "visibility_score": 0,
      "discovery_score": 0,
      "authority_score": 0,
      "visibility_label": "strong|moderate|weak|not_visible",
      "top_ranking_keywords": ["<keyword>"],
      "gap_keywords": ["<keyword brand should rank for but doesn't>"],
      "top_topics": ["<topic brand is associated with in search>"],
      "key_insight": "<1 plain-language insight about SEO position>",
      "priority_action": "<most important SEO action to take now>"
    },
    "geo": {
      "visibility_score": 0,
      "discovery_score": 0,
      "authority_score": 0,
      "visibility_label": "strong|moderate|weak|not_visible",
      "mentioned_in_ai": false,
      "ai_platforms_present": ["ChatGPT|Gemini|Perplexity|Claude"],
      "top_topics": ["<topic brand is mentioned for in AI responses>"],
      "key_insight": "<1 plain-language insight about AI/GEO presence>",
      "priority_action": "<most important GEO action to take now>"
    },
    "social_search": {
      "visibility_score": 0,
      "discovery_score": 0,
      "authority_score": 0,
      "visibility_label": "strong|moderate|weak|not_visible",
      "top_platforms": ["Instagram|TikTok|YouTube|LinkedIn"],
      "top_performing_keywords": ["<hashtag or keyword>"],
      "top_topics": ["<topic performing well on social>"],
      "engagement_quality": "high|moderate|low",
      "key_insight": "<1 plain-language insight about social search presence>",
      "priority_action": "<most important social search action to take now>"
    },
    "score_explanation": "<plain language summary of overall brand presence score>"
  },

  "competitive_moves": [
    {
      "competitor": "<name>",
      "what_they_did": "<observed move or advantage>",
      "threat_level": "high|medium|low",
      "our_response": "<specific recommended action>"
    }
  ],

  "weekly_focus": "<1 strategic theme for next 72H, plain language>",
  "motivation_insight": "<honest, encouraging 1-sentence observation about this brand's position and potential>"
}

REQUIREMENTS:
- tasks: 5-8 items, mix of content/seo/competitor types, assign to menu (content/analytics/general)
- qa.score: 0-100, honest rating of brand's overall digital quality
- suggested_prompts: 5-7 ready-to-use prompts the user can click directly in AI chat
- content_plan.this_week: 5-7 posts with specific days
- brand_presence_analytics scores: 0-100 each, based on actual data, NOT invented
  - visibility: how findable are they? (0=invisible, 100=dominates results)
  - discovery: how easily do new users find them? (0=very hard, 100=very easy)
  - authority: how trustworthy/credible do they appear? (0=no trust signals, 100=highly authoritative)
- overall_score: average of all 9 channel scores
- Keep all language simple, direct, actionable for non-marketers`;

    console.log(`[brand-learner] Starting 72H reverse engineering for: ${profile.brand_name}`);
    const claudeResponse = await callClaude(systemPrompt, userPrompt);

    let dailyInsights: Record<string, unknown>;
    try {
      let jsonText = claudeResponse.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      }
      dailyInsights = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Claude JSON parse failed: ${e}. First 300: ${claudeResponse.slice(0, 300)}`);
    }

    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({
        daily_insights: dailyInsights,
        insights_updated_at: new Date().toISOString(),
      })
      .eq("id", brand_profile_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    const tasks = (dailyInsights.tasks as unknown[]) ?? [];
    const suggestedPrompts = (dailyInsights.suggested_prompts as unknown[]) ?? [];
    const contentPlan = (dailyInsights.content_plan as Record<string, unknown>)?.this_week as unknown[] ?? [];
    const presenceScore = (dailyInsights.brand_presence_analytics as Record<string, unknown>)?.overall_score ?? 0;

    console.log(`[brand-learner] Done: ${profile.brand_name} — ${tasks.length} tasks, ${suggestedPrompts.length} prompts, ${contentPlan.length} content items, presence score: ${presenceScore}`);

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      tasks_generated: tasks.length,
      suggested_prompts: suggestedPrompts.length,
      content_plan_items: contentPlan.length,
      presence_score: presenceScore,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-learner] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
