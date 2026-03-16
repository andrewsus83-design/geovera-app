import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Apify Research

   Scrapes live brand + competitor content from the last 14 days using
   Apify actors specified in Gemini research_seeds.apify:
     - apify/instagram-scraper      → brand posts
     - clockworks/free-tiktok-scraper → brand videos
     - compass/crawler-google-places → local presence + reviews
     - apify/google-search-scraper  → SERP snippets

   Skips actors where URL/handle is null (graceful degradation).
   Polls actor run status (max 90s per actor, then skip if timeout).
   Output: brand_profiles.apify_data JSONB
   Then: calls brand-consolidator (partial=true)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;
const APIFY_BASE = "https://api.apify.com/v2";
const MAX_POLL_SECONDS = 90;
const POLL_INTERVAL_MS = 3000;

interface ApifySeed {
  actor: string;
  input: Record<string, unknown>;
}

interface ResearchSeeds {
  apify?: ApifySeed[];
}

// ── Start an Apify actor run ──────────────────────────────────────────────────
async function startActorRun(actorId: string, input: Record<string, unknown>): Promise<string> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apify start ${actorId}: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { data?: { id?: string } };
  const runId = data?.data?.id;
  if (!runId) throw new Error(`Apify: no runId returned for ${actorId}`);
  return runId;
}

