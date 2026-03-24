import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Step1Output {
  brand_name: string;
  parent_company: string;
  official_website: string;
  social_media: {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    youtube?: string;
  };
  launch_date: string;
  category: string;
  sub_category: string;
  key_features: string[];
  target_demographic: string;
  market_positioning: string;
  competitors: string[];
  geographic_presence: string[];
  recent_news: string[];
  tagline: string;
  unique_selling_proposition: string;
}

interface Step3Output {
  brand_dna: {
    core_values: string[];
    personality_traits: string[];
    brand_voice: string;
    visual_identity: string;
  };
  competitive_analysis: {
    market_position: string;
    competitive_advantages: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  content_strategy: {
    key_themes: string[];
    content_pillars: string[];
    messaging_framework: string;
  };
  strategic_framework: {
    short_term_priorities: string[];
    long_term_vision: string;
    success_metrics: string[];
  };
}

// NEW STEP 0: Perplexity Deep Research FIRST
async function step0_perplexity_discovery(brandName: string, country: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')!;

  const countryContext = `The brand is from ${country}. Focus ONLY on ${brandName} ${country}, NOT brands from other countries.`;

  const prompt = `CRITICAL DISCOVERY TASK: ${brandName} (${country})

${countryContext}

You MUST find and verify these CRITICAL FIELDS:

**1. COMPANY IDENTITY** (3 fields):
   a) Parent Company/Manufacturer: Who makes/owns this brand?
   b) Official Website: Brand or parent company website
   c) Launch Year: When was this brand launched? (Year only)

**2. SOCIAL MEDIA ACCOUNTS** (find all available):
   a) Instagram: Official handle (e.g., @brand_official)
   b) Facebook: Official page URL or name
   c) TikTok: Official account (if exists)
   d) YouTube: Official channel (if exists)

**3. PRODUCT DETAILS** (2 fields):
   a) Product Category: Main category (Snacks, Beverages, etc.)
   b) Product Type: Specific product type

**4. HIGH-QUALITY BACKLINKS** (up to 5 authoritative sources):
   Find articles from reputable media, industry publications, press releases:
   - News sites (Kompas, Detik, CNN Indonesia, etc.)
   - Business/trade publications
   - Official company press releases
   Format: [Title] - [Source] - [URL]

**5. AUTHORITY & TRUST SIGNALS**:
   a) Google Business Profile: Find GBP listing
   b) User Reviews/Testimonials from:
      • Google Reviews (rating + sample quote)
      • E-commerce (Tokopedia, Shopee, Lazada - rating + quote)
      • Social media testimonials
   c) Trust Indicators:
      • Certifications (BPOM, Halal, ISO)
      • Awards/recognition
      • Years in business

SEARCH QUERIES TO USE:
- "${brandName} ${country} produsen"
- "${brandName} parent company"
- "${brandName} review testimoni"
- "${brandName} Google Business Profile"
- "${brandName} berita artikel"
- "${brandName} certification BPOM halal"

OUTPUT FORMAT:
=== COMPANY IDENTITY ===
Parent Company: [Name] OR "Not Found"
Website: [URL] OR "Not Found"
Launch Year: [YYYY] OR "Not Found"

=== SOCIAL MEDIA ===
Instagram: [@handle] OR "Not Found"
Facebook: [URL] OR "Not Found"
TikTok: [@handle] OR "Not Found"
YouTube: [Channel] OR "Not Found"

=== PRODUCT ===
Category: [Category]
Type: [Specific Type]

=== BACKLINKS (Authoritative Sources) ===
1. [Title] - [Source] - [URL]
2. [Title] - [Source] - [URL]
(list up to 5)

=== AUTHORITY & TRUST ===
Google Business: [URL or name] OR "Not Found"
Reviews:
  • Google: [X.X] stars ([N] reviews) - "[sample quote]"
  • E-commerce: [Platform] [X.X] stars - "[quote]"
  • Social: "[testimonial]"
Certifications: [list or "Not Found"]
Awards: [if any or "None"]
Established: [years, e.g., "Since 1980"]

ONLY include verified facts. Mark "Not Found" if unavailable.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a professional brand researcher specializing in discovering and verifying official brand information. Provide accurate, source-backed data.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Lower temperature for factual accuracy
      max_tokens: 3000 // Increased for comprehensive discovery
    })
  });

  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    console.error('Perplexity API error response:', JSON.stringify(data));
    throw new Error(`Perplexity API error: ${JSON.stringify(data.error || data)}`);
  }

  return data.choices[0].message.content;
}

async function step1_gemini(brandName: string, country: string, perplexityDiscovery?: string): Promise<Step1Output> {
  const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!;

  const countryContext = `CRITICAL CONTEXT: ${brandName} is a ${country} brand. ONLY search for information about ${brandName} ${country}, NOT any brands from other countries. Use ${country} language sources (Indonesian/Bahasa Indonesia if Indonesia), ${country} market data, and ${country} business news. Ignore any ${brandName} brands from USA, Canada, or other countries.`;

  const verifiedDataContext = perplexityDiscovery ? `\n\nVERIFIED DATA FROM PERPLEXITY RESEARCH:\n${perplexityDiscovery}\n\nUse this verified data as the foundation for indexing. DO NOT contradict this research.` : '';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Brand Indexing Request for: ${brandName}${country ? ` ${country}` : ''}

${countryContext}${verifiedDataContext}

Task: Perform comprehensive brand indexing to gather:
1. Official website and web presence (social media profiles, official channels)
2. Company ownership and parent company information
3. Launch date and market entry timeline
4. Product category and sub-category
5. Key product features and unique selling propositions
6. Target demographic and market positioning
7. Primary competitors in the same category
8. Geographic market presence
9. Recent news, announcements, or campaigns
10. Brand tagline, mission statement if available

Provide structured data output in JSON format with these exact fields:
{
  "brand_name": "${brandName}",
  "parent_company": "string",
  "official_website": "string",
  "social_media": {"instagram": "string", "tiktok": "string", "facebook": "string", "youtube": "string"},
  "launch_date": "string",
  "category": "string",
  "sub_category": "string",
  "key_features": ["string"],
  "target_demographic": "string",
  "market_positioning": "string",
  "competitors": ["string"],
  "geographic_presence": ["string"],
  "recent_news": ["string"],
  "tagline": "string",
  "unique_selling_proposition": "string"
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no explanations.`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      })
    }
  );

  const data = await response.json();

  // Check for errors in response
  if (!data.candidates || !data.candidates[0]) {
    console.error('Gemini API error response:', JSON.stringify(data));
    throw new Error(`Gemini API error: ${JSON.stringify(data.error || data)}`);
  }

  const text = data.candidates[0].content.parts[0].text;

  // Clean up markdown code blocks if present
  const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonText);
}

