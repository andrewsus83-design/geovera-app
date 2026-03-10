import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_OBJECTIVES = new Set([
  "multi_angles", "theme_variants", "sequence_story",
  "multi_catalog", "brand_campaign", "character_sheet",
]);

const VALID_PLATFORMS = new Set([
  "tiktok_9_16", "instagram_story_9_16", "instagram_1_1", "linkedin_16_9",
]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }
    const token = authHeader.slice(7);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401, headers: cors });
    }

    // ── Get brand ─────────────────────────────────────────────────────────────
    const { data: userBrand } = await admin
      .from("brand_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (!userBrand) {
      return NextResponse.json({ error: "No brand found for user" }, { status: 400, headers: cors });
    }
    const brand_id = userBrand.id;

    // ── Quota check ───────────────────────────────────────────────────────────
    const { data: quota, error: quotaErr } = await admin
      .rpc("get_visual_quota", { p_brand_id: brand_id });
    if (quotaErr) {
      return NextResponse.json({ error: "Failed to check quota" }, { status: 500, headers: cors });
    }
    if (!quota.can_submit) {
      return NextResponse.json({
        error: "Daily submission quota exhausted",
        code: "QUOTA_EXHAUSTED",
        submissions_remaining: 0,
        reset_at: quota.reset_at,
      }, { status: 403, headers: cors });
    }

    // ── Check no active job ───────────────────────────────────────────────────
    const { data: activeJob } = await admin
      .from("gv_content_jobs")
      .select("id, status")
      .eq("brand_id", brand_id)
      .eq("is_visual_pipeline", true)
      .in("status", [
        "image_analyzing", "image_analysis_review", "confirmed",
        "prompt_engineering", "generating", "scoring", "refining",
        "video_analyzing", "video_gen",
      ])
      .maybeSingle();
    if (activeJob) {
      return NextResponse.json({
        error: "A visual job is already in progress",
        code: "ACTIVE_JOB",
        job_id: activeJob.id,
        status: activeJob.status,
      }, { status: 409, headers: cors });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await request.json();
    const {
      input_images,                  // string[] — R2 URLs (1–8 ref images)
      objectives,                    // [{objective_type, weight}] — chosen upfront
      target_platforms = [],         // ["tiktok_9_16","instagram_1_1",...] — chosen upfront
      video_requested  = false,
      brand_notes,
    } = body;

    // ── Validate images ───────────────────────────────────────────────────────
    if (!input_images || !Array.isArray(input_images)
        || input_images.length < 1 || input_images.length > 8) {
      return NextResponse.json({
        error: "Provide 1–8 reference images",
        code: "INVALID_IMAGES",
      }, { status: 400, headers: cors });
    }

    // ── Validate objectives (required, upfront) ───────────────────────────────
    if (!objectives || !Array.isArray(objectives) || objectives.length === 0) {
      return NextResponse.json({
        error: "Select at least one objective",
        code: "NO_OBJECTIVES",
      }, { status: 400, headers: cors });
    }
    const maxObj = quota.max_objectives || 1;
    if (objectives.length > maxObj) {
      return NextResponse.json({
        error: `Your plan allows max ${maxObj} objective(s)`,
        code: "OBJECTIVES_LIMIT",
      }, { status: 403, headers: cors });
    }
    for (const o of objectives) {
      if (!VALID_OBJECTIVES.has(o.objective_type)) {
        return NextResponse.json({
          error: `Invalid objective: ${o.objective_type}`,
          code: "INVALID_OBJECTIVE",
        }, { status: 400, headers: cors });
      }
    }
    const totalWeight = objectives.reduce((s: number, o: any) => s + (o.weight || 0), 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return NextResponse.json({
        error: `Objective weights must sum to 1.0 (got ${totalWeight.toFixed(2)})`,
        code: "INVALID_WEIGHTS",
      }, { status: 400, headers: cors });
    }

    // ── Validate platforms ────────────────────────────────────────────────────
    for (const p of target_platforms) {
      if (!VALID_PLATFORMS.has(p)) {
        return NextResponse.json({
          error: `Invalid platform: ${p}`,
          code: "INVALID_PLATFORM",
        }, { status: 400, headers: cors });
      }
    }

    // ── Tier limits (server-side only, never trust client) ────────────────────
    const images_per_submission = quota.images_per_submission;
    const video_allowed         = quota.video_available;
    const video_max_sec         = quota.video_max_sec;
    const max_objectives        = quota.max_objectives;

    // video_requested only valid if tier allows it AND tiktok_9_16 was selected
    const effectiveVideoRequested =
      video_allowed &&
      video_requested &&
      target_platforms.includes("tiktok_9_16");

    // ── Insert job — objectives confirmed immediately ──────────────────────────
    const { data: job, error: jobErr } = await admin
      .from("gv_content_jobs")
      .insert({
        brand_id,
        content_type:         "visual_pipeline",
        target_platform:      target_platforms[0] || "tiktok",
        is_visual_pipeline:   true,

        // Intent-first: objectives locked at creation, Stage 0 runs background
        status:               "prompt_engineering",  // skip image_analysis_review step
        objective_confirmed:  true,
        objectives:           JSON.stringify(objectives),

        // Tier snapshot (immutable)
        vp_images_per_submit: images_per_submission,
        vp_video_allowed:     video_allowed,
        vp_video_max_sec:     video_max_sec,
        vp_max_objectives:    max_objectives,

        // User intent
        input_images:         JSON.stringify(input_images),
        target_platforms:     JSON.stringify(target_platforms),
        video_requested:      effectiveVideoRequested,
        brand_notes:          brand_notes || null,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[pipeline/create] insert error:", jobErr);
      return NextResponse.json({ error: "Failed to create job" }, { status: 500, headers: cors });
    }

    // ── Consume slot immediately ──────────────────────────────────────────────
    await admin.rpc("increment_visual_submission", { p_brand_id: brand_id });

    // ── Trigger both Stage 0 (background, parallel) + Stage 1 (main pipeline) ─
    // Stage 0 — image analysis for quality gate + bible seeds (non-blocking)
    fetch(`${SUPABASE_URL}/functions/v1/visual-pipeline-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        job_id: job.id,
        stage:  "analyze_images_background",  // non-blocking variant
        brand_id,
      }),
    }).catch(() => {});

    // Stage 1 — prompt engineering starts immediately
    fetch(`${SUPABASE_URL}/functions/v1/visual-pipeline-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        job_id: job.id,
        stage:  "prompt_engineering",
        brand_id,
      }),
    }).catch(() => {});

    return NextResponse.json({
      success:               true,
      job_id:                job.id,
      status:                "prompt_engineering",
      submissions_remaining: quota.submissions_remaining - 1,
      reset_at:              quota.reset_at,
      objectives,
      target_platforms,
      video_requested:       effectiveVideoRequested,
      tier: {
        plan:               quota.plan,
        images_per_submission,
        video_allowed,
        video_max_sec,
        max_objectives,
      },
    }, { status: 201, headers: cors });

  } catch (err: unknown) {
    console.error("[pipeline/create]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: cors });
  }
}
