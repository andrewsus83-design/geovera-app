# GeoVera Ads Management Loop System

**Version**: 1.0.0
**Date**: 2026-03-17
**Author**: GeoVera Engineering
**Status**: Production Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Edge Functions (11 + 2 Shared Modules)](#edge-functions)
4. [Database Schema (13 Tables + 2 Views)](#database-schema)
5. [CMO AI Persona](#cmo-ai-persona)
6. [God Mode Integration (14D + 72H)](#god-mode-integration)
7. [WhatsApp Interface](#whatsapp-interface)
8. [Late API + Organic Cross-Reference](#late-api--organic-cross-reference)
9. [Tier System & Quotas](#tier-system--quotas)
10. [AI Models & Cost Tracking](#ai-models--cost-tracking)
11. [Cloudflare Integration](#cloudflare-integration)
12. [Environment Variables](#environment-variables)
13. [Deployment Guide](#deployment-guide)
14. [API Reference](#api-reference)
15. [Data Flow Diagrams](#data-flow-diagrams)
16. [Monitoring & Debugging](#monitoring--debugging)
17. [Cost Estimates](#cost-estimates)
18. [Changelog — 2026-03-17](#changelog)

---

## System Overview

The GeoVera Ads Management Loop is a **self-learning advertising automation system** that manages paid campaigns across Meta (Facebook/Instagram), TikTok, and Google Ads. It operates as an autonomous loop that:

1. **Scrapes** campaign data from platform APIs daily
2. **Analyzes** performance using Claude AI
3. **Picks** high-performing organic content for promotion (via Late API)
4. **Sets budgets** using AI-driven allocation
5. **Executes** campaigns on platform APIs
6. **Monitors** for anomalies every 6-24 hours
7. **Fixes** underperforming campaigns automatically
8. **Learns** patterns via ML for continuous improvement
9. **Researches** competitors and market trends biweekly
10. **Strategizes** 14-day plans using Claude Opus

All orchestrated by a single cron entry point (`ads-loop-orchestrator`) running every 6 hours.

---

## Architecture

```
                         ads-loop-orchestrator (cron 6H)
                                    |
          +-------------------------+-------------------------+
          |              |          |          |              |
    [Data Ingestion] [Monitor]  [Content]  [Intelligence]  [Strategy]
          |              |          |          |              |
  ads-scrape-history  ads-monitor  ads-pick-content  ads-ml-learner  ads-deep-research
          |              |          |          |              |
  ads-analyze-history  ads-find-fix ads-set-budget         ads-strategy-14d
                         |          |
                    ads-execute  ads-execute
                         |
                   Platform APIs (Meta/TikTok/Google)
```

### WhatsApp Integration
```
User WA Message → WA Webhook → ads-wa-handler → Intent Detection
                                     |
            +------------------------+------------------------+
            |         |         |         |         |        |
         status   approve   report   strategy    fix      chat
            |         |         |         |         |        |
        DB query  approve   7D perf   latest    trigger   Claude
                  picks/    summary   strategy  find-fix  CMO chat
                  budget
```

### God Mode Integration
```
god-mode-14d (biweekly)
  → CMO persona directive + ads context
  → Triggers god-mode-72h

god-mode-72h (every 72H)
  → CMO persona insight generation (ODRIP scored)
  → Auto-generates ads tasks from gv_ads_task_candidates VIEW
  → Tasks: approve picks, approve budgets, fix campaigns
```

---

## Edge Functions

### 1. `ads-scrape-history` — Daily Campaign Data Ingestion
- **Trigger**: Orchestrator (daily)
- **AI Cost**: ~$0/brand
- **Flow**: Reads `gv_ad_platform_keys` → Calls Meta/TikTok/Google APIs → Upserts `gv_ad_campaigns` + inserts `gv_ad_performance` snapshots
- **Platforms**: Meta Graph API v21.0, TikTok Business API v1.3, Google Ads GAQL

### 2. `ads-analyze-history` — Daily AI Performance Analysis
- **Trigger**: Orchestrator (after scrape)
- **AI Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **AI Cost**: ~$0.05/brand
- **Flow**: Loads 14D performance → Claude analyzes winners/losers/trends → Stores in `gv_ad_analysis` (type=history)

### 3. `ads-pick-content` — Organic-to-Ad Content Selection (Late API)
- **Trigger**: Orchestrator (every 72H)
- **AI Model**: Claude Sonnet 4
- **AI Cost**: ~$0.03/brand
- **Flow**: Fetches `social_publish_log` → Pulls Late API analytics → Cross-references `gv_social_analytics.overall_score` → Composite scoring → Claude ad potential assessment → Stores in `gv_ad_content_picks`
- **Composite Formula**: 30% reach + 25% engagement + 20% GV score + 15% watch_retention + 10% CTR
- **Tier Limits**: go=2, pro=5, enterprise=10 picks/cycle

### 4. `ads-set-budget` — AI Budget Allocation
- **Trigger**: Orchestrator (every 72H, after picks)
- **AI Model**: Claude Sonnet 4
- **AI Cost**: ~$0.03/brand
- **Flow**: Loads tier limits + 30D ROAS/CPC/CPM → Claude allocates budget → Stores in `gv_ad_budgets`
- **Approval**: Auto for enterprise, WA approval for go/pro

### 5. `ads-execute` — Campaign CRUD on Platform APIs
- **Trigger**: After budget approval or orchestrator
- **AI Cost**: ~$0/brand
- **Actions**: create, update, pause, resume campaigns
- **Platforms**: Meta Campaign API, TikTok Campaign API, Google Ads mutate
- **Safety**: Validates against tier quotas before execution

### 6. `ads-monitor` — Real-Time Anomaly Detection
- **Trigger**: Orchestrator (6H/12H/24H by tier)
- **AI Cost**: ~$0/brand
- **Rules**: CTR drop >30%, CPC spike >50%, budget pacing >90%, zero impressions
- **Actions**: WA alerts, triggers `ads-find-fix` on critical

### 7. `ads-find-fix` — Diagnose & Auto-Fix Engine
- **Trigger**: Orchestrator (every 12H) + ads-monitor (critical alerts)
- **AI Model**: Claude Sonnet 4
- **AI Cost**: ~$0.04/brand
- **Flow**: Loads alerts + underperformers (ROAS < 1.0) → Claude diagnoses → Suggests fixes → Enterprise: auto-executes pauses
- **Fix Types**: pause, adjust_bid, change_audience, swap_creative, scale_up, scale_down

### 8. `ads-ml-learner` — Pattern Extraction Engine
- **Trigger**: Orchestrator (daily, pro/enterprise)
- **AI Model**: Claude Sonnet 4
- **AI Cost**: ~$0.03/brand
- **Patterns**: audience_affinity, creative_performance, time_optimization, budget_efficiency, platform_preference, organic_to_ad
- **Key Insight**: "Posts with GV score >X produce Y x better ROAS"

### 9. `ads-deep-research` — Biweekly Market Intelligence
- **Trigger**: Orchestrator (every 14D, pro/enterprise)
- **AI Models**: Perplexity sonar-pro + Claude Opus
- **AI Cost**: ~$0.22/brand
- **Flow**: 5 parallel Perplexity queries → Claude Opus synthesis → Stores in `gv_ad_analysis` (type=strategy) → Auto-triggers `ads-strategy-14d`

### 10. `ads-strategy-14d` — 14-Day Strategic Planning
- **Trigger**: ads-deep-research (after completion)
- **AI Model**: Claude Opus
- **AI Cost**: ~$0.30/brand
- **Output**: Platform strategies, budget framework, audience insights, creative direction, KPI targets, weekly action plans
- **Storage**: `gv_ad_strategy`

### 11. `ads-loop-orchestrator` — Master Coordinator
- **Trigger**: Supabase cron (every 6H)
- **AI Cost**: ~$0/brand
- **Decision Matrix**: Checks last run times + tier quotas → Triggers functions sequentially (scrape→analyze→ml) or parallel (monitor, fix)
- **Safety**: No setTimeout — all triggers are direct `fetch()` calls

### Shared Modules

#### `_shared/adsHelpers.ts`
- `callMetaAdsAPI()` — Meta Graph API v21.0 wrapper
- `callTikTokAdsAPI()` — TikTok Business API v1.3 wrapper
- `callGoogleAdsAPI()` — Google Ads GAQL searchStream wrapper
- `getAdTierQuota()` — Tier limits from `gv_ad_quotas`
- `logAdLoop()` / `updateAdLoopLog()` — Execution logging
- `sendAdWA()` — WhatsApp notifications via Fonnte
- `calcClaudeCost()` — AI cost tracking (Sonnet/Opus)
- `getLastSuccessfulRun()` / `isOlderThan()` — Scheduling helpers

#### `_shared/adPromptEngineer.ts`
- `buildAdAnalysisPrompt()` — God Mode prompt engineering for all ad content types
- Supports: history analysis, monitor alerts, fix diagnosis, strategy generation
- Includes brand DNA, voice guidelines, ML patterns in context

#### `_shared/brandContext.ts`
- `getBrandContext()` — Fetches brand profile, DNA, voice, chronicle, platform connections
- `buildBrandContextBlock()` — Structured prompt injection
- `buildChannelGoals()` — SEO/GEO/Social channel goals
- `buildBrandSignature()` — Compact brand identifier
- **Fixed**: Now correctly maps `brands.name` → `brand_name`, `brands.category` → `brand_category`
- **Fixed**: Now queries `platform_connections` (was `gv_connections`)

---

## Database Schema

### 13 Ads Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `gv_ad_platform_keys` | Meta/TikTok/Google API credentials | brand_id, platform, access_token, ad_account_id, status |
| `gv_ad_campaigns` | Unified campaigns across platforms | brand_id, platform, platform_campaign_id, name, objective, status, daily_budget_usd, source_late_post_id |
| `gv_ad_sets` | Ad sets / ad groups (level 2) | brand_id, campaign_id, platform, targeting, bid_strategy |
| `gv_ad_creatives` | Individual ads with creative details | brand_id, ad_set_id, format, headline, media_url |
| `gv_ad_performance` | Daily performance snapshots | brand_id, campaign_id, entity_level, platform, spend_usd, impressions, clicks, ctr, roas, conversions, snapshot_date |
| `gv_ad_analysis` | Claude-generated insights | brand_id, analysis_type (history/monitor/fix/strategy), findings, recommendations, score, ai_cost_usd |
| `gv_ad_budgets` | AI-allocated budget plans | brand_id, total_budget_usd, campaign_allocations, approved, period_start, period_end |
| `gv_ad_content_picks` | Organic posts selected for promotion | brand_id, late_post_id, platform, ad_potential_score, composite_score, gv_overall_score, recommended_objective, status |
| `gv_ad_learned_patterns` | ML patterns (6 types) | brand_id, pattern_type, pattern_key, pattern_value, confidence |
| `gv_ad_strategy` | 14D strategic directives | brand_id, strategy_summary, platform_strategies, budget_framework, kpi_targets, ai_cost_usd |
| `gv_ad_loop_log` | Execution log for all functions | brand_id, function_name, status, output_summary, duration_ms, cost_usd, error_message |
| `gv_ad_quotas` | Tier-based limits | tier, max_campaigns, max_daily_budget_usd, platforms_allowed, auto_execute, monitor_frequency_hours |
| `gv_tasks` (extended) | +ads_function TEXT, +ads_loop_log_id UUID | Links tasks to specific ads functions |

### 2 Views

| View | Purpose |
|------|---------|
| `gv_ads_task_candidates` | Aggregates ads state per brand for 72H task generation (pending_picks, pending_budgets, active_campaigns, underperforming_campaigns) |
| `gv_ad_organic_cross_ref` | Joins gv_social_analytics + gv_ad_content_picks + gv_ad_campaigns + gv_ad_performance for organic vs paid analysis |

---

## CMO AI Persona

The CMO (Chief Marketing Officer) is the 8th AI persona in GeoVera's God Mode system, specializing in paid advertising optimization.

### Persona Definition
- **PersonaId**: `"cmo"`
- **Icon**: `\ud83d\udce3`
- **Label**: "CMO / Ads Optimizer"
- **Platform**: Claude Sonnet 4

### Per-Platform Specialization
| Platform | Specialty |
|----------|-----------|
| **Meta** | Lookalike audiences, retargeting, creative A/B testing |
| **TikTok** | Trend-based ads, UGC content, viral campaign optimization |
| **Google** | Intent-based targeting, keyword optimization, Performance Max |

### ODRIP Scoring for Ads
- **Objective**: Ad optimization goal
- **Depth**: Data quality score (1-10)
- **Risk/Reward**: Budget risk vs ROAS potential
- **Impact**: Pillar mapping (Visibility=awareness, Discovery=traffic, Authority=conversions, Trust=retargeting)
- **Priority**: P1/P2/P3 with ML-weighted scoring

---

## God Mode Integration

### 14D Cycle (`god-mode-14d`)
- CMO added to `PersonaId` type and `PERSONA_META`
- Claude Opus evaluates CMO alongside 7 other personas
- Sets cycle frequency and QA slots for CMO
- Biweekly research includes competitor ad strategies

### 72H Cycle (`god-mode-72h`)
- CMO generates ODRIP-scored insights from ads data
- Loads 7D ad performance, recent alerts, pending picks as context
- Auto-generates 3 types of ads tasks:
  1. **Approve Picks** (P1) — when `pending_picks > 0`
  2. **Approve Budget** (P1) — when `pending_budgets > 0`
  3. **Fix Campaigns** (P2) — when `underperforming_campaigns > 0`
- Tasks integrate with existing WA task notification system

---

## WhatsApp Interface

### `ads-wa-handler` — CMO WA Command Center

| Command | Intent | Action |
|---------|--------|--------|
| `"status ads"` / `"gimana ads?"` | status | Show active campaigns, spend, alerts |
| `"OK"` / `"approve"` | approve_picks | Approve all pending content picks |
| `"OK 1,3"` | approve_picks | Approve specific picks by number |
| `"APPROVE"` | approve_budget | Approve pending budget plan |
| `"pause [name]"` | pause | Pause specific campaign |
| `"resume [name]"` | resume | Resume paused campaign |
| `"report"` / `"laporan"` | report | 7-day performance summary by platform |
| `"strategy"` / `"strategi"` | strategy | Show current 14D strategy + KPIs |
| `"fix"` / `"perbaiki"` | fix | Trigger ads-find-fix diagnostic |
| `"help"` / `"bantuan"` | help | Show available commands |
| Any other message | chat | Claude CMO persona chat with full context |

### Bilingual Support
All commands work in both English and Indonesian (Bahasa Indonesia).

---

## Late API + Organic Cross-Reference

### Content Pick Pipeline
```
social_publish_log (published posts, last 14D)
  → Late API: GET /posts/{platform_post_id}/analytics
    → reach, likes, comments, shares, saves, watch_retention, ctr
  → gv_social_analytics.overall_score (Claude GV Score)
  → Composite: 30% reach + 25% engagement + 20% GV score + 15% retention + 10% CTR
  → Claude Sonnet: ad potential assessment
  → gv_ad_content_picks (candidate → approved → promoted)
```

### Organic-to-Ad Cross-Reference VIEW
`gv_ad_organic_cross_ref` provides a single-query view of:
- Organic post metrics (reach, likes, comments, shares, GV score)
- Ad pick status (candidate/approved/promoted)
- Campaign performance (spend, ROAS, conversions)
- **organic_ad_synergy_score** = `ROAS x GV_score / 100` (derived metric)

### ML Feedback Loop (`ads-ml-learner`)
```
gv_social_analytics (organic GV score)
  <-> gv_ad_performance (ad ROAS)
  → gv_ad_learned_patterns (organic_to_ad correlation)
  → "Posts with GV score >75 produce 2.3x better ROAS"
```

---

## Tier System & Quotas

| Feature | Go | Pro | Enterprise |
|---------|-----|------|-----------|
| Max Campaigns | 2 | 5 | 20 |
| Max Daily Budget | $10 | $50 | $500 |
| Platforms | Meta only | Meta + TikTok | All (Meta/TikTok/Google) |
| Campaign Execution | Manual (WA) | Manual (WA) | Auto-execute |
| Monitor Frequency | 24H | 12H | 6H |
| Content Picks/Cycle | 2 | 5 | 10 |
| ML Learning | No | Yes | Yes |
| Deep Research (14D) | No | Yes | Yes |
| Strategy (14D) | No | Yes | Yes |
| Find & Fix | No | Yes (manual) | Yes (auto) |

---

## AI Models & Cost Tracking

| Model | Usage | Cost (per 1M tokens) |
|-------|-------|---------------------|
| Claude Opus (`claude-opus-4-20250901`) | 14D strategy, deep research synthesis | $15 input / $75 output |
| Claude Sonnet 4 (`claude-sonnet-4-20250514`) | Analysis, picks, budget, fix, CMO chat | $3 input / $15 output |
| Perplexity sonar-pro | Deep research (5 parallel queries) | ~$1 total tokens |
| CF Workers AI LLaMA 3.1 8B | Agent inference (persona chat) | Free (Workers AI free tier) |

### Cost Tracking
All AI costs are tracked in:
- `gv_ad_loop_log.cost_usd` — per function execution
- `gv_ad_analysis.ai_cost_usd` — per analysis
- `gv_ad_strategy.ai_cost_usd` — per strategy generation

---

## Cloudflare Integration

### Workers AI (Already Integrated)
- **Agent Inference**: `@cf/meta/llama-3.1-8b-instruct` for persona-based responses
- **Content Studio**: `@cf/meta/llama-3.1-8b-instruct` + `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for training
- **GEO Analyzer**: QA citation testing + RAG readiness evaluation
- **AI Gateway**: 24H caching via `CF_AI_GATEWAY_BASE`

### ML/RAG Storage (Supabase PostgreSQL)
- `gv_ad_learned_patterns` — Ad ML patterns with confidence scores
- `gv_content_training_data` — Visual training examples
- `gv_visual_style_patterns` — Extracted style patterns
- `rag_context_cache` — Pre-computed brand knowledge chunks
- `learned_patterns` — General ML patterns (non-ads)
- `ml_weights` — Persona/pillar weighting for task scoring

---

## Environment Variables

### Required for Ads System
```
SUPABASE_URL                    — Supabase project URL
SUPABASE_SERVICE_ROLE_KEY       — Service role key (server-side only)
ANTHROPIC_API_KEY               — Claude API key (Sonnet + Opus)
PERPLEXITY_API_KEY              — Perplexity sonar-pro (deep research)
FONNTE_TOKEN                    — WhatsApp API token (Fonnte)
```

### Required for Platform APIs (per brand, stored in gv_ad_platform_keys)
```
Meta:    access_token, ad_account_id
TikTok:  access_token, ad_account_id (advertiser_id)
Google:  access_token, customer_id, developer_token, refresh_token
```

### Cloudflare (Optional, for AI Gateway caching)
```
CLOUDFLARE_ACCOUNT_ID           — Cloudflare account ID
CLOUDFLARE_API_TOKEN            — Workers AI API token
CF_AI_GATEWAY_BASE              — AI Gateway base URL
```

---

## Deployment Guide

### Prerequisites
- Supabase CLI v2.75+ installed
- Supabase project: `vozjwptzutolvkvfpknk`
- All environment variables set in Supabase Dashboard > Edge Functions > Secrets

### Deploy All Functions
```bash
# Deploy all 11 ads functions + 2 god-mode functions
for fn in ads-scrape-history ads-monitor ads-analyze-history ads-pick-content \
          ads-set-budget ads-execute ads-find-fix ads-ml-learner \
          ads-deep-research ads-strategy-14d ads-loop-orchestrator \
          ads-wa-handler god-mode-72h god-mode-14d; do
  supabase functions deploy $fn --project-ref vozjwptzutolvkvfpknk --no-verify-jwt
done
```

### Set Up Cron
In Supabase Dashboard > Database > Extensions > pg_cron:
```sql
SELECT cron.schedule(
  'ads-loop-orchestrator',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://vozjwptzutolvkvfpknk.supabase.co/functions/v1/ads-loop-orchestrator',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);
```

### Initialize Tier Quotas
```sql
INSERT INTO gv_ad_quotas (tier, max_campaigns, max_daily_budget_usd, platforms_allowed, auto_execute, monitor_frequency_hours)
VALUES
  ('go', 2, 10, ARRAY['meta'], false, 24),
  ('pro', 5, 50, ARRAY['meta','tiktok'], false, 12),
  ('enterprise', 20, 500, ARRAY['meta','tiktok','google'], true, 6)
ON CONFLICT (tier) DO NOTHING;
```

---

## API Reference

### All functions accept POST with JSON body:
```json
{ "brand_id": "uuid-here" }
```

### ads-loop-orchestrator (extra params):
```json
{
  "brand_id": "uuid-here",          // optional: specific brand
  "force_run": ["ads-scrape-history"] // optional: force specific functions
}
```

### ads-wa-handler:
```json
{
  "brand_id": "uuid-here",
  "message": "status ads",
  "wa_number": "6281234567890"       // optional: send WA response
}
```

### ads-execute:
```json
{
  "brand_id": "uuid-here",
  "actions": [
    { "type": "create", "pick_id": "uuid", "budget_usd": 10, "objective": "conversions" },
    { "type": "pause", "campaign_id": "uuid" },
    { "type": "resume", "campaign_id": "uuid" }
  ]
}
```

---

## Monitoring & Debugging

### Execution Logs
```sql
-- Recent executions
SELECT function_name, status, duration_ms, cost_usd, error_message, created_at
FROM gv_ad_loop_log
WHERE brand_id = 'your-brand-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Active Campaigns
```sql
SELECT name, platform, status, daily_budget_usd, source_late_post_id
FROM gv_ad_campaigns
WHERE brand_id = 'your-brand-id' AND status = 'active';
```

### Organic vs Paid Performance
```sql
SELECT * FROM gv_ad_organic_cross_ref
WHERE brand_id = 'your-brand-id'
AND gv_score IS NOT NULL
ORDER BY organic_ad_synergy_score DESC NULLS LAST
LIMIT 20;
```

### ML Pattern Insights
```sql
SELECT pattern_type, pattern_key, pattern_value, confidence
FROM gv_ad_learned_patterns
WHERE brand_id = 'your-brand-id'
ORDER BY confidence DESC;
```

---

## Cost Estimates (Monthly Per Brand)

| Tier | AI Cost | Breakdown |
|------|---------|-----------|
| **Go** | ~$2.50/mo | Daily scrape+analyze ($1.50), 72H picks+budget ($0.60), 24H monitor ($0.40) |
| **Pro** | ~$6.50/mo | + ML learner ($0.90), find-fix ($1.20), 12H monitor ($0.80), 14D research+strategy ($1.10) |
| **Enterprise** | ~$8.00/mo | + auto-execute ($0), 6H monitor ($1.20), deeper research ($0.30) |

---

## Changelog — 2026-03-17

### New Features
- 11 Supabase Edge Functions for ads management loop
- 13 database tables + 2 views for ads data
- CMO AI Persona (8th persona) with per-platform specialization
- WhatsApp CMO command center with bilingual intent detection
- Late API organic-to-ad cross-reference pipeline
- ML pattern learning (6 pattern types)
- Biweekly deep research (Perplexity + Claude Opus)
- 14-day AI strategy generation
- Tier-based quotas (go/pro/enterprise)
- God Mode 14D + 72H integration with CMO persona
- Auto-task generation from ads system state

### Critical Bug Fixes
- `brandContext.ts`: Fixed wrong column names (`brand_name` -> `name`, `brand_category` -> `category`)
- `brandContext.ts`: Fixed wrong table name (`gv_connections` -> `platform_connections`)
- `ads-loop-orchestrator`: Replaced unreliable `setTimeout` with direct `await` calls
- `ads-wa-handler`: Added `.catch()` on `req.json()` for malformed request handling
- `god-mode-14d`: Added CMO to PersonaId type and PERSONA_META
- `god-mode-72h`: Added CMO persona + ads context loading + ads task auto-generation

### Database Migrations Applied
1. `20260317000000_ads_management_system.sql` — 13 tables + quotas
2. `20260317100000_cmo_persona_ads_tasks.sql` — gv_tasks ads columns + gv_ads_task_candidates VIEW
3. `ads_organic_cross_ref_view` — gv_ad_organic_cross_ref VIEW

### Deployed Functions (All 13)
1. ads-scrape-history
2. ads-monitor
3. ads-analyze-history
4. ads-pick-content
5. ads-ml-learner
6. ads-set-budget
7. ads-execute
8. ads-find-fix
9. ads-deep-research
10. ads-strategy-14d
11. ads-loop-orchestrator
12. ads-wa-handler
13. god-mode-72h (updated)
14. god-mode-14d (updated)
