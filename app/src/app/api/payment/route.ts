import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

const ALLOWED_ACTIONS = new Set([
  "request_subscription",
  "get_subscription",
  "activate_free_tier",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
      return NextResponse.json(
        { error: "Invalid or missing action" },
        { status: 400, headers: cors }
      );
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/manual-payment-handler`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: `Upstream error (${response.status})` },
        { status: 502, headers: cors }
      );
    }

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
