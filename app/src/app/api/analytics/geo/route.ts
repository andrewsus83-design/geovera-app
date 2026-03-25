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

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(SB_URL, SB_KEY);

  type GeoRow = {
    location: string;
    current_score: number | null;
    previous_score: number | null;
    total_reviews: number | null;
    average_rating: number | null;
    map_rank: number | null;
    search_visibility: number | null;
  };

  let rows: GeoRow[] = [];
  try {
    const { data, error } = await sb
      .from("gv_geo_scores")
      .select("location, current_score, previous_score, total_reviews, average_rating, map_rank, search_visibility")
      .eq("brand_id", brand_id)
      .order("current_score", { ascending: false })
      .limit(10);

    if (!error && data) {
      rows = data as GeoRow[];
    }
  } catch {
    rows = [];
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { locations: [], stats: [], hasData: false },
      { headers: CORS }
    );
  }

  const locations = rows.map((r) => ({
    city: r.location,
    score: r.current_score ?? 0,
    reviews: r.total_reviews ?? 0,
    citations: r.search_visibility ?? 0,
    mapRank: r.map_rank ?? null,
  }));

  // Aggregate stats
  const scores = rows.filter((r) => r.current_score != null).map((r) => r.current_score as number);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const totalReviews = rows.reduce((s, r) => s + (r.total_reviews ?? 0), 0);

  const ratings = rows.filter((r) => r.average_rating != null).map((r) => r.average_rating as number);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const stats = [
    {
      label: "Avg. Local Score",
      value: avgScore != null ? avgScore.toFixed(1) : "—",
      sub: "Rata-rata skor lokal",
      up: null,
    },
    {
      label: "Total Review",
      value: String(totalReviews),
      sub: "Total ulasan",
      up: totalReviews > 0 ? true : null,
    },
    {
      label: "Avg Rating",
      value: avgRating != null ? avgRating.toFixed(1) : "—",
      sub: "Rata-rata rating",
      up: avgRating != null && avgRating >= 4 ? true : null,
    },
    {
      label: "Kota Aktif",
      value: String(rows.length),
      sub: "Lokasi aktif",
      up: null,
    },
  ];

  return NextResponse.json(
    { locations, stats, hasData: true },
    { headers: CORS }
  );
}
