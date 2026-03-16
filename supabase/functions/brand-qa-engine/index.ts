import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand QA Engine (Orchestrator: Question Gen + GEO Probes)

   Every 2 weeks, runs a brand presence audit split across 2 functions:
   1. THIS FUNCTION (brand-qa-engine):
      - Claude generates targeted QA questions (GEO + Social + SEO)
      - Executes GEO probes via Perplexity sonar (parallel batches of 4)
      - Fires brand-qa-serp with GEO results + remaining queries

   2. brand-qa-serp (Social + SEO + Analysis + History):
      - Executes Social/SEO probes via SerpAPI
      - Claude analyzes all probe results → qa_report
      - Saves to brand_profiles.qa_analytics
      - Writes to brand_qa_history
      - Fires brand-daily-learner + brand-vectorize

   Split reason: 150s wall-clock limit per edge function invocation.
   GEO probes (Perplexity) + Social/SEO (SerpAPI sequential) need ~2-3 min total.

   TRIGGERS:
   - brand-consolidator → sot_ready (biweekly cycle)
   - Manual: POST { brand_profile_id, user_id, tier? }
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const PERPLEXITY_MODEL = "sonar";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

const TIER_CONFIG = {
  basic:      { geo: 5,  social: 6,  seo: 4  },
  pro:        { geo: 10, social: 12, seo: 8  },
  enterprise: { geo: 18, social: 20, seo: 12 },
} as const;

type Tier = keyof typeof TIER_CONFIG;

interface QAQuestion {
  id: string;
  question: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  expected_mention: boolean;
}

interface SerpQA {
  id: string;
  query: string;
  platform: string;
  intent: string;
}

interface GEOProbeResult {
  id: string;
  question: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  brand_mentioned: boolean;
  mention_context: string;
  position_in_response: "prominent" | "mentioned" | "not_found";
  competitors_mentioned: string[];
}

