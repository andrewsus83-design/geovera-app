/**
 * ads-scrape-history — Daily Ad Campaign Data Scraper
 *
 * Pulls campaign data + daily metrics from Meta/TikTok/Google Ads APIs.
 * Stores campaigns in gv_ad_campaigns, daily snapshots in gv_ad_performance.
 *
 * Cron: Triggered by ads-loop-orchestrator (daily)
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
  yesterday,
  today,
  corsHeaders,
  jsonResponse,
  errorResponse,
  type AdPlatformKey,
} from "../_shared/adsHelpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Platform-specific scrapers ──────────────────────────────────────────────

async function scrapeMetaAds(key: AdPlatformKey): Promise<{ campaigns: number; snapshots: number }> {
  const actId = key.ad_account_id;
  let campaigns = 0;
  let snapshots = 0;

  // 1. Fetch campaigns
  const campRes = await callMetaAdsAPI(
    `/act_${actId}/campaigns`,
    key.access_token,
    { fields: "id,name,status,objective,daily_budget,lifetime_budget", limit: "100" }
  );

  if (!campRes.ok || !Array.isArray(campRes.data)) return { campaigns: 0, snapshots: 0 };

  for (const c of campRes.data as Array<Record<string, any>>) {
    const statusMap: Record<string, string> = { ACTIVE: "active", PAUSED: "paused", DELETED: "completed", ARCHIVED: "completed" };
    await supabase.from("gv_ad_campaigns").upsert({
      brand_id: key.brand_id,
      platform: "meta",
      platform_campaign_id: c.id,
      name: c.name,
      objective: c.objective || null,
      status: statusMap[c.status] || "draft",
      daily_budget_usd: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      total_budget_usd: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id,platform,platform_campaign_id", ignoreDuplicates: false });
    campaigns++;
  }

  // 2. Fetch insights (yesterday)
  const yd = yesterday();
  const insightRes = await callMetaAdsAPI(
    `/act_${actId}/insights`,
    key.access_token,
    {
      fields: "campaign_id,campaign_name,impressions,reach,clicks,spend,cpc,cpm,ctr,conversions,purchase_roas",
      time_range: JSON.stringify({ since: yd, until: yd }),
      level: "campaign",
      limit: "100",
    }
  );

  if (insightRes.ok && Array.isArray(insightRes.data)) {
    for (const i of insightRes.data as Array<Record<string, any>>) {
      const roas = Array.isArray(i.purchase_roas) && i.purchase_roas[0]
        ? Number(i.purchase_roas[0].value)
        : null;

      await supabase.from("gv_ad_performance").upsert({
        brand_id: key.brand_id,
        platform: "meta",
        platform_entity_id: i.campaign_id,
        entity_level: "campaign",
        snapshot_date: yd,
        impressions: Number(i.impressions || 0),
        reach: Number(i.reach || 0),
        clicks: Number(i.clicks || 0),
        spend_usd: Number(i.spend || 0),
        cpc_usd: i.cpc ? Number(i.cpc) : null,
        cpm_usd: i.cpm ? Number(i.cpm) : null,
        ctr: i.ctr ? Number(i.ctr) : null,
        conversions: Number(i.conversions || 0),
        roas,
        scraped_at: new Date().toISOString(),
      }, { onConflict: "brand_id,platform_entity_id,entity_level,snapshot_date" });
      snapshots++;
    }
  }

  return { campaigns, snapshots };
}

async function scrapeTikTokAds(key: AdPlatformKey): Promise<{ campaigns: number; snapshots: number }> {
  let campaigns = 0;
  let snapshots = 0;

  // 1. Fetch campaigns
  const campRes = await callTikTokAdsAPI("/campaign/get/", key.access_token, {
    advertiser_id: key.ad_account_id,
    page_size: 100,
  });

  if (!campRes.ok) return { campaigns: 0, snapshots: 0 };
  const campList = (campRes.data as any)?.list || [];

  for (const c of campList) {
    const statusMap: Record<string, string> = {
      CAMPAIGN_STATUS_ENABLE: "active",
      CAMPAIGN_STATUS_DISABLE: "paused",
      CAMPAIGN_STATUS_DELETE: "completed",
    };
    await supabase.from("gv_ad_campaigns").upsert({
      brand_id: key.brand_id,
      platform: "tiktok",
      platform_campaign_id: c.campaign_id,
      name: c.campaign_name,
      objective: c.objective_type || null,
      status: statusMap[c.operation_status] || "draft",
      daily_budget_usd: c.budget ? Number(c.budget) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id,platform,platform_campaign_id", ignoreDuplicates: false });
    campaigns++;
  }

  // 2. Fetch report
  const yd = yesterday();
  const reportRes = await callTikTokAdsAPI("/report/integrated/get/", key.access_token, {
    advertiser_id: key.ad_account_id,
    report_type: "BASIC",
    dimensions: ["campaign_id"],
    metrics: ["impressions", "clicks", "spend", "cpc", "cpm", "ctr", "conversion", "total_complete_payment_rate"],
    data_level: "AUCTION_CAMPAIGN",
    start_date: yd,
    end_date: yd,
  });

  if (reportRes.ok) {
    const rows = (reportRes.data as any)?.list || [];
    for (const r of rows) {
      await supabase.from("gv_ad_performance").upsert({
        brand_id: key.brand_id,
        platform: "tiktok",
        platform_entity_id: r.dimensions?.campaign_id,
        entity_level: "campaign",
        snapshot_date: yd,
        impressions: Number(r.metrics?.impressions || 0),
        clicks: Number(r.metrics?.clicks || 0),
        spend_usd: Number(r.metrics?.spend || 0),
        cpc_usd: r.metrics?.cpc ? Number(r.metrics.cpc) : null,
        cpm_usd: r.metrics?.cpm ? Number(r.metrics.cpm) : null,
        ctr: r.metrics?.ctr ? Number(r.metrics.ctr) : null,
        conversions: Number(r.metrics?.conversion || 0),
        roas: r.metrics?.total_complete_payment_rate ? Number(r.metrics.total_complete_payment_rate) : null,
        scraped_at: new Date().toISOString(),
      }, { onConflict: "brand_id,platform_entity_id,entity_level,snapshot_date" });
      snapshots++;
    }
  }

  return { campaigns, snapshots };
}

async function scrapeGoogleAds(key: AdPlatformKey): Promise<{ campaigns: number; snapshots: number }> {
  let campaigns = 0;
  let snapshots = 0;

  if (!key.developer_token) return { campaigns: 0, snapshots: 0 };

  const yd = yesterday();
  const gaql = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc, metrics.conversions_value FROM campaign WHERE segments.date = '${yd}' AND campaign.status != 'REMOVED'`;

  const res = await callGoogleAdsAPI(key.ad_account_id, gaql, key.access_token, key.developer_token);
  if (!res.ok) return { campaigns: 0, snapshots: 0 };

  const results = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
  for (const batch of results) {
    const rows = batch?.results || [batch];
    for (const r of rows) {
      if (!r?.campaign) continue;
      const statusMap: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "completed" };

      await supabase.from("gv_ad_campaigns").upsert({
        brand_id: key.brand_id,
        platform: "google",
        platform_campaign_id: String(r.campaign.id),
        name: r.campaign.name,
        objective: r.campaign.advertisingChannelType || null,
        status: statusMap[r.campaign.status] || "draft",
        updated_at: new Date().toISOString(),
      }, { onConflict: "brand_id,platform,platform_campaign_id", ignoreDuplicates: false });
      campaigns++;

      if (r.metrics) {
        const spendUsd = Number(r.metrics.costMicros || 0) / 1_000_000;
        const convValue = Number(r.metrics.conversionsValue || 0);
        await supabase.from("gv_ad_performance").upsert({
          brand_id: key.brand_id,
          platform: "google",
          platform_entity_id: String(r.campaign.id),
          entity_level: "campaign",
          snapshot_date: yd,
          impressions: Number(r.metrics.impressions || 0),
          clicks: Number(r.metrics.clicks || 0),
          spend_usd: spendUsd,
          cpc_usd: r.metrics.averageCpc ? Number(r.metrics.averageCpc) / 1_000_000 : null,
          ctr: r.metrics.ctr ? Number(r.metrics.ctr) : null,
          conversions: Number(r.metrics.conversions || 0),
          conversion_value_usd: convValue,
          roas: spendUsd > 0 ? convValue / spendUsd : null,
          scraped_at: new Date().toISOString(),
        }, { onConflict: "brand_id,platform_entity_id,entity_level,snapshot_date" });
        snapshots++;
      }
    }
  }

  return { campaigns, snapshots };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({})) as { brand_id?: string };

    // Get all brands with active ad platform keys
    let query = supabase
      .from("gv_ad_platform_keys")
      .select("*")
      .eq("status", "active");
    if (body.brand_id) query = query.eq("brand_id", body.brand_id);

    const { data: keys, error: keysErr } = await query;
    if (keysErr || !keys?.length) {
      return jsonResponse({ ok: true, message: "No active ad platform keys found", brands_processed: 0 });
    }

    // Group keys by brand
    const brandKeys = new Map<string, AdPlatformKey[]>();
    for (const k of keys as AdPlatformKey[]) {
      const list = brandKeys.get(k.brand_id) || [];
      list.push(k);
      brandKeys.set(k.brand_id, list);
    }

    const results: Array<{ brand_id: string; campaigns: number; snapshots: number; errors: string[] }> = [];

    // Process each brand
    const tasks = Array.from(brandKeys.entries()).map(async ([brandId, platformKeys]) => {
      const logId = await logAdLoop(supabase, {
        brand_id: brandId,
        function_name: "ads-scrape-history",
        status: "running",
      });

      let totalCampaigns = 0;
      let totalSnapshots = 0;
      const errors: string[] = [];
      const startTime = Date.now();

      for (const key of platformKeys) {
        try {
          let result = { campaigns: 0, snapshots: 0 };

          if (key.platform === "meta") result = await scrapeMetaAds(key);
          else if (key.platform === "tiktok") result = await scrapeTikTokAds(key);
          else if (key.platform === "google") result = await scrapeGoogleAds(key);

          totalCampaigns += result.campaigns;
          totalSnapshots += result.snapshots;

          // Update last_sync_at
          await supabase
            .from("gv_ad_platform_keys")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("id", key.id);
        } catch (err) {
          const msg = `${key.platform}: ${(err as Error).message}`;
          errors.push(msg);
          console.error(`[ads-scrape-history] ${brandId}/${key.platform}:`, err);
        }
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: errors.length > 0 ? "error" : "success",
          output_summary: { campaigns: totalCampaigns, snapshots: totalSnapshots, errors },
          duration_ms: Date.now() - startTime,
        });
      }

      results.push({ brand_id: brandId, campaigns: totalCampaigns, snapshots: totalSnapshots, errors });
    });

    await Promise.allSettled(tasks);

    return jsonResponse({
      ok: true,
      brands_processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[ads-scrape-history] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
