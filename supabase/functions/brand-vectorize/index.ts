import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* ══════════════════════════════════════════════════════════════════════════
   GeoVera — Brand Vectorize (Cloudflare Vectorize v2 + Workers AI)

   Purpose: Convert brand research_data into semantic vector embeddings
   and upsert into Cloudflare Vectorize with strict brand isolation.

   Brand isolation: each brand uses its own namespace (brand_profile_id)
   → NO cross-brand contamination possible.

   Vector ID format: {research_hash}_{brand_profile_id}
   → unique per brand per biweek; safe to re-upsert (idempotent)

   Embedding model: @cf/baai/bge-base-en-v1.5 (768 dimensions)
   Index dimensions must match — index is auto-created on first run.

   Loop learning: each biweekly refresh adds a new vector, so Vectorize
   accumulates the brand's evolution history. Query by namespace to get
   the full history or filter by research_version for latest.
══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
const CF_INDEX_NAME = Deno.env.get("CLOUDFLARE_VECTORIZE_INDEX") || "geovera-brand-intelligence";
const CF_AI_MODEL = "@cf/baai/bge-base-en-v1.5";
const VECTOR_DIMENSIONS = 768;

const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`;
const CF_HEADERS = {
  "Authorization": `Bearer ${CF_API_TOKEN}`,
  "Content-Type": "application/json",
};

// ── Build rich text for embedding ─────────────────────────────────────────
// Constructs a dense semantic document from brand research data.
// This text is what gets embedded → determines semantic search quality.
function buildEmbeddingText(
  brandName: string,
  country: string,
  researchData: Record<string, unknown>,
): string {
  const identity = (researchData.brand_identity as Record<string, unknown>) ?? {};
  const dna = (researchData.brand_dna as Record<string, unknown>) ?? {};
  const market = (researchData.market_intelligence as Record<string, unknown>) ?? {};
  const content = (researchData.content_intelligence as Record<string, unknown>) ?? {};
  const presence = (researchData.digital_presence as Record<string, unknown>) ?? {};
  const authority = (researchData.authority_signals as Record<string, unknown>) ?? {};

  const getVal = (obj: Record<string, unknown>, key: string): string => {
    const v = obj[key];
    if (!v) return "";
    if (typeof v === "object" && v !== null && "value" in v) return String((v as Record<string, unknown>).value ?? "");
    return String(v);
  };

  const audience = (dna.target_audience as Record<string, unknown>) ?? {};
  const voice = (dna.brand_voice as Record<string, unknown>) ?? {};
  const visual = (dna.visual_identity as Record<string, unknown>) ?? {};

  const competitors = ((market.competitors as Array<Record<string, unknown>>) ?? [])
    .map((c) => `${c.name} (${c.key_differentiator})`).join(", ");

  const keywords = [
    ...((content.primary_keywords as string[]) ?? []),
    ...((content.long_tail_keywords as string[]) ?? []).slice(0, 4),
  ].join(", ");

  const topics = ((content.content_topics as string[]) ?? []).join(", ");

  const urls = Object.values((presence.verified_urls as Record<string, unknown>) ?? {})
    .filter(Boolean).join(" ");

  const mediaOutlets = ((authority.media_coverage as Array<Record<string, unknown>>) ?? [])
    .map((m) => m.outlet).filter(Boolean).join(", ");

  const certifications = ((authority.certifications as string[]) ?? []).join(", ");

  return `
Brand: ${brandName}
Country: ${country}
Official Name: ${getVal(identity, "official_name")}
Legal Name: ${getVal(identity, "legal_name")}
Parent Company: ${getVal(identity, "parent_company")}
Founded: ${getVal(identity, "founded_year")}
HQ: ${identity.hq_city ?? ""} ${identity.hq_country ?? ""}
Industry: ${identity.industry ?? ""} / ${identity.sub_industry ?? ""}
Brand Stage: ${identity.brand_stage ?? ""}
Operating Countries: ${((identity.operating_countries as string[]) ?? []).join(", ")}

