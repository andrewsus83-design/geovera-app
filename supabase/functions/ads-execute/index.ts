/**
 * ads-execute — Campaign Execution Engine
 *
 * Creates, updates, pauses, and resumes ad campaigns on Meta/TikTok/Google.
 * Triggered after budget approval or by ads-find-fix (enterprise auto).
 *
 * verify_jwt: false
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  callMetaAdsAPI,
  callTikTokAdsAPI,
  callGoogleAdsAPI,
  getAdPlatformKeys,
  getAdTierQuota,
  logAdLoop,
  updateAdLoopLog,
  sendAdWA,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/adsHelpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface ExecuteAction {
  type: "create" | "update" | "pause" | "resume";
  campaign_id?: string;
  pick_id?: string;
  budget_usd?: number;
  objective?: string;
  updates?: Record<string, unknown>;
}

interface ExecuteResult {
  action: string;
  platform: string;
  success: boolean;
  platform_campaign_id?: string;
  error?: string;
}

async function createMetaCampaign(
  key: { access_token: string; ad_account_id: string },
  params: { name: string; objective: string; daily_budget: number; status?: string }
): Promise<{ ok: boolean; campaign_id?: string; error?: string }> {
  const objectiveMap: Record<string, string> = {
    awareness: "OUTCOME_AWARENESS",
    traffic: "OUTCOME_TRAFFIC",
    engagement: "OUTCOME_ENGAGEMENT",
    conversions: "OUTCOME_SALES",
    lead_generation: "OUTCOME_LEADS",
  };

  const res = await callMetaAdsAPI(`/act_${key.ad_account_id}/campaigns`, key.access_token, {});

  // Meta requires POST with form data for creation
  const createRes = await fetch(`https://graph.facebook.com/v21.0/act_${key.ad_account_id}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: key.access_token,
      name: params.name,
      objective: objectiveMap[params.objective] || "OUTCOME_AWARENESS",
      status: params.status || "PAUSED",
      daily_budget: Math.round(params.daily_budget * 100), // Meta uses cents
      special_ad_categories: [],
    }),
  });

  const data = await createRes.json() as any;
  if (data.id) return { ok: true, campaign_id: data.id };
  return { ok: false, error: data.error?.message || "Creation failed" };
}

async function createTikTokCampaign(
  key: { access_token: string; ad_account_id: string },
  params: { name: string; objective: string; daily_budget: number }
): Promise<{ ok: boolean; campaign_id?: string; error?: string }> {
  const objectiveMap: Record<string, string> = {
    awareness: "REACH",
    traffic: "TRAFFIC",
    conversions: "CONVERSIONS",
    engagement: "VIDEO_VIEWS",
    app_installs: "APP_INSTALL",
  };

  const res = await callTikTokAdsAPI("/campaign/create/", key.access_token, {
    advertiser_id: key.ad_account_id,
    campaign_name: params.name,
    objective_type: objectiveMap[params.objective] || "REACH",
    budget_mode: "BUDGET_MODE_DAY",
    budget: params.daily_budget,
    operation_status: "DISABLE", // Start paused
  });

  if (res.ok) {
    const data = res.data as any;
    return { ok: true, campaign_id: data.campaign_id };
  }
  return { ok: false, error: res.error };
}

async function updateCampaignStatus(
  brandId: string,
  campaignId: string,
  newStatus: string
): Promise<ExecuteResult> {
  const { data: campaign } = await supabase
    .from("gv_ad_campaigns")
    .select("platform, platform_campaign_id")
    .eq("id", campaignId)
    .single();

  if (!campaign?.platform_campaign_id) {
    return { action: newStatus, platform: "unknown", success: false, error: "Campaign not found" };
  }

  const keys = await getAdPlatformKeys(supabase, brandId, campaign.platform);
  if (!keys.length) {
    return { action: newStatus, platform: campaign.platform, success: false, error: "No platform key" };
  }

  const key = keys[0];
  const platformStatus = newStatus === "active" ? "ACTIVE" : "PAUSED";

  if (campaign.platform === "meta") {
    const res = await fetch(`https://graph.facebook.com/v21.0/${campaign.platform_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: key.access_token, status: platformStatus }),
    });
    const ok = res.ok;
    if (ok) {
      await supabase.from("gv_ad_campaigns").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", campaignId);
    }
    return { action: newStatus, platform: "meta", success: ok, platform_campaign_id: campaign.platform_campaign_id };
  }

  if (campaign.platform === "tiktok") {
    const opStatus = newStatus === "active" ? "ENABLE" : "DISABLE";
    const res = await callTikTokAdsAPI("/campaign/status/update/", key.access_token, {
      advertiser_id: key.ad_account_id,
      campaign_ids: [campaign.platform_campaign_id],
      opt_status: opStatus,
    });
    if (res.ok) {
      await supabase.from("gv_ad_campaigns").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", campaignId);
    }
    return { action: newStatus, platform: "tiktok", success: res.ok, platform_campaign_id: campaign.platform_campaign_id };
  }

  return { action: newStatus, platform: campaign.platform, success: false, error: "Platform not supported for status update" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json() as { brand_id: string; actions: ExecuteAction[] };
    if (!body.brand_id || !body.actions?.length) {
      return errorResponse("brand_id and actions required", 400);
    }

    const { brand_id: brandId, actions } = body;

    // Validate tier
    const quota = await getAdTierQuota(supabase, brandId);
    if (!quota) return errorResponse("Brand tier not found", 404);

    // Count existing active campaigns
    const { count: activeCampaigns } = await supabase
      .from("gv_ad_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("status", "active");

    const logId = await logAdLoop(supabase, {
      brand_id: brandId,
      function_name: "ads-execute",
      status: "running",
    });
    const startTime = Date.now();
    const results: ExecuteResult[] = [];

    try {
      for (const action of actions) {
        if (action.type === "create") {
          // Check campaign limit
          const newCount = (activeCampaigns || 0) + results.filter(r => r.success && r.action === "create").length;
          if (newCount >= quota.max_campaigns) {
            results.push({ action: "create", platform: "unknown", success: false, error: `Campaign limit reached (${quota.max_campaigns})` });
            continue;
          }

          // Get pick details
          let pick: any = null;
          if (action.pick_id) {
            const { data } = await supabase.from("gv_ad_content_picks").select("*").eq("id", action.pick_id).single();
            pick = data;
          }

          const platform = pick?.platform || "meta";
          if (!quota.platforms_allowed.includes(platform)) {
            results.push({ action: "create", platform, success: false, error: `Platform ${platform} not allowed for tier ${quota.tier}` });
            continue;
          }

          const keys = await getAdPlatformKeys(supabase, brandId, platform);
          if (!keys.length) {
            results.push({ action: "create", platform, success: false, error: "No API key for platform" });
            continue;
          }

          const key = keys[0];
          const campaignName = `GV-${pick?.platform || "ad"}-${Date.now()}`;
          const budget = Math.min(action.budget_usd || pick?.recommended_budget_usd || 10, quota.max_daily_budget_usd);
          const objective = action.objective || pick?.recommended_objective || "awareness";

          let createResult: { ok: boolean; campaign_id?: string; error?: string };

          if (platform === "meta") {
            createResult = await createMetaCampaign(key, { name: campaignName, objective, daily_budget: budget });
          } else if (platform === "tiktok") {
            createResult = await createTikTokCampaign(key, { name: campaignName, objective, daily_budget: budget });
          } else {
            createResult = { ok: false, error: `Platform ${platform} campaign creation not yet supported` };
          }

          if (createResult.ok) {
            // Store campaign
            await supabase.from("gv_ad_campaigns").insert({
              brand_id: brandId,
              platform,
              platform_campaign_id: createResult.campaign_id,
              name: campaignName,
              objective,
              status: "paused", // Start paused for safety
              daily_budget_usd: budget,
              source_type: pick ? "organic_boost" : "new_creative",
              source_late_post_id: pick?.late_post_id || null,
              ai_recommended: true,
              ai_confidence: pick ? (pick.ad_potential_score / 100) : 0.5,
            });

            // Update pick status
            if (pick) {
              await supabase.from("gv_ad_content_picks").update({ status: "promoted" }).eq("id", action.pick_id);
            }
          }

          results.push({
            action: "create",
            platform,
            success: createResult.ok,
            platform_campaign_id: createResult.campaign_id,
            error: createResult.error,
          });
        }

        if (action.type === "pause" && action.campaign_id) {
          const result = await updateCampaignStatus(brandId, action.campaign_id, "paused");
          results.push(result);
        }

        if (action.type === "resume" && action.campaign_id) {
          const result = await updateCampaignStatus(brandId, action.campaign_id, "active");
          results.push(result);
        }
      }

      // WA notification
      const { data: brand } = await supabase.from("brands").select("wa_number, name").eq("id", brandId).single();
      if (brand?.wa_number) {
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        const summary = results.map(r => `${r.success ? "✅" : "❌"} ${r.action} (${r.platform})${r.error ? `: ${r.error}` : ""}`).join("\n");

        await sendAdWA(brandId, brand.wa_number,
          `🚀 *GeoVera Ads — Execution Report*\n\n✅ Success: ${successCount}\n❌ Failed: ${failCount}\n\n${summary}`
        );
      }

      if (logId) {
        await updateAdLoopLog(supabase, logId, {
          status: results.some(r => !r.success) ? "error" : "success",
          output_summary: { executed: results.length, success: results.filter(r => r.success).length },
          duration_ms: Date.now() - startTime,
        });
      }

      return jsonResponse({ ok: true, results });
    } catch (err) {
      console.error(`[ads-execute] ${brandId}:`, err);
      if (logId) {
        await updateAdLoopLog(supabase, logId, { status: "error", error_message: (err as Error).message, duration_ms: Date.now() - startTime });
      }
      return errorResponse((err as Error).message);
    }
  } catch (err) {
    console.error("[ads-execute] Unexpected error:", err);
    return errorResponse("server_error");
  }
});
