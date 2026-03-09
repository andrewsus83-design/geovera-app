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

export async function POST(
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
    const { data: userBrand } = await admin
      .from("user_brands").select("brand_id").eq("user_id", user.id).single();
    if (!userBrand) return NextResponse.json({ error: "No brand" }, { status: 400, headers: cors });
    const brand_id = userBrand.brand_id;

    const { data: job } = await admin
      .from("gv_content_jobs")
      .select("id, status, vp_max_objectives, vp_video_allowed, is_visual_pipeline, brand_id")
      .eq("id", jobId)
      .eq("brand_id", brand_id)
      .eq("is_visual_pipeline", true)
      .single();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404, headers: cors });
    if (job.status !== "image_analysis_review") {
      return NextResponse.json({
        error: `Cannot confirm objectives at status: ${job.status}`,
        code: "WRONG_STATUS",
      }, { status: 409, headers: cors });
    }

    // ── Validate objectives ───────────────────────────────────────────────────
    const body = await request.json();
    const { objectives } = body;
    // objectives: [{objective_type: string, weight: number}]

    if (!objectives || !Array.isArray(objectives) || objectives.length === 0) {
      return NextResponse.json({ error: "At least one objective required" }, { status: 400, headers: cors });
    }
    if (objectives.length > job.vp_max_objectives) {
      return NextResponse.json({
        error: `Your plan allows max ${job.vp_max_objectives} objective(s)`,
        code: "OBJECTIVES_LIMIT",
      }, { status: 403, headers: cors });
    }

    const totalWeight = objectives.reduce((s: number, o: any) => s + (o.weight || 0), 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return NextResponse.json({
        error: `Objective weights must sum to 1.0 (got ${totalWeight.toFixed(2)})`,
        code: "INVALID_WEIGHTS",
      }, { status: 400, headers: cors });
    }

    // ── "← Change images" refund path ────────────────────────────────────────
    if (body.cancel === true) {
      await admin.from("gv_content_jobs").update({ status: "cancelled" }).eq("id", jobId);
      await admin.rpc("refund_visual_submission", { p_brand_id: brand_id });
      return NextResponse.json({ success: true, refunded: true }, { headers: cors });
    }

    // ── Update job + trigger Stage 1 ─────────────────────────────────────────
    await admin.from("gv_content_jobs").update({
      objectives:          JSON.stringify(objectives),
      objective_confirmed: true,
      status:              "confirmed",
    }).eq("id", jobId);

    // Trigger Stage 1 async (prompt engineering)
    fetch(`${SUPABASE_URL}/functions/v1/visual-pipeline-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ job_id: jobId, stage: "prompt_engineering", brand_id }),
    }).catch(() => {});

    return NextResponse.json({ success: true, status: "confirmed" }, { headers: cors });

  } catch (err: any) {
    console.error("[pipeline/confirm-objective]", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}
