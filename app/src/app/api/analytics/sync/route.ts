import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL     = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const LATE_API_BASE    = "https://getlate.dev/api/v1";
const LATE_API_KEY     = process.env.LATE_API_KEY || "";
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY || "";
const DEMO_BRAND_ID    = process.env.NEXT_PUBLIC_DEMO_BRAND_ID || "a37dee82-5ed5-4ba4-991a-4d93dde9ff7a";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

// ── 10 Social Algorithm Factor labels ─────────────────────────────────────────
const FACTOR_LABELS = [
  "Watch Time Retention",
  "Engagement Aktif (Like, Comment, Share, Save/DM)",
  "CTR & Hook Awal",
  "Relevansi Konten",
  "Personalisasi & Behaviour User",
  "Quality Content (Satisfaction)",
  "Timing & Early Velocity",
  "Posting Consistency",
  "Community & Conversation",
  "Platform-Specific Optimization",
];

// ── Platform icon map ─────────────────────────────────────────────────────────
const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  twitter: "𝕏",
  x: "𝕏",
  linkedin: "💼",
  youtube: "▶️",
  facebook: "📘",
  blog: "✍️",
};

// ── Gradient palette per platform ────────────────────────────────────────────
const PLATFORM_GRADIENTS: Record<string, string> = {
  instagram: "from-pink-500 to-purple-600",
  tiktok:    "from-gray-900 to-black",
  twitter:   "from-gray-800 to-gray-900",
  x:         "from-gray-800 to-gray-900",
  linkedin:  "from-blue-600 to-blue-800",
  youtube:   "from-red-500 to-red-700",
  facebook:  "from-blue-500 to-blue-700",
  blog:      "from-brand-500 to-emerald-600",
};

