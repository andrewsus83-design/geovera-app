import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Indexer (Gemini 2.5 Flash) — SELF-IMPROVING ENGINE

   Architecture:
   - Run #1 (onboarding): cold research, stores v1
   - Run #N (biweekly): reads previous research as context, produces vN + delta
   - Each cycle: Gemini builds on prior knowledge → progressively more accurate

   Parallel 2-part split to stay within 150s wall-clock limit:
     Part A → brand profile  (identity, DNA, presence, backlinks, market, authority)
     Part B → intel + seeds  (content keywords, serpapi, apify, firecrawl, social, GEO)

   research_status lifecycle:
     pending → indexing → gemini_complete → researching → complete / failed
══════════════════════════════════════════════════════════════════════════ */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY")!;

// ── Biweekly Smart Hash ─────────────────────────────────────────────────────
// Hash changes every 14 days → auto-triggers re-research each biweek.
// sha256("brand:country:YYYY-BwNN") where BwNN = biweek number of the year.
async function generateSmartHash(brandName: string, country: string): Promise<string> {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((now.getTime() - startOfYear.getTime()) / 86400000);
  const biweekNumber = Math.ceil(dayOfYear / 14);
  const period = `${now.getFullYear()}-Bw${String(biweekNumber).padStart(2, "0")}`;
  const input = `${brandName.toLowerCase().trim()}:${country.toLowerCase()}:${period}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  const hashHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `gv_${hashHex.slice(0, 20)}`;
}

// ── Gemini Streaming Call ───────────────────────────────────────────────────
async function callGemini(
  label: string,
  systemInstruction: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:streamGenerateContent?key=${GOOGLE_AI_API_KEY}&alt=sse`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[${label}] Gemini API ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "", sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data);
        const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) fullText += text;
        if (chunk?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
          console.warn(`[${label}] Hit MAX_TOKENS at length=${fullText.length}`);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  console.log(`[${label}] Stream done. Chars: ${fullText.length}`);

  let jsonText = fullText.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (e) {
    console.error(`[${label}] Parse error. First 500: ${jsonText.slice(0, 500)}`);
    throw new Error(`[${label}] JSON parse failed: ${e}`);
  }
}

// ── Build previous context summary for Gemini ────────────────────────────────
// Extracts the most valuable parts of prior research to inject as context.
function buildPreviousContext(
  previousData: Record<string, unknown>,
  version: number,
  completedAt: string,
): string {
  if (!previousData || version <= 1) return "";

  const identity = previousData.brand_identity as Record<string, unknown> ?? {};
  const dna = previousData.brand_dna as Record<string, unknown> ?? {};
  const market = previousData.market_intelligence as Record<string, unknown> ?? {};
  const presence = previousData.digital_presence as Record<string, unknown> ?? {};
  const seeds = previousData.research_seeds as Record<string, unknown> ?? {};

  return `
## PREVIOUS RESEARCH CONTEXT (Version ${version - 1}, completed ${completedAt.slice(0, 10)})
This is what GeoVera already knows about this brand. BUILD ON IT — do not start from scratch.
Correct any inaccuracies, add new findings, and flag what has changed.

### Known Identity
- Official name: ${JSON.stringify(identity.official_name ?? "unknown")}
- Founded: ${JSON.stringify(identity.founded_year ?? "unknown")}
- Stage: ${identity.brand_stage ?? "unknown"}
- HQ: ${identity.hq_city ?? ""}, ${identity.hq_country ?? "unknown"}

### Known Digital Presence
${JSON.stringify((presence as Record<string, unknown>).verified_urls ?? {}, null, 2)}

### Known Brand DNA
- Archetype: ${dna.personality_archetype ?? "unknown"}
- Positioning: ${dna.positioning ?? "unknown"}
- USP: ${dna.usp ?? "unknown"}

### Known Competitors
${JSON.stringify((market as Record<string, unknown>).competitors ?? [], null, 2)}

### Previous Research Seeds (for reference — improve these)
- Perplexity batches: ${JSON.stringify(Object.keys((seeds as Record<string, unknown>).perplexity ?? {}))}
- SerpAPI queries: ${((seeds as Record<string, unknown>).serpapi as unknown[])?.length ?? 0} entries
- Apify actors: ${((seeds as Record<string, unknown>).apify as unknown[])?.length ?? 0} entries

### DELTA INSTRUCTIONS
For each section, explicitly identify:
1. What is CONFIRMED (same as before, high confidence)
2. What is NEW (discovered this cycle)
3. What has CHANGED (different from previous)
4. What is REMOVED or no longer valid
Include these insights in the \`research_delta\` field of your output.
`;
}

