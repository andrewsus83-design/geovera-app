import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * social-auto-reply  v3
 *
 * Group 1 (attention)  = complex comments needing human moderation
 * Group 2 (auto_reply) = simple safe comments — AI auto-replies within rate limits
 *
 * Key features:
 * - 300-comment sampling cap per sync
 * - SHA-256 smart dedup (comment level)
 * - Commenter profile delta cache (gv_commenter_profiles) — TTL per tier
 * - High-score commenters prioritized via weight column (DESC)
 * - Plan-quota rate limiting (auto_reply_per_5min from plan_quotas)
 * - Historical stats via get_stats action
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://geovera.xyz",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LATE_API_BASE = "https://getlate.dev/api/v1";
const LATE_API_KEY  = Deno.env.get("LATE_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const COMMENT_SAMPLE_LIMIT = 300;

// Cache TTL per tier (days)
const TIER_TTL_DAYS: Record<string, number> = {
  vip: 7, high: 14, medium: 21, low: 30, bot: 30,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LateComment {
  id: string;
  postId: string;
  accountId: string;
  platform: string;
  text: string;
  author: {
    id: string;
    username: string;
    followerCount?: number;
    isVerified?: boolean;
  };
  timestamp: string;
  likes?: number;
}

interface ProfileResult { score: number; tier: string }

interface ClassifyResult {
  group: "auto_reply" | "attention";
  classification?: string;
  sentiment?: string;
  urgency?: string;
  ai_reply_draft?: string;
  ai_suggestion?: string;
  profile_score: number;
  profile_tier: string;
  weight: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lateHeaders() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${LATE_API_KEY}` };
}
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function jsonErr(body: unknown, status = 500): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function smartHash(commentId: string, text: string): Promise<string> {
  const raw = `${commentId}::${text.trim().toLowerCase()}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function scoreProfile(author: LateComment["author"]): ProfileResult {
  let score = 30;
  const followers = author.followerCount ?? 0;
  if (author.isVerified) score += 30;
  if (followers >= 100_000) score += 30;
  else if (followers >= 10_000) score += 20;
  else if (followers >= 1_000) score += 10;
  else if (followers < 10) score -= 10;
  score = Math.max(0, Math.min(100, score));
  let tier = "medium";
  if (score >= 90) tier = "vip";
  else if (score >= 70) tier = "high";
  else if (score <= 20) tier = "bot";
  else if (score <= 35) tier = "low";
  return { score, tier };
}

function tierExpiresAt(tier: string): string {
  const days = TIER_TTL_DAYS[tier] ?? 21;
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString();
}

/** Batch-resolve commenter profiles with delta cache.
 *  Returns a map: `${platform}::${commenterId}` → ProfileResult
 */
async function resolveProfiles(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  comments: LateComment[]
): Promise<Map<string, ProfileResult>> {
  const profileMap = new Map<string, ProfileResult>();
  const now = new Date().toISOString();

  // Build unique commenter keys
  const uniqueCommenters = new Map<string, LateComment["author"] & { platform: string }>();
  for (const c of comments) {
    const key = `${c.platform}::${c.author.id}`;
    if (!uniqueCommenters.has(key)) uniqueCommenters.set(key, { ...c.author, platform: c.platform });
  }

  // Fetch cached profiles that haven't expired
  const commenterIds = [...uniqueCommenters.values()].map(a => a.id);
  const platforms    = [...new Set([...uniqueCommenters.values()].map(a => a.platform))];

  const { data: cached } = await supabase
    .from("gv_commenter_profiles")
    .select("commenter_id, platform, profile_score, profile_tier, expires_at")
    .eq("brand_id", brandId)
    .in("commenter_id", commenterIds)
    .in("platform", platforms)
    .gt("expires_at", now);

  // Map cached results
  const cachedKeys = new Set<string>();
  for (const row of cached ?? []) {
    const key = `${row.platform}::${row.commenter_id}`;
    profileMap.set(key, { score: row.profile_score, tier: row.profile_tier });
    cachedKeys.add(key);
  }

  // Score & cache commenters not in cache (or expired)
  const toUpsert: Record<string, unknown>[] = [];
  for (const [key, author] of uniqueCommenters) {
    if (cachedKeys.has(key)) continue;
    const { score, tier } = scoreProfile(author);
    profileMap.set(key, { score, tier });
    toUpsert.push({
      brand_id: brandId,
      commenter_id: author.id,
      commenter_username: author.username,
      platform: author.platform,
      follower_count: author.followerCount ?? 0,
      is_verified: author.isVerified ?? false,
      profile_score: score,
      profile_tier: tier,
      cached_at: now,
      expires_at: tierExpiresAt(tier),
      updated_at: now,
    });
  }

  if (toUpsert.length > 0) {
    await supabase
      .from("gv_commenter_profiles")
      .upsert(toUpsert, { onConflict: "brand_id,platform,commenter_id" });
  }

  return profileMap;
}

/** Get user's plan cooldown from plan_quotas */
async function getPlanCooldown(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ cooldownSeconds: number; repliesPerHour: number }> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id, plans(slug)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planSlug = (sub?.plans as Record<string, unknown>)?.slug as string ?? "basic";
  const planName = planSlug === "premium" ? "pro" : planSlug;

  const { data: quota } = await supabase
    .from("plan_quotas")
    .select("auto_reply_per_5min")
    .eq("plan_name", planName)
    .maybeSingle();

  const repliesPer5Min = quota?.auto_reply_per_5min ?? 1;
  return {
    cooldownSeconds: Math.floor(300 / Math.max(1, repliesPer5Min)),
    repliesPerHour: repliesPer5Min * 12,
  };
}

// ── Classify with Claude Haiku ─────────────────────────────────────────────────

async function classifyComments(
  brandName: string,
  brandVoice: string,
  comments: LateComment[],
  profileMap: Map<string, ProfileResult>
): Promise<Map<string, ClassifyResult>> {
  const results = new Map<string, ClassifyResult>();
  const BATCH = 20;

  for (let i = 0; i < comments.length; i += BATCH) {
    const batch = comments.slice(i, i + BATCH);

    const commentList = batch.map((c, idx) => {
      const key = `${c.platform}::${c.author.id}`;
      const prof = profileMap.get(key) ?? scoreProfile(c.author);
      return `${idx + 1}. [id:${c.id}] "${c.text.slice(0, 200)}" — @${c.author.username} (score:${prof.score}, tier:${prof.tier}${c.author.isVerified ? ", ✓verified" : ""})`;
    }).join("\n");

    const prompt = `You are a social media manager for ${brandName}.
Brand voice: ${brandVoice}

Classify each comment. Return ONLY valid JSON array (no markdown fences).

Comments:
${commentList}

For each comment return:
{
  "id": "<comment id>",
  "group": "auto_reply" | "attention",
  "classification": "purchase_intent"|"complaint"|"question"|"influencer"|"vip"|"spam"|"neutral",
  "sentiment": "positive"|"neutral"|"negative",
  "urgency": "urgent"|"normal"|"low",
  "ai_reply_draft": "<max 80 chars warm reply if group=auto_reply, else null>",
  "ai_suggestion": "<brief strategy if group=attention, else null>"
}

RULES:
- group="auto_reply" (Group 2): ONLY clearly safe simple comments: single emoji, "nice!", "love this", "thanks", "great", "fire", "🔥❤️", one-word praise. Safe to auto-reply.
- group="attention" (Group 1): questions, complaints, "how much?", "where to buy?", influencer/verified (tier=vip or high), spam, ambiguous. Needs human review.
- When in doubt → attention.
- ai_reply_draft: short, warm, on-brand.
- Return a JSON array only.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-20250514", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) { console.error("[SAR] Haiku error:", res.status, await res.text()); continue; }

      const data = await res.json();
      const rawText: string = data.content?.[0]?.text ?? "[]";
      const cleaned = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      const parsed: Array<{
        id: string;
        group: "auto_reply" | "attention";
        classification?: string;
        sentiment?: string;
        urgency?: string;
        ai_reply_draft?: string | null;
        ai_suggestion?: string | null;
      }> = JSON.parse(cleaned);

      for (const item of parsed) {
        const comment = batch.find(c => c.id === item.id);
        if (!comment) continue;
        const profKey = `${comment.platform}::${comment.author.id}`;
        const { score, tier } = profileMap.get(profKey) ?? scoreProfile(comment.author);

        // VIP/high-score commenters always go to attention regardless
        const group = (tier === "vip" || tier === "high") ? "attention" : item.group;

        const urgencyBonus = item.urgency === "urgent" ? 30 : item.urgency === "normal" ? 10 : 0;

        results.set(item.id, {
          group,
          classification: item.classification ?? "neutral",
          sentiment: item.sentiment ?? "neutral",
          urgency: item.urgency ?? "normal",
          ai_reply_draft: group === "auto_reply" ? (item.ai_reply_draft ?? null) : undefined,
          ai_suggestion: group === "attention" ? (item.ai_suggestion ?? null) : undefined,
          profile_score: score,
          profile_tier: tier,
          weight: score + urgencyBonus,  // higher = replied first
        });
      }
    } catch (err) {
      console.error("[SAR] Haiku classify batch failed:", err);
    }
  }
  return results;
}

// ── Action: fetch_and_classify ─────────────────────────────────────────────────

async function fetchAndClassify(supabase: ReturnType<typeof createClient>, brandId: string, userId: string) {
  const { data: brand } = await supabase
    .from("brand_profiles")
    .select("brand_name, late_api_config, brand_dna")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  const lateConfig  = (brand?.late_api_config ?? {}) as Record<string, unknown>;
  const lateProfileId = (lateConfig.profile_id ?? lateConfig.late_profile_id ?? "") as string;
  if (!lateProfileId) return jsonErr({ error: "Brand has no connected Late profile. Connect platforms first." }, 400);

  const brandDna  = (brand?.brand_dna ?? {}) as Record<string, unknown>;
  const brandVoice = (brandDna.tone as string) || (brandDna.brand_voice as string) || "friendly and professional";

  const accountsRes = await fetch(`${LATE_API_BASE}/accounts?profileId=${lateProfileId}`, { headers: lateHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!accountsRes.ok) return jsonErr({ error: "Failed to fetch Late API accounts" }, 502);

  const accountsData = await accountsRes.json();
  const accounts: Array<{ id: string; platform: string }> = accountsData.accounts ?? accountsData.data ?? [];
  if (accounts.length === 0) return jsonOk({ success: true, processed: 0, message: "No connected accounts" });

  let totalFetched = 0, totalQueued = 0, totalAttention = 0, totalSkipped = 0;
  let commentBudget = COMMENT_SAMPLE_LIMIT;

  for (const account of accounts) {
    if (commentBudget <= 0) break;
    try {
      const postsRes = await fetch(`${LATE_API_BASE}/comments/list-inbox-comments?accountId=${account.id}&limit=20`, { headers: lateHeaders(), signal: AbortSignal.timeout(15_000) });
      if (!postsRes.ok) continue;
      const postsData = await postsRes.json();
      const posts: Array<{ id: string; commentCount: number }> = postsData.posts ?? postsData.data ?? [];

      for (const post of posts.filter(p => (p.commentCount ?? 0) > 0).slice(0, 10)) {
        if (commentBudget <= 0) break;
        const perPostLimit = Math.min(50, commentBudget);
        const commentsRes = await fetch(
          `${LATE_API_BASE}/comments/get-inbox-post-comments?accountId=${account.id}&postId=${post.id}&limit=${perPostLimit}`,
          { headers: lateHeaders(), signal: AbortSignal.timeout(15_000) }
        );
        if (!commentsRes.ok) continue;

        const commentsData = await commentsRes.json();
        const rawAll: LateComment[] = (commentsData.comments ?? commentsData.data ?? [])
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            postId: post.id,
            accountId: account.id,
            platform: account.platform,
            text: (c.text ?? c.content ?? "") as string,
            author: {
              id: ((c.author as Record<string, unknown>)?.id ?? "") as string,
              username: ((c.author as Record<string, unknown>)?.username ?? "unknown") as string,
              followerCount: ((c.author as Record<string, unknown>)?.followerCount ?? 0) as number,
              isVerified: ((c.author as Record<string, unknown>)?.isVerified ?? false) as boolean,
            },
            timestamp: (c.timestamp ?? c.created_at ?? new Date().toISOString()) as string,
            likes: (c.likes ?? 0) as number,
          }))
          .filter((c: LateComment) => c.text.trim().length > 0)
          .slice(0, commentBudget);

        commentBudget -= rawAll.length;
        totalFetched  += rawAll.length;

        // SHA-256 dedup
        const hashPairs = await Promise.all(rawAll.map(async c => ({ comment: c, hash: await smartHash(c.id, c.text) })));
        const hashes    = hashPairs.map(h => h.hash);

        const [{ data: existingQ }, { data: existingA }] = await Promise.all([
          supabase.from("gv_reply_queue").select("comment_hash").eq("brand_id", brandId).in("comment_hash", hashes),
          supabase.from("gv_attention_queue").select("comment_hash").eq("brand_id", brandId).in("comment_hash", hashes),
        ]);

        const seenHashes = new Set([
          ...(existingQ ?? []).map((r: Record<string, unknown>) => r.comment_hash as string),
          ...(existingA ?? []).map((r: Record<string, unknown>) => r.comment_hash as string),
        ]);

        const newPairs = hashPairs.filter(h => !seenHashes.has(h.hash));
        totalSkipped += hashPairs.length - newPairs.length;
        if (newPairs.length === 0) continue;

        const newComments = newPairs.map(h => h.comment);

        // Resolve commenter profiles with delta cache
        const profileMap = await resolveProfiles(supabase, brandId, newComments);

        // Classify with Claude Haiku
        const classifications = await classifyComments(brand.brand_name, brandVoice, newComments, profileMap);

        const queueRows: Record<string, unknown>[] = [];
        const attentionRows: Record<string, unknown>[] = [];

        for (const { comment, hash } of newPairs) {
          const cls = classifications.get(comment.id);
          if (!cls) continue;

          const base = {
            brand_id: brandId,
            platform: account.platform,
            account_id: account.id,
            post_id: comment.postId,
            comment_id: comment.id,
            commenter_username: comment.author.username,
            commenter_id: comment.author.id,
            comment_text: comment.text,
            comment_hash: hash,
            profile_tier: cls.profile_tier,
            profile_score: cls.profile_score,
          };

          if (cls.group === "auto_reply") {
            queueRows.push({ ...base, ai_reply_draft: cls.ai_reply_draft ?? null, weight: cls.weight, status: "queued" });
          } else {
            attentionRows.push({ ...base, classification: cls.classification ?? "neutral", sentiment: cls.sentiment ?? "neutral", urgency: cls.urgency ?? "normal", ai_suggestion: cls.ai_suggestion ?? null, is_read: false, is_resolved: false });
          }
        }

        if (queueRows.length > 0) {
          const { error } = await supabase.from("gv_reply_queue").insert(queueRows);
          if (error) console.error("[SAR] Queue insert error:", error.message);
          else totalQueued += queueRows.length;
        }
        if (attentionRows.length > 0) {
          const { error } = await supabase.from("gv_attention_queue").insert(attentionRows);
          if (error) console.error("[SAR] Attention insert error:", error.message);
          else totalAttention += attentionRows.length;
        }
      }
    } catch (err) {
      console.error(`[SAR] Error processing account ${account.id}:`, err);
    }
  }

  return jsonOk({
    success: true,
    fetched: totalFetched,
    cap: COMMENT_SAMPLE_LIMIT,
    capped: totalFetched >= COMMENT_SAMPLE_LIMIT,
    skipped_duplicate: totalSkipped,
    queued_for_auto_reply: totalQueued,
    queued_for_attention: totalAttention,
  });
}

// ── Action: send_replies ───────────────────────────────────────────────────────

async function sendReplies(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  userId: string,
  limit = 20
) {
  const now = new Date();
  const { cooldownSeconds, repliesPerHour } = await getPlanCooldown(supabase, userId);

  // Fetch highest-weight queued items (high-score commenters first)
  const { data: queued } = await supabase
    .from("gv_reply_queue")
    .select("id, platform, account_id, post_id, comment_id, ai_reply_draft, weight, profile_score, profile_tier")
    .eq("brand_id", brandId)
    .eq("status", "queued")
    .not("ai_reply_draft", "is", null)
    .order("weight", { ascending: false })  // high score first
    .limit(limit);

  if (!queued || queued.length === 0) return jsonOk({ success: true, sent: 0, message: "No queued replies" });

  let sent = 0, failed = 0;

  for (const item of queued) {
    const { data: rateLimit } = await supabase
      .from("gv_reply_rate_limit")
      .select("last_reply_at, cooldown_seconds, replies_last_hour")
      .eq("brand_id", brandId).eq("platform", item.platform)
      .maybeSingle();

    if (rateLimit?.last_reply_at) {
      const elapsed = (now.getTime() - new Date(rateLimit.last_reply_at).getTime()) / 1000;
      const effectiveCooldown = rateLimit.cooldown_seconds ?? cooldownSeconds;
      if (elapsed < effectiveCooldown) { console.log(`[SAR] Rate limited ${item.platform}`); continue; }
    }
    if ((rateLimit?.replies_last_hour ?? 0) >= repliesPerHour) {
      console.log(`[SAR] Hourly cap ${repliesPerHour}/h reached for ${item.platform}`); continue;
    }

    await supabase.from("gv_reply_queue").update({ status: "processing", updated_at: now.toISOString() }).eq("id", item.id);

    try {
      const replyRes = await fetch(`${LATE_API_BASE}/comments/reply-to-inbox-post`, {
        method: "POST",
        headers: lateHeaders(),
        body: JSON.stringify({ accountId: item.account_id, postId: item.post_id, commentId: item.comment_id, content: item.ai_reply_draft }),
        signal: AbortSignal.timeout(15_000),
      });

      if (replyRes.ok) {
        await supabase.from("gv_reply_queue").update({ status: "sent", sent_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", item.id);
        await supabase.from("gv_reply_rate_limit").upsert({
          brand_id: brandId, platform: item.platform,
          last_reply_at: now.toISOString(),
          cooldown_seconds: cooldownSeconds,
          replies_last_hour: (rateLimit?.replies_last_hour ?? 0) + 1,
          updated_at: now.toISOString(),
        }, { onConflict: "brand_id,platform" });
        sent++;
      } else {
        const errText = await replyRes.text();
        await supabase.from("gv_reply_queue").update({ status: "failed", error_message: errText, updated_at: now.toISOString() }).eq("id", item.id);
        failed++;
      }
    } catch (err) {
      await supabase.from("gv_reply_queue").update({ status: "failed", error_message: String(err), updated_at: now.toISOString() }).eq("id", item.id);
      failed++;
    }
  }

  return jsonOk({ success: true, sent, failed, total_processed: sent + failed });
}

// ── Action: send_single ────────────────────────────────────────────────────────

async function sendSingle(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  queueId: string,
  replyText: string,
  source: "queue" | "attention"
) {
  const table = source === "queue" ? "gv_reply_queue" : "gv_attention_queue";
  const { data: item } = await supabase.from(table).select("account_id, post_id, comment_id, platform").eq("id", queueId).eq("brand_id", brandId).single();
  if (!item) return jsonErr({ error: "Comment not found" }, 404);

  const replyRes = await fetch(`${LATE_API_BASE}/comments/reply-to-inbox-post`, {
    method: "POST",
    headers: lateHeaders(),
    body: JSON.stringify({ accountId: item.account_id, postId: item.post_id, commentId: item.comment_id, content: replyText }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!replyRes.ok) { const errText = await replyRes.text(); return jsonErr({ error: `Late API error: ${errText}` }, 502); }

  const now = new Date().toISOString();
  if (source === "queue") {
    await supabase.from("gv_reply_queue").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", queueId);
  } else {
    await supabase.from("gv_attention_queue").update({ is_resolved: true, resolved_at: now, updated_at: now }).eq("id", queueId);
  }
  return jsonOk({ success: true, sent: true });
}

// ── Action: get_stats ──────────────────────────────────────────────────────────

async function getStats(supabase: ReturnType<typeof createClient>, brandId: string, userId: string) {
  // Verify brand ownership before returning stats
  const { data: brandCheck } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!brandCheck) return jsonErr({ error: "Forbidden" }, 403);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [autoTotal, autoToday, manualTotal, manualToday, pendingCount, attentionPending, commentersCached] =
    await Promise.all([
      supabase.from("gv_reply_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "sent"),
      supabase.from("gv_reply_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "sent").gte("sent_at", todayISO),
      supabase.from("gv_attention_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("is_resolved", true),
      supabase.from("gv_attention_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("is_resolved", true).gte("resolved_at", todayISO),
      supabase.from("gv_reply_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "queued"),
      supabase.from("gv_attention_queue").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("is_resolved", false),
      supabase.from("gv_commenter_profiles").select("id", { count: "exact", head: true }).eq("brand_id", brandId).gt("expires_at", new Date().toISOString()),
    ]);

  return jsonOk({
    success: true,
    stats: {
      auto_replied_total:    autoTotal.count ?? 0,
      auto_replied_today:    autoToday.count ?? 0,
      manual_replied_total:  manualTotal.count ?? 0,
      manual_replied_today:  manualToday.count ?? 0,
      pending_auto:          pendingCount.count ?? 0,
      pending_attention:     attentionPending.count ?? 0,
      commenters_cached:     commentersCached.count ?? 0,
    },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonErr({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return jsonErr({ error: "Missing Authorization" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return jsonErr({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const { action, brand_id, queue_id, reply_text, source, limit } = body;
  if (!brand_id) return jsonErr({ error: "brand_id is required" }, 400);

  switch (action) {
    case "fetch_and_classify": return await fetchAndClassify(supabase, brand_id, user.id);
    case "send_replies":       return await sendReplies(supabase, brand_id, user.id, limit ?? 20);
    case "send_single":
      if (!queue_id || !reply_text) return jsonErr({ error: "queue_id and reply_text required" }, 400);
      return await sendSingle(supabase, brand_id, queue_id, reply_text, source ?? "queue");
    case "get_stats":          return await getStats(supabase, brand_id, user.id);
    default:                   return jsonErr({ error: `Unknown action: ${action}` }, 400);
  }
});
