-- ============================================================================
-- CMO PERSONA + ADS TASK INTEGRATION
-- Adds CMO persona to gv_ai_agents and syncs ads loop with task system
-- ============================================================================

-- 1. Insert CMO persona template (will be cloned per brand on hire)
-- The CMO has 3 sub-specialties: Meta, TikTok, Google
-- Stored as JSONB in persona_description for the agent-inference router

-- 2. Add ads-related columns to gv_tasks for task sync
ALTER TABLE gv_tasks ADD COLUMN IF NOT EXISTS ads_function TEXT;
ALTER TABLE gv_tasks ADD COLUMN IF NOT EXISTS ads_loop_log_id UUID REFERENCES gv_ad_loop_log(id);

-- 3. Create ads task generation view for 72H cycle integration
CREATE OR REPLACE VIEW gv_ads_task_candidates AS
SELECT
  b.id AS brand_id,
  b.name AS brand_name,
  b.tier,
  -- Recent picks needing approval
  (SELECT COUNT(*) FROM gv_ad_content_picks cp
   WHERE cp.brand_id = b.id AND cp.status = 'candidate') AS pending_picks,
  -- Recent budgets needing approval
  (SELECT COUNT(*) FROM gv_ad_budgets ab
   WHERE ab.brand_id = b.id AND ab.approved = false
   AND ab.period_end >= CURRENT_DATE) AS pending_budgets,
  -- Active campaigns needing monitoring
  (SELECT COUNT(*) FROM gv_ad_campaigns ac
   WHERE ac.brand_id = b.id AND ac.status = 'active') AS active_campaigns,
  -- Recent alerts count
  (SELECT COUNT(*) FROM gv_ad_analysis aa
   WHERE aa.brand_id = b.id AND aa.analysis_type = 'monitor'
   AND aa.created_at > NOW() - INTERVAL '24 hours') AS recent_alerts,
  -- Underperforming campaigns (ROAS < 1)
  (SELECT COUNT(DISTINCT ap.campaign_id) FROM gv_ad_performance ap
   WHERE ap.brand_id = b.id AND ap.roas IS NOT NULL AND ap.roas < 1.0
   AND ap.snapshot_date > CURRENT_DATE - 7) AS underperforming_campaigns,
  -- Latest strategy date
  (SELECT MAX(created_at) FROM gv_ad_strategy s
   WHERE s.brand_id = b.id) AS latest_strategy_at,
  -- Has platform keys
  (SELECT COUNT(*) FROM gv_ad_platform_keys pk
   WHERE pk.brand_id = b.id AND pk.status = 'active') AS active_platform_keys
FROM brands b
WHERE EXISTS (
  SELECT 1 FROM gv_ad_platform_keys pk
  WHERE pk.brand_id = b.id AND pk.status = 'active'
);
