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
  content_articles_per_month: number;
  content_images_per_month: number;
  content_videos_per_month: number;
  qa_tier: string;
  qa_runs_per_cycle: number;
  qa_probes_total: number;
  reports_per_month: number;
  auto_reply_per_day: number;
  auto_publish_per_month: number;
  chronicle_runs_per_cycle: number;
}

const TRIAL_DEFAULTS: UserQuota = {
  plan_name: "trial",
  feature_start_enabled: true,
  feature_ai_chat_enabled: true,
  feature_content_enabled: true,
  feature_reply_enabled: false,
  feature_report_enabled: false,
  feature_chronicle_enabled: false,
  brands_limit: 1,
  onboarding_runs_limit: 1,
  ai_chat_messages_per_day: 5,
  suggested_prompts_per_day: 3,
  content_articles_per_month: 3,
  content_images_per_month: 3,
  content_videos_per_month: 0,
  qa_tier: "basic",
  qa_runs_per_cycle: 1,
  qa_probes_total: 15,
  reports_per_month: 0,
  auto_reply_per_day: 0,
  auto_publish_per_month: 0,
  chronicle_runs_per_cycle: 0,
};

export function useUserQuota() {
  const [quota, setQuota] = useState<UserQuota>(TRIAL_DEFAULTS);
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
        : (sub?.plans as unknown as { slug: string } | null)?.slug ?? "trial";

      const { data: pq } = await supabase
        .from("plan_quotas")
        .select("*")
        .eq("plan_name", planSlug)
        .single();

      if (pq) setQuota(pq as UserQuota);
      setLoading(false);
    }
    fetch();
  }, []);

  return { quota, loading };
}
