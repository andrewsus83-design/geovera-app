import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Perplexity Deep Research

   Uses tool-native seeds from brand-indexer-gemini to run very deep
   Perplexity research across 4 dimensions:
     1. Market research (size, dynamics, players)
     2. Competitor research (strengths, strategies, presence)
     3. Trend research (trending now, emerging, declining)
     4. Opportunity research (gaps, quick wins, strategic plays)

   Model: sonar-deep-research (Perplexity's most capable research model)
   Queries: 12 total — 3 batches × 4 queries from Gemini seeds
   Parallel: 4 queries per batch run simultaneously
   Output: brand_profiles.perplexity_data JSONB
   Then: calls brand-consolidator (partial=true)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-deep-research";

interface PerplexityQuery {
  query: string;
  search_recency_filter?: "hour" | "day" | "week" | "month" | "year" | "none";
}

interface ResearchSeeds {
  perplexity?: {
    evergreen?: PerplexityQuery[];
    time_sensitive?: PerplexityQuery[];
    geo_visibility?: PerplexityQuery[];
  };
}

// ── Run a single Perplexity query ────────────────────────────────────────────
async function runQuery(
  query: string,
  recencyFilter: string,
  systemContext: string,
): Promise<{ answer: string; citations: Array<{ url: string; title?: string }> }> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: systemContext },
      { role: "user", content: query },
    ],
    max_tokens: 2048,
    temperature: 0.1,
    return_citations: true,
    return_related_questions: false,
  };

  if (recencyFilter && recencyFilter !== "none") {
    body.search_recency_filter = recencyFilter;
  }

  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
  };

  const answer = data.choices?.[0]?.message?.content ?? "";
  const citations = (data.citations ?? []).map((url) => ({ url }));
  return { answer, citations };
}

