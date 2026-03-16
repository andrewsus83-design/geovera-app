import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Consolidator (Claude Sonnet 4.6)

   The synthesis engine. Called by each research tool as it completes.
   Reads all available data from brand_profiles and uses Claude to produce
   the Brand Source of Truth (SoT) — the master intelligence document.

   Partial runs: works with 1-4 sources (runs incrementally as data arrives)
   Full run: when all 4 sources present → sets status = 'sot_ready'

   The SoT covers:
   - Brand foundation (from Gemini)
   - Market intelligence
   - Competitor intelligence (with threat levels)
   - Trend intelligence
   - Opportunity map (prioritized top 10 actions)
   - Keyword intelligence (ranking, gaps, quick wins, clusters)
   - Content intelligence (topics, gaps, platform strategies)
   - Brand presence (digital footprint score, what works, what's broken)
   - Content calendar (recommended topics per platform)

   After sot_ready: fires brand-daily-learner + brand-content-engine (first run)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ── Call Claude API ──────────────────────────────────────────────────────────
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
      max_tokens: 8192,
      temperature: 0.1,
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

// ── Build a compact summary of research data for Claude ──────────────────────
function summarizeResearchData(
  profile: Record<string, unknown>,
  sources: string[],
): string {
  const parts: string[] = [];
  const rd = profile.research_data as Record<string, unknown> ?? {};
  const identity = rd.brand_identity as Record<string, unknown> ?? {};
  const dna = rd.brand_dna as Record<string, unknown> ?? {};
  const market = rd.market_intelligence as Record<string, unknown> ?? {};
  const presence = rd.digital_presence as Record<string, unknown> ?? {};
  const content = rd.content_intelligence as Record<string, unknown> ?? {};
  const seeds = rd.research_seeds as Record<string, unknown> ?? {};

  const getVal = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key];
    if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) return (v as Record<string, unknown>).value;
    return v ?? null;
  };

  parts.push(`## BRAND FOUNDATION (Gemini Research)
Brand: ${profile.brand_name}
Country: ${profile.country}
Official Name: ${getVal(identity, "official_name")}
Industry: ${identity.industry ?? "unknown"} / ${identity.sub_industry ?? ""}
Stage: ${identity.brand_stage ?? "unknown"}
Founded: ${getVal(identity, "founded_year")}
HQ: ${identity.hq_city ?? ""}, ${identity.hq_country ?? ""}

Brand Archetype: ${dna.personality_archetype ?? "unknown"}
Positioning: ${dna.positioning ?? "unknown"}
USP: ${dna.usp ?? "unknown"}
Target Audience: ${JSON.stringify((dna.target_audience as Record<string, unknown>)?.primary_segment ?? "unknown")}

Known Competitors: ${JSON.stringify((market.competitors as Array<Record<string, unknown>> ?? []).map((c) => ({ name: c.name, strength: c.relative_strength })))}
Market: ${market.market_category ?? "unknown"}, ${market.growth_trajectory ?? "unknown"}

Digital Presence: ${JSON.stringify((presence.verified_urls as Record<string, unknown>) ?? {})}
Primary Keywords: ${JSON.stringify((content.primary_keywords as string[])?.slice(0, 8) ?? [])}
Gemini Overall Confidence: ${(rd.meta as Record<string, unknown>)?.overall_confidence ?? 0}`);

  if (sources.includes("perplexity") && profile.perplexity_data) {
    const pd = profile.perplexity_data as Record<string, unknown>;
    const market_r = pd.market_research as Record<string, unknown> ?? {};
    const comp_r = pd.competitor_research as Record<string, unknown> ?? {};
    const trend_r = pd.trend_research as Record<string, unknown> ?? {};
    const opp_r = pd.opportunity_research as Record<string, unknown> ?? {};

    parts.push(`## PERPLEXITY DEEP RESEARCH (${pd.queries_run ?? 0} queries)
Market Findings: ${JSON.stringify((market_r.findings as string[])?.slice(0, 5) ?? [])}
Key Players: ${JSON.stringify((market_r.key_players as string[])?.slice(0, 6) ?? [])}
Competitors Found: ${JSON.stringify((comp_r.competitors as Array<Record<string, unknown>> ?? []).slice(0, 5).map((c) => c.name))}
Trending Now: ${JSON.stringify((trend_r.trending_now as string[])?.slice(0, 4) ?? [])}
Emerging Trends: ${JSON.stringify((trend_r.emerging_trends as string[])?.slice(0, 4) ?? [])}
Content Gaps: ${JSON.stringify((opp_r.gaps_found as string[])?.slice(0, 4) ?? [])}
Quick Wins: ${JSON.stringify((opp_r.quick_wins as string[])?.slice(0, 3) ?? [])}
Strategic Opportunities: ${JSON.stringify((opp_r.strategic_opportunities as string[])?.slice(0, 4) ?? [])}
Citations: ${(pd.citations as unknown[])?.length ?? 0} sources`);
  }

  if (sources.includes("apify") && profile.apify_data) {
    const ad = profile.apify_data as Record<string, unknown>;
    const ig = ad.instagram as Record<string, unknown> ?? {};
    const tt = ad.tiktok as Record<string, unknown> ?? {};
    const maps = ad.google_maps as Record<string, unknown> ?? {};
    const patterns = ad.content_patterns as Record<string, unknown> ?? {};

    parts.push(`## APIFY LIVE DATA (Last 14 days)
Instagram: ${ig.posts_scraped ?? 0} posts, avg engagement: ${ig.avg_engagement ?? 0}, top topics: ${JSON.stringify(ig.top_topics ?? [])}
TikTok: ${tt.videos_scraped ?? 0} videos, avg views: ${tt.avg_views ?? 0}, top topics: ${JSON.stringify(tt.top_topics ?? [])}
Google Maps: ${maps.places_found ?? 0} places, avg rating: ${maps.avg_rating ?? "none"}, reviews: ${maps.total_reviews ?? 0}
Best performing topics: ${JSON.stringify(patterns.best_performing_topics ?? [])}`);
  }

  if (sources.includes("serpapi") && profile.serpapi_data) {
    const sd = profile.serpapi_data as Record<string, unknown>;
    const rankings = sd.brand_rankings as Record<string, unknown> ?? {};
    const kwi = sd.keyword_intelligence as Record<string, unknown> ?? {};

    parts.push(`## SERPAPI SEARCH INTELLIGENCE (${sd.queries_run ?? 0} queries)
Brand Visibility: ${rankings.visibility_score ?? 0}% (found in ${(rankings.found_in as unknown[])?.length ?? 0}/${sd.queries_run ?? 0} searches)
Avg Position: ${rankings.avg_position ?? "not found"}
Content Gaps: ${JSON.stringify((kwi.content_gaps as Array<Record<string, unknown>> ?? []).slice(0, 5).map((g) => g.keyword))}
Quick Wins (page 2): ${JSON.stringify((kwi.quick_wins as Array<Record<string, unknown>> ?? []).slice(0, 3).map((w) => w.keyword))}
Competitor Domains: ${JSON.stringify((kwi.competitor_domains as Array<Record<string, unknown>> ?? []).slice(0, 5).map((c) => c.domain))}
What's Good: ${JSON.stringify(sd.whats_good ?? [])}
What's Bad: ${JSON.stringify(sd.whats_bad ?? [])}
News Coverage: ${(sd.news_coverage as unknown[])?.length ?? 0} articles
PAA Questions: ${JSON.stringify((kwi.paa_content_ideas as string[])?.slice(0, 6) ?? [])}`);
  }

  if (sources.includes("firecrawl") && profile.firecrawl_data) {
    const fd = profile.firecrawl_data as Record<string, unknown>;
    const ci = fd.content_intelligence as Record<string, unknown> ?? {};

    parts.push(`## FIRECRAWL CONTENT ANALYSIS (${fd.successful_crawls ?? 0} pages crawled)
Content Depth: ${ci.content_depth ?? "unknown"}
Total Words: ${ci.total_words_indexed ?? 0}
Topic Coverage: ${JSON.stringify((ci.topic_coverage as string[])?.slice(0, 10) ?? [])}
Has Product Catalog: ${ci.has_product_catalog ?? false}
SEO Quality: ${JSON.stringify(ci.seo_quality ?? {})}
Opportunities: ${JSON.stringify((fd.opportunities as string[])?.slice(0, 5) ?? [])}`);
  }

  return parts.join("\n\n");
}

