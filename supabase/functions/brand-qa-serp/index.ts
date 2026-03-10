import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand QA SERP (Social + SEO probe executor + analysis)

   Called by brand-qa-engine after GEO probes complete.
   Handles the slower half of the QA pipeline to avoid 150s timeout.

   FLOW:
   1. Run Social probes via SerpAPI (YouTube = dedicated engine)
   2. Run SEO probes via SerpAPI (Google)
   3. Claude: analyze all probe results (geo + social + seo) → qa_report
   4. Save to brand_profiles.qa_analytics
   5. INSERT into brand_qa_history (trend tracking)
   6. Fire brand-daily-learner (refresh insights with QA data)
   7. Fire brand-vectorize (RAG with QA-enriched data)
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SERPAPI_BASE = "https://serpapi.com/search.json";

interface GEOProbeResult {
  id: string;
  question: string;
  intent: string;
  sentiment?: "positive" | "neutral" | "negative";
  brand_mentioned: boolean;
  mention_context: string;
  position_in_response: "prominent" | "mentioned" | "not_found";
  competitors_mentioned: string[];
}

interface SerpQA {
  id: string;
  query: string;
  platform: string;
  intent: string;
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
async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 3500): Promise<string> {
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
    const brandTerms = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    // YouTube: dedicated SerpAPI engine (more accurate than site: filter)
    if (platform === "youtube") {
      const params = new URLSearchParams({
        api_key: SERPAPI_KEY,
        engine: "youtube",
        search_query: query,
        gl: cc,
        hl,
      });

      const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`);
      if (!res.ok) return { found: false, position: null, top_results: [], brand_url: null, competitors: [] };

      const data = await res.json() as Record<string, unknown>;
      const videos = (data.video_results as Array<Record<string, unknown>>) ?? [];

      let found = false, position: number | null = null, brand_url: string | null = null;
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const title = String(v.title ?? "").toLowerCase();
        const channel = String((v.channel as Record<string, unknown>)?.name ?? "").toLowerCase();
        const link = String(v.link ?? "");
        if (brandTerms.some((t) => title.includes(t) || channel.includes(t) || link.toLowerCase().includes(t))) {
          found = true;
          position = i + 1;
          brand_url = link;
          break;
        }
      }

      const top_results = videos.slice(0, 8).map((v) =>
        String((v.channel as Record<string, unknown>)?.name ?? v.title ?? "")
      ).filter(Boolean);

      return {
        found,
        position,
        top_results,
        brand_url,
        competitors: top_results.filter((r) => !brandTerms.some((t) => r.toLowerCase().includes(t))).slice(0, 5),
      };
    }

    // All other platforms: Google engine with site: filter
    const params = new URLSearchParams({
      api_key: SERPAPI_KEY,
      engine: "google",
      gl: cc,
      hl,
      num: "20",
    });

    if (platform === "tiktok") {
      params.set("q", `site:tiktok.com ${query}`);
    } else if (platform === "instagram") {
      params.set("q", `site:instagram.com ${query}`);
    } else if (platform === "linkedin") {
      params.set("q", `site:linkedin.com ${query}`);
    } else if (platform === "pinterest") {
      params.set("q", `site:pinterest.com ${query}`);
    } else {
      params.set("q", query); // Google / SEO
    }

    const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`);
    if (!res.ok) {
      console.warn(`[brand-qa-serp] SerpAPI ${platform} failed: ${res.status}`);
      return { found: false, position: null, top_results: [], brand_url: null, competitors: [] };
    }

    const data = await res.json() as Record<string, unknown>;
    const organic = (data.organic_results as Array<Record<string, unknown>>) ?? [];

    let found = false, position: number | null = null, brand_url: string | null = null;
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

    const top_results = organic.slice(0, 8).map((r) => {
      try { return new URL(String(r.link ?? r.url ?? "")).hostname.replace("www.", ""); } catch { return ""; }
    }).filter(Boolean);

    return {
      found,
      position,
      top_results,
      brand_url,
      competitors: top_results.filter((d) => !brandTerms.some((t) => d.includes(t))).slice(0, 5),
    };
  } catch (e) {
    console.error(`[brand-qa-serp] SerpAPI probe error: ${e instanceof Error ? e.message : String(e)}`);
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
  let brand_profile_id = "";

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      brand_name: string;
      country: string;
      tier: "basic" | "pro" | "enterprise";
      geo_results: GEOProbeResult[];
      geo_mention_rate: number;
      social_queries: SerpQA[];
      seo_queries: SerpQA[];
    };

    const { user_id, brand_name, country, tier, geo_results, geo_mention_rate, social_queries, seo_queries } = body;
    brand_profile_id = body.brand_profile_id;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[brand-qa-serp] Starting Social+SEO probes for: ${brand_name} (Social:${social_queries.length} SEO:${seo_queries.length})`);

    // ── STEP 1: Execute Social + SEO probes via SerpAPI (sequential 500ms gap) ──
    const socialResults: SerpProbeResult[] = [];
    const seoResults: SerpProbeResult[] = [];

    const allSerpProbes = [
      ...social_queries.map((q) => ({ ...q, channel: "social" as const })),
      ...seo_queries.map((q) => ({ ...q, channel: "seo" as const })),
    ];

    for (let i = 0; i < allSerpProbes.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 500));
      const probe = allSerpProbes[i];
      const result = await runSerpProbe(probe.query, probe.platform, brand_name, country);

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

      console.log(`[brand-qa-serp] ${probe.platform} "${probe.query}" → brand: ${result.found ? `#${result.position}` : "not found"}`);
    }

    const socialFoundRate = socialResults.length > 0
      ? Math.round((socialResults.filter((r) => r.brand_found).length / socialResults.length) * 100) : 0;
    const seoFoundRate = seoResults.length > 0
      ? Math.round((seoResults.filter((r) => r.brand_found).length / seoResults.length) * 100) : 0;

    // ── STEP 2: Claude analysis on all probe results ───────────────────────────
    const negativeProbes = geo_results.filter((r) => r.sentiment === "negative");
    const negativeFindings = negativeProbes.map((r) => ({
      question: r.question,
      brand_mentioned: r.brand_mentioned,
      context: r.mention_context.slice(0, 100),
    }));

    const probesSummary = JSON.stringify({
      geo: {
        total: geo_results.length,
        brand_mentioned_count: geo_results.filter((r) => r.brand_mentioned).length,
        prominent_count: geo_results.filter((r) => r.position_in_response === "prominent").length,
        mention_rate_pct: geo_mention_rate,
        questions_not_found: geo_results.filter((r) => !r.brand_mentioned).map((r) => r.question).slice(0, 5),
        competitors_appearing: [...new Set(geo_results.flatMap((r) => r.competitors_mentioned))].slice(0, 6),
        sample_contexts: geo_results.filter((r) => r.brand_mentioned).map((r) => r.mention_context).slice(0, 3),
        negative_probes: negativeFindings.slice(0, 5),
        reputation_notes: negativeFindings.filter((r) => r.brand_mentioned).map((r) => r.context).slice(0, 3),
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
                ? Math.round(pResults.filter((r) => r.brand_position !== null)
                    .reduce((s, r) => s + r.brand_position!, 0) /
                    pResults.filter((r) => r.brand_position !== null).length)
                : null,
            }];
          })
        ),
        top_competitors: [...new Set(socialResults.flatMap((r) => r.competitor_dominance))].slice(0, 5),
        absent_queries: socialResults.filter((r) => !r.brand_found).map((r) => `${r.platform}: ${r.query}`).slice(0, 5),
      },
      seo: {
        total: seoResults.length,
        brand_found_count: seoResults.filter((r) => r.brand_found).length,
        found_rate_pct: seoFoundRate,
        avg_position: seoResults.filter((r) => r.brand_position !== null).length > 0
          ? Math.round(seoResults.filter((r) => r.brand_position !== null)
              .reduce((s, r) => s + r.brand_position!, 0) /
              seoResults.filter((r) => r.brand_position !== null).length)
          : null,
        top_competitors: [...new Set(seoResults.flatMap((r) => r.competitor_dominance))].slice(0, 5),
      },
    }, null, 0);

    const analysisResponse = await callClaude(
      `You are GeoVera's Brand Presence QA Analyst.