async function step2_perplexity(brandName: string, geminiData: Step1Output): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')!;

  const prompt = `Conduct comprehensive deep research on ${brandName} brand. Use the following indexed data as starting point:

${JSON.stringify(geminiData, null, 2)}

Perform deep research covering:

**CRITICAL: VISUAL BRAND IDENTITY ANALYSIS** (For DALL-E image generation):
1. **Brand Colors**:
   - Primary colors (with hex codes if available from logo/packaging/website)
   - Secondary colors
   - Color psychology and meaning
   - Example: "Primary: Orange #FF8C42 (warmth, nostalgia), Secondary: Cream #FFF5E1 (tradition)"

2. **Design Style & Aesthetic**:
   - Visual language: Traditional/Modern/Minimalist/Playful/Premium/Rustic
   - Design elements: Typography style, shapes, patterns used
   - Photography style in marketing: Documentary/Lifestyle/Commercial/Artistic
   - Overall vibe: Heritage/Contemporary/Luxury/Accessible
   - Example: "Traditional heritage aesthetic with warm nostalgic tones, vintage typography, rustic wood textures"

3. **Logo & Packaging Analysis** (Check website metadata & social profiles):
   - Analyze website meta tags, Open Graph images, favicons
   - Logo design elements from profile pictures (shapes, symbols, illustrations)
   - Packaging style from product photos and ads
   - Visual consistency across website, social media, ads
   - Brand guidelines if publicly available
   - Color scheme from website header/footer
   - Typography choices from website and ads
   - Example: "Logo features grandmother illustration in orange, package uses kraft paper with traditional batik patterns, website uses Orange #FF8C42 primary color throughout, Georgia serif font for headlines"

4. **Brand Photography Style** (Analyze actual social media PAID ADS):
   - **PRIORITY**: Find and analyze PAID ADS/SPONSORED posts on Instagram/Facebook/TikTok
   - Ads have "Sponsored" or "Paid partnership" labels - these have BEST professional graphics
   - Visit ${geminiData.social_media?.instagram || 'brand Instagram'} and identify ad posts
   - Extract visual patterns from ADS: subjects, angles, compositions
   - Lighting style in ads (natural/studio/warm/bright/golden hour)
   - Filter or editing style in ads (vintage/modern/saturated/muted)
   - Professional backgrounds and settings in ads
   - Props and styling elements in ads
   - Cultural elements in ads
   - Color grading and post-processing style
   - Photography quality (always professional in ads)
   - Example: "Paid ads show: Warm golden hour lighting with slight vintage Instagram filter, Indonesian family of 4 in modern kitchen, product prominently displayed at eye level, traditional wooden table with batik table runner, shot from 45-degree angle, professional food styling with fresh ingredients visible, consistent orange #FF8C42 color grading"

5. **Visual Mood & Atmosphere**:
   - Emotional tone of visuals
   - Settings and environments typically shown
   - Props and styling elements
   - Example: "Nostalgic family warmth, traditional Indonesian home settings, vintage kitchenware props"

6. **Brand Tone & Voice Analysis** (For NLP & content matching):
   - **CRITICAL**: Analyze website copy, social media captions, ad copy, and brand communications
   - Identify communication tone: Formal/Casual, Professional/Playful, Traditional/Modern, Authoritative/Friendly
   - Extract vocabulary patterns: Technical jargon, local slang, industry terms, cultural phrases
   - Sentence structure preferences: Short punchy vs long flowing, active vs passive voice, simple vs complex
   - Emotional appeals used: Nostalgia, aspiration, trust, innovation, tradition, family, heritage
   - Value messaging themes: Quality, affordability, authenticity, innovation, sustainability, community
   - Target audience communication style: How they speak to customers (empathetic/direct/inspirational)
   - Language sophistication level: Elementary/Conversational/Professional/Academic
   - Brand personality traits: Warm/Cold, Serious/Humorous, Conservative/Bold, Expert/Peer
   - Example: "Tone: Warm, nostalgic, family-oriented. Uses casual Indonesian ('kita bersama', 'keluarga kita'), short punchy sentences (avg 12 words), active voice dominates (85%), focuses on tradition and authenticity values, emotional appeals to family bonding and heritage, speaks as a peer/friend not expert, conversational sophistication level, personality: warm grandmother figure telling stories"

**STANDARD RESEARCH**:
8. **Competitive Landscape**: Detailed competitor analysis, market share, positioning strategies
9. **Brand History**: Complete timeline, key milestones, evolution, pivots
10. **Product Innovation**: R&D efforts, technology, patents, unique processes
11. **Marketing Strategy**: Campaign analysis, influencer partnerships, media presence
12. **Consumer Perception**: Reviews, sentiment analysis, brand reputation
13. **Distribution Channels**: Retail presence, e-commerce, partnerships
14. **Financial Performance**: Revenue estimates, growth trajectory, funding (if available)
15. **Crisis Management**: Past controversies, responses, reputation risks
16. **Future Outlook**: Industry trends, growth opportunities, emerging threats

**OUTPUT FORMAT**:
Start with a dedicated "VISUAL BRAND IDENTITY" section with specific details about colors (hex codes), design style, photography style, visual mood, and brand tone/voice. Then continue with standard market research.

Provide comprehensive research with specific data points, statistics, and DETAILED visual identity analysis for accurate DALL-E image generation.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a professional brand research analyst. Provide comprehensive, data-driven research reports with specific insights and statistics.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 4000
    })
  });

  const data = await response.json();

  // Check for errors in response
  if (!data.choices || !data.choices[0]) {
    console.error('Perplexity API error response:', JSON.stringify(data));
    throw new Error(`Perplexity API error: ${JSON.stringify(data.error || data)}`);
  }

  return data.choices[0].message.content;
}

async function step3_claude(brandName: string, perplexityResearch: string): Promise<Step3Output> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

  const prompt = `You are a strategic brand analyst using reverse engineering methodology to extract deep insights.

**Brand**: ${brandName}

**Deep Research Data**:
${perplexityResearch}

**Your Task**: Perform reverse engineering analysis to extract:

1. **BRAND DNA** - Core identity elements:
   - Core values (3-5 fundamental principles)
   - Personality traits (brand character)
   - Brand voice (communication style)
   - Visual identity (design language description)

2. **COMPETITIVE ANALYSIS** - Strategic positioning:
   - Current market position (where brand stands)
   - Competitive advantages (what makes them win)
   - Weaknesses (vulnerabilities)
   - Opportunities (growth potential)
   - Threats (external risks)

3. **CONTENT STRATEGY** - Communication framework:
   - Key themes (recurring topics)
   - Content pillars (3-4 main content categories)
   - Messaging framework (core message structure)

4. **STRATEGIC FRAMEWORK** - Action roadmap:
   - Short-term priorities (next 3-6 months)
   - Long-term vision (1-3 years)
   - Success metrics (KPIs to track)

**Output Format**: Provide ONLY valid JSON with this exact structure (no markdown, no explanations):
{
  "brand_dna": {
    "core_values": ["value1", "value2"],
    "personality_traits": ["trait1", "trait2"],
    "brand_voice": "description",
    "visual_identity": "description"
  },
  "competitive_analysis": {
    "market_position": "description",
    "competitive_advantages": ["advantage1", "advantage2"],
    "weaknesses": ["weakness1", "weakness2"],
    "opportunities": ["opp1", "opp2"],
    "threats": ["threat1", "threat2"]
  },
  "content_strategy": {
    "key_themes": ["theme1", "theme2"],
    "content_pillars": ["pillar1", "pillar2", "pillar3"],
    "messaging_framework": "description"
  },
  "strategic_framework": {
    "short_term_priorities": ["priority1", "priority2"],
    "long_term_vision": "description",
    "success_metrics": ["metric1", "metric2"]
  }
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  const data = await response.json();

  // Check for errors in response
  if (!data.content || !data.content[0]) {
    console.error('Claude API error response:', JSON.stringify(data));
    throw new Error(`Claude API error: ${JSON.stringify(data.error || data)}`);
  }

  const text = data.content[0].text;

  // Clean up markdown code blocks if present
  const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonText);
}

