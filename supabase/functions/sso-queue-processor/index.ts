// SSO Queue Processor - STEP 2 (Month 2+ Monitoring)
// Every 3D: Apify scrape top 10 creators per platform
// Every 7D: Apify scrape rank 11-100 creators
// Gemini: Reverse engineering to generate hundreds/thousands of QA, keywords, topics

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    const { action, category_id, batch_size = 100 } = await req.json();

    let result;

    switch (action) {
      case 'process_creators':
        result = await processCreators(category_id, batch_size);
        break;
      case 'process_sites':
        result = await processSites(category_id, batch_size);
        break;
      case 'process_mentions':
        result = await processMentions(category_id);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

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
// PROCESS CREATORS (SMART QUEUE)
// ============================================

async function processCreators(categoryId: string, batchSize: number) {
  console.log(`[SSO Queue] Processing creators for category: ${categoryId}`);

  // Get creators that need updates based on priority
  const { data: queue, error: queueError } = await supabase
    .from('gv_sso_creators')
    .select('*')
    .eq('category_id', categoryId)
    .or(
      `queue_priority.eq.platinum,queue_priority.eq.gold,queue_priority.eq.silver,queue_priority.eq.bronze`
    )
    .order('last_checked', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (queueError || !queue) {
    throw new Error(`Failed to fetch creator queue: ${queueError?.message}`);
  }

  console.log(`Found ${queue.length} creators to process`);

  const results = {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    total_processed: 0,
    total_cost: 0,
  };

  // Process each creator
  for (const creator of queue) {
    const shouldUpdate = await shouldUpdateCreator(creator);

    if (!shouldUpdate) {
      console.log(`[Skip] ${creator.name} - not due for update yet`);
      continue;
    }

    // Check for new posts/activity
    const activity = await checkCreatorActivity(creator);

    // Update cache
    await updateCreatorCache(creator.id, activity);

    // Track metrics
    results[creator.queue_priority as keyof typeof results]++;
    results.total_processed++;
    results.total_cost += 0.01; // Gemini Flash Lite check
  }

  // Track cost
  await trackCost(results.total_cost, 'process_creators', categoryId);

  return {
    success: true,
    ...results,
    message: `Processed ${results.total_processed} creators`,
  };
}

// ============================================
// PROCESS SITES (SMART QUEUE)
// ============================================

async function processSites(categoryId: string, batchSize: number) {
  console.log(`[SSO Queue] Processing sites for category: ${categoryId}`);

  const { data: queue, error: queueError } = await supabase
    .from('gv_sso_sites')
    .select('*')
    .eq('category_id', categoryId)
    .order('last_checked', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (queueError || !queue) {
    throw new Error(`Failed to fetch site queue: ${queueError?.message}`);
  }

  console.log(`Found ${queue.length} sites to process`);

  const results = {
    updated: 0,
    skipped: 0,
    total_cost: 0,
  };

  for (const site of queue) {
    const shouldUpdate = await shouldUpdateSite(site);

    if (!shouldUpdate) {
      results.skipped++;
      continue;
    }

    // Check for new content
    const content = await checkSiteContent(site);

    // Update cache
    await updateSiteCache(site.id, content);

    results.updated++;
    results.total_cost += 0.01;
  }

  await trackCost(results.total_cost, 'process_sites', categoryId);

  return {
    success: true,
    ...results,
    message: `Processed ${results.updated} sites`,
  };
}

// ============================================
// PROCESS MENTIONS (DAILY)
// ============================================

async function processMentions(categoryId: string) {
  console.log(`[SSO Queue] Processing mentions for category: ${categoryId}`);

  // Get all brands in this category
  const { data: brands, error: brandsError } = await supabase
    .from('gv_brands')
    .select('id, name, category_id')
    .eq('category_id', categoryId);

  if (brandsError || !brands) {
    throw new Error(`Failed to fetch brands: ${brandsError?.message}`);
  }

  let totalMentions = 0;
  let totalCost = 0;

  // For each brand, check mentions across creators and sites
  for (const brand of brands) {
    // Get brand's allocated creators (top N based on tier)
    const { data: creators } = await supabase
      .from('gv_brand_creator_allocation')
      .select('creator_id, gv_sso_creators(*)')
      .eq('brand_id', brand.id)
      .limit(100); // Partner tier max

    if (!creators) continue;

    // Check each creator for mentions
    for (const allocation of creators) {
      const creator = allocation.gv_sso_creators;

      // Check if creator mentioned the brand recently
      const mentioned = await checkForMention(creator, brand.name);

      if (mentioned) {
        // Save mention
        await saveMention({
          brand_id: brand.id,
          creator_id: creator.id,
          platform: creator.platform,
          mention_text: mentioned.text,
          sentiment: mentioned.sentiment,
          reach: creator.follower_count,
          engagement: mentioned.engagement,
        });

        totalMentions++;
      }

      totalCost += 0.02; // Check cost
    }
  }

  await trackCost(totalCost, 'process_mentions', categoryId);

  return {
    success: true,
    brands_checked: brands.length,
    mentions_found: totalMentions,
    cost: totalCost,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function shouldUpdateCreator(creator: any): Promise<boolean> {
  const now = new Date();
  const lastChecked = creator.last_checked ? new Date(creator.last_checked) : null;

  if (!lastChecked) return true; // Never checked

  const hoursSinceCheck = lastChecked
    ? (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60)
    : 999;

  // STEP 2 REVISED: Rank-based update windows with Apify scraping
  // Top 10 per platform: Every 3D with Apify + Gemini reverse engineering
  // Rank 11-100: Every 7D with Apify + Gemini reverse engineering
  // Rank 101+: Every 14D with Gemini light monitoring (no Apify)

  const isTop10 = creator.perplexity_rank <= 10;
  const isTop100 = creator.perplexity_rank <= 100;

  let windowHours: number;

  if (isTop10) {
    windowHours = 3 * 24; // 3 days - Apify scraping + deep analysis
  } else if (isTop100) {
    windowHours = 7 * 24; // 7 days - Apify scraping + deep analysis
  } else {
    windowHours = 14 * 24; // 14 days - Light monitoring only
  }

  return hoursSinceCheck >= windowHours;
}

async function shouldUpdateSite(site: any): Promise<boolean> {
  const now = new Date();
  const lastChecked = site.last_checked ? new Date(site.last_checked) : null;

  if (!lastChecked) return true;

  const hoursSinceCheck = lastChecked
    ? (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60)
    : 999;

  // Top 200 sites: weekly, rest: bi-weekly
  const isTopSite = site.perplexity_rank <= 200;
  const windowHours = isTopSite ? 7 * 24 : 14 * 24;

  return hoursSinceCheck >= windowHours;
}

async function checkCreatorActivity(creator: any) {
  const isTop10 = creator.perplexity_rank <= 10;
  const isTop100 = creator.perplexity_rank <= 100;

  // TOP 10: Every 3D → Gemini + Apify + Claude RE
  // RANK 11-100: Every 7D → Gemini + Apify + Claude RE
  if (isTop10 || isTop100) {
    console.log(`[STEP 2] Processing ${creator.name} (Rank ${creator.perplexity_rank})`);

    // 2A: Gemini indexing - prepare data structure
    console.log(`[2A] Gemini: Indexing ${creator.name}'s profile`);
    const indexedData = await geminiIndexCreator(creator);

    // 2B: Apify scraping - get REAL data
    console.log(`[2B] Apify: Scraping ${creator.name}'s content`);
    const scrapedData = await apifyScrapeCreator(creator);

    // 2C: Claude reverse engineering - generate high-quality QA and insights
    console.log(`[2C] Claude: Reverse engineering ${creator.name}'s strategy`);
    const insights = await claudeReverseEngineering(scrapedData, indexedData, creator);

    return {
      has_new_posts: scrapedData.recent_posts.length > 0,
      post_count: scrapedData.recent_posts.length,
      latest_post_date: scrapedData.recent_posts[0]?.date,
      engagement_rate: scrapedData.engagement_rate,
      follower_count: scrapedData.follower_count,
      // From Claude reverse engineering (high quality)
      qa_generated: insights.qa_pairs,
      keywords_extracted: insights.keywords,
      search_queries: insights.search_queries,
      topics_covered: insights.topics,
      content_themes: insights.content_themes,
      strategic_insights: insights.strategic_insights,
    };
  } else {
    // Rank 101+: Light monitoring dengan Gemini saja (no Apify)
    const prompt = `Check if ${creator.name} (@${creator.handle}) on ${creator.platform} has posted any new content in the last 14 days.

Return JSON with:
- has_new_posts: boolean
- post_count: number (estimated)
- latest_post_date: string
- topics: array of topics covered`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { has_new_posts: false };
    }

    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }
}

// ============================================
// APIFY SCRAPE SINGLE CREATOR
// ============================================

async function apifyScrapeCreator(creator: any) {
  let actorId: string;
  let inputConfig: any;

  switch (creator.platform) {
    case 'instagram':
      actorId = 'apify~instagram-scraper';
      inputConfig = {
        usernames: [creator.handle],
        resultsLimit: 20,
      };
      break;
    case 'tiktok':
      actorId = 'apify~tiktok-scraper';
      inputConfig = {
        profiles: [`https://www.tiktok.com/@${creator.handle}`],
        resultsLimit: 20,
      };
      break;
    case 'youtube':
      actorId = 'johnvc~youtube-shorts-api';
      inputConfig = {
        channels: [creator.handle],
        maxResultsShorts: 20,
      };
      break;
    default:
      throw new Error(`Unknown platform: ${creator.platform}`);
  }

  // Start Apify run
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputConfig),
    }
  );

  const run = await runResponse.json();

  // Wait for completion
  await waitForApifyRun(run.data.id);

  // Get dataset
  const dataset = await getApifyDataset(run.data.defaultDatasetId);

  // Transform to standard format
  if (creator.platform === 'instagram') {
    const profile = dataset[0];
    return {
      platform: 'instagram',
      handle: profile.username,
      follower_count: profile.followersCount,
      engagement_rate: calculateEngagement(profile.posts),
      recent_posts: profile.posts.slice(0, 10).map((p: any) => ({
        text: p.caption,
        likes: p.likesCount,
        comments: p.commentsCount,
        date: p.timestamp,
        url: p.url,
      })),
    };
  } else if (creator.platform === 'tiktok') {
    const profile = dataset[0];
    return {
      platform: 'tiktok',
      handle: profile.authorMeta.name,
      follower_count: profile.authorMeta.fans,
      engagement_rate: calculateTikTokEngagement(profile.videos),
      recent_posts: profile.videos.slice(0, 10).map((v: any) => ({
        text: v.text,
        views: v.playCount,
        likes: v.diggCount,
        shares: v.shareCount,
        comments: v.commentCount,
        url: v.webVideoUrl,
      })),
    };
  } else if (creator.platform === 'youtube') {
    // One row per Short, with the channel fields repeated on every row
    const channel = dataset[0] || {};
    return {
      platform: 'youtube',
      handle: channel.channelId,
      follower_count: channel.numberOfSubscribers || creator.follower_count || 0,
      engagement_rate: calculateYouTubeEngagement(dataset),
      recent_posts: dataset.slice(0, 10).map((v: any) => ({
        text: v.title,
        description: v.text,
        views: v.viewCount,
        likes: v.likes,
        comments: v.commentsCount,
        url: v.url,
      })),
    };
  }
}

async function waitForApifyRun(runId: string) {
  let status = 'RUNNING';
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (status === 'RUNNING' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    const response = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`
    );
    const data = await response.json();
    status = data.data.status;
    attempts++;
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Apify run failed or timed out: ${status}`);
  }
}