Analyze brand probe results and produce actionable intelligence.
Output ONLY valid JSON. Plain language. Direct. Honest.`,
      `Analyze QA probe results for brand: "${brand_name}" (${country})
Tier: ${tier} | Total probes: ${geo_results.length + socialResults.length + seoResults.length}

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
      "mention_rate_pct": ${geo_mention_rate},
      "label": "strong|moderate|weak|not_visible"
    },
    "social_search": {
      "visibility": 0,
      "discovery": 0,
      "authority": 0,
      "presence_rate_pct": ${socialFoundRate},
      "label": "strong|moderate|weak|not_visible",
      "best_platform": "<platform>",
      "worst_platform": "<platform>"
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
    "geo_insights": ["<specific finding — plain language>"],
    "social_insights": ["<specific finding>"],
    "seo_insights": ["<specific finding>"],
    "competitor_threats": [{"name":"<name>","where_they_dominate":"<where>","how_to_counter":"<action>"}]
  },
  "negative_findings": {
    "reputation_risks": ["<risk found from negative probes>"],
    "brand_mentioned_in_complaints": true,
    "complaint_topics": ["<topic>"],
    "reputation_summary": "<1 sentence honest assessment of reputation in AI responses>"
  },
  "new_keywords_discovered": ["<keyword brand should target>"],
  "new_topics_discovered": ["<topic brand is missing>"],
  "priority_gaps": [
    {"channel":"geo|social_tiktok|social_instagram|social_youtube|seo","gap":"<specific gap>","urgency":"critical|high|medium","fix":"<actionable fix>"}
  ],
  "content_opportunities": [
    {"topic":"<topic>","platform":"<platform>","format":"reel|article|video|story|carousel","why":"<why this improves visibility>","target_keyword":"<keyword>"}
  ],
  "qa_narrative": "<2-3 sentence honest plain-language summary of overall presence health>",
  "next_qa_focus": "<what to probe deeper next cycle>"
}

