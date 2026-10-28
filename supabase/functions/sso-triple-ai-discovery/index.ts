// SSO Triple AI Discovery
// Stage 1: Gemini Flash Lite (fast indexing) → Stage 2: Perplexity (ranking) → Stage 3: Gemini 2.0 (deep analysis)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Creator {
  id?: string;
  name: string;
  handle: string;
  platform: string;
  follower_count: number;
  engagement_rate: number;
  impact_score: number;
  perplexity_rank?: number;
  category_id: string;
}

interface Site {
  id?: string;
  url: string;
  domain: string;
  traffic_score: number;
  authority_score: number;
  impact_score: number;
  perplexity_rank?: number;
  category_id: string;
}

serve(async (req) => {
  try {
    const { action, category_id, category_name, type } = await req.json();

    // Validate required fields
    if (!category_id || !category_name) {
      throw new Error('category_id and category_name are required');
    }

    let result;

    switch (action) {
      case 'discover_creators':
        result = await discoverCreators(category_id, category_name);
        break;
      case 'discover_sites':
        result = await discoverSites(category_id, category_name);
        break;
      case 'incremental_discovery':
        result = await incrementalDiscovery(category_id, category_name, type);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Track cost
    await trackCost(result.cost, action, category_id);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ============================================
// PRE-INGESTION STEP 1: GEMINI - INDEX POTENTIAL ACCOUNTS (~10,000)
// ============================================

async function geminiIndexPotentialAccounts(category: string): Promise<any[]> {
  const prompt = `List approximately 10,000 potential creators/influencers in "${category}" across Instagram, TikTok, and YouTube.
Include:
- Mega influencers (1M+ followers)
- Macro influencers (100K-1M followers)
- Micro influencers (10K-100K followers)
- Rising stars (5K-10K followers with high growth)

For each creator provide:
- name
- handle
- platform (instagram/tiktok/youtube)
- estimated_followers

Return as JSON array. Cast a WIDE net - we'll filter later.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16000,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  // Extract JSON from markdown code blocks if present
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('Could not extract JSON from Gemini response');
    return [];
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const items = JSON.parse(jsonText);

  console.log(`[Pre-Ingestion Step 1] Gemini indexed ${items.length} potential accounts`);
  return items;
}

// ============================================
// PRE-INGESTION STEP 2: PERPLEXITY - FILTER TO 4,000 WORTH SCRAPING
// ============================================

async function perplexityFilterAccounts(
  potentialAccounts: any[],
  category: string
): Promise<any[]> {
  // Split by platform
  const instagramAccounts = potentialAccounts.filter((a) => a.platform === 'instagram');
  const tiktokAccounts = potentialAccounts.filter((a) => a.platform === 'tiktok');
  const youtubeAccounts = potentialAccounts.filter((a) => a.platform === 'youtube');

  console.log(
    `[Pre-Ingestion Step 2] Filtering: ${instagramAccounts.length} Instagram, ${tiktokAccounts.length} TikTok, ${youtubeAccounts.length} YouTube`
  );

  const prompt = `Analyze these potential creators in "${category}" and select the MOST RELEVANT 4,000 accounts worth scraping:
- Instagram: Select 2,000 most relevant
- TikTok: Select 1,500 most relevant
- YouTube: Select 500 most relevant

Criteria for selection:
1. Relevance to "${category}" industry
2. Active posting (not abandoned accounts)
3. Real engagement (not bots)
4. Brand-friendly content
5. Potential for partnerships

Instagram accounts (${instagramAccounts.length}):
${instagramAccounts.slice(0, 100).map((a) => `@${a.handle} (${a.estimated_followers} followers)`).join(', ')}
...

TikTok accounts (${tiktokAccounts.length}):
${tiktokAccounts.slice(0, 100).map((a) => `@${a.handle} (${a.estimated_followers} followers)`).join(', ')}
...

YouTube channels (${youtubeAccounts.length}):
${youtubeAccounts.slice(0, 100).map((a) => `${a.name} (${a.estimated_followers} subscribers)`).join(', ')}
...

Return JSON array of 4,000 BEST accounts with: name, handle, platform, reason_selected`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('Could not extract JSON from Perplexity response, using fallback');
    // Fallback: take top 2000 Instagram, 1500 TikTok, 500 YouTube by follower count
    return [
      ...instagramAccounts.slice(0, 2000),
      ...tiktokAccounts.slice(0, 1500),
      ...youtubeAccounts.slice(0, 500),
    ];
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const filtered = JSON.parse(jsonText);

  console.log(`[Pre-Ingestion Step 2] Perplexity filtered to ${filtered.length} accounts`);
  return filtered;
}

// ============================================
// PRE-INGESTION STEP 3: APIFY - SCRAPE 4,000 PROFILES
// ============================================

const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY') || '';

async function apifyScrapeProfiles(filteredAccounts: any[]): Promise<any[]> {
  console.log(`[Pre-Ingestion Step 3] Apify scraping ${filteredAccounts.length} profiles`);

  const scrapedProfiles = [];

  // Separate by platform
  const instagramHandles = filteredAccounts
    .filter((a) => a.platform === 'instagram')
    .map((a) => a.handle);
  const tiktokHandles = filteredAccounts
    .filter((a) => a.platform === 'tiktok')
    .map((a) => a.handle);
  const youtubeChannels = filteredAccounts
    .filter((a) => a.platform === 'youtube')
    .map((a) => a.handle);

  console.log(
    `Scraping: ${instagramHandles.length} Instagram, ${tiktokHandles.length} TikTok, ${youtubeChannels.length} YouTube`
  );

  // Instagram scraping
  if (instagramHandles.length > 0) {
    console.log('[Apify] Scraping Instagram profiles...');
    const igResponse = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: instagramHandles,
        resultsLimit: 20, // Last 20 posts per profile
      }),
    });

    const igRun = await igResponse.json();
    // Wait for completion
    await waitForApifyRun(igRun.data.id);
    const igData = await getApifyDataset(igRun.data.defaultDatasetId);

    scrapedProfiles.push(
      ...igData.map((profile: any) => ({
        platform: 'instagram',
        handle: profile.username,
        name: profile.fullName,
        follower_count: profile.followersCount,
        engagement_rate: calculateEngagement(profile.posts),
        recent_posts: profile.posts.slice(0, 10).map((p: any) => ({
          text: p.caption,
          likes: p.likesCount,
          comments: p.commentsCount,
          date: p.timestamp,
        })),
      }))
    );
  }

  // TikTok scraping
  if (tiktokHandles.length > 0) {
    console.log('[Apify] Scraping TikTok profiles...');
    const ttResponse = await fetch(`https://api.apify.com/v2/acts/apify~tiktok-scraper/runs?token=${APIFY_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: tiktokHandles.map((h: string) => `https://www.tiktok.com/@${h}`),
        resultsLimit: 20,
      }),
    });

    const ttRun = await ttResponse.json();
    await waitForApifyRun(ttRun.data.id);
    const ttData = await getApifyDataset(ttRun.data.defaultDatasetId);

    scrapedProfiles.push(
      ...ttData.map((profile: any) => ({
        platform: 'tiktok',
        handle: profile.authorMeta.name,
        name: profile.authorMeta.nickName,
        follower_count: profile.authorMeta.fans,
        engagement_rate: calculateTikTokEngagement(profile.videos),
        recent_posts: profile.videos.slice(0, 10).map((v: any) => ({
          text: v.text,
          views: v.playCount,
          likes: v.diggCount,
          shares: v.shareCount,
        })),
      }))
    );
  }

  // YouTube scraping
  if (youtubeChannels.length > 0) {
    console.log('[Apify] Scraping YouTube channels...');
    const ytData: any[] = [];
    // The Actor takes up to 20 channels per run
    for (let i = 0; i < youtubeChannels.length; i += 20) {
      const ytResponse = await fetch(`https://api.apify.com/v2/acts/johnvc~youtube-shorts-api/runs?token=${APIFY_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: youtubeChannels.slice(i, i + 20),
          maxResultsShorts: 20,
        }),
      });

      const ytRun = await ytResponse.json();
      await waitForApifyRun(ytRun.data.id);
      ytData.push(...(await getApifyDataset(ytRun.data.defaultDatasetId)));
    }

    // One row per Short: group the rows into one entry per channel
    const ytChannels: Record<string, any> = {};
    for (const row of ytData) {
      if (!ytChannels[row.channelId]) ytChannels[row.channelId] = { ...row, videos: [] };
      ytChannels[row.channelId].videos.push(row);
    }

    scrapedProfiles.push(
      ...Object.values(ytChannels).map((channel: any) => ({
        platform: 'youtube',
        handle: channel.channelId,
        name: channel.channelName,
        follower_count: channel.numberOfSubscribers,
        engagement_rate: calculateYouTubeEngagement(channel.videos),
        recent_posts: channel.videos.slice(0, 10).map((v: any) => ({
          text: v.title,
          views: v.viewCount,
          likes: v.likes,
          comments: v.commentsCount,
        })),
      }))
    );
  }

  console.log(`[Pre-Ingestion Step 3] Apify scraped ${scrapedProfiles.length} profiles`);
  return scrapedProfiles;
}

async function waitForApifyRun(runId: string) {
  let status = 'RUNNING';
  while (status === 'RUNNING') {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
    const data = await response.json();
    status = data.data.status;
  }
}

async function getApifyDataset(datasetId: string) {
  const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`);
  const data = await response.json();
  return data;
}

function calculateEngagement(posts: any[]): number {
  if (!posts || posts.length === 0) return 0;
  const avgLikes = posts.reduce((sum, p) => sum + (p.likesCount || 0), 0) / posts.length;
  const avgComments = posts.reduce((sum, p) => sum + (p.commentsCount || 0), 0) / posts.length;
  return ((avgLikes + avgComments * 5) / 10000) * 100; // Simplified engagement rate
}

function calculateTikTokEngagement(videos: any[]): number {
  if (!videos || videos.length === 0) return 0;
  const avgDigg = videos.reduce((sum, v) => sum + (v.diggCount || 0), 0) / videos.length;
  const avgComments = videos.reduce((sum, v) => sum + (v.commentCount || 0), 0) / videos.length;
  const avgShares = videos.reduce((sum, v) => sum + (v.shareCount || 0), 0) / videos.length;
  return ((avgDigg + avgComments * 3 + avgShares * 10) / 50000) * 100;
}

function calculateYouTubeEngagement(videos: any[]): number {
  if (!videos || videos.length === 0) return 0;
  const avgLikes = videos.reduce((sum, v) => sum + (v.likeCount || v.likes || 0), 0) / videos.length;
  const avgComments = videos.reduce((sum, v) => sum + (v.commentCount || v.commentsCount || 0), 0) / videos.length;
  const avgViews = videos.reduce((sum, v) => sum + (v.viewCount || 0), 0) / videos.length;
  return ((avgLikes + avgComments * 5) / avgViews) * 100;
}

// ============================================
// PRE-INGESTION STEP 4: CLAUDE - ANALYZE 4,000 PROFILES
// ============================================

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') || '';

async function claudeAnalyzeProfiles(scrapedProfiles: any[]): Promise<any[]> {
  console.log(`[Pre-Ingestion Step 4] Claude analyzing ${scrapedProfiles.length} profiles`);

  const analyzedProfiles = [];

  // Analyze in batches of 10
  for (let i = 0; i < scrapedProfiles.length; i += 10) {
    const batch = scrapedProfiles.slice(i, i + 10);

    const prompt = `Analyze these ${batch.length} creator profiles and score each on 4 dimensions (0-100):

1. **Quality Score** (0-100):
   - Content quality and consistency
   - Production value
   - Professional presentation

2. **Originality Score** (0-100):
   - Unique voice vs copycat
   - Original content vs reposts
   - Creative approach

3. **Reach Score** (0-100):
   - Follower count
   - Growth rate
   - Audience size

4. **Engagement Score** (0-100):
   - Likes, comments, shares relative to followers
   - Community interaction
   - Viral potential

Profiles:
${batch.map((p, idx) => `${idx + 1}. @${p.handle} on ${p.platform}
   Followers: ${p.follower_count}
   Engagement Rate: ${p.engagement_rate.toFixed(2)}%
   Recent Posts: ${p.recent_posts.slice(0, 3).map((post: any) => post.text || 'video').join(' | ')}`).join('\n\n')}

Return JSON array with: handle, platform, quality_score, originality_score, reach_score, engagement_score`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      const scores = JSON.parse(jsonText);
      analyzedProfiles.push(...scores);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`[Pre-Ingestion Step 4] Claude analyzed ${analyzedProfiles.length} profiles`);
  return analyzedProfiles;
}

// ============================================
// PRE-INGESTION STEP 5: CLAUDE - RANK TO TOP 450
// ============================================

async function claudeRankProfiles(analyzedProfiles: any[]): Promise<any[]> {
  console.log(`[Pre-Ingestion Step 5] Claude ranking ${analyzedProfiles.length} profiles to top 450`);

  // Calculate combined score for each profile
  const profilesWithScore = analyzedProfiles.map((p) => ({
    ...p,
    combined_score:
      (p.quality_score * 0.25 +
      p.originality_score * 0.20 +
      p.reach_score * 0.30 +
      p.engagement_score * 0.25),
  }));

  // Sort by combined score
  profilesWithScore.sort((a, b) => b.combined_score - a.combined_score);

  // Get top 450 (Instagram 200, TikTok 200, YouTube 50)
  const instagramTop = profilesWithScore.filter((p) => p.platform === 'instagram').slice(0, 200);
  const tiktokTop = profilesWithScore.filter((p) => p.platform === 'tiktok').slice(0, 200);
  const youtubeTop = profilesWithScore.filter((p) => p.platform === 'youtube').slice(0, 50);

  const top450 = [...instagramTop, ...tiktokTop, ...youtubeTop];

  console.log(`[Pre-Ingestion Step 5] Final ranking: ${top450.length} creators`);
  console.log(`  - Instagram: ${instagramTop.length}`);
  console.log(`  - TikTok: ${tiktokTop.length}`);
  console.log(`  - YouTube: ${youtubeTop.length}`);

  return top450;
}

// ============================================
// STAGE 2: PERPLEXITY - RANKING & SCORING (OLD - KEPT FOR SITES)
// ============================================

async function perplexityRankAndScore(
  items: any[],
  category: string,
  type: 'creators' | 'sites'
): Promise<any[]> {
  const itemList =
    type === 'creators'
      ? items.map((c) => `${c.name} (@${c.handle}) on ${c.platform}`).join(', ')
      : items.map((s) => s.domain).join(', ');

  const prompt =
    type === 'creators'
      ? `Analyze and rank these ${items.length} creators in "${category}" by their actual impact and influence:
${itemList}

For each creator, provide:
1. Impact score (0-100) based on:
   - Reach (follower count)
   - Engagement quality
   - Industry authority
   - Content quality
   - Influence on purchasing decisions

2. Visibility score (0-100) - how often they appear in industry discussions

Return JSON array with: handle, impact_score, visibility_score, rank (1 to ${items.length})`
      : `Analyze and rank these ${items.length} websites in "${category}" by their actual authority and traffic:
${itemList}

For each site, provide:
1. Authority score (0-100) - domain authority, backlink quality
2. Traffic score (0-100) - estimated monthly traffic
3. Impact score (0-100) - overall influence in the niche

Return JSON array with: domain, authority_score, traffic_score, impact_score, rank (1 to ${items.length})`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('Could not extract JSON from Perplexity response');
    return items.map((item, index) => ({
      ...item,
      impact_score: 50,
      visibility_score: 50,
      perplexity_rank: index + 1,
    }));
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const ranked = JSON.parse(jsonText);

  console.log(`[Perplexity] Ranked ${ranked.length} ${type}`);
  return ranked;
}

// ============================================
// STAGE 3: GEMINI 2.0 - DEEP ANALYSIS (TOP 100)
// ============================================

async function geminiDeepAnalysis(
  topItems: any[],
  category: string,
  type: 'creators' | 'sites'
): Promise<any[]> {
  const itemList =
    type === 'creators'
      ? topItems.map((c, i) => `${i + 1}. ${c.name} (@${c.handle})`).join('\n')
      : topItems.map((s, i) => `${i + 1}. ${s.domain}`).join('\n');

  const prompt =
    type === 'creators'
      ? `Deep analysis of top 100 creators in "${category}":
${itemList}

For EACH creator, provide detailed analysis:
1. Content themes (what they talk about)
2. Audience demographics (who follows them)
3. Engagement patterns (when/how they engage)
4. Brand partnerships (what brands they work with)
5. Revenue potential (how likely to convert audience)
6. Key topics they cover
7. Sentiment (positive/neutral/negative toward brands)

Return JSON array with: handle, content_themes, audience_demo, engagement_pattern, brand_partnerships, revenue_potential, key_topics, sentiment`
      : `Deep analysis of top 100 sites in "${category}":
${itemList}

For EACH site, provide detailed analysis:
1. Primary content types (articles, reviews, tutorials, etc.)
2. Target audience
3. Backlink opportunities (do they accept guest posts, sponsored content?)
4. Citation frequency (how often they cite brands/products)
5. Advertising options
6. Editorial guidelines
7. Domain metrics (DR, traffic, keywords)

Return JSON array with: domain, content_types, target_audience, backlink_opportunities, citation_frequency, advertising_options, editorial_guidelines, domain_metrics`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8000,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('Could not extract JSON from Gemini 2.0 response');
    return topItems;
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const analyzed = JSON.parse(jsonText);

  console.log(`[Gemini 2.0] Deep analysis for ${analyzed.length} ${type}`);
  return analyzed;
}

// ============================================
// DISCOVER CREATORS (FULL PIPELINE)
// ============================================

async function discoverCreators(categoryId: string, categoryName: string) {
  console.log(`[SSO] MONTH 1 Discovery for: ${categoryName}`);

  // STEP 1: Pre-Ingestion - Gemini indexing (~10,000 potential accounts)
  console.log('[Step 1] Gemini Flash Lite: Indexing ~10,000 potential accounts');
  const potentialAccounts = await geminiIndexPotentialAccounts(categoryName);
  // Cost: ~$0.0005

  // STEP 2: Perplexity research & filter to 4,000
  console.log('[Step 2] Perplexity: Researching and filtering to 4,000 accounts');
  const filteredAccounts = await perplexityFilterAccounts(potentialAccounts, categoryName);
  // Output: 4,000 accounts (Instagram 2k, TikTok 1.5k, YouTube 500)
  // Cost: ~$2.50

  // STEP 3: Apify scraping (4,000 profiles)
  console.log('[Step 3] Apify: Scraping 4,000 profiles');
  const scrapedProfiles = await apifyScrapeProfiles(filteredAccounts);
  // Cost: ~$70 (based on $14-20 per 1,000)

  // STEP 4: Claude analysis (4,000 profiles)
  console.log('[Step 4] Claude: Analyzing quality, originality, reach, engagement');
  const analyzedProfiles = await claudeAnalyzeProfiles(scrapedProfiles);
  // Cost: ~$200 (4,000 × $0.05)

  // STEP 5: Claude ranking (top 450)
  console.log('[Step 5] Claude: Ranking to find top 450');
  const rankedProfiles = await claudeRankProfiles(analyzedProfiles);
  // Output: Top 200 Instagram, 200 TikTok, 50 YouTube
  // Cost: ~$0.10

  // STEP 6: Save to database
  const creatorsToSave: Creator[] = rankedProfiles.map((c, index) => ({
    name: c.name,
    handle: c.handle,
    platform: c.platform,
    follower_count: c.follower_count || 0,
    engagement_rate: c.engagement_rate || 0,
    impact_score: c.combined_score,
    perplexity_rank: index + 1,
    category_id: categoryId,
  }));

  const { data, error } = await supabase.from('gv_sso_creators').insert(creatorsToSave);

  if (error) {
    console.error('Error saving creators:', error);
    throw error;
  }

  // Calculate cost
  const costBreakdown = {
    gemini: 0.0005,
    perplexity: 2.5,
    apify: 70.0,
    claude_analysis: 200.0,
    claude_ranking: 0.1,
    total: 272.6,
  };

  return {
    success: true,
    total_indexed: potentialAccounts.length,
    filtered_for_scraping: filteredAccounts.length,
    scraped: scrapedProfiles.length,
    analyzed: analyzedProfiles.length,
    final_top_creators: rankedProfiles.length,
    saved: creatorsToSave.length,
    cost_breakdown: costBreakdown,
    cost: parseFloat(costBreakdown.total.toFixed(2)),
    message: `Discovered and saved ${creatorsToSave.length} creators for ${categoryName}`,
  };
}

// ============================================
// DISCOVER SITES (FULL PIPELINE)
// ============================================

async function discoverSites(categoryId: string, categoryName: string) {
  console.log(`[SSO] Discovering sites for category: ${categoryName}`);

  // Stage 1: Gemini Flash Lite - Fast indexing (1000 sites)
  console.log('[Stage 1] Gemini Flash Lite indexing...');
  const indexedSites = await geminiFlashLiteIndex(categoryName, 'sites');

  // Stage 2: Perplexity - Ranking and scoring
  console.log('[Stage 2] Perplexity ranking...');
  const rankedSites = await perplexityRankAndScore(indexedSites, categoryName, 'sites');

  // Sort by impact score
  rankedSites.sort((a, b) => b.impact_score - a.impact_score);

  // Stage 3: Gemini 2.0 - Deep analysis (top 100 only)
  console.log('[Stage 3] Gemini 2.0 deep analysis (top 100)...');
  const top100 = rankedSites.slice(0, 100);
  const deepAnalysis = await geminiDeepAnalysis(top100, categoryName, 'sites');

  // Merge deep analysis
  const sitesWithAnalysis = rankedSites.map((site) => {
    const analysis = deepAnalysis.find((a) => a.domain === site.domain);
    return analysis ? { ...site, ...analysis } : site;
  });

  // Save to database
  const sitesToSave: Site[] = sitesWithAnalysis.slice(0, 1000).map((s, index) => ({
    url: s.url,
    domain: s.domain,
    traffic_score: s.traffic_score || 50,
    authority_score: s.authority_score || 50,
    impact_score: s.impact_score,
    perplexity_rank: index + 1,
    category_id: categoryId,
  }));

  const { data, error } = await supabase.from('gv_sso_sites').insert(sitesToSave);

  if (error) {
    console.error('Error saving sites:', error);
    throw error;
  }

  // Calculate cost
  const cost =
    0.002 + // Gemini Flash Lite (1000 sites × $0.000002)
    0.02 * 1000 + // Perplexity ranking (1000 × $0.02)
    0.08 * 100; // Gemini 2.0 deep analysis (100 × $0.08)

  return {
    success: true,
    stage1_indexed: indexedSites.length,
    stage2_ranked: rankedSites.length,
    stage3_analyzed: deepAnalysis.length,
    saved: sitesToSave.length,
    cost: parseFloat(cost.toFixed(2)),
    message: `Discovered and saved ${sitesToSave.length} sites for ${categoryName}`,
  };
}

// ============================================
// INCREMENTAL DISCOVERY (MONTH 2+)
// ============================================

async function incrementalDiscovery(
  categoryId: string,
  categoryName: string,
  type: 'creators' | 'sites'
) {
  console.log(`[SSO] Incremental discovery for ${type} in ${categoryName}`);

  // Get baseline from previous month
  const tableName = type === 'creators' ? 'gv_sso_creators' : 'gv_sso_sites';
  const { data: baseline, error: baselineError } = await supabase
    .from(tableName)
    .select('*')
    .eq('category_id', categoryId)
    .order('impact_score', { ascending: false })
    .limit(1);

  if (baselineError || !baseline || baseline.length === 0) {
    throw new Error('No baseline found. Run full discovery first.');
  }

  const topImpactScore = baseline[0].impact_score;

  console.log(`Baseline top impact score: ${topImpactScore}`);

  // Ask Perplexity to find NEW items with better scores
  const prompt =
    type === 'creators'
      ? `Find NEW rising star creators in "${categoryName}" with impact score > ${topImpactScore}.
These must be creators NOT in the existing top 500 list.
Look for:
- Emerging influencers with high growth
- Niche experts gaining traction
- New voices with engaged audiences

Provide: name, handle, platform, estimated_impact_score (must be > ${topImpactScore})`
      : `Find NEW high-authority websites in "${categoryName}" with impact score > ${topImpactScore}.
These must be sites NOT in the existing top 1000 list.
Look for:
- New publications launched recently
- Rising blogs with quality content
- Undiscovered gems with strong backlinks

Provide: domain, url, estimated_impact_score (must be > ${topImpactScore})`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  // Extract new items
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch || jsonMatch.length === 0) {
    return {
      success: true,
      new_items: 0,
      cost: 0.05,
      message: 'No new items found with better scores than baseline',
    };
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const newItems = JSON.parse(jsonText);

  console.log(`Found ${newItems.length} new ${type} with better scores`);

  // Remove bottom N items to make room
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq('category_id', categoryId)
    .order('impact_score', { ascending: true })
    .limit(newItems.length);

  if (deleteError) {
    console.error('Error removing bottom items:', deleteError);
  }

  // Insert new items
  const itemsToSave =
    type === 'creators'
      ? newItems.map((item: any) => ({
          name: item.name,
          handle: item.handle,
          platform: item.platform,
          follower_count: 0,
          engagement_rate: 0,
          impact_score: item.estimated_impact_score,
          perplexity_rank: 0, // Will be re-ranked
          category_id: categoryId,
        }))
      : newItems.map((item: any) => ({
          url: item.url,
          domain: item.domain,
          traffic_score: 50,
          authority_score: 50,
          impact_score: item.estimated_impact_score,
          perplexity_rank: 0,
          category_id: categoryId,
        }));

  const { error: insertError } = await supabase.from(tableName).insert(itemsToSave);

  if (insertError) {
    console.error('Error inserting new items:', insertError);
    throw insertError;
  }

  // Re-rank all items
  const { error: updateError } = await supabase.rpc('rerank_sso_items', {
    p_category_id: categoryId,
    p_table_name: tableName,
  });

  const cost = 0.05; // Perplexity incremental discovery

  return {
    success: true,
    new_items: newItems.length,
    removed_items: newItems.length,
    cost: parseFloat(cost.toFixed(2)),
    message: `Added ${newItems.length} new ${type} with impact > ${topImpactScore}`,
  };
}

// ============================================
// TRACK COST
// ============================================

async function trackCost(cost: number, action: string, categoryId: string) {
  await supabase.from('gv_cost_tracking').insert({
    category_id: categoryId,
    feature: 'social_search_discovery',
    action: action,
    cost: cost,
    created_at: new Date().toISOString(),
  });
}
