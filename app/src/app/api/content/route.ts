import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

const ALLOWED_ACTIONS = new Set([
  "generate_article",
  "generate_image",
  "generate_video",
  "generate_avatar_video",
  "generate_smart_prompt",
  "analyze_images",
  "generate_art_directed_prompt",
  "check_task",
  "check_daily_usage",
  "get_history",
  "submit_feedback",
  "update_article",
  "update_image",
  "update_video",
]);

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

    const body = await request.json();

    if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: cors });
    }

    // Verify brand ownership if brand_id provided
    if (body.brand_id) {
      const { data: brand } = await adminClient
        .from("brand_profiles")
        .select("id")
        .eq("id", body.brand_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!brand) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/content-studio-handler`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ ...body, user_id: user.id }),
      }
    );

    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: `Edge function error (${response.status})` },
        { status: 502, headers: cors }
      );
    }

    const result = await response.json();
    return NextResponse.json(result, { status: response.ok ? 200 : response.status, headers: cors });
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500, headers: cors });
  }
}