SCORING GUIDE (0-100 each):
- visibility: % of probes where brand was found/mentioned
- discovery: how easily NEW users (not searching brand name) find the brand
- authority: quality of mentions — recommended vs just mentioned?
- overall: weighted average (GEO 35% + Social 40% + SEO 25%)
Identify at least 3 new_keywords_discovered and 3 content_opportunities.`,
    );

    let qaAnalysis: Record<string, unknown>;
    try {
      let jsonText = analysisResponse.trim();
      if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      qaAnalysis = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`QA analysis parse failed: ${e}. Preview: ${analysisResponse.slice(0, 200)}`);
    }

    // ── STEP 3: Build final qa_analytics object ────────────────────────────────
    const qaAnalytics = {
      tier,
      probes_run: {
        geo: geo_results.length,
        social: socialResults.length,
        seo: seoResults.length,
        total: geo_results.length + socialResults.length + seoResults.length,
      },
      raw_results: {
        geo: geo_results.map((r) => ({
          id: r.id,
          question: r.question,
          intent: r.intent,
          sentiment: r.sentiment ?? "neutral",
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

    // ── STEP 4: Save to brand_profiles ────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from("brand_profiles")
      .update({
        qa_analytics: qaAnalytics,
        qa_updated_at: new Date().toISOString(),
        qa_tier: tier,
      })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    // ── STEP 5: Write to brand_qa_history (trend tracking) ───────────────────
    const qaScore = qaAnalysis.qa_score as Record<string, unknown>;
    const geoScore = qaScore?.geo as Record<string, unknown> ?? {};
    const socialScore = qaScore?.social_search as Record<string, unknown> ?? {};
    const seoScore = qaScore?.seo as Record<string, unknown> ?? {};
    const overallScore = Number(qaScore?.overall ?? 0);

    const { error: historyErr } = await supabase
      .from("brand_qa_history")
      .insert({
        brand_profile_id,
        user_id,
        tier,
        run_at: new Date().toISOString(),
        total_probes: geo_results.length + socialResults.length + seoResults.length,
        geo_probes: geo_results.length,
        social_probes: socialResults.length,
        seo_probes: seoResults.length,
        geo_mention_rate: geo_mention_rate,
        social_found_rate: socialFoundRate,
        seo_found_rate: seoFoundRate,
        overall_score: overallScore,
        geo_visibility: Number(geoScore.visibility ?? 0),
        geo_discovery: Number(geoScore.discovery ?? 0),
        geo_authority: Number(geoScore.authority ?? 0),
        social_visibility: Number(socialScore.visibility ?? 0),
        social_discovery: Number(socialScore.discovery ?? 0),
        social_authority: Number(socialScore.authority ?? 0),
        seo_visibility: Number(seoScore.visibility ?? 0),
        seo_discovery: Number(seoScore.discovery ?? 0),
        seo_authority: Number(seoScore.authority ?? 0),
        new_keywords_discovered: (qaAnalysis.new_keywords_discovered as string[]) ?? [],
        new_topics_discovered: (qaAnalysis.new_topics_discovered as string[]) ?? [],
        priority_gaps: qaAnalysis.priority_gaps ?? [],
        content_opportunities: qaAnalysis.content_opportunities ?? [],
        reputation_risks: ((qaAnalysis.negative_findings as Record<string, unknown>)?.reputation_risks as string[]) ?? [],
        competitor_threats: (qaAnalysis.key_findings as Record<string, unknown>)?.competitor_threats ?? [],
        full_analysis: qaAnalytics,
      });

    if (historyErr) {
      console.warn(`[brand-qa-serp] History insert failed (non-fatal): ${historyErr.message}`);
    }

    console.log(`[brand-qa-serp] Done: ${brand_name} — score:${overallScore} gaps:${(qaAnalysis.priority_gaps as unknown[])?.length ?? 0}`);

    // ── STEP 6: Fire brand-daily-learner (refresh insights with QA data) ──────
    supabase.functions.invoke("brand-daily-learner", {
      body: { brand_profile_id, user_id },
    }).catch((e: Error) => console.error(`[brand-qa-serp] learner chain failed: ${e.message}`));

    // ── STEP 7: Fire brand-vectorize (RAG with QA-enriched data) ─────────────
    const { data: profileForVec } = await supabase
      .from("brand_profiles")
      .select("research_data, research_hash, research_version, source_of_truth")
      .eq("id", brand_profile_id)
      .single();

    if (profileForVec?.research_data && profileForVec?.research_hash) {
      const sot = profileForVec.source_of_truth as Record<string, unknown> ?? {};
      const qaKeywords = (qaAnalysis.new_keywords_discovered as string[]) ?? [];
      const qaTopics = (qaAnalysis.new_topics_discovered as string[]) ?? [];
      const negFindings = qaAnalysis.negative_findings as Record<string, unknown> ?? {};

      const enrichedResearchData = {
        ...(profileForVec.research_data as Record<string, unknown>),
        qa_intelligence: {
          brand_identity: {
            official_name: brand_name,
            industry: (sot.market_intelligence as Record<string, unknown>)?.category ?? "",
          },
          content_intelligence: {
            primary_keywords: qaKeywords,
            content_topics: qaTopics,
            content_gaps: (qaAnalysis.priority_gaps as Array<Record<string, unknown>> ?? []).map((g) => `${g.channel}: ${g.gap}`),
          },
          qa_summary: String(qaAnalysis.qa_narrative ?? ""),
          qa_opportunities: (qaAnalysis.content_opportunities as Array<Record<string, unknown>> ?? [])
            .map((o) => `${o.platform}: ${o.topic} (${o.target_keyword})`),
          geo_mention_rate: geo_mention_rate,
          social_found_rate: socialFoundRate,
          seo_found_rate: seoFoundRate,
          overall_score: overallScore,
          reputation_risks: negFindings.reputation_risks ?? [],
          negative_findings: geo_results.filter((r) => !r.brand_mentioned && r.sentiment === "negative")
            .map((r) => r.question).slice(0, 5),
        },
      };

      supabase.functions.invoke("brand-vectorize", {
        body: {
          brand_profile_id,
          user_id,
          brand_name,
          country,
          research_hash: `qa_${profileForVec.research_hash}_${Date.now()}`,
          research_version: (profileForVec.research_version as number) ?? 1,
          research_data: enrichedResearchData,
        },
      }).catch((e: Error) => console.error(`[brand-qa-serp] vectorize chain failed: ${e.message}`));
    }

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      tier,
      social_probes: socialResults.length,
      seo_probes: seoResults.length,
      geo_mention_rate,
      social_found_rate: socialFoundRate,
      seo_found_rate: seoFoundRate,
      overall_score: overallScore,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-qa-serp] ERROR: ${message}`);

    if (brand_profile_id) {
      supabase.from("brand_profiles").update({
        error_details: { message, step: "brand-qa-serp", timestamp: new Date().toISOString() },
        error_at: new Date().toISOString(),
        error_step: "brand-qa-serp",
      }).eq("id", brand_profile_id).catch(() => {});
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