Brand Archetype: ${dna.personality_archetype ?? ""}
Archetype Reasoning: ${dna.archetype_reasoning ?? ""}
Core Values: ${((dna.core_values as string[]) ?? []).join(", ")}
Positioning: ${dna.positioning ?? ""}
USP: ${dna.usp ?? ""}
Tagline: ${dna.tagline ?? ""}
Brand Voice: ${((voice.tone_attributes as string[]) ?? []).join(", ")}
Communication Style: ${voice.communication_style ?? ""}
Vocabulary: ${((voice.vocabulary_examples as string[]) ?? []).join(", ")}
Visual: ${visual.design_aesthetic ?? ""} ${((visual.primary_colors as string[]) ?? []).join(" ")}

Target Audience: ${audience.primary_segment ?? ""}, age ${audience.age_range ?? ""}, ${audience.income_level ?? ""}
Psychographics: ${((audience.psychographics as string[]) ?? []).join(", ")}
Pain Points: ${((audience.pain_points as string[]) ?? []).join(", ")}

Market Category: ${market.market_category ?? ""}
Market Size: ${market.market_size_estimate ?? ""}
Growth: ${market.growth_trajectory ?? ""}
Competitors: ${competitors}
Competitive Position: ${market.competitive_position ?? ""}

SEO Keywords: ${keywords}
Content Topics: ${topics}
Content Gaps: ${((content.content_gaps as string[]) ?? []).join(", ")}
Trending Topics: ${((content.trending_topics as string[]) ?? []).join(", ")}

Digital Presence: ${urls}
Media Coverage: ${mediaOutlets}
Certifications: ${certifications}
`.trim().replace(/\n{3,}/g, "\n\n");
}

// ── Ensure Vectorize index exists ──────────────────────────────────────────
async function ensureIndexExists(): Promise<void> {
  // Check if index exists
  const checkRes = await fetch(
    `${CF_BASE}/vectorize/v2/indexes/${CF_INDEX_NAME}`,
    { headers: { "Authorization": `Bearer ${CF_API_TOKEN}` } },
  );

  if (checkRes.ok) {
    console.log(`[brand-vectorize] Index "${CF_INDEX_NAME}" already exists`);
    return;
  }

  if (checkRes.status !== 404) {
    const err = await checkRes.text();
    throw new Error(`Failed to check index: ${checkRes.status} — ${err.slice(0, 200)}`);
  }

  // Create index
  console.log(`[brand-vectorize] Creating index "${CF_INDEX_NAME}" (${VECTOR_DIMENSIONS}d, cosine)`);
  const createRes = await fetch(`${CF_BASE}/vectorize/v2/indexes`, {
    method: "POST",
    headers: CF_HEADERS,
    body: JSON.stringify({
      name: CF_INDEX_NAME,
      config: {
        dimensions: VECTOR_DIMENSIONS,
        metric: "cosine",
      },
      description: "GeoVera brand intelligence vectors — biweekly self-improving research",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create index: ${createRes.status} — ${err.slice(0, 200)}`);
  }

  console.log(`[brand-vectorize] Index created successfully`);
  // Brief wait for index to be ready
  await new Promise((r) => setTimeout(r, 2000));
}