// ── SYSTEM INSTRUCTION ──────────────────────────────────────────────────────
function buildSystem(country: string, isRefresh: boolean): string {
  return `You are GeoVera's Brand Intelligence Engine — a self-improving AI research system.
${isRefresh ? "You are performing a REFRESH cycle. You have access to previous research. Build on it, correct it, deepen it." : "You are performing an INITIAL DISCOVERY cycle. No prior data exists."}

You combine:
- Senior Brand Strategist (20+ years — brand DNA, market positioning)
- SEO Director (entity optimization, Knowledge Graph authority)
- GEO Specialist (Generative Engine Optimization — AI answer visibility)
- Social Search Director (TikTok, Instagram, YouTube, Pinterest)
- Digital Intelligence Researcher (OSINT, backlink forensics, competitive intel)

RULES:
1. Every URL = REAL. Never fabricate. Use null if unknown.
2. Confidence scores (0–100) per data point. Higher confidence on refresh cycles.
3. All seeds = PRODUCTION-READY with correct params.
4. Country = ${country}. Prioritize local platforms and behavior.
5. ${isRefresh ? "USE previous context to improve accuracy. Flag changes explicitly." : "Perform comprehensive cold research."}
6. Output ONLY valid JSON. No markdown. No preamble. Start { end }.`;
}

