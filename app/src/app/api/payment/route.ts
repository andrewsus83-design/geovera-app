import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
// Use the anon key for JWT verification — no server-side secret required in Vercel.
// The edge function creates its own admin client with the auto-injected service key.
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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
  "send_approval_email",
]);

const ADMIN_ONLY_ACTIONS = new Set(["send_approval_email"]);

export async function POST(request: NextRequest) {
  try {
    // ── Verify the caller's JWT ──────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }

    // ── Parse and validate body ──────────────────────────────────────
    const body = await request.json();

    if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
      return NextResponse.json(
        { error: "Invalid or missing action" },
        { status: 400, headers: cors }
      );
    }

    // Admin-only actions require the caller to be the admin account
    if (ADMIN_ONLY_ACTIONS.has(body.action) && user.email !== "andrewsus83@gmail.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    // Override user_id with the server-verified value — never trust client-supplied ID
    const verifiedBody = { ...body, user_id: user.id };

    // ── Forward to edge function ─────────────────────────────────────
    // manual-payment-handler has verify_jwt:false — protected by X-Internal-Secret
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/manual-payment-handler`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "x-internal-secret": process.env.INTERNAL_HANDLER_SECRET ?? "",
        },
        body: JSON.stringify(verifiedBody),
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
