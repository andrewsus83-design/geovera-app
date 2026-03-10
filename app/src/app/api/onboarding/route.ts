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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

    // Look up the user's brand_profile (server-side — do not trust client-supplied brand_profile_id)
    const { data: bp } = await adminClient
      .from("brand_profiles")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!bp?.id) {
      return NextResponse.json({ error: "No brand profile found" }, { status: 404, headers: cors });
    }

    // Trigger brand-indexer-gemini with verified IDs
    const response = await fetch(`${SUPABASE_URL}/functions/v1/brand-indexer-gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({ brand_profile_id: bp.id, user_id: user.id }),
    });

    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return NextResponse.json({ success: false, error: "Onboarding pipeline unavailable" }, { status: 502, headers: cors });
    }
    const result = await response.json();
    return NextResponse.json(result, { headers: cors });
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500, headers: cors });
  }
}
