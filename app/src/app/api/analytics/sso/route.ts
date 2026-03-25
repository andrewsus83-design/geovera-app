import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PLATFORM_NAMES: Record<string, string> = {
  perplexity: "Perplexity AI",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  google_sge: "Google SGE",
  you_com: "You.com",
};

const PLATFORM_ICONS: Record<string, string> = {
  perplexity: "P",
  chatgpt: "G",
  gemini: "Gm",
  google_sge: "Gs",
  you_com: "Y",
};

const ALL_PLATFORMS = ["perplexity", "chatgpt", "gemini", "google_sge", "you_com"];

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

  // 1. SSO/social keywords
  type KwRow = { keyword: string; current_rank: number | null; total_searches: number | null; keyword_type: string };
  let keywords: KwRow[] = [];
  try {
    const { data, error } = await sb
      .from("gv_keywords")
      .select("keyword, current_rank, total_searches, keyword_type")
      .eq("brand_id", brand_id)
      .in("keyword_type", ["social", "sso", "ai"])
      .order("priority", { ascending: false })
      .limit(10);
    if (!error && data) keywords = data as KwRow[];
  } catch {
    keywords = [];
  }

  // 2. Search results
  type SearchRow = {
    platform: string;
    brand_appeared: boolean | null;
    brand_rank: number | null;
    search_date: string;
    query?: string | null;
  };
  let searchResults: SearchRow[] = [];
  try {
    const { data, error } = await sb
      .from("gv_search_results")
      .select("platform, brand_appeared, brand_rank, search_date, query")
      .eq("brand_id", brand_id)
      .in("platform", ALL_PLATFORMS)
      .order("search_date", { ascending: false });
    if (!error && data) searchResults = data as SearchRow[];
  } catch {
    searchResults = [];
  }

  if (searchResults.length === 0 && keywords.length === 0) {
    return NextResponse.json(
      { engines: [], topics: [], stats: [], hasData: false },
      { headers: CORS }
    );
  }

  // Build engines from search results grouped by platform
  const platformMap: Record<
    string,
    { appeared: number; total: number; ranks: number[]; mentions: number }
  > = {};

  for (const row of searchResults) {
    if (!platformMap[row.platform]) {
      platformMap[row.platform] = { appeared: 0, total: 0, ranks: [], mentions: 0 };
    }
    platformMap[row.platform].total += 1;
    if (row.brand_appeared) {
      platformMap[row.platform].appeared += 1;
      platformMap[row.platform].mentions += 1;
    }
    if (row.brand_rank != null) {
      platformMap[row.platform].ranks.push(row.brand_rank);
    }
  }

  const engines = ALL_PLATFORMS.map((p) => {
    const entry = platformMap[p];
    const visible = entry ? entry.appeared > 0 : false;
    const ranks = entry?.ranks ?? [];
    const avgRank = ranks.length > 0
      ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)
      : null;
    return {
      name: PLATFORM_NAMES[p] ?? p,
      platform: p,
      visible,
      rank: avgRank,
      mentions: entry?.mentions ?? 0,
      icon: PLATFORM_ICONS[p] ?? p[0].toUpperCase(),
    };
  });

  // Build topics from keywords
  const topics = keywords.map((k) => ({
    q: k.keyword,
    found: k.current_rank != null && k.current_rank <= 10,
  }));

  // Stats
  const totalVisible = engines.filter((e) => e.visible).length;
  const totalMentions = engines.reduce((s, e) => s + e.mentions, 0);
  const visibilityPct = Math.round((totalVisible / ALL_PLATFORMS.length) * 100);

  const stats = [
    {
      label: "AI Visibility",
      value: `${visibilityPct}%`,
      sub: `${totalVisible}/${ALL_PLATFORMS.length} mesin AI`,
      up: totalVisible > 0 ? true : null,
    },
    {
      label: "Total Mentions",
      value: String(totalMentions),
      sub: "Disebutkan di AI",
      up: totalMentions > 0 ? true : null,
    },
    {
      label: "Keywords SSO",
      value: String(keywords.length),
      sub: "Kata kunci dipantau",
      up: null,
    },
    {
      label: "Topics Found",
      value: String(topics.filter((t) => t.found).length),
      sub: "Topik terindeks",
      up: null,
    },
  ];

  return NextResponse.json(
    { engines, topics, stats, hasData: true },
    { headers: CORS }
  );
}
