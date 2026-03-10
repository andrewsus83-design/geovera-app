import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Scoring weights ────────────────────────────────────────────────────────
// High weight = GeoVera can actively deliver this every cycle
// Low weight  = one-time fix or read-only report

const SEO_WEIGHTS = {
  content_quality:    0.18,  // GeoVera generates articles
  keyword_performance:0.15,  // GeoVera tracks + targets
  eeat_signals:       0.15,  // Content authority, trust pages
  onpage_structure:   0.12,  // Title, meta, headings via content
  schema_markup:      0.10,  // GeoVera recommends schema
  backlink_quality:   0.08,  // Link-worthy content creation
  technical_seo:      0.07,  // Report + fix guide
  page_speed:         0.05,  // One-time dev fix
  mobile_score:       0.05,  // One-time dev fix
  index_health:       0.05,  // Report only
};

const GEO_WEIGHTS = {
  ai_citation_presence:     0.18,  // GeoVera content improves this
  faq_qa_depth:             0.16,  // GeoVera generates FAQ articles
  semantic_topic_authority: 0.15,  // Topic cluster content
  answer_friendly_format:   0.12,  // Content structure
  content_freshness:        0.10,  // GeoVera keeps content fresh
  snippet_paa_capture:      0.10,  // Targeted content for PAA
  structured_data_ai:       0.08,  // Schema recommendations
  entity_recognition:       0.05,  // Content + directory listings
  citation_sources:         0.04,  // Quality content attracts citations
  llms_txt_crawlability:    0.02,  // One-time setup
};

const SOCIAL_WEIGHTS = {
  content_quality_structure: 0.18, // GeoVera generates social content
  engagement_quality:        0.16, // Content quality drives saves/shares
  trending_alignment:        0.14, // GeoVera tracks + suggests trending
  content_discoverability:   0.12, // Hashtags, captions, keywords
  posting_consistency:       0.12, // Content calendar from GeoVera
  mention_ugc_quality:       0.08, // Content that earns UGC
  community_authority:       0.08, // Consistent quality builds authority
  cross_platform_presence:   0.05, // Platform strategy
  visual_brand_consistency:  0.05, // Brand guidelines in content
  profile_discoverability:   0.02, // One-time bio setup
};

// ── PageSpeed API ──────────────────────────────────────────────────────────
async function fetchPageSpeed(url: string, apiKey: string) {
  try {
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`),
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${apiKey}`),
    ]);
    const [mobile, desktop] = await Promise.all([mobileRes.json(), desktopRes.json()]);

    const extract = (d: Record<string, unknown>) => {
      const cats = (d.lighthouseResult as Record<string, unknown>)?.categories as Record<string, Record<string, unknown>> | undefined;
      const audits = (d.lighthouseResult as Record<string, unknown>)?.audits as Record<string, Record<string, unknown>> | undefined;
      return {
        performance:   Math.round(((cats?.performance?.score as number) ?? 0) * 100),
        seo:           Math.round(((cats?.seo?.score as number) ?? 0) * 100),
        accessibility: Math.round(((cats?.accessibility?.score as number) ?? 0) * 100),
        best_practices:Math.round(((cats?.["best-practices"]?.score as number) ?? 0) * 100),
        lcp:  (audits?.["largest-contentful-paint"]?.displayValue as string) ?? "n/a",
        cls:  (audits?.["cumulative-layout-shift"]?.displayValue as string) ?? "n/a",
        fcp:  (audits?.["first-contentful-paint"]?.displayValue as string) ?? "n/a",
        ttfb: (audits?.["server-response-time"]?.displayValue as string) ?? "n/a",
        opportunities: Object.values(audits ?? {})
          .filter((a) => a.score !== null && (a.score as number) < 0.9 && a.details)
          .slice(0, 5)
          .map((a) => ({ id: a.id, title: a.title, description: a.description })),
      };
    };

    return { mobile: extract(mobile as Record<string, unknown>), desktop: extract(desktop as Record<string, unknown>) };
  } catch (e) {
    console.error("[analytics-scorer] PageSpeed error:", e);
    return null;
  }
}