// ── PROMPT A: Brand Profile ──────────────────────────────────────────────────
function buildPromptA(
  p: { brand_name: string; website_url?: string; instagram_handle?: string; tiktok_handle?: string; country: string; research_hash: string; },
  previousContext: string,
  version: number,
): string {
  const igUrl = p.instagram_handle ? `https://www.instagram.com/${p.instagram_handle.replace("@", "")}/` : null;
  const ttUrl = p.tiktok_handle ? `https://www.tiktok.com/@${p.tiktok_handle.replace("@", "")}` : null;

  return `# BRAND PROFILE RESEARCH — PART A (v${version})

## INPUT SIGNALS
- Brand: "${p.brand_name}"
- Country: ${p.country}
- Website: ${p.website_url || "not provided"}
- Instagram: ${igUrl || "not provided"}
- TikTok: ${ttUrl || "not provided"}
- Research Hash (verbatim in meta): ${p.research_hash}
- Research Version: ${version}
${previousContext}

## DIRECTIVES

### D1 — BRAND IDENTITY (confidence 0–100 per field)
Official name, legal entity, parent company, founded year, HQ city+country, operating countries, industry, sub-industry.
Brand stage: startup(<3yr) | growth(3–8yr) | established(8–20yr) | legacy(20yr+)
${version > 1 ? "FLAG: Has brand stage changed? Any corporate restructuring?" : ""}

### D2 — DIGITAL PRESENCE
Verify ALL official URLs: website, Instagram, TikTok, YouTube, Facebook, LinkedIn, Twitter/X, Threads.
E-commerce: Shopee, Tokopedia, Lazada, Blibli, Bukalapak, Amazon.
${version > 1 ? "FLAG: Any new platforms launched? Any URLs changed or broken?" : ""}

### D3 — BACKLINKS (8 real entries, specific page URLs)
source_url, domain_name, authority_tier T1(DA70+)/T2(DA40–69)/T3(DA10–39),
anchor_text, link_type(dofollow|nofollow|unknown), context_type, snippet, discovery_confidence(0–100).
${version > 1 ? "Prioritize NEW backlinks not seen in previous cycle." : ""}

### D4 — BRAND DNA
Archetype (1 of 12 Jungian) + 2 evidence points, core values (3–4),
brand voice (tone, vocab, style), visual identity (colors+hex, aesthetic, photo style),
positioning statement, USP, tagline,
target audience (segment, age, gender, income, 3 psychographics, 2 pain points).
${version > 1 ? "FLAG: Has positioning or messaging shifted? New campaigns?" : ""}

### D5 — MARKET INTELLIGENCE
Market category, size estimate, growth trajectory,
4 competitors (name, website, strength, differentiator), competitive narrative.
${version > 1 ? "FLAG: New competitors? Market shifts? Trajectory changes?" : ""}

### D6 — AUTHORITY SIGNALS
Knowledge Panel, Business Profile, Wikipedia (true|false|null),
certifications, awards, 3 media coverage, 3 review platforms.
${version > 1 ? "FLAG: New certifications, awards, or media coverage?" : ""}

## OUTPUT (ONLY this JSON):
{"meta":{"research_hash":"<verbatim>","model_used":"gemini-2.5-flash","research_timestamp":"<ISO8601>","research_version":${version},"overall_confidence":0,"data_sources_found":["<domain>"]},"brand_identity":{"official_name":{"value":"<str>","confidence":0},"legal_name":{"value":"<str|null>","confidence":0},"parent_company":{"value":"<str|null>","confidence":0},"founded_year":{"value":"<str|null>","confidence":0},"hq_country":"<str>","hq_city":"<str|null>","operating_countries":["<country>"],"industry":"<str>","sub_industry":"<str>","brand_stage":"startup|growth|established|legacy"},"brand_dna":{"personality_archetype":"<one of 12>","archetype_reasoning":"<2 evidence points>","core_values":["<value>"],"brand_voice":{"tone_attributes":["<attr>"],"vocabulary_examples":["<phrase>"],"communication_style":"<desc>"},"visual_identity":{"primary_colors":["<#hex>"],"secondary_colors":["<#hex>"],"design_aesthetic":"<style>","photography_style":"<desc>"},"positioning":"<statement>","usp":"<sentence>","tagline":"<str|null>","target_audience":{"primary_segment":"<desc>","age_range":"<e.g.25-40>","gender_split":"<e.g.60% male>","income_level":"low|middle|upper-middle|high","psychographics":["<trait>"],"pain_points":["<pain>"]}},"digital_presence":{"verified_urls":{"website":"<url|null>","instagram":"<url|null>","tiktok":"<url|null>","youtube":"<url|null>","facebook":"<url|null>","linkedin":"<url|null>","twitter":"<url|null>","threads":"<url|null>","shopee":"<url|null>","tokopedia":"<url|null>","lazada":"<url|null>","blibli":"<url|null>","bukalapak":"<url|null>"},"url_confidence":{"website":0,"instagram":0,"tiktok":0,"youtube":0,"facebook":0,"shopee":0,"tokopedia":0},"domain_age_estimate":"<str|null>"},"backlinks":[{"source_url":"<url>","domain_name":"<domain>","authority_tier":"T1|T2|T3","anchor_text":"<text>","link_type":"dofollow|nofollow|unknown","context_type":"news_coverage|industry_directory|review_site|certification|partnership|social_mention|government|academia","snippet":"<excerpt>","discovery_confidence":0,"is_new":${version > 1}}],"market_intelligence":{"market_category":"<str>","market_size_estimate":"<str|null>","growth_trajectory":"declining|stable|growing|hypergrowth","competitors":[{"name":"<str>","website":"<url|null>","relative_strength":"stronger|similar|weaker","key_differentiator":"<str>"}],"competitive_position":"<narrative>"},"authority_signals":{"google_knowledge_panel":null,"google_business_profile":null,"wikipedia_page":null,"certifications":["<cert>"],"awards":["<award>"],"media_coverage":[{"outlet":"<name>","url":"<url|null>","headline":"<title>","year":"<year|null>"}],"review_platforms":[{"platform":"<name>","url":"<url|null>","avg_rating":"<str|null>","review_count":"<str|null>"}]},"research_delta":{"confirmed":["<unchanged key finding>"],"new_discoveries":["<new finding this cycle>"],"changed":["<field: old value → new value>"],"removed":["<no longer valid>"],"confidence_delta":<+/- integer vs previous cycle>}}`;
}

