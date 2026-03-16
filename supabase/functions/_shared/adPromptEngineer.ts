/**
 * adPromptEngineer.ts — God Mode Prompt Engineering for Ads Management
 *
 * Claude Sonnet acts as the orchestrator + prompt engineer, crafting
 * optimized prompts for each objective, platform, and content type.
 *
 * Prompt targets:
 * - OpenAI 4o → Article generation (SEO/GEO/SSO storytelling)
 * - Flux Schnell (Modal.com) → Image generation
 * - Runway Gen 4 Turbo → Video generation
 * - Claude Sonnet → Analysis, strategy, ads optimization
 *
 * Each prompt is NLP-optimized for platform-specific human behavior patterns.
 */

import type { BrandContext } from "./brandContext.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdObjective = "awareness" | "traffic" | "engagement" | "conversions" | "app_installs" | "video_views" | "lead_generation";
export type Platform = "meta" | "tiktok" | "google" | "instagram" | "youtube" | "linkedin" | "pinterest";
export type ContentFormat = "article" | "image" | "video" | "carousel" | "story" | "reel" | "short";
export type OptimizationTarget = "seo" | "geo" | "sso";

export interface PromptContext {
  brand: BrandContext;
  objective: AdObjective;
  platform: Platform;
  contentFormat: ContentFormat;
  topic: string;
  targetAudience?: string;
  competitorInsights?: string;
  learnedPatterns?: Record<string, unknown>;
  budgetUsd?: number;
}

