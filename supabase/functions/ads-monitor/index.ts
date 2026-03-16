/**
 * ads-monitor — Campaign Performance Monitor & Anomaly Detector
 *
 * Checks active campaigns for performance anomalies.
 * Triggers ads-find-fix on critical alerts. Sends WA notifications.
 *
 * Frequency: 6H (enterprise), 12H (pro), 24H (go) — controlled by orchestrator
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  callMetaAdsAPI,
  callTikTokAdsAPI,
  callGoogleAdsAPI,
  getAdPlatformKeys,
  logAdLoop,
  updateAdLoopLog,
  sendAdWA,
  yesterday,
  today,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Alert {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  alert_type: "ctr_drop" | "cpc_spike" | "budget_pacing" | "zero_impressions" | "frequency_fatigue";
  severity: "critical" | "high" | "medium" | "low";
  current_value: number;
  benchmark_value: number;
  deviation_pct: number;
  message: string;
}

async function get7DayAvg(brandId: string, platformEntityId: string): Promise<{
  avg_ctr: number; avg_cpc: number; avg_impressions: number; avg_spend: number;
} | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data } = await supabase
    .from("gv_ad_performance")
    .select("ctr, cpc_usd, impressions, spend_usd")
    .eq("brand_id", brandId)
    .eq("platform_entity_id", platformEntityId)
    .eq("entity_level", "campaign")
    .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0])
    .order("snapshot_date", { ascending: false })
    .limit(7);

  if (!data || data.length < 2) return null;

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    avg_ctr: avg(data.map((d: any) => Number(d.ctr || 0))),
    avg_cpc: avg(data.map((d: any) => Number(d.cpc_usd || 0))),
    avg_impressions: avg(data.map((d: any) => Number(d.impressions || 0))),
    avg_spend: avg(data.map((d: any) => Number(d.spend_usd || 0))),
  };
}

async function fetchTodayMetrics(
  key: { platform: string; access_token: string; ad_account_id: string; developer_token?: string | null },
  campaignPlatformId: string
): Promise<{ impressions: number; clicks: number; spend: number; ctr: number; cpc: number } | null> {
  const td = today();

  if (key.platform === "meta") {
    const res = await callMetaAdsAPI(`/${campaignPlatformId}/insights`, key.access_token, {
      fields: "impressions,clicks,spend,ctr,cpc",
      time_range: JSON.stringify({ since: td, until: td }),
    });
    if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return null;
    const d = res.data[0] as any;
    return {
      impressions: Number(d.impressions || 0),
      clicks: Number(d.clicks || 0),
      spend: Number(d.spend || 0),
      ctr: Number(d.ctr || 0),
      cpc: Number(d.cpc || 0),
    };
  }

  if (key.platform === "tiktok") {
    const res = await callTikTokAdsAPI("/report/integrated/get/", key.access_token, {
      advertiser_id: key.ad_account_id,
      report_type: "BASIC",
      dimensions: ["campaign_id"],
      metrics: ["impressions", "clicks", "spend", "cpc", "ctr"],
      data_level: "AUCTION_CAMPAIGN",
      start_date: td,
      end_date: td,
      filtering: [{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify([campaignPlatformId]) }],
    });
    if (!res.ok) return null;
    const rows = (res.data as any)?.list || [];
    const r = rows[0];
    if (!r) return null;
    return {
      impressions: Number(r.metrics?.impressions || 0),
      clicks: Number(r.metrics?.clicks || 0),
      spend: Number(r.metrics?.spend || 0),
      ctr: Number(r.metrics?.ctr || 0),
      cpc: Number(r.metrics?.cpc || 0),
    };
  }

  if (key.platform === "google" && key.developer_token) {
    const gaql = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc FROM campaign WHERE campaign.id = ${campaignPlatformId} AND segments.date = '${td}'`;
    const res = await callGoogleAdsAPI(key.ad_account_id, gaql, key.access_token, key.developer_token);
    if (!res.ok) return null;
    const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
    const r = results[0]?.results?.[0] || results[0];
    if (!r?.metrics) return null;
    return {
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      spend: Number(r.metrics.costMicros || 0) / 1_000_000,
      ctr: Number(r.metrics.ctr || 0),
      cpc: Number(r.metrics.averageCpc || 0) / 1_000_000,
    };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id?: string };

    // Get active campaigns
    let campQuery = supabase
      .from("gv_ad_campaigns")
      .select("id, brand_id, platform, platform_campaign_id, name, daily_budget_usd")
      .eq("status", "active");
    if (body.brand_id) campQuery = campQuery.eq("brand_id", body.brand_id);

    const { data: campaigns } = await campQuery;
    if (!campaigns?.length) {
      return jsonResponse({ ok: true, message: "No active campaigns", campaigns_monitored: 0 });
    }

    // Group by brand
    const brandCampaigns = new Map<string, typeof campaigns>();
    for (const c of campaigns) {
      const list = brandCampaigns.get(c.brand_id) || [];
      list.push(c);
      brandCampaigns.set(c.brand_id, list);
    }

    let totalAlerts = 0;
    const results: Array<{ brand_id: string; monitored: number; alerts: number }> = [];

    const tasks = Array.from(brandCampaigns.entries()).map(async ([brandId, camps]) => {
      const logId = await logAdLoop(supabase, {
        brand_id: brandId,
        function_name: "ads-monitor",
        status: "running",
      });
      const startTime = Date.now();
      const alerts: Alert[] = [];

      // Get platform keys for this brand
      const keys = await getAdPlatformKeys(supabase, brandId);
      const keyMap = new Map(keys.map(k => [k.platform, k]));

      for (const camp of camps) {
        const key = keyMap.get(camp.platform);
        if (!key || !camp.platform_campaign_id) continue;

        // Fetch today's metrics
        const todayMetrics = await fetchTodayMetrics(key, camp.platform_campaign_id);
        if (!todayMetrics) continue;

        // Get 7-day average
        const avg = await get7DayAvg(brandId, camp.platform_campaign_id);

        // Anomaly detection
        if (avg) {
          // CTR drop >30%
          if (avg.avg_ctr > 0 && todayMetrics.ctr > 0) {
            const deviation = ((todayMetrics.ctr - avg.avg_ctr) / avg.avg_ctr) * 100;
            if (deviation < -30) {
              alerts.push({
                campaign_id: camp.id,
                campaign_name: camp.name,
                platform: camp.platform,
                alert_type: "ctr_drop",
                severity: deviation < -50 ? "critical" : "high",
                current_value: todayMetrics.ctr,
                benchmark_value: avg.avg_ctr,
                deviation_pct: deviation,
                message: `CTR dropped ${Math.abs(deviation).toFixed(1)}% vs 7d avg (${todayMetrics.ctr.toFixed(2)}% vs ${avg.avg_ctr.toFixed(2)}%)`,
              });
            }
          }

          // CPC spike >50%
          if (avg.avg_cpc > 0 && todayMetrics.cpc > 0) {
            const deviation = ((todayMetrics.cpc - avg.avg_cpc) / avg.avg_cpc) * 100;
            if (deviation > 50) {
              alerts.push({
                campaign_id: camp.id,
                campaign_name: camp.name,
                platform: camp.platform,
                alert_type: "cpc_spike",
                severity: deviation > 100 ? "critical" : "high",
                current_value: todayMetrics.cpc,
                benchmark_value: avg.avg_cpc,
                deviation_pct: deviation,
                message: `CPC spiked ${deviation.toFixed(1)}% vs 7d avg ($${todayMetrics.cpc.toFixed(2)} vs $${avg.avg_cpc.toFixed(2)})`,
              });
            }
          }
        }

        // Budget pacing >90%
        if (camp.daily_budget_usd && camp.daily_budget_usd > 0) {
          const pacing = (todayMetrics.spend / camp.daily_budget_usd) * 100;
          const hour = new Date().getHours();
          if (pacing > 90 && hour < 18) {
            alerts.push({
              campaign_id: camp.id,
              campaign_name: camp.name,
              platform: camp.platform,
              alert_type: "budget_pacing",
              severity: "high",
              current_value: pacing,
              benchmark_value: 90,
              deviation_pct: pacing - 90,
              message: `Budget ${pacing.toFixed(0)}% spent before 6PM ($${todayMetrics.spend.toFixed(2)} of $${camp.daily_budget_usd})`,
            });
          }
        }

        // Zero impressions
        if (todayMetrics.impressions === 0) {
          alerts.push({
            campaign_id: camp.id,
            campaign_name: camp.name,
            platform: camp.platform,
            alert_type: "zero_impressions",
            severity: "critical",
            current_value: 0,
            benchmark_value: avg?.avg_impressions || 100,
            deviation_pct: -100,
            message: `Zero impressions today — campaign may be stuck or disapproved`,
          });
        }
      }

      // Store alerts
      if (alerts.length > 0) {
        await supabase.from("gv_ad_analysis").insert({
          brand_id: brandId,
          analysis_type: "monitor",
          summary: `${alerts.length} alerts detected across ${camps.length} campaigns`,
          findings: alerts,
          score: Math.max(0, 100 - alerts.length * 15),
          created_at: new Date().toISOString(),
        });

        // Trigger ads-find-fix for critical alerts
        const criticalAlerts = alerts.filter(a => a.severity === "critical");
        if (criticalAlerts.length > 0) {
          fetch(`${SUPABASE_URL}/functions/v1/ads-find-fix`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ brand_id: brandId }),
          }).catch(() => {});

          // WA alert
          const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
          if (brand?.wa_number) {
            const alertMsg = criticalAlerts.map(a => `⚠️ ${a.campaign_name}: ${a.message}`).join("\n");
            await sendAdWA(brandId, brand.wa_number, `🚨 *GeoVera Ads Alert*\n\n${alertMsg}\n\nTindakan otomatis sedang diproses...`);
          }
        }

        totalAlerts += alerts.length;
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: "success",
          output_summary: { campaigns_monitored: camps.length, alerts: alerts.length },
          duration_ms: Date.now() - startTime,
        });
      }

      results.push({ brand_id: brandId, monitored: camps.length, alerts: alerts.length });
    });

    await Promise.allSettled(tasks);

    return jsonResponse({
      ok: true,
      campaigns_monitored: campaigns.length,
      alerts_triggered: totalAlerts,
      results,
    });
  } catch (err) {
    console.error("[ads-monitor] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
