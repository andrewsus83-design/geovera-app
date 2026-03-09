// SSO STEP 3: Perplexity Deep Analysis
// Analyzes ingested data from Step 2 (Claude + Apify + Gemini)
// Deep research: topics, keywords, opportunities, competitors
// Output: Ranked insights 1-N with actionable strategies

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  getBrandContext,
  buildBrandContextBlock,
  buildBrandSignature,
  buildChannelGoals,
} from '../_shared/brandContext.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    const { action, category_id, brand_id } = await req.json();

    let result;

    switch (action) {
      case 'analyze_category':
        result = await analyzeCategoryInsights(category_id);
        break;
      case 'analyze_brand_opportunities':
        result = await analyzeBrandOpportunities(brand_id, category_id);
        break;
      case 'rank_creators_for_brand':
        result = await rankCreatorsForBrand(brand_id, category_id);
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
// STEP 3.1: ANALYZE CATEGORY INSIGHTS
// Deep research on aggregated data from all creators
// ============================================

async function analyzeCategoryInsights(categoryId: string) {
  console.log(`[Step 3.1] Analyzing category insights for: ${categoryId}`);

  // Get all creator insights from Step 2
  const { data: creators, error: creatorsError } = await supabase
    .from('gv_sso_creators')
    .select('*, gv_sso_creator_insights(*)')
    .eq('category_id', categoryId)
    .lte('perplexity_rank', 100); // Top 100 only (have reverse engineering data)

  if (creatorsError || !creators) {
    throw new Error(`Failed to fetch creators: ${creatorsError?.message}`);
  }

  console.log(`Found ${creators.length} creators with insights`);

  // Aggregate all keywords, topics, themes
  const allKeywords: string[] = [];
  const allTopics: string[] = [];
  const allThemes: string[] = [];
  const allQAPairs: any[] = [];

  creators.forEach((creator) => {
    if (creator.gv_sso_creator_insights && creator.gv_sso_creator_insights.length > 0) {
      const insights = creator.gv_sso_creator_insights[0];
      allKeywords.push(...(insights.keywords || []));
      allTopics.push(...(insights.topics || []));
      allThemes.push(...(insights.content_themes || []));
      allQAPairs.push(...(insights.qa_pairs || []));
    }
  });

  console.log(`Aggregated:`);
  console.log(`  - ${allKeywords.length} keywords`);
  console.log(`  - ${allTopics.length} topics`);
  console.log(`  - ${allThemes.length} themes`);
  console.log(`  - ${allQAPairs.length} QA pairs`);

  // Perplexity: Deep research on aggregated data
  const analysisPrompt = `I have aggregated data from ${creators.length} top creators in this category:

**Keywords** (${allKeywords.length} total):
${allKeywords.slice(0, 200).join(', ')}

**Topics** (${allTopics.length} total):
${allTopics.slice(0, 100).join(', ')}

**Content Themes** (${allThemes.length} total):
${allThemes.slice(0, 50).join(', ')}

YOUR TASK: Conduct deep research and provide comprehensive analysis:

1. **TRENDING TOPICS** (Rank 1-50):
   - What topics are most frequently covered?
   - What topics are trending UP vs DOWN?
   - What emerging topics should brands watch?
   - Rank by frequency + trend velocity

2. **KEYWORD OPPORTUNITIES** (Rank 1-100):
   - What keywords have high search volume + low competition?
   - What long-tail keywords are underutilized?
   - What keywords indicate purchase intent?
   - Rank by opportunity score

3. **COMPETITIVE LANDSCAPE**:
   - What brands are dominating this space?
   - What gaps exist in brand coverage?
   - What competitor strategies are working?
   - Who are the top 20 competing brands?

4. **CONTENT STRATEGIES** (Ranked):
   - What content formats drive highest engagement?
   - What posting schedules work best?
   - What hooks/angles are most effective?
   - Rank strategies by effectiveness

5. **PARTNERSHIP OPPORTUNITIES** (Rank 1-30):
   - What collaboration types are trending?
   - What creator tiers offer best ROI?
   - What campaign types are most successful?
   - Rank opportunities by potential ROI

Return comprehensive JSON with rankings and actionable insights.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  let analysis;

  if (jsonMatch) {
    analysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } else {
    console.warn('Could not extract JSON, using text response');
    analysis = { raw_text: text };
  }

  // Save category analysis
  await supabase.from('gv_sso_category_analysis').upsert({
    category_id: categoryId,
    trending_topics: analysis.trending_topics || [],
    keyword_opportunities: analysis.keyword_opportunities || [],
    competitive_landscape: analysis.competitive_landscape || {},
    content_strategies: analysis.content_strategies || [],
    partnership_opportunities: analysis.partnership_opportunities || [],
    analysis_date: new Date().toISOString(),
  });

  console.log(`[Step 3.1] Category analysis completed and saved`);

  return {
    success: true,
    category_id: categoryId,
    creators_analyzed: creators.length,
    analysis: analysis,
    cost: 0.05, // Perplexity API call
    message: 'Category analysis completed',
  };
}

// ============================================
// STEP 3.2: ANALYZE BRAND OPPORTUNITIES
// Deep research for specific brand in this category
// ============================================

async function analyzeBrandOpportunities(brandId: string, categoryId: string) {
  console.log(`[Step 3.2] Analyzing opportunities for brand: ${brandId}`);

  // Get full brand context (DNA, voice, chronicle, connections)
  const ctx = await getBrandContext(supabase, brandId);
  const brand = ctx.brand;

  // Get category analysis (from Step 3.1)
  const { data: categoryAnalysis, error: analysisError } = await supabase
    .from('gv_sso_category_analysis')
    .select('*')
    .eq('category_id', categoryId)
    .order('analysis_date', { ascending: false })
    .limit(1)
    .single();

  if (analysisError || !categoryAnalysis) {
    console.warn('No category analysis found, running it first');
    await analyzeCategoryInsights(categoryId);
  }

  // Get top creators in category
  const { data: creators, error: creatorsError } = await supabase
    .from('gv_sso_creators')
    .select('*, gv_sso_creator_insights(*)')
    .eq('category_id', categoryId)
    .lte('perplexity_rank', 100)
    .order('perplexity_rank', { ascending: true });

  if (creatorsError || !creators) {
    throw new Error(`Failed to fetch creators: ${creatorsError?.message}`);
  }

  // Perplexity: Brand-specific opportunity analysis
  const contextBlock = buildBrandContextBlock(ctx);
  const signature    = buildBrandSignature(ctx);
  const socialGoals  = buildChannelGoals(ctx, 'social');
  const brandName    = brand.brand_name;

  const opportunityPrompt = `${contextBlock}

${socialGoals}

Category: ${categoryId}

I have:
- ${creators.length} top creators in this category
- Category-wide trending topics: ${JSON.stringify(categoryAnalysis?.trending_topics?.slice(0, 20))}
- Keyword opportunities: ${JSON.stringify(categoryAnalysis?.keyword_opportunities?.slice(0, 30))}
- Competitive landscape: ${JSON.stringify(categoryAnalysis?.competitive_landscape)}

YOUR TASK: Conduct deep research specific to "${brandName}" (${signature}) and provide:

1. **COMPETITOR ANALYSIS** (Rank top 10 competitors):
   - Who are direct competitors in this space?
   - What are their influencer strategies?
   - What creators are they working with?
   - What's their market positioning?
   - Rank by threat level + market share

2. **CREATOR FIT ANALYSIS** (Rank creators 1-${creators.length}):
   - Which creators best fit "${brandName}"?
   - Match based on: audience fit, content themes, brand alignment, engagement
   - Score each creator 0-100 for brand fit
   - Rank by fit score

3. **CONTENT OPPORTUNITIES** (Rank 1-50):
   - What content angles should "${brandName}" pursue?
   - What narratives resonate with target audience?
   - What trending topics align with brand values?
   - Rank by relevance + engagement potential

4. **PARTNERSHIP STRATEGIES** (Rank 1-20):
   - What collaboration types work best for this brand?
   - Sponsored posts vs long-term partnerships?
   - Micro vs macro influencers?
   - Campaign formats and budgets?
   - Rank by ROI potential

5. **KEYWORD STRATEGY** (Rank 1-100):
   - What keywords should "${brandName}" target?
   - SEO keywords for brand discovery
   - Social hashtags for visibility
   - Search queries potential customers use
   - Rank by search volume + relevance

6. **MARKET GAPS** (Prioritized list):
   - What opportunities are competitors missing?
   - What underserved audiences exist?
   - What content gaps can "${brandName}" fill?
   - What differentiation strategies are available?

Return comprehensive JSON with all rankings and actionable strategies.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: opportunityPrompt }],
      temperature: 0.3,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  // Extract JSON
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
  let opportunities;

  if (jsonMatch) {
    opportunities = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } else {
    opportunities = { raw_text: text };
  }

  // Save brand opportunities
  await supabase.from('gv_sso_brand_opportunities').upsert({
    brand_id: brandId,
    category_id: categoryId,
    competitor_analysis: opportunities.competitor_analysis || [],
    creator_fit_scores: opportunities.creator_fit_analysis || [],
    content_opportunities: opportunities.content_opportunities || [],
    partnership_strategies: opportunities.partnership_strategies || [],
    keyword_strategy: opportunities.keyword_strategy || [],
    market_gaps: opportunities.market_gaps || [],
    analysis_date: new Date().toISOString(),
  });

  console.log(`[Step 3.2] Brand opportunities analyzed and saved`);

  return {
    success: true,
    brand_id: brandId,
    brand_name: brand.brand_name,
    opportunities: opportunities,
    cost: 0.05, // Perplexity API call
    message: `Opportunities analyzed for ${brand.brand_name}`,
  };
}

