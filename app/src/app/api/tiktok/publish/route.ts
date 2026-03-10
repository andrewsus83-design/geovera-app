import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEMO_BRAND_ID = process.env.NEXT_PUBLIC_DEMO_BRAND_ID || "a37dee82-5ed5-4ba4-991a-4d93dde9ff7a";

const SOCIAL_PUBLISH_URL = `${SUPABASE_URL}/functions/v1/social-publish`;

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
    const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

    const body = await request.json() as {
      postId?:    string;
      caption?:   string;
      videoUrl?:  string;
      brandId?:   string;
      scheduleAt?: string;
    };

    const brandId  = body.brandId || DEMO_BRAND_ID;

    const { data: brand } = await adminClient.from("brand_profiles").select("id").eq("id", brandId).eq("user_id", user.id).maybeSingle();
    if (!brand) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    const caption  = body.caption || "";
    const videoUrl = body.videoUrl;

    if (!caption) {
      return NextResponse.json(
        { success: false, error: "caption is required" },
        { status: 400, headers: cors }
      );
    }

    // Look up TikTok account from social_connections
    let accountId = "";
    if (SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: conn } = await supabase
        .from("social_connections")
        .select("platform_account_id")
        .eq("brand_id", brandId)
        .eq("platform", "tiktok")
        .eq("status", "active")
        .maybeSingle();
      if (conn?.platform_account_id) accountId = conn.platform_account_id;
    }

    // No connected TikTok → demo mode
    if (!accountId) {
      return NextResponse.json(
        {
          success: true,
          demo:    true,
          post_id: `demo-tiktok-${Date.now()}`,
          message: "No connected TikTok account. Marked as published (demo mode).",
        },
        { headers: cors }
      );
    }

    // Call social-publish edge function
    const edgeRes = await fetch(SOCIAL_PUBLISH_URL, {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${SUPABASE_KEY}`,
        "Content-Type":   "application/json",
      },
      body: JSON.stringify({
        brand_id:    brandId,
        platform:    "tiktok",
        account_id:  accountId,
        content:     caption,
        media_urls:  videoUrl ? [videoUrl] : undefined,
        publish_now: !body.scheduleAt,
        scheduled_for: body.scheduleAt,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const edgeData = await edgeRes.json() as {
      success?: boolean;
      post_id?:  string;
      post_url?: string;
      error?:    string;
    };

    if (!edgeRes.ok) {
      return NextResponse.json(
        { success: false, error: edgeData.error || "publish_failed" },
        { status: 502, headers: cors }
      );
    }

    return NextResponse.json({ success: true, ...edgeData }, { headers: cors });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: cors });
  }
}
