import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand QA Engine (Biweekly Brand Presence Audit)

   Every 2 weeks after full pipeline completes (sot_ready), Claude actively
   "interrogates" each platform with targeted QA probes to measure:

   GOAL: Brand Visibility · Discoverability · Authority

   PLATFORM FOCUS:
   ├── GEO (35%)    — Perplexity sonar: "Is brand mentioned in AI answers?"
   ├── Social (40%) — SerpAPI: TikTok, Instagram, YouTube, Pinterest search
   └── SEO (25%)    — SerpAPI: Google — brand + category + competitor queries

   TIER QUERY COUNTS:
   ├── basic:      15 total  (5 GEO · 6 Social · 4 SEO)
   ├── pro:        30 total  (10 GEO · 12 Social · 8 SEO)
   └── enterprise: 50 total  (18 GEO · 20 Social · 12 SEO)

   FLOW:
   1. Claude reads SoT → generates n targeted QA questions per platform
   2. Execute GEO probes via Perplexity (sonar) — parallel batches of 4
   3. Execute Social + SEO probes via SerpAPI — sequential 500ms gap
   4. Claude analyzes all probe results → qa_report with scores
   5. Store brand_profiles.qa_analytics → feed brand-daily-learner

   TRIGGERS:
   - brand-consolidator → sot_ready (biweekly cycle)
   - Manual: POST { brand_profile_id, user_id, tier? }
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const PERPLEXITY_MODEL = "sonar"; // faster + cheaper for QA probes
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const SERPAPI_BASE = "https://serpapi.com/search.json";

// ── Tier configuration ────────────────────────────────────────────────────────
const TIER_CONFIG = {
  basic:      { geo: 5,  social: 6,  seo: 4  }, // 15 total
  pro:        { geo: 10, social: 12, seo: 8  }, // 30 total
  enterprise: { geo: 18, social: 20, seo: 12 }, // 50 total
} as const;

type Tier = keyof typeof TIER_CONFIG;

interface QAQuestion {
  id: string;
  question: string;
  intent: "brand_awareness" | "recommendation" | "competitive_discovery" | "reputation" | "category_search" | "negative_review" | "complaint" | "comparison_negative";
  sentiment: "positive" | "neutral" | "negative"; // positive: expect brand mentioned; negative: test brand under criticism/complaints
  expected_mention: boolean;
}

interface SerpQA {
  id: string;
  query: string;
  platform: "tiktok" | "instagram" | "youtube" | "linkedin" | "google" | "pinterest";
  intent: "brand_presence" | "keyword_visibility" | "topic_discovery" | "competitive";
}

interface GEOProbeResult {
  id: string;
  question: string;
  intent: string;
  brand_mentioned: boolean;
  mention_context: string;
  position_in_response: "prominent" | "mentioned" | "not_found";
  response_preview: string;
  competitors_mentioned: string[];
}

interface SerpProbeResult {
  id: string;
  query: string;
  platform: string;
  brand_found: boolean;
  brand_position: number | null;
  top_results: string[];
  brand_url: string | null;
  competitor_dominance: string[];
}

// ── Call Claude ────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

