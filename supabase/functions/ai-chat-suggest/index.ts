/**
 * ai-chat-suggest — Generates personalized AI Chat suggested prompts for a brand.
 *
 * Claude (director-level) analyzes brand's current data and generates 8 hyper-specific
 * suggested prompts that users can click to immediately get high-value answers.
 *
 * Called after:
 * - Brand research pipeline completes (brand-consolidator fires this)
 * - brand-daily-learner daily cycle
 * - Manual refresh from UI
 *
 * Stored in gv_ai_suggested_prompts with 7-day TTL.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brand_id } = await req.json();
    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load brand knowledge
    const { data: bp } = await supabase
      .from("brand_profiles")
      .select("id, brand_name, brand_category, country, research_data, source_of_truth, perplexity_data, apify_data, serpapi_data")
      .eq("id", brand_id)
      .eq("user_id", user.id)
      .single();

    if (!bp) {
      return new Response(JSON.stringify({ error: "Brand not found" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sot = (bp.source_of_truth as Record<string, unknown>) ?? {};
    const rd  = (bp.research_data  as Record<string, unknown>) ?? {};

    // Extract key data points for prompt generation
    const topCompetitor = ((sot.competitor_intelligence as any[])?.[0]?.name) ?? null;
    const topKeyword    = ((bp.serpapi_data as any)?.keyword_intelligence?.quick_wins?.[0]) ?? null;
    const topTopic      = ((sot.content_calendar as any)?.recommended_topics?.[0]?.topic) ?? null;
    const biggestOpp    = ((sot.opportunity_map  as any)?.prioritized_actions?.[0]) ?? null;
    const brandName     = bp.brand_name as string;
    const category      = (bp.brand_category ?? (rd as any)?.brand_category ?? "brand") as string;
    const country       = (bp.country ?? (rd as any)?.country ?? "Indonesia") as string;
    const targetMarket  = (rd as any)?.brand_dna?.target_market ?? `${category} audience`;

    const knowledgeSummary = JSON.stringify({
      brand: brandName, category, country,
      top_competitor: topCompetitor,
      top_keyword: topKeyword,
      top_content_topic: topTopic,
      biggest_opportunity: biggestOpp,
      sot_has_data: Object.keys(sot).length > 0,
      has_serp_data: !!bp.serpapi_data,
      has_social_data: !!bp.apify_data,
    });

    const prompt = `You are a director-level AI Chat prompt strategist at GeoVera.

Generate 8 highly specific, immediately actionable suggested chat prompts for ${brandName} (${category} brand in ${country}).

Brand intelligence snapshot:
${knowledgeSummary}

Rules for great suggested prompts:
1. Be HYPER-SPECIFIC — use actual brand name, category, market, competitor names when available
2. Each prompt should immediately unlock high-value insight when asked
3. Cover different intent types: writing, seo, social, competitor, research, analysis
4. Make prompts sound natural — like a smart marketer would ask
5. Prioritize prompts based on biggest impact for the brand right now

BAD: "How do I improve my SEO?"
GOOD: "Write a 600-word SEO-optimized blog post about [top keyword] that positions ${brandName} as the go-to authority for ${targetMarket} in ${country}"

BAD: "What should I do on social media?"
GOOD: "Create a 30-day TikTok content calendar for ${brandName} targeting ${targetMarket} with 3 posts/week — include hooks, hashtags, and content angles"

Output a JSON array of exactly 8 prompts:
[
  {
    "intent_type": "writing|seo|social|competitor|research|analysis",
    "category": "same as intent_type",
    "prompt_text": "the exact prompt text the user would type",
    "context_hint": "4-6 word UI hint explaining what this unlocks",
    "why_suggested": "1 sentence explaining why this is valuable now",
    "priority": 1-8
  }
]

Make priority 1 the highest-impact prompt for right now. Output JSON array only.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",  // Fast + cheap for prompt generation
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude error ${res.status}`);
    const claudeData = await res.json();
    const raw = claudeData.content[0].text.replace(/```json\n?|\n?```/g, "").trim();
    const prompts: any[] = JSON.parse(raw);

    // Delete old prompts for this brand
    await supabase.from("gv_ai_suggested_prompts")
      .delete()
      .eq("brand_id", brand_id)
      .eq("user_id", user.id);

    // Insert new prompts with 7-day TTL
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = prompts.map(p => ({
      brand_id,
      user_id:      user.id,
      intent_type:  p.intent_type || "general",
      category:     p.category    || p.intent_type || "general",
      prompt_text:  p.prompt_text,
      context_hint: p.context_hint,
      why_suggested:p.why_suggested,
      priority:     p.priority || 0,
      expires_at:   expiresAt,
    }));

    const { error: insertErr } = await supabase.from("gv_ai_suggested_prompts").insert(rows);
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({
      success: true,
      brand_id,
      prompts_generated: rows.length,
      prompts: rows,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("ai-chat-suggest error:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
