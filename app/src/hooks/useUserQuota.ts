"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface UserQuota {
  plan_name: string;
  // Feature toggles
  feature_start_enabled: boolean;
  feature_ai_chat_enabled: boolean;
  feature_content_enabled: boolean;
  feature_reply_enabled: boolean;
  feature_report_enabled: boolean;
  feature_chronicle_enabled: boolean;
  // Limits
  brands_limit: number;
  onboarding_runs_limit: number;
  ai_chat_messages_per_day: number;
  suggested_prompts_per_day: number;
  content_articles_per_day: number;
  content_articles_short_per_day: number;
  content_articles_medium_per_day: number;
  content_articles_long_per_day: number;
  content_articles_verylong_per_day: number;
  analytics_keywords_tracked: number;
  analytics_topics_tracked: number;
  content_images_per_day: number;
  content_videos_per_day: number;
  qa_tier: string;
  qa_runs_per_cycle: number;
  qa_probes_total: number;
  reports_per_month: number;
  auto_reply_per_5min: number;
  auto_publish_per_month: number;
  chronicle_runs_per_cycle: number;
}

// Zero-quota object used when there is no active subscription.
// Components should check `hasActivePlan` and redirect to /subscription.
const NO_PLAN_QUOTA: UserQuota = {
  plan_name: "no_plan",
  feature_start_enabled: false, feature_ai_chat_enabled: false,
  feature_content_enabled: false, feature_reply_enabled: false,
  feature_report_enabled: false, feature_chronicle_enabled: false,
  brands_limit: 0, onboarding_runs_limit: 0,
  ai_chat_messages_per_day: 0, suggested_prompts_per_day: 0,
  content_articles_per_day: 0, content_articles_short_per_day: 0,
  content_articles_medium_per_day: 0, content_articles_long_per_day: 0,
  content_articles_verylong_per_day: 0,
  analytics_keywords_tracked: 0, analytics_topics_tracked: 0,
  content_images_per_day: 0, content_videos_per_day: 0,
  qa_tier: "none", qa_runs_per_cycle: 0, qa_probes_total: 0,
  reports_per_month: 0, auto_reply_per_5min: 0,
  auto_publish_per_month: 0, chronicle_runs_per_cycle: 0,
};

export function useUserQuota() {
  const [quota, setQuota] = useState<UserQuota>(NO_PLAN_QUOTA);
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      // Admins get top-tier access
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      // Get active subscription → plan slug
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id, plans!inner(slug)")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const planSlug = profile?.is_admin
        ? "enterprise"
        : (sub?.plans as unknown as { slug: string } | null)?.slug ?? null;

      if (!planSlug) {
        // No active subscription — all features locked, redirect to /subscription
        setLoading(false);
        return;
      }

      const { data: pq } = await supabase
        .from("plan_quotas")
        .select("*")
        .eq("plan_name", planSlug)
        .single();

      if (pq) {
        setQuota(pq as UserQuota);
        setHasActivePlan(true);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { quota, hasActivePlan, loading };
}
