import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL       = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TIKTOK_CLIENT_KEY  = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || "";
const TIKTOK_REDIRECT_URI = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI
  || "https://report.geovera.xyz/api/tiktok/callback";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://report.geovera.xyz";

// State format: "{brandId}:{source}:{code_verifier}"
// source is "calendar" (or legacy "tiktok-calendar")
function parseState(state: string): { brandId: string; source: string; verifier: string } | null {
  const parts = state.split(":");
  if (parts.length < 3) return null;
  return {
    brandId: parts[0],
    source:  parts[1],
    verifier: parts.slice(2).join(":"), // verifier may contain colons if base64url
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Determine redirect destination from state
  const parsed = state ? parseState(state) : null;
  const source = parsed?.source || "calendar";
  const returnPath = (source === "tiktok-calendar" || source === "calendar") ? "/calendar" : "/calendar";

  const errorRedirect = (err: string) =>
    NextResponse.redirect(`${APP_URL}${returnPath}?error=${encodeURIComponent(err)}`);

  if (error) return errorRedirect(error);
  if (!code || !state) return errorRedirect("missing_params");
  if (!parsed) return errorRedirect("invalid_state");
  if (!TIKTOK_CLIENT_KEY) return errorRedirect("tiktok_not_configured");

  try {
    // Exchange code for access token (PKCE — no client_secret needed)
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key:     TIKTOK_CLIENT_KEY,
        code,
        code_verifier:  parsed.verifier,
        grant_type:     "authorization_code",
        redirect_uri:   TIKTOK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?:  string;
      open_id?:       string;
      scope?:         string;
      expires_in?:    number;
      refresh_token?: string;
      error?:         string;
      message?:       string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[tiktok/callback] Token exchange failed:", JSON.stringify(tokenData));
      return errorRedirect("token_exchange_failed");
    }

    // Fetch user info
    let username = "";
    try {
      const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json() as {
        data?: { user?: { open_id?: string; display_name?: string; username?: string } };
      };
      username = userData.data?.user?.username || userData.data?.user?.display_name || "";
    } catch {
      // non-blocking
    }

    // Persist to Supabase
    if (SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const now = new Date().toISOString();
      await supabase.from("social_connections").upsert(
        {
          brand_id:            parsed.brandId,
          platform:            "tiktok",
          platform_account_id: tokenData.open_id || `tiktok_${Date.now()}`,
          platform_username:   username || null,
          access_token:        tokenData.access_token,
          refresh_token:       tokenData.refresh_token || null,
          token_expires_at:    tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null,
          status:              "active",
          connected_at:        now,
          updated_at:          now,
        },
        { onConflict: "brand_id,platform" }
      );
    }

    return NextResponse.redirect(
      `${APP_URL}${returnPath}?tiktok_connected=true`
    );
  } catch (err) {
    console.error("[tiktok/callback] Unexpected error:", err);
    return errorRedirect("server_error");
  }
}