// ── Main Handler ──────────────────────────────────────────────────────────────
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

  // Declare outside try so error handler can reference them
  let brand_profile_id = "";
  let _user_id = "";

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      partial?: boolean;
      source?: string;
    };

    const { brand_profile_id: bpId, user_id, partial = false, source = "unknown" } = body;
    brand_profile_id = bpId;
    _user_id = user_id;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch complete profile
    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile) {
      return new Response(JSON.stringify({ error: "Brand profile not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // Determine available sources
    const sources: string[] = [];
    if (profile.research_data) sources.push("gemini");
    if (profile.perplexity_data) sources.push("perplexity");
    if (profile.apify_data) sources.push("apify");
    if (profile.serpapi_data) sources.push("serpapi");
    if (profile.firecrawl_data) sources.push("firecrawl");

    const isComplete = sources.includes("perplexity") && sources.includes("apify") &&
      sources.includes("serpapi") && sources.includes("firecrawl");

    console.log(`[brand-consolidator] ${profile.brand_name}: sources=${sources.join(",")} complete=${isComplete} triggered_by=${source}`);

    if (!profile.research_data) {
      console.log(`[brand-consolidator] No Gemini data yet — waiting`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_gemini_data_yet" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Optimistic lock: only update to 'consolidating' if NOT already consolidating
    // This prevents race conditions when multiple research tools finish simultaneously
    const { data: lockAcquired } = await supabase
      .from("brand_profiles")
      .update({ research_status: "consolidating" })
      .eq("id", brand_profile_id)
      .neq("research_status", "consolidating")
      .select("id");

    if (!lockAcquired || lockAcquired.length === 0) {
      console.log(`[brand-consolidator] ${profile.brand_name}: already consolidating — skipping concurrent run`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_consolidating" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Build research summary for Claude
    const researchSummary = summarizeResearchData(profile as unknown as Record<string, unknown>, sources);

    const systemPrompt = `You are GeoVera's Chief Brand Intelligence Synthesizer.
Your job: synthesize ALL available research data about a brand into a single comprehensive, actionable Source of Truth (SoT).

RULES:
1. Only include facts supported by the research data provided
2. Every insight must be actionable and specific
3. Confidence scores (0-100) based on data quality and consistency across sources
4. For opportunity_map.prioritized_actions: rank by impact × feasibility, be brutally honest
5. Output ONLY valid JSON — no preamble, no markdown wrapper
6. For platform_strategies: be channel-specific and practical
7. content_calendar must have at least 5 recommended topics`;

    const userPrompt = `Based on this research data, synthesize the Brand Source of Truth JSON.
Available sources: ${sources.join(", ")} (${isComplete ? "COMPLETE" : "PARTIAL"})
${partial && !isComplete ? "NOTE: Some sources still arriving. Produce best synthesis with current data. Mark low-confidence sections." : "All sources available. Produce definitive synthesis."}

${researchSummary}

OUTPUT this exact JSON structure (no other text):
{
  "meta": {
    "sot_version": ${(profile.research_version ?? 1)},
    "sources_used": ${JSON.stringify(sources)},
    "confidence": <0-100 overall>,
    "is_complete": ${isComplete},
    "consolidated_at": "${new Date().toISOString()}"
  },
  "brand_foundation": {
    "name": "<official name>",
    "archetype": "<Jungian archetype>",
    "positioning": "<1-sentence positioning>",
    "usp": "<unique selling proposition>",
    "tagline": "<tagline or null>",
    "core_values": ["<value>"],
    "brand_voice": "<tone description>",
    "primary_colors": ["<#hex>"],
    "target_audience": "<primary segment description>",
    "industry": "<industry>",
    "brand_stage": "<startup|growth|established|legacy>",
    "confidence": <0-100>
  },
  "market_intelligence": {
    "category": "<market category>",
    "size_estimate": "<market size>",
    "growth_trajectory": "<declining|stable|growing|hypergrowth>",
    "key_dynamics": ["<market dynamic>"],
    "entry_barriers": ["<barrier>"],
    "confidence": <0-100>
  },
  "competitor_intelligence": [
    {
      "name": "<competitor name>",
      "website": "<url or null>",
      "strengths": ["<strength>"],
      "weaknesses": ["<weakness>"],
      "content_strategy": "<what they do well>",
      "seo_position": "<stronger|similar|weaker>",
      "social_presence": "<strong|moderate|weak>",
      "threat_level": "<high|medium|low>",
      "our_opportunity": "<how we beat them>"
    }
  ],
  "trend_intelligence": {
    "trending_now": ["<trend>"],
    "emerging": ["<emerging trend>"],
    "declining": ["<declining trend>"],
    "opportunity_window": "<time-sensitive opportunity>",
    "confidence": <0-100>
  },
  "opportunity_map": {
    "immediate_wins": ["<action within 1-2 weeks>"],
    "medium_term": ["<action within 1-3 months>"],
    "strategic": ["<action within 3-12 months>"],
    "prioritized_actions": [
      {
        "rank": 1,
        "action": "<specific action>",
        "why": "<reasoning based on data>",
        "impact": "<high|medium|low>",
        "effort": "<quick|medium|deep>",
        "kpi": "<measurable outcome>"
      }
    ],
    "confidence": <0-100>
  },
  "keyword_intelligence": {
    "ranking_keywords": ["<keyword where brand appears>"],
    "gap_keywords": ["<keyword where competitors rank but brand doesn't>"],
    "quick_win_keywords": ["<page 2 keywords — easy to move to page 1>"],
    "content_clusters": [
      {
        "cluster_name": "<topic cluster>",
        "keywords": ["<kw>"],
        "content_needed": "<type of content>"
      }
    ],
    "confidence": <0-100>
  },
  "content_intelligence": {
    "top_performing_topics": ["<topic>"],
    "content_gaps": ["<missing topic>"],
    "platform_strategies": {
      "instagram": "<specific strategy>",
      "tiktok": "<specific strategy>",
      "linkedin": "<specific strategy>",
      "youtube": "<specific strategy>",
      "blog_seo": "<specific strategy>"
    },
    "best_content_formats": ["<format>"],
    "posting_frequency": {
      "instagram": "<e.g. 5x/week>",
      "tiktok": "<e.g. 7x/week>",
      "linkedin": "<e.g. 3x/week>"
    },
    "confidence": <0-100>
  },
  "brand_presence": {
    "digital_footprint_score": <0-100>,
    "whats_working": ["<positive signal>"],
    "whats_broken": ["<problem to fix>"],
    "missing_channels": ["<platform not yet on>"],
    "search_visibility": "<high|medium|low>",
    "social_strength": "<strong|moderate|weak>",
    "local_presence": "<strong|moderate|weak|none>",
    "media_coverage": "<active|minimal|none>",
    "confidence": <0-100>
  },
  "content_calendar": {
    "recommended_topics": [
      {
        "topic": "<content topic>",
        "format": "<article_short|article_medium|article_long|reel|video|infographic>",
        "platform": "<instagram|tiktok|linkedin|youtube|blog>",
        "priority": <1-10>,
        "why_now": "<timing reason>",
        "target_keyword": "<SEO keyword>",
        "expected_outcome": "<reach|authority|conversion>"
      }
    ],
    "weekly_themes": ["<theme>"]
  }
}`;

    const claudeResponse = await callClaude(systemPrompt, userPrompt);

    // Parse JSON
    let sotData: Record<string, unknown>;
    try {
      let jsonText = claudeResponse.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      }
      sotData = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Claude JSON parse failed: ${e}. First 200: ${claudeResponse.slice(0, 200)}`);
    }

    // Determine final status
    const newStatus = isComplete ? "sot_ready" : "consolidating";
    const sotVersion = ((profile.source_of_truth as Record<string, unknown>)?.meta as Record<string, unknown>)?.sot_version as number ?? 0;

    // Save SoT
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({
        source_of_truth: sotData,
        sot_updated_at: new Date().toISOString(),
        research_status: newStatus,
      })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    console.log(`[brand-consolidator] ${profile.brand_name}: status=${newStatus} sources=${sources.length}/5 sot_v${sotVersion + 1}`);

    // On first sot_ready completion: fire downstream chains
    if (isComplete) {
      // Brand daily learner — generates tasks + insights
      supabase.functions.invoke("brand-daily-learner", {
        body: { brand_profile_id, user_id },
      }).catch((e: Error) => console.error(`[brand-consolidator] learner chain failed: ${e.message}`));

      // Brand QA engine — biweekly brand presence audit (runs after full pipeline)
      supabase.functions.invoke("brand-qa-engine", {
        body: { brand_profile_id, user_id },
      }).catch((e: Error) => console.error(`[brand-consolidator] qa-engine chain failed: ${e.message}`));

      // Content engine — initial content generation (only on first sot_ready)
      if (!sotVersion || sotVersion < 1) {
        supabase.functions.invoke("brand-content-engine", {
          body: { brand_profile_id, user_id },
        }).catch((e: Error) => console.error(`[brand-consolidator] content engine chain failed: ${e.message}`));
      }

      console.log(`[brand-consolidator] Fired brand-daily-learner + brand-qa-engine + brand-content-engine`);
    }

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      status: newStatus,
      sources_used: sources,
      is_complete: isComplete,
      confidence: (sotData.meta as Record<string, unknown>)?.confidence ?? 0,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-consolidator] ERROR: ${message}`);

    // Update status to 'failed' with error details — enables dashboard visibility + manual retry
    if (brand_profile_id) {
      supabase.from("brand_profiles").update({
        research_status: "failed",
        error_details: { message, step: "brand-consolidator", timestamp: new Date().toISOString() },
        error_at: new Date().toISOString(),
        error_step: "brand-consolidator",
      }).eq("id", brand_profile_id).catch(() => {});
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
