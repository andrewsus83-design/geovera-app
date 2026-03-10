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

export async function GET(request: NextRequest) {
  try {
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

    const { data: userBrand } = await admin
      .from("brand_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (!userBrand) return NextResponse.json({ error: "No brand" }, { status: 400, headers: cors });
    const brandId = userBrand.id;

    const { data: quota, error } = await admin
      .rpc("get_visual_quota", { p_brand_id: brandId });

    if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: cors });

    // Also get recent jobs for history display
    const { data: recentJobs } = await admin
      .from("gv_content_jobs")
      .select("id, status, objectives, flux_outputs, video_outputs, quality_gate_passed, created_at")
      .eq("brand_id", brandId)
      .eq("is_visual_pipeline", true)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      quota,
      recent_jobs: recentJobs || [],
    }, { headers: cors });

  } catch (err: unknown) {
    console.error("[quota/visual]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: cors });
  }
}