// ── Run a GEO probe via Perplexity sonar ──────────────────────────────────────
async function runGEOProbe(
  question: string,
  brandName: string,
  country: string,
): Promise<{ answer: string; brand_mentioned: boolean; context: string; competitors: string[] }> {
  try {
    const res = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant answering questions about brands and products in ${country}. Answer naturally as you would to any user.`,
          },
          { role: "user", content: question },
        ],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[brand-qa-engine] Perplexity probe failed: ${res.status} — ${err.slice(0, 100)}`);
      return { answer: "", brand_mentioned: false, context: "", competitors: [] };
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content ?? "";

    // Check if brand is mentioned
    const brandTerms = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const answerLower = answer.toLowerCase();
    const brand_mentioned = brandTerms.some((term) => answerLower.includes(term));

    // Extract context around brand mention
    let context = "";
    if (brand_mentioned) {
      const brandIdx = brandTerms.map((t) => answerLower.indexOf(t)).find((i) => i >= 0) ?? 0;
      context = answer.slice(Math.max(0, brandIdx - 50), brandIdx + 150).trim();
    }

    // Simple competitor extraction (capitalized words near competitive terms)
    const competitorPattern = /(?:seperti|like|such as|vs|compared to|alternatives?:?)\s+([A-Z][a-zA-Z\s]{2,20})/gi;
    const competitors: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = competitorPattern.exec(answer)) !== null) {
      const name = m[1].trim();
      if (!brandTerms.some((t) => name.toLowerCase().includes(t))) {
        competitors.push(name);
      }
    }

    return { answer, brand_mentioned, context, competitors: [...new Set(competitors)].slice(0, 3) };
  } catch (e) {
    console.error(`[brand-qa-engine] GEO probe error: ${e instanceof Error ? e.message : String(e)}`);
    return { answer: "", brand_mentioned: false, context: "", competitors: [] };
  }
}

