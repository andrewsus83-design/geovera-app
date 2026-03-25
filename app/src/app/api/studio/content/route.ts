import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand_id = searchParams.get("brand_id");
  const type = searchParams.get("type");

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(SB_URL, SB_KEY);
  const fetchAll = !type;

  // ── Articles from gv_article_generations ──────────────────────────────────
  type ArticleRow = {
    id: string;
    topic: string | null;
    article_url: string | null;
    word_count: number | null;
    length: string | null;
    created_at: string;
    status: string | null;
  };
  let articles: ArticleRow[] = [];
  if (fetchAll || type === "artikel") {
    try {
      const { data } = await sb
        .from("gv_article_generations")
        .select("id, topic, article_url, word_count, length, created_at, status")
        .eq("brand_id", brand_id)
        .not("article_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) {
        articles = (data as ArticleRow[]).map(r => ({
          id: r.id,
          topic: r.topic ?? null,
          article_url: r.article_url ?? null,
          word_count: r.word_count ?? null,
          length: r.length ?? null,
          created_at: r.created_at,
          status: r.status ?? "completed",
        }));
      }
    } catch { articles = []; }
  }

  // ── Images from gv_image_generations ──────────────────────────────────────
  type ImageRow = {
    id: string;
    prompt_text: string | null;
    image_url: string | null;
    ai_model: string | null;
    status: string | null;
    created_at: string;
  };
  let images: ImageRow[] = [];
  if (fetchAll || type === "image") {
    try {
      const { data } = await sb
        .from("gv_image_generations")
        .select("id, prompt_text, image_url, ai_model, status, created_at")
        .eq("brand_id", brand_id)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) {
        images = (data as ImageRow[]).map(r => ({
          id: r.id,
          prompt_text: r.prompt_text ?? null,
          image_url: r.image_url ?? null,
          ai_model: r.ai_model ?? "Flux 2 Pro",
          status: r.status ?? "completed",
          created_at: r.created_at,
        }));
      }
    } catch { images = []; }
  }

  // ── Videos from gv_video_generations ──────────────────────────────────────
  type VideoRow = {
    id: string;
    hook: string | null;
    video_url: string | null;
    video_status: string | null;
    ai_model: string | null;
    target_platform: string | null;
    pipeline_step: number | null;
    created_at: string;
  };
  let videos: VideoRow[] = [];
  if (fetchAll || type === "video") {
    try {
      const { data } = await sb
        .from("gv_video_generations")
        .select("id, hook, video_url, video_status, ai_model, target_platform, pipeline_step, created_at")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) {
        videos = (data as VideoRow[]).map(r => ({
          id: r.id,
          hook: r.hook ?? null,
          video_url: r.video_url ?? null,
          video_status: r.video_status ?? "processing",
          ai_model: r.ai_model ?? null,
          target_platform: r.target_platform ?? null,
          pipeline_step: r.pipeline_step ?? null,
          created_at: r.created_at,
        }));
      }
    } catch { videos = []; }
  }

  return NextResponse.json(
    { articles, images, videos, total: articles.length + images.length + videos.length },
    { headers: CORS }
  );
}
