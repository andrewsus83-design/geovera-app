import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand SerpAPI Research

   Runs 8 targeted SERP queries from Gemini research_seeds.serpapi to map:
   - Brand digital presence & rankings across search
   - Keyword intelligence: what ranks, what gaps, what wins
   - Competitor SERP positioning
   - What's working (good signals) vs what's broken (bad signals)
   - News coverage monitoring
   - People Also Ask questions (content opportunities)

   Rate limit: 500ms gap between queries (SerpAPI free tier safe)
   Output: brand_profiles.serpapi_data JSONB
   Then: calls brand-consolidator (partial=true)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY")!;
const SERPAPI_BASE = "https://serpapi.com/search.json";

interface SerpSeed {
  engine: string;
  q: string;
  gl?: string;
  hl?: string;
  num?: number;
  tbs?: string | null;
  type?: string;
}

interface ResearchSeeds {
  serpapi?: SerpSeed[];
}

// ── Run a single SerpAPI query ────────────────────────────────────────────────
async function runSerpQuery(seed: SerpSeed): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    api_key: SERPAPI_KEY,
    engine: seed.engine ?? "google",
    q: seed.q,
    gl: seed.gl ?? "us",
    hl: seed.hl ?? "en",
    num: String(seed.num ?? 20),
  });

  if (seed.tbs) params.set("tbs", seed.tbs);
  if (seed.type === "news") params.set("tbm", "nws");

  const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI ${res.status}: ${err.slice(0, 200)}`);
  }
  return await res.json() as Record<string, unknown>;
}

// ── Find brand position in organic results ────────────────────────────────────
function findBrandPosition(
  results: Array<Record<string, unknown>>,
  brandName: string,
  websiteUrl?: string,
): { position: number | null; url: string | null; snippet: string | null } {
  const brandTerms = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const hostname = websiteUrl ? (() => { try { return new URL(websiteUrl).hostname.replace("www.", ""); } catch { return null; } })() : null;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const url = String(r.link ?? r.url ?? "").toLowerCase();
    const title = String(r.title ?? "").toLowerCase();
    const snippet = String(r.snippet ?? "").toLowerCase();

    const matchesDomain = hostname && url.includes(hostname);
    const matchesBrand = brandTerms.some((term) => url.includes(term) || title.includes(term));

    if (matchesDomain || matchesBrand) {
      return {
        position: i + 1,
        url: String(r.link ?? r.url ?? ""),
        snippet: String(r.snippet ?? "").slice(0, 200),
      };
    }
  }
  return { position: null, url: null, snippet: null };
}

// ── Extract PAA questions ─────────────────────────────────────────────────────
function extractPAA(data: Record<string, unknown>): string[] {
  const paa = data.related_questions as Array<Record<string, unknown>> ?? [];
  return paa.slice(0, 5).map((q) => String(q.question ?? "")).filter(Boolean);
}

// ── Extract news results ──────────────────────────────────────────────────────
function extractNews(data: Record<string, unknown>): Array<{ title: string; source: string; url: string; date: string }> {
  const newsResults = data.news_results as Array<Record<string, unknown>> ?? [];
  const organic = (data.organic_results as Array<Record<string, unknown>> ?? []);
  const all = [...newsResults, ...organic];

  return all.slice(0, 8).map((r) => ({
    title: String(r.title ?? ""),
    source: String((r.source as Record<string, unknown>)?.name ?? r.source ?? r.displayed_link ?? ""),
    url: String(r.link ?? r.url ?? ""),
    date: String(r.date ?? r.published_date ?? ""),
  })).filter((r) => r.title);
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

    // Fetch website from profile for brand position detection
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("website_url")
      .eq("id", brand_profile_id)
      .single();

    const websiteUrl = profile?.website_url;

    console.log(`[brand-serpapi-research] Starting: ${brand_name} (${country}), ${(research_seeds?.serpapi?.length ?? 0)} seeds`);

    const seeds: SerpSeed[] = research_seeds?.serpapi ?? [];

    // Fallback seeds if none provided
    const cc = country.toLowerCase() === "indonesia" ? "id" : "sg";
    const hl = country.toLowerCase() === "indonesia" ? "id" : "en";
    const fallbackSeeds: SerpSeed[] = [
      { engine: "google", q: `${brand_name} review`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} vs competitors`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} price`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} alternative`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} complaints problems`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} ${country}`, gl: cc, hl, num: 20 },
      { engine: "google", q: `${brand_name} news`, gl: cc, hl, num: 10, tbs: "qdr:m", type: "news" },
      { engine: "google", q: brand_name, gl: cc, hl, num: 20 },
    ];

    const queriesToRun = seeds.length > 0 ? seeds : fallbackSeeds;

    // Run queries sequentially with 500ms gap (rate limit protection)
    const serpResults: Array<{
      query: string;
      brand_position: number | null;
      brand_url: string | null;
      top_domains: string[];
      paa_questions: string[];
      featured_snippet: string | null;
      organic_count: number;
      is_news: boolean;
      news_items?: Array<{ title: string; source: string; url: string; date: string }>;
    }> = [];

    for (let i = 0; i < queriesToRun.length; i++) {
      const seed = queriesToRun[i];
      if (i > 0) await new Promise((r) => setTimeout(r, 500));

      try {
        const data = await runSerpQuery(seed);
        const organic = (data.organic_results as Array<Record<string, unknown>>) ?? [];
        const isNews = seed.type === "news";
        const brandPos = findBrandPosition(organic, brand_name, websiteUrl);

        const topDomains = organic.slice(0, 10)
          .map((r) => { try { return new URL(String(r.link ?? r.url ?? "")).hostname.replace("www.", ""); } catch { return ""; } })
          .filter(Boolean);

        const featuredSnippet = (data.answer_box as Record<string, unknown>)?.answer as string
          ?? (data.answer_box as Record<string, unknown>)?.snippet as string
          ?? null;

        const result = {
          query: seed.q,
          brand_position: brandPos.position,
          brand_url: brandPos.url,
          top_domains: [...new Set(topDomains)].slice(0, 8),
          paa_questions: extractPAA(data),
          featured_snippet: featuredSnippet ? String(featuredSnippet).slice(0, 300) : null,
          organic_count: organic.length,
          is_news: isNews,
          ...(isNews && { news_items: extractNews(data) }),
        };
        serpResults.push(result);
        console.log(`[brand-serpapi-research] "${seed.q}" → brand pos: ${brandPos.position ?? "not found"}`);
      } catch (e) {
        console.error(`[brand-serpapi-research] query failed: "${seed.q}" — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Aggregate brand rankings
    const foundIn = serpResults
      .filter((r) => r.brand_position !== null)
      .map((r) => ({ query: r.query, position: r.brand_position!, url: r.brand_url }));

    const notFoundIn = serpResults
      .filter((r) => r.brand_position === null && !r.is_news)
      .map((r) => r.query);

    const avgPosition = foundIn.length > 0
      ? Math.round(foundIn.reduce((s, r) => s + r.position, 0) / foundIn.length)
      : null;

    // Competitor keyword analysis
    const domainCount = new Map<string, number>();
    for (const r of serpResults) {
      for (const d of r.top_domains) {
        domainCount.set(d, (domainCount.get(d) ?? 0) + 1);
      }
    }
    const competitorDomains = [...domainCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([d]) => !d.includes(brand_name.toLowerCase().split(" ")[0]) && d.length > 3)
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, appears_in: count, queries: count }));

    // Content gaps = queries where brand not found + has featured snippets owned by others
    const contentGaps = notFoundIn.map((q) => ({
      keyword: q,
      top_domain: serpResults.find((r) => r.query === q)?.top_domains[0] ?? "unknown",
    }));

    // Quick wins = queries where brand is on page 2 (position 11-20)
    const quickWins = foundIn
      .filter((r) => r.position > 10)
      .map((r) => ({ keyword: r.query, current_position: r.position, action: "optimize content for this keyword" }));

    // All PAA questions = content ideas
    const allPAA = [...new Set(serpResults.flatMap((r) => r.paa_questions))].slice(0, 15);

    // News coverage
    const newsCoverage = serpResults
      .filter((r) => r.is_news)
      .flatMap((r) => r.news_items ?? [])
      .slice(0, 10);

    // What's good vs bad analysis
    const whatsGood: string[] = [];
    const whatsBad: string[] = [];

    if (foundIn.length > 0) whatsGood.push(`Brand appears in ${foundIn.length} of ${serpResults.length} searches`);
    if (avgPosition && avgPosition <= 5) whatsGood.push(`Strong avg ranking position: #${avgPosition}`);
    if (newsCoverage.length > 0) whatsGood.push(`${newsCoverage.length} news articles found — media presence active`);
    if (serpResults.some((r) => r.featured_snippet)) whatsGood.push("Featured snippet captured for at least one query");

    if (notFoundIn.length > serpResults.length / 2) whatsBad.push(`Brand not found in ${notFoundIn.length} key searches`);
    if (avgPosition && avgPosition > 10) whatsBad.push(`Low avg position (${avgPosition}) — needs SEO work`);
    if (contentGaps.length > 3) whatsBad.push(`${contentGaps.length} content gaps where competitors dominate`);
    if (newsCoverage.length === 0) whatsBad.push("No recent news coverage — consider PR strategy");

    const serpApiData = {
      serp_results: serpResults,
      brand_rankings: {
        found_in: foundIn,
        not_found_in: notFoundIn,
        avg_position: avgPosition,
        visibility_score: Math.round((foundIn.length / Math.max(serpResults.length, 1)) * 100),
      },
      keyword_intelligence: {
        competitor_domains: competitorDomains,
        content_gaps: contentGaps,
        quick_wins: quickWins,
        paa_content_ideas: allPAA,
      },
      whats_good: whatsGood,
      whats_bad: whatsBad,
      news_coverage: newsCoverage,
      knowledge_panel_detected: serpResults.some((r) => r.featured_snippet !== null),
      queries_run: serpResults.length,
      research_hash,
      scraped_at: new Date().toISOString(),
    };

    // Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({ serpapi_data: serpApiData })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    console.log(`[brand-serpapi-research] Done. Queries:${serpResults.length} Found:${foundIn.length} Gaps:${contentGaps.length} AvgPos:${avgPosition}`);

    // Chain to consolidator
    supabase.functions.invoke("brand-consolidator", {
      body: { brand_profile_id, user_id, partial: true, source: "serpapi" },
    }).catch((e: Error) => console.error(`[brand-serpapi-research] consolidator chain failed: ${e.message}`));

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      queries_run: serpResults.length,
      brand_found_in: foundIn.length,
      content_gaps: contentGaps.length,
      avg_position: avgPosition,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-serpapi-research] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