// ── Generate embedding via Cloudflare Workers AI ────────────────────────────
async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(
    `${CF_BASE}/ai/run/${CF_AI_MODEL}`,
    {
      method: "POST",
      headers: CF_HEADERS,
      body: JSON.stringify({ text }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Workers AI embedding failed: ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { result?: { data?: number[][] }; success?: boolean };
  const vectors = data?.result?.data;

  if (!vectors || !vectors[0] || vectors[0].length !== VECTOR_DIMENSIONS) {
    throw new Error(`Unexpected embedding response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return vectors[0];
}

// ── Upsert vector into Vectorize ─────────────────────────────────────────────
async function upsertVector(
  vectorId: string,
  namespace: string,
  values: number[],
  metadata: Record<string, string | number | boolean>,
): Promise<void> {
  // Vectorize v2 upsert uses NDJSON format
  const ndjsonLine = JSON.stringify({
    id: vectorId,
    values,
    namespace,
    metadata,
  });

  const res = await fetch(
    `${CF_BASE}/vectorize/v2/indexes/${CF_INDEX_NAME}/upsert`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjsonLine,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vectorize upsert failed: ${res.status} — ${err.slice(0, 200)}`);
  }

  const result = await res.json() as { result?: { count?: number }; success?: boolean };
  console.log(`[brand-vectorize] Upserted vector. Count: ${result?.result?.count ?? "unknown"}`);
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json() as {
      brand_profile_id: string;
      user_id: string;
      brand_name: string;
      country: string;
      research_hash: string;
      research_version: number;
      research_data: Record<string, unknown>;
    };

    const {
      brand_profile_id,
      user_id,
      brand_name,
      country,
      research_hash,
      research_version,
      research_data,
    } = body;

    if (!brand_profile_id || !user_id || !brand_name || !research_hash || !research_data) {
      return new Response(
        JSON.stringify({ error: "brand_profile_id, user_id, brand_name, research_hash, research_data required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check CF credentials
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
      console.error("[brand-vectorize] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
      return new Response(
        JSON.stringify({ error: "Cloudflare credentials not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[brand-vectorize] Starting vectorization for: ${brand_name} (${country}) v${research_version}`);
    console.log(`[brand-vectorize] Brand Profile ID (namespace): ${brand_profile_id}`);
    console.log(`[brand-vectorize] Research hash: ${research_hash}`);

    // 1. Ensure index exists (auto-creates on first run)
    await ensureIndexExists();

    // 2. Build embedding text from research_data
    const embeddingText = buildEmbeddingText(brand_name, country, research_data);
    console.log(`[brand-vectorize] Embedding text chars: ${embeddingText.length}`);

    // 3. Generate embedding via Cloudflare Workers AI
    const values = await generateEmbedding(embeddingText);
    console.log(`[brand-vectorize] Embedding generated: ${values.length} dimensions`);

    // 4. Prepare vector metadata (Vectorize metadata values must be string | number | boolean)
    const vectorId = `${research_hash}_${brand_profile_id}`;
    const namespace = brand_profile_id; // STRICT brand isolation: each brand = own namespace

    const overallConfidence = (research_data.meta as Record<string, unknown>)?.overall_confidence;
    const dna = (research_data.brand_dna as Record<string, unknown>) ?? {};

    const metadata: Record<string, string | number | boolean> = {
      brand_profile_id,
      user_id,
      brand_name,
      country,
      research_hash,
      research_version: research_version ?? 1,
      research_timestamp: new Date().toISOString(),
      overall_confidence: typeof overallConfidence === "number" ? overallConfidence : 0,
      personality_archetype: String(dna.personality_archetype ?? ""),
      industry: String((research_data.brand_identity as Record<string, unknown>)?.industry ?? ""),
      brand_stage: String((research_data.brand_identity as Record<string, unknown>)?.brand_stage ?? ""),
      market_category: String((research_data.market_intelligence as Record<string, unknown>)?.market_category ?? ""),
      growth_trajectory: String((research_data.market_intelligence as Record<string, unknown>)?.growth_trajectory ?? ""),
    };

    // 5. Upsert into Vectorize with brand isolation (namespace = brand_profile_id)
    await upsertVector(vectorId, namespace, values, metadata);

    // 6. Update brand_profiles to record vectorization
    await supabase.from("brand_profiles")
      .update({ vectorized_at: new Date().toISOString() })
      .eq("id", brand_profile_id)
      .eq("user_id", user_id);

    console.log(`[brand-vectorize] Complete: ${brand_name} v${research_version} → namespace:${namespace} id:${vectorId}`);

    return new Response(
      JSON.stringify({
        success: true,
        brand_profile_id,
        vector_id: vectorId,
        namespace,
        dimensions: values.length,
        research_version,
        research_hash,
        index: CF_INDEX_NAME,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brand-vectorize] ERROR: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