// ── Claude scoring ──────────────────────────────────────────────────────────
async function scoreWithClaude(payload: {
  brand_name: string;
  website_url: string;
  research_data: unknown;
  serpapi_data: unknown;
  firecrawl_data: unknown;
  perplexity_data: unknown;
  apify_data: unknown;
  source_of_truth: unknown;
  pagespeed: unknown;
  seo_weights: typeof SEO_WEIGHTS;
  geo_weights: typeof GEO_WEIGHTS;
  social_weights: typeof SOCIAL_WEIGHTS;
}, anthropicKey: string) {
  const prompt = `You are an expert SEO, GEO (Generative Engine Optimization), and Social Search specialist.
Analyze the brand data below and produce a comprehensive analytics score report.

BRAND: ${payload.brand_name}
WEBSITE: ${payload.website_url}

## Available Research Data
### Gemini Brand Profile (research_data)
${JSON.stringify(payload.research_data ?? {}, null, 2).slice(0, 3000)}

### SerpAPI Data (rankings, keywords, SERP features)
${JSON.stringify(payload.serpapi_data ?? {}, null, 2).slice(0, 3000)}

### Firecrawl Data (site content, structure, schema, backlinks)
${JSON.stringify(payload.firecrawl_data ?? {}, null, 2).slice(0, 3000)}

### Perplexity Data (AI citations, market research, brand authority)
${JSON.stringify(payload.perplexity_data ?? {}, null, 2).slice(0, 3000)}

### Apify Data (social media: Instagram, TikTok, Google Maps)
${JSON.stringify(payload.apify_data ?? {}, null, 2).slice(0, 3000)}

### Source of Truth (brand intelligence synthesis)
${JSON.stringify(payload.source_of_truth ?? {}, null, 2).slice(0, 2000)}

### Google PageSpeed Results
${JSON.stringify(payload.pagespeed ?? {}, null, 2)}

## Scoring Instructions

Score each metric 0–100. Use the data available. If a metric has insufficient data, score it 40 (neutral/unknown).

### SEO Metrics (weights: ${JSON.stringify(payload.seo_weights)})
1. content_quality: Content depth, freshness, readability, uniqueness
2. keyword_performance: Rankings, search volume coverage, keyword gaps vs competitors
3. eeat_signals: Experience/Expertise/Authoritativeness/Trust signals, reviews, author info
4. onpage_structure: Title tags, meta descriptions, H1-H3 hierarchy, alt text, internal linking
5. schema_markup: Organization, Article, FAQ, BreadcrumbList, LocalBusiness schema presence
6. backlink_quality: Referring domain quality, topical relevance, anchor diversity (from firecrawl + serp data)
7. technical_seo: HTTPS, robots.txt, canonical tags, redirect chains, crawlability
8. page_speed: PageSpeed performance score (mobile)
9. mobile_score: PageSpeed mobile score + mobile-friendliness signals
10. index_health: Estimated indexed pages, crawl errors, sitemap coverage (from site: queries)

### GEO Metrics (weights: ${JSON.stringify(payload.geo_weights)})
1. ai_citation_presence: How often brand appears in Perplexity/AI answers
2. faq_qa_depth: Number & quality of FAQ pages, question-based headings, PAA coverage
3. semantic_topic_authority: Topic cluster completeness, entity density, semantic keyword richness
4. answer_friendly_format: Bullet lists, numbered steps, definition boxes, clear summaries
5. content_freshness: Content updated <30 days, date markup, recency signals
6. snippet_paa_capture: Featured snippets owned, People Also Ask answers captured
7. structured_data_ai: FAQ schema, HowTo, Speakable, Sitelinks coverage
8. entity_recognition: Knowledge Graph presence, Wikidata, directory listings, brand entity clarity
9. citation_sources: Quality of sites citing/mentioning brand (news, gov, edu, authority)
10. llms_txt_crawlability: llms.txt file exists, AI-readable structure, no AI-crawl blocks

### Social Metrics (weights: ${JSON.stringify(payload.social_weights)})
1. content_quality_structure: Hook strength, carousel quality, CTA clarity, format variety
2. engagement_quality: Save+share rate, comment depth, reply rate (not just likes)
3. trending_alignment: Content aligned with trending topics/sounds/formats per platform
4. content_discoverability: Hashtag reach, keyword in captions, alt text, closed captions
5. posting_consistency: Frequency score, optimal timing adherence, gap analysis
6. mention_ugc_quality: Brand mentions volume, tag quality, UGC volume, sentiment
7. community_authority: Follower quality, growth rate, niche influence ratio
8. cross_platform_presence: Active presence on relevant platforms (IG, TikTok, LinkedIn, YouTube)
9. visual_brand_consistency: Color palette, logo usage, tone of voice consistency
10. profile_discoverability: Username consistency, keywords in bio, profile completeness

## Output Format

Return ONLY valid JSON matching this exact structure:
{
  "seo": {
    "score": <weighted_average_0_to_100>,
    "metrics": {
      "content_quality":     { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "keyword_performance": { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "eeat_signals":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "onpage_structure":    { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "schema_markup":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "backlink_quality":    { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "technical_seo":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "page_speed":          { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "mobile_score":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "index_health":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" }
    }
  },
  "geo": {
    "score": <weighted_average>,
    "metrics": {
      "ai_citation_presence":     { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "faq_qa_depth":             { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "semantic_topic_authority": { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "answer_friendly_format":   { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "content_freshness":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "snippet_paa_capture":      { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "structured_data_ai":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "entity_recognition":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "citation_sources":         { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "llms_txt_crawlability":    { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" }
    }
  },
  "social": {
    "score": <weighted_average>,
    "metrics": {
      "content_quality_structure": { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "engagement_quality":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "trending_alignment":        { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "content_discoverability":   { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "posting_consistency":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "mention_ugc_quality":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "community_authority":       { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "cross_platform_presence":   { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "visual_brand_consistency":  { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" },
      "profile_discoverability":   { "score": 0-100, "status": "good|needs_work|critical", "finding": "1 sentence" }
    }
  },
  "todo_list": [
    {
      "id": "todo_1",
      "category": "SEO|GEO|Social",
      "title": "Action title (max 10 words)",
      "description": "What to do and why (2 sentences)",
      "geovera_service": "content|schema|keyword|social_content|strategy",
      "impact": 1-10,
      "effort": 1-10,
      "priority_score": <impact * (11 - effort)>,
      "metric_affected": "metric_name",
      "score_gain_est": "+X pts"
    }
  ],
  "content_plan": [
    {
      "day": 1-14,
      "title": "Content title",
      "type": "article_short|article_medium|article_long|article_verylong|social_post|faq_page|schema_page",
      "platform": "website|instagram|tiktok|linkedin|youtube",
      "category": "SEO|GEO|Social",
      "target_keyword": "main keyword",
      "goal": "what this content achieves",
      "brief": "2-3 sentence content brief"
    }
  ],
  "summary": {
    "overall_score": <avg of seo+geo+social>,
    "strongest_area": "SEO|GEO|Social",
    "weakest_area": "SEO|GEO|Social",
    "biggest_opportunity": "1 sentence — biggest single win available",
    "geovera_focus": "What GeoVera should focus on this cycle (2 sentences)"
  }
}

Sort todo_list by priority_score descending (highest first).
Generate exactly 14 content_plan items spread across 14 days.
Be specific to the brand's actual data — do not use generic placeholders.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no valid JSON");
  return JSON.parse(jsonMatch[0]);
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Extract user_id from JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const { brand_profile_id } = await req.json();
    if (!brand_profile_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify brand ownership
    const { data: brandCheck } = await adminClient
      .from("brand_profiles")
      .select("id")
      .eq("id", brand_profile_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!brandCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = adminClient;

    // ── Mark as processing ───────────────────────────────────────────────
    // Get current cycle number
    const { data: lastReport } = await supabase
      .from("analytics_reports")
      .select("cycle_number, seo_score, geo_score, social_score, overall_score")
      .eq("brand_profile_id", brand_profile_id)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycle = (lastReport?.cycle_number ?? 0) + 1;
    const prevScores = {
      seo:     lastReport?.seo_score ?? null,
      geo:     lastReport?.geo_score ?? null,
      social:  lastReport?.social_score ?? null,
      overall: lastReport?.overall_score ?? null,
    };

    const { data: report, error: insertErr } = await supabase
      .from("analytics_reports")
      .insert({ brand_profile_id, user_id: userId, cycle_number: cycle, status: "processing" })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const reportId = report.id;

    // ── Load brand profile ───────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, research_data, serpapi_data, firecrawl_data, perplexity_data, apify_data, source_of_truth")
      .eq("id", brand_profile_id)
      .single();

    if (profileErr || !profile) throw new Error("Brand profile not found");

    // Extract website URL from research_data
    const rd = profile.research_data as Record<string, unknown> | null;
    const sot = profile.source_of_truth as Record<string, unknown> | null;
    const websiteUrl: string =
      (rd?.digital_presence as Record<string, unknown>)?.website as string
      ?? (sot?.brand_foundation as Record<string, unknown>)?.website as string
      ?? `https://${profile.brand_name?.toLowerCase().replace(/\s+/g, "")}.com`;

    // ── Google PageSpeed ─────────────────────────────────────────────────
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
    const pagespeed = googleApiKey ? await fetchPageSpeed(websiteUrl, googleApiKey) : null;

    // ── Claude scoring ───────────────────────────────────────────────────
    const scored = await scoreWithClaude({
      brand_name:    profile.brand_name,
      website_url:   websiteUrl,
      research_data: profile.research_data,
      serpapi_data:  profile.serpapi_data,
      firecrawl_data:profile.firecrawl_data,
      perplexity_data:profile.perplexity_data,
      apify_data:    profile.apify_data,
      source_of_truth: profile.source_of_truth,
      pagespeed,
      seo_weights:    SEO_WEIGHTS,
      geo_weights:    GEO_WEIGHTS,
      social_weights: SOCIAL_WEIGHTS,
    }, Deno.env.get("ANTHROPIC_API_KEY") ?? "");

    // ── Compute deltas ───────────────────────────────────────────────────
    const seoScore     = scored.seo?.score ?? 0;
    const geoScore     = scored.geo?.score ?? 0;
    const socialScore  = scored.social?.score ?? 0;
    const overallScore = scored.summary?.overall_score
      ?? Math.round((seoScore + geoScore + socialScore) / 3);

    const delta = (cur: number, prev: number | null) =>
      prev !== null ? cur - prev : null;

    // ── Save report ──────────────────────────────────────────────────────
    await supabase
      .from("analytics_reports")
      .update({
        status:          "ready",
        seo_score:       seoScore,
        geo_score:       geoScore,
        social_score:    socialScore,
        overall_score:   overallScore,
        seo_delta:       delta(seoScore,    prevScores.seo),
        geo_delta:       delta(geoScore,    prevScores.geo),
        social_delta:    delta(socialScore, prevScores.social),
        overall_delta:   delta(overallScore,prevScores.overall),
        seo_breakdown:   scored.seo,
        geo_breakdown:   scored.geo,
        social_breakdown:scored.social,
        todo_list:       scored.todo_list ?? [],
        content_plan:    scored.content_plan ?? [],
        updated_at:      new Date().toISOString(),
      })
      .eq("id", reportId);

    console.log(`[analytics-scorer] cycle ${cycle} done — SEO:${seoScore} GEO:${geoScore} Social:${socialScore}`);

    return new Response(JSON.stringify({
      success: true,
      report_id: reportId,
      cycle_number: cycle,
      scores: { seo: seoScore, geo: geoScore, social: socialScore, overall: overallScore },
      summary: scored.summary,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    console.error("[analytics-scorer] error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
