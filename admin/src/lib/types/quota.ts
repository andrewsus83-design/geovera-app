export interface TierQuotaConfig {
  id: string;
  tier: string;
  images_per_day: number;
  videos_per_day: number;
  articles_per_day: number;
  smart_reply_per_day: number;
  manual_reply_per_day: number;
  tasks_per_cycle: number;
  tasks_active_max: number;
  biweekly_report: boolean;
  research_depth: string;
  qa_per_cycle: number;
  approval_expiry_hours: number;
  auto_publish_enabled: boolean;
  overage_allowed: boolean;
  overage_multiplier: number;
  smart_reply_per_5min: number;
  content_sets_per_day: number;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface BrandQuotaOverride {
  id: string;
  brand_id: string;
  images_per_day: number | null;
  videos_per_day: number | null;
  articles_per_day: number | null;
  smart_reply_per_day: number | null;
  tasks_per_cycle: number | null;
  tasks_active_max: number | null;
  biweekly_report: boolean | null;
  auto_publish_enabled: boolean | null;
  overage_allowed: boolean | null;
  smart_reply_per_5min: number | null;
  override_expires: string | null;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
}
