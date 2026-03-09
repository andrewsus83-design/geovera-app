import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }
    const token = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401, headers: cors });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get brand_id for this user
    const { data: userBrand } = await admin
      .from("user_brands").select("brand_id").eq("user_id", user.id).single();
    if (!userBrand) return NextResponse.json({ error: "No brand" }, { status: 400, headers: cors });

    // Fetch job (must belong to this brand)
    const { data: job, error: jobErr } = await admin
      .from("gv_content_jobs")
      .select(`
        id, status, is_visual_pipeline,
        vp_images_per_submit, vp_video_allowed, vp_video_max_sec, vp_max_objectives,
        input_images, image_analysis, objectives, objective_confirmed,
        product_bible, gemini_prompts, flux_prompts,
        generated_images, scoring_results, top12_by_ratio, quality_gate_passed,
        flux_outputs, video_requested, video_duration_auto, video_outputs,
        error_message, generation_cost_usd, started_at, completed_at,
        created_at, updated_at
      `)
      .eq("id", jobId)
      .eq("brand_id", userBrand.brand_id)
      .eq("is_visual_pipeline", true)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404, headers: cors });
    }

    // Compute progress metrics
    const generatedImages  = Array.isArray(job.generated_images)  ? job.generated_images  : [];
    const fluxOutputs      = Array.isArray(job.flux_outputs)       ? job.flux_outputs       : [];
    const videoOutputs     = Array.isArray(job.video_outputs)      ? job.video_outputs      : [];
    const top12            = job.top12_by_ratio as Record<string, any[]> || {};

    const top12Count = {
      "9:16":  (top12["9:16"]  || []).length,
      "16:9":  (top12["16:9"] || []).length,
      "1:1":   (top12["1:1"]  || []).length,
    };

    // Quota for display
    const { data: quota } = await admin
      .rpc("get_visual_quota", { p_brand_id: userBrand.brand_id });

    return NextResponse.json({
      job_id:              job.id,
      status:              job.status,
      quality_gate_passed: job.quality_gate_passed,
      error_message:       job.error_message,
      objectives:          job.objectives || [],
      objective_confirmed: job.objective_confirmed,
      image_analysis:      job.image_analysis,    // Stage 0 result (shown to user for review)
      progress: {
        generated:     generatedImages.length,
        total:         job.vp_images_per_submit || 0,
        top12_count:   top12Count,
        refined:       fluxOutputs.length,
        gpu_warming:   job.status === "refining" && fluxOutputs.length === 0,
      },
      video_info: {
        requested:          job.video_requested,
        allowed:            job.vp_video_allowed,
        duration_sec:       job.video_duration_auto,
        status:             job.status === "video_gen" ? "generating"
                          : job.status === "video_analyzing" ? "analyzing"
                          : videoOutputs.length > 0 ? "done"
                          : job.video_requested ? "pending" : "skipped",
      },
      flux_outputs:        fluxOutputs,
      video_outputs:       videoOutputs,
      quota:               quota ? {
        submissions_remaining: quota.submissions_remaining,
        reset_at:             quota.reset_at,
      } : null,
      created_at:          job.created_at,
      updated_at:          job.updated_at,
    }, { headers: cors });

  } catch (err: any) {
    console.error("[pipeline/status]", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}
