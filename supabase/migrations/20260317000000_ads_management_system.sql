-- ============================================================================
-- GEOVERA ADS MANAGEMENT LOOP SYSTEM
-- 13 tables + 1 view for self-learning ads optimization
-- ============================================================================

-- 1. Platform API keys for ads (Meta/TikTok/Google)
CREATE TABLE IF NOT EXISTS gv_ad_platform_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok', 'google')),
  app_id TEXT,
  app_secret TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  ad_account_id TEXT NOT NULL,
  developer_token TEXT,
  extra JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, platform)
);

-- 2. Ad campaigns (unified across Meta/TikTok/Google)
CREATE TABLE IF NOT EXISTS gv_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok', 'google')),
  platform_campaign_id TEXT,
  name TEXT NOT NULL,
  objective TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'error')),
  daily_budget_usd DECIMAL(10,2),
  total_budget_usd DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  targeting JSONB DEFAULT '{}',
  source_type TEXT CHECK (source_type IN ('organic_boost', 'new_creative', 'retarget')),
  source_content_id UUID,
  source_late_post_id TEXT,
  ai_recommended BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ad_campaigns_brand ON gv_ad_campaigns(brand_id);
CREATE INDEX idx_ad_campaigns_platform ON gv_ad_campaigns(platform);
CREATE INDEX idx_ad_campaigns_status ON gv_ad_campaigns(status);

-- 3. Ad sets / Ad groups (level 2 in hierarchy)
CREATE TABLE IF NOT EXISTS gv_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES gv_ad_campaigns(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_adset_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  daily_budget_usd DECIMAL(10,2),
  bid_strategy TEXT,
  targeting JSONB DEFAULT '{}',
  placement JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Individual ads / creatives
CREATE TABLE IF NOT EXISTS gv_ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adset_id UUID NOT NULL REFERENCES gv_ad_sets(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_ad_id TEXT,
  name TEXT,
  creative_type TEXT CHECK (creative_type IN ('image', 'video', 'carousel', 'text')),
  headline TEXT,
  body_text TEXT,
  media_url TEXT,
  cta_type TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Ad performance snapshots (scraped from platform APIs)
CREATE TABLE IF NOT EXISTS gv_ad_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  campaign_id UUID REFERENCES gv_ad_campaigns(id),
  adset_id UUID REFERENCES gv_ad_sets(id),
  ad_id UUID REFERENCES gv_ad_creatives(id),
  platform TEXT NOT NULL,
  platform_entity_id TEXT,
  entity_level TEXT CHECK (entity_level IN ('campaign', 'adset', 'ad')),
  snapshot_date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend_usd DECIMAL(10,4) DEFAULT 0,
  cpc_usd DECIMAL(10,4),
  cpm_usd DECIMAL(10,4),
  ctr DECIMAL(8,4),
  conversions INTEGER DEFAULT 0,
  conversion_value_usd DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(8,4),
  frequency DECIMAL(6,2),
  video_views BIGINT DEFAULT 0,
  video_watch_25 BIGINT DEFAULT 0,
  video_watch_50 BIGINT DEFAULT 0,
  video_watch_75 BIGINT DEFAULT 0,
  video_watch_100 BIGINT DEFAULT 0,
  extra_metrics JSONB DEFAULT '{}',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, platform_entity_id, entity_level, snapshot_date)
);

CREATE INDEX idx_ad_perf_brand_date ON gv_ad_performance(brand_id, snapshot_date);
CREATE INDEX idx_ad_perf_campaign ON gv_ad_performance(campaign_id);

-- 6. Ad analysis results (Claude-generated insights)
CREATE TABLE IF NOT EXISTS gv_ad_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('history', 'monitor', 'fix', 'strategy')),
  cycle_id TEXT,
  platform TEXT,
  summary TEXT,
  findings JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  patterns_detected JSONB DEFAULT '[]',
  score DECIMAL(5,2),
  ai_model TEXT,
  ai_cost_usd DECIMAL(8,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ad_analysis_brand ON gv_ad_analysis(brand_id);
CREATE INDEX idx_ad_analysis_type ON gv_ad_analysis(brand_id, analysis_type);

-- 7. Ad budget allocations
CREATE TABLE IF NOT EXISTS gv_ad_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  cycle_id TEXT,
  period_start DATE,
  period_end DATE,
  total_budget_usd DECIMAL(10,2),
  platform_allocations JSONB DEFAULT '{}',
  campaign_allocations JSONB DEFAULT '[]',
  allocation_strategy TEXT,
  ai_reasoning TEXT,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Ad content candidates (organic posts picked for promotion)
CREATE TABLE IF NOT EXISTS gv_ad_content_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  cycle_id TEXT,
  late_post_id TEXT,
  platform TEXT NOT NULL,
  post_url TEXT,
  content_preview TEXT,
  organic_reach BIGINT,
  organic_likes BIGINT,
  organic_comments BIGINT,
  organic_shares BIGINT,
  organic_saves BIGINT,
  organic_ctr DECIMAL(8,4),
  organic_watch_retention DECIMAL(5,2),
  gv_overall_score DECIMAL(5,2),
  gv_factor_scores JSONB,
  ad_potential_score DECIMAL(5,2),
  recommended_objective TEXT,
  recommended_budget_usd DECIMAL(10,2),
  recommended_audience JSONB,
  pick_reasoning TEXT,
  status TEXT DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'promoted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ad_picks_brand ON gv_ad_content_picks(brand_id);
CREATE INDEX idx_ad_picks_late ON gv_ad_content_picks(late_post_id);

-- 9. Ad ML learned patterns
CREATE TABLE IF NOT EXISTS gv_ad_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_key TEXT NOT NULL,
  pattern_value JSONB NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.50,
  sample_size INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(brand_id, pattern_type, pattern_key)
);