async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 3000): Promise<string> {
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
      console.warn(`[brand-qa-engine] Perplexity probe failed: ${res.status}`);
      return { answer: "", brand_mentioned: false, context: "", competitors: [] };
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content ?? "";
    const brandTerms = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const answerLower = answer.toLowerCase();
    const brand_mentioned = brandTerms.some((term) => answerLower.includes(term));

    let context = "";
    if (brand_mentioned) {
      const brandIdx = brandTerms.map((t) => answerLower.indexOf(t)).find((i) => i >= 0) ?? 0;
      context = answer.slice(Math.max(0, brandIdx - 50), brandIdx + 150).trim();
    }

    const competitorPattern = /(?:seperti|like|such as|vs|compared to|alternatives?:?)\s+([A-Z][a-zA-Z\s]{2,20})/gi;
    const competitors: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = competitorPattern.exec(answer)) !== null) {
      const name = m[1].trim();
      if (!brandTerms.some((t) => name.toLowerCase().includes(t))) competitors.push(name);
    }

    return { answer, brand_mentioned, context, competitors: [...new Set(competitors)].slice(0, 3) };
  } catch (e) {
    console.error(`[brand-qa-engine] GEO probe error: ${e instanceof Error ? e.message : String(e)}`);
    return { answer: "", brand_mentioned: false, context: "", competitors: [] };
  }
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
  let brand_profile_id = "";

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      tier?: Tier;
      force?: boolean;
    };

    const { user_id, tier, force = false } = body;
    brand_profile_id = body.brand_profile_id;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, source_of_truth, serpapi_data, qa_analytics, qa_updated_at, qa_tier")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile?.source_of_truth) {
      return new Response(JSON.stringify({ error: "Source of truth not ready — run consolidator first" }), {
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

    // Resolve tier: brand override > plan quota > request param > "basic"
    let planTier: Tier = tier ?? "basic";
    if (!profile.qa_tier) {
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("plan_id, plans!inner(slug)")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const rawSlug = (subRow?.plans as { slug: string } | null)?.slug ?? "trial";
      // plans.slug uses "premium" but plan_quotas.plan_name uses "pro"
      const planSlug = rawSlug === "premium" ? "pro" : rawSlug;
      const { data: planQuota } = await supabase
        .from("plan_quotas")
        .select("qa_tier")
        .eq("plan_name", planSlug)
        .single();
      if (planQuota?.qa_tier) planTier = planQuota.qa_tier as Tier;
    }
    const effectiveTier: Tier = (profile.qa_tier as Tier) ?? planTier;
    const counts = TIER_CONFIG[effectiveTier] ?? TIER_CONFIG.basic;
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

    const serpContext = serpData ? JSON.stringify({
      quick_wins: (serpData.keyword_intelligence as Record<string, unknown>)?.quick_wins,
      paa_ideas: (serpData.keyword_intelligence as Record<string, unknown>)?.paa_content_ideas,
    }, null, 0).slice(0, 800) : "";

    const qGenResponse = await callClaude(
      `You are a Brand QA Specialist designing precise probe questions to test "${profile.brand_name}" brand presence across three channels: GEO (AI platforms), Social Search, and SEO.
Output ONLY valid JSON arrays. No other text.`,
      `Generate QA probe questions for brand: "${profile.brand_name}" (${profile.country})

CONTEXT:
${sotContext}
${serpContext ? `SERP INTEL: ${serpContext}` : ""}

Generate exactly:
- ${counts.geo} GEO questions (test AI platform visibility — Perplexity/ChatGPT style questions)
- ${counts.social} Social search queries (test presence on TikTok/Instagram/YouTube/LinkedIn)
- ${counts.seo} SEO queries (test Google presence — brand + category + commercial intent)

GEO QUESTION TYPES — mix positive AND negative/critical:

POSITIVE/NEUTRAL (60% of GEO questions):
- "Apa rekomendasi [category] terbaik di [country]?" (awareness)
- "Saya cari [product] yang bagus, apa yang kamu rekomendasikan?" (recommendation)
- "Apa alternatif selain [competitor]?" (competitive discovery)

NEGATIVE/CRITICAL (40% of GEO questions — finds blind spots and reputation gaps):
- "Apa keluhan/masalah umum tentang [brand_name]?" (complaint probe)
- "Kenapa orang tidak suka [brand_name]?" (negative sentiment)
- "Apa kekurangan/kelemahan [brand_name] dibanding kompetitor?" (weakness probe)
- "[brand_name] worth it atau tidak? Ada pengalaman buruk?" (value + negative experience)
- "Apakah [brand_name] terpercaya? Apa kontroversinya?" (trust probe)
- "Kenapa pilih [competitor] daripada [brand_name]?" (competitive disadvantage)

SOCIAL QUERY TYPES:
- Mix: ${Math.ceil(counts.social * 0.4)} tiktok, ${Math.ceil(counts.social * 0.3)} instagram, ${Math.ceil(counts.social * 0.2)} youtube, rest linkedin/pinterest

SEO QUERY TYPES:
- Branded: "[brand name]", "[brand name] review", "[brand name] price"
- Category: "[category] terbaik [country]", "buy [product]"
- Competitive: "[brand name] vs [competitor]"

OUTPUT this exact JSON (no other text):
{
  "geo_questions": [
    { "id": "geo_1", "question": "<natural language question in ${profile.country === "Indonesia" ? "Bahasa Indonesia" : "English"}>", "intent": "brand_awareness|recommendation|competitive_discovery|reputation|category_search|negative_review|complaint|comparison_negative", "sentiment": "positive|neutral|negative", "expected_mention": true }
  ],
  "social_queries": [
    { "id": "soc_1", "query": "<search query>", "platform": "tiktok|instagram|youtube|linkedin|pinterest", "intent": "brand_presence|keyword_visibility|topic_discovery|competitive" }
  ],
  "seo_queries": [
    { "id": "seo_1", "query": "<search query>", "platform": "google", "intent": "brand_presence|keyword_visibility|topic_discovery|competitive" }
  ]
}`,
    );

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
            sentiment: q.sentiment ?? "neutral",
            brand_mentioned: probe.brand_mentioned,
            mention_context: probe.context.slice(0, 200),
            position_in_response: positionLabel,
            competitors_mentioned: probe.competitors,
          } satisfies GEOProbeResult;
        }),
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") geoResults.push(r.value);
      }

      if (i + geoBatchSize < qaQuestions.geo_questions.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const geoMentionRate = geoResults.length > 0
      ? Math.round((geoResults.filter((r) => r.brand_mentioned).length / geoResults.length) * 100) : 0;

    console.log(`[brand-qa-engine] GEO done: ${geoResults.length} probes, mention_rate: ${geoMentionRate}% — firing brand-qa-serp`);

    // ── STEP 3: Fire brand-qa-serp (Social+SEO+Analysis) — fire-and-forget ──────
    supabase.functions.invoke("brand-qa-serp", {
      body: {
        brand_profile_id,
        user_id,
        brand_name: profile.brand_name,
        country: profile.country,
        tier: effectiveTier,
        geo_results: geoResults,
        geo_mention_rate: geoMentionRate,
        social_queries: qaQuestions.social_queries,
        seo_queries: qaQuestions.seo_queries,
      },
    }).catch((e: Error) => console.error(`[brand-qa-engine] qa-serp chain failed: ${e.message}`));

    return new Response(JSON.stringify({
      success: true,
      status: "qa_in_progress",
      brand_profile_id,
      tier: effectiveTier,
      geo_probes_done: geoResults.length,
      geo_mention_rate: geoMentionRate,
      social_seo_queued: qaQuestions.social_queries.length + qaQuestions.seo_queries.length,
      message: "GEO probes complete. Social+SEO analysis running async via brand-qa-serp.",
    }), { status: 202, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-qa-engine] ERROR: ${message}`);

    if (brand_profile_id) {
      supabase.from("brand_profiles").update({
        error_details: { message, step: "brand-qa-engine", timestamp: new Date().toISOString() },
        error_at: new Date().toISOString(),
        error_step: "brand-qa-engine",
      }).eq("id", brand_profile_id).catch(() => {});
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
