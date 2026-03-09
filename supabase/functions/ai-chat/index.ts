import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getBrandContext,
  buildBrandContextBlock,
  buildVoiceGuardrails,
} from "../_shared/brandContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Upgraded from gpt-3.5-turbo: gpt-4o-mini is faster, smarter, and only ~3× more expensive
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-4o-mini";

// Token costs per 1M tokens (USD) — gpt-4o-mini pricing
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini":  { input: 0.15,  output: 0.60  },
  "gpt-4o":       { input: 2.50,  output: 10.00 },
  "gpt-3.5-turbo":{ input: 0.50,  output: 1.50  }, // kept for cost comparison reference
};

interface ChatRequest {
  brand_id: string;
  session_id?: string;
  message: string;
  chat_mode?: "seo" | "geo" | "social" | "general"; // Specialized chat modes
}

interface ChatSession {
  id: string;
  brand_id: string;
  user_id: string;
  title: string;
  message_count: number;
  total_tokens: number;
  total_cost_usd: number;
  created_at: string;
  updated_at: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate OpenAI API key
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Parse request body
    const body: ChatRequest = await req.json();
    const { brand_id, session_id, message, chat_mode } = body;

    // Validate required fields
    if (!brand_id || !message) {
      return new Response(JSON.stringify({ error: "brand_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to general mode if not specified
    const mode = chat_mode || "general";

    // Verify user owns the brand
    const { data: userBrand, error: brandError } = await supabase
      .from("user_brands")
      .select("brand_id, role")
      .eq("user_id", userId)
      .eq("brand_id", brand_id)
      .single();

    if (brandError || !userBrand) {
      return new Response(JSON.stringify({ error: "Brand not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create chat session
    let chatSession: ChatSession | null = null;

    if (session_id) {
      // Try to get existing session
      const { data: existingSession } = await supabase
        .from("gv_ai_chat_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("brand_id", brand_id)
        .eq("user_id", userId)
        .single();

      chatSession = existingSession;
    }

    if (!chatSession) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from("gv_ai_chat_sessions")
        .insert({
          brand_id,
          user_id: userId,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
          message_count: 0,
          total_tokens: 0,
          total_cost_usd: 0,
        })
        .select()
        .single();

      if (sessionError) {
        console.error("Session creation error:", sessionError);
        return new Response(JSON.stringify({ error: "Failed to create chat session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      chatSession = newSession;
    }

    // Store user message in database
    const { data: userMessage, error: userMessageError } = await supabase
      .from("gv_ai_conversations")
      .insert({
        brand_id,
        user_id: userId,
        session_id: chatSession.id,
        message,
        role: "user",
        conversation_type: mode, // Store chat mode (seo/geo/social/general)
        tokens_used: 0,
        cost_usd: 0,
      })
      .select()
      .single();

    if (userMessageError) {
      console.error("User message storage error:", userMessageError);
      return new Response(JSON.stringify({ error: "Failed to store user message" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recent conversation history (last 10 messages)
    const { data: conversationHistory } = await supabase
      .from("gv_ai_conversations")
      .select("role, message")
      .eq("session_id", chatSession.id)
      .order("created_at", { ascending: true })
      .limit(10);

    // ── Fetch brand context to personalise every answer ───────────────────────
    const ctx = await getBrandContext(supabase, brand_id);
    const contextBlock    = buildBrandContextBlock(ctx);
    const voiceGuardrails = buildVoiceGuardrails(ctx);
    const brandName       = ctx.brand.brand_name;
    const category        = ctx.brand.brand_category || "brand";
    const country         = ctx.brand.brand_country  || "Indonesia";

    // ── Build specialised system prompts (brand-aware) ────────────────────────
    const systemPrompts = {
      seo: `You are an SEO (Search Engine Optimization) specialist at GeoVera, working exclusively for ${brandName}.

${contextBlock}

**YOUR EXPERTISE — Traditional search engines (Google, Bing, DuckDuckGo):**
• Keyword research & clustering for ${category} in ${country}
• Google Search ranking strategy: on-page, off-page, technical
• Backlink acquisition from ${country}-relevant authoritative sources
• Domain authority building and content hub architecture
• SERP features: Featured Snippets, People Also Ask, Knowledge Panels
• Technical SEO: Core Web Vitals, schema markup, crawlability
• Local SEO: Google Business Profile optimisation for ${country}

**HOW TO ANSWER:**
• Always frame answers in context of ${brandName}'s category (${category}) and market (${country})
• Give specific keyword examples, search volumes, or difficulty estimates when relevant
• Prioritise actions by impact × effort for a ${ctx.brand.subscription_tier || "growing"} brand
• If data is unavailable, say so and suggest how to find it

${voiceGuardrails}

**SCOPE:** Only answer SEO / traditional search questions.
→ For AI engine visibility: switch to GEO mode
→ For social platform search: switch to Social mode`,

      geo: `You are a GEO (Generative Engine Optimization) specialist at GeoVera, working exclusively for ${brandName}.

${contextBlock}

**YOUR EXPERTISE — AI-powered search engines (ChatGPT, Perplexity, Gemini, Claude, Grok):**
• Entity recognition: getting ${brandName} into AI knowledge graphs
• Citation engineering: becoming the source AI engines quote for ${category} queries
• E-E-A-T signals: Experience, Expertise, Authoritativeness, Trustworthiness
• Structured content for AI consumption: definitions, comparisons, FAQ blocks
• Topical authority maps for AI engine memorisation
• Brand mention monitoring across AI responses
• Prompt-aligned content: writing content that matches how people query AI

**HOW TO ANSWER:**
• Always connect advice to ${brandName}'s specific GEO positioning in ${category}
• Cite which AI engine each tactic affects (ChatGPT vs Perplexity vs Gemini differ significantly)
• Give concrete examples: what query should ${brandName} appear in, and what content creates that
• Track brand mentions: note when ${brandName} is or isn't cited vs competitors

${voiceGuardrails}

**SCOPE:** Only answer GEO / AI engine visibility questions.
→ For Google/Bing rankings: switch to SEO mode
→ For social platform search: switch to Social mode`,

      social: `You are a Social Search (SSO) specialist at GeoVera, working exclusively for ${brandName}.

${contextBlock}

**YOUR EXPERTISE — Social platform discovery (TikTok, Instagram, YouTube, Pinterest, LinkedIn, X):**
• TikTok SEO: hashtag strategy, audio trends, keyword-in-caption optimisation
• Instagram discovery: Explore algorithm, Reels SEO, bio keyword structure
• YouTube: title/description/chapter optimisation, thumbnail CTR, community tab
• Influencer & creator collaboration strategy for ${category} in ${country}
• Platform-native content formats: what works per platform, per audience
• Social listening: tracking brand mentions, competitor moves, trending topics
• Hashtag research: volume, difficulty, niche vs broad balance

**HOW TO ANSWER:**
• Tailor every answer to ${brandName}'s connected platforms and ${country} audience
• Give specific hashtag examples, content format recommendations, posting cadence
• Reference actual trending creators or content styles in ${category} when relevant
• Prioritise platforms where ${brandName} has the most growth potential

${voiceGuardrails}

**SCOPE:** Only answer social search / in-app discovery questions.
→ For Google rankings: switch to SEO mode
→ For AI engine visibility: switch to GEO mode`,

      general: `You are a brand intelligence advisor at GeoVera, working exclusively for ${brandName}.

${contextBlock}

**YOUR ROLE:**
You help ${brandName}'s team think clearly about marketing strategy, content planning, brand positioning, and growth priorities — always grounded in the brand's actual DNA, voice, and competitive position above.

**HOW TO ANSWER:**
• Always relate advice back to ${brandName}'s specific situation, not generic best practices
• Be opinionated: give a clear recommendation, don't hedge everything
• When a question is specifically about SEO, GEO, or Social Search, suggest the specialist mode for deeper expertise
• Keep answers concise and action-oriented

${voiceGuardrails}`,
    };

    const systemPrompt = systemPrompts[mode as keyof typeof systemPrompts] || systemPrompts.general;

    // Build messages for OpenAI
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...(conversationHistory || []).map((msg: any) => ({
        role: msg.role,
        content: msg.message,
      })),
    ];

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error("OpenAI API error:", errorData);
      return new Response(JSON.stringify({ error: "OpenAI API error", details: errorData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;
    const tokensUsed = openaiData.usage?.total_tokens || 0;
    const promptTokens = openaiData.usage?.prompt_tokens || 0;
    const completionTokens = openaiData.usage?.completion_tokens || 0;

    // Calculate cost (TOKEN_COSTS values are per 1M tokens)
    const modelCosts = TOKEN_COSTS[OPENAI_MODEL] || TOKEN_COSTS["gpt-4o-mini"];
    const costUsd = (
      (promptTokens     / 1_000_000) * modelCosts.input +
      (completionTokens / 1_000_000) * modelCosts.output
    );

    // Store AI response in database
    const { data: aiMessage, error: aiMessageError } = await supabase
      .from("gv_ai_conversations")
      .insert({
        brand_id,
        user_id: userId,
        session_id: chatSession.id,
        message: aiResponse,
        role: "assistant",
        ai_provider: "openai",
        model_used: OPENAI_MODEL,
        conversation_type: mode, // Store chat mode
        tokens_used: tokensUsed,
        cost_usd: costUsd,
        parent_message_id: userMessage.id,
      })
      .select()
      .single();

    if (aiMessageError) {
      console.error("AI message storage error:", aiMessageError);
    }

    // Update session stats
    await supabase
      .from("gv_ai_chat_sessions")
      .update({
        message_count: (chatSession.message_count || 0) + 2,
        total_tokens: (chatSession.total_tokens || 0) + tokensUsed,
        total_cost_usd: (chatSession.total_cost_usd || 0) + costUsd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatSession.id);

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      session_id: chatSession.id,
      message_id: aiMessage?.id || null,
      response: aiResponse,
      chat_mode: mode, // Return current chat mode
      metadata: {
        ai_provider: "openai",
        model_used: OPENAI_MODEL,
        tokens_used: tokensUsed,
        cost_usd: parseFloat(costUsd.toFixed(4)),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: err instanceof Error ? err.message : String(err)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