CREATE INDEX idx_ad_patterns_brand ON gv_ad_learned_patterns(brand_id);

-- 10. Ad strategy directives (14D cycle)
CREATE TABLE IF NOT EXISTS gv_ad_strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  directive_id TEXT UNIQUE,
  period_start DATE,
  period_end DATE,
  strategy_summary TEXT,
  platform_strategies JSONB DEFAULT '{}',
  budget_framework JSONB DEFAULT '{}',
  audience_insights JSONB DEFAULT '{}',
  creative_direction JSONB DEFAULT '{}',
  competitor_analysis JSONB DEFAULT '{}',
  kpi_targets JSONB DEFAULT '{}',
  ai_model TEXT,
  ai_cost_usd DECIMAL(8,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Ad loop execution log
CREATE TABLE IF NOT EXISTS gv_ad_loop_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  cycle_id TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'skipped')),
  input_summary JSONB DEFAULT '{}',
  output_summary JSONB DEFAULT '{}',
  duration_ms INTEGER,
  cost_usd DECIMAL(8,6) DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ad_loop_log_brand ON gv_ad_loop_log(brand_id);
CREATE INDEX idx_ad_loop_log_function ON gv_ad_loop_log(function_name);
CREATE INDEX idx_ad_loop_log_started ON gv_ad_loop_log(started_at DESC);

-- 12. Tier-based ad quotas
CREATE TABLE IF NOT EXISTS gv_ad_quotas (
  tier TEXT PRIMARY KEY,
  max_campaigns INTEGER NOT NULL,
  max_daily_budget_usd DECIMAL(10,2) NOT NULL,
  max_monthly_budget_usd DECIMAL(10,2) NOT NULL,
  platforms_allowed TEXT[] NOT NULL,
  auto_execute BOOLEAN DEFAULT false,
  monitor_frequency_hours INTEGER NOT NULL,
  research_depth TEXT NOT NULL,
  picks_per_cycle INTEGER NOT NULL DEFAULT 2
);

INSERT INTO gv_ad_quotas (tier, max_campaigns, max_daily_budget_usd, max_monthly_budget_usd, platforms_allowed, auto_execute, monitor_frequency_hours, research_depth, picks_per_cycle) VALUES
  ('go',         2,   10,    200,  ARRAY['meta'],                         false, 24, 'basic', 2),
  ('pro',        5,   50,   1000,  ARRAY['meta','tiktok'],                false, 12, 'deep',  5),
  ('enterprise', 20, 500,  10000,  ARRAY['meta','tiktok','google'],       true,   6, 'deep', 10)
ON CONFLICT (tier) DO NOTHING;

-- 13. Cross-reference view: organic performance ↔ ad performance
CREATE OR REPLACE VIEW gv_ad_organic_cross_ref AS
SELECT
  spl.brand_id,
  spl.late_post_id,
  spl.platform,
  spl.post_url,
  spl.content_preview,
  spl.created_at AS published_at,
  sa.overall_score AS organic_gv_score,
  sa.factor_scores AS organic_factors,
  acp.ad_potential_score,
  acp.status AS ad_pick_status,
  acp.recommended_objective,
  acp.recommended_budget_usd,
  ac.id AS campaign_id,
  ac.name AS campaign_name,
  ac.status AS campaign_status,
  ac.daily_budget_usd AS campaign_daily_budget,
  ap.impressions AS ad_impressions,
  ap.clicks AS ad_clicks,
  ap.spend_usd AS ad_spend,
  ap.ctr AS ad_ctr,
  ap.roas AS ad_roas,
  ap.conversions AS ad_conversions
FROM social_publish_log spl
LEFT JOIN gv_social_analytics sa
  ON sa.brand_id = spl.brand_id AND sa.late_post_id = spl.late_post_id
LEFT JOIN gv_ad_content_picks acp
  ON acp.brand_id = spl.brand_id AND acp.late_post_id = spl.late_post_id
LEFT JOIN gv_ad_campaigns ac
  ON ac.source_late_post_id = spl.late_post_id AND ac.brand_id = spl.brand_id
LEFT JOIN LATERAL (
  SELECT * FROM gv_ad_performance p
  WHERE p.campaign_id = ac.id AND p.entity_level = 'campaign'
  ORDER BY p.snapshot_date DESC LIMIT 1
) ap ON true;

-- RLS policies
ALTER TABLE gv_ad_platform_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_content_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_strategy ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_loop_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gv_ad_quotas ENABLE ROW LEVEL SECURITY;

-- Service role has full access (edge functions use service_role key)
-- Admin read access
CREATE POLICY "admin_read_ad_platform_keys" ON gv_ad_platform_keys FOR SELECT USING (is_admin());
CREATE POLICY "admin_all_ad_platform_keys" ON gv_ad_platform_keys FOR ALL USING (is_admin());

CREATE POLICY "admin_all_ad_campaigns" ON gv_ad_campaigns FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_sets" ON gv_ad_sets FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_creatives" ON gv_ad_creatives FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_performance" ON gv_ad_performance FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_analysis" ON gv_ad_analysis FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_budgets" ON gv_ad_budgets FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_content_picks" ON gv_ad_content_picks FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_learned_patterns" ON gv_ad_learned_patterns FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_strategy" ON gv_ad_strategy FOR ALL USING (is_admin());
CREATE POLICY "admin_all_ad_loop_log" ON gv_ad_loop_log FOR ALL USING (is_admin());
CREATE POLICY "admin_read_ad_quotas" ON gv_ad_quotas FOR SELECT USING (true);
