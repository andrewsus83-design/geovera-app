import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Refresh Scheduler

   Purpose: Biweekly loop that triggers brand-indexer-gemini for ALL brands
   that need a fresh research cycle.

   Trigger conditions (any of):
   1. research_completed_at IS NULL (never indexed)
   2. research_completed_at < now() - interval '14 days' (stale, needs refresh)
   3. research_status IN ('pending', 'failed') (never succeeded or failed)

   Processing:
   - Batch size: 10 brands per run (prevents memory issues + avoids rate limits)
   - Each brand triggers brand-indexer-gemini (fire-and-forget)
   - brand-indexer-gemini has its own skip logic (hash check) so double-invocations are safe
   - Returns { triggered: N, skipped: N, total_found: N }

   Invoke via:
   - Supabase cron (pg_cron): every 2 weeks — e.g. '0 2 1,15 * *'
   - Manual trigger: POST /brand-refresh-scheduler { "dry_run": true } to preview
   - With force: POST { "force_all": true } to skip hash check (re-indexes everyone)

   Loop learning guarantee:
   - Every brand gets biweekly research regardless of when they signed up
   - GeoVera engine improves with each cycle for all active brands
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 10;
const REFRESH_INTERVAL_DAYS = 14;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let dry_run = false;
  let force_all = false;
  let batch_size = BATCH_SIZE;

  if (req.method === "POST") {
    try {
      const body = await req.json() as { dry_run?: boolean; force_all?: boolean; batch_size?: number };
      dry_run = body.dry_run ?? false;
      force_all = body.force_all ?? false;
      batch_size = body.batch_size ?? BATCH_SIZE;
    } catch { /* no body = defaults */ }
  }

  console.log(`[brand-refresh-scheduler] Starting. dry_run=${dry_run} force_all=${force_all} batch_size=${batch_size}`);

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - REFRESH_INTERVAL_DAYS);
    const cutoffISO = cutoff.toISOString();

    // Find all brands needing refresh
    // Conditions: never indexed OR stale OR failed/pending
    let query = supabase
      .from("brand_profiles")
      .select("id, user_id, brand_name, country, research_status, research_completed_at, research_version")
      .order("research_completed_at", { ascending: true, nullsFirst: true }) // oldest first
      .limit(batch_size);

    if (!force_all) {
      // Standard: only brands that need work
      query = query.or(
        `research_completed_at.is.null,research_completed_at.lt.${cutoffISO},research_status.in.(pending,failed)`
      );
    }

    const { data: brands, error: fetchErr } = await query;

    if (fetchErr) {
      throw new Error(`Failed to fetch brands: ${fetchErr.message}`);
    }

    const total_found = brands?.length ?? 0;
    console.log(`[brand-refresh-scheduler] Found ${total_found} brands to process`);

    if (total_found === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No brands need refresh at this time",
          triggered: 0,
          total_found: 0,
          dry_run,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ brand_name: string; brand_profile_id: string; status: string }> = [];

    for (const brand of brands ?? []) {
      const logPrefix = `[brand-refresh-scheduler] ${brand.brand_name} (${brand.id.slice(0, 8)})`;
      const statusInfo = `status=${brand.research_status ?? "null"} v${brand.research_version ?? 1} last=${brand.research_completed_at?.slice(0, 10) ?? "never"}`;

      console.log(`${logPrefix} — ${statusInfo}`);

      if (dry_run) {
        results.push({ brand_name: brand.brand_name, brand_profile_id: brand.id, status: "would_trigger" });
        continue;
      }

      // Fire-and-forget: each brand gets its own indexer invocation
      // brand-indexer-gemini will skip if hash is still valid (already fresh this biweek)
      supabase.functions.invoke("brand-indexer-gemini", {
        body: {
          user_id: brand.user_id,
          brand_profile_id: brand.id,
        },
      }).then(() => {
        console.log(`${logPrefix} — invoked brand-indexer-gemini`);
      }).catch((e: Error) => {
        console.error(`${logPrefix} — invoke failed: ${e.message}`);
      });

      results.push({ brand_name: brand.brand_name, brand_profile_id: brand.id, status: "triggered" });
    }

    const triggered = results.filter((r) => r.status === "triggered" || r.status === "would_trigger").length;

    console.log(`[brand-refresh-scheduler] Done. triggered=${triggered}/${total_found}`);

    return new Response(
      JSON.stringify({
        success: true,
        triggered,
        total_found,
        dry_run,
        force_all,
        batch_size,
        brands: results,
        next_run_hint: dry_run ? "Remove dry_run to execute" : `Next batch will process up to ${batch_size} more brands`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-refresh-scheduler] ERROR: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