// ── PROMPT B: Intelligence + Seeds ──────────────────────────────────────────
function buildPromptB(
  p: { brand_name: string; website_url?: string; instagram_handle?: string; tiktok_handle?: string; country: string; research_hash: string; },
  previousContext: string,
  version: number,
): string {
  const igUrl = p.instagram_handle ? `https://www.instagram.com/${p.instagram_handle.replace("@", "")}/` : null;
  const ttUrl = p.tiktok_handle ? `https://www.tiktok.com/@${p.tiktok_handle.replace("@", "")}` : null;
  const ttHandle = p.tiktok_handle ? p.tiktok_handle.replace("@", "") : null;
  const cc = p.country.toLowerCase() === "indonesia" ? "id" : "sg";
  const hl = p.country.toLowerCase() === "indonesia" ? "id" : "en";
  const isID = p.country.toLowerCase() === "indonesia";

  return `# BRAND INTELLIGENCE + SEEDS — PART B (v${version})

## INPUT SIGNALS
- Brand: "${p.brand_name}"
- Country: ${p.country}
- Website: ${p.website_url || "not provided"}
- Instagram: ${igUrl || "not provided"}
- TikTok: ${ttUrl || "not provided"}
- Research Version: ${version}
${previousContext}

## DIRECTIVES

### D1 — CONTENT INTELLIGENCE
${version > 1 ? "UPDATE these based on latest trends and what's changed:" : "Generate:"}
- 8 primary SEO keywords (brand + category, high intent)
- 8 long-tail keywords (conversational, question-based, purchase intent)
- 6 content topics (pillar content this brand SHOULD own)
- 4 content gaps (competitor topics this brand is missing)
- 4 trending topics in this category in ${p.country} right now

### D2 — SEO / GEO SIGNALS
- entity_type (Organization|LocalBusiness|Brand|Product)
- 3 schema.org markup recommendations
- 4 geo_citation_targets (AI platforms + publishers)
- 4 featured_snippet_opportunities
- 4 local_seo_targets (cities or regions)

### D3 — PRODUCTION-READY SEEDS
${version > 1 ? "REFRESH these seeds — improve query quality based on what worked and what's new:" : "Generate fresh seeds:"}

PERPLEXITY — 3 batches × 4 queries:
"evergreen": {"query":"...","search_recency_filter":"none"}
"time_sensitive": {"query":"...","search_recency_filter":"month"}
"geo_visibility": AI citation checks in ${p.country}. {"query":"...","search_recency_filter":"none"}

SERPAPI — 8 objects: {"engine":"google","q":"<kw>","gl":"${cc}","hl":"${hl}","num":20,"tbs":<"qdr:m" or null>,"type":"search|news"}
Cover: brand reviews, vs competitor, price, alternatives, complaints, brand ${p.country}, news(type:news+tbs:qdr:m), main product

APIFY (exclude SKIP):
- Instagram: {"actor":"apify/instagram-scraper","input":{"directUrls":["${igUrl || "SKIP"}"],"resultsType":"posts","resultsLimit":30}}
- TikTok: {"actor":"clockworks/free-tiktok-scraper","input":{"profiles":["${ttHandle || "SKIP"}"],"resultsPerPage":30}}
- Google Maps: {"actor":"compass/crawler-google-places","input":{"searchStringsArray":["${p.brand_name} ${p.country}"],"maxCrawledPlacesPerSearch":3,"reviewsPerPlace":50}}
- Google Search: {"actor":"apify/google-search-scraper","input":{"queries":["${p.brand_name} review","${p.brand_name} site:tokopedia.com OR site:shopee.co.id"],"maxPagesPerQuery":3}}

FIRECRAWL — 6 URLs: {"url":"<url>","priority":<1-10>,"intent":"<label>","options":{"formats":["markdown","links"],"onlyMainContent":true,"excludeTags":["nav","footer","script","style","header"]}}
Include: /about(10), /products(9), /press(8), homepage(6), 2 competitor homepages(5)

SOCIAL SEARCH:
- tiktok_search: 4 queries (max 4 words, trending)
- instagram_hashtags: 8 tags (2 brand + 3 category + 3 local)
- youtube_queries: 4 queries (review/unboxing/tutorial)
- pinterest_queries: 2 queries (visual/inspiration)

${isID ? `INDONESIA FORUMS — 4 platforms:
{"platform":"<name>","url":"<search URL with brand>","intent":"brand_mention|review|news"}
Kaskus, Detik.com, Kompas.com, IDN Times` : ""}

GEO VISIBILITY — 4 queries (consumer asks AI about this category in ${p.country}):
{"query":"<question>","target":"chatgpt|perplexity|gemini","expected_mention":<true|false>}

## OUTPUT (ONLY this JSON):
{"content_intelligence":{"primary_keywords":["<kw>"],"long_tail_keywords":["<kw>"],"content_topics":["<topic>"],"content_gaps":["<gap>"],"trending_topics":["<topic>"]},"seo_geo_signals":{"entity_type":"Organization|LocalBusiness|Brand|Product","schema_markup_recommendations":["<schema.org type>"],"geo_citation_targets":["<platform or publisher>"],"featured_snippet_opportunities":["<query>"],"local_seo_targets":["<city or region>"]},"research_seeds":{"perplexity":{"evergreen":[{"query":"<str>","search_recency_filter":"none"}],"time_sensitive":[{"query":"<str>","search_recency_filter":"month"}],"geo_visibility":[{"query":"<str>","search_recency_filter":"none"}]},"serpapi":[{"engine":"google","q":"<kw>","gl":"<cc>","hl":"<lang>","num":20,"tbs":null,"type":"search"}],"apify":[{"actor":"<exact-id>","input":{}}],"firecrawl":[{"url":"<url>","priority":10,"intent":"<label>","options":{"formats":["markdown","links"],"onlyMainContent":true,"excludeTags":["nav","footer","script","style","header"]}}],"social_search":{"tiktok_search":["<query>"],"instagram_hashtags":["#<tag>"],"youtube_queries":["<query>"],"pinterest_queries":["<query>"]},"indonesia_forums":[{"platform":"<name>","url":"<search url>","intent":"brand_mention|review|news"}],"geo_visibility":[{"query":"<str>","target":"chatgpt|perplexity|gemini","expected_mention":true}]}}`;
}

