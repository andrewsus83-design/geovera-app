import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

function fmtMonthYear(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

function fmtDate(dateStr: string): string {
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

  // 1. Brand info
  let brand: { id: string; created_at: string; updated_at?: string; onboarding_done: boolean; onboarding_step: number; name?: string } | null = null;
  try {
    const { data } = await sb
      .from("brands")
      .select("id, created_at, updated_at, onboarding_done, onboarding_step, name")
      .eq("id", brand_id)
      .single();
    brand = data;
  } catch {
    // ignore
  }

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404, headers: CORS });
  }

  // 2. Social connected count — try platform_connections, fallback social_connections
  let socialCount = 0;
  try {
    const { count, error } = await sb
      .from("platform_connections")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand_id);
    if (!error) {
      socialCount = count ?? 0;
    } else {
      // Try social_connections fallback
      const { count: c2, error: e2 } = await sb
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand_id);
      if (!e2) socialCount = c2 ?? 0;
    }
  } catch {
    socialCount = 0;
  }

  // 3. Image content count
  let imageCount = 0;
  try {
    const { count } = await sb
      .from("gv_image_generations")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand_id);
    imageCount = count ?? 0;
  } catch {
    imageCount = 0;
  }

  // 4. Video content count
  let videoCount = 0;
  try {
    const { count } = await sb
      .from("gv_video_generations")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand_id);
    videoCount = count ?? 0;
  } catch {
    videoCount = 0;
  }

  // 5. Tasks count
  let tasksCount = 0;
  try {
    const { count } = await sb
      .from("gv_tasks")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand_id);
    tasksCount = count ?? 0;
  } catch {
    tasksCount = 0;
  }

  const totalContent = imageCount + videoCount + tasksCount;

  // 6. Latest task cycle
  let taskCycle: { status: string } | null = null;
  try {
    const { data } = await sb
      .from("gv_task_cycles")
      .select("status")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    taskCycle = data;
  } catch {
    taskCycle = null;
  }

  // Build chronicle
  type ChronicleItem = {
    title: string;
    desc: string;
    date: string;
    status: "done" | "pending" | "upcoming";
  };

  const chronicle: ChronicleItem[] = [
    {
      title: "Brand Didaftarkan",
      desc: "Brand berhasil didaftarkan ke platform GeoVera.",
      date: fmtMonthYear(brand.created_at),
      status: "done",
    },
    {
      title: "Onboarding Selesai",
      desc: "Proses onboarding brand telah diselesaikan.",
      date: brand.onboarding_done
        ? fmtDate(brand.updated_at || brand.created_at)
        : "Segera",
      status: brand.onboarding_done ? "done" : "pending",
    },
    {
      title: "Social Media Terhubung",
      desc: "Akun social media telah dihubungkan ke platform.",
      date: socialCount > 0 ? "Terhubung" : "Segera",
      status:
        socialCount > 0
          ? "done"
          : brand.onboarding_done
          ? "pending"
          : "upcoming",
    },
    {
      title: "Konten Pertama Dibuat",
      desc: "Konten pertama berhasil dibuat menggunakan AI.",
      date: totalContent > 0 ? "Dibuat" : "Segera",
      status: totalContent > 0 ? "done" : "upcoming",
    },
    {
      title: "Task Cycle Aktif",
      desc: "Siklus task 14 hari telah diaktifkan.",
      date: taskCycle?.status === "active" ? "Aktif" : "Segera",
      status: taskCycle?.status === "active" ? "done" : "upcoming",
    },
  ];

  return NextResponse.json(
    {
      chronicle,
      brand: {
        name: brand.name ?? null,
        onboarding_done: brand.onboarding_done,
      },
    },
    { headers: CORS }
  );
}
