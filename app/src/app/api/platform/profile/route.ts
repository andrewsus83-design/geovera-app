import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const IG_API = "https://graph.instagram.com/v21.0";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const brandId = searchParams.get("brandId");

  if (!platform || !brandId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const { data: brand } = await adminClient.from("brand_profiles").select("id").eq("id", brandId).eq("user_id", user.id).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabase();
  // Look up the stored connection for this brand + platform
  const { data: conn } = await supabase
    .from("social_connections")
    .select("access_token, platform_username, platform_name, platform_avatar_url, platform_account_id, status")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .eq("status", "active")
    .maybeSingle();

  if (!conn?.access_token) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  try {
    if (platform === "instagram") {
      // Instagram Graph API v21.0 — profile
      const [profileRes, mediaRes] = await Promise.all([
        fetch(
          `${IG_API}/me?fields=id,username,name,account_type,media_count,profile_picture_url,biography,website,followers_count,follows_count&access_token=${conn.access_token}`
        ),
        fetch(
          `${IG_API}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12&access_token=${conn.access_token}`
        ),
      ]);

      const profile = await profileRes.json();
      const media = await mediaRes.json();

      if (profile.error) {
        // Token expired — return stored basic info as demo
        return NextResponse.json({
          connected: true,
          demo: true,
          profile: {
            username: conn.platform_username || "your_account",
            name: conn.platform_name || "Your Account",
            profile_picture_url: conn.platform_avatar_url || null,
            followers_count: null,
            follows_count: null,
            media_count: null,
            biography: "",
          },
          posts: [],
        });
      }

      return NextResponse.json({
        connected: true,
        demo: false,
        profile,
        posts: media.data || [],
      });
    }

    // Default: return stored connection info without live API data
    return NextResponse.json({
      connected: true,
      demo: true,
      profile: {
        username: conn.platform_username,
        name: conn.platform_name,
        profile_picture_url: conn.platform_avatar_url,
      },
      posts: [],
    });
  } catch {
    return NextResponse.json({ connected: false, error: "fetch_failed" }, { status: 200 });
  }
}
