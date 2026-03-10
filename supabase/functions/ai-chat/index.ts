import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// OpenAI API configuration
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";

// Anthropic API configuration (brand mode)
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-sonnet-4-6";

// Token costs per 1K tokens (USD)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-3.5-turbo": { input: 0.0015, output: 0.002 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
};

interface ChatRequest {
  brand_id: string;
  session_id?: string;
  message: string;
  chat_mode?: "seo" | "geo" | "social" | "general" | "brand"; // Specialized chat modes
  brand_sub_mode?: "strategy" | "content" | "competitive" | "reverse_engineering" | "general";
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
    const { brand_id, session_id, message, chat_mode, brand_sub_mode } = body;

    // Validate required fields
    if (!brand_id || !message) {
      return new Response(JSON.stringify({ error: "brand_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to general mode if not specified
    const mode = chat_mode || "general";

    // Verify user owns the brand via brand_profiles
    const { data: userBrand, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("id", brand_id)
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

    // Build specialized system prompts based on mode
    const systemPrompts = {
      seo: `You are a SEO (Search Engine Optimization) specialist for GeoVera platform.

**YOUR EXPERTISE**: Traditional search engines (Google, Bing)
- Keyword research and optimization
- Google Search rankings
- Backlink strategies
- Domain authority
- Meta tags and on-page SEO
- Search volume analysis
- SERP features (Featured Snippets, People Also Ask, etc.)
- Technical SEO (site speed, mobile optimization, schema markup)

**SCOPE**: Only answer questions about traditional SEO and web search optimization.
**OUT OF SCOPE**: Do NOT answer questions about AI platforms (ChatGPT, Gemini), social media marketing, or content creation. Politely redirect users to the appropriate chat mode.

**EXAMPLE RESPONSES**:
✅ "Your keyword 'best skincare Indonesia' has 5,400 monthly searches. Here's how to rank better..."
✅ "To improve your Google ranking, focus on these on-page SEO factors..."
❌ If asked about ChatGPT: "For AI platform optimization, please switch to GEO chat mode."
❌ If asked about TikTok: "For social media questions, please switch to Social Search chat mode."`,

      geo: `You are a GEO (Generative Engine Optimization) specialist for GeoVera platform.

**YOUR EXPERTISE**: AI platforms and generative search
- ChatGPT visibility optimization
- Google Gemini ranking strategies
- Claude.ai mentions
- Perplexity AI citations
- Entity recognition in AI responses
- Prompt engineering for brand mentions
- AI-generated content analysis
- Semantic search optimization

**SCOPE**: Only answer questions about AI platforms, LLMs, and generative engine optimization.
**OUT OF SCOPE**: Do NOT answer questions about traditional Google SEO, social media, or general marketing. Redirect users to appropriate modes.

**EXAMPLE RESPONSES**:
✅ "To improve your brand mentions in ChatGPT responses, focus on authoritative citations..."
✅ "Your brand appears in 45% of Perplexity queries about sustainable skincare..."
❌ If asked about Google rankings: "For traditional search engine optimization, please switch to SEO chat mode."
❌ If asked about Instagram: "For social media questions, please switch to Social Search chat mode."`,

      social: `You are a Social Search specialist for GeoVera platform.

**YOUR EXPERTISE**: Social media platform search optimization
- TikTok search and hashtags
- Instagram search discovery
- YouTube search optimization
- Pinterest SEO
- LinkedIn content visibility
- Hashtag strategy
- Social media algorithms
- Viral content analysis
- Influencer collaboration

**SCOPE**: Only answer questions about social media platforms and in-app search optimization.
**OUT OF SCOPE**: Do NOT answer questions about Google SEO, AI platforms, or general web marketing. Redirect users appropriately.

**EXAMPLE RESPONSES**:
✅ "Your hashtag #SkincareIndonesia ranks #3 on TikTok with 2.5M views..."
✅ "To improve Instagram search visibility, optimize your bio with keywords..."
❌ If asked about Google: "For web search optimization, please switch to SEO chat mode."
❌ If asked about ChatGPT: "For AI platform optimization, please switch to GEO chat mode."`,

      general: `You are a helpful AI assistant for GeoVera, a brand intelligence platform.

**YOUR ROLE**: General marketing and brand strategy advisor
- Marketing strategy questions
- Brand positioning
- Campaign planning
- General business advice
- Platform feature guidance

**AVAILABLE SPECIALIZED MODES**:
- SEO Mode: For Google/Bing search optimization questions
- GEO Mode: For AI platform (ChatGPT, Gemini, etc.) optimization
- Social Mode: For TikTok, Instagram, YouTube search optimization

**WHEN TO REDIRECT**:
If user asks specific questions about SEO, GEO, or Social Search, suggest they switch to the specialized mode for better expert advice.`,
    };

    const systemPrompt = systemPrompts[mode as keyof typeof systemPrompts] || systemPrompts.general;

    // ── BRAND MODE: use Claude Sonnet 4.6 with Source of Truth ──────────────────
    if (mode === "brand") {
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

      // Fetch brand's source_of_truth from brand_profiles
      const { data: brandProfile, error: profileErr } = await supabase
        .from("brand_profiles")
        .select("brand_name, source_of_truth, research_status")
        .eq("user_id", userId)
        .eq("id", brand_id)
        .single();

      if (profileErr || !brandProfile) {
        return new Response(JSON.stringify({ error: "Brand profile not found. Complete onboarding first." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!brandProfile.source_of_truth) {
        return new Response(JSON.stringify({
          error: "Brand intelligence not ready yet. Please wait for research to complete.",
          research_status: brandProfile.research_status ?? "unknown",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sot = brandProfile.source_of_truth as Record<string, unknown>;
      const subMode = brand_sub_mode ?? "general";

      const subModeInstructions: Record<string, string> = {
        strategy: "Focus on strategic recommendations, market positioning, and growth opportunities. Be specific and actionable.",
        content: "Focus on content strategy, content ideas, platform-specific recommendations, and SEO/GEO optimization tips.",
        competitive: "Focus on competitive analysis, competitor weaknesses, differentiation opportunities, and how to outperform rivals.",
        reverse_engineering: "Analyze the brand data deeply. Break down what's working, what's not, and generate a clear action plan with prioritized tasks.",
        general: "Answer the user's questions thoughtfully using all available brand intelligence.",
      };

      const brandSystemPrompt = `You are a senior Brand Intelligence AI advisor for GeoVera platform, analyzing the brand "${brandProfile.brand_name}".

You have access to a comprehensive Brand Source of Truth built from:
- Deep market research (Perplexity AI)
- Live social media data (Instagram, TikTok, Google Maps)
- SERP rankings and keyword intelligence (SerpAPI)
- Website content analysis (Firecrawl)
- Brand DNA and positioning (Gemini AI)

**YOUR CURRENT FOCUS**: ${subModeInstructions[subMode] || subModeInstructions.general}

**BRAND SOURCE OF TRUTH**:
${JSON.stringify(sot, null, 2).slice(0, 12000)}

**HOW TO RESPOND**:
- Be direct, specific, and actionable — no generic advice
- Reference actual data from the Source of Truth (rankings, topics, competitors, keywords)
- Use simple language — the user may not be a marketing expert
- Prioritize insights by impact: what will move the needle most?
- When suggesting content, give concrete examples with titles and angles
- When discussing competitors, name them and explain what to do differently
- End responses with 2-3 clear "Next Steps" the user can take today`;

      // Build Claude messages
      const claudeMessages = [
        ...(conversationHistory || []).map((msg: { role: string; message: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.message,
        })),
        { role: "user" as const, content: message },
      ];

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system: brandSystemPrompt,
          messages: claudeMessages,
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        throw new Error(`Claude API error: ${err.slice(0, 200)}`);
      }

      const claudeData = await claudeRes.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      const aiResponse = claudeData.content[0]?.text ?? "";
      const inputTokens = claudeData.usage?.input_tokens ?? 0;
      const outputTokens = claudeData.usage?.output_tokens ?? 0;
      const tokensUsed = inputTokens + outputTokens;
      // Claude Sonnet 4.6 pricing: $3/$15 per 1M tokens
      const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

      // Store AI response
      const { data: aiMsg } = await supabase
        .from("gv_ai_conversations")
        .insert({
          brand_id,
          user_id: userId,
          session_id: chatSession.id,
          message: aiResponse,
          role: "assistant",
          ai_provider: "anthropic",
          model_used: CLAUDE_MODEL,
          conversation_type: `brand_${subMode}`,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          parent_message_id: userMessage.id,
        })
        .select()
        .single();

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

      return new Response(JSON.stringify({
        success: true,
        session_id: chatSession.id,
        message_id: aiMsg?.id || null,
        response: aiResponse,
        chat_mode: "brand",
        brand_sub_mode: subMode,
        metadata: {
          ai_provider: "anthropic",
          model_used: CLAUDE_MODEL,
          tokens_used: tokensUsed,
          cost_usd: parseFloat(costUsd.toFixed(6)),
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ── END BRAND MODE ──────────────────────────────────────────────────────────

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

    // Calculate cost
    const modelCosts = TOKEN_COSTS[OPENAI_MODEL] || TOKEN_COSTS["gpt-3.5-turbo"];
    const costUsd = (
      (promptTokens / 1000) * modelCosts.input +
      (completionTokens / 1000) * modelCosts.output
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
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