// ── Score a post with Claude ──────────────────────────────────────────────────
async function scoreWithClaude(post: {
  platform: string;
  type: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watchRetention: number;
  ctr: number;
  publishedAt: string;
}): Promise<{ scores: number[]; overall: number }> {
  if (!ANTHROPIC_KEY) {
    // Return default scores if no Claude key
    return { scores: [0, 70, 65, 72, 68, 71, 75, 65, 67, 70], overall: 69 };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const prompt = `You are a social media algorithm expert. Score this social media post on 10 algorithm factors.

POST DATA:
Platform: ${post.platform}
Type: ${post.type}
Title: ${post.title || "N/A"}
Caption: ${post.caption}
Hashtags: ${post.hashtags.join(", ") || "none"}
Published: ${post.publishedAt}

METRICS (if available):
Reach: ${post.reach}
Likes: ${post.likes}
Comments: ${post.comments}
Shares: ${post.shares}
Saves: ${post.saves}
Watch Retention: ${post.watchRetention}%
CTR: ${post.ctr}%

Score each of the 10 factors from 0-100. For video-only factors (Watch Time Retention), use 0 if post is not video.
For factors that cannot be evaluated without real metrics, estimate based on content quality.

FACTORS TO SCORE:
1. Watch Time Retention (video only, else 0)
2. Engagement Aktif (Like, Comment, Share, Save/DM)
3. CTR & Hook Awal
4. Relevansi Konten
5. Personalisasi & Behaviour User
6. Quality Content (Satisfaction)
7. Timing & Early Velocity
8. Posting Consistency
9. Community & Conversation
10. Platform-Specific Optimization

Return ONLY a JSON object with exactly this structure:
{"scores": [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]}

Where each s is an integer 0-100. No explanation, just JSON.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(text) as { scores: number[] };
    const scores = parsed.scores.map((s) => Math.max(0, Math.min(100, Math.round(s))));
    const nonZero = scores.filter((s) => s > 0);
    const overall = nonZero.length > 0
      ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length)
      : 0;
    return { scores, overall };
  } catch (err) {
    console.error("[analytics/sync] Claude scoring error:", err);
    return { scores: [0, 70, 65, 72, 68, 71, 75, 65, 67, 70], overall: 69 };
  }
}

// ── JWT helper ────────────────────────────────────────────────────────────────
async function verifyAndOwnsBrand(
  request: NextRequest,
  brandId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors }) };
  }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors }) };
  }
  // Confirm the authenticated user owns this brand
  const { data: brand } = await adminClient
    .from("brand_profiles")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors }) };
  }
  return { ok: true };
}

// ── Main POST handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { brand_id?: string };
    const brandId = body.brand_id || DEMO_BRAND_ID;

    const auth = await verifyAndOwnsBrand(request, brandId);
    if (!auth.ok) return auth.response;

    if (!LATE_API_KEY) {
      return NextResponse.json({ success: false, error: "LATE_API_KEY not configured" }, { status: 500, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Fetch published posts from Late API
    const lateRes = await fetch(`${LATE_API_BASE}/posts?status=published&limit=20`, {
      headers: {
        "Authorization": `Bearer ${LATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!lateRes.ok) {
      const errText = await lateRes.text().catch(() => "");
      return NextResponse.json(
        { success: false, error: `Late API error ${lateRes.status}: ${errText.slice(0, 200)}` },
        { status: 502, headers: cors }
      );
    }

    const lateData = await lateRes.json() as {
      posts?: LatePost[];
      data?: LatePost[];
      items?: LatePost[];
    };

    // Late API might return data under different keys
    const posts: LatePost[] = lateData.posts || lateData.data || lateData.items || [];

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: "No published posts found" }, { headers: cors });
    }

    // 2. Process each post
    let synced = 0;
    const results: SyncedPost[] = [];

    for (const post of posts.slice(0, 20)) {
      try {
        const platform = (post.platform || post.platforms?.[0]?.platform || "instagram").toLowerCase();
        const content = post.content || "";
        const caption = content.replace(/#\w+/g, "").trim();
        const hashtags = (content.match(/#\w+/g) || []).map((t) => t);
        const publishedAt = post.publishedAt || post.published_at || post.scheduledFor || new Date().toISOString();
        const pubDate = new Date(publishedAt);
        const pubLabel = `${pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${pubDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

        // Try to get analytics from Late API
        let reach = 0, likes = 0, comments = 0, shares = 0, saves = 0, watchRetention = 0, ctr = 0;

        if (post.id) {
          try {
            const analyticsRes = await fetch(`${LATE_API_BASE}/posts/${post.id}/analytics`, {
              headers: { "Authorization": `Bearer ${LATE_API_KEY}` },
              signal: AbortSignal.timeout(10000),
            });
            if (analyticsRes.ok) {
              const an = await analyticsRes.json() as LateAnalytics;
              reach         = an.reach          || an.impressions || 0;
              likes         = an.likes          || an.reactions   || 0;
              comments      = an.comments       || 0;
              shares        = an.shares         || an.retweets    || 0;
              saves         = an.saves          || an.bookmarks   || 0;
              watchRetention = an.watchRetention || an.watch_retention || 0;
              ctr           = an.ctr            || 0;
            }
          } catch {
            // Analytics not available — proceed with zeros
          }
        }

        // Determine trend (use engagement vs reach ratio)
        const engagementRate = reach > 0 ? ((likes + comments + shares + saves) / reach) * 100 : 0;
        const trend: "up" | "down" | "flat" = engagementRate > 5 ? "up" : engagementRate > 2 ? "flat" : "down";
        const trendPct = Math.round(engagementRate * 10);

        // Claude scoring
        const { scores, overall } = await scoreWithClaude({
          platform,
          type: post.mediaType || post.media_type || "post",
          title: post.title || null,
          caption,
          hashtags,
          reach,
          likes,
          comments,
          shares,
          saves,
          watchRetention,
          ctr,
          publishedAt,
        });

        const row = {
          brand_id:        brandId,
          late_post_id:    post.id,
          platform,
          platform_icon:   PLATFORM_ICONS[platform] || "📱",
          post_type:       post.mediaType || post.media_type || "post",
          title:           post.title || caption.slice(0, 80) || null,
          caption,
          hashtags,
          post_url:        post.platformPostUrl || post.platform_post_url || post.url || null,
          image_url:       post.mediaUrls?.[0] || post.media_urls?.[0] || null,
          published_at:    publishedAt,
          timestamp_label: pubLabel,
          image_bg:        PLATFORM_GRADIENTS[platform] || "from-gray-500 to-gray-700",
          image_emoji:     PLATFORM_ICONS[platform] || "📱",
          reach,
          likes,
          comments,
          shares,
          saves,
          watch_retention: watchRetention,
          ctr,
          trend,
          trend_pct:       trendPct,
          factor_scores:   scores,
          overall_score:   overall,
          claude_scored_at: new Date().toISOString(),
          raw_late_data:   post,
          synced_at:       new Date().toISOString(),
        };

        await supabase
          .from("gv_social_analytics")
          .upsert(row, { onConflict: "brand_id,late_post_id" });

        synced++;
        results.push({ id: post.id, platform, overall });
      } catch (postErr) {
        console.error("[analytics/sync] Error processing post:", postErr);
      }
    }

    return NextResponse.json({ success: true, synced, results }, { headers: cors });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: cors });
  }
}

// ── GET: load analytics from Supabase ────────────────────────────────────────
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brand_id") || DEMO_BRAND_ID;

  const auth = await verifyAndOwnsBrand(request, brandId);
  if (!auth.ok) return auth.response;

  if (!SUPABASE_KEY) {
    return NextResponse.json({ success: true, data: [] }, { headers: cors });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data, error } = await supabase
    .from("gv_social_analytics")
    .select("*")
    .eq("brand_id", brandId)
    .order("published_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[analytics/sync] GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500, headers: cors });
  }

  return NextResponse.json({ success: true, data: data || [] }, { headers: cors });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface LatePost {
  id: string;
  content: string;
  title?: string;
  platform?: string;
  platforms?: { platform: string }[];
  mediaType?: string;
  media_type?: string;
  mediaUrls?: string[];
  media_urls?: string[];
  publishedAt?: string;
  published_at?: string;
  scheduledFor?: string;
  platformPostUrl?: string;
  platform_post_url?: string;
  url?: string;
}

interface LateAnalytics {
  reach?: number;
  impressions?: number;
  likes?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  retweets?: number;
  saves?: number;
  bookmarks?: number;
  watchRetention?: number;
  watch_retention?: number;
  ctr?: number;
}

interface SyncedPost {
  id: string;
  platform: string;
  overall: number;
}
