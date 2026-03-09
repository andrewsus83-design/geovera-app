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

    const { data: quota, error } = await admin
      .rpc("get_visual_quota", { p_brand_id: userBrand.brand_id });

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors });

    // Also get recent jobs for history display
    const { data: recentJobs } = await admin
      .from("gv_content_jobs")
      .select("id, status, objectives, flux_outputs, video_outputs, quality_gate_passed, created_at")
      .eq("brand_id", userBrand.brand_id)
      .eq("is_visual_pipeline", true)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      quota,
      recent_jobs: recentJobs || [],
    }, { headers: cors });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}