// ── Run a batch of queries in parallel ──────────────────────────────────────
async function runBatch(
  queries: PerplexityQuery[],
  systemContext: string,
  batchName: string,
): Promise<Array<{ query: string; answer: string; citations: Array<{ url: string }> }>> {
  console.log(`[brand-perplexity-deep] Running ${batchName} batch (${queries.length} queries)`);

  const results = await Promise.allSettled(
    queries.map((q) => runQuery(q.query, q.search_recency_filter ?? "none", systemContext)
      .then((r) => ({ query: q.query, ...r }))
    ),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<{ query: string; answer: string; citations: Array<{ url: string }> }> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── Extract key insight from answer text ─────────────────────────────────────
function extractKeyPoints(answer: string): string[] {
  const points: string[] = [];
  const lines = answer.split("\n").filter((l) => l.trim().length > 20);
  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
    if (clean.length > 15) points.push(clean);
  }
  return points.slice(0, 5);
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
      research_seeds: ResearchSeeds;
      brand_name: string;
      country: string;
      research_hash: string;
    };

    const { brand_profile_id, user_id, research_seeds, brand_name, country, research_hash } = body;

    if (!brand_profile_id || !brand_name) {
      return new Response(JSON.stringify({ error: "brand_profile_id and brand_name required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[brand-perplexity-deep] Starting: ${brand_name} (${country})`);

    const seeds = research_seeds?.perplexity ?? {};
    const evergreen = seeds.evergreen ?? [];
    const timeSensitive = seeds.time_sensitive ?? [];
    const geoVisibility = seeds.geo_visibility ?? [];

    // Fallback queries if seeds are empty
    const fallbackQueries = (type: string): PerplexityQuery[] => [
      { query: `${brand_name} brand market analysis ${country} 2025`, search_recency_filter: "none" },
      { query: `${brand_name} competitors in ${country}`, search_recency_filter: "none" },
      { query: `${brand_name} brand reviews reputation ${country}`, search_recency_filter: "month" },
      { query: `${brand_name} digital presence ${type} strategy`, search_recency_filter: "none" },
    ];

    const systemContext = `You are a senior brand intelligence analyst specializing in ${country} markets.
Research the brand "${brand_name}" thoroughly. Provide specific, factual insights with sources.
Focus on actionable intelligence. Be concise but comprehensive. Use data and examples.`;

    // Run all 3 batches in parallel
    const [evergreenResults, timeSensitiveResults, geoResults] = await Promise.all([
      runBatch(evergreen.length > 0 ? evergreen : fallbackQueries("market"), systemContext, "evergreen"),
      runBatch(timeSensitive.length > 0 ? timeSensitive : fallbackQueries("trend"), systemContext, "time_sensitive"),
      runBatch(geoVisibility.length > 0 ? geoVisibility : fallbackQueries("digital"), systemContext, "geo_visibility"),
    ]);

    const allResults = [...evergreenResults, ...timeSensitiveResults, ...geoResults];
    const allCitations = allResults.flatMap((r) => r.citations);

    // Deduplicate citations by URL
    const seenUrls = new Set<string>();
    const uniqueCitations = allCitations.filter((c) => {
      if (seenUrls.has(c.url)) return false;
      seenUrls.add(c.url);
      return true;
    }).slice(0, 30);

    // Categorize findings by research dimension
    const marketFindings = evergreenResults.flatMap((r) => extractKeyPoints(r.answer));
    const trendFindings = timeSensitiveResults.flatMap((r) => extractKeyPoints(r.answer));
    const geoFindings = geoResults.flatMap((r) => extractKeyPoints(r.answer));

    // Extract competitor mentions across all answers
    const competitorPattern = /(?:competitor|rival|vs\.?|competing with|alternative to)\s+([A-Z][a-zA-Z\s]{2,20})/gi;
    const mentionedCompetitors = new Set<string>();
    for (const r of allResults) {
      const matches = r.answer.matchAll(competitorPattern);
      for (const m of matches) {
        if (m[1] && m[1].trim().length > 2) mentionedCompetitors.add(m[1].trim());
      }
    }

    // Build perplexity_data output
    const perplexityData = {
      market_research: {
        findings: marketFindings,
        raw_answers: evergreenResults.map((r) => ({ query: r.query, summary: r.answer.slice(0, 500) })),
        market_trends: trendFindings.slice(0, 5),
        key_players: Array.from(mentionedCompetitors).slice(0, 8),
      },
      competitor_research: {
        competitors: Array.from(mentionedCompetitors).slice(0, 8).map((name) => ({
          name,
          discovered_via: "perplexity_deep_research",
        })),
        competitive_landscape: marketFindings.filter((f) =>
          f.toLowerCase().includes("compet") ||
          f.toLowerCase().includes("market") ||
          f.toLowerCase().includes("leader")
        ).slice(0, 5),
      },
      trend_research: {
        trending_now: trendFindings.slice(0, 4),
        emerging_trends: trendFindings.slice(4, 8),
        raw_answers: timeSensitiveResults.map((r) => ({ query: r.query, summary: r.answer.slice(0, 500) })),
      },
      opportunity_research: {
        gaps_found: geoFindings.filter((f) =>
          f.toLowerCase().includes("gap") ||
          f.toLowerCase().includes("opportunit") ||
          f.toLowerCase().includes("missing") ||
          f.toLowerCase().includes("potential")
        ).slice(0, 5),
        quick_wins: geoFindings.filter((f) =>
          f.toLowerCase().includes("quick") ||
          f.toLowerCase().includes("easy") ||
          f.toLowerCase().includes("low-hanging") ||
          f.toLowerCase().includes("immediate")
        ).slice(0, 3),
        strategic_opportunities: geoFindings.slice(0, 6),
        raw_answers: geoResults.map((r) => ({ query: r.query, summary: r.answer.slice(0, 500) })),
      },
      citations: uniqueCitations.slice(0, 20),
      queries_run: allResults.length,
      total_queries_attempted: evergreen.length + timeSensitive.length + geoVisibility.length,
      model: MODEL,
      research_hash,
      researched_at: new Date().toISOString(),
    };

    // Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({ perplexity_data: perplexityData })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    console.log(`[brand-perplexity-deep] Done. Queries: ${allResults.length}, Citations: ${uniqueCitations.length}`);

    // Chain to consolidator (fire-and-forget)
    supabase.functions.invoke("brand-consolidator", {
      body: { brand_profile_id, user_id, partial: true, source: "perplexity" },
    }).catch((e: Error) => console.error(`[brand-perplexity-deep] consolidator chain failed: ${e.message}`));

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      queries_run: allResults.length,
      citations_found: uniqueCitations.length,
      competitors_found: mentionedCompetitors.size,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-perplexity-deep] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