async function getApifyDataset(datasetId: string) {
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`
  );
  const data = await response.json();
  return data;
}

function calculateEngagement(posts: any[]): number {
  if (!posts || posts.length === 0) return 0;
  const avgLikes = posts.reduce((sum, p) => sum + (p.likesCount || 0), 0) / posts.length;
  const avgComments = posts.reduce((sum, p) => sum + (p.commentsCount || 0), 0) / posts.length;
  return ((avgLikes + avgComments * 5) / 10000) * 100;
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
// STEP 2A: GEMINI - INDEXING & DATA PREPARATION
// Prepare structured data for Claude analysis
// ============================================

async function geminiIndexCreator(creator: any) {
  console.log(`[Gemini Indexing] Preparing ${creator.name} for analysis`);

  const prompt = `Index and prepare data structure for creator analysis:

Creator: ${creator.name} (@${creator.handle})
Platform: ${creator.platform}
Current Rank: ${creator.perplexity_rank}
Followers: ${creator.follower_count}

Prepare structured format for:
1. Content category analysis framework
2. Keyword extraction templates
3. Audience profiling structure
4. Engagement pattern indicators
5. Brand fit assessment criteria

Return JSON template ready for deep analysis.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2000,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }

  return {
    framework: 'standard',
    ready_for_analysis: true,
  };
}