async function step4_openai(
  brandName: string,
  geminiData: Step1Output,
  perplexityResearch: string,
  claudeAnalysis: Step3Output
): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

  const prompt = `You are an elite brand storyteller creating a compelling executive intelligence report.

**Brand**: ${brandName}
**Country**: ${country || 'Indonesia'}

**Available Data**:

**Indexed Data (Gemini)**:
${JSON.stringify(geminiData, null, 2)}

**Deep Research (Perplexity)**:
${perplexityResearch}

**Strategic Analysis (Claude)**:
${JSON.stringify(claudeAnalysis, null, 2)}

**CRITICAL LANGUAGE REQUIREMENT**:
- Write storytelling sections (Brand Chronicle, Brand DNA, storytelling paragraphs) in the LOCAL LANGUAGE of ${country || 'Indonesia'}
- If Indonesia → use BAHASA INDONESIA for narrative sections
- If Thailand → use THAI for narrative sections
- Keep section headers, technical terms, and data tables in ENGLISH
- This makes the report feel authentic and locally relevant

**Your Mission**: Create a compelling 12-section brand intelligence report with actionable tasks and practical examples.

**Report Structure** (Follow this EXACT format):

# ${brandName.toUpperCase()} INTELLIGENCE REPORT
*Generated by GeoVera Intelligence Platform*

---

## 1. BRAND OVERVIEW
**Purpose**: Executive 30-second understanding with performance scores
**Length**: 250-350 words
**Tone**: Confident, clear, engaging

Format:
### Brand Overview
**${brandName}** is a [category] brand that [core mission in one sentence].

**Quick Facts:**
• **Founded**: [Year] | **Headquarters**: [Location]
• **Parent Company**: [Company Name]
• **Category**: [Category] → [Sub-Category]
• **Market**: [Geographic presence]
• **Position**: [Market positioning]

**What Makes Them Different:**
[2-3 sentence unique value proposition]

**Target Audience:**
[1-2 sentence demographic description]

---

**Digital Performance Scores** (0-100 scale):

| Metric | Score | Status | Industry Average |
|--------|-------|--------|------------------|
| 👁️ **Visibility** | [65-85] | [🟢 Strong/🟡 Growing/🔴 Weak] | [60-70] |
| 🔍 **Discovery** | [55-75] | [🟢 Strong/🟡 Growing/🔴 Weak] | [50-65] |
| ⭐ **Authority** | [60-80] | [🟢 Strong/🟡 Growing/🔴 Weak] | [55-70] |
| 🛡️ **Trust** | [70-90] | [🟢 Strong/🟡 Growing/🔴 Weak] | [65-75] |

**Overall Brand Health Score**: **[67]/100** 🟡 Growing

**What These Scores Mean**:
• **Visibility**: How easily people find ${brandName} across search, social, and AI platforms
• **Discovery**: Brand's presence in trending topics, recommendations, and organic conversations
• **Authority**: Credibility signals (citations, backlinks, expert mentions, media coverage)
• **Trust**: Customer sentiment, reviews, certifications, brand reputation

**Score Calculation Factors**:
- Social media following and engagement rates
- Search engine rankings for key terms
- AI platform citation frequency
- Backlink quality and quantity
- Review ratings and volume
- Media mentions and PR coverage
- Industry certifications and awards

[Add 1-2 sentences interpreting the overall score and what it means for ${brandName}'s market position]

---

## 2. BRAND CHRONICLE
**Purpose**: Journey from inception to today
**Length**: 400-500 words
**Tone**: Narrative, inspiring, factual

Format:
### Brand Chronicle

**The Beginning (Launch)**
[2-3 paragraphs about founding story, initial vision, market entry]

**Key Milestones**
• **[Year]**: [Milestone and impact]
• **[Year]**: [Milestone and impact]
• **[Year]**: [Milestone and impact]

**Evolution**
[2 paragraphs about how brand evolved, pivots, adaptations]

**Today**
[1 paragraph current state and momentum]

---

## 3. BRAND DNA
**Purpose**: Decode core identity
**Length**: 300-400 words
**Tone**: Analytical, insightful, definitive

Format:
### Brand DNA

**Core Values**
${claudeAnalysis.brand_dna.core_values.map(v => `• **${v}**`).join('\n')}

**Personality Traits**
[Paragraph describing brand character using traits: ${claudeAnalysis.brand_dna.personality_traits.join(', ')}]

**Brand Voice**
${claudeAnalysis.brand_dna.brand_voice}

**Visual Identity**
${claudeAnalysis.brand_dna.visual_identity}

**Why This DNA Matters**
[2-3 sentences on how this DNA drives decisions and differentiation]

---

## 4. COMPETITIVE ANALYSIS
**Purpose**: Strategic market positioning with competitor rankings
**Length**: 500-700 words
**Tone**: Strategic, data-driven, actionable

Format:
### Competitive Analysis

**Market Position**
${claudeAnalysis.competitive_analysis.market_position}

**Competitive Landscape** (Rank competitors based on market presence)
| Rank | Competitor | Market Share | What They're Doing Now | Key Strength | Weakness |
|------|------------|--------------|------------------------|--------------|----------|
| #1   | [Top competitor] | [%] | [Current strategy/campaign] | [Strength] | [Weakness] |
| #2   | [Second] | [%] | [Current activity] | [Strength] | [Weakness] |
| #3   | [Third] | [%] | [Current activity] | [Strength] | [Weakness] |

**${brandName} Rank**: [Current position] → **Target**: [Desired rank in 12 months]

**What Competitors Are Doing Right Now**:
[2-3 paragraphs analyzing recent competitor moves, campaigns, product launches, market strategies from research]

**SWOT Analysis**
**Strengths**
${claudeAnalysis.competitive_analysis.competitive_advantages.map(a => `• ${a}`).join('\n')}

**Weaknesses**
${claudeAnalysis.competitive_analysis.weaknesses.map(w => `• ${w}`).join('\n')}

**Opportunities**
${claudeAnalysis.competitive_analysis.opportunities.map(o => `• ${o}`).join('\n')}

**Threats**
${claudeAnalysis.competitive_analysis.threats.map(t => `• ${t}`).join('\n')}

**Competitive Gap Analysis**:
[1-2 paragraphs on where ${brandName} is behind and how to catch up]

---

## 5. STRATEGIC INSIGHTS
**Purpose**: Actionable intelligence
**Length**: 400-500 words
**Tone**: Expert, forward-looking, strategic

Format:
### Strategic Insights

**Content Strategy**
**Key Themes**: ${claudeAnalysis.content_strategy.key_themes.join(', ')}
**Content Pillars**:
${claudeAnalysis.content_strategy.content_pillars.map(p => `• **${p}**`).join('\n')}

**Messaging Framework**: ${claudeAnalysis.content_strategy.messaging_framework}

**Market Trends Impacting ${brandName}**
[3-4 paragraphs on industry trends, consumer behavior shifts, emerging patterns from research]

**Strategic Priorities**
**Short-term (3-6 months)**:
${claudeAnalysis.strategic_framework.short_term_priorities.map(p => `• ${p}`).join('\n')}

**Long-term Vision**: ${claudeAnalysis.strategic_framework.long_term_vision}

---

## 6. CRISIS ALERTS
**Purpose**: Digital reputation and visibility risks (NOT operational issues)
**Length**: 200-400 words
**Tone**: Cautious, objective, protective

**CRITICAL**: Focus ONLY on digital visibility, discovery, authority, and trust issues. DO NOT include:
- Supply chain or distribution issues
- Raw material or manufacturing problems
- Operational or logistics challenges

**ONLY INCLUDE**:
- Bad reviews, negative sentiment, reputation damage
- Declining social media engagement or follower drops
- Competitor overtaking in search rankings
- Missing from AI platform results (GEO visibility)
- Fake accounts or brand impersonation
- Urgent automation needs (manual processes slowing growth)
- Website downtime or broken user experience
- Negative press coverage or PR crisis
- Data breaches or privacy concerns

Format:
### Crisis Alerts

[Analyze research for DIGITAL REPUTATION risks only, then create 2-4 alerts focused on Visibility, Discovery, Authority, or Trust]

**🔴 ALERT: [Digital Crisis Name]**
• **Severity**: HIGH/MEDIUM/LOW
• **Category**: 👁️ Visibility / 🔍 Discovery / ⭐ Authority / 🛡️ Trust
• **Description**: [What digital issue was found]
• **Trigger**: [What caused this online]
• **Impact**: [How it damages brand reputation or discoverability]
• **Mitigation**: [Digital strategy to fix - automation, content, monitoring, etc.]

**Example Alerts to Consider**:
- 🔴 **Negative Review Spike**: Bad reviews increasing on Google/social
- 🟡 **Low AI Visibility**: Brand missing from ChatGPT/Perplexity results
- 🟡 **Competitor Overtake**: Losing search ranking to competitors
- 🟡 **Manual Processes**: No automation for social media/customer service
- 🟡 **Outdated Content**: Website or social profiles not updated in months
- 🔴 **Fake Accounts**: Brand impersonation damaging trust

---

## 7. TOP 5 OPPORTUNITIES
**Purpose**: Growth pathways with revenue potential
**Length**: 400-500 words
**Tone**: Optimistic, ambitious, data-backed

Format:
### Top 5 Opportunities

**1. [Opportunity Name]**
• **Description**: [What it is]
• **Why Now**: [Market timing]
• **Revenue Potential**: [Estimate with assumptions]
• **Implementation**: [How to execute]
• **Timeline**: [When to launch]

[Repeat for opportunities 2-5, each with specific revenue estimates and actionable plans]

---

## 8. GEOVERA RECOMMENDATIONS
**Purpose**: Prescriptive action plan
**Length**: 300-400 words
**Tone**: Directive, confident, expert

Format:
### GeoVera Recommendations

Based on comprehensive analysis, we recommend ${brandName} to:

**Immediate Actions (Next 30 Days)**
1. [Specific action with expected outcome]
2. [Specific action with expected outcome]
3. [Specific action with expected outcome]

**Strategic Initiatives (Next 90 Days)**
1. [Strategic move with rationale]
2. [Strategic move with rationale]
3. [Strategic move with rationale]

**Success Metrics to Track**
${claudeAnalysis.strategic_framework.success_metrics.map(m => `• ${m}`).join('\n')}

**Why These Recommendations Matter**
[2-3 sentences on expected impact and transformation]

---

## 9. CONTENT STRATEGY BLUEPRINT
**Purpose**: Show actual AI-generated content examples with full articles
**Length**: 800-1000 words (includes full sample article)
**Tone**: Actionable, detailed, demonstrative

Format:
### Content Strategy Blueprint

**IMPORTANT**: This section must include 2 sample articles to demonstrate Content Studio capabilities:
1. **SHORT Article** (up to 240 characters) - social media optimized
2. **MEDIUM Article** (up to 800 words) - blog/website optimized

**GeoVera Platform Optimization Note**: Content Studio automatically optimizes content untuk setiap platform (Instagram, Facebook, TikTok, Blog, Email) dengan menyesuaikan format, panjang, dan tone agar maksimal engagement. Artikel yang sama bisa di-repurpose untuk 5+ platform berbeda!

---

**Sample Content Asset #1: SHORT Article (Social Media)**

**Purpose**: Quick-read content untuk Instagram/Facebook posts, TikTok captions
**Length**: Up to 240 characters
**Platform**: Optimized for social media feeds

**Title**: "[Write short catchy title in local language, max 8 words]"

**SHORT ARTICLE** (Generated by GeoVera Content Studio):

[Write a COMPLETE short-form article in local language (${country || 'Indonesia'} language if Indonesia) about ${brandName}, maximum 240 characters including spaces.

**Structure** (240 chars max):
- Hook (1 sentence): Attention-grabbing opening
- Value proposition (1 sentence): Why ${brandName} matters
- CTA (1 short phrase): Call to action

Example structure:
"[Hook tentang masalah/kebutuhan]. [${brandName} sebagai solusi dengan unique value]. [CTA singkat: coba sekarang/follow/share]"

**Tone**: Match brand voice from Perplexity research - casual, engaging, emotional
**Emojis**: Include 2-3 relevant emojis if brand style permits
**Hashtags**: NOT included in character count (will be added separately)
]

**Platform Optimization**:
✅ Instagram: Posted as caption dengan image
✅ Facebook: Posted as status update
✅ TikTok: Used as video caption
✅ Twitter/X: Thread starter (perfect length)

**Estimated Engagement**: 5-8% (industry avg: 2-3%)

---

**Sample Content Asset #2: MEDIUM Article (Blog/Website)**

**Purpose**: In-depth storytelling untuk blog posts, website articles, email newsletters
**Length**: Up to 800 words
**Platform**: Optimized for long-form reading

**Selected Title**: "[Write compelling SEO title about ${brandName} using primary keywords]"

**Alternative Titles**:
• "[Alternative angle focusing on heritage/tradition]"
• "[Alternative angle focusing on quality/benefits]"

---

**MEDIUM ARTICLE** (Generated by GeoVera Content Studio):

[Write a COMPLETE 600-800 word article in local language (${country || 'Indonesia'} language if Indonesia) about ${brandName}.

**CRITICAL**: Include 2-3 images using markdown syntax throughout the article:
- After introduction: ![Hero image description](detailed DALL-E 3 prompt for hero image)
- Mid-article: ![Process/story image](detailed DALL-E 3 prompt for process)
- Near end: ![Customer lifestyle image](detailed DALL-E 3 prompt for lifestyle)

**Article Structure**:

**Introduction** (100-150 words):
- Hook that captures attention
- Problem statement (why this matters)
- Introduction to ${brandName} as the solution

![Insert hero image here with markdown: ![${brandName} premium product showcase](Professional commercial photography of ${brandName} products, ${data.category}, brand colors [from research], premium setting, natural lighting, photorealistic 4K)]

**Section 1: Heritage Story** (200-250 words):
- Founding story dengan emotional appeal
- Original recipe/process yang membuat unique
- Journey from humble beginnings to today
- Challenges overcome

![Insert process/heritage image: ![${brandName} traditional production](${brandName} production process, authentic ${country || 'Indonesia'} setting, warm nostalgic lighting, documentary style, brand identity visible)]

**Section 2: What Makes ${brandName} Special** (200-250 words):
- Key differentiators (ingredients, process, certifications)
- Quality standards dan commitments
- Customer testimonials atau social proof
- Why families/customers trust the brand

**Section 3: Future Vision** (100-150 words):
- Innovation plans
- Expansion goals
- Commitment to maintaining quality
- Call to action (try product, share experience, follow social media)

![Insert lifestyle image: ![Happy customers enjoying ${brandName}](${country || 'Indonesia'} family enjoying ${brandName} products, lifestyle photography, warm colors, authentic moment, brand packaging visible, premium quality)]

**CRITICAL IMAGE CONSISTENCY REQUIREMENTS**:

**USE PERPLEXITY VISUAL RESEARCH** - All image details MUST come from Perplexity's "VISUAL BRAND IDENTITY" section above:

**1. Brand Colors from Perplexity** (MANDATORY):
- Find "Brand Colors" in Perplexity research
- Extract EXACT hex codes provided
- Example: "Primary: Orange #FF8C42, Secondary: Cream #FFF5E1"
- Use these EXACT colors in ALL 3 DALL-E prompts
- Include in every prompt: "brand colors: Orange #FF8C42 and Cream #FFF5E1"

**2. Design Style from Perplexity** (MANDATORY):
- Find "Design Style & Aesthetic" in Perplexity research
- Use EXACT aesthetic terms provided
- Example: "Traditional heritage aesthetic with warm nostalgic tones, vintage typography"
- Apply consistently in ALL 3 images

**3. Photography Style from Perplexity** (MANDATORY):
- Find "Brand Photography Style" in Perplexity research
- Use EXACT lighting and composition style
- Example: "Warm natural lighting, Indonesian family settings, documentary style"
- Match this style in ALL 3 DALL-E prompts

**4. Visual Mood from Perplexity** (MANDATORY):
- Find "Visual Mood & Atmosphere" in Perplexity research
- Use EXACT mood descriptors
- Example: "Nostalgic family warmth, traditional Indonesian home settings, vintage kitchenware"
- Apply consistently in ALL images

**5. Logo/Packaging from Perplexity** (MANDATORY):
- Find "Logo & Packaging Analysis" in Perplexity research
- Use EXACT logo description
- Example: "Grandmother illustration in orange, kraft paper packaging with batik patterns"
- Show consistently in ALL 3 images

**6. Metadata & Social Media Analysis** (MANDATORY):
- Analyze brand's actual social media posts (Instagram/TikTok) from Perplexity research
- Study their posted images for:
  - Actual color usage patterns
  - Real photography angles and compositions
  - Authentic props and settings they use
  - Consistent filters or editing style
- Mirror their ACTUAL visual style from social media

**DALL-E Prompt Formula** (Extract ALL details from Perplexity "VISUAL BRAND IDENTITY"):

"[Scene description], ${brandName} brand identity with [LOGO DESCRIPTION from Perplexity], brand colors: [EXACT HEX CODES from Perplexity], [DESIGN AESTHETIC from Perplexity], [PHOTOGRAPHY STYLE from Perplexity], [VISUAL MOOD from Perplexity], ${country || 'Indonesia'} cultural elements, ${data.category} product category, [LIGHTING STYLE from Perplexity], photorealistic 4K quality, matches brand's social media visual style"

**Example with Perplexity Data** (Kata Oma):
"Kata Oma telur gabus product showcase, brand identity with grandmother illustration logo in orange, brand colors: Orange #FF8C42 and Cream #FFF5E1, traditional heritage aesthetic with warm nostalgic tones and vintage typography, warm natural window lighting documentary style, nostalgic family warmth atmosphere with vintage kitchenware and rustic wood textures, Indonesian cultural elements, traditional snacks category, matches Kata Oma Instagram feed style, photorealistic 4K quality"

**Discipline Checklist** (Verify using Perplexity research):
- [ ] Colors match EXACT hex codes from Perplexity
- [ ] Design style matches Perplexity's aesthetic description
- [ ] Photography style matches Perplexity's lighting analysis
- [ ] Visual mood matches Perplexity's atmosphere description
- [ ] Logo/packaging matches Perplexity's logo analysis
- [ ] Style mirrors brand's actual social media posts
- [ ] ALL 3 images consistent with Perplexity data
- [ ] NO deviations from Perplexity visual research

Use local language storytelling, emotional appeal, specific details, and PERPLEXITY VISUAL RESEARCH for ALL image generation. NO guessing - ONLY use Perplexity data.]

---

**Article Performance Metrics**:
• **Word count**: 650-800 words
• **Reading time**: 3-4 minutes
• **SEO score**: 85/100 (optimized for keywords)
• **Readability**: Grade 8 (accessible to general audience)

**AI-Generated Images for This Article**:

IMPORTANT: Include 2-3 DALL-E 3 generated images in the article using this markdown format:
![Image description](DALL-E-3-PROMPT-HERE)

**BRAND CONSISTENCY ANALYSIS** (Extract from Perplexity "VISUAL BRAND IDENTITY" section):

**CRITICAL**: Use the detailed visual analysis from Perplexity research above. Look for:
1. **Brand Colors**: Extract EXACT colors with hex codes from Perplexity research
   - Example: Primary: Orange #FF8C42, Secondary: Cream #FFF5E1
2. **Design Style**: Use the aesthetic description from Perplexity
   - Example: "Traditional heritage aesthetic with warm nostalgic tones"
3. **Photography Style**: Use the visual style from Perplexity
   - Example: "Warm natural lighting, documentary style, Indonesian family settings"
4. **Visual Mood**: Use the atmosphere description from Perplexity
   - Example: "Nostalgic family warmth, vintage kitchenware, rustic wood textures"
5. **Logo Elements**: Use logo description from Perplexity
   - Example: "Grandmother illustration in orange, kraft paper packaging"

**DO NOT GUESS** - Extract ALL visual details from Perplexity research "VISUAL BRAND IDENTITY" section

**Image 1** (Hero/Featured):
![${brandName} product showcase with brand design](${brandName} ${data.category} product showcase, brand colors from Perplexity: [EXACT HEX CODES], [DESIGN STYLE from Perplexity] aesthetic, ${country || 'Indonesia'} cultural elements, [LOGO ELEMENTS from Perplexity] visible, [PHOTOGRAPHY STYLE from Perplexity], photorealistic 4K quality, brand identity consistent with Perplexity research)

**Image 2** (Process/Story):
![${brandName} production maintaining visual identity](${brandName} production/heritage moment, SAME brand colors: [EXACT HEX from Perplexity], SAME [DESIGN STYLE from Perplexity], authentic ${country || 'Indonesia'} setting, [VISUAL MOOD from Perplexity], ${brandName} branding visible, consistent with Image 1 style)

**Image 3** (Customer/Lifestyle):
![Customers with ${brandName} brand consistency](${country || 'Indonesia'} people enjoying ${brandName}, SAME brand colors: [EXACT HEX from Perplexity], SAME [DESIGN STYLE from Perplexity], [ATMOSPHERE from Perplexity], ${brandName} packaging visible, consistent visual presentation with Images 1 and 2)

**MANDATORY**: Reference Perplexity's "VISUAL BRAND IDENTITY" section for:
- Exact color hex codes
- Specific design aesthetic terms
- Photography lighting style
- Cultural/atmospheric elements
- Logo/packaging details

**CRITICAL DISCIPLINE**:
- ALL 3 images MUST use SAME brand colors (no variation)
- ALL 3 images MUST use SAME design aesthetic (traditional/modern/etc)
- ALL 3 images MUST show ${brandName} branding in CONSISTENT way
- ALL 3 images MUST maintain SAME quality level
- NO mixing styles between images
- Insert using markdown: ![alt](prompt)

**Alternative**: If DALL-E images are not available, suggest relevant Unsplash image URLs:
1. Hero: https://images.unsplash.com/photo-[relevant-food/product-photo-id]
2. Process: https://images.unsplash.com/photo-[relevant-production-photo-id]
3. Lifestyle: https://images.unsplash.com/photo-[relevant-family-moment-id]

**Platform Optimization**:
✅ Blog/Website: Published as full article dengan images
✅ Email Newsletter: Formatted dengan preview + read more link
✅ LinkedIn: Professional long-form post (700 words max)
✅ Medium: Cross-posted untuk wider audience reach
✅ PDF Download: Formatted sebagai lead magnet

**Estimated Performance**:
• Average read time: 3-4 minutes
• Expected engagement: 60-75% scroll depth
• SEO value: Ranks for 3-5 target keywords
• Conversion rate: 8-12% (industry avg: 3-5%)

---

**🎯 GeoVera Content Studio - Platform Optimization**

**Satu Artikel → 5+ Platform Berbeda!**

GeoVera Content Studio secara otomatis meng-optimize content untuk setiap platform:

**From SHORT Article (240 chars)**:
→ Instagram Post (dengan image + hashtags)
→ Facebook Status Update (dengan preview image)
→ TikTok Caption (dengan CTA ke bio)
→ Twitter/X Thread (multi-tweet breakdown)
→ WhatsApp Business Status (dengan link)

**From MEDIUM Article (800 words)**:
→ Blog Post (full article dengan SEO optimization)
→ Email Newsletter (dengan preview + read more)
→ LinkedIn Article (professional tone adjustment)
→ Medium Cross-post (untuk wider reach)
→ PDF Lead Magnet (downloadable format)
→ Instagram Carousel (5-7 slides summary)
→ YouTube Video Script (narrative format)

**Optimisasi Otomatis Meliputi**:
✅ Format adjustment (character limits per platform)
✅ Tone adaptation (casual vs professional)
✅ Visual requirements (image sizes, ratios)
✅ SEO metadata (titles, descriptions, keywords)
✅ Hashtag strategy (platform-specific)
✅ CTA placement (platform best practices)
✅ Timing recommendations (optimal posting times)

**ROI Platform Optimization**:
• Traditional: Buat 5 versi berbeda manual → 8-10 jam kerja
• GeoVera: 1 artikel → auto-generate 5+ versi → 15 menit
• **Time saved**: 95%
• **Consistency**: 100% (brand voice maintained across all platforms)

---

**Sample Content Asset #3: Social Media Posts**

**Instagram Carousel Post** (Generated by GeoVera Content Studio):

**Slide 1** (Cover):
"[Catchy headline in local language]
[Emoji] [Emoji] [Emoji]"

**Slide 2-4**: [3 key points about brand/product]

**Slide 5** (CTA):
"[Call to action with brand hashtag]"

**Caption** (150 words in local language):
[Write engaging Instagram caption with storytelling, emojis, relevant hashtags (#BrandName, #Category, #Country), and call to action]

**Expected Engagement**: 4-6% (industry avg: 2-3%)

---

**Sample Content Asset #3: Brand Image Gallery**

**Purpose**: 6-8 brand-consistent images for marketing use across platforms

**CRITICAL**: Generate 6-8 DALL-E 3 prompts that are visually consistent with the brand's actual visual identity (from Perplexity research). Each image should:
- Use the brand's exact color palette (hex codes from research)
- Match the brand's photography style (lighting, composition, props)
- Reflect the brand's cultural context and mood
- Be suitable for different marketing purposes

**Image Gallery** (Generated by GeoVera Content Studio):

1. **Hero Product Shot**
![${brandName} hero product showcase](Professional commercial photography of ${brandName} flagship product, ${data.category}, shot on premium surface with brand colors [exact hex from research], natural lighting, 45-degree angle, photorealistic 4K, brand packaging prominently displayed, [cultural elements from research], shallow depth of field, premium aesthetic)

2. **Lifestyle Family Moment**
![${brandName} family lifestyle](${country || 'Indonesia'} family enjoying ${brandName} products together, authentic candid moment, warm golden hour lighting, traditional home setting, multi-generational (grandparents, parents, children), genuine smiles, brand packaging visible on table, cultural props [from research], documentary style photography, natural colors)

3. **Production Process Heritage**
![${brandName} authentic production](Behind-the-scenes of ${brandName} production, traditional ${country || 'Indonesia'} kitchen setting, hands preparing ingredients, warm nostalgic lighting, cultural cooking tools [from research], heritage recipe being made, documentary photography, emphasis on craftsmanship, natural ingredients visible)

4. **Product Range Display**
![${brandName} full product line](${brandName} complete product range arranged artistically, flat lay composition, brand colors [hex codes], clean white background with subtle brand-colored accents, professional studio lighting, each product clearly visible, balanced composition, commercial photography style)

5. **Cultural Context Scene**
![${brandName} in cultural setting](${brandName} products in authentic ${country || 'Indonesia'} cultural context, traditional setting [from research], cultural props and decorative elements, warm atmospheric lighting, lifestyle photography, brand naturally integrated into scene, photorealistic, cultural authenticity)

6. **Close-up Product Detail**
![${brandName} product detail macro](Extreme close-up macro photography of ${brandName} product texture and details, professional lighting highlighting quality, shallow depth of field, brand colors visible, artisanal craftsmanship evident, mouth-watering appeal, commercial food photography style, 4K resolution)

7. **Social Gathering Moment**
![${brandName} social celebration](Group of young ${country || 'Indonesia'} friends sharing ${brandName} products at casual gathering, authentic modern setting, natural daylight, genuine laughter and conversation, brand packaging on table, lifestyle photography, vibrant energy, cultural elements [from research])

8. **Premium Gift Presentation**
![${brandName} premium gift packaging](${brandName} products beautifully arranged as premium gift set, elegant presentation, brand colors [hex codes], cultural gift-wrapping elements, soft studio lighting, luxury aesthetic while maintaining authentic brand identity, suitable for festive seasons, professional commercial photography)

**Image Consistency Rules**:
- All images use the SAME brand color palette (from Perplexity research)
- All images match the SAME photography style (lighting, mood, composition)
- All images reflect the SAME cultural context
- All images maintain the SAME visual quality level
- NO generic stock photo aesthetics - must feel authentically ${brandName}

**Usage Rights**: AI-generated images can be used for:
• Website hero images and product pages
• Social media posts (Instagram, Facebook, TikTok)
• Blog article illustrations
• Email marketing campaigns
• Print materials and brochures
• Advertisements and sponsored content

**Gallery Generation Cost**:
• Traditional photo shoot (8 images): $2,500 - $4,000
• GeoVera AI Gallery (8 DALL-E images): $0.32 (8 × $0.04)
• **Savings**: $2,499.68 (99.9%) ✅

---

**GeoVera Content Studio ROI**:

**Traditional Content Agency Costs**:
• 1 blog article (800 words): $600
• Research & SEO optimization: $150
• Images sourcing: $100
• Revisions: $150
• **Total per article**: **$1,000**
• **Timeline**: 2-3 weeks

**GeoVera Content Studio Costs**:
• 1 AI-generated article (800 words): $50
• Auto-SEO optimization: Included
• AI image suggestions: Included
• Instant revisions: Included
• **Total per article**: **$50**
• **Timeline**: 15 minutes

**Savings**: **$950 per article (95%)**
**Time saved**: **2.5 weeks per article**

---

**Monthly Content Plan Example**:

| Content Type | Quantity | Traditional Cost | GeoVera Cost | Savings |
|--------------|----------|------------------|--------------|---------|
| Blog articles (800w) | 4 | $4,000 | $200 | $3,800 |
| Instagram posts | 20 | $1,500 | $100 | $1,400 |
| TikTok scripts | 8 | $800 | $80 | $720 |
| Email newsletters | 4 | $600 | $60 | $540 |
| **TOTAL** | **36** | **$6,900** | **$440** | **$6,460** |

**Annual Savings**: **$77,520** 🎉

---

**How GeoVera Content Studio Works**:

1. **Input**: Brand name, topic, target audience
2. **AI Processing**:
   - Analyzes brand voice from existing content
   - Researches trending topics and keywords
   - Generates SEO-optimized content
   - Suggests relevant images
3. **Output**: Publication-ready content in local language
4. **Revision**: Instant AI-powered edits based on feedback

**Content Types Available**:
• Blog articles (500-2000 words)
• Social media posts (Instagram, TikTok, Facebook)
• Email newsletters
• Product descriptions
• Press releases
• Video scripts

---

## 10. SEARCH VISIBILITY STRATEGY
**Purpose**: Keyword strategy across AI, SEO, and Social Search
**Length**: 500-600 words
**Tone**: Strategic, data-backed, technical

Format:
### Search Visibility Strategy

**AI Search Optimization (GEO)**

**Target AI Platforms**: ChatGPT, Perplexity, Claude, Gemini, Bing Copilot, Meta AI

**Priority Search Queries**:

**High Intent Queries** (Ready to Buy):
→ "[best product category] [country]"
→ "[certified/quality] [product type] brands"
→ "[natural/authentic] [product] [country]"

**Brand Discovery Queries**:
→ "who makes ${brandName}"
→ "${brandName} parent company"
→ "[category] brands ${country}"

**Comparison Queries**:
→ "${brandName} vs [top competitor]"
→ "best [product type] brand ${country}"

**Current GEO Visibility Score**: [2-3]/10 (Low/Medium/High)
**Target GEO Score**: 8/10 in 90 days

---

**SEO Keyword Strategy**

**Primary Keywords** (High Volume, Medium Competition):
| Keyword | Volume/mo | Difficulty | Current Rank | Target Rank |
|---------|-----------|------------|--------------|-------------|
| "[main keyword]" | 12,000 | Medium | Not ranked | Top 3 |
| "[secondary keyword]" | 8,500 | Medium | Not ranked | Top 5 |
| "[niche keyword]" | 6,200 | Low | Not ranked | Top 3 |

**Long-tail Keywords** (Lower Volume, Higher Intent):
• "[brand name] [product]" (500/mo) - Target: #1
• "[specific attribute] [category]" (450/mo) - Target: Top 3

**Expected Results (90 days)**:
• Organic traffic: 0 → 5,000 visitors/month
• Keyword rankings: 0 → 25 keywords in top 10
• Domain authority: Current → +15 points

---

**Social Search Optimization (SSO)**

**Target Platforms**: Instagram (Primary), TikTok (Growth), Facebook (Reach), YouTube (Authority)

**Instagram Hashtag Strategy**:
• #${brandName.replace(/\s+/g, '')} (brand hashtag)
• #[CategoryHashtag] (15M+ posts) - Target: Featured
• #[ProductTypeHashtag] (8M+ posts) - Target: Top posts
• #[AttributeHashtag] (2M+ posts) - Target: Top 9

**TikTok Search Optimization**:
• "[product category] [country]" (2.5B views)
• "[attribute] [product]" (850M views)
• "review [brand/product]" (450M views)

**Content Pillars for Social Search**:

**Pillar 1: Heritage Stories** (Build authenticity)
• Behind-the-scenes production
• Founder/origin stories
• Family bonding moments

**Pillar 2: Product Education** (Drive conversions)
• Ingredient breakdowns
• Quality certifications
• Comparison infographics

**Pillar 3: User Generated Content** (Social proof)
• Customer reviews
• Recipe variations
• Community moments

**Expected Results (90 days)**:
• Instagram followers: 0 → 10,000
• TikTok views: 0 → 500,000
• Brand mentions: 0 → 250/month
• Influencer partnerships: 0 → 5 micro-influencers

---

## 11. IMMEDIATE ACTION PLAN (30 DAYS)
**Purpose**: Step-by-step implementation roadmap
**Length**: 400-500 words
**Tone**: Directive, detailed, timeline-driven

Format:
### Immediate Action Plan (30 Days)

**Week 1: Foundation Setup**

**Day 1-3: GeoVera Platform Onboarding** ✅
- [ ] Create GeoVera account
- [ ] Connect social media accounts
- [ ] Import brand assets (logo, colors, guidelines)
- [ ] Set up competitor tracking ([list 3 top competitors])

**Day 4-7: Content Creation Sprint**
- [ ] Generate 5 blog articles via Content Studio
  • "[Article topic 1]" (800 words)
  • "[Article topic 2]" (600 words)
  • "[Article topic 3]" (700 words)
  • "[Article topic 4]" (650 words)
  • "[Article topic 5]" (550 words)

- [ ] Create 20 social media posts
  • 10 Instagram carousel posts
  • 5 TikTok video scripts
  • 5 Facebook community posts

**Expected Cost**:
• Traditional agency: $3,500
• GeoVera: $300 ✅ **Save $3,200 (91%)**

---

**Week 2: Search Visibility**

**AI Search (GEO)**
- [ ] Submit ${brandName} to 6 AI platforms
- [ ] Optimize brand description for AI citation
- [ ] Monitor key search queries
- [ ] A/B test product descriptions

**SEO**
- [ ] Publish 5 articles on company blog
- [ ] Submit to ${country} directories
- [ ] Create Google Business Profile
- [ ] Set up Google Search Console tracking

**SSO (Social Search)**
- [ ] Post 10 Instagram posts with optimized hashtags
- [ ] Engage with top 20 ${country} [category] creators
- [ ] Join 5 relevant Facebook groups
- [ ] Launch TikTok with 3 videos

---

**Week 3: Community Building**

**Influencer Outreach**
- [ ] Identify 20 micro-influencers (10K-50K followers)
- [ ] Send product samples to 10 creators
- [ ] Negotiate partnerships (barter vs paid)
- [ ] Track ROI via SSO Dashboard

**User Generated Content**
- [ ] Launch hashtag campaign: #${brandName.replace(/\s+/g, '')}[CampaignName]
- [ ] Repost customer reviews
- [ ] Create highlight reel from UGC
- [ ] Feature community moments

---

**Week 4: Optimization & Scaling**

**Performance Analysis**
- [ ] Review GeoVera analytics dashboard
- [ ] Identify top-performing content
- [ ] Double down on winning formats
- [ ] Pause underperforming campaigns

**Scaling Strategy**
- [ ] Expand to 2 new social platforms
- [ ] Increase to 30 posts/month
- [ ] Test paid social ads ($500 budget)
- [ ] Measure ROI and adjust budget

---

## 12. DO MORE WITH GEOVERA
**Purpose**: Platform capabilities showcase
**Length**: 200-250 words
**Tone**: Persuasive, helpful, empowering

Format:
### Do More with GeoVera

This intelligence report is just the beginning. With GeoVera's full platform, ${brandName} can:

**🤖 AI Strategic Assistant**
Ask questions like "How do I compete with [competitor]?" and get instant strategic insights from your brand data.

**📊 Real-Time Insights Dashboard**
Monitor brand performance across Social Search Optimization (SSO), Search Engine Optimization (SEO), and Generative Engine Optimization (GEO) platforms.

**✅ Intelligent To-Do System**
Auto-generated action items based on competitive movements, trending topics, and crisis detection.

**🔍 Competitor Radar**
Track ${geminiData.competitors.slice(0, 3).join(', ')} in real-time across 450+ creators, 800+ authority sites, and 6 AI platforms.

**🎯 Content Strategy Hub**
Execute your content pillars with AI-generated, brand-aligned content optimized for each platform.

**📈 Performance Analytics**
Measure success with ${claudeAnalysis.strategic_framework.success_metrics.length}+ custom metrics tailored to ${brandName}.

**Ready to transform ${brandName}'s digital presence?**
[Subscribe to GeoVera] • [Schedule Demo] • [Contact Strategy Team]

---

**END OF REPORT**

---

**CRITICAL QUALITY REQUIREMENTS**:
1. **Specificity**: Use ACTUAL data from the research, not generic placeholders
2. **Numbers**: Include statistics, percentages, revenue estimates, scores wherever possible
3. **Names**: Mention specific competitors, markets, products from the data
4. **Actionability**: Every recommendation must be concrete and implementable
5. **Storytelling**: Write narrative sections in LOCAL LANGUAGE (${country || 'Indonesia'} language)
6. **Professionalism**: Executive-ready, error-free, polished prose
7. **Consistency**: Use brand name consistently, maintain tone throughout
8. **Completeness**: All 12 sections fully developed with specified word counts
9. **Formatting**: Proper markdown, clear hierarchies, scannable structure
10. **Impact**: Reader should feel they have deep understanding and clear action plan

**VALIDATION CHECKLIST** (ensure all are true):
- [ ] Brand name appears 20+ times throughout report
- [ ] At least 5 specific competitor names mentioned with ranks
- [ ] Digital Performance Scores (Visibility, Discovery, Authority, Trust) calculated
- [ ] Overall Brand Health Score provided (0-100)
- [ ] At least 3 revenue/growth statistics cited
- [ ] All 5 opportunities have revenue estimates
- [ ] All crisis alerts have severity + mitigation
- [ ] SWOT has minimum 3 items per quadrant
- [ ] Competitor ranking table shows what they're doing now
- [ ] Content Strategy Blueprint has cost savings calculations
- [ ] Search Visibility Strategy has keyword volume data
- [ ] 30-day action plan has weekly breakdown with checkboxes
- [ ] Storytelling sections written in local language (${country || 'Indonesia'})
- [ ] Timeline/Chronicle has minimum 5 milestones
- [ ] Zero generic phrases like "leading brand", "industry leader" without context
- [ ] Every recommendation is specific and actionable
- [ ] Report reads like premium consulting deliverable

**OUTPUT**: Provide ONLY the complete markdown report, no meta-commentary, no explanations, just the report.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an elite brand intelligence report writer with deep expertise in brand voice, tone, and NLP analysis.

CRITICAL REQUIREMENTS:
1. **Match Brand Tone & Voice**: Analyze the brand's existing communications (from Perplexity research) and mirror their tone:
   - Formal vs Casual
   - Professional vs Playful
   - Traditional vs Modern
   - Serious vs Humorous
   - Corporate vs Personal

2. **Human Behavior Alignment**: Write in a way that reflects how the brand's target audience naturally speaks and thinks:
   - Use their vocabulary and jargon
   - Match their reading level
   - Reflect their values and aspirations
   - Mirror their emotional triggers

3. **NLP Consistency**: Ensure natural language patterns match brand DNA:
   - Sentence structure (short punchy vs long flowing)
   - Word choice (technical vs accessible)
   - Rhythm and pacing
   - Active vs passive voice preference

4. **Cultural Context**: Deeply embed ${country || 'local'} cultural nuances in storytelling

Create compelling, data-driven, executive-ready reports that feel authentically written BY the brand, not ABOUT the brand.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  const data = await response.json();

  // Check for errors in response
  if (!data.choices || !data.choices[0]) {
    console.error('OpenAI API error response:', JSON.stringify(data));
    throw new Error(`OpenAI API error: ${JSON.stringify(data.error || data)}`);
  }

  return data.choices[0].message.content;
}

// Generate static HTML file
interface StaticReportData {
  brand_name: string;
  parent_company: string;
  category: string;
  country: string;
  generated_at: string;
  report_markdown: string;
}

// Helper: Extract brand colors from report markdown (from Perplexity visual research)
function extractBrandColors(markdown: string): { primary: string; secondary: string; accent: string } {
  // Look for color patterns in Perplexity visual research section
  const hexPattern = /#[0-9A-Fa-f]{6}/g;
  const colors = markdown.match(hexPattern) || [];

  return {
    primary: colors[0] || '#16a34a',      // Fallback to GeoVera green
    secondary: colors[1] || '#d1fae5',    // Fallback to light green
    accent: colors[2] || '#10b981'        // Fallback to accent green
  };
}

// Helper: Lighten/darken hex color
function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#',''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
    (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
    .toString(16).slice(1).toUpperCase();
}

function generateStaticHTML(data: StaticReportData): string {
  // Extract brand colors from Perplexity research in the report
  const brandColors = extractBrandColors(data.report_markdown);
  const primaryDark = adjustColor(brandColors.primary, -20);
  const primaryLight = adjustColor(brandColors.primary, 40);
  const primaryVeryLight = adjustColor(brandColors.primary, 80);

  // Enhanced markdown to HTML conversion with images, tables, and lists
  let htmlContent = data.report_markdown
    // Images: ![alt text](url) -> <img> with wrapper
    .replace(/!\[(.*?)\]\((.*?)\)/gim, '<div class="article-image"><img src="$2" alt="$1" loading="lazy"><div class="image-caption">$1</div></div>')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Lists
    .replace(/^→ (.*$)/gim, '<li class="arrow">$1</li>')
    .replace(/^• (.*$)/gim, '<li>$1</li>')
    .replace(/^- \[ \] (.*$)/gim, '<li class="checkbox">☐ $1</li>')
    // Paragraphs and breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/<br>---<br>/g, '<hr>');

  htmlContent = '<p>' + htmlContent + '</p>';

  const formattedDate = new Date(data.generated_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.brand_name} Intelligence Report | GeoVera</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Georgia:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--brand-primary:${brandColors.primary};--brand-primary-dark:${primaryDark};--brand-primary-light:${primaryLight};--brand-primary-very-light:${primaryVeryLight};--brand-secondary:${brandColors.secondary};--brand-accent:${brandColors.accent};--geovera-green:#16a34a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.8;color:#1f2937;background:#f3f4f6;-webkit-font-smoothing:antialiased}
.newsletter-header{background:linear-gradient(135deg,var(--brand-primary-dark) 0%,var(--brand-primary) 50%,var(--brand-primary-light) 100%);padding:48px 24px;text-align:center;border-bottom:6px solid var(--brand-primary-dark)}
.newsletter-header h1{font-family:'Georgia',serif;font-size:3rem;color:#fff;margin-bottom:8px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,0.2)}
.newsletter-header .by-geovera{font-size:1rem;font-weight:400;opacity:0.9;display:block;margin-top:8px}
.newsletter-header .subtitle{color:rgba(255,255,255,0.95);font-size:1.1rem;margin-bottom:24px;font-weight:500}
.newsletter-header .meta{display:inline-flex;gap:24px;flex-wrap:wrap;background:rgba(255,255,255,0.15);padding:16px 32px;border-radius:50px;backdrop-filter:blur(10px)}
.newsletter-header .meta span{color:#fff;font-size:0.95rem;font-weight:500;display:flex;align-items:center;gap:8px}
.container{background:#fff;width:100%;margin:0;padding:0}
.content{max-width:1400px;margin:0 auto;padding:64px 40px}
.content h2{font-family:'Georgia',serif;font-size:2.2rem;color:var(--brand-primary-dark);margin:56px 0 32px;padding:0 0 16px 0;border-bottom:4px solid var(--brand-primary);position:relative;font-weight:700}
.content h2:first-child{margin-top:0}
.content h2::before{content:'';position:absolute;bottom:-4px;left:0;width:120px;height:4px;background:var(--brand-primary-light)}
.content h3{font-family:'Inter',sans-serif;font-size:1.5rem;color:var(--brand-primary-dark);margin:40px 0 20px;font-weight:700;padding-left:16px;border-left:4px solid var(--brand-primary)}
.content p{margin-bottom:20px;line-height:1.9;color:#374151;font-size:1.05rem}
.content strong{color:#111827;font-weight:700;background:linear-gradient(120deg,var(--brand-primary-very-light) 0%,var(--brand-primary-very-light) 100%);background-repeat:no-repeat;background-size:100% 40%;background-position:0 85%;padding:2px 4px}
.content ul,.content ol{margin:20px 0 20px 32px;line-height:2}
.content li{margin-bottom:12px;color:#374151;font-size:1.02rem}
.content li.arrow{list-style:none;padding-left:24px;position:relative}
.content li.arrow::before{content:'→';position:absolute;left:0;color:var(--brand-primary);font-weight:700}
.content li.checkbox{list-style:none;padding:12px 16px;background:var(--brand-primary-very-light);border-left:3px solid var(--brand-primary);margin:8px 0;border-radius:4px;font-weight:500}
.content hr{border:none;border-top:3px solid #e5e7eb;margin:48px 0;position:relative}
.content hr::after{content:'✦';position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#fff;padding:0 16px;color:var(--brand-primary);font-size:1.2rem}
.content table{width:100%;border-collapse:collapse;margin:32px 0;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
.content table thead{background:linear-gradient(135deg,var(--brand-primary-dark),var(--brand-primary));color:#fff}
.content table th{padding:16px 20px;text-align:left;font-weight:700;font-size:0.95rem;text-transform:uppercase;letter-spacing:0.5px}
.content table td{padding:16px 20px;border-bottom:1px solid #e5e7eb;font-size:1rem}
.content table tbody tr:hover{background:var(--brand-primary-very-light);transition:background 0.2s}
.content table tbody tr:last-child td{border-bottom:none}
.score-card{background:linear-gradient(135deg,var(--brand-primary-very-light),var(--brand-primary-light));border-left:6px solid var(--brand-primary);padding:24px 32px;margin:32px 0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.score-card strong{background:none;color:var(--brand-primary-dark)}
.highlight-box{background:#fef3c7;border-left:6px solid #f59e0b;padding:20px 28px;margin:24px 0;border-radius:6px}
.cta-box{background:linear-gradient(135deg,var(--geovera-green),#059669);color:#fff;padding:40px;margin:48px 0;border-radius:12px;text-align:center;box-shadow:0 8px 24px rgba(22,163,74,0.2)}
.cta-box h3{color:#fff;border:none;padding:0;margin:0 0 16px 0;font-size:1.8rem}
.cta-box p{color:rgba(255,255,255,0.95);font-size:1.1rem;margin-bottom:24px}
.cta-button{display:inline-block;background:#fff;color:var(--geovera-green);padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1.05rem;transition:all 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.1)}
.cta-button:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.15)}
.footer{background:#1f2937;color:#9ca3af;padding:48px 40px;text-align:center}
.footer .logo{display:inline-flex;align-items:center;gap:12px;margin-bottom:24px}
.footer .logo-icon{width:48px;height:48px;background:var(--geovera-green);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'Georgia',serif;font-size:24px;font-weight:700;color:#fff}
.footer .logo-text{font-family:'Georgia',serif;font-size:24px;font-weight:700;color:#fff}
.footer p{font-size:0.95rem;margin-bottom:12px}
.footer a{color:#34d399;text-decoration:none;font-weight:600;transition:color 0.2s}
.footer a:hover{color:#10b981}
.article-image{margin:32px 0;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1)}
.article-image img{width:100%;height:auto;display:block;object-fit:cover;max-height:500px}
.image-caption{background:var(--brand-primary-very-light);padding:12px 20px;font-size:0.9rem;color:var(--brand-primary-dark);font-style:italic;border-top:3px solid var(--brand-primary)}
.print-btn{position:fixed;bottom:32px;right:32px;background:var(--geovera-green);color:#fff;border:none;padding:16px 24px;border-radius:50px;font-weight:700;font-size:1rem;cursor:pointer;box-shadow:0 8px 24px rgba(22,163,74,0.3);transition:all 0.3s;z-index:1000}
.print-btn:hover{background:#059669;transform:translateY(-2px);box-shadow:0 12px 32px rgba(5,150,105,0.4)}
@media print{.print-btn,.footer{display:none}.newsletter-header{page-break-after:avoid}.content h2{page-break-after:avoid}.content table{page-break-inside:avoid}.article-image{page-break-inside:avoid}}
@media (max-width:768px){.newsletter-header h1{font-size:2rem}.newsletter-header .meta{flex-direction:column;gap:12px}.content{padding:40px 20px}.content h2{font-size:1.75rem}.content h3{font-size:1.3rem}.article-image img{max-height:300px}.print-btn{bottom:16px;right:16px;padding:12px 20px;font-size:0.9rem}}
</style>
</head>
<body>
<header class="newsletter-header">
<h1>${data.brand_name}<span class="by-geovera">by GeoVera</span></h1>
<div class="subtitle">Brand Intelligence Report • Issue ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
<div class="meta">
<span>🏢 ${data.parent_company}</span>
<span>📦 ${data.category}</span>
<span>🌍 ${data.country}</span>
<span>📅 ${formattedDate}</span>
</div>
</header>
<div class="container">
<div class="content">${htmlContent}</div>
</div>
<footer class="footer">
<div class="logo">
<div class="logo-icon">G</div>
<span class="logo-text">GeoVera</span>
</div>
<p>© 2026 GeoVera Intelligence Platform</p>
<p>Powered by Perplexity AI • Gemini • Claude • GPT-4o</p>
<p><a href="https://geovera-staging.vercel.app">Get your brand intelligence report →</a></p>
</footer>
<button class="print-btn" onclick="window.print()">📄 Download PDF</button>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { brand_name, country, email, industry, description, brand_id, brand_profile_id } = await req.json();

    if (!brand_name) {
      throw new Error('brand_name is required');
    }

    if (!country) {
      throw new Error('country is required');
    }

    // Init Supabase admin client for saving research data
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = (await import('https://esm.sh/@supabase/supabase-js@2')).createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Helper: save partial progress to brand_profiles
    const saveToProfile = async (fields: Record<string, unknown>) => {
      if (!brand_profile_id) return;
      const { error } = await supabaseAdmin
        .from('brand_profiles')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', brand_profile_id);
      if (error) console.error('[onboarding] brand_profiles update error:', error.message);
    };

    // Helper: update brand onboarding step
    const updateBrandStep = async (step: number, done = false) => {
      if (!brand_id) return;
      const { error } = await supabaseAdmin
        .from('brands')
        .update({ onboarding_step: step, ...(done ? { onboarding_done: true } : {}) })
        .eq('id', brand_id);
      if (error) console.error('[onboarding] brands update error:', error.message);
    };

    const brandWithCountry = `${brand_name} (${country})`;
    console.log(`\n🚀 Starting research workflow for: ${brandWithCountry}\n`);

    // Step 0 (internal): Perplexity Discovery — verified brand facts
    console.log('🔍 Step 0: Perplexity Discovery...');
    const step0Data = await step0_perplexity_discovery(brand_name, country);
    console.log('✅ Step 0 Complete\n');

    // Step 1: Gemini Indexing — uses Step 0 verified data as foundation
    console.log('📍 Step 1: Gemini Brand Indexing...');
    const step1Data = await step1_gemini(brand_name, country, step0Data);
    console.log('✅ Step 1 Complete\n');

    // Save Step 1 immediately → brand_profiles.research_data
    await saveToProfile({
      research_data: {
        gemini: step1Data,
        perplexity_discovery: step0Data,
        indexed_at: new Date().toISOString(),
      },
    });
    await updateBrandStep(1);

    // Step 2: Perplexity Deep Research — uses Step 1 as context
    console.log('🔍 Step 2: Perplexity Deep Research...');
    const step2Data = await step2_perplexity(brand_name, step1Data);
    console.log('✅ Step 2 Complete\n');

    // Save Step 2 immediately → brand_profiles.perplexity_data
    await saveToProfile({
      perplexity_data: {
        deep_research: step2Data,
        researched_at: new Date().toISOString(),
      },
    });
    await updateBrandStep(2);

    // Step 3: Claude Reverse Engineering + Strategic Analysis
    console.log('🧠 Step 3: Claude Reverse Engineering...');
    const step3Data = await step3_claude(brand_name, step2Data);
    console.log('✅ Step 3 Complete\n');

    // Save Step 3 immediately → brand_profiles.source_of_truth
    await saveToProfile({
      source_of_truth: {
        ...step3Data,
        synthesized_at: new Date().toISOString(),
      },
    });
    await updateBrandStep(3);

    // Step 4: OpenAI Report Generation
    console.log('✍️ Step 4: Report Generation...');
    const finalReport = await step4_openai(brand_name, step1Data, step2Data, step3Data);
    console.log('✅ Step 4 Complete\n');

    console.log('🎉 All steps completed successfully!\n');

    // Generate slug for static file
    const slug = brand_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Generate static HTML file
    console.log('📄 Generating static HTML file...');
    const staticHTML = generateStaticHTML({
      brand_name,
      parent_company: step1Data.parent_company,
      category: step1Data.category,
      country: country || 'N/A',
      generated_at: new Date().toISOString(),
      report_markdown: finalReport
    });

    console.log(`✅ Static HTML generated: ${slug}.html (${staticHTML.length} bytes)\n`);

    // Mark onboarding complete + save final report to brand_profiles
    await saveToProfile({ onboarding_report: finalReport });
    await updateBrandStep(4, true);

    // Auto-trigger brand-analytics-scorer (fire-and-forget, non-blocking)
    if (brand_profile_id) {
      const scorerUrl = `${SUPABASE_URL}/functions/v1/brand-analytics-scorer`;
      fetch(scorerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ brand_profile_id, user_id: null }),
      }).catch(e => console.error('[onboarding] scorer trigger failed (non-fatal):', e.message));
      console.log('[onboarding] brand-analytics-scorer triggered');
    }

    // Send brand intelligence email report (fire-and-forget, don't block response)
    if (email) {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
      if (RESEND_API_KEY) {
        try {
          const s1 = step1Data as { competitors?: string[]; social_media?: Record<string, string | null>; market_positioning?: string; unique_selling_proposition?: string; key_features?: string[]; category?: string };
          const s3 = step3Data as { brand_dna?: { core_values?: string[]; personality_traits?: string[] }; competitive_analysis?: { opportunities?: string[] } };

          const competitorList = (s1.competitors ?? []).slice(0, 5)
            .map(c => `<li style="margin:4px 0;color:#374151;font-size:14px;">${c}</li>`).join('');

          const socialGaps = ['instagram', 'tiktok', 'facebook', 'youtube']
            .filter(p => !s1.social_media?.[p]);
          const gapChips = socialGaps
            .map(p => `<span style="background:#FEF2F2;color:#EF4444;border:1px solid #FECACA;border-radius:20px;padding:4px 12px;font-size:12px;margin:2px;display:inline-block;">${p}</span>`)
            .join(' ');

          const traitChips = (s3.brand_dna?.personality_traits ?? []).slice(0, 5)
            .map(t => `<span style="background:#EDF5F4;color:#3D6B68;border-radius:20px;padding:4px 10px;font-size:12px;margin:2px;display:inline-block;">${t}</span>`)
            .join(' ');

          const oppList = (s3.competitive_analysis?.opportunities ?? []).slice(0, 3)
            .map(o => `<li style="margin:4px 0;color:#374151;font-size:14px;">${o}</li>`).join('');

          const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#FAFAF9;padding:0;">
<div style="background:linear-gradient(135deg,#3D6B68,#5F8F8B);padding:32px 24px;text-align:center;">
  <div style="font-size:26px;color:white;font-weight:bold;margin-bottom:4px;">✦ GeoVera</div>
  <p style="color:rgba(255,255,255,0.85);margin:0;font-size:13px;">AI Brand Intelligence Report</p>
</div>
<div style="padding:32px 24px;">
  <h1 style="font-size:22px;color:#111827;margin:0 0 6px 0;">Laporan Digital Presence</h1>
  <h2 style="font-size:26px;color:#3D6B68;margin:0 0 8px 0;font-weight:900;">${brand_name}</h2>
  <p style="color:#6B7280;margin:0 0 24px 0;font-size:13px;">Dianalisis menggunakan Perplexity AI, Gemini &amp; Claude — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

  <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:12px;padding:16px;margin-bottom:20px;">
    <p style="margin:0;color:#16A34A;font-weight:bold;font-size:13px;">✓ Analisis AI Berhasil</p>
    <p style="margin:6px 0 0;color:#374151;font-size:14px;">${s1.market_positioning ?? `Brand Anda di industri ${s1.category ?? industry ?? 'ini'} telah dianalisis secara mendalam.`}</p>
  </div>

  ${competitorList ? `<h3 style="font-size:15px;color:#111827;margin:20px 0 10px;">🏆 Kompetitor Utama Terdeteksi</h3><ul style="margin:0 0 20px;padding-left:20px;">${competitorList}</ul>` : ''}

  ${socialGaps.length > 0 ? `
  <h3 style="font-size:15px;color:#111827;margin:0 0 8px;">⚠️ Digital Presence Gaps</h3>
  <p style="color:#6B7280;font-size:13px;margin:0 0 10px;">Platform yang belum dioptimalkan — peluang besar untuk brand Anda:</p>
  <div style="margin-bottom:20px;">${gapChips}</div>` : ''}

  ${traitChips ? `<h3 style="font-size:15px;color:#111827;margin:0 0 8px;">🧬 Brand DNA</h3><div style="margin-bottom:20px;">${traitChips}</div>` : ''}

  ${s1.unique_selling_proposition ? `<div style="background:#EDF5F4;border-left:3px solid #3D6B68;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:14px;color:#374151;font-style:italic;">"${s1.unique_selling_proposition}"</p></div>` : ''}

  ${oppList ? `<h3 style="font-size:15px;color:#111827;margin:0 0 10px;">🚀 Peluang Teridentifikasi</h3><ul style="margin:0 0 20px;padding-left:20px;">${oppList}</ul>` : ''}

  <div style="background:#1A2B28;border-radius:16px;padding:28px 24px;text-align:center;margin-top:28px;">
    <h2 style="color:white;margin:0 0 8px;font-size:18px;">Tingkatkan Visibilitas Digital Anda</h2>
    <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 20px;">GeoVera membantu brand Anda terindeks di AI search, membuat konten viral, dan tumbuh di semua platform sekaligus.</p>
    <a href="https://app.geovera.xyz/onboarding" style="background:linear-gradient(135deg,#3D6B68,#5F8F8B);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:bold;display:inline-block;">Mulai 7 Hari Gratis →</a>
  </div>
</div>
<div style="text-align:center;padding:16px;color:#9CA3AF;font-size:11px;">
  <p style="margin:0;">© 2025 GeoVera · <a href="https://geovera.xyz" style="color:#9CA3AF;">geovera.xyz</a> · <a href="https://app.geovera.xyz" style="color:#9CA3AF;">Dashboard</a></p>
</div>
</body></html>`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'GeoVera <hello@geovera.xyz>',
              to: [email],
              subject: `Laporan Brand Intelligence: ${brand_name} — GeoVera AI`,
              html: emailHtml,
            }),
          });
          console.log(`📧 Brand intelligence email sent to ${email}`);
        } catch (emailErr) {
          console.error('Email send failed (non-fatal):', emailErr instanceof Error ? emailErr.message : emailErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        brand_name,
        slug,
        report: finalReport,
        static_html: staticHTML,
        static_url: `https://geovera-staging.vercel.app/reports/${slug}.html`,
        metadata: {
          step1_indexed_data: step1Data,
          step3_analysis: step3Data,
          research_length: step2Data.length,
          report_length: finalReport.length,
          html_length: staticHTML.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
