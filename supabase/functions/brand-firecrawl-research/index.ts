import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Firecrawl Research

   Deep-crawls 6 prioritized URLs from Gemini research_seeds.firecrawl:
   - Brand's own pages (about, products, press, homepage)
   - Competitor homepages
   Extracts: content depth, topics, SEO structure, product catalog,
   internal links, quality signals, content gaps.

   Parallel: max 3 concurrent crawls to stay within limits.
   Output: brand_profiles.firecrawl_data JSONB
   Then: calls brand-consolidator (partial=true)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const MAX_CONCURRENT = 3;

interface FirecrawlSeed {
  url: string;
  priority: number;
  intent: string;
  options?: {
    formats?: string[];
    onlyMainContent?: boolean;
    excludeTags?: string[];
  };
}

interface ResearchSeeds {
  firecrawl?: FirecrawlSeed[];
}

interface CrawlResult {
  url: string;
  intent: string;
  priority: number;
  title: string;
  word_count: number;
  headings: string[];
  key_topics: string[];
  internal_links: string[];
  external_links: string[];
  content_quality: "strong" | "moderate" | "weak";
  has_product_info: boolean;
  has_contact_info: boolean;
  markdown_preview: string;
  error?: string;
}

// ── Scrape a single URL via Firecrawl ─────────────────────────────────────────
async function scrapeUrl(seed: FirecrawlSeed): Promise<CrawlResult> {
  const options = seed.options ?? {
    formats: ["markdown", "links"],
    onlyMainContent: true,
    excludeTags: ["nav", "footer", "script", "style", "header"],
  };

  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: seed.url, ...options }),
  });

  const base: CrawlResult = {
    url: seed.url,
    intent: seed.intent,
    priority: seed.priority,
    title: "",
    word_count: 0,
    headings: [],
    key_topics: [],
    internal_links: [],
    external_links: [],
    content_quality: "weak",
    has_product_info: false,
    has_contact_info: false,
    markdown_preview: "",
  };

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[brand-firecrawl-research] ${seed.url}: ${res.status} — ${err.slice(0, 100)}`);
    return { ...base, error: `HTTP ${res.status}` };
  }

  const data = await res.json() as {
    success?: boolean;
    data?: {
      markdown?: string;
      links?: string[];
      metadata?: { title?: string; description?: string };
    };
  };

  if (!data.success || !data.data) {
    return { ...base, error: "Firecrawl: no data returned" };
  }

  const markdown = data.data.markdown ?? "";
  const links = data.data.links ?? [];
  const metadata = data.data.metadata ?? {};

  // Extract title
  const title = metadata.title ?? markdown.split("\n").find((l) => l.startsWith("# "))?.slice(2) ?? "";

  // Count words
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;

  // Extract headings (H1-H3)
  const headings = markdown
    .split("\n")
    .filter((l) => /^#{1,3}\s/.test(l))
    .map((l) => l.replace(/^#{1,3}\s/, "").trim())
    .slice(0, 10);

  // Extract key topics from headings + first sentences
  const topicWords = new Map<string, number>();
  const contentText = markdown.slice(0, 3000).toLowerCase();
  const words = contentText.split(/\W+/).filter((w) => w.length > 4);
  const stopWords = new Set(["dengan", "untuk", "yang", "dari", "kami", "kamu", "adalah", "dalam", "pada", "tidak", "akan", "atau", "juga", "telah", "their", "they", "that", "this", "have", "with", "from", "your", "more", "about", "also", "what"]);
  for (const word of words) {
    if (!stopWords.has(word)) topicWords.set(word, (topicWords.get(word) ?? 0) + 1);
  }
  const keyTopics = [...topicWords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  // Categorize links
  let baseDomain = "";
  try { baseDomain = new URL(seed.url).hostname; } catch { /* ignore */ }

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  for (const link of links) {
    try {
      const linkDomain = new URL(link).hostname;
      if (linkDomain === baseDomain) internalLinks.push(link);
      else externalLinks.push(link);
    } catch { /* skip */ }
  }

  // Content quality signals
  const hasProductInfo = /\b(harga|price|rp|idr|buy|shop|product|produk|checkout|cart)\b/i.test(markdown);
  const hasContactInfo = /\b(contact|kontak|phone|telepon|email|whatsapp|wa)\b/i.test(markdown);
  const contentQuality: "strong" | "moderate" | "weak" =
    wordCount > 800 && headings.length > 3 ? "strong"
    : wordCount > 300 ? "moderate"
    : "weak";

  return {
    url: seed.url,
    intent: seed.intent,
    priority: seed.priority,
    title: title.slice(0, 100),
    word_count: wordCount,
    headings,
    key_topics: keyTopics,
    internal_links: internalLinks.slice(0, 10),
    external_links: externalLinks.slice(0, 5),
    content_quality: contentQuality,
    has_product_info: hasProductInfo,
    has_contact_info: hasContactInfo,
    markdown_preview: markdown.slice(0, 600),
  };
}

// ── Run crawls with max concurrency ──────────────────────────────────────────
async function runConcurrent(seeds: FirecrawlSeed[], maxConcurrent: number): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  for (let i = 0; i < seeds.length; i += maxConcurrent) {
    const batch = seeds.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(batch.map((s) => scrapeUrl(s)));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
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

    const { brand_profile_id, user_id, research_seeds, brand_name, country: _country, research_hash } = body;

    if (!brand_profile_id || !brand_name) {
      return new Response(JSON.stringify({ error: "brand_profile_id and brand_name required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const seeds: FirecrawlSeed[] = research_seeds?.firecrawl ?? [];

    if (seeds.length === 0) {
      // Fetch website from profile as fallback
      const { data: profile } = await supabase
        .from("brand_profiles")
        .select("website_url")
        .eq("id", brand_profile_id)
        .single();

      if (!profile?.website_url) {
        console.log(`[brand-firecrawl-research] No seeds and no website URL — skipping`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_urls" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }

      // Fallback: crawl known pages of the brand website
      const base = profile.website_url.replace(/\/$/, "");
      seeds.push(
        { url: base, priority: 6, intent: "brand_overview" },
        { url: `${base}/about`, priority: 10, intent: "about" },
        { url: `${base}/products`, priority: 9, intent: "product_catalog" },
      );
    }

    // Sort by priority (highest first)
    seeds.sort((a, b) => b.priority - a.priority);
    const urlsToScrape = seeds.slice(0, 6);

    console.log(`[brand-firecrawl-research] Crawling ${urlsToScrape.length} URLs for: ${brand_name}`);

    const pages = await runConcurrent(urlsToScrape, MAX_CONCURRENT);
    const successfulPages = pages.filter((p) => !p.error);
    const competitorPages = pages.filter((p) => p.intent?.includes("competitor") && !p.error);
    const brandPages = successfulPages.filter((p) => !p.intent?.includes("competitor"));

    // Aggregate content intelligence
    const allTopics = [...new Set(brandPages.flatMap((p) => p.key_topics))];
    const allHeadings = brandPages.flatMap((p) => p.headings);
    const topicCoverage = allTopics.slice(0, 15);

    const totalWords = brandPages.reduce((s, p) => s + p.word_count, 0);
    const contentDepth: "deep" | "moderate" | "shallow" =
      totalWords > 5000 ? "deep"
      : totalWords > 2000 ? "moderate"
      : "shallow";

    const hasProductCatalog = brandPages.some((p) => p.intent === "product_catalog" || p.has_product_info);
    const aboutNarrative = brandPages.find((p) => p.intent === "about")?.markdown_preview ?? "";

    // SEO quality signals from brand pages
    const avgContentQuality = brandPages.filter((p) => p.content_quality === "strong").length;
    const seoQuality = {
      h_structure: allHeadings.length > 5 ? "good" : "needs_improvement",
      avg_word_count: Math.round(totalWords / Math.max(brandPages.length, 1)),
      pages_with_strong_content: avgContentQuality,
      internal_linking: brandPages.reduce((s, p) => s + p.internal_links.length, 0),
    };

    // Competitive analysis from competitor pages
    const competitorAnalysis = competitorPages.map((p) => ({
      url: p.url,
      title: p.title,
      word_count: p.word_count,
      top_topics: p.key_topics.slice(0, 5),
      content_quality: p.content_quality,
      has_product_catalog: p.has_product_info,
    }));

    // Identify opportunities (topics competitors cover that brand doesn't)
    const brandTopicsSet = new Set(topicCoverage);
    const competitorTopics = competitorPages.flatMap((p) => p.key_topics);
    const opportunities = [...new Set(competitorTopics)]
      .filter((t) => !brandTopicsSet.has(t))
      .slice(0, 8)
      .map((t) => `Consider content around "${t}" — competitor covers it`);

    const firecrawlData = {
      pages: pages.map((p) => ({
        url: p.url,
        intent: p.intent,
        priority: p.priority,
        title: p.title,
        word_count: p.word_count,
        headings: p.headings.slice(0, 6),
        key_topics: p.key_topics.slice(0, 6),
        content_quality: p.content_quality,
        has_product_info: p.has_product_info,
        has_contact_info: p.has_contact_info,
        internal_links_count: p.internal_links.length,
        error: p.error,
      })),
      content_intelligence: {
        topic_coverage: topicCoverage,
        content_depth: contentDepth,
        total_words_indexed: totalWords,
        has_product_catalog: hasProductCatalog,
        about_narrative: aboutNarrative.slice(0, 400),
        seo_quality: seoQuality,
        all_headings: allHeadings.slice(0, 20),
      },
      competitive_pages: competitorAnalysis,
      opportunities,
      urls_crawled: pages.length,
      successful_crawls: successfulPages.length,
      research_hash,
      crawled_at: new Date().toISOString(),
    };

    // Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({ firecrawl_data: firecrawlData })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    console.log(`[brand-firecrawl-research] Done. Crawled:${pages.length} Success:${successfulPages.length} Topics:${topicCoverage.length}`);

    // Chain to consolidator
    supabase.functions.invoke("brand-consolidator", {
      body: { brand_profile_id, user_id, partial: true, source: "firecrawl" },
    }).catch((e: Error) => console.error(`[brand-firecrawl-research] consolidator chain failed: ${e.message}`));

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      urls_crawled: pages.length,
      successful_crawls: successfulPages.length,
      topics_found: topicCoverage.length,
      opportunities_found: opportunities.length,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-firecrawl-research] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
