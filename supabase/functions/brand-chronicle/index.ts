import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Chronicle (14-Day Progress Report)

   Every 14 days, generates a comprehensive progress chronicle combining:
   1. Late API (getlate.dev) — real social media analytics:
      - Reach, impressions, engagements, follower growth per platform
      - Top performing posts (last 14D)
      - Comment inbox for autoreply
   2. GeoVera historical data:
      - brand_qa_history (last 2 QA runs → score delta)
      - brand_analytics_history (72H snapshots → trend)
   3. Claude synthesizes a Chronicle Report:
      - Progress narrative + key wins
      - Channel-by-channel performance review
      - Opportunities for next 14D
      - AI-generated replies for top unanswered comments

   Optional automations (configured via brand_profiles.late_api_config):
   - auto_reply: true → posts AI-crafted replies to top comments
   - auto_publish: true → publishes a progress highlight post

   TRIGGER:
   - brand-refresh-scheduler every 14 days
   - Manual: POST { brand_profile_id, user_id }
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const LATE_API_BASE = Deno.env.get("LATE_API_BASE_URL") || "https://api.getlate.dev/v1";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CHRONICLE_DAYS = 14;

async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 4000): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

// ── Late API helpers ───────────────────────────────────────────────────────────
async function lateGet(endpoint: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${LATE_API_BASE}${endpoint}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Late API GET ${endpoint} failed: ${res.status} — ${err.slice(0, 200)}`);
  }
  return await res.json() as Record<string, unknown>;
}

async function latePost(endpoint: string, token: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${LATE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Late API POST ${endpoint} failed: ${res.status} — ${err.slice(0, 200)}`);
  }
  return await res.json() as Record<string, unknown>;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
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
  let brand_profile_id = "";

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      force?: boolean;
    };

    const { user_id, force = false } = body;
    brand_profile_id = body.brand_profile_id;

    if (!brand_profile_id || !user_id) {
      return new Response(JSON.stringify({ error: "brand_profile_id and user_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch brand profile
    const { data: profile, error: fetchErr } = await supabase
      .from("brand_profiles")
      .select("brand_name, country, source_of_truth, qa_analytics, late_api_config, chronicle_updated_at")
      .eq("id", brand_profile_id)
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile?.source_of_truth) {
      return new Response(JSON.stringify({ error: "Brand profile or SoT not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // 14-day dedup
    if (!force && profile.chronicle_updated_at) {
      const daysSince = (Date.now() - new Date(profile.chronicle_updated_at).getTime()) / 86400000;
      if (daysSince < 13) {
        console.log(`[brand-chronicle] Skipping — ran ${daysSince.toFixed(1)} days ago`);
        return new Response(JSON.stringify({ success: true, skipped: true, days_since: daysSince.toFixed(1) }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const lateConfig = profile.late_api_config as Record<string, unknown> | null;
    const lateToken = lateConfig?.token as string | undefined;
    const connectedPlatforms = (lateConfig?.connected_platforms as string[]) ?? [];
    const autoReply = (lateConfig?.auto_reply as boolean) ?? false;
    const autoPublish = (lateConfig?.auto_publish as boolean) ?? false;

    console.log(`[brand-chronicle] Starting 14D chronicle for: ${profile.brand_name}`);

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - CHRONICLE_DAYS * 86400000);

    // ── Fetch historical data ──────────────────────────────────────────────────
    const [qaHistoryResult, analyticsHistoryResult] = await Promise.allSettled([
      supabase
        .from("brand_qa_history")
        .select("run_at, overall_score, geo_visibility, social_visibility, seo_visibility, geo_mention_rate, social_found_rate, seo_found_rate, new_keywords_discovered")
        .eq("brand_profile_id", brand_profile_id)
        .order("run_at", { ascending: false })
        .limit(2),
      supabase
        .from("brand_analytics_history")
        .select("recorded_at, overall_score, seo_visibility, geo_visibility, social_visibility, qa_score, tasks_generated, top_keywords, top_topics")
        .eq("brand_profile_id", brand_profile_id)
        .order("recorded_at", { ascending: false })
        .limit(6),
    ]);

    const qaHistory = qaHistoryResult.status === "fulfilled" ? qaHistoryResult.value.data ?? [] : [];
    const analyticsHistory = analyticsHistoryResult.status === "fulfilled" ? analyticsHistoryResult.value.data ?? [] : [];

    // ── Compute score deltas from QA history ──────────────────────────────────
    const latestQA = qaHistory[0] ?? null;
    const previousQA = qaHistory[1] ?? null;
    const qaScoreStart = previousQA ? Number(previousQA.overall_score ?? 0) : null;
    const qaScoreEnd = latestQA ? Number(latestQA.overall_score ?? 0) : null;
    const scoreDelta = (qaScoreStart !== null && qaScoreEnd !== null) ? qaScoreEnd - qaScoreStart : null;

    // ── Late API: fetch analytics + top posts + comments ──────────────────────
    let lateAnalytics: Record<string, unknown> = {};
    let topPosts: unknown[] = [];
    let inboxConversations: Array<Record<string, unknown>> = [];
    let lateAvailable = false;

    if (lateToken && connectedPlatforms.length > 0) {
      try {
        const startStr = periodStart.toISOString().split("T")[0];
        const endStr = periodEnd.toISOString().split("T")[0];

        // Analytics (reach, impressions, engagements, followers)
        const analyticsData = await lateGet(
          `/analytics?start_date=${startStr}&end_date=${endStr}&platforms=${connectedPlatforms.join(",")}`,
          lateToken,
        );
        lateAnalytics = analyticsData;
        lateAvailable = true;

        // Top performing posts from this period
        try {
          const postsData = await lateGet(
            `/posts?start_date=${startStr}&end_date=${endStr}&sort=engagement&limit=10`,
            lateToken,
          );
          topPosts = (postsData.posts as unknown[]) ?? (postsData.data as unknown[]) ?? [];
        } catch (e) {
          console.warn(`[brand-chronicle] Posts fetch failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }

        // Inbox: unanswered comments
        try {
          const inboxData = await lateGet("/inbox/conversations?status=unread&limit=20", lateToken);
          inboxConversations = (inboxData.conversations as Array<Record<string, unknown>>) ??
            (inboxData.data as Array<Record<string, unknown>>) ?? [];
        } catch (e) {
          console.warn(`[brand-chronicle] Inbox fetch failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
      } catch (e) {
        console.warn(`[brand-chronicle] Late API failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Aggregate social metrics from Late API ─────────────────────────────────
    const platformStats = lateAvailable ? (lateAnalytics.platforms as Record<string, Record<string, number>>) ?? {} : {};
    let totalReach = 0, totalImpressions = 0, totalEngagements = 0;
    const followerDelta: Record<string, number> = {};

    for (const [platform, stats] of Object.entries(platformStats)) {
      totalReach += Number(stats.reach ?? 0);
      totalImpressions += Number(stats.impressions ?? 0);
      totalEngagements += Number(stats.likes ?? 0) + Number(stats.comments ?? 0) + Number(stats.shares ?? 0);
      followerDelta[platform] = Number(stats.followers_gained ?? stats.new_followers ?? 0);
    }

    // ── Build context for Claude ───────────────────────────────────────────────
    const sot = profile.source_of_truth as Record<string, unknown>;
    const qaAnalytics = profile.qa_analytics as Record<string, unknown> | null;
    const qaAnalysis = qaAnalytics?.analysis as Record<string, unknown> | null;

    const historySummary = JSON.stringify({
      qa_history: qaHistory.slice(0, 2).map((h) => ({
        run_at: h.run_at,
        score: h.overall_score,
        geo_mention_rate: h.geo_mention_rate,
        social_found_rate: h.social_found_rate,
        seo_found_rate: h.seo_found_rate,
        new_keywords: h.new_keywords_discovered?.slice(0, 5),
      })),
      score_delta: scoreDelta !== null ? `${scoreDelta > 0 ? "+" : ""}${scoreDelta} points` : "first run",
      analytics_trend: analyticsHistory.slice(0, 4).map((h) => ({
        recorded_at: h.recorded_at,
        overall: h.overall_score,
        qa_score: h.qa_score,
        tasks: h.tasks_generated,
        top_keywords: h.top_keywords?.slice(0, 5),
      })),
    }, null, 0).slice(0, 2000);

    const lateSummary = lateAvailable ? JSON.stringify({
      period: `${periodStart.toISOString().split("T")[0]} to ${periodEnd.toISOString().split("T")[0]}`,
      total_reach: totalReach,
      total_impressions: totalImpressions,
      total_engagements: totalEngagements,
      follower_delta: followerDelta,
      platform_breakdown: platformStats,
      top_posts_count: topPosts.length,
      top_posts_preview: topPosts.slice(0, 3).map((p) => {
        const post = p as Record<string, unknown>;
        return { caption: String(post.caption ?? post.text ?? "").slice(0, 80), platform: post.platform, engagement: post.engagement_count ?? post.likes };
      }),
    }, null, 0).slice(0, 1500) : "{}";

    const inboxSummary = inboxConversations.slice(0, 10).map((c) => ({
      id: String(c.id),
      platform: c.platform,
      author: c.author_name ?? c.author,
      message: String(c.text ?? c.message ?? "").slice(0, 100),
    }));

    const sotContext = JSON.stringify({
      brand: profile.brand_name,
      category: (sot.market_intelligence as Record<string, unknown>)?.category,
      usp: (sot.brand_foundation as Record<string, unknown>)?.usp,
      brand_voice: (sot.brand_foundation as Record<string, unknown>)?.brand_voice,
      current_qa_score: qaAnalysis?.qa_score,
    }, null, 0).slice(0, 1000);

    // ── Claude generates Chronicle Report ─────────────────────────────────────
    const chronicleResponse = await callClaude(
      `You are GeoVera's Brand Chronicle AI.
You generate insightful 14-day brand progress reports for brand owners in ${profile.country}.
Language: ${profile.country === "Indonesia" ? "Use Bahasa Indonesia" : "Use English"}.
Be honest, direct, encouraging but realistic. Plain language — no jargon.
Output ONLY valid JSON. No markdown outside JSON.`,
      `Generate a 14-day Brand Chronicle for: "${profile.brand_name}"

BRAND CONTEXT:
${sotContext}

14-DAY SOCIAL MEDIA PERFORMANCE (Late API):
${lateSummary}

BRAND PRESENCE SCORE HISTORY (GeoVera QA):
${historySummary}

UNANSWERED COMMENTS/MESSAGES (${inboxConversations.length} found):
${JSON.stringify(inboxSummary, null, 0).slice(0, 1000)}

OUTPUT this exact JSON:
{
  "period": "${periodStart.toISOString().split("T")[0]} to ${periodEnd.toISOString().split("T")[0]}",
  "headline": "<1 sentence chronicle headline — honest, specific>",
  "score_delta_summary": "<plain language explanation of score change, or 'first chronicle' if no previous>",

  "performance_summary": {
    "overall_verdict": "growing|stable|declining|new_brand",
    "biggest_win": "<specific win from data — e.g. 'Instagram reach up 40%'>",
    "biggest_gap": "<what didn't work or is missing>",
    "platform_highlights": [
      {"platform": "<name>", "reach": 0, "engagements": 0, "follower_gain": 0, "verdict": "strong|moderate|weak", "note": "<1 specific insight>"}
    ]
  },

  "content_performance": {
    "best_performing_topics": ["<topic that got most reach>"],
    "underperforming_areas": ["<what's not getting traction>"],
    "recommended_content_shift": "<specific recommendation for next 14D>"
  },

  "brand_presence_progress": {
    "geo_trend": "improving|stable|declining|no_data",
    "social_trend": "improving|stable|declining|no_data",
    "seo_trend": "improving|stable|declining|no_data",
    "key_metrics_change": {
      "geo_mention_rate_change": "<+X% or N/A>",
      "social_found_rate_change": "<+X% or N/A>",
      "overall_score_change": "<+X points or N/A>"
    }
  },

  "top_keywords_growing": ["<keyword gaining traction>"],
  "new_opportunities": ["<opportunity to capitalize on in next 14D>"],
  "citations_and_mentions": ["<any notable mentions or citations found>"],

  "comment_replies": [
    {
      "conversation_id": "<id>",
      "platform": "<platform>",
      "original_message": "<message>",
      "suggested_reply": "<warm, brand-voice reply in ${profile.country === "Indonesia" ? "Bahasa Indonesia" : "English"}, max 120 chars>",
      "reply_intent": "gratitude|clarification|invitation|support"
    }
  ],

  "next_14d_focus": {
    "priority_1": "<most important action>",
    "priority_2": "<second priority>",
    "priority_3": "<third priority>",
    "content_theme": "<overarching content theme for next 14D>"
  },

  "chronicle_narrative": "<3-4 sentence progress story — honest, encouraging, specific to this brand's journey>",
  "motivation_note": "<1 short sentence of honest encouragement based on actual progress>"
}

${inboxConversations.length > 0
    ? "Generate comment replies for all comments in the list. Match the brand voice. Keep replies warm and genuine."
    : "No comments to reply to — leave comment_replies as empty array []."
  }`,
    );

    let chronicleAnalysis: Record<string, unknown>;
    try {
      let jsonText = chronicleResponse.trim();
      if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      chronicleAnalysis = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Chronicle analysis parse failed: ${e}. Preview: ${chronicleResponse.slice(0, 200)}`);
    }

    // ── Save to brand_chronicles ───────────────────────────────────────────────
    const { data: chronicle, error: insertErr } = await supabase
      .from("brand_chronicles")
      .insert({
        brand_profile_id,
        user_id,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        chronicle_type: "14d",
        late_analytics: lateAvailable ? lateAnalytics : null,
        total_reach: totalReach,
        total_impressions: totalImpressions,
        total_engagements: totalEngagements,
        follower_delta: followerDelta,
        platform_breakdown: platformStats,
        top_posts: topPosts.slice(0, 10),
        citations_found: (chronicleAnalysis.citations_and_mentions as string[]) ?? [],
        qa_score_start: qaScoreStart,
        qa_score_end: qaScoreEnd,
        score_delta: scoreDelta,
        chronicle_analysis: chronicleAnalysis,
        weekly_focus: String((chronicleAnalysis.next_14d_focus as Record<string, unknown>)?.content_theme ?? ""),
        status: "completed",
      })
      .select("id")
      .single();

    if (insertErr) throw new Error(`Chronicle insert failed: ${insertErr.message}`);

    // ── Update brand_profiles.chronicle_updated_at ─────────────────────────────
    await supabase
      .from("brand_profiles")
      .update({ chronicle_updated_at: new Date().toISOString() })
      .eq("id", brand_profile_id);

    // ── Auto-reply comments (if enabled + replies generated) ──────────────────
    const commentReplies = (chronicleAnalysis.comment_replies as Array<Record<string, unknown>>) ?? [];
    let repliedCount = 0;

    if (autoReply && lateToken && commentReplies.length > 0) {
      for (const reply of commentReplies.slice(0, 10)) {
        const convId = String(reply.conversation_id ?? "");
        const replyText = String(reply.suggested_reply ?? "");
        if (!convId || !replyText) continue;

        try {
          await latePost(`/inbox/conversations/${convId}/reply`, lateToken, { message: replyText });
          repliedCount++;
          console.log(`[brand-chronicle] Replied to comment ${convId} on ${reply.platform}`);
        } catch (e) {
          console.warn(`[brand-chronicle] Reply failed for ${convId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Update comments_replied count
      if (repliedCount > 0) {
        await supabase.from("brand_chronicles")
          .update({ comments_replied: repliedCount })
          .eq("id", chronicle?.id ?? "");
      }
    }

    // ── Auto-publish progress highlight (if enabled) ──────────────────────────
    const publishedPostIds: string[] = [];

    if (autoPublish && lateToken) {
      const publishPlatforms = (lateConfig?.publish_platforms as string[]) ?? connectedPlatforms.slice(0, 2);
      const headline = String(chronicleAnalysis.headline ?? "");
      const biggestWin = String((chronicleAnalysis.performance_summary as Record<string, unknown>)?.biggest_win ?? "");
      const nextFocus = (chronicleAnalysis.next_14d_focus as Record<string, unknown>)?.priority_1 ?? "";

      if (headline && publishPlatforms.length > 0) {
        // Claude generates a platform-optimized caption for the progress post
        const captionResponse = await callClaude(
          `You write short, engaging social media captions in ${profile.country === "Indonesia" ? "Bahasa Indonesia" : "English"}. No emojis unless very natural. Keep it authentic.`,
          `Write a short social media caption (max 150 chars) for a 14-day brand progress update.
Brand: ${profile.brand_name}
Headline: ${headline}
Biggest win: ${biggestWin}
Next focus: ${nextFocus}
Make it feel like a genuine update from the brand, not a metric report. Conversational tone.`,
          500,
        );

        for (const platform of publishPlatforms.slice(0, 2)) {
          try {
            const postResult = await latePost("/posts", lateToken, {
              platforms: [platform],
              content: captionResponse.trim().slice(0, 300),
              schedule: "now",
            });
            const postId = String((postResult.post as Record<string, unknown>)?.id ?? postResult.id ?? "");
            if (postId) publishedPostIds.push(`${platform}:${postId}`);
            console.log(`[brand-chronicle] Published progress post on ${platform}`);
          } catch (e) {
            console.warn(`[brand-chronicle] Publish failed on ${platform}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (publishedPostIds.length > 0) {
          await supabase.from("brand_chronicles")
            .update({ autopublished: true, published_post_ids: publishedPostIds })
            .eq("id", chronicle?.id ?? "");
        }
      }
    }

    console.log(`[brand-chronicle] Done: ${profile.brand_name} — score_delta:${scoreDelta ?? "N/A"} replies:${repliedCount} published:${publishedPostIds.length}`);

    return new Response(JSON.stringify({
      success: true,
      brand_profile_id,
      chronicle_id: chronicle?.id,
      period: `${periodStart.toISOString().split("T")[0]} → ${periodEnd.toISOString().split("T")[0]}`,
      score_delta: scoreDelta,
      total_reach: totalReach,
      total_engagements: totalEngagements,
      comments_replied: repliedCount,
      posts_published: publishedPostIds.length,
      late_connected: lateAvailable,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-chronicle] ERROR: ${message}`);

    if (brand_profile_id) {
      supabase.from("brand_profiles").update({
        error_details: { message, step: "brand-chronicle", timestamp: new Date().toISOString() },
        error_at: new Date().toISOString(),
        error_step: "brand-chronicle",
      }).eq("id", brand_profile_id).catch(() => {});
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
