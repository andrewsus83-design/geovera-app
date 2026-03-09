/**
 * brandContext.ts — Shared Brand Context Bundle
 *
 * Fetches a brand's full profile from Supabase (DNA, voice, chronicle, connections)
 * and returns a structured context object + pre-built prompt injection strings.
 *
 * Usage:
 *   import { getBrandContext, buildBrandContextBlock } from "../_shared/brandContext.ts";
 *   const ctx = await getBrandContext(supabase, brand_id);
 *   const block = buildBrandContextBlock(ctx);        // inject into system prompt
 *   const goals = buildChannelGoals(ctx, "seo");      // inject channel goals
 */

export interface BrandDNA {
  brand_essence: string | null;
  brand_personality: string | null;
  visual_identity: string | null;
  target_market: string | null;
}

export interface BrandVoice {
  tone: string | null;
  language_style: string | null;
  do_phrases: string[] | null;
  dont_phrases: string[] | null;
  personality_traits: string[] | null;
  values: string[] | null;
  emoji_usage: string | null;
}

export interface BrandChronicle {
  brand_narrative: string | null;
  key_themes: string[] | null;
  competitive_position: string | null;
}

export interface ConnectedPlatform {
  platform: string;
  status: string;
}

export interface BrandInfo {
  id: string;
  brand_name: string;
  brand_category: string | null;
  brand_country: string | null;
  brand_website: string | null;
  brand_description: string | null;
  subscription_tier: string | null;
}

export interface BrandContext {
  brand: BrandInfo;
  dna: BrandDNA | null;
  voice: BrandVoice | null;
  chronicle: BrandChronicle | null;
  connectedPlatforms: ConnectedPlatform[];
  hasDNA: boolean;
  hasVoice: boolean;
  hasChronicle: boolean;
}

/**
 * Fetch the full brand context bundle from Supabase.
 * Runs all 4 queries in parallel for efficiency.
 */
