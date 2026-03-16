import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WEBHOOK_SECRET = process.env.LATE_WEBHOOK_SECRET || "";

function verifySignature(body: string, header: string | null): boolean {
  if (!WEBHOOK_SECRET) return false;
  if (!header) return false;
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`);
  const receivedBuf = Buffer.from(header);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function extractSlugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/hub\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-late-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.event || !payload.post_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let articleId: string | null = null;
  const slug = extractSlugFromUrl(payload.source_url as string | undefined);
  if (slug) {
    const { data: article } = await supabase
      .from("gv_hub_articles")
      .select("id, brand_id")
      .eq("slug", slug)
      .single();
    if (article) articleId = article.id;
  }

  const statusMap: Record<string, string> = {
    "post.scheduled": "scheduled",
    "post.published": "published",
    "post.failed": "failed",
    "post.deleted": "deleted",
  };
  const status = statusMap[payload.event as string] || (payload.event as string);

  if (articleId) {
    const { data: articleInfo } = await supabase
      .from("gv_hub_articles")
      .select("brand_id")
      .eq("id", articleId)
      .single();

    const logEntry: Record<string, unknown> = {
      article_id: articleId,
      brand_id: articleInfo?.brand_id || null,
      platform: payload.network,
      late_post_id: payload.post_id,
      late_status: status,
      post_url: payload.post_url || null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    };
    if (payload.scheduled_time) logEntry.scheduled_at = payload.scheduled_time;
    if (payload.published_time) logEntry.published_at = payload.published_time;
    if (payload.reach)    logEntry.reach    = payload.reach;
    if (payload.likes)    logEntry.likes    = payload.likes;
    if (payload.comments) logEntry.comments = payload.comments;
    if (payload.shares)   logEntry.shares   = payload.shares;

    await supabase
      .from("gv_rss_publish_log")
      .upsert(logEntry, { onConflict: "late_post_id, platform" });
  }

  return NextResponse.json({ received: true, event: payload.event });
}
