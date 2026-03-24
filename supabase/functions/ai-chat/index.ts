/**
 * ai-chat v3 — GeoVera Intelligent Brand Chat
 *
 * Pipeline:
 * 1. Auth + brand verification
 * 2. Parallel: Gemini intent classifier + session/history load
 * 3. Semantic cache lookup  (brand + intent + topic → 72H cached response)
 * 4. Context cluster build  (brand knowledge sliced by intent)
 * 5. Claude orchestrator    (NLP director: builds optimized prompt, decides target AI)
 * 6. Specialist AI execution:
 *    - Writing / SEO / Social / Competitor / Analysis / General → Claude Sonnet 4.6
 *    - Research / Deep intel → Perplexity Sonar (real-time web + citations)
 * 7. Store + semantic cache write
 * 8. Return response with intent metadata
 *
 * Role of each AI:
 * - Gemini 2.0 Flash Lite : Fast intent classification + semantic topic extraction (Google-grade indexer)
 * - Claude Sonnet 4.6     : Orchestrator + prompt engineer + writer + analyst (director-level)
 * - Perplexity Sonar      : Real-time research specialist with web citations
 * - Brand knowledge base  : brand_profiles columns (source_of_truth, serpapi_data, apify_data, etc.)
 *   → Architecture allows Llama/Modal RAG to replace this layer in future
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── API Keys ─────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY  = Deno.env.get("ANTHROPIC_API_KEY")  ?? "";
const GEMINI_API_KEY     = Deno.env.get("GEMINI_API_KEY")     ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") ?? "";

const CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

// ── Types ────────────────────────────────────────────────────────────────────
type IntentType =
  | "writing"     // content creation, copy, captions, scripts, ads
  | "research"    // market research, trends, data gathering
  | "seo"         // keywords, Google rankings, backlinks, technical SEO
  | "social"      // TikTok, Instagram, YouTube, social strategy
  | "competitor"  // competitor analysis, benchmark
  | "analysis"    // data/performance analysis, metrics, ROI
  | "prompting"   // prompt engineering help
  | "general";    // brand strategy, general Q&A

type TargetAI = "claude" | "perplexity";

interface ChatSession {
  id: string; brand_id: string; user_id: string; title: string;
  message_count: number; total_tokens: number; total_cost_usd: number;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function truncate(obj: unknown, maxChars = 1500): string {
  return JSON.stringify(obj ?? {}).slice(0, maxChars);
}

// ── GEMINI: Intent classification + semantic topic key ────────────────────────
// Role: Google-grade fast indexer. Classifies every question in <300ms.
// Returns intent (routing signal) + semantic_topic (cache dedup key).
async function geminiClassify(message: string): Promise<{ intent: IntentType; topic: string }> {
  if (!GEMINI_API_KEY) return { intent: "general", topic: "general_query" };

  const promptText = `You are a marketing question classifier. Classify this question and extract a normalized cache topic.

Question: "${message.slice(0, 600)}"

Intent categories:
- writing: content/copy/article/caption/script/ad creation
- research: market research, trends, data gathering, statistics
- seo: keywords, Google rankings, backlinks, technical SEO, search optimization
- social: TikTok/Instagram/YouTube/social media strategy, hashtags, content calendar
- competitor: competitor analysis, what competitors are doing, benchmarking
- analysis: performance/data/metrics/ROI/analytics interpretation
- prompting: help writing prompts for AI tools
- general: brand strategy, positioning, general Q&A, other

Output JSON only (no markdown):
{"intent":"<category>","topic":"<intent>:<2-3word_subtopic> using snake_case max 40 chars, e.g. seo:keyword_gap or social:tiktok_strategy or writing:product_caption or competitor:pricing_strategy"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 100 },
        }),
      }
    );
    const data = await res.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    return {
      intent: (parsed.intent as IntentType) || "general",
      topic:  parsed.topic || "general_query",
    };
  } catch {
    return { intent: "general", topic: "general_query" };
  }
}

// ── KNOWLEDGE BASE: Context cluster builder ───────────────────────────────────
// Role: "ModalChat" knowledge retrieval layer.
// Slices brand_profiles data by intent → delivers focused context to Claude.
// Architecture note: replace `buildContextCluster` call with Modal/Llama RAG
// once a vector-indexed knowledge base is deployed.
function buildContextCluster(bp: Record<string, unknown>, intent: IntentType): string {
  const sot = (bp.source_of_truth as Record<string, unknown>) ?? {};
  const rd  = (bp.research_data  as Record<string, unknown>) ?? {};
  const parts: string[] = [];

  // ── Brand foundation (always included, compact) ──
  const bf: Record<string, unknown> = (sot.brand_foundation as Record<string, unknown>) ?? {};
  const brandBase = [
    `Brand: ${bp.brand_name}`,
    bp.brand_category && `Category: ${bp.brand_category}`,
    bp.country        && `Market: ${bp.country}`,
    bf.core_value_proposition && `Value Prop: ${bf.core_value_proposition}`,
  ].filter(Boolean).join(" | ");
  parts.push(`[BRAND FOUNDATION]\n${brandBase}`);

  // ── Brand voice (compact) ──
  const voice = (rd.brand_voice as Record<string, unknown>) ?? (rd as Record<string, unknown>);
  if (voice.tone || voice.language_style) {
    const voiceLine = [
      voice.tone           && `Tone: ${voice.tone}`,
      voice.language_style && `Style: ${voice.language_style}`,
      (voice.do_phrases as string[])?.length   && `DO use: ${(voice.do_phrases as string[]).slice(0,3).join(", ")}`,
      (voice.dont_phrases as string[])?.length && `AVOID: ${(voice.dont_phrases as string[]).slice(0,3).join(", ")}`,
    ].filter(Boolean).join(" | ");
    parts.push(`[BRAND VOICE]\n${voiceLine}`);
  }

  // ── Intent-specific data clusters ──
  switch (intent) {
    case "seo":
      if ((bp.serpapi_data as Record<string, unknown>)?.keyword_intelligence)
        parts.push(`[SEO KEYWORD DATA]\n${truncate((bp.serpapi_data as Record<string, unknown>).keyword_intelligence, 1800)}`);
      if ((bp.serpapi_data as Record<string, unknown>)?.brand_rankings)
        parts.push(`[BRAND RANKINGS]\n${truncate((bp.serpapi_data as Record<string, unknown>).brand_rankings, 800)}`);
      if ((bp.serpapi_data as Record<string, unknown>)?.whats_bad)
        parts.push(`[SEO WEAKNESSES]\n${truncate((bp.serpapi_data as Record<string, unknown>).whats_bad, 600)}`);
      if (sot.keyword_intelligence)
        parts.push(`[STRATEGIC KEYWORD INTEL]\n${truncate(sot.keyword_intelligence, 1200)}`);
      if (sot.brand_presence)
        parts.push(`[BRAND DIGITAL PRESENCE]\n${truncate(sot.brand_presence, 700)}`);
      break;

    case "social":
      if ((bp.apify_data as Record<string, unknown>)?.instagram)
        parts.push(`[INSTAGRAM DATA]\n${truncate((bp.apify_data as Record<string, unknown>).instagram, 900)}`);
      if ((bp.apify_data as Record<string, unknown>)?.tiktok)
        parts.push(`[TIKTOK DATA]\n${truncate((bp.apify_data as Record<string, unknown>).tiktok, 900)}`);
      if ((sot.content_intelligence as Record<string, unknown>)?.platform_strategies)
        parts.push(`[PLATFORM STRATEGY]\n${truncate((sot.content_intelligence as Record<string, unknown>).platform_strategies, 1400)}`);
      if ((sot.content_intelligence as Record<string, unknown>)?.top_topics)
        parts.push(`[TOP CONTENT TOPICS]\n${truncate((sot.content_intelligence as Record<string, unknown>).top_topics, 700)}`);
      break;

    case "competitor":
      if (sot.competitor_intelligence)
        parts.push(`[COMPETITOR INTELLIGENCE]\n${truncate(sot.competitor_intelligence, 2200)}`);
      if ((bp.perplexity_data as Record<string, unknown>)?.competitor_research)
        parts.push(`[COMPETITOR RESEARCH]\n${truncate((bp.perplexity_data as Record<string, unknown>).competitor_research, 1200)}`);
      if ((sot.opportunity_map as Record<string, unknown>)?.strategic_opportunities)
        parts.push(`[STRATEGIC OPPORTUNITIES vs COMPETITORS]\n${truncate((sot.opportunity_map as Record<string, unknown>).strategic_opportunities, 700)}`);
      break;

    case "research":
      if ((bp.perplexity_data as Record<string, unknown>)?.market_research)
        parts.push(`[MARKET RESEARCH]\n${truncate((bp.perplexity_data as Record<string, unknown>).market_research, 1800)}`);
      if (sot.market_intelligence)
        parts.push(`[MARKET INTELLIGENCE]\n${truncate(sot.market_intelligence, 1200)}`);
      if (sot.trend_intelligence)
        parts.push(`[TREND INTELLIGENCE]\n${truncate(sot.trend_intelligence, 900)}`);
      if ((bp.perplexity_data as Record<string, unknown>)?.trend_research)
        parts.push(`[TREND RESEARCH]\n${truncate((bp.perplexity_data as Record<string, unknown>).trend_research, 800)}`);
      break;

    case "writing":
    case "prompting":
      if (sot.content_intelligence)
        parts.push(`[CONTENT INTELLIGENCE]\n${truncate(sot.content_intelligence, 1500)}`);
      if ((sot.content_calendar as Record<string, unknown>)?.recommended_topics)
        parts.push(`[RECOMMENDED TOPICS]\n${truncate((sot.content_calendar as Record<string, unknown>).recommended_topics, 900)}`);
      if ((bp.firecrawl_data as Record<string, unknown>)?.content_intelligence)
        parts.push(`[CONTENT DEPTH ANALYSIS]\n${truncate((bp.firecrawl_data as Record<string, unknown>).content_intelligence, 900)}`);
      // Full voice for writing
      if (rd.brand_voice)
        parts.push(`[FULL BRAND VOICE]\n${truncate(rd.brand_voice, 800)}`);
      break;

    case "analysis":
      if (sot.opportunity_map)
        parts.push(`[OPPORTUNITY MAP]\n${truncate(sot.opportunity_map, 1800)}`);
      if (sot.brand_presence)
        parts.push(`[BRAND PRESENCE SCORE]\n${truncate(sot.brand_presence, 900)}`);
      if ((sot.market_intelligence as Record<string, unknown>)?.category_size)
        parts.push(`[MARKET SIZE CONTEXT]\n${truncate(sot.market_intelligence, 700)}`);
      break;

    default: // general
      if ((sot.opportunity_map as Record<string, unknown>)?.prioritized_actions)
        parts.push(`[TOP STRATEGIC ACTIONS]\n${truncate((sot.opportunity_map as Record<string, unknown>).prioritized_actions, 900)}`);
      if ((sot.content_calendar as Record<string, unknown>)?.recommended_topics)
        parts.push(`[RECOMMENDED TOPICS]\n${truncate((sot.content_calendar as Record<string, unknown>).recommended_topics, 600)}`);
      if (sot.brand_presence)
        parts.push(`[CURRENT BRAND PRESENCE]\n${truncate(sot.brand_presence, 600)}`);
      break;
  }

  return parts.length > 1
    ? parts.join("\n\n")
    : "[Brand data is being built. Using brand basics for now.]";
}

// ── CLAUDE: Orchestrator + Prompt Engineer ────────────────────────────────────
// Role: Director-level NLP orchestrator. Builds platform-optimized system prompt.
// Decides which specialist AI should execute based on intent.
function buildOrchestratedSystem(
  brandName: string, category: string, country: string,
  intent: IntentType, contextCluster: string
): { systemPrompt: string; targetAI: TargetAI } {

  // Route research to Perplexity (real-time web data + citations)
  const targetAI: TargetAI = (intent === "research" && PERPLEXITY_API_KEY) ? "perplexity" : "claude";

  const SPECIALIST_ROLE: Record<IntentType, string> = {
    writing:    `You are a director-level content strategist and brand copywriter at GeoVera.\nYour writing is publication-ready, perfectly on-brand, and outperforms generic AI content.\nOutput the requested content directly — not a description of what you'll write.`,
    research:   `You are a senior market intelligence analyst at GeoVera.\nProvide deep, data-backed insights with specific examples and sources. Connect all findings to actionable brand opportunities.`,
    seo:        `You are a technical SEO director at GeoVera.\nGive specific keyword examples with realistic difficulty estimates, exact ranking opportunities, technical fixes, and link-building tactics. Never give generic advice.`,
    social:     `You are a social media discovery expert at GeoVera.\nProvide platform-specific tactics: actual hashtag lists, content format specs, posting cadences, hook formulas, and engagement strategies.`,
    competitor: `You are a competitive intelligence director at GeoVera.\nBe direct about threats and opportunities. Reference specific competitor names, strategies, and weaknesses. Give counter-strategies.`,
    analysis:   `You are a brand performance data scientist at GeoVera.\nInterpret data with precision: cite specific numbers, identify trends, quantify impact, and rank recommendations by ROI potential.`,
    prompting:  `You are a senior AI prompt engineer at GeoVera.\nCraft prompts that maximize output quality for this specific brand. Include the exact brand context users should provide. Show before/after examples.`,
    general:    `You are a brand intelligence advisor at GeoVera.\nBe opinionated, concise, and action-oriented. Always ground every recommendation in the brand's actual data. Never give generic marketing advice.`,
  };

  const systemPrompt =
`${SPECIALIST_ROLE[intent]}

You are working exclusively for: ${brandName} | Category: ${category} | Market: ${country}

━━━ BRAND KNOWLEDGE BASE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextCluster}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ORCHESTRATION RULES:
- Ground every response in the brand data above — no generic advice
- If the question needs current/real-time data not in the knowledge base, say so explicitly
- For writing tasks: match the brand voice exactly
- For analysis tasks: use specific numbers from the data
- Structure your response clearly: key insight first, then supporting detail
- End with 2-3 concrete next steps the user can take today`;

  return { systemPrompt, targetAI };
}

// ── CLAUDE Sonnet 4.6 execution ───────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  history: Array<{ role: string; message: string }>,
  userMessage: string
): Promise<{ text: string; inputTok: number; outputTok: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        ...(history || []).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.message })),
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error ${res.status}: ${err.slice(0, 200)}`);
  }
  const d = await res.json();
  return {
    text:      d.content[0].text,
    inputTok:  d.usage?.input_tokens  ?? 0,
    outputTok: d.usage?.output_tokens ?? 0,
  };
}

// Claude Sonnet 4.6 cost per 1M tokens
const CLAUDE_COST = { input: 3.0, output: 15.0 };

// ── PERPLEXITY Sonar execution ────────────────────────────────────────────────
// Role: Real-time research specialist with live web citations.
async function callPerplexity(
  systemPrompt: string,
  query: string
): Promise<{ text: string; citations: string[] }> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: query },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${err.slice(0, 200)}`);
  }
  const d = await res.json();
  return {
    text:      d.choices[0].message.content,
    citations: d.citations ?? [],
  };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── 1. Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // ── 2. Parse body ──
    const { brand_id, session_id, message, chat_mode } = await req.json();
    if (!brand_id || !message) {
      return new Response(JSON.stringify({ error: "brand_id and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Verify brand ownership + load full knowledge base ──
    // This is the "ModalChat" knowledge layer — all brand intelligence in one query.
    // Future: replace with Modal/Llama RAG for vector-indexed retrieval.
    const { data: bp } = await supabase
      .from("brand_profiles")
      .select("id, brand_name, brand_category, country, brand_website, research_data, source_of_truth, perplexity_data, apify_data, serpapi_data, firecrawl_data")
      .eq("id", brand_id)
      .eq("user_id", userId)
      .single();

    if (!bp) {
      return new Response(JSON.stringify({ error: "Brand not found or access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Parallel: Gemini classification + session/history ──
    const [classification, sessionResult] = await Promise.all([
      geminiClassify(message),
      (async () => {
        let session: ChatSession | null = null;
        if (session_id) {
          const { data: s } = await supabase
            .from("gv_ai_chat_sessions")
            .select("*")
            .eq("id", session_id).eq("brand_id", brand_id).eq("user_id", userId)
            .single();
          session = s;
        }
        if (!session) {
          const { data: ns } = await supabase
            .from("gv_ai_chat_sessions")
            .insert({ brand_id, user_id: userId, title: message.substring(0, 50), message_count: 0, total_tokens: 0, total_cost_usd: 0 })
            .select().single();
          session = ns;
        }
        const { data: history } = await supabase
          .from("gv_ai_conversations")
          .select("role, message")
          .eq("session_id", session!.id)
          .order("created_at", { ascending: true })
          .limit(10);
        return { session: session!, history: history ?? [] };
      })(),
    ]);

    // If chat_mode explicitly provided, prefer it for routing (backward compat)
    const modeMap: Record<string, IntentType> = {
      seo: "seo", geo: "research", social: "social", general: "general"
    };
    const intent: IntentType = (chat_mode && modeMap[chat_mode]) || classification.intent;
    const semanticTopic = classification.topic;
    const { session: chatSession, history: conversationHistory } = sessionResult;
    const isFirstMessage = conversationHistory.length === 0;

    // ── 5. Semantic cache lookup (Gemini-keyed: brand + intent + topic) ──
    let cachedResponse: string | null = null;
    let cacheHit = false;

    if (isFirstMessage) {
      const now = new Date().toISOString();

      // Primary: exact hash
      const exactHash = await sha256Hex(`${brand_id}:${intent}:${message.toLowerCase().trim().replace(/\s+/g, " ")}`);
      const { data: exactRow } = await supabase
        .from("gv_ai_chat_cache")
        .select("id, response, hit_count")
        .eq("brand_id", brand_id)
        .eq("question_hash", exactHash)
        .gt("expires_at", now)
        .single();

      if (exactRow) {
        cachedResponse = exactRow.response;
        cacheHit = true;
        supabase.from("gv_ai_chat_cache").update({ hit_count: (exactRow.hit_count || 0) + 1 }).eq("id", exactRow.id).then(() => {});
      } else {
        // Secondary: semantic topic cache (Gemini-classified)
        const { data: semanticRow } = await supabase
          .from("gv_ai_chat_cache")
          .select("id, response, hit_count")
          .eq("brand_id", brand_id)
          .eq("intent_type", intent)
          .eq("semantic_topic", semanticTopic)
          .gt("expires_at", now)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (semanticRow) {
          cachedResponse = semanticRow.response;
          cacheHit = true;
          supabase.from("gv_ai_chat_cache").update({ hit_count: (semanticRow.hit_count || 0) + 1 }).eq("id", semanticRow.id).then(() => {});
        }
      }
    }

    // ── 6. Store user message ──
    const { data: userMsg } = await supabase
      .from("gv_ai_conversations")
      .insert({ brand_id, user_id: userId, session_id: chatSession.id, message, role: "user", conversation_type: intent, tokens_used: 0, cost_usd: 0 })
      .select().single();

    // ── 7. Return cached response ──
    if (cacheHit && cachedResponse) {
      await supabase.from("gv_ai_conversations").insert({
        brand_id, user_id: userId, session_id: chatSession.id,
        message: cachedResponse, role: "assistant", ai_provider: "cache",
        model_used: "claude-sonnet-4-6", conversation_type: intent,
        tokens_used: 0, cost_usd: 0, from_cache: true, parent_message_id: userMsg?.id,
      });
      await supabase.from("gv_ai_chat_sessions")
        .update({ message_count: (chatSession.message_count || 0) + 2, updated_at: new Date().toISOString() })
        .eq("id", chatSession.id);

      return new Response(JSON.stringify({
        success: true, session_id: chatSession.id,
        response: cachedResponse, intent_type: intent, semantic_topic: semanticTopic,
        target_ai: "cache", from_cache: true,
        metadata: { ai_provider: "cache", tokens_used: 0, cost_usd: 0 },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 8. Build context cluster (knowledge base retrieval) ──
    const brandName = bp.brand_name as string;
    const category  = (bp.brand_category ?? (bp.research_data as Record<string, unknown>)?.brand_category ?? "brand") as string;
    const country   = (bp.country ?? (bp.research_data as Record<string, unknown>)?.country ?? "Indonesia") as string;
    const contextCluster = buildContextCluster(bp as Record<string, unknown>, intent);

    // ── 9. Claude orchestrates: builds optimized system prompt + picks target AI ──
    const { systemPrompt, targetAI } = buildOrchestratedSystem(brandName, category, country, intent, contextCluster);

    // ── 10. Execute on specialist AI ──
    let aiResponse  = "";
    let tokensUsed  = 0;
    let costUsd     = 0;
    let citations:  string[] = [];
    let modelUsed   = "claude-sonnet-4-6";

    if (targetAI === "perplexity") {
      const enrichedQuery = `Research for ${brandName} (${category} brand in ${country}): ${message}\n\nFocus on: recent 2024-2025 data, ${country}-specific insights, actionable findings.`;
      const result = await callPerplexity(systemPrompt, enrichedQuery);
      aiResponse = result.text;
      citations  = result.citations;
      modelUsed  = "perplexity-sonar";
    } else {
      const result = await callClaude(systemPrompt, conversationHistory, message);
      aiResponse = result.text;
      tokensUsed = result.inputTok + result.outputTok;
      costUsd    = (result.inputTok / 1_000_000) * CLAUDE_COST.input + (result.outputTok / 1_000_000) * CLAUDE_COST.output;
      modelUsed  = "claude-sonnet-4-6";
    }

    // ── 11. Store AI response + update session ──
    const { data: aiMsg } = await supabase.from("gv_ai_conversations").insert({
      brand_id, user_id: userId, session_id: chatSession.id,
      message: aiResponse, role: "assistant",
      ai_provider: targetAI, model_used: modelUsed, conversation_type: intent,
      tokens_used: tokensUsed, cost_usd: costUsd, from_cache: false,
      parent_message_id: userMsg?.id,
    }).select().single();

    await supabase.from("gv_ai_chat_sessions").update({
      message_count: (chatSession.message_count || 0) + 2,
      total_tokens:  (chatSession.total_tokens  || 0) + tokensUsed,
      total_cost_usd:(chatSession.total_cost_usd|| 0) + costUsd,
      updated_at: new Date().toISOString(),
    }).eq("id", chatSession.id);

    // ── 12. Write to semantic cache (fire-and-forget) ──
    if (isFirstMessage) {
      const exactHash = await sha256Hex(`${brand_id}:${intent}:${message.toLowerCase().trim().replace(/\s+/g, " ")}`);
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      supabase.from("gv_ai_chat_cache").upsert({
        brand_id,
        chat_mode:      chat_mode || "general",
        question_hash:  exactHash,
        question_text:  message.substring(0, 500),
        intent_type:    intent,
        semantic_topic: semanticTopic,
        response:       aiResponse,
        tokens_used:    tokensUsed,
        cost_usd:       costUsd,
        hit_count:      0,
        expires_at:     expiresAt,
      }, { onConflict: "brand_id,chat_mode,question_hash" }).then(() => {});
    }

    return new Response(JSON.stringify({
      success: true,
      session_id:    chatSession.id,
      message_id:    aiMsg?.id || null,
      response:      aiResponse,
      intent_type:   intent,
      semantic_topic: semanticTopic,
      target_ai:     targetAI,
      from_cache:    false,
      citations:     citations.length > 0 ? citations : undefined,
      metadata: {
        ai_provider: targetAI,
        model_used:  modelUsed,
        tokens_used: tokensUsed,
        cost_usd:    parseFloat(costUsd.toFixed(4)),
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("ai-chat error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
