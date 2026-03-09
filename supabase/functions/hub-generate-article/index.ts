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

// API Keys
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Model configuration
const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
const OPENAI_MODEL = "gpt-4o-mini";

// Cost tracking (USD per 1M tokens)
const TOKEN_COSTS = {
  claude_input: 3.00,
  claude_output: 15.00,
  openai_input: 0.15, // gpt-4o-mini is much cheaper
  openai_output: 0.60,
};

interface GenerateArticleRequest {
  collection_id: string;
  article_type: "hot" | "review" | "education" | "nice_to_know";
  content_ids: string[];
  target_words?: number;
}

interface ContentAnalysis {
  key_insights: string[];
  quotes: string[];
  tips: string[];
  themes: string[];
  brand_mentions: string[];
  expertise_level: number;
}

interface ArticleResult {
  article_id: string;
  title: string;
  content_html: string;
  word_count: number;
  reading_time: number;
  neutrality_score: number;
  cost_usd: number;
}

/**
 * Analyze content using Claude (reverse engineering)
 */
async function analyzeContentWithClaude(
  contents: any[],
  articleType: string
): Promise<{ analysis: ContentAnalysis; cost: number }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const systemPrompt = `You are an expert content analyst specializing in Indonesian social media content.

Your task is to analyze a collection of social media posts and extract key insights for article creation.

Extract:
1. Key insights (3-5 major takeaways)
2. Memorable quotes (2-3 direct quotes from captions)
3. Actionable tips (3-5 practical tips)
4. Common themes (2-3 recurring topics)
5. Brand mentions (any products/brands mentioned)
6. Expertise level (0.0-1.0 scale)

Return ONLY valid JSON in this format:
{
  "key_insights": ["insight1", "insight2"],
  "quotes": ["quote1", "quote2"],
  "tips": ["tip1", "tip2"],
  "themes": ["theme1", "theme2"],
  "brand_mentions": ["brand1", "brand2"],
  "expertise_level": 0.75
}`;

  const contentSummary = contents.map((c, i) =>
    `Post ${i + 1}:\nCaption: ${c.caption}\nHashtags: ${c.hashtags?.join(", ") || "none"}\nEngagement: ${c.likes || 0} likes, ${c.comments || 0} comments\n`
  ).join("\n---\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze these ${articleType} posts and extract insights:\n\n${contentSummary}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Claude API error: ${errorData.error?.message || "Unknown error"}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "{}";

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No valid JSON found in Claude response");
  }

  const analysis: ContentAnalysis = JSON.parse(jsonMatch[0]);

  // Calculate cost
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const cost = (inputTokens * TOKEN_COSTS.claude_input + outputTokens * TOKEN_COSTS.claude_output) / 1_000_000;

  return { analysis, cost };
}

/**
 * Generate article using OpenAI (cheaper and faster)
 */
