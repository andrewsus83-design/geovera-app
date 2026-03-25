import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtRelativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const targetStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (targetStart.getTime() === todayStart.getTime()) {
      return `Hari ini ${hhmm}`;
    } else if (targetStart.getTime() === tomorrowStart.getTime()) {
      return `Besok ${hhmm}`;
    } else {
      return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hhmm}`;
    }
  } catch {
    return "—";
  }
}

function isUrgent(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours <= 24 && diffHours >= 0;
  } catch {
    return false;
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
  const tab = searchParams.get("tab") ?? "publish"; // publish | approval

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(SB_URL, SB_KEY);

  type TaskRow = {
    id: string;
    title: string | null;
    platform: string | null;
    content_type: string | null;
    due_date: string | null;
    created_at: string;
    status: string | null;
  };

  let items: { id: string; title: string; platform?: string; type: string; time: string; status: string; urgent?: boolean }[] = [];

  if (tab === "approval") {
    try {
      const { data, error } = await sb
        .from("gv_tasks")
        .select("id, title, content_type, created_at, status")
        .eq("brand_id", brand_id)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        items = (data as TaskRow[]).map((r) => ({
          id: r.id,
          title: r.title ?? "(tanpa judul)",
          type: r.content_type ?? "task",
          time: fmtRelativeDate(r.created_at),
          status: r.status ?? "pending_approval",
        }));
      }
    } catch {
      items = [];
    }
  } else {
    // publish tab
    try {
      const { data, error } = await sb
        .from("gv_tasks")
        .select("id, title, platform, content_type, due_date, status, created_at")
        .eq("brand_id", brand_id)
        .in("status", ["scheduled", "draft", "pending"])
        .order("due_date", { ascending: true })
        .limit(20);

      if (!error && data) {
        items = (data as TaskRow[]).map((r) => ({
          id: r.id,
          title: r.title ?? "(tanpa judul)",
          platform: r.platform ?? undefined,
          type: r.content_type ?? "task",
          time: fmtRelativeDate(r.due_date ?? r.created_at),
          status: r.status ?? "draft",
          urgent: isUrgent(r.due_date),
        }));
      }
    } catch {
      items = [];
    }
  }

  return NextResponse.json(
    { items, count: items.length },
    { headers: CORS }
  );
}