export interface GeneratedPrompt {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// ─── Platform Behavior Intelligence ──────────────────────────────────────────

const PLATFORM_NLP: Record<string, {
  attention_span: string;
  hook_style: string;
  cta_style: string;
  tone: string;
  content_length: string;
  algorithm_signals: string[];
  peak_engagement: string;
  audience_behavior: string;
}> = {
  meta: {
    attention_span: "3-second thumb-stop required, first 125 chars visible before 'See More'",
    hook_style: "Pattern interrupt — bold statement, question, or contrarian take in first line",
    cta_style: "Soft CTA embedded naturally ('Link in bio', 'Tap to learn more'), avoid hard sell",
    tone: "Conversational, relatable, authentic — like talking to a friend, not a brand",
    content_length: "125-200 chars for feed, up to 500 for carousel, 15-30s for Reels",
    algorithm_signals: ["saves", "shares", "comment length", "watch time", "profile visits after view"],
    peak_engagement: "Tue-Thu 10AM-2PM, Sun 7-9PM local time",
    audience_behavior: "Scroll-heavy, visual-first, emotion-driven decisions, social proof dependent",
  },
  tiktok: {
    attention_span: "0.5-second hook required — first frame must arrest attention",
    hook_style: "Curiosity gap, 'Wait for it', controversial opinion, visual shock, trending audio sync",
    cta_style: "Native TikTok language: 'Follow for more', 'Comment your answer', 'Stitch this'",
    tone: "Raw, unpolished, creator-authentic — overly polished = skip. Gen Z speak, no corporate jargon",
    content_length: "15-60s optimal, 7-15s for hooks, text overlay max 2 lines",
    algorithm_signals: ["watch-through rate", "replays", "shares to DM", "comment count", "duets/stitches", "saves"],
    peak_engagement: "Mon-Fri 7-9AM, 12-3PM, 7-11PM local time",
    audience_behavior: "Discovery-mode, sound-on, vertical-only, trend-reactive, authenticity-seeking",
  },
  google: {
    attention_span: "Headline: 30 chars, Description: 90 chars — every word must earn its place",
    hook_style: "Intent-match: mirror the search query, include primary keyword, use numbers/stats",
    cta_style: "Action-oriented: 'Get Free Quote', 'Shop Now', 'Start Today', 'Compare Prices'",
    tone: "Professional, benefit-focused, urgency-appropriate — match searcher intent stage",
    content_length: "Responsive ads: 15 headlines × 30 chars, 4 descriptions × 90 chars",
    algorithm_signals: ["CTR", "Quality Score", "landing page experience", "ad relevance", "expected CTR"],
    peak_engagement: "Business hours Mon-Fri for B2B, evenings+weekends for B2C",
    audience_behavior: "High-intent, comparison-mode, solution-seeking, trust-signals matter (reviews, certifications)",
  },
  instagram: {
    attention_span: "1.5-second visual hook, first 2 lines of caption visible (125 chars)",
    hook_style: "Aesthetic-first, curiosity in caption, value-promise ('Save this for later')",
    cta_style: "Community-building: 'Tag someone who needs this', 'Double tap if you agree', 'Save for later'",
    tone: "Aspirational but accessible, visually cohesive with brand aesthetic",
    content_length: "Caption 150-300 chars for feed, 5-10 slides carousel, 15-30s Reels",
    algorithm_signals: ["saves", "shares", "time spent on post", "carousel swipe-through rate", "Reel watch time"],
    peak_engagement: "Mon/Wed/Fri 11AM-1PM, Tue/Thu 10AM-3PM local time",
    audience_behavior: "Aesthetic-driven, save-culture, shopping-integrated, creator-influenced",
  },
  youtube: {
    attention_span: "5-second hook, first 10 seconds determine 70% of watch-through",
    hook_style: "Question + visual proof, 'In this video you'll learn...', before/after, problem agitation",
    cta_style: "'Subscribe and hit the bell', 'Comment below', 'Check the link in description'",
    tone: "Educational-entertaining (edutainment), personality-driven, structured",
    content_length: "Shorts: 30-60s, Regular: 8-15min, thumbnail text: 3-5 words max",
    algorithm_signals: ["watch time", "CTR on thumbnail", "likes/dislikes ratio", "subscriber conversion", "session time"],
    peak_engagement: "Sat-Sun 9AM-11AM, Fri 2-4PM local time",
    audience_behavior: "Intent-to-learn, longer attention span, SEO-discoverable, binge-watch patterns",
  },
  linkedin: {
    attention_span: "First 2 lines visible before 'See more' — must hook professional curiosity",
    hook_style: "Data-driven opening, contrarian professional insight, career lesson, industry trend",
    cta_style: "Thought leadership: 'Agree or disagree?', 'What's your experience?', professional discussion",
    tone: "Professional but human, data-backed, story-driven, no buzzwords without substance",
    content_length: "1300 chars optimal, document/carousel 8-12 slides, video 1-3min",
    algorithm_signals: ["dwell time", "comments (especially long ones)", "reposts", "profile views after"],
    peak_engagement: "Tue-Thu 8-10AM, 12PM, 5-6PM local time",
    audience_behavior: "Professional development, industry insights, career growth, B2B decision-making",
  },
  pinterest: {
    attention_span: "Pin image must be visually self-explanatory — text overlay 6 words max",
    hook_style: "Aspirational imagery, how-to preview, infographic-style, before/after",
    cta_style: "Action-oriented description: 'Click to read the full guide', 'Get the free template'",
    tone: "Inspirational, instructional, solution-focused, evergreen",
    content_length: "Pin description 200-300 chars, 2:3 aspect ratio, rich pins for products",
    algorithm_signals: ["saves", "click-through to site", "closeups", "engagement rate", "freshness"],
    peak_engagement: "Sat-Sun, evenings 8-11PM, seasonal content 45 days ahead",
    audience_behavior: "Planning-mode (weddings, recipes, home decor), saving for later, high purchase intent",
  },
};

// ─── SEO/GEO/SSO Optimization Layers ────────────────────────────────────────

const OPTIMIZATION_LAYERS: Record<OptimizationTarget, string> = {
  seo: `SEO OPTIMIZATION REQUIREMENTS:
• Primary keyword in first paragraph, H1, and meta title
• LSI keywords naturally distributed (2-3% density)
• Internal linking structure: 2-3 contextual links
• Schema-ready structure: FAQ, HowTo, or Article schema
• Meta description 150-160 chars with CTA + primary keyword
• Alt text for every image: descriptive + keyword-rich
• URL-slug optimized: short, keyword-first, hyphen-separated
• E-E-A-T signals: cite authoritative sources, include expert quotes
• Featured snippet targeting: direct answer in first 100 words
• Mobile-first readability: short paragraphs (2-3 sentences), subheadings every 200 words`,

  geo: `GEO (Generative Engine Optimization) REQUIREMENTS:
• Structure content so AI engines (ChatGPT, Perplexity, Gemini, Claude) can extract clear answers
• Use definitive, citation-worthy statements (avoid hedging language)
• Include structured data markers: "According to...", "Research shows...", "The key factors are..."
• Entity recognition: mention brand name 3-5x naturally, link to authoritative mentions
• Knowledge graph alignment: include founding year, location, key people, product categories
• FAQ format for key sections (AI engines love Q&A structure)
• Comparative positioning: "Unlike X, [Brand] offers Y because Z"
• Fluency optimization: write in a way that AI can quote directly without modification
• Citation bait: include unique statistics, original research, or novel frameworks
• Multi-engine coverage: test phrasing against ChatGPT, Perplexity, Google AI, Bing Chat`,

  sso: `SOCIAL SEARCH OPTIMIZATION (SSO) REQUIREMENTS:
• Hashtag strategy: 3-5 high-volume + 2-3 niche + 1 branded hashtag
• Keyword-rich captions: natural integration of search terms users type on platform
• Alt-text/description optimization for platform internal search
• Trend alignment: reference current trending topics/sounds/formats
• Save-worthy content: create "reference material" people bookmark
• Share triggers: emotional resonance, practical value, identity signaling
• Comment bait: questions, polls, controversial takes, fill-in-the-blank
• Profile SEO: optimize bio, highlights, pinned posts for discoverability
• Cross-platform search: optimize for Google indexing of social posts
• Community keywords: use the exact language your target audience uses (not corporate speak)`,
};

// ─── Storytelling Framework ──────────────────────────────────────────────────

const STORYTELLING_FRAMEWORK = `STORYTELLING STRUCTURE (mandatory for all content):
Follow the AIDA-S framework adapted for digital content:

1. ATTENTION (Hook — first 1-3 seconds / first line):
   - Pattern interrupt: something unexpected, bold, or curiosity-inducing
   - Must work WITHOUT sound (for social) or WITHOUT scrolling (for articles)
   - Platform-native: feels like content, not an ad

2. INTEREST (Bridge — next 5-10 seconds / first paragraph):
   - Connect the hook to the audience's pain point or desire
   - Use "you" language — make it about them, not the brand
   - Introduce the tension/conflict that the brand resolves

3. DESIRE (Value — middle section):
   - Show transformation: before → after, problem → solution
   - Social proof: results, testimonials, numbers, visual evidence
   - Emotional resonance: tap into aspiration, fear of missing out, belonging
   - Specificity sells: concrete examples > vague promises

4. ACTION (CTA — end):
   - Single, clear CTA appropriate to the platform
   - Low-friction: match CTA to funnel stage (awareness ≠ "Buy Now")
   - Urgency when appropriate (limited time, scarcity, exclusivity)

5. SHAREABILITY (Viral Layer):
   - Include one element that makes people want to share:
     * Practical value ("others need to see this")
     * Identity ("this is so me")
     * Emotion ("this made me feel something")
     * Social currency ("I discovered this first")`;

// ─── Master Prompt Generator ─────────────────────────────────────────────────

/**
 * Generate the Claude Sonnet system prompt for orchestrating content/ad creation.
 * Claude acts as the prompt engineer, creating optimized prompts for downstream models.
 */
export function buildAdPromptEngineerSystem(ctx: PromptContext): string {
  const platformData = PLATFORM_NLP[ctx.platform] || PLATFORM_NLP.meta;
  const brand = ctx.brand.brand;

  return `You are GeoVera's God Mode Prompt Engineer — a senior-level AI orchestrator specializing in advertising, content creation, and platform-specific optimization.

YOUR ROLE:
You do NOT create the content directly. You CREATE OPTIMIZED PROMPTS for downstream AI models:
- OpenAI GPT-4o → Article/text generation
- Flux Schnell (Modal.com) → Image generation
- Runway Gen 4 Turbo → Video generation
- Claude Sonnet → Ad analysis, strategy, campaign optimization

YOUR EXPERTISE:
- NLP patterns for each social platform's algorithm
- Human behavior psychology per platform audience
- SEO, GEO (Generative Engine Optimization), and Social Search Optimization
- Storytelling frameworks adapted for digital advertising
- Prompt engineering best practices for each AI model

BRAND CONTEXT:
Brand: ${brand.brand_name} (${brand.brand_category || "General"})
Country: ${brand.brand_country || "Indonesia"}
${ctx.brand.dna ? `DNA: ${ctx.brand.dna.brand_essence || ""} | ${ctx.brand.dna.brand_personality || ""}` : ""}
${ctx.brand.voice ? `Voice: ${ctx.brand.voice.tone || ""} | ${ctx.brand.voice.language_style || ""}` : ""}

PLATFORM INTELLIGENCE (${ctx.platform.toUpperCase()}):
- Attention Span: ${platformData.attention_span}
- Hook Style: ${platformData.hook_style}
- CTA Style: ${platformData.cta_style}
- Tone: ${platformData.tone}
- Content Length: ${platformData.content_length}
- Algorithm Signals: ${platformData.algorithm_signals.join(", ")}
- Peak Engagement: ${platformData.peak_engagement}
- Audience Behavior: ${platformData.audience_behavior}

${STORYTELLING_FRAMEWORK}

OBJECTIVE: ${ctx.objective.toUpperCase()}
${ctx.targetAudience ? `TARGET AUDIENCE: ${ctx.targetAudience}` : ""}
${ctx.competitorInsights ? `COMPETITOR INSIGHTS: ${ctx.competitorInsights}` : ""}

OUTPUT FORMAT:
Always return valid JSON with the exact structure requested. No markdown wrapping.`;
}

/**
 * Build prompt for article generation (target: OpenAI 4o)
 */
export function buildArticlePrompt(
  ctx: PromptContext,
  optimizationTargets: OptimizationTarget[] = ["seo", "geo", "sso"]
): GeneratedPrompt {
  const optimizations = optimizationTargets
    .map((t) => OPTIMIZATION_LAYERS[t])
    .join("\n\n");

  const systemPrompt = buildAdPromptEngineerSystem(ctx);

  const userPrompt = `Create an OPTIMIZED PROMPT for OpenAI GPT-4o to generate a high-quality article.

TOPIC: ${ctx.topic}
PLATFORM: ${ctx.platform}
OBJECTIVE: ${ctx.objective}
CONTENT FORMAT: Long-form article (800-1500 words)

OPTIMIZATION REQUIREMENTS:
${optimizations}

The prompt you create must instruct GPT-4o to:
1. Follow the AIDA-S storytelling structure
2. Write in the brand's voice and tone
3. Optimize for ALL specified targets (SEO + GEO + SSO)
4. Include meta title, meta description, focus keywords, and structured headings
5. Be engaging, human-readable, and NOT AI-generic
6. Include specific data points, examples, and actionable insights
7. Write in ${ctx.brand.brand?.brand_country === "Indonesia" ? "Bahasa Indonesia" : "English"} naturally

Return JSON:
{
  "article_prompt": {
    "system": "system prompt for GPT-4o (include brand voice, tone, style guidelines)",
    "user": "user prompt with specific instructions, topic, structure, optimization requirements",
    "temperature": 0.7,
    "max_tokens": 4000
  },
  "meta_title": "SEO-optimized title (<60 chars)",
  "meta_description": "compelling meta description (<160 chars)",
  "focus_keywords": ["primary_kw", "secondary_kw", "lsi_kw1", "lsi_kw2", "lsi_kw3"],
  "target_word_count": 1200,
  "schema_type": "Article|HowTo|FAQ"
}`;

  return {
    systemPrompt,
    userPrompt,
    model: "claude-sonnet-4-20250514",
    temperature: 0.6,
    maxTokens: 3000,
  };
}

/**
 * Build prompt for image generation (target: Flux Schnell via Modal.com)
 */
export function buildImagePrompt(ctx: PromptContext): GeneratedPrompt {
  const systemPrompt = buildAdPromptEngineerSystem(ctx);

  const userPrompt = `Create an OPTIMIZED IMAGE GENERATION PROMPT for Flux Schnell (Modal.com).

TOPIC: ${ctx.topic}
PLATFORM: ${ctx.platform}
OBJECTIVE: ${ctx.objective}
AD CONTEXT: This image will be used in a ${ctx.objective} campaign on ${ctx.platform}

Flux Schnell prompt engineering rules:
- Be descriptive and specific about visual elements
- Include style keywords: lighting, composition, color palette, mood
- Specify aspect ratio based on platform (1:1 feed, 9:16 story/reel, 2:3 Pinterest)
- Include negative prompt to avoid unwanted elements
- Keep prompt under 200 words for optimal results
- For ad images: clear focal point, minimal text overlay area, brand-consistent colors

Platform-specific image requirements for ${ctx.platform}:
${ctx.platform === "meta" || ctx.platform === "instagram" ? "- 1:1 for feed, 9:16 for stories/reels, eye-catching colors, clean composition" : ""}
${ctx.platform === "tiktok" ? "- 9:16 vertical, bold/vibrant, trend-aligned aesthetic, Gen Z visual language" : ""}
${ctx.platform === "google" ? "- Landscape 1.91:1, clear product/service visual, professional, trust-building" : ""}
${ctx.platform === "pinterest" ? "- 2:3 vertical, aspirational, clean with text overlay space, warm/inviting" : ""}
${ctx.platform === "linkedin" ? "- 1.91:1 landscape, professional, data-viz style, corporate-clean" : ""}
${ctx.platform === "youtube" ? "- 16:9 thumbnail, high contrast, expressive face/reaction, bold 3-5 word overlay" : ""}

Return JSON:
{
  "flux_prompt": "the complete optimized prompt for Flux Schnell",
  "negative_prompt": "elements to avoid",
  "aspect_ratio": "1:1|9:16|2:3|16:9|1.91:1",
  "style_keywords": ["keyword1", "keyword2"],
  "num_inference_steps": 4,
  "guidance_scale": 3.5
}`;

  return {
    systemPrompt,
    userPrompt,
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 1500,
  };
}

/**
 * Build prompt for video generation (target: Runway Gen 4 Turbo)
 */
export function buildVideoPrompt(ctx: PromptContext): GeneratedPrompt {
  const systemPrompt = buildAdPromptEngineerSystem(ctx);

  const userPrompt = `Create an OPTIMIZED VIDEO GENERATION PROMPT for Runway Gen 4 Turbo.

TOPIC: ${ctx.topic}
PLATFORM: ${ctx.platform}
OBJECTIVE: ${ctx.objective}
AD CONTEXT: This video will be used in a ${ctx.objective} campaign on ${ctx.platform}

Runway Gen 4 Turbo prompt engineering rules:
- Describe the scene, movement, and visual progression clearly
- Specify camera motion: pan, zoom, dolly, static, tracking
- Include lighting and mood descriptors
- Describe temporal progression (what happens from start to end)
- Keep prompt focused — one clear visual narrative per generation
- Specify duration: 5s or 10s per clip (multiple clips stitched via FFmpeg)

Platform-specific video requirements for ${ctx.platform}:
${ctx.platform === "tiktok" ? "- 9:16 vertical, fast-paced, hook in 0.5s, trend-aligned movement, energetic" : ""}
${ctx.platform === "meta" || ctx.platform === "instagram" ? "- 9:16 for Reels, 1:1 for feed video, smooth transitions, aesthetic" : ""}
${ctx.platform === "youtube" ? "- 16:9 landscape, cinematic quality, engaging pacing, professional" : ""}
${ctx.platform === "google" ? "- 16:9, clear product showcase, professional, 15-30s total" : ""}

VIDEO STRUCTURE for ${ctx.objective} ad:
1. HOOK CLIP (0-3s): Attention-grabbing visual that stops scroll
2. PROBLEM CLIP (3-8s): Show the pain point / current state
3. SOLUTION CLIP (8-15s): Brand/product as the answer
4. PROOF CLIP (15-25s): Results, testimonials, transformation
5. CTA CLIP (25-30s): Clear call to action with brand

Return JSON:
{
  "clips": [
    {
      "clip_number": 1,
      "runway_prompt": "detailed scene description for Runway",
      "duration_seconds": 5,
      "camera_motion": "zoom_in|pan_left|static|tracking|dolly_forward",
      "aspect_ratio": "9:16|16:9|1:1",
      "purpose": "hook|problem|solution|proof|cta"
    }
  ],
  "total_duration_seconds": 30,
  "ffmpeg_transitions": ["crossfade|cut|dissolve between clips"],
  "background_audio_suggestion": "description of ideal audio/music",
  "text_overlays": [
    { "clip_number": 1, "text": "overlay text", "position": "center|top|bottom", "timing": "0-3s" }
  ]
}`;

  return {
    systemPrompt,
    userPrompt,
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 2500,
  };
}

/**
 * Build prompt for ad campaign analysis/optimization
 */
export function buildAdAnalysisPrompt(
  ctx: PromptContext,
  campaignData: Record<string, unknown>,
  analysisType: "history" | "monitor" | "fix" | "strategy"
): GeneratedPrompt {
  const platformData = PLATFORM_NLP[ctx.platform] || PLATFORM_NLP.meta;
  const systemPrompt = buildAdPromptEngineerSystem(ctx);

  const analysisInstructions: Record<string, string> = {
    history: `Analyze the ad campaign performance history. Identify:
- Top-performing campaigns and WHY they worked (platform algorithm alignment)
- Underperforming campaigns and root causes
- Creative patterns: which hooks, CTAs, visuals drive results on ${ctx.platform}
- Audience patterns: which targeting produces best ROAS
- Time patterns: when do ads perform best
- Budget efficiency: optimal spend levels before diminishing returns
Consider ${ctx.platform} algorithm signals: ${platformData.algorithm_signals.join(", ")}`,

    monitor: `Monitor active campaigns for anomalies. Check:
- CTR deviation from 7-day average (>30% drop = alert)
- CPC spike (>50% increase = alert)
- Budget pacing (>90% before 6PM = alert)
- Zero impressions = critical alert
- Frequency cap approaching (>3.0 = creative fatigue)
Consider ${ctx.platform} audience behavior: ${platformData.audience_behavior}`,

    fix: `Diagnose underperforming ads and suggest SPECIFIC fixes:
- For each issue: diagnosis, fix_type, specific_action, expected_impact
- Fix types: pause, adjust_bid, change_audience, swap_creative, increase_budget, decrease_budget
- Consider ${ctx.platform} algorithm: ${platformData.algorithm_signals.join(", ")}
- Platform-specific fixes: what works on ${ctx.platform} to recover performance
- Prioritize fixes by expected impact and confidence`,

    strategy: `Create a 14-day advertising strategy for ${ctx.platform}:
- Budget allocation and scaling rules
- Audience targeting strategy (primary, secondary, lookalike)
- Creative direction: formats, hooks, CTAs optimized for ${ctx.platform}
- KPI targets: ROAS, CPC, CTR, conversion targets
- Competitive response: how to differentiate
- Consider ${ctx.platform} peak engagement: ${platformData.peak_engagement}
- Consider audience behavior: ${platformData.audience_behavior}`,
  };

  const userPrompt = `${analysisInstructions[analysisType]}

CAMPAIGN DATA:
${JSON.stringify(campaignData, null, 2)}

${ctx.learnedPatterns ? `ML LEARNED PATTERNS:\n${JSON.stringify(ctx.learnedPatterns, null, 2)}` : ""}

Return structured JSON with your analysis.`;

  return {
    systemPrompt,
    userPrompt,
    model: "claude-sonnet-4-20250514",
    temperature: 0.4,
    maxTokens: 4000,
  };
}

/**
 * Build prompt for ad caption/copy generation (target: OpenAI 4o)
 */
export function buildAdCopyPrompt(ctx: PromptContext): GeneratedPrompt {
  const platformData = PLATFORM_NLP[ctx.platform] || PLATFORM_NLP.meta;
  const systemPrompt = buildAdPromptEngineerSystem(ctx);

  const userPrompt = `Create an OPTIMIZED PROMPT for OpenAI GPT-4o to generate ad copy/caption.

TOPIC: ${ctx.topic}
PLATFORM: ${ctx.platform}
OBJECTIVE: ${ctx.objective}
FORMAT: Ad caption/copy for ${ctx.platform}

PLATFORM RULES:
- Attention span: ${platformData.attention_span}
- Hook style: ${platformData.hook_style}
- CTA style: ${platformData.cta_style}
- Tone: ${platformData.tone}
- Content length: ${platformData.content_length}

The prompt must instruct GPT-4o to:
1. Write 3 ad copy variations (A/B/C testing)
2. Each follows AIDA-S storytelling micro-structure
3. Platform-native language (NOT corporate/generic)
4. Optimize for ${ctx.platform} algorithm signals: ${platformData.algorithm_signals.join(", ")}
5. Include hashtag strategy for social platforms
6. Write in ${ctx.brand.brand?.brand_country === "Indonesia" ? "Bahasa Indonesia" : "English"}

Return JSON:
{
  "ad_copy_prompt": {
    "system": "system prompt for GPT-4o",
    "user": "user prompt with specific instructions"
  },
  "variations": [
    {
      "label": "A",
      "hook": "first line hook",
      "body": "full ad copy",
      "cta": "call to action",
      "hashtags": ["#tag1", "#tag2"]
    }
  ]
}`;

  return {
    systemPrompt,
    userPrompt,
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 2500,
  };
}