async function generateArticleWithOpenAI(
  topic: string,
  analysis: ContentAnalysis,
  articleType: string,
  targetWords: number = 350,
  brandContextBlock?: string,
  voiceGuardrails?: string
): Promise<{ title: string; content: string; cost: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const toneGuides = {
    hot: "Write in an exciting, energetic tone. Start with a hook about what's trending RIGHT NOW. Use present tense. Create urgency.",
    review: "Write in an analytical, balanced tone. Compare pros and cons. Be objective. Provide recommendations.",
    education: "Write in a clear, instructional tone. Use step-by-step structure. Be encouraging and helpful.",
    nice_to_know: "Write in a conversational, insightful tone. Share surprising facts. Make it feel like insider knowledge.",
  };

  const brandSection = brandContextBlock ? `\n\n${brandContextBlock}` : "";
  const guardrailsSection = voiceGuardrails ? `\n\n${voiceGuardrails}` : "";

  const systemPrompt = `You are an expert content writer for Indonesian audiences.${brandSection}

Write a ${targetWords}-word article about: ${topic}

Style guidelines:
- ${toneGuides[articleType as keyof typeof toneGuides]}
- Grade 8-10 reading level
- Short paragraphs (2-3 sentences max)
- Include 2-3 bullet points
- Hook-driven first 2 sentences
- Neutral tone (no promotional language)
- Natural, conversational language

Structure:
1. Hook (2 sentences)
2. Main content (3-4 short paragraphs)
3. Bullet points (2-3 items)
4. Conclusion (1-2 sentences)

Key insights to incorporate: ${analysis.key_insights.join(", ")}
${guardrailsSection}
Return ONLY valid JSON:
{
  "title": "Article title (5-10 words)",
  "content": "Full article HTML with <p>, <ul>, <li> tags"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Write the article now. Target word count: ${targetWords} words.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || "Unknown error"}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "{}";

  const result = JSON.parse(content);

  // Calculate cost
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = (inputTokens * TOKEN_COSTS.openai_input + outputTokens * TOKEN_COSTS.openai_output) / 1_000_000;

  return {
    title: result.title || "Untitled Article",
    content: result.content || "<p>Content generation failed</p>",
    cost,
  };
}

/**
 * Quality checks
 */
function checkArticleQuality(html: string, targetWords: number): {
  word_count: number;
  reading_time: number;
  neutrality_score: number;
  passes: boolean;
} {
  // Strip HTML tags for word count
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  const word_count = words.length;

  // Reading time (average 200 words per minute)
  const reading_time = Math.ceil(word_count / 200);

  // Simple neutrality check (no promotional language)
  const promotionalWords = [
    "buy now",
    "limited time",
    "special offer",
    "discount",
    "promo",
    "sale",
    "get yours",
    "order now",
    "shop now",
  ];
  const lowerText = text.toLowerCase();
  const promotionalCount = promotionalWords.filter((word) =>
    lowerText.includes(word)
  ).length;
  const neutrality_score = Math.max(0, 1 - promotionalCount * 0.2);

  // Passes if: 200-500 words and neutrality > 0.7
  const passes = word_count >= 200 && word_count <= 500 && neutrality_score >= 0.7;

  return { word_count, reading_time, neutrality_score, passes };
}

/**
 * Main article generation function
 */
async function generateArticle(
  supabase: any,
  collectionId: string,
  articleType: "hot" | "review" | "education" | "nice_to_know",
  contentIds: string[],
  targetWords: number = 350
): Promise<ArticleResult> {
  console.log(`Generating ${articleType} article for collection ${collectionId}`);

  if (contentIds.length < 5 || contentIds.length > 10) {
    throw new Error("Content IDs must be between 5 and 10");
  }

  let totalCost = 0;

  // Step 0: Load brand context from collection
  let brandContextBlock: string | undefined;
  let voiceGuardrails: string | undefined;
  try {
    const { data: collection } = await supabase
      .from("gv_hub_collections")
      .select("brand_id")
      .eq("id", collectionId)
      .maybeSingle();
    if (collection?.brand_id) {
      const ctx = await getBrandContext(supabase, collection.brand_id);
      brandContextBlock = buildBrandContextBlock(ctx);
      voiceGuardrails   = buildVoiceGuardrails(ctx) || undefined;
    }
  } catch (e) {
    console.warn("[hub-generate-article] Could not load brand context:", e);
  }

  // Step 1: Fetch content
  const { data: contents, error } = await supabase
    .from("gv_creator_content")
    .select("id, caption, hashtags, likes, comments, shares, quality_score")
    .in("id", contentIds);

  if (error || !contents || contents.length === 0) {
    throw new Error("Failed to fetch content");
  }

  console.log(`Fetched ${contents.length} content pieces`);

  // Step 2: Analyze with Claude
  const { analysis, cost: claudeCost } = await analyzeContentWithClaude(contents, articleType);
  totalCost += claudeCost;
  console.log(`Claude analysis complete. Cost: $${claudeCost.toFixed(4)}`);

  // Step 3: Generate article with OpenAI (brand-aware)
  const topic = analysis.themes[0] || "Indonesian Social Media Trends";
  const { title, content, cost: openaiCost } = await generateArticleWithOpenAI(
    topic,
    analysis,
    articleType,
    targetWords,
    brandContextBlock,
    voiceGuardrails
  );
  totalCost += openaiCost;
  console.log(`OpenAI generation complete. Cost: $${openaiCost.toFixed(4)}`);

  // Step 4: Quality checks
  const quality = checkArticleQuality(content, targetWords);
  console.log(`Quality check: ${quality.word_count} words, neutrality: ${quality.neutrality_score.toFixed(2)}`);

  if (!quality.passes) {
    throw new Error(
      `Article failed quality checks: ${quality.word_count} words (need 200-500), neutrality: ${quality.neutrality_score.toFixed(2)} (need 0.7+)`
    );
  }

  // Step 5: Save to database
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // ── Build RSS / social fields ──────────────────────────────────────────
  // Excerpt: strip HTML tags, take first 200 chars
  const plainText = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const excerpt = plainText.slice(0, 200).replace(/\s+\S+$/, "") + "…";

  // Hashtags: derive from themes (e.g. "AI Marketing" → "AIMarketing")
  const hashtags = (analysis.themes || [])
    .slice(0, 6)
    .map((t: string) => t.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, ""));

  // Social caption: excerpt + CTA
  const socialCaption = `${excerpt}\n\nRead the full article 👇`;

  const { data: article, error: insertError } = await supabase
    .from("gv_hub_articles")
    .insert({
      collection_id: collectionId,
      slug: `${slug}-${Date.now()}`,
      title,
      article_type: articleType,
      category: analysis.themes[0] || "general",
      content_html: content,
      content_markdown: content,
      word_count: quality.word_count,
      reading_time_min: quality.reading_time,
      neutrality_score: quality.neutrality_score,
      source_content_ids: contentIds,
      embedding_count: contentIds.length,
      ai_model: `${CLAUDE_MODEL} + ${OPENAI_MODEL}`,
      generation_cost_usd: totalCost,
      status: "published",
      published_at: new Date().toISOString(),
      // RSS / social fields
      excerpt,
      hashtags,
      social_caption: socialCaption,
      rss_include: true,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to save article: ${insertError.message}`);
  }

  console.log(`Article saved with ID: ${article.id}`);

  return {
    article_id: article.id,
    title,
    content_html: content,
    word_count: quality.word_count,
    reading_time: quality.reading_time,
    neutrality_score: quality.neutrality_score,
    cost_usd: totalCost,
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request body
    const body: GenerateArticleRequest = await req.json();

    if (!body.collection_id || !body.article_type || !body.content_ids) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: collection_id, article_type, content_ids",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const targetWords = body.target_words || 350;

    // Generate article
    const result = await generateArticle(
      supabase,
      body.collection_id,
      body.article_type,
      body.content_ids,
      targetWords
    );

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error generating article:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate article",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
