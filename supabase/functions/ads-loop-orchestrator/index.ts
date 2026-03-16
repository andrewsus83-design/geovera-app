/**
 * ads-loop-orchestrator — Master Coordinator for Ads Management Loop
 *
 * Runs every 6H via Supabase cron. Determines which functions need to run
 * for each brand based on tier, last execution time, and pending actions.
 *
 * This is the ONLY function with a direct cron schedule.
 * All other ads functions are triggered by this orchestrator.
 *
 * Cron: every 6 hours
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getAdTierQuota,
  getLastSuccessfulRun,
  logAdLoop,
  updateAdLoopLog,
  isOlderThan,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface FunctionTrigger {
  name: string;
  reason: string;
}

async function triggerFunction(name: string, brandId: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ brand_id: brandId }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[orchestrator] Failed to trigger ${name} for ${brandId}:`, err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      brand_id?: string;
      force_run?: string[];
    };

    // 1. Fetch all brands with active ad platform keys
    let brandQuery = supabase
      .from("gv_ad_platform_keys")
      .select("brand_id")
      .eq("status", "active");
    if (body.brand_id) brandQuery = brandQuery.eq("brand_id", body.brand_id);

    const { data: keyRows } = await brandQuery;
    if (!keyRows?.length) {
      return jsonResponse({ ok: true, message: "No brands with active ad keys", brands_processed: 0 });
    }

    const brandIds = Array.from(new Set(keyRows.map((r: any) => r.brand_id)));
    const results: Array<{ brand_id: string; triggered: FunctionTrigger[]; skipped: string[] }> = [];

    // 2. Process each brand
    for (const brandId of brandIds) {
      const logId = await logAdLoop(supabase, {
        brand_id: brandId,
        function_name: "ads-loop-orchestrator",
        status: "running",
      });
      const startTime = Date.now();

      const triggered: FunctionTrigger[] = [];
      const skipped: string[] = [];

      try {
        // Get tier quota
        const quota = await getAdTierQuota(supabase, brandId);
        const tier = quota?.tier || "go";
        const isPro = tier === "pro" || tier === "enterprise";

        // Get last runs for all functions
        const [
          lastScrape,
          lastAnalyze,
          lastPick,
          lastBudget,
          lastMonitor,
          lastFix,
          lastML,
          lastResearch,
          lastStrategy,
        ] = await Promise.all([
          getLastSuccessfulRun(supabase, brandId, "ads-scrape-history"),
          getLastSuccessfulRun(supabase, brandId, "ads-analyze-history"),
          getLastSuccessfulRun(supabase, brandId, "ads-pick-content"),
          getLastSuccessfulRun(supabase, brandId, "ads-set-budget"),
          getLastSuccessfulRun(supabase, brandId, "ads-monitor"),
          getLastSuccessfulRun(supabase, brandId, "ads-find-fix"),
          getLastSuccessfulRun(supabase, brandId, "ads-ml-learner"),
          getLastSuccessfulRun(supabase, brandId, "ads-deep-research"),
          getLastSuccessfulRun(supabase, brandId, "ads-strategy-14d"),
        ]);

        const forceRun = body.force_run || [];

        // ── Decision Matrix ──────────────────────────────────────────────

        // 1. ads-scrape-history: daily (24h)
        if (forceRun.includes("ads-scrape-history") || isOlderThan(lastScrape, 24)) {
          triggered.push({ name: "ads-scrape-history", reason: "Daily scrape due" });
        } else {
          skipped.push("ads-scrape-history");
        }

        // 2. ads-analyze-history: daily, after scrape
        const scrapeRanToday = lastScrape && lastScrape.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
        if (forceRun.includes("ads-analyze-history") || (scrapeRanToday && isOlderThan(lastAnalyze, 24))) {
          triggered.push({ name: "ads-analyze-history", reason: "Daily analysis after scrape" });
        } else {
          skipped.push("ads-analyze-history");
        }

        // 3. ads-pick-content: every 72H
        if (forceRun.includes("ads-pick-content") || isOlderThan(lastPick, 72)) {
          triggered.push({ name: "ads-pick-content", reason: "72H content pick cycle" });
        } else {
          skipped.push("ads-pick-content");
        }

        // 4. ads-set-budget: every 72H, after picks
        const picksExist = await supabase
          .from("gv_ad_content_picks")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .in("status", ["candidate", "approved"]);

        if (forceRun.includes("ads-set-budget") || (isOlderThan(lastBudget, 72) && (picksExist.count || 0) > 0)) {
          triggered.push({ name: "ads-set-budget", reason: "Budget allocation due with pending picks" });
        } else {
          skipped.push("ads-set-budget");
        }

        // 5. ads-monitor: tier-based frequency
        const monitorHours = quota?.monitor_frequency_hours || 24;
        const hasActiveCampaigns = await supabase
          .from("gv_ad_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("status", "active");

        if (forceRun.includes("ads-monitor") || ((hasActiveCampaigns.count || 0) > 0 && isOlderThan(lastMonitor, monitorHours))) {
          triggered.push({ name: "ads-monitor", reason: `${monitorHours}H monitor cycle (${hasActiveCampaigns.count} active campaigns)` });
        } else {
          skipped.push("ads-monitor");
        }

        // 6. ads-find-fix: every 12H, pro/enterprise
        if (isPro) {
          const recentAlerts = await supabase
            .from("gv_ad_analysis")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId)
            .eq("analysis_type", "monitor")
            .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());

          if (forceRun.includes("ads-find-fix") || isOlderThan(lastFix, 12) || (recentAlerts.count || 0) > 0) {
            triggered.push({ name: "ads-find-fix", reason: "12H fix cycle or recent alerts" });
          } else {
            skipped.push("ads-find-fix");
          }
        } else {
          skipped.push("ads-find-fix (tier)");
        }

        // 7. ads-ml-learner: daily, pro/enterprise
        if (isPro) {
          if (forceRun.includes("ads-ml-learner") || isOlderThan(lastML, 24)) {
            triggered.push({ name: "ads-ml-learner", reason: "Daily ML learning cycle" });
          } else {
            skipped.push("ads-ml-learner");
          }
        } else {
          skipped.push("ads-ml-learner (tier)");
        }

        // 8. ads-deep-research: every 14D, pro/enterprise
        if (isPro) {
          if (forceRun.includes("ads-deep-research") || isOlderThan(lastResearch, 14 * 24)) {
            triggered.push({ name: "ads-deep-research", reason: "14D deep research cycle" });
          } else {
            skipped.push("ads-deep-research");
          }
        } else {
          skipped.push("ads-deep-research (tier)");
        }

        // 9. ads-strategy-14d: after deep research, pro/enterprise
        if (isPro) {
          const researchThisCycle = lastResearch && !isOlderThan(lastResearch, 14 * 24);
          const strategyThisCycle = lastStrategy && !isOlderThan(lastStrategy, 14 * 24);

          if (forceRun.includes("ads-strategy-14d") || (researchThisCycle && !strategyThisCycle)) {
            triggered.push({ name: "ads-strategy-14d", reason: "Strategy generation after deep research" });
          } else {
            skipped.push("ads-strategy-14d");
          }
        } else {
          skipped.push("ads-strategy-14d (tier)");
        }

        // 10. ads-execute: if approved budgets pending
        const pendingApprovals = await supabase
          .from("gv_ad_budgets")
          .select("id, campaign_allocations", { count: "exact" })
          .eq("brand_id", brandId)
          .eq("approved", true)
          .gte("period_end", new Date().toISOString().split("T")[0]);

        // Check if there are un-executed campaigns from approved budgets
        if (forceRun.includes("ads-execute") || (pendingApprovals.count || 0) > 0) {
          const hasUnexecutedPicks = await supabase
            .from("gv_ad_content_picks")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId)
            .eq("status", "approved");

          if ((hasUnexecutedPicks.count || 0) > 0 || forceRun.includes("ads-execute")) {
            triggered.push({ name: "ads-execute", reason: "Approved campaigns pending execution" });
          } else {
            skipped.push("ads-execute");
          }
        } else {
          skipped.push("ads-execute");
        }

        // ── Execute Triggers ─────────────────────────────────────────────

        // Sequential dependencies: scrape → analyze → ml-learner
        // Parallel: monitor, find-fix, pick-content
        // Sequential: pick → budget → execute
        // Sequential: deep-research → strategy-14d

        // Group 1: Data ingestion (sequential)
        const scrapeTriggered = triggered.find(t => t.name === "ads-scrape-history");
        const analyzeTriggered = triggered.find(t => t.name === "ads-analyze-history");

        if (scrapeTriggered) {
          await triggerFunction("ads-scrape-history", brandId);
          // Fire analyze sequentially after scrape completes (no setTimeout — unreliable in 150s edge limit)
          if (analyzeTriggered) {
            await triggerFunction("ads-analyze-history", brandId);
          }
        } else if (analyzeTriggered) {
          await triggerFunction("ads-analyze-history", brandId);
        }

        // Group 2: Monitoring (parallel, fire-and-forget)
        const monitorTriggered = triggered.find(t => t.name === "ads-monitor");
        if (monitorTriggered) {
          triggerFunction("ads-monitor", brandId); // No await - fire and forget
        }

        // Group 3: Content selection (sequential: pick → budget → execute)
        const pickTriggered = triggered.find(t => t.name === "ads-pick-content");
        const budgetTriggered = triggered.find(t => t.name === "ads-set-budget");
        const executeTriggered = triggered.find(t => t.name === "ads-execute");

        if (pickTriggered) {
          await triggerFunction("ads-pick-content", brandId);
          // Budget after pick completes (no setTimeout — unreliable in 150s edge limit)
          if (budgetTriggered) {
            await triggerFunction("ads-set-budget", brandId);
          }
        } else if (budgetTriggered) {
          await triggerFunction("ads-set-budget", brandId);
        }

        if (executeTriggered && !pickTriggered && !budgetTriggered) {
          triggerFunction("ads-execute", brandId);
        }

        // Group 4: Fix (fire-and-forget)
        const fixTriggered = triggered.find(t => t.name === "ads-find-fix");
        if (fixTriggered) {
          triggerFunction("ads-find-fix", brandId);
        }

        // Group 5: ML Learning (fire-and-forget)
        const mlTriggered = triggered.find(t => t.name === "ads-ml-learner");
        if (mlTriggered) {
          triggerFunction("ads-ml-learner", brandId);
        }

        // Group 6: Research & Strategy (sequential)
        const researchTriggered = triggered.find(t => t.name === "ads-deep-research");
        const strategyTriggered = triggered.find(t => t.name === "ads-strategy-14d");

        if (researchTriggered) {
          await triggerFunction("ads-deep-research", brandId);
          // Strategy is auto-triggered by deep-research function
        } else if (strategyTriggered) {
          triggerFunction("ads-strategy-14d", brandId);
        }

        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "success",
            output_summary: {
              triggered: triggered.map(t => t.name),
              skipped,
              tier,
            },
            duration_ms: Date.now() - startTime,
          });
        }

        results.push({ brand_id: brandId, triggered, skipped });
      } catch (err) {
        console.error(`[ads-loop-orchestrator] ${brandId}:`, err);
        if (logId) {
          await updateAdLoopLog(supabase, logId, {
            status: "error",
            error_message: (err as Error).message,
            duration_ms: Date.now() - startTime,
          });
        }
        results.push({ brand_id: brandId, triggered, skipped: [...skipped, `ERROR: ${(err as Error).message}`] });
      }
    }

    return jsonResponse({
      ok: true,
      brands_processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[ads-loop-orchestrator] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
