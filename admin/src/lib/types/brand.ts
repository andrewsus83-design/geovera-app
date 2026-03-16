export interface Brand {
  id: string;
  user_id: string;
  name: string;
  category: string;
  website: string | null;
  wa_number: string | null;
  tier: 'go' | 'pro' | 'enterprise';
  slug: string;
  bot_prefix: string | null;
  group_wa_id: string | null;
  onboarding_done: boolean;
  onboarding_status: string | null;
  onboarding_step: string | null;
  onboarding_steps_done: Record<string, boolean> | null;
  god_mode_paused: boolean;
  platform_count: number;
  files_uploaded: number;
  last_72h_at: string | null;
  next_72h_at: string | null;
  last_14d_at: string | null;
  next_14d_at: string | null;
  last_biweekly_at: string | null;
  next_biweekly_at: string | null;
  cycle_count: number;
  months_active: number;
  late_profile_id: string | null;
  late_profile_name: string | null;
  bot_added_at: string | null;
  welcome_sent_at: string | null;
  biweekly_report: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface BrandProfile {
  id: string;
  brand_id: string;
  user_id: string | null;
  brand_name: string | null;
  country: string;
  website_url: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  facebook_page: string | null;
  google_property: string | null;
  research_status: 'pending' | 'indexing' | 'gemini_complete' | 'researching_deep' | 'consolidating' | 'sot_ready' | 'complete' | 'failed';
  research_hash: string | null;
  research_version: number;
  research_data: Record<string, unknown> | null;
  brand_dna: Record<string, unknown> | null;
  source_of_truth: Record<string, unknown> | null;
  social_handles: Record<string, string>;
  geo_score: number | null;
  visibility_score: number | null;
  authority_score: number | null;
  trust_score: number | null;
  discovery_score: number | null;
  intake_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformApiKey {
  id: string;
  brand_id: string;
  platform: string;
  key_name: string;
  api_key: string | null;
  api_secret: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BrandAsset {
  id: string;
  brand_id: string;
  asset_type: 'article' | 'image' | 'video' | 'data' | 'other';
  file_name: string;
  file_url: string | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_at: string;
}

export type BrandFormData = {
  name: string;
  slug: string;
  category: string;
  tier: string;
  website: string;
  bot_prefix: string;
  description: string;
  wa_number: string;
  group_wa_id: string;
  fonnte_token: string;
  social_handles: Record<string, string>;
  api_keys: Record<string, Record<string, string>>;
};