// ============================================
// STEP 2C: CLAUDE - REVERSE ENGINEERING
// Generate high-quality QA pairs and deep insights
// ============================================

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') || '';

async function claudeReverseEngineering(scrapedData: any, indexedData: any, creator: any) {
  console.log(`[Claude Reverse Engineering] Deep analysis of ${creator.name}`);

  const postsText = scrapedData.recent_posts
    .map((p: any, idx: number) => `Post ${idx + 1}: ${p.text || p.description || 'video content'}
   Likes: ${p.likes || 0}, Comments: ${p.comments || 0}, Views: ${p.views || 0}`)
    .join('\n\n');

  const prompt = `You are an expert social media strategist conducting deep reverse engineering analysis.

CREATOR PROFILE:
Name: ${creator.name}
Handle: @${creator.handle}
Platform: ${scrapedData.platform}

Followers: ${scrapedData.follower_count.toLocaleString()}
Engagement Rate: ${scrapedData.engagement_rate.toFixed(2)}%

GEMINI-INDEXED STRUCTURE:
${JSON.stringify(indexedData, null, 2)}

REAL SCRAPED CONTENT (from Apify):
${postsText}

YOUR TASK: Conduct comprehensive reverse engineering to generate high-quality insights for brand partnerships.

1. **QA PAIRS** (Generate 100-200 detailed, insightful question-answer pairs):

   Generate questions brands and marketers would ask, with DEEP, VALUABLE answers.

   Categories (minimum per category):
   - Content Strategy (25 QA): What content types, formats, styles work best?
   - Audience Analysis (20 QA): Who follows them? Demographics, interests, behaviors?
   - Brand Fit (25 QA): What brands match? What partnerships make sense?
   - Engagement Tactics (20 QA): How do they drive interaction?
   - ROI Indicators (15 QA): Purchase intent signals, conversion potential?
   - Competitive Position (15 QA): How do they compare to similar creators?
   - Partnership Strategy (20 QA): Best collaboration approaches?

   QUALITY OVER QUANTITY - Each answer should be 2-4 sentences with specific insights.

   Example:
   Q: "What makes this creator's content engaging?"
   A: "Uses authentic storytelling with behind-the-scenes footage (40% of posts), creating relatable narratives. Strong community engagement through Q&A sessions and polls. Content style is conversational rather than polished, building trust with audience. Comments show high emotional connection and brand advocacy."

2. **KEYWORDS** (150-300 contextual keywords):

   Format: {"keyword": "sustainable fashion", "context": "mentioned in 8/10 posts", "category": "main topic"}

   Include:
   - Core topics (30-50)
   - Product categories (20-30)
   - Brand mentions (10-20)
   - Industry terms (20-30)
   - Hashtags (30-50)
   - Long-tail phrases (40-100)

3. **SEARCH QUERIES** (100-150 queries brands would use to find this creator):

   Categories:
   - Platform-specific (30): "Instagram [niche] influencer Indonesia"
   - Partnership-focused (30): "[niche] creator for brand collaboration"
   - Niche-specific (30): "authentic [niche] reviewers"
   - Comparison (20): "top [platform] creators vs"
   - Intent-based (20): "hire [niche] influencer for campaign"

4. **TOPICS** (30-50 topics with depth):

   Format: {
     "topic": "Sustainable living",
     "frequency": "high (65%)",
     "trend": "increasing",
     "engagement": "above average",
     "subtopics": ["zero waste", "ethical shopping"],
     "brand_relevance": "high for eco brands"
   }

5. **CONTENT THEMES** (15-25 detailed themes):

   Format: {
     "theme": "Product reviews",
     "percentage": "35%",
     "performance": "very high engagement",
     "best_for": "Trust-building and purchase decisions",
     "avg_engagement": "4.8%",
     "examples": ["Tech gadget reviews", "Sustainable product comparisons"]
   }

6. **STRATEGIC INSIGHTS** (10-20 high-level observations):

   Deep strategic observations about:
   - Audience purchase intent signals
   - Content style differentiators
   - Partnership potential indicators
   - Growth trajectory
   - Competitive advantages
   - Red flags or concerns

Return comprehensive JSON. Prioritize DEPTH and QUALITY.`;

  const response = await fetch('https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 16384, // Large output for comprehensive analysis
        messages: [{ role: 'user', content: prompt }],
      }),
    }
  );

  const data = await response.json();
  const text = data.content[0].text;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('Could not extract JSON from Claude reverse engineering');
    return {
      qa_pairs: [],
      keywords: [],
      search_queries: [],
      topics: [],
      content_themes: [],
      strategic_insights: [],
    };
  }

  const insights = JSON.parse(jsonMatch[1] || jsonMatch[0]);

  // Save insights to database
  await supabase.from('gv_sso_creator_insights').upsert({
    creator_id: creator.id,
    qa_pairs: insights.qa_pairs,
    keywords: insights.keywords,
    search_queries: insights.search_queries,
    topics: insights.topics,
    content_themes: insights.content_themes,
    strategic_insights: insights.strategic_insights || [],
    generated_at: new Date().toISOString(),
  });

  console.log(`[Claude Reverse Engineering] Generated HIGH-QUALITY insights:`);
  console.log(`  - ${insights.qa_pairs.length} QA pairs (detailed & insightful)`);
  console.log(`  - ${insights.keywords.length} contextual keywords`);
  console.log(`  - ${insights.search_queries.length} brand search queries`);
  console.log(`  - ${insights.topics.length} topics with depth`);
  console.log(`  - ${insights.content_themes.length} performance-analyzed themes`);
  console.log(`  - ${insights.strategic_insights?.length || 0} strategic insights`);

  return insights;
}