// ── Main Handler ────────────────────────────────────────────────────────────
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
  let brandProfileId: string | undefined;
  let userId: string | undefined;

  try {
    const body = await req.json();
    brandProfileId = body.brand_profile_id;
    userId = body.user_id;

    if (!brandProfileId || !userId) {
      return new Response(
        JSON.stringify({ error: "brand_profile_id and user_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1. Fetch brand profile (including previous research data)
    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("id", brandProfileId)
      .eq("user_id", userId)
      .single();

    if (fetchErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Brand profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Biweekly hash check — skip if already fresh this biweek
    const newHash = await generateSmartHash(profile.brand_name, profile.country);
    if (profile.research_hash === newHash && profile.research_status === "gemini_complete") {
      console.log(`[brand-indexer-gemini] SKIP — already indexed this biweek. Hash: ${newHash}`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "already_indexed_this_biweek",
          research_hash: newHash,
          research_version: profile.research_version,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Set status → indexing
    await supabase
      .from("brand_profiles")
      .update({ research_status: "indexing" })
      .eq("id", brandProfileId);

    // 4. Determine if this is a refresh run and build previous context
    const currentVersion = profile.research_version ?? 1;
    const isRefresh = currentVersion > 1 && !!profile.research_data;
    const previousData = profile.research_data as Record<string, unknown> ?? {};
    const previousContext = isRefresh
      ? buildPreviousContext(previousData, currentVersion, profile.research_completed_at ?? "")
      : "";

    const profileInput = {
      brand_name: profile.brand_name,
      website_url: profile.website_url,
      instagram_handle: profile.instagram_handle,
      tiktok_handle: profile.tiktok_handle,
      country: profile.country,
      research_hash: newHash,
    };

    const systemInstruction = buildSystem(profile.country, isRefresh);
    const nextVersion = currentVersion + (isRefresh ? 1 : 0);

    console.log(`[brand-indexer-gemini] Starting v${nextVersion} ${isRefresh ? "REFRESH" : "INITIAL"}: ${profile.brand_name} (${profile.country})`);
    console.log(`[brand-indexer-gemini] Hash: ${newHash}`);

    // 5. Run both Gemini calls in PARALLEL
    const [resultA, resultB] = await Promise.all([
      callGemini("Part-A:profile", systemInstruction, buildPromptA(profileInput, previousContext, nextVersion)),
      callGemini("Part-B:seeds", systemInstruction, buildPromptB(profileInput, previousContext, nextVersion)),
    ]);

    // 6. Merge results
    const geminiOutput: Record<string, unknown> = { ...resultA, ...resultB };

    // Override authoritative values
    if (geminiOutput.meta && typeof geminiOutput.meta === "object") {
      const meta = geminiOutput.meta as Record<string, unknown>;
      meta.research_hash = newHash;
      meta.research_version = nextVersion;
    }

    // Extract delta from Part A result
    const researchDelta = (resultA.research_delta as Record<string, unknown>) ?? null;

    // Remove delta from main research_data (store separately)
    delete (geminiOutput as Record<string, unknown>).research_delta;

    const brandDna = geminiOutput.brand_dna ?? null;
    const overallConfidence = (geminiOutput.meta as Record<string, unknown>)?.overall_confidence ?? null;

    // 7. Save to brand_profiles
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({
        research_data: geminiOutput,
        research_delta: researchDelta,
        research_hash: newHash,
        research_previous_hash: profile.research_hash ?? null,
        research_version: nextVersion,
        brand_dna: brandDna,
        research_status: "gemini_complete",
        research_completed_at: new Date().toISOString(),
      })
      .eq("id", brandProfileId);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    const topLevelKeys = Object.keys(geminiOutput);
    console.log(`[brand-indexer-gemini] v${nextVersion} complete. Keys: ${topLevelKeys.join(", ")}`);
    if (researchDelta) {
      const delta = researchDelta as Record<string, unknown[]>;
      console.log(`[brand-indexer-gemini] Delta: ${delta.new_discoveries?.length ?? 0} new, ${delta.changed?.length ?? 0} changed`);
    }

    // 8. Auto-chain → 4 parallel deep research tools (fire-and-forget)
    const researchSeeds = (geminiOutput.research_seeds as Record<string, unknown>) ?? {};
    const researchPayload = {
      brand_profile_id: brandProfileId,
      user_id: userId,
      research_seeds: researchSeeds,
      brand_name: profile.brand_name,
      country: profile.country,
      research_hash: newHash,
    };

    // Fire all 4 in parallel — each stores its own data column, then calls brand-consolidator
    const chainFns = ["brand-perplexity-deep", "brand-apify-research", "brand-serpapi-research", "brand-firecrawl-research"];
    for (const fn of chainFns) {
      supabase.functions.invoke(fn, { body: researchPayload })
        .then(() => console.log(`[brand-indexer-gemini] Chained to ${fn} v${nextVersion}`))
        .catch((e: Error) => console.error(`[brand-indexer-gemini] ${fn} chain failed: ${e.message}`));
    }

    // Update status to researching_deep
    await supabase.from("brand_profiles")
      .update({ research_status: "researching_deep" })
      .eq("id", brandProfileId);

    // 9. Auto-chain → brand-vectorize (fire-and-forget)
    // Embeds research_data into Cloudflare Vectorize with brand isolation.
    // Loop learning: each biweekly cycle adds a new versioned vector per brand.
    supabase.functions.invoke("brand-vectorize", {
      body: {
        brand_profile_id: brandProfileId,
        user_id: userId,
        brand_name: profile.brand_name,
        country: profile.country,
        research_hash: newHash,
        research_version: nextVersion,
        research_data: geminiOutput,
      },
    }).then(() => {
      console.log(`[brand-indexer-gemini] Chained to brand-vectorize v${nextVersion}`);
    }).catch((e: Error) => {
      console.error(`[brand-indexer-gemini] vectorize chain failed: ${e.message}`);
    });

    return new Response(
      JSON.stringify({
        success: true,
        brand_profile_id: brandProfileId,
        research_hash: newHash,
        research_version: nextVersion,
        is_refresh: isRefresh,
        status: "gemini_complete",
        overall_confidence: overallConfidence,
        delta_summary: researchDelta
          ? {
            new_discoveries: (researchDelta as Record<string, unknown[]>).new_discoveries?.length ?? 0,
            changed: (researchDelta as Record<string, unknown[]>).changed?.length ?? 0,
            confirmed: (researchDelta as Record<string, unknown[]>).confirmed?.length ?? 0,
          }
          : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-indexer-gemini] ERROR: ${message}`);
    if (brandProfileId) {
      await supabase
        .from("brand_profiles")
        .update({ research_status: "failed" })
        .eq("id", brandProfileId);
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