// ── Run a Social/SEO probe via SerpAPI ────────────────────────────────────────
async function runSerpProbe(
  query: string,
  platform: string,
  brandName: string,
  country: string,
): Promise<{ found: boolean; position: number | null; top_results: string[]; brand_url: string | null; competitors: string[] }> {
  try {
    const cc = country.toLowerCase() === "indonesia" ? "id" : "sg";
    const hl = country.toLowerCase() === "indonesia" ? "id" : "en";

    const params = new URLSearchParams({
      api_key: SERPAPI_KEY,
      engine: "google",
      gl: cc,
      hl,
      num: "20",
    });

    // Platform-specific query modifications
    if (platform === "tiktok") {
      params.set("q", `site:tiktok.com ${query}`);
    } else if (platform === "instagram") {
      params.set("q", `site:instagram.com ${query}`);
    } else if (platform === "youtube") {
      params.set("q", `${query} site:youtube.com`);
    } else if (platform === "linkedin") {
      params.set("q", `site:linkedin.com ${query}`);
    } else if (platform === "pinterest") {
      params.set("q", `site:pinterest.com ${query}`);
    } else {
      // Google standard
      params.set("q", query);
    }

    const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`);
    if (!res.ok) {
      console.warn(`[brand-qa-engine] SerpAPI ${platform} probe failed: ${res.status}`);
      return { found: false, position: null, top_results: [], brand_url: null, competitors: [] };
    }

    const data = await res.json() as Record<string, unknown>;
    const organic = (data.organic_results as Array<Record<string, unknown>>) ?? [];

    // Check brand presence
    const brandTerms = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    let found = false;
    let position: number | null = null;
    let brand_url: string | null = null;

    for (let i = 0; i < organic.length; i++) {
      const r = organic[i];
      const url = String(r.link ?? r.url ?? "").toLowerCase();
      const title = String(r.title ?? "").toLowerCase();
      const snippet = String(r.snippet ?? "").toLowerCase();

      if (brandTerms.some((t) => url.includes(t) || title.includes(t) || snippet.includes(t))) {
        found = true;
        position = i + 1;
        brand_url = String(r.link ?? r.url ?? "");
        break;
      }
    }

    // Top result domains (competitors)
    const topResults = organic.slice(0, 8).map((r) => {
      try { return new URL(String(r.link ?? r.url ?? "")).hostname.replace("www.", ""); } catch { return ""; }
    }).filter(Boolean);

    const competitors = topResults
      .filter((d) => !brandTerms.some((t) => d.includes(t)))
      .slice(0, 5);

    return { found, position, top_results: topResults, brand_url, competitors };
  } catch (e) {
    console.error(`[brand-qa-engine] SerpAPI probe error: ${e instanceof Error ? e.message : String(e)}`);
    return { found: false, position: null, top_results: [], brand_url: null, competitors: [] };
  }
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

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      tier?: Tier;
      force?: boolean;
    };

    const { brand_profile_id, user_id, tier = "pro", force = false } = body;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, source_of_truth, serpapi_data, qa_analytics, qa_updated_at, qa_tier, research_data, research_hash, research_version")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile?.source_of_truth) {
      return new Response(JSON.stringify({ error: "Source of truth not ready" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // Biweekly dedup — skip if ran within 13 days (1 day buffer)
    if (!force && profile.qa_updated_at) {
      const daysSince = (Date.now() - new Date(profile.qa_updated_at).getTime()) / 86400000;
      if (daysSince < 13) {
        console.log(`[brand-qa-engine] Skipping — ran ${daysSince.toFixed(1)} days ago`);
        return new Response(JSON.stringify({ success: true, skipped: true, days_since: daysSince.toFixed(1) }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const effectiveTier = (profile.qa_tier as Tier) ?? tier;
    const counts = TIER_CONFIG[effectiveTier] ?? TIER_CONFIG.pro;
    const sot = profile.source_of_truth as Record<string, unknown>;
    const serpData = profile.serpapi_data as Record<string, unknown> | null;

    console.log(`[brand-qa-engine] Starting ${effectiveTier} QA for: ${profile.brand_name} (GEO:${counts.geo} Social:${counts.social} SEO:${counts.seo})`);

    // ── STEP 1: Claude generates targeted QA questions ──────────────────────────
    const sotContext = JSON.stringify({
      brand: profile.brand_name,
      country: profile.country,
      category: (sot.market_intelligence as Record<string, unknown>)?.category,
      usp: (sot.brand_foundation as Record<string, unknown>)?.usp,
      target_audience: (sot.brand_foundation as Record<string, unknown>)?.target_audience,
      competitors: (sot.competitor_intelligence as Array<Record<string, unknown>> ?? []).slice(0, 5).map((c) => c.name),
      top_keywords: (sot.keyword_intelligence as Record<string, unknown>)?.ranking_keywords,
      gap_keywords: (sot.keyword_intelligence as Record<string, unknown>)?.gap_keywords,
      top_topics: (sot.content_intelligence as Record<string, unknown>)?.top_performing_topics,
    }, null, 0).slice(0, 3000);

    const serp_context = serpData ? JSON.stringify({
      quick_wins: (serpData.keyword_intelligence as Record<string, unknown>)?.quick_wins,
      paa_ideas: (serpData.keyword_intelligence as Record<string, unknown>)?.paa_content_ideas,
    }, null, 0).slice(0, 800) : "";

    const qGenSystem = `You are a Brand QA Specialist designing precise probe questions to test "${profile.brand_name}" brand presence across three channels: GEO (AI platforms), Social Search, and SEO.
Output ONLY valid JSON arrays. No other text.`;

    const qGenPrompt = `Generate QA probe questions for brand: "${profile.brand_name}" (${profile.country})

CONTEXT:
${sotContext}
${serp_context ? `SERP INTEL: ${serp_context}` : ""}

Generate exactly:
- ${counts.geo} GEO questions (test AI platform visibility — Perplexity/ChatGPT style questions)
- ${counts.social} Social search queries (test presence on TikTok/Instagram/YouTube/LinkedIn)
- ${counts.seo} SEO queries (test Google presence — brand + category + commercial intent)

FOCUS 70-75% on GEO + Social (especially GEO recommendations, social discovery).
SEO 25% focused on commercial and informational intent.

GEO QUESTION TYPES — mix positive AND negative/critical (very important: include negative to find blind spots):

POSITIVE/NEUTRAL (60% of GEO questions):
- "Apa rekomendasi [category] terbaik di [country]?" (awareness)
- "Saya cari [product] yang bagus, apa yang kamu rekomendasikan?" (recommendation)
- "Apa alternatif selain [competitor]?" (competitive discovery)
- "Brand [category] yang lagi trending di [country]?" (trend discovery)

NEGATIVE/CRITICAL (40% of GEO questions — CRITICAL for finding blind spots and reputation gaps):
- "Apa keluhan/masalah umum tentang [brand_name]?" (complaint probe)
- "Kenapa orang tidak suka [brand_name]?" (negative sentiment probe)
- "Apa kekurangan/kelemahan [brand_name] dibanding kompetitor?" (weakness probe)
- "[brand_name] worth it atau tidak? Ada pengalaman buruk?" (value + negative experience)
- "Bagaimana pengalaman negatif pengguna [brand_name]?" (bad review probe)
- "Apakah [brand_name] terpercaya? Apa kontroversinya?" (trust + controversy probe)
- "Kenapa pilih [competitor] daripada [brand_name]?" (competitive disadvantage probe)

SOCIAL QUERY TYPES — assign platform:
- Brand name + keyword combos → tiktok, instagram
- Tutorial/review/demo content → youtube, tiktok
- Professional/B2B content → linkedin
- Visual/aesthetic content → instagram, pinterest
- Mix platforms: ${Math.ceil(counts.social * 0.4)} tiktok, ${Math.ceil(counts.social * 0.3)} instagram, ${Math.ceil(counts.social * 0.2)} youtube, rest linkedin/pinterest

SEO QUERY TYPES:
- Branded: "[brand name]", "[brand name] review", "[brand name] price"
- Category: "[category] terbaik [country]", "buy [product]"
- Competitive: "[brand name] vs [competitor]", "[product] comparison"

OUTPUT this exact JSON (no other text):
{
  "geo_questions": [
    { "id": "geo_1", "question": "<natural language question in ${profile.country === "Indonesia" ? "Bahasa Indonesia" : "English"}>", "intent": "brand_awareness|recommendation|competitive_discovery|reputation|category_search|negative_review|complaint|comparison_negative", "sentiment": "positive|neutral|negative" }
  ],
  "social_queries": [
    { "id": "soc_1", "query": "<search query>", "platform": "tiktok|instagram|youtube|linkedin|pinterest", "intent": "brand_presence|keyword_visibility|topic_discovery|competitive" }
  ],
  "seo_queries": [
    { "id": "seo_1", "query": "<search query>", "intent": "brand_presence|keyword_visibility|topic_discovery|competitive" }
  ]
}`;

    const qGenResponse = await callClaude(qGenSystem, qGenPrompt, 3000);

    let qaQuestions: {
      geo_questions: QAQuestion[];
      social_queries: SerpQA[];
      seo_queries: SerpQA[];
    };

    try {
      let jsonText = qGenResponse.trim();
      if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      qaQuestions = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`QA generation parse failed: ${e}. Preview: ${qGenResponse.slice(0, 200)}`);
    }

    console.log(`[brand-qa-engine] Generated: ${qaQuestions.geo_questions.length} GEO, ${qaQuestions.social_queries.length} Social, ${qaQuestions.seo_queries.length} SEO`);

    // ── STEP 2: Execute GEO probes via Perplexity (parallel batches of 4) ────────
    const geoResults: GEOProbeResult[] = [];
    const geoBatchSize = 4;

    for (let i = 0; i < qaQuestions.geo_questions.length; i += geoBatchSize) {
      const batch = qaQuestions.geo_questions.slice(i, i + geoBatchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (q) => {
          const probe = await runGEOProbe(q.question, profile.brand_name, profile.country);
          const positionLabel: "prominent" | "mentioned" | "not_found" =
            probe.brand_mentioned && probe.context.length > 0
              ? probe.answer.toLowerCase().indexOf(profile.brand_name.toLowerCase()) < 200
                ? "prominent"
                : "mentioned"
              : "not_found";

          return {
            id: q.id,
            question: q.question,
            intent: q.intent,
            brand_mentioned: probe.brand_mentioned,
            mention_context: probe.context.slice(0, 200),
            position_in_response: positionLabel,
            response_preview: probe.answer.slice(0, 300),
            competitors_mentioned: probe.competitors,
          } satisfies GEOProbeResult;
        }),
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") geoResults.push(r.value);
      }

      // Small gap between batches
      if (i + geoBatchSize < qaQuestions.geo_questions.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // ── STEP 3: Execute Social + SEO probes via SerpAPI ──────────────────────────
    const socialResults: SerpProbeResult[] = [];
    const seoResults: SerpProbeResult[] = [];

    const allSerpProbes = [
      ...qaQuestions.social_queries.map((q) => ({ ...q, channel: "social" as const })),
      ...qaQuestions.seo_queries.map((q) => ({ ...q, channel: "seo" as const })),
    ];

    for (let i = 0; i < allSerpProbes.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 500));
      const probe = allSerpProbes[i];
      const result = await runSerpProbe(probe.query, probe.platform, profile.brand_name, profile.country);

      const probeResult: SerpProbeResult = {
        id: probe.id,
        query: probe.query,
        platform: probe.platform,
        brand_found: result.found,
        brand_position: result.position,
        top_results: result.top_results,
        brand_url: result.brand_url,
        competitor_dominance: result.competitors,
      };

      if (probe.channel === "social") socialResults.push(probeResult);
      else seoResults.push(probeResult);

      console.log(`[brand-qa-engine] ${probe.platform} "${probe.query}" → brand: ${result.found ? `#${result.position}` : "not found"}`);
    }

    // ── STEP 4: Claude analyzes all probe results → qa_report ────────────────────
    const geoMentionRate = geoResults.length > 0
      ? Math.round((geoResults.filter((r) => r.brand_mentioned).length / geoResults.length) * 100)
      : 0;
    const socialFoundRate = socialResults.length > 0
      ? Math.round((socialResults.filter((r) => r.brand_found).length / socialResults.length) * 100)
      : 0;
    const seoFoundRate = seoResults.length > 0
      ? Math.round((seoResults.filter((r) => r.brand_found).length / seoResults.length) * 100)
      : 0;

    const probesSummary = JSON.stringify({
      geo: {
        total: geoResults.length,
        brand_mentioned_count: geoResults.filter((r) => r.brand_mentioned).length,
        prominent_count: geoResults.filter((r) => r.position_in_response === "prominent").length,
        mention_rate_pct: geoMentionRate,
        questions_not_found: geoResults.filter((r) => !r.brand_mentioned).map((r) => r.question).slice(0, 5),
        competitors_appearing: [...new Set(geoResults.flatMap((r) => r.competitors_mentioned))].slice(0, 6),
        sample_contexts: geoResults.filter((r) => r.brand_mentioned).map((r) => r.mention_context).slice(0, 3),
      },
      social: {
        total: socialResults.length,
        brand_found_count: socialResults.filter((r) => r.brand_found).length,
        found_rate_pct: socialFoundRate,
        by_platform: Object.fromEntries(
          ["tiktok", "instagram", "youtube", "linkedin", "pinterest"].map((p) => {
            const pResults = socialResults.filter((r) => r.platform === p);
            return [p, {
              total: pResults.length,
              found: pResults.filter((r) => r.brand_found).length,
              avg_position: pResults.filter((r) => r.brand_position !== null).length > 0
                ? Math.round(pResults.filter((r) => r.brand_position !== null).reduce((s, r) => s + r.brand_position!, 0) /
                    pResults.filter((r) => r.brand_position !== null).length)
                : null,
            }];
          })
        ),
        top_competitors_social: [...new Set(socialResults.flatMap((r) => r.competitor_dominance))].slice(0, 5),
        queries_where_brand_absent: socialResults.filter((r) => !r.brand_found).map((r) => `${r.platform}: ${r.query}`).slice(0, 5),
      },
      seo: {
        total: seoResults.length,
        brand_found_count: seoResults.filter((r) => r.brand_found).length,
        found_rate_pct: seoFoundRate,
        avg_position: seoResults.filter((r) => r.brand_position !== null).length > 0
          ? Math.round(seoResults.filter((r) => r.brand_position !== null).reduce((s, r) => s + r.brand_position!, 0) /
              seoResults.filter((r) => r.brand_position !== null).length)
          : null,
        top_competitors_seo: [...new Set(seoResults.flatMap((r) => r.competitor_dominance))].slice(0, 5),
      },
    }, null, 0);

    const analysisSystem = `You are GeoVera's Brand Presence QA Analyst.
Analyze brand probe results and produce actionable intelligence.
Output ONLY valid JSON. Plain language. Direct. Honest.`;

    const analysisPrompt = `Analyze QA probe results for brand: "${profile.brand_name}" (${profile.country})
Tier: ${effectiveTier} | Total probes: ${geoResults.length + socialResults.length + seoResults.length}

PROBE RESULTS:
${probesSummary}

OUTPUT this exact JSON:
{
  "qa_score": {
    "overall": 0,
    "geo": {
      "visibility": 0,
      "discovery": 0,
      "authority": 0,
      "mention_rate_pct": ${geoMentionRate},
      "label": "strong|moderate|weak|not_visible"
    },
    "social_search": {
      "visibility": 0,
      "discovery": 0,
      "authority": 0,
      "presence_rate_pct": ${socialFoundRate},
      "label": "strong|moderate|weak|not_visible",
      "best_platform": "<platform where brand performs best>",
      "worst_platform": "<platform where brand is least visible>"
    },
    "seo": {
      "visibility": 0,
      "discovery": 0,
      "authority": 0,
      "presence_rate_pct": ${seoFoundRate},
      "label": "strong|moderate|weak|not_visible"
    }
  },
  "key_findings": {
    "geo_insights": [
      "<specific finding about AI platform visibility — plain language>"
    ],
    "social_insights": [
      "<specific finding about social platform visibility — plain language>"
    ],
    "seo_insights": [
      "<specific finding about Google visibility — plain language>"
    ],
    "competitor_threats": [
      {
        "name": "<competitor name>",
        "where_they_dominate": "<platform or query type>",
        "how_to_counter": "<specific action>"
      }
    ]
  },
  "new_keywords_discovered": [
    "<keyword or topic found in probe results that brand should target>"
  ],
  "new_topics_discovered": [
    "<topic appearing in competitor answers or search results that brand is missing>"
  ],
  "priority_gaps": [
    {
      "channel": "geo|social_tiktok|social_instagram|social_youtube|seo",
      "gap": "<specific gap — what questions/searches show brand is absent>",
      "urgency": "critical|high|medium",
      "fix": "<specific actionable fix>"
    }
  ],
  "content_opportunities": [
    {
      "topic": "<topic>",
      "platform": "<platform>",
      "format": "reel|article|video|story|carousel",
      "why": "<why this will improve visibility/discovery/authority>",
      "target_keyword": "<keyword to use>"
    }
  ],
  "qa_narrative": "<2-3 sentence plain language summary of brand's overall presence health — honest, actionable>",
  "next_qa_focus": "<what to probe deeper next biweek cycle>"
}

SCORING GUIDE (each score 0-100):
- visibility: % of probes where brand was found/mentioned
- discovery: how easily NEW users (not searching brand name) find the brand
- authority: quality of mentions — are we recommended vs just mentioned?
- overall: weighted average (GEO 35% + Social 40% + SEO 25%)

${counts.geo > 5 ? "Be specific about GEO findings — it's the highest weight channel." : ""}
Identify at least 3 new_keywords_discovered and 3 content_opportunities.`;

    const analysisResponse = await callClaude(analysisSystem, analysisPrompt, 3000);

    let qaAnalysis: Record<string, unknown>;
    try {
      let jsonText = analysisResponse.trim();
      if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      qaAnalysis = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`QA analysis parse failed: ${e}. Preview: ${analysisResponse.slice(0, 200)}`);
    }

    // ── STEP 5: Build final qa_analytics object ────────────────────────────────
    const qaAnalytics = {
      tier: effectiveTier,
      probes_run: {
        geo: geoResults.length,
        social: socialResults.length,
        seo: seoResults.length,
        total: geoResults.length + socialResults.length + seoResults.length,
      },
      raw_results: {
        geo: geoResults.map((r) => ({
          id: r.id,
          question: r.question,
          intent: r.intent,
          brand_mentioned: r.brand_mentioned,
          position: r.position_in_response,
          mention_context: r.mention_context,
          competitors: r.competitors_mentioned,
        })),
        social: socialResults.map((r) => ({
          id: r.id,
          query: r.query,
          platform: r.platform,
          brand_found: r.brand_found,
          position: r.brand_position,
          competitors: r.competitor_dominance,
        })),
        seo: seoResults.map((r) => ({
          id: r.id,
          query: r.query,
          brand_found: r.brand_found,
          position: r.brand_position,
          competitors: r.competitor_dominance,
        })),
      },
      analysis: qaAnalysis,
      run_at: new Date().toISOString(),
    };

    // Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({
        qa_analytics: qaAnalytics,
        qa_updated_at: new Date().toISOString(),
        qa_tier: effectiveTier,
      })
      .eq("id", brand_profile_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    const overallScore = (qaAnalysis.qa_score as Record<string, unknown>)?.overall ?? 0;
    const gapCount = (qaAnalysis.priority_gaps as unknown[])?.length ?? 0;
    const newKeywords = (qaAnalysis.new_keywords_discovered as unknown[])?.length ?? 0;

    console.log(`[brand-qa-engine] Done: ${profile.brand_name} — score:${overallScore} gaps:${gapCount} new_keywords:${newKeywords}`);

    // Fire brand-daily-learner to regenerate insights with QA data
    supabase.functions.invoke("brand-daily-learner", {
      body: { brand_profile_id, user_id },
    }).catch((e: Error) => console.error(`[brand-qa-engine] learner chain failed: ${e.message}`));

    // Vectorize QA findings for RAG — build a QA-enriched text chunk from analysis
    if (profile.research_data && profile.research_hash) {
      const qaKeywords = (qaAnalysis.new_keywords_discovered as string[]) ?? [];
      const qaTopics = (qaAnalysis.new_topics_discovered as string[]) ?? [];
      const qaOpportunities = (qaAnalysis.content_opportunities as Array<Record<string, unknown>> ?? [])
        .map((o) => `${o.platform}: ${o.topic} (${o.target_keyword})`);
      const qaGaps = (qaAnalysis.priority_gaps as Array<Record<string, unknown>> ?? [])
        .map((g) => `${g.channel}: ${g.gap}`);
      const narrative = String(qaAnalysis.qa_narrative ?? "");

      // Merge QA intelligence into research_data for vectorize embedding
      const enrichedResearchData = {
        ...(profile.research_data as Record<string, unknown>),
        qa_intelligence: {
          brand_identity: { official_name: profile.brand_name, industry: (sot.market_intelligence as Record<string, unknown>)?.category ?? "" },
          content_intelligence: {
            primary_keywords: qaKeywords,
            content_topics: qaTopics,
            content_gaps: qaGaps,
          },
          qa_summary: narrative,
          qa_opportunities: qaOpportunities,
          geo_mention_rate: geoMentionRate,
          social_found_rate: socialFoundRate,
          seo_found_rate: seoFoundRate,
          negative_findings: geoResults.filter((r) => !r.brand_mentioned).map((r) => r.question).slice(0, 5),
        },
      };

      const qaHash = `qa_${profile.research_hash}_${Date.now()}`;
      supabase.functions.invoke("brand-vectorize", {
        body: {
          brand_profile_id,
          user_id,
          brand_name: profile.brand_name,
          country: profile.country,
          research_hash: qaHash,
          research_version: (profile.research_version as number ?? 1),
          research_data: enrichedResearchData,
        },
      }).catch((e: Error) => console.error(`[brand-qa-engine] vectorize chain failed: ${e.message}`));

      console.log(`[brand-qa-engine] Fired brand-vectorize with QA-enriched data (hash: ${qaHash})`);
    }

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      tier: effectiveTier,
      probes_run: geoResults.length + socialResults.length + seoResults.length,
      geo_mention_rate: geoMentionRate,
      social_found_rate: socialFoundRate,
      seo_found_rate: seoFoundRate,
      overall_score: overallScore,
      priority_gaps: gapCount,
      new_keywords_discovered: newKeywords,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-qa-engine] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
