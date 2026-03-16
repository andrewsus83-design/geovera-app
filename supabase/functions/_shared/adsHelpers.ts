/**
 * adsHelpers.ts — Shared utilities for GeoVera Ads Management Loop
 *
 * Provides:
 * - Platform API wrappers (Meta, TikTok, Google Ads)
 * - Tier quota helpers
 * - Loop logging
 * - WhatsApp notifications for ad events
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdPlatformKey {
  id: string;
  brand_id: string;
  platform: "meta" | "tiktok" | "google";
  app_id: string | null;
  app_secret: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  ad_account_id: string;
  developer_token: string | null;
  extra: Record<string, unknown>;
  status: string;
  last_sync_at: string | null;
}

export interface AdTierQuota {
  tier: string;
  max_campaigns: number;
  max_daily_budget_usd: number;
  max_monthly_budget_usd: number;
  platforms_allowed: string[];
  auto_execute: boolean;
  monitor_frequency_hours: number;
  research_depth: string;
  picks_per_cycle: number;
}

export interface LoopLogEntry {
  brand_id: string;
  function_name: string;
  cycle_id?: string;
  status: "running" | "success" | "error" | "skipped";
  input_summary?: Record<string, unknown>;
  output_summary?: Record<string, unknown>;
  duration_ms?: number;
  cost_usd?: number;
  error_message?: string;
  completed_at?: string;
}

export interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  cpc: string;
  cpm: string;
  ctr: string;
  conversions?: string;
  purchase_roas?: Array<{ action_type: string; value: string }>;
}

export interface TikTokMetric {
  dimensions: { campaign_id: string };
  metrics: {
    impressions: string;
    clicks: string;
    spend: string;
    cpc: string;
    cpm: string;
    ctr: string;
    conversion: string;
  };
}

// ─── Platform API Wrappers ───────────────────────────────────────────────────

const META_API_BASE = "https://graph.facebook.com/v21.0";
const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const GOOGLE_ADS_BASE = "https://googleads.googleapis.com/v18";

/**
 * Call Meta Ads API (Facebook/Instagram)
 */
