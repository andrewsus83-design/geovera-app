import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vozjwptzutolvkvfpknk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

// GET /api/tasks/list?brand_id=...&date=YYYY-MM-DD&status=...
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });

  const { searchParams } = new URL(request.url);
  const brand_id = searchParams.get("brand_id");
  const date = searchParams.get("date");
  const status = searchParams.get("status");

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id required" }, { status: 400, headers: cors });
  }

  const { data: brandCheck } = await adminClient.from("brand_profiles").select("id").eq("id", brand_id).eq("user_id", user.id).maybeSingle();
  if (!brandCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });

  const sb = adminClient;

  // Get the active task cycle for this brand
  const { data: cycle } = await sb
    .from("gv_task_cycles")
    .select("id, status, tier, tasks_generated, expires_at, started_at")
    .eq("brand_id", brand_id)
    .not("status", "in", '("expired","failed")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Query tasks
  let query = sb
    .from("gv_tasks")
    .select("id, title, description, priority, status, platform, content_type, due_date, cycle_id, publish_status, published_at, category, pillar, tags, hashtags, ai_estimated_time, ai_suggested_action")
    .eq("brand_id", brand_id)
    .order("priority_score", { ascending: false })
    .limit(200);

  if (cycle) {
    query = query.eq("cycle_id", cycle.id);
  }

  if (date) {
    query = query.eq("due_date", date);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data: tasks, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors });
  }

  return NextResponse.json(
    {
      success: true,
      cycle: cycle ?? null,
      tasks: tasks ?? [],
      total: tasks?.length ?? 0,
    },
    { status: 200, headers: cors }
  );
}
