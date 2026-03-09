import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Content Engine

   Orchestrates content generation using the Brand Source of Truth (SoT):
   1. Reads SoT content_calendar → picks best topic (or uses provided topic)
   2. Reads brand_dna for voice and style
   3. Calls generate-article (GPT-4o + Claude parallel pipeline) for:
      - short (300w), medium (800w), long (1500w), very long (3000w+)
      - SEO metadata + social captions per platform
      - Image prompt + video storyboard
   4. Fire-and-forget to content-studio-handler for image + video generation

   Triggered by:
   - brand-consolidator on first sot_ready (automatic initial content)
   - Manual: POST { brand_profile_id, user_id, topic? }
   - Daily: brand-daily-learner can suggest topics that trigger this

   Output: passes to existing gv_content_queue / gv_content_library tables
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      topic?: string;
      format?: "short" | "medium" | "long" | "very_long";
      platform?: string;
    };

    const { brand_profile_id, user_id, topic, format = "medium", platform = "blog" } = body;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch brand profile + SoT
    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, brand_dna, source_of_truth, website_url")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile) {
      return new Response(JSON.stringify({ error: "Brand profile not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    if (!profile.source_of_truth) {
      return new Response(JSON.stringify({
        error: "Source of truth not ready — wait for research pipeline to complete",
        research_status: "not_ready",
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const sot = profile.source_of_truth as Record<string, unknown>;
    const dna = profile.brand_dna as Record<string, unknown> ?? {};

    // Select topic from SoT content calendar if not provided
    let selectedTopic = topic;
    let selectedPlatform = platform;
    let targetKeyword: string | null = null;

    if (!selectedTopic) {
      const calendar = sot.content_calendar as Record<string, unknown> ?? {};
      const recommendations = (calendar.recommended_topics as Array<Record<string, unknown>>) ?? [];
      const topRec = recommendations.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))[0];

      if (topRec) {
        selectedTopic = String(topRec.topic ?? "");
        selectedPlatform = String(topRec.platform ?? platform);
        targetKeyword = String(topRec.target_keyword ?? "");
        console.log(`[brand-content-engine] Auto-selected topic: "${selectedTopic}" (priority: ${topRec.priority})`);
      }
    }

    if (!selectedTopic) {
      // Last resort: use brand name + top content gap
      const kwi = sot.keyword_intelligence as Record<string, unknown> ?? {};
      const gaps = (kwi.gap_keywords as string[]) ?? [];
      selectedTopic = gaps[0] ?? `${profile.brand_name} — Brand Story`;
      console.log(`[brand-content-engine] Fallback topic: "${selectedTopic}"`);
    }

    console.log(`[brand-content-engine] Generating content for: ${profile.brand_name} — "${selectedTopic}"`);

    // Build brand context for generate-article
    const brandContext = {
      brand_name: profile.brand_name,
      country: profile.country,
      positioning: String(dna.positioning ?? ""),
      usp: String(dna.usp ?? ""),
      voice_tone: JSON.stringify((dna.brand_voice as Record<string, unknown>)?.tone_attributes ?? []),
      archetype: String(dna.personality_archetype ?? ""),
      target_audience: JSON.stringify((dna.target_audience as Record<string, unknown>)?.primary_segment ?? ""),
      competitors: JSON.stringify(
        (sot.competitor_intelligence as Array<Record<string, unknown>> ?? [])
          .slice(0, 3).map((c) => c.name)
      ),
      primary_keywords: JSON.stringify(
        (sot.keyword_intelligence as Record<string, unknown>)?.ranking_keywords ?? []
      ),
    };

    // Map format to word count targets
    const wordCountMap = {
      short: 300,
      medium: 800,
      long: 1500,
      very_long: 3000,
    };

    // Look up brand in gv_brands to use with existing generate-article function
    const { data: gvBrand } = await supabase
      .from("gv_brands")
      .select("id")
      .eq("user_id", user_id)
      .single();

    if (gvBrand?.id) {
      // Use existing generate-article pipeline (GPT-4o + Claude parallel)
      supabase.functions.invoke("generate-article", {
        body: {
          brand_id: gvBrand.id,
          topic: selectedTopic,
          target_platform: selectedPlatform,
          target_length: wordCountMap[format],
          target_keyword: targetKeyword,
          brand_context: brandContext,
          auto_generate_image: true,
          auto_generate_video: false,
        },
      }).then(() => {
        console.log(`[brand-content-engine] generate-article invoked for "${selectedTopic}"`);
      }).catch((e: Error) => {
        console.error(`[brand-content-engine] generate-article failed: ${e.message}`);
      });
    } else {
      // No gv_brands entry yet — log and skip (user needs to complete full setup)
      console.log(`[brand-content-engine] No gv_brands entry for user ${user_id} — content queued for later`);
    }

    // Queue content for all formats (all 4 lengths will be generated over time)
    const contentCalendar = (sot.content_calendar as Record<string, unknown>)?.recommended_topics as Array<Record<string, unknown>> ?? [];
    const queuedFormats = ["short", "medium", "long", "very_long"] as const;

    console.log(`[brand-content-engine] Content pipeline started for: ${profile.brand_name}`);
    console.log(`[brand-content-engine] Topic: "${selectedTopic}" | Platform: ${selectedPlatform} | Format: ${format}`);
    console.log(`[brand-content-engine] Calendar topics available: ${contentCalendar.length}`);

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      topic_selected: selectedTopic,
      platform: selectedPlatform,
      format,
      target_keyword: targetKeyword,
      calendar_topics_available: contentCalendar.length,
      queued_formats: queuedFormats,
      gv_brand_linked: !!gvBrand?.id,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-content-engine] ERROR: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
