import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

function fmtDD_MMM(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  } catch {
    return "—";
  }
}

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
  const type = searchParams.get("type"); // artikel | image | video | undefined

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(SB_URL, SB_KEY);

  const fetchAll = !type;
  const fetchArticles = fetchAll || type === "artikel";
  const fetchImages = fetchAll || type === "image";
  const fetchVideos = fetchAll || type === "video";

  // --- Images ---
  type ImageRow = { id: string; prompt: string | null; created_at: string; model: string | null; status: string | null; url: string | null };
  let images: ImageRow[] = [];
  if (fetchImages) {
    try {
      const { data, error } = await sb
        .from("gv_image_generations")
        .select("id, prompt_text, created_at, model, status, url")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        images = data.map((r: { id: string; prompt_text: string | null; created_at: string; model: string | null; status: string | null; url: string | null }) => ({
          id: r.id,
          prompt: r.prompt_text ?? null,
          created_at: fmtDD_MMM(r.created_at),
          model: r.model ?? null,
          status: r.status ?? null,
          url: r.url ?? null,
        }));
      }
    } catch {
      images = [];
    }
  }

  // --- Videos ---
  type VideoRow = { id: string; title: string | null; created_at: string; status: string | null; target_platform: string | null; pipeline_step: string | null; duration: string };
  let videos: VideoRow[] = [];
  if (fetchVideos) {
    try {
      const { data, error } = await sb
        .from("gv_video_generations")
        .select("id, hook, created_at, video_status, target_platform, pipeline_step, pipeline_data")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        videos = data.map((r: { id: string; hook: string | null; created_at: string; video_status: string | null; target_platform: string | null; pipeline_step: string | null; pipeline_data?: { duration?: string | number } | null }) => {
          let duration = "—";
          try {
            const pd = r.pipeline_data;
            if (pd && typeof pd === "object" && pd.duration) {
              duration = String(pd.duration);
            }
          } catch {
            duration = "—";
          }
          return {
            id: r.id,
            title: r.hook ?? null,
            created_at: fmtDD_MMM(r.created_at),
            status: r.video_status ?? null,
            target_platform: r.target_platform ?? null,
            pipeline_step: r.pipeline_step ?? null,
            duration,
          };
        });
      }
    } catch {
      videos = [];
    }
  }

  // --- Articles (tasks with content_type artikel/article/text) ---
  type ArticleRow = { id: string; title: string | null; description: string | null; created_at: string; status: string | null; platform: string | null; content_type: string | null };
  let articles: ArticleRow[] = [];
  if (fetchArticles) {
    try {
      const { data, error } = await sb
        .from("gv_tasks")
        .select("id, title, description, created_at, status, platform, content_type")
        .eq("brand_id", brand_id)
        .in("content_type", ["artikel", "article", "text"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        articles = data.map((r: { id: string; title: string | null; description: string | null; created_at: string; status: string | null; platform: string | null; content_type: string | null }) => ({
          id: r.id,
          title: r.title ?? null,
          description: r.description ?? null,
          created_at: fmtDD_MMM(r.created_at),
          status: r.status ?? null,
          platform: r.platform ?? null,
          content_type: r.content_type ?? null,
        }));
      }
    } catch {
      articles = [];
    }
  }

  const total = articles.length + images.length + videos.length;

  return NextResponse.json(
    { articles, images, videos, total },
    { headers: CORS }
  );
}