async function checkSiteContent(site: any) {
  const prompt = `Check if ${site.domain} has published new content in the last 7 days.

Return JSON with:
- has_new_content: boolean
- article_count: number
- topics: array
- update_frequency: string`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { has_new_content: false };
  }

  return JSON.parse(jsonMatch[1] || jsonMatch[0]);
}

async function checkForMention(creator: any, brandName: string) {
  const prompt = `Check if ${creator.name} (@${creator.handle}) on ${creator.platform} has mentioned "${brandName}" in their recent posts (last 7 days).

Return JSON with:
- mentioned: boolean
- text: string (the mention text)
- sentiment: string (positive/neutral/negative)
- engagement: number (likes + comments + shares)
- url: string (link to post)`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  return result.mentioned ? result : null;
}

async function updateCreatorCache(creatorId: string, activity: any) {
  const timestampHash = `${Date.now()}_${JSON.stringify(activity)}`;

  await supabase
    .from('gv_sso_cache')
    .upsert({
      creator_id: creatorId,
      cache_data: activity,
      timestamp_hash: timestampHash,
      last_updated: new Date().toISOString(),
    });

  // Update last_checked timestamp
  await supabase
    .from('gv_sso_creators')
    .update({ last_checked: new Date().toISOString() })
    .eq('id', creatorId);
}

async function updateSiteCache(siteId: string, content: any) {
  const timestampHash = `${Date.now()}_${JSON.stringify(content)}`;

  await supabase
    .from('gv_sso_cache')
    .upsert({
      site_id: siteId,
      cache_data: content,
      timestamp_hash: timestampHash,
      last_updated: new Date().toISOString(),
    });

  await supabase
    .from('gv_sso_sites')
    .update({ last_checked: new Date().toISOString() })
    .eq('id', siteId);
}

async function saveMention(mention: any) {
  await supabase.from('gv_sso_mentions').insert(mention);
}

async function trackCost(cost: number, action: string, categoryId: string) {
  await supabase.from('gv_cost_tracking').insert({
    category_id: categoryId,
    feature: 'social_search_queue',
    action: action,
    cost: cost,
    created_at: new Date().toISOString(),
  });
}