export async function callMetaAdsAPI(
  endpoint: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const url = new URL(`${META_API_BASE}${endpoint}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  const json = await res.json();

  if (!res.ok) {
    const errMsg = json?.error?.message || JSON.stringify(json);
    console.error(`[Meta Ads API] ${endpoint} error:`, errMsg);
    return { ok: false, data: null, error: errMsg };
  }
  return { ok: true, data: json.data ?? json };
}

/**
 * Call TikTok Ads API
 */
export async function callTikTokAdsAPI(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const res = await fetch(`${TIKTOK_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as { code: number; message: string; data: unknown };

  if (json.code !== 0) {
    console.error(`[TikTok Ads API] ${endpoint} error:`, json.message);
    return { ok: false, data: null, error: json.message };
  }
  return { ok: true, data: json.data };
}

/**
 * Call Google Ads API via searchStream (GAQL)
 */
export async function callGoogleAdsAPI(
  customerId: string,
  gaql: string,
  accessToken: string,
  developerToken: string
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const res = await fetch(
    `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: gaql }),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    const errMsg = json?.error?.message || JSON.stringify(json);
    console.error(`[Google Ads API] error:`, errMsg);
    return { ok: false, data: null, error: errMsg };
  }
  return { ok: true, data: json };
}

// ─── Database Helpers ────────────────────────────────────────────────────────

/**
 * Fetch ad platform keys for a brand (all platforms or specific)
 */
export async function getAdPlatformKeys(
  supabase: any,
  brandId: string,
  platform?: string
): Promise<AdPlatformKey[]> {
  let query = supabase
    .from("gv_ad_platform_keys")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "active");

  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) {
    console.error("[getAdPlatformKeys] error:", error.message);
    return [];
  }
  return (data as AdPlatformKey[]) || [];
}

/**
 * Get brand's tier and corresponding ad quota limits
 */
export async function getAdTierQuota(
  supabase: any,
  brandId: string
): Promise<AdTierQuota | null> {
  // Get brand tier
  const { data: brand } = await supabase
    .from("brands")
    .select("tier")
    .eq("id", brandId)
    .single();

  if (!brand?.tier) return null;

  // Map tier names to quota keys
  const tierMap: Record<string, string> = {
    growth: "go",
    go: "go",
    basic: "go",
    scale: "pro",
    pro: "pro",
    premium: "pro",
    enterprise: "enterprise",
  };
  const quotaTier = tierMap[brand.tier] || "go";

  const { data: quota } = await supabase
    .from("gv_ad_quotas")
    .select("*")
    .eq("tier", quotaTier)
    .single();

  return quota as AdTierQuota | null;
}

/**
 * Log an ads loop function execution
 */
export async function logAdLoop(
  supabase: any,
  entry: LoopLogEntry
): Promise<string | null> {
  const { data, error } = await supabase
    .from("gv_ad_loop_log")
    .insert({
      brand_id: entry.brand_id,
      function_name: entry.function_name,
      cycle_id: entry.cycle_id || null,
      status: entry.status,
      input_summary: entry.input_summary || {},
      output_summary: entry.output_summary || {},
      duration_ms: entry.duration_ms || null,
      cost_usd: entry.cost_usd || 0,
      error_message: entry.error_message || null,
      started_at: new Date().toISOString(),
      completed_at: entry.completed_at || null,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[logAdLoop] insert failed:", error.message);
    return null;
  }
  return data?.id || null;
}

/**
 * Update a loop log entry (mark as success/error)
 */
export async function updateAdLoopLog(
  supabase: any,
  logId: string,
  updates: Partial<LoopLogEntry>
): Promise<void> {
  await supabase
    .from("gv_ad_loop_log")
    .update({
      ...updates,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

/**
 * Get last successful run time for a function
 */
export async function getLastSuccessfulRun(
  supabase: any,
  brandId: string,
  functionName: string
): Promise<Date | null> {
  const { data } = await supabase
    .from("gv_ad_loop_log")
    .select("completed_at")
    .eq("brand_id", brandId)
    .eq("function_name", functionName)
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.completed_at ? new Date(data.completed_at) : null;
}

// ─── WhatsApp Notifications ──────────────────────────────────────────────────

const FONNTE_API = "https://api.fonnte.com/send";

/**
 * Send WhatsApp notification for ad events via Fonnte
 */
export async function sendAdWA(
  brandId: string,
  waNumber: string,
  message: string
): Promise<void> {
  const FONNTE_TOKEN = Deno.env.get("FONNTE_TOKEN");
  if (!FONNTE_TOKEN || !waNumber) return;

  try {
    await fetch(FONNTE_API, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: waNumber,
        message,
        countryCode: "62",
      }),
    });
  } catch (err) {
    console.warn("[sendAdWA] failed:", err);
  }
}

// ─── Cost Calculation ────────────────────────────────────────────────────────

/** Calculate Claude API cost in USD */
export function calcClaudeCost(
  inputTokens: number,
  outputTokens: number,
  model: "sonnet" | "opus" = "sonnet"
): number {
  if (model === "opus") {
    return (inputTokens * 15 + outputTokens * 75) / 1_000_000;
  }
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

/** Get yesterday's date in YYYY-MM-DD format */
export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/** Get today's date in YYYY-MM-DD format */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Check if a date is older than N hours ago */
export function isOlderThan(date: Date | null, hours: number): boolean {
  if (!date) return true;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return date.getTime() < cutoff;
}

// ─── CORS Headers ────────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, status = 500): Response {
  return jsonResponse({ error }, status);
}

// ─── Late API Helper ─────────────────────────────────────────────────────────

const LATE_API_BASE = "https://getlate.dev/api/v1";

/**
 * Fetch analytics for a Late API post
 */
export async function fetchLatePostAnalytics(
  latePostId: string
): Promise<{
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_retention: number;
  ctr: number;
} | null> {
  const LATE_API_KEY = Deno.env.get("LATE_API_KEY");
  if (!LATE_API_KEY) return null;

  try {
    const res = await fetch(`${LATE_API_BASE}/posts/${latePostId}/analytics`, {
      headers: {
        Authorization: `Bearer ${LATE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    return {
      reach: data.reach || 0,
      likes: data.likes || 0,
      comments: data.comments || 0,
      shares: data.shares || 0,
      saves: data.saves || 0,
      watch_retention: data.watchRetention || 0,
      ctr: data.ctr || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch published posts from Late API for a profile
 */
export async function fetchLatePublishedPosts(
  profileId: string,
  limit = 20
): Promise<Array<{ id: string; platform: string; postUrl: string; content: string }>> {
  const LATE_API_KEY = Deno.env.get("LATE_API_KEY");
  if (!LATE_API_KEY) return [];

  try {
    const res = await fetch(
      `${LATE_API_BASE}/posts?profileId=${profileId}&status=published&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${LATE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.posts || [];
  } catch {
    return [];
  }
}