export async function getBrandContext(
  supabase: any,
  brand_id: string
): Promise<BrandContext> {
  const [brandRes, dnaRes, voiceRes, chronicleRes, connectionsRes] = await Promise.all([
    supabase
      .from("gv_brands")
      .select("id, brand_name, brand_category, brand_country, brand_website, brand_description, subscription_tier")
      .eq("id", brand_id)
      .maybeSingle(),

    supabase
      .from("gv_brand_dna")
      .select("brand_essence, brand_personality, visual_identity, target_market")
      .eq("brand_id", brand_id)
      .maybeSingle(),

    supabase
      .from("gv_brand_voice_guidelines")
      .select("tone, language_style, do_phrases, dont_phrases, personality_traits, values, emoji_usage")
      .eq("brand_id", brand_id)
      .maybeSingle(),

    supabase
      .from("gv_brand_chronicle")
      .select("brand_narrative, key_themes, competitive_position")
      .eq("brand_id", brand_id)
      .order("analysis_date", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("gv_connections")
      .select("platform, status")
      .eq("brand_id", brand_id)
      .eq("status", "connected"),
  ]);

  const brand: BrandInfo = brandRes.data ?? {
    id: brand_id,
    brand_name: "Unknown Brand",
    brand_category: null,
    brand_country: "Indonesia",
    brand_website: null,
    brand_description: null,
    subscription_tier: null,
  };

  return {
    brand,
    dna: dnaRes.data ?? null,
    voice: voiceRes.data ?? null,
    chronicle: chronicleRes.data ?? null,
    connectedPlatforms: connectionsRes.data ?? [],
    hasDNA: !!dnaRes.data,
    hasVoice: !!voiceRes.data,
    hasChronicle: !!chronicleRes.data,
  };
}

/**
 * Build a structured brand context block for injection into system prompts.
 * Falls back gracefully when DNA/voice/chronicle are not yet generated.
 */
export function buildBrandContextBlock(ctx: BrandContext): string {
  const { brand, dna, voice, chronicle } = ctx;
  const country = brand.brand_country || "Indonesia";
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════");
  lines.push("BRAND CONTEXT (from GeoVera Profile)");
  lines.push("═══════════════════════════════════════════════");
  lines.push(`Brand      : ${brand.brand_name}`);
  lines.push(`Category   : ${brand.brand_category || "General"}`);
  lines.push(`Country    : ${country}`);
  lines.push(`Website    : ${brand.brand_website || "Not set"}`);
  if (brand.brand_description) {
    lines.push(`Description: ${brand.brand_description}`);
  }

  if (dna) {
    lines.push("");
    lines.push("— BRAND DNA —");
    if (dna.brand_essence)      lines.push(`Essence       : ${dna.brand_essence}`);
    if (dna.brand_personality)  lines.push(`Personality   : ${dna.brand_personality}`);
    if (dna.visual_identity)    lines.push(`Visual Style  : ${dna.visual_identity}`);
    if (dna.target_market)      lines.push(`Target Market : ${dna.target_market}`);
  }

  if (voice) {
    lines.push("");
    lines.push("— BRAND VOICE —");
    if (voice.tone)               lines.push(`Tone          : ${voice.tone}`);
    if (voice.language_style)     lines.push(`Language      : ${voice.language_style}`);
    if (voice.personality_traits?.length)
      lines.push(`Personality   : ${voice.personality_traits.join(", ")}`);
    if (voice.values?.length)
      lines.push(`Values        : ${voice.values.join(", ")}`);
    if (voice.do_phrases?.length)
      lines.push(`DO use        : ${voice.do_phrases.slice(0, 5).join(" | ")}`);
    if (voice.dont_phrases?.length)
      lines.push(`NEVER use     : ${voice.dont_phrases.slice(0, 5).join(" | ")}`);
    if (voice.emoji_usage)
      lines.push(`Emoji usage   : ${voice.emoji_usage}`);
  }

  if (chronicle) {
    lines.push("");
    lines.push("— STRATEGIC POSITION —");
    if (chronicle.competitive_position)
      lines.push(`Market Position : ${chronicle.competitive_position}`);
    if (chronicle.key_themes?.length)
      lines.push(`Content Pillars : ${chronicle.key_themes.slice(0, 5).join(", ")}`);
    if (chronicle.brand_narrative)
      lines.push(`Brand Narrative : ${chronicle.brand_narrative.slice(0, 300)}…`);
  }

  lines.push("═══════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Build the SEO/GEO/Social channel goals block.
 * Tailored per focus channel, referencing connected platforms.
 */
export function buildChannelGoals(
  ctx: BrandContext,
  channel: "seo" | "geo" | "social" | "all"
): string {
  const { brand, connectedPlatforms } = ctx;
  const connectedList = connectedPlatforms.map((p) => p.platform).join(", ") || "none connected";

  const seoGoals = `
SEO RESEARCH GOALS:
• Discover keyword opportunities where ${brand.brand_name} should rank on Google/Bing
• Find authoritative backlink sources in ${brand.brand_category || "this"} category (${brand.brand_country || "Indonesia"})
• Identify topical authority gaps vs. top-ranking competitors
• Uncover E-E-A-T signals: certifications, awards, expert mentions, trusted media coverage
• Output: prioritize by search volume × relevance × feasibility. Tag each finding: [SEO]`.trim();

  const geoGoals = `
GEO RESEARCH GOALS:
• Discover queries where AI engines (ChatGPT, Perplexity, Gemini, Claude) mention or should mention ${brand.brand_name}
• Find which authoritative sources AI engines cite most for this category
• Identify entity recognition signals: structured data, Wikipedia mentions, knowledge graph presence
• Detect brand citation patterns: what context/queries trigger brand mentions in AI responses
• Output: note which AI engine each finding applies to. Tag each finding: [GEO]`.trim();

  const socialGoals = `
SOCIAL SEARCH GOALS:
• Find trending topics, hashtags, and audio on TikTok/Instagram/YouTube for ${brand.brand_category || "this"} category
• Identify high-performing content formats, hooks, and posting patterns from top creators
• Discover influencer/creator collaboration opportunities relevant to ${brand.brand_name}
• Map competitor social strategies: posting frequency, content mix, engagement tactics
• Connected platforms: ${connectedList}
• Output: prioritize by engagement potential × brand fit. Tag each finding: [SSO]`.trim();

  if (channel === "seo") return seoGoals;
  if (channel === "geo") return geoGoals;
  if (channel === "social") return socialGoals;

  return `${seoGoals}\n\n${geoGoals}\n\n${socialGoals}`;
}

/**
 * Build a compact one-line brand signature for user prompt headers.
 * E.g. "Scarlett Whitening (skincare, Indonesia) — targeting: Gen Z & Millennial women"
 */
export function buildBrandSignature(ctx: BrandContext): string {
  const { brand, dna } = ctx;
  const parts = [brand.brand_name];
  if (brand.brand_category || brand.brand_country) {
    const detail = [brand.brand_category, brand.brand_country].filter(Boolean).join(", ");
    parts.push(`(${detail})`);
  }
  if (dna?.target_market) parts.push(`— targeting: ${dna.target_market}`);
  return parts.join(" ");
}

/**
 * Build voice guardrails string for content prompts.
 * Returns empty string if no voice data available.
 */
export function buildVoiceGuardrails(ctx: BrandContext): string {
  const { voice } = ctx;
  if (!voice) return "";

  const lines: string[] = ["VOICE GUARDRAILS:"];
  if (voice.do_phrases?.length)
    lines.push(`✓ DO write: ${voice.do_phrases.join(" | ")}`);
  if (voice.dont_phrases?.length)
    lines.push(`✗ NEVER write: ${voice.dont_phrases.join(" | ")}`);
  lines.push('✗ NEVER write AI clichés: "di era digital ini", "semakin berkembang", "tidak dapat dipungkiri", "tak pelak", "tentunya"');
  return lines.join("\n");
}
