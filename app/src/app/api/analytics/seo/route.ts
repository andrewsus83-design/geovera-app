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

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(SB_URL, SB_KEY);

  type KwRow = {
    keyword: string;
    current_rank: number | null;
    best_rank: number | null;
    vol: string;
    keyword_type: string;
    last_tracked_at: string | null;
  };

  let rawKeywords: KwRow[] = [];
  try {
    const { data, error } = await sb
      .from("gv_keywords")
      .select("keyword, current_rank, best_rank, total_searches, keyword_type, last_tracked_at")
      .eq("brand_id", brand_id)
      .eq("keyword_type", "seo")
      .eq("active", true)
      .order("priority", { ascending: false })
      .limit(10);

    if (!error && data) {
      rawKeywords = data.map((r: { keyword: string; current_rank: number | null; best_rank: number | null; total_searches: number | null; keyword_type: string; last_tracked_at: string | null }) => ({
        keyword: r.keyword,
        current_rank: r.current_rank ?? null,
        best_rank: r.best_rank ?? null,
        vol: r.total_searches != null ? String(r.total_searches) : "—",
        keyword_type: r.keyword_type,
        last_tracked_at: r.last_tracked_at ?? null,
      }));
    }
  } catch {
    rawKeywords = [];
  }

  if (rawKeywords.length === 0) {
    return NextResponse.json(
      {
        keywords: [],
        stats: [],
        hasData: false,
      },
      { headers: CORS }
    );
  }

  // Build keywords for UI
  const keywords = rawKeywords.map((r) => {
    const change = r.current_rank != null && r.best_rank != null
      ? r.best_rank - r.current_rank
      : 0;
    return {
      kw: r.keyword,
      pos: r.current_rank,
      vol: r.vol,
      change,
    };
  });

  // Aggregate stats
  const rankedKeywords = rawKeywords.filter((r) => r.current_rank != null);
  const avgPos = rankedKeywords.length > 0
    ? rankedKeywords.reduce((s, r) => s + (r.current_rank ?? 0), 0) / rankedKeywords.length
    : null;
  const kwPage1 = rawKeywords.filter((r) => r.current_rank != null && r.current_rank <= 10).length;
  const latestTracked = rawKeywords
    .map((r) => r.last_tracked_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const stats = [
    {
      label: "Avg. Posisi",
      value: avgPos != null ? avgPos.toFixed(1) : "—",
      sub: "Rata-rata posisi keyword",
      up: null,
    },
    {
      label: "Kata Kunci",
      value: String(rawKeywords.length),
      sub: "Total keyword aktif",
      up: null,
    },
    {
      label: "Keyword Hal.1",
      value: String(kwPage1),
      sub: "Keyword di halaman pertama",
      up: kwPage1 > 0 ? true : null,
    },
    {
      label: "Last Update",
      value: latestTracked ? fmtDD_MMM(latestTracked) : "—",
      sub: "Terakhir diperbarui",
      up: null,
    },
  ];

  return NextResponse.json(
    { keywords, stats, hasData: true },
    { headers: CORS }
  );
}
