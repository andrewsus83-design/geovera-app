import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const body = await request.json();

    if (!body.brand_id || !body.role || !body.message) {
      return NextResponse.json(
        { error: "brand_id, role, and message are required" },
        { status: 400, headers: cors }
      );
    }

    const brandId = body.brand_id;
    const { data: brand } = await adminClient.from("brand_profiles").select("id").eq("id", brandId).eq("user_id", user.id).maybeSingle();
    if (!brand) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/agent-inference`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json();
    return NextResponse.json(result, {
      status: response.ok ? 200 : response.status,
      headers: cors,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500, headers: cors }
    );
  }
}