// ── Poll run until done or timeout ───────────────────────────────────────────
async function pollRun(runId: string, actorLabel: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_SECONDS * 1000) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    if (!res.ok) break;
    const data = await res.json() as { data?: { status?: string } };
    const status = data?.data?.status;

    if (status === "SUCCEEDED") return true;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      console.warn(`[brand-apify-research] ${actorLabel} run ${status}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.warn(`[brand-apify-research] ${actorLabel} timed out after ${MAX_POLL_SECONDS}s`);
  return false;
}

// ── Fetch run dataset items ───────────────────────────────────────────────────
async function getDatasetItems(runId: string, limit = 30): Promise<unknown[]> {
  const res = await fetch(
    `${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=${limit}`,
  );
  if (!res.ok) return [];
  const data = await res.json() as { items?: unknown[] } | unknown[];
  return Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
}

// ── Extract top posts by engagement ──────────────────────────────────────────
function topByEngagement(
  items: unknown[],
  limit = 10,
): Array<{ id?: string; url?: string; caption?: string; likes?: number; views?: number; timestamp?: string }> {
  return (items as Array<Record<string, unknown>>)
    .map((item) => ({
      id: String(item.id ?? item.shortCode ?? ""),
      url: String(item.url ?? item.displayUrl ?? item.videoUrl ?? ""),
      caption: String(item.caption ?? item.text ?? item.description ?? "").slice(0, 200),
      likes: Number(item.likesCount ?? item.likes ?? item.diggCount ?? 0),
      views: Number(item.videoViewCount ?? item.viewCount ?? item.playCount ?? 0),
      timestamp: String(item.timestamp ?? item.takenAtTimestamp ?? item.createTime ?? ""),
    }))
    .sort((a, b) => (b.likes + b.views) - (a.likes + a.views))
    .slice(0, limit);
}

// ── Extract top topics from post captions ─────────────────────────────────────
function extractTopics(items: Array<{ caption?: string }>): string[] {
  const wordCount = new Map<string, number>();
  for (const item of items) {
    const words = (item.caption ?? "").toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4 && !["yang", "dengan", "untuk", "dari", "ini", "itu", "dan", "atau", "juga"].includes(w));
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
    }
  }
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

// ── Run a single actor with timeout ───────────────────────────────────────────
async function runActor(seed: ApifySeed, label: string): Promise<unknown[] | null> {
  // Check if required URLs/handles are SKIP placeholders
  const inputStr = JSON.stringify(seed.input);
  if (inputStr.includes('"SKIP"') || inputStr.includes("SKIP")) {
    console.log(`[brand-apify-research] Skipping ${label} — no URL/handle available`);
    return null;
  }

  try {
    console.log(`[brand-apify-research] Starting ${label} (${seed.actor})`);
    const runId = await startActorRun(seed.actor, seed.input);
    const succeeded = await pollRun(runId, label);
    if (!succeeded) return null;
    return await getDatasetItems(runId, 30);
  } catch (e) {
    console.error(`[brand-apify-research] ${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
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

    console.log(`[brand-apify-research] Starting: ${brand_name} (${country})`);

    const seeds = research_seeds?.apify ?? [];

    // Build actor map from seeds
    const findSeed = (actorFragment: string): ApifySeed | undefined =>
      seeds.find((s) => s.actor.toLowerCase().includes(actorFragment.toLowerCase()));

    const igSeed = findSeed("instagram");
    const ttSeed = findSeed("tiktok");
    const mapsSeed = findSeed("google-places") ?? findSeed("compass");
    const searchSeed = findSeed("google-search");

    // Fallback seeds when Gemini seeds are missing
    const fallbackIg: ApifySeed = {
      actor: "apify/instagram-scraper",
      input: { directUrls: ["SKIP"], resultsType: "posts", resultsLimit: 30 },
    };
    const fallbackSearch: ApifySeed = {
      actor: "apify/google-search-scraper",
      input: {
        queries: [`${brand_name} review`, `${brand_name} ${country}`],
        maxPagesPerQuery: 2,
      },
    };
    const fallbackMaps: ApifySeed = {
      actor: "compass/crawler-google-places",
      input: { searchStringsArray: [`${brand_name} ${country}`], maxCrawledPlacesPerSearch: 3 },
    };

    // Run all actors concurrently (max wall-clock ≈ 90s for each, they overlap)
    const [igItems, ttItems, mapsItems, searchItems] = await Promise.all([
      runActor(igSeed ?? fallbackIg, "instagram"),
      runActor(ttSeed ?? { actor: "clockworks/free-tiktok-scraper", input: { profiles: ["SKIP"], resultsPerPage: 30 } }, "tiktok"),
      runActor(mapsSeed ?? fallbackMaps, "google-maps"),
      runActor(searchSeed ?? fallbackSearch, "google-search"),
    ]);

    // Process Instagram
    const igPosts = igItems ? topByEngagement(igItems) : [];
    const igTopics = extractTopics(igPosts);
    const igAvgEngagement = igPosts.length > 0
      ? Math.round(igPosts.reduce((s, p) => s + p.likes, 0) / igPosts.length)
      : 0;

    // Process TikTok
    const ttVideos = ttItems ? topByEngagement(ttItems) : [];
    const ttTopics = extractTopics(ttVideos);
    const ttAvgViews = ttVideos.length > 0
      ? Math.round(ttVideos.reduce((s, v) => s + v.views, 0) / ttVideos.length)
      : 0;

    // Process Google Maps
    const mapsData = (mapsItems as Array<Record<string, unknown>>) ?? [];
    const avgRating = mapsData.length > 0
      ? (mapsData.reduce((s, p) => s + Number(p.totalScore ?? p.rating ?? 0), 0) / mapsData.length).toFixed(1)
      : null;
    const totalReviews = mapsData.reduce((s, p) => s + Number(p.reviewsCount ?? p.total_reviews ?? 0), 0);

    // Process Google Search
    const searchData = (searchItems as Array<Record<string, unknown>>) ?? [];
    const serpSnippets = searchData
      .flatMap((r) => (r.organicResults as Array<Record<string, unknown>> ?? []).slice(0, 5))
      .map((r) => ({
        title: String(r.title ?? ""),
        url: String(r.url ?? r.link ?? ""),
        snippet: String(r.snippet ?? r.description ?? "").slice(0, 200),
      }))
      .slice(0, 15);

    const competitorDomains = [...new Set(
      serpSnippets
        .map((s) => {
          try { return new URL(s.url).hostname; } catch { return ""; }
        })
        .filter((d) => d && !d.includes(brand_name.toLowerCase().split(" ")[0]))
    )].slice(0, 8);

    // Cross-platform content patterns
    const allTopics = [...new Set([...igTopics, ...ttTopics])];
    const contentPatterns = {
      best_performing_topics: allTopics.slice(0, 8),
      engagement_patterns: {
        instagram: igPosts.length > 0 ? `avg ${igAvgEngagement} likes` : "no data",
        tiktok: ttVideos.length > 0 ? `avg ${ttAvgViews} views` : "no data",
      },
    };

    const apifyData = {
      instagram: {
        posts: igPosts,
        avg_engagement: igAvgEngagement,
        top_topics: igTopics,
        posts_scraped: igPosts.length,
      },
      tiktok: {
        videos: ttVideos,
        avg_views: ttAvgViews,
        top_topics: ttTopics,
        videos_scraped: ttVideos.length,
      },
      google_maps: {
        places: mapsData.slice(0, 5).map((p) => ({
          name: p.title ?? p.name,
          address: p.address,
          rating: p.totalScore ?? p.rating,
          reviews: p.reviewsCount,
          url: p.url,
        })),
        avg_rating: avgRating,
        total_reviews: totalReviews,
        places_found: mapsData.length,
      },
      google_search: {
        serp_snippets: serpSnippets,
        competitor_domains: competitorDomains,
        results_found: searchItems?.length ?? 0,
      },
      content_patterns: contentPatterns,
      actors_run: [igSeed, ttSeed, mapsSeed, searchSeed].filter(Boolean).length,
      research_hash,
      scraped_at: new Date().toISOString(),
    };

    // Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({ apify_data: apifyData })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    console.log(`[brand-apify-research] Done. IG:${igPosts.length} TT:${ttVideos.length} Maps:${mapsData.length} Search:${serpSnippets.length}`);

    // Chain to consolidator
    supabase.functions.invoke("brand-consolidator", {
      body: { brand_profile_id, user_id, partial: true, source: "apify" },
    }).catch((e: Error) => console.error(`[brand-apify-research] consolidator chain failed: ${e.message}`));

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      instagram_posts: igPosts.length,
      tiktok_videos: ttVideos.length,
      maps_places: mapsData.length,
      serp_results: serpSnippets.length,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-apify-research] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