// ============================================
// STEP 3.3: RANK CREATORS FOR BRAND
// Final ranking based on Perplexity analysis + Claude scores
// ============================================

async function rankCreatorsForBrand(brandId: string, categoryId: string) {
  console.log(`[Step 3.3] Ranking creators for brand: ${brandId}`);

  // Get brand opportunities (from Step 3.2)
  const { data: brandOpportunities, error: oppError } = await supabase
    .from('gv_sso_brand_opportunities')
    .select('*')
    .eq('brand_id', brandId)
    .eq('category_id', categoryId)
    .order('analysis_date', { ascending: false })
    .limit(1)
    .single();

  if (oppError || !brandOpportunities) {
    console.warn('No brand opportunities found, analyzing first');
    await analyzeBrandOpportunities(brandId, categoryId);
  }

  // Get all creators with their scores
  const { data: creators, error: creatorsError } = await supabase
    .from('gv_sso_creators')
    .select('*')
    .eq('category_id', categoryId)
    .lte('perplexity_rank', 450);

  if (creatorsError || !creators) {
    throw new Error(`Failed to fetch creators: ${creatorsError?.message}`);
  }

  // Combine scores:
  // - Claude impact_score (from Month 1)
  // - Perplexity fit_score (from Step 3.2)
  // - Engagement metrics (from Step 2)

  const rankedCreators = creators.map((creator) => {
    // Get Perplexity fit score for this brand
    const fitData = brandOpportunities?.creator_fit_scores?.find(
      (fit: any) => fit.creator_handle === creator.handle || fit.creator_id === creator.id
    );

    const fitScore = fitData?.fit_score || 50; // Default if not found

    // Combined scoring algorithm
    const combinedScore =
      creator.impact_score * 0.40 + // Claude quality/originality/reach/engagement (40%)
      fitScore * 0.40 + // Perplexity brand fit (40%)
      (creator.engagement_rate || 0) * 0.20; // Real engagement rate from Apify (20%)

    return {
      ...creator,
      brand_fit_score: fitScore,
      combined_score: combinedScore,
      rank_reason: fitData?.reason || 'No specific fit analysis available',
    };
  });

  // Sort by combined score
  rankedCreators.sort((a, b) => b.combined_score - a.combined_score);

  // Assign final ranks
  rankedCreators.forEach((creator, index) => {
    creator.brand_rank = index + 1;
  });

  // Save brand-specific rankings
  for (const creator of rankedCreators) {
    await supabase.from('gv_brand_creator_rankings').upsert({
      brand_id: brandId,
      creator_id: creator.id,
      combined_score: creator.combined_score,
      brand_fit_score: creator.brand_fit_score,
      brand_rank: creator.brand_rank,
      rank_reason: creator.rank_reason,
      ranked_at: new Date().toISOString(),
    });
  }

  console.log(`[Step 3.3] Ranked ${rankedCreators.length} creators for brand`);

  return {
    success: true,
    brand_id: brandId,
    total_creators: rankedCreators.length,
    top_10: rankedCreators.slice(0, 10).map((c) => ({
      rank: c.brand_rank,
      name: c.name,
      handle: c.handle,
      platform: c.platform,
      combined_score: c.combined_score.toFixed(2),
      brand_fit: c.brand_fit_score,
      impact: c.impact_score,
      engagement: c.engagement_rate,
      reason: c.rank_reason,
    })),
    cost: 0, // No API calls, just computation
    message: `Creators ranked for brand`,
  };
}
