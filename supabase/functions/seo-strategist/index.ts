/**
 * seo-strategist — Claude Reverse Engineering Engine
 *
 * Flow:
 *  1. Load client's existing data from Supabase (onpage_cache, backlink_cache)
 *  2. Perplexity sonar → discover top 3 SERP competitors
 *  3. Firecrawl → scrape 3 key pages per competitor (parallel)
 *  4. Claude (via CF Anthropic Gateway) → reverse engineer competitor strategy
 *     covering: Topical Authority, Keywords/Intent, UX, Technical Blueprint
 *  5. Cache in seo_strategy_cache (7-day TTL)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getBrandContext,
  buildBrandContextBlock,
  buildChannelGoals,
  type BrandContext,
} from "../_shared/brandContext.ts";

// ─── Config ───────────────────────────────────────────────────────────────────
const CF_ANTHROPIC      = Deno.env.get("CF_AI_GATEWAY_ANTHROPIC")!;  // CF cached
const ANTHROPIC_KEY     = Deno.env.get("ANTHROPIC_API_KEY")!;
const PERPLEXITY_KEY    = Deno.env.get("PERPLEXITY_API_KEY")!;
const FIRECRAWL_KEY     = Deno.env.get("FIRECRAWL_API_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SK       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CLAUDE_MODEL      = "claude-3-5-sonnet-latest";  // Sonnet for deep reasoning
const FIRECRAWL_BASE    = "https://api.firecrawl.dev/v1";
const CACHE_TTL_DAYS    = 7;    // strategy refresh weekly
const MAX_PAGES_PER_COMPETITOR = 3;
const MAX_COMPETITORS   = 3;

const supabase = createClient(SUPABASE_URL, SUPABASE_SK);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorPage {
  url:          string;
  title:        string | null;
  h1:           string[];
  h2:           string[];
  h3:           string[];
  wordCount:    number;
  hasSchema:    boolean;
  internalLinks:number;
  contentExcerpt: string;   // first 1500 chars of markdown
}

interface Competitor {
  domain:  string;
  pages:   CompetitorPage[];
  reason:  string;          // why Perplexity says they rank
}

interface SEOStrategy {
  domain:       string;
  clientId:     string;
  competitors:  string[];
  overallScore: number;

  topicalAuthority: {
    currentTopics:         string[];
    missingTopics:         string[];
    recommendedClusters:   Array<{ pillar: string; supporting: string[] }>;
    contentGaps:           string[];
    competitorAdvantage:   string;
    score:                 number;
    actions:               string[];
  };

  keywordsIntent: {
    targetKeywords:        Array<{ keyword: string; intent: string; difficulty: string; opportunity: string }>;
    competitorKeywords:    string[];
    intentPatterns:        Record<string, string>;    // intent type → how competitors satisfy it
    quickWins:             string[];
    longTailOpportunities: string[];
    contentBriefs:         Array<{ title: string; targetKeyword: string; outline: string[] }>;
    score:                 number;
    actions:               string[];
  };

  userExperience: {
    competitorUXPatterns:  string[];
    clientGaps:            string[];
    contentStructure:      string[];     // recommended page structure
    ctaRecommendations:    string[];
    navigationImprovements:string[];
    mobileOptimization:    string[];
    score:                 number;
    actions:               string[];
  };

  technicalBlueprint: {
    schemaMarkupNeeded:    Array<{ type: string; pages: string[]; reason: string }>;
    siteStructure:         { recommended: string; current: string; gaps: string[] };
    internalLinking:       string[];
    crawlabilityFixes:     string[];
    technicalPriority:     string[];
    score:                 number;
    actions:               string[];
  };

  priorityRoadmap:  Array<{ week: string; actions: string[]; impact: string }>;
  competitiveEdge:  string[];
  overallStrategy:  string;
  estimatedResults: string;

  cachedAt:  string;
  expiresAt: string;
  source:    "cache" | "fresh";
}

// ─── STEP 1: Load client data from Supabase ───────────────────────────────────

async function loadClientData(domain: string, clientId: string) {
  const [pagesRes, backlinksRes] = await Promise.all([
    supabase
      .from("onpage_cache")
      .select("url, score, analysis")
      .eq("client_id", clientId)
      .order("score", { ascending: true })
      .limit(50),
    supabase
      .from("backlink_cache")
      .select("analysis, quality_score")
      .eq("domain", domain)
      .maybeSingle(),
  ]);

  const pages     = pagesRes.data || [];
  const backlinks = backlinksRes.data;

  // Summarize pages for Claude prompt (keep token count manageable)
  const pageSummaries = pages.map(p => ({
    url:    p.url,
    score:  p.score,
    title:  p.analysis?.title?.text || null,
    h1:     p.analysis?.headings?.h1?.[0] || null,
    issues: (p.analysis?.issues || []).slice(0, 3),
    topics: p.analysis?.geminiInsights?.content?.primaryTopic || null,
  }));

  const topIssues = pages
    .flatMap(p => p.analysis?.issues || [])
    .reduce((acc: Record<string, number>, issue: string) => {
      acc[issue] = (acc[issue] || 0) + 1; return acc;
    }, {});

  const allTopics = [...new Set(
    pages
      .map(p => p.analysis?.geminiInsights?.content?.primaryTopic)
      .filter(Boolean)
  )];

  return {
    totalPages:    pages.length,
    avgScore:      pages.length ? Math.round(pages.reduce((s, p) => s + (p.score || 0), 0) / pages.length) : 0,
    pageSummaries: pageSummaries.slice(0, 20),   // cap for prompt size
    topIssues:     Object.entries(topIssues).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k),
    currentTopics: allTopics.slice(0, 20),
    backlinks: backlinks ? {
      qualityScore:      backlinks.quality_score,
      totalFound:        backlinks.analysis?.gemini?.totalFound || 0,
      topDomains:        backlinks.analysis?.gemini?.topLinkingDomains?.slice(0, 5) || [],
      opportunities:     backlinks.analysis?.combined?.opportunities?.slice(0, 3) || [],
    } : null,
  };
}

// ─── STEP 2: Perplexity → Discover top SERP competitors ───────────────────────

async function findCompetitors(domain: string, keywords: string[]): Promise<Array<{ domain: string; reason: string; keyPages: string[] }>> {
  const kwList = keywords.length ? keywords.join(", ") : "main services";
  const prompt = `Find the top ${MAX_COMPETITORS} organic search competitors for the website ${domain} targeting these keywords: ${kwList}.

For each competitor return their domain, why they outrank ${domain}, and their 3 most important pages to analyze.

Return ONLY JSON (no markdown):
{
  "competitors": [
    {
      "domain": "competitor.com",
      "reason": "<why they rank higher>",
      "keyPages": ["https://competitor.com/", "https://competitor.com/services", "https://competitor.com/about"]
    }
  ]
}`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:            "sonar",           // fast model for discovery (not deep-research)
      messages:         [{ role: "user", content: prompt }],
      temperature:      0.1,
      max_tokens:       800,
      return_citations: false,
    }),
  });

  if (!res.ok) throw new Error(`Perplexity competitor discovery failed: ${res.status}`);

  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";

  try {
    const clean = content.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return (parsed.competitors || []).slice(0, MAX_COMPETITORS);
  } catch {
    console.warn("[perplexity] Failed to parse competitor JSON");
    return [];
  }
}

// ─── STEP 3: Firecrawl → Scrape competitor pages (parallel) ──────────────────

async function scrapeCompetitorPage(url: string): Promise<CompetitorPage | null> {
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: true }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.success) return null;

    const md  = data.data?.markdown || "";
    const meta= data.data?.metadata || {};

    const h1 = (md.match(/^# .+$/gm)   || []).map((h: string) => h.replace(/^# /,   "").trim());
    const h2 = (md.match(/^## .+$/gm)  || []).map((h: string) => h.replace(/^## /,  "").trim());
    const h3 = (md.match(/^### .+$/gm) || []).map((h: string) => h.replace(/^### /, "").trim());
    const wc = md.split(/\s+/).filter((w: string) => w.length > 1).length;

    return {
      url,
      title:          meta.title || null,
      h1:             h1.slice(0, 3),
      h2:             h2.slice(0, 8),
      h3:             h3.slice(0, 10),
      wordCount:      wc,
      hasSchema:      (data.data?.html || "").includes("application/ld+json"),
      internalLinks:  (data.data?.html?.match(/href=["']\/[^"']+["']/g) || []).length,
      contentExcerpt: md.slice(0, 1500),
    };
  } catch (err) {
    console.warn(`[firecrawl] Failed to scrape ${url}: ${err.message}`);
    return null;
  }
}

async function scrapeCompetitors(
  competitorList: Array<{ domain: string; reason: string; keyPages: string[] }>
): Promise<Competitor[]> {
  const results: Competitor[] = [];

  for (const comp of competitorList) {
    // Scrape up to MAX_PAGES_PER_COMPETITOR pages in parallel
    const pagesToScrape = (comp.keyPages || [`https://${comp.domain}`]).slice(0, MAX_PAGES_PER_COMPETITOR);
    const scraped = await Promise.all(pagesToScrape.map(scrapeCompetitorPage));
    const pages   = scraped.filter((p): p is CompetitorPage => p !== null);

    if (pages.length > 0) {
      results.push({ domain: comp.domain, pages, reason: comp.reason });
      console.log(`[firecrawl] Scraped ${pages.length} pages from ${comp.domain}`);
    }
  }

  return results;
}

// ─── STEP 4: Claude Reverse Engineering ──────────────────────────────────────
//
// Claude receives:
//   - Client's current state (pages summary, issues, topics, backlinks)
//   - Competitor pages (structure, content, technical patterns)
// Claude outputs:
//   - Topical authority strategy (factor 1)
//   - Keywords & search intent blueprint (factor 3)
//   - UX patterns reverse engineered (factor 8)
//   - Technical SEO blueprint (factor 9)
//   - Priority roadmap
// ─────────────────────────────────────────────────────────────────────────────

async function reverseEngineerWithClaude(
  domain:      string,
  keywords:    string[],
  clientData:  Awaited<ReturnType<typeof loadClientData>>,
  competitors: Competitor[],
  ctx:         BrandContext | null
): Promise<Omit<SEOStrategy, "domain" | "clientId" | "competitors" | "cachedAt" | "expiresAt" | "source">> {

  const brandContextSection = ctx
    ? `\n${buildBrandContextBlock(ctx)}\n\n${buildChannelGoals(ctx, "seo")}\n`
    : "";

  const competitorSection = competitors.map(c => `
### COMPETITOR: ${c.domain}
WHY THEY OUTRANK CLIENT: ${c.reason}
${c.pages.map(p => `
PAGE: ${p.url}
Title: ${p.title}
H1: ${p.h1.join(" | ")}
H2s: ${p.h2.join(" | ")}
H3s: ${p.h3.slice(0, 5).join(" | ")}
Word count: ${p.wordCount}
Schema markup: ${p.hasSchema ? "YES" : "NO"}
Internal links: ${p.internalLinks}
Content excerpt:
${p.contentExcerpt}
`).join("\n")}
`).join("\n---\n");

  const prompt = `You are a world-class SEO strategist performing deep competitive reverse engineering.
${brandContextSection}
## TARGET DOMAIN: ${domain}
Target keywords: ${keywords.length ? keywords.join(", ") : "Not specified — infer from content"}

## CLIENT CURRENT STATE
Total pages analyzed: ${clientData.totalPages}
Average SEO score: ${clientData.avgScore}/100
Current topics covered: ${clientData.currentTopics.join(", ") || "Unknown"}
Top recurring issues: ${clientData.topIssues.join(", ") || "None identified"}
Backlink quality score: ${clientData.backlinks?.qualityScore ?? "Unknown"}/100
Top backlink sources: ${clientData.backlinks?.topDomains.join(", ") || "Unknown"}

Page breakdown (URL → score → H1 → primary topic):
${clientData.pageSummaries.map(p => `- ${p.url} [${p.score}/100] "${p.h1 || "no H1"}" → ${p.topics || "unknown topic"}`).join("\n")}

## COMPETITOR REVERSE ENGINEERING
${competitorSection}

## YOUR MISSION
Reverse engineer exactly why these competitors outrank ${domain} and create a complete strategy blueprint.

Return ONLY this JSON structure (no markdown, no explanation outside JSON):

{
  "overallScore": <current client competitive score 0-100>,

  "topicalAuthority": {
    "currentTopics": ["<topics client currently covers>"],
    "missingTopics": ["<important topics competitors cover that client doesn't>"],
    "recommendedClusters": [
      { "pillar": "<main pillar topic>", "supporting": ["<supporting page 1>", "<supporting page 2>"] }
    ],
    "contentGaps": ["<specific content pieces missing>"],
    "competitorAdvantage": "<what competitor does better for topical authority>",
    "score": <0-100>,
    "actions": ["<specific actionable step>"]
  },

  "keywordsIntent": {
    "targetKeywords": [
      { "keyword": "<kw>", "intent": "<informational|navigational|transactional|commercial>", "difficulty": "<low|medium|high>", "opportunity": "<why this is a good target>" }
    ],
    "competitorKeywords": ["<keywords competitors rank for that client doesn't>"],
    "intentPatterns": {
      "informational": "<how competitors satisfy informational intent>",
      "transactional": "<how competitors satisfy transactional intent>",
      "commercial": "<how competitors satisfy commercial intent>"
    },
    "quickWins": ["<keyword or page that can rank quickly>"],
    "longTailOpportunities": ["<long-tail keyword with good opportunity>"],
    "contentBriefs": [
      { "title": "<recommended page title>", "targetKeyword": "<primary keyword>", "outline": ["<H2 section 1>", "<H2 section 2>"] }
    ],
    "score": <0-100>,
    "actions": ["<specific actionable step>"]
  },

  "userExperience": {
    "competitorUXPatterns": ["<UX pattern from competitors that correlates with high ranking>"],
    "clientGaps": ["<specific UX element client is missing>"],
    "contentStructure": ["<recommended content structure pattern>"],
    "ctaRecommendations": ["<specific CTA improvement>"],
    "navigationImprovements": ["<navigation or IA improvement>"],
    "mobileOptimization": ["<mobile UX improvement>"],
    "score": <0-100>,
    "actions": ["<specific actionable step>"]
  },

  "technicalBlueprint": {
    "schemaMarkupNeeded": [
      { "type": "<schema type e.g. LocalBusiness, FAQPage>", "pages": ["<which pages need it>"], "reason": "<why this schema helps ranking>" }
    ],
    "siteStructure": {
      "recommended": "<recommended URL/silo structure>",
      "current": "<current structure assessment>",
      "gaps": ["<structural gap>"]
    },
    "internalLinking": ["<internal linking strategy>"],
    "crawlabilityFixes": ["<technical crawl fix>"],
    "technicalPriority": ["<highest impact technical fix>"],
    "score": <0-100>,
    "actions": ["<specific actionable step>"]
  },

  "priorityRoadmap": [
    { "week": "Week 1–2", "actions": ["<action>"], "impact": "<expected impact>" },
    { "week": "Week 3–4", "actions": ["<action>"], "impact": "<expected impact>" },
    { "week": "Month 2", "actions": ["<action>"], "impact": "<expected impact>" },
    { "week": "Month 3", "actions": ["<action>"], "impact": "<expected impact>" }
  ],

  "competitiveEdge": ["<unique advantage client can leverage that competitors don't have>"],
  "overallStrategy": "<3–4 sentence executive summary of the reverse-engineered strategy>",
  "estimatedResults": "<realistic estimate of ranking improvements if strategy is followed>"
}`;

  const res = await fetch(`${CF_ANTHROPIC}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key":          ANTHROPIC_KEY,
      "anthropic-version":  "2023-06-01",
      "Content-Type":       "application/json",
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 6000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);

  const data    = await res.json();
  const content = data?.content?.[0]?.text || "{}";

  console.log(`[claude] Input tokens: ${data.usage?.input_tokens}, Output: ${data.usage?.output_tokens}`);

  // Parse Claude's JSON response
  const clean = content.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  const parsed = JSON.parse(clean.slice(start, end + 1));

  return {
    overallScore:      parsed.overallScore      ?? 50,
    topicalAuthority:  parsed.topicalAuthority  ?? {},
    keywordsIntent:    parsed.keywordsIntent     ?? {},
    userExperience:    parsed.userExperience     ?? {},
    technicalBlueprint:parsed.technicalBlueprint ?? {},
    priorityRoadmap:   parsed.priorityRoadmap    ?? [],
    competitiveEdge:   parsed.competitiveEdge    ?? [],
    overallStrategy:   parsed.overallStrategy    ?? "",
    estimatedResults:  parsed.estimatedResults   ?? "",
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function getCache(domain: string, clientId: string): Promise<SEOStrategy | null> {
  const { data } = await supabase
    .from("seo_strategy_cache")
    .select("strategy, expires_at")
    .eq("domain", domain)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;
  return { ...data.strategy, source: "cache" };
}

async function saveCache(domain: string, clientId: string, keywords: string[], competitors: string[], strategy: SEOStrategy): Promise<void> {
  await supabase.from("seo_strategy_cache").upsert({
    domain, client_id: clientId,
    target_keywords: keywords,
    competitors,
    strategy,
    overall_score: strategy.overallScore,
    cached_at:  new Date().toISOString(),
    expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString(),
  }, { onConflict: "domain,client_id" });
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
//
// POST {
//   domain:         "geovera.xyz",
//   clientId:       "uuid",
//   targetKeywords: ["SEO jasa properti", "digital marketing Jakarta"],
//   force:          false   // bypass cache
// }
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { domain: rawDomain, clientId = "default", targetKeywords = [], force = false } = await req.json();
    if (!rawDomain) throw new Error("domain is required");

    const domain   = rawDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const keywords = targetKeywords as string[];

    console.log(`[seo-strategist] ${domain} | keywords: [${keywords.join(", ")}] | force: ${force}`);

    // ── Cache check (7-day TTL) ────────────────────────────────────────────
    if (!force) {
      const cached = await getCache(domain, clientId);
      if (cached) {
        console.log(`[seo-strategist] ✅ Cache HIT: ${domain}`);
        return Response.json({ success: true, data: cached, cached: true }, { headers: cors });
      }
    }

    console.log(`[seo-strategist] 🔄 Full reverse engineering: ${domain}`);

    // ── Step 1: Load client's existing Supabase data + brand context ──────
    console.log("[seo-strategist] Step 1: Loading client data...");
    const [clientData, brandCtx] = await Promise.all([
      loadClientData(domain, clientId),
      getBrandContext(supabase, clientId).catch(() => null),
    ]);
    console.log(`[seo-strategist] Found ${clientData.totalPages} pages, avg score ${clientData.avgScore}`);

    // ── Step 2: Perplexity finds competitors ───────────────────────────────
    console.log("[seo-strategist] Step 2: Finding competitors via Perplexity...");
    const competitorList = await findCompetitors(domain, keywords);
    console.log(`[seo-strategist] Found ${competitorList.length} competitors: ${competitorList.map(c => c.domain).join(", ")}`);

    // ── Step 3: Firecrawl scrapes competitor pages ─────────────────────────
    console.log("[seo-strategist] Step 3: Scraping competitor pages via Firecrawl...");
    const competitors = await scrapeCompetitors(competitorList);
    const totalPages  = competitors.reduce((s, c) => s + c.pages.length, 0);
    console.log(`[seo-strategist] Scraped ${totalPages} pages across ${competitors.length} competitors`);

    // ── Step 4: Claude reverse engineering ────────────────────────────────
    console.log("[seo-strategist] Step 4: Claude reverse engineering...");
    const strategy = await reverseEngineerWithClaude(domain, keywords, clientData, competitors, brandCtx);

    const now     = new Date();
    const expires = new Date(now.getTime() + CACHE_TTL_DAYS * 86400000);

    const fullStrategy: SEOStrategy = {
      domain,
      clientId,
      competitors:  competitors.map(c => c.domain),
      cachedAt:     now.toISOString(),
      expiresAt:    expires.toISOString(),
      source:       "fresh",
      ...strategy,
    };

    // ── Save to cache ──────────────────────────────────────────────────────
    await saveCache(domain, clientId, keywords, fullStrategy.competitors, fullStrategy);

    console.log(`[seo-strategist] ✅ Complete. Overall score: ${fullStrategy.overallScore}/100`);

    return Response.json({
      success: true,
      data:    fullStrategy,
      cached:  false,
      meta: {
        competitorsAnalyzed:  competitors.length,
        competitorPagesScraped: totalPages,
        firecrawlCreditsUsed: totalPages,
        clientPagesLoaded:    clientData.totalPages,
        model:                CLAUDE_MODEL,
      },
    }, { headers: cors });

  } catch (err) {
    console.error("[seo-strategist]", err.message);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: cors });
  }
});
