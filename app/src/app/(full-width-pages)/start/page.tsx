"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ══════════════════════════════════════════════════════════════════
   /start — Post-onboarding: Brand Summary + GeoVera Invitation
   DS v5.9 — zero dependency from old pages
══════════════════════════════════════════════════════════════════ */

type RStatus = "pending" | "indexing" | "gemini_complete" | "researching_deep" | "consolidating" | "sot_ready" | "failed" | string;

interface BrandProfile {
  id: string;
  brand_name: string;
  country: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  research_status: RStatus;
  research_data: {
    brand_identity?: {
      industry?: string;
      description?: string;
      value_proposition?: string;
      target_audience?: string;
      brand_archetype?: string;
    };
    brand_dna?: {
      tone_of_voice?: string;
      brand_personality?: string[];
      brand_pillars?: string[];
      unique_differentiators?: string[];
    };
    digital_presence?: {
      website_status?: string;
      seo_health?: string;
      overall_digital_score?: number;
      social_presence?: Record<string, string>;
    };
    market_intelligence?: {
      category?: string;
      competitors?: { name: string; website?: string }[];
      market_position?: string;
      market_opportunities?: string[];
      threats?: string[];
    };
    content_intelligence?: {
      top_content_topics?: string[];
      content_gaps?: string[];
      platform_recommendations?: Record<string, string>;
    };
    backlinks?: {
      domain_authority_estimate?: number;
      link_profile?: string;
    };
  } | null;
}

const DATA_READY: RStatus[] = ["gemini_complete", "researching_deep", "consolidating", "sot_ready"];

const LOADING_STEPS = [
  "Membaca profil brand kamu",
  "Menganalisis digital presence",
  "Memetakan kompetitor",
  "Mengidentifikasi peluang pasar",
  "Menyusun laporan brand",
];

const GV_CAPABILITIES = [
  {
    icon: "🔍",
    title: "Ditemukan di pencarian",
    desc: "GeoVera membangun strategi SEO & GEO berbasis DNA brand kamu — agar orang yang tepat menemukan kamu lebih mudah di Google, AI search, dan marketplace.",
  },
  {
    icon: "🤝",
    title: "Direkomendasikan secara organik",
    desc: "Dengan konten yang tepat di platform yang tepat, brand kamu jadi pilihan yang direkomendasikan orang — bukan hanya ditemukan, tapi dipercaya.",
  },
  {
    icon: "📊",
    title: "Intelligence kompetitor real-time",
    desc: "Pantau gerak kompetitor, identifikasi gap pasar, dan ambil peluang lebih cepat dengan data yang dikumpulkan otomatis setiap hari.",
  },
  {
    icon: "✍️",
    title: "Konten brand yang konsisten & kuat",
    desc: "AI GeoVera paham tone, nilai, dan audience brand kamu — menghasilkan artikel, caption, dan strategi konten yang benar-benar on-brand.",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function FullScreenLoader({ brandName, stepIdx }: { brandName: string; stepIdx: number }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--gv-color-ai-glow)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Animated logo pulse */}
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 32px" }}>
          <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "2px solid var(--gv-color-primary-200)", animation: "gv-ss-blink 2s ease-in-out infinite" }} />
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--gv-color-primary-900)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(95,143,139,0.3)" }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="14" stroke="var(--gv-color-primary-300)" strokeWidth="2"/>
              <circle cx="18" cy="18" r="7" fill="var(--gv-color-primary-400)" opacity="0.5"/>
              <circle cx="18" cy="18" r="3" fill="white"/>
            </svg>
          </div>
        </div>

        <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 26, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.04em", margin: "0 0 8px" }}>
          Menganalisis {brandName}
        </h2>
        <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", marginBottom: 36, lineHeight: 1.6 }}>
          Gemini 2.5 Flash sedang membangun Brand Intelligence Profile untuk brand kamu. Ini hanya membutuhkan beberapa detik.
        </p>

        {/* Step progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", marginBottom: 32 }}>
          {LOADING_STEPS.map((step, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: done ? "var(--gv-color-success-50)" : active ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)", border: `1px solid ${done ? "var(--gv-color-success-200)" : active ? "var(--gv-color-primary-200)" : "var(--gv-color-neutral-200)"}`, borderRadius: "var(--gv-radius-sm)" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--gv-color-success-500)" : active ? "transparent" : "var(--gv-color-neutral-100)", border: active ? "2px solid var(--gv-color-primary-200)" : "none" }}>
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : active ? (
                    <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--gv-color-primary-300)", borderTopColor: "var(--gv-color-primary-500)", animation: "gv-spin 0.7s linear infinite" }} />
                  ) : null}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: done ? "var(--gv-color-success-700)" : active ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
          Halaman ini akan otomatis update saat analisis selesai ✦
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StartPage() {
  const router = useRouter();
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);

  const poll = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("brand_profiles")
      .select("research_status, research_data")
      .eq("id", id)
      .single();
    if (data) setBrand(prev => prev ? { ...prev, ...data } : prev);
    return data?.research_status as RStatus | undefined;
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let stepTimer: ReturnType<typeof setInterval>;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      // Redirect if already has active subscription
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (sub) { router.replace("/analytics"); return; }

      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("id, brand_name, country, website_url, instagram_handle, research_status, research_data")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!bp) { router.replace("/onboarding"); return; }

      setBrand(bp as BrandProfile);
      setLoading(false);

      // Animate loading steps while research is pending
      if (!DATA_READY.includes(bp.research_status)) {
        stepTimer = setInterval(() => {
          setStepIdx(prev => Math.min(prev + 1, LOADING_STEPS.length - 1));
        }, 3500);

        interval = setInterval(async () => {
          const status = await poll(bp.id);
          if (status && DATA_READY.includes(status)) {
            clearInterval(interval);
            clearInterval(stepTimer);
            setStepIdx(LOADING_STEPS.length); // all done
          }
        }, 5000);
      }
    }

    init();
    return () => { if (interval) clearInterval(interval); if (stepTimer) clearInterval(stepTimer); };
  }, [router, poll]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gv-color-bg-base)" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--gv-color-neutral-200)", borderTopColor: "var(--gv-color-primary-500)", animation: "gv-spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const hasData = DATA_READY.includes(brand?.research_status ?? "");

  if (!brand || !hasData) {
    return <FullScreenLoader brandName={brand?.brand_name ?? "brand kamu"} stepIdx={stepIdx} />;
  }

  // ── Extract intelligence from research_data ──────────────────────────────
  const rd = brand.research_data;
  const industry = rd?.brand_identity?.industry ?? "";
  const description = rd?.brand_identity?.description ?? "";
  const archetype = rd?.brand_identity?.brand_archetype ?? "";
  const valueProposition = rd?.brand_identity?.value_proposition ?? "";
  const targetAudience = rd?.brand_identity?.target_audience ?? "";
  const toneOfVoice = rd?.brand_dna?.tone_of_voice ?? "";
  const pillars = rd?.brand_dna?.brand_pillars ?? [];
  const digitalScore = rd?.digital_presence?.overall_digital_score ?? null;
  const websiteStatus = rd?.digital_presence?.website_status ?? "";
  const competitors = rd?.market_intelligence?.competitors ?? [];
  const marketPosition = rd?.market_intelligence?.market_position ?? "";
  const opportunities = rd?.market_intelligence?.market_opportunities ?? [];
  const topics = rd?.content_intelligence?.top_content_topics ?? [];
  const domainAuth = rd?.backlinks?.domain_authority_estimate ?? null;

  const scoreColor = digitalScore !== null
    ? digitalScore >= 70 ? "var(--gv-color-success-500)"
    : digitalScore >= 40 ? "var(--gv-color-warning-500)"
    : "var(--gv-color-danger-500)"
    : "var(--gv-color-neutral-300)";

  return (
    <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", paddingBottom: 80 }}>
      {/* AI ambient glow */}
      <div style={{ position: "fixed", inset: 0, background: "var(--gv-color-ai-glow)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── Hero: Brand analyzed ──────────────────────────────────────── */}
      <div style={{ background: "var(--gv-color-primary-900)", padding: "56px 24px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% -10%, rgba(122,179,171,0.25) 0%, transparent 65%)" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "var(--gv-radius-full)", padding: "6px 16px", marginBottom: 24 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l2.5 2.5L10 3" stroke="var(--gv-color-success-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "var(--gv-font-body)" }}>
              Brand Intelligence selesai dianalisis
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 36, fontWeight: 900, color: "white", letterSpacing: "-0.04em", margin: "0 0 12px", lineHeight: 1.1 }}>
            {brand.brand_name} siap<br />untuk berkembang.
          </h1>
          <p style={{ fontSize: 15, color: "var(--gv-color-primary-200)", fontFamily: "var(--gv-font-body)", margin: 0, lineHeight: 1.7, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            GeoVera AI telah menganalisis brand kamu dan menemukan potensi yang belum dimaksimalkan.
            Ini ringkasan awalnya — dan apa yang bisa kami bantu.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>

        {/* ── Brand Summary Card ──────────────────────────────────────── */}
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl)", overflow: "hidden", boxShadow: "var(--gv7-depth-2)", marginTop: -24, marginBottom: 28 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--gv-color-neutral-100)", background: "var(--gv-color-bg-surface-elevated)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-primary-900)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="var(--gv-color-primary-300)" strokeWidth="1.5"/>
                <circle cx="9" cy="9" r="3" fill="var(--gv-color-primary-400)" opacity="0.6"/>
                <circle cx="9" cy="9" r="1.2" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-800)", fontFamily: "var(--gv-font-body)" }}>Brand Intelligence Summary</div>
              <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>Powered by Gemini 2.5 Flash</div>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            {/* Score + description row */}
            <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
              {digitalScore !== null && (
                <div style={{ flexShrink: 0, textAlign: "center", padding: "12px 16px", background: "var(--gv-color-bg-base)", borderRadius: "var(--gv-radius-lg)", border: "1px solid var(--gv-color-neutral-200)" }}>
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 36, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{digitalScore}</div>
                  <div style={{ fontSize: 10, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)", marginTop: 2 }}>Digital Score</div>
                  <div style={{ width: 56, height: 4, background: "var(--gv-color-neutral-100)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${digitalScore}%`, background: scoreColor, borderRadius: 2 }} />
                  </div>
                </div>
              )}
              <div style={{ flex: 1 }}>
                {description && (
                  <p style={{ fontSize: 13, color: "var(--gv-color-neutral-700)", fontFamily: "var(--gv-font-body)", lineHeight: 1.7, margin: "0 0 10px" }}>
                    {description}
                  </p>
                )}
                {websiteStatus && (
                  <p style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", lineHeight: 1.6, margin: 0 }}>
                    {websiteStatus}
                  </p>
                )}
              </div>
            </div>

            {/* Meta chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[
                industry && { label: "Industri", value: industry },
                archetype && { label: "Archetype", value: archetype },
                toneOfVoice && { label: "Tone", value: toneOfVoice },
                domainAuth !== null && { label: "Domain Authority", value: `${domainAuth}/100` },
                targetAudience && { label: "Audience", value: targetAudience },
              ].filter(Boolean).map((chip, i) => (
                <div key={i} style={{ padding: "5px 12px", background: "var(--gv-color-bg-base)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-full)" }}>
                  <span style={{ fontSize: 10, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>{(chip as {label: string; value: string}).label}: </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-700)", fontFamily: "var(--gv-font-body)" }}>{(chip as {label: string; value: string}).value}</span>
                </div>
              ))}
            </div>

            {/* Value proposition */}
            {valueProposition && (
              <div style={{ padding: "10px 14px", background: "var(--gv-color-primary-50)", border: "1px solid var(--gv-color-primary-100)", borderRadius: "var(--gv-radius-sm)", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--gv-color-primary-500)", fontFamily: "var(--gv-font-body)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Value Proposition</div>
                <div style={{ fontSize: 13, color: "var(--gv-color-primary-700)", fontFamily: "var(--gv-font-body)", lineHeight: 1.6 }}>{valueProposition}</div>
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ padding: "10px 12px", background: "var(--gv-color-bg-base)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-800)" }}>{competitors.length}</div>
                <div style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)" }}>Kompetitor<br/>ditemukan</div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--gv-color-bg-base)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-800)" }}>{topics.length}</div>
                <div style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)" }}>Topik konten<br/>teridentifikasi</div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--gv-color-bg-base)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-800)" }}>{opportunities.length}</div>
                <div style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)" }}>Peluang pasar<br/>terbuka</div>
              </div>
            </div>

            {/* Brand pillars */}
            {pillars.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pillars.map((p, i) => (
                  <span key={i} style={{ fontSize: 12, background: "var(--gv-color-bg-base)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-full)", padding: "3px 12px", color: "var(--gv-color-neutral-600)", fontFamily: "var(--gv-font-body)" }}>
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Invitation Letter ───────────────────────────────────────── */}
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl)", overflow: "hidden", boxShadow: "var(--gv7-depth-1)", marginBottom: 28 }}>
          {/* Letter header */}
          <div style={{ padding: "20px 28px 0", fontFamily: "var(--gv-font-body)", color: "var(--gv-color-neutral-400)", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-700)" }}>GeoVera Intelligence Team</div>
              <div>untuk: {brand.brand_name}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>dari: Tim GeoVera</div>
              <div>{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ margin: "16px 28px 0", height: 1, background: "var(--gv-color-neutral-100)" }} />

          {/* Letter body */}
          <div style={{ padding: "24px 28px 28px", fontFamily: "var(--gv-font-body)" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--gv-color-neutral-900)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Kepada {brand.brand_name},
            </p>
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-700)", lineHeight: 1.8, margin: "0 0 14px" }}>
              Kami baru saja menyelesaikan analisis mendalam terhadap brand kamu menggunakan AI.
              {industry && ` Di industri ${industry},`} kami melihat brand dengan potensi nyata yang belum dimaksimalkan —
              {marketPosition ? ` ${marketPosition.toLowerCase()}.` : " dan GeoVera hadir untuk membantu kamu memanfaatkannya."}
            </p>

            {opportunities.length > 0 && (
              <div style={{ padding: "14px 16px", background: "var(--gv-color-success-50)", border: "1px solid var(--gv-color-success-200)", borderRadius: "var(--gv-radius-sm)", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gv-color-success-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Peluang yang kami temukan untuk {brand.brand_name}:
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {opportunities.slice(0, 4).map((opp, i) => (
                    <li key={i} style={{ fontSize: 13, color: "var(--gv-color-success-800)", lineHeight: 1.5 }}>{opp}</li>
                  ))}
                </ul>
              </div>
            )}

            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-700)", lineHeight: 1.8, margin: "0 0 14px" }}>
              {competitors.length > 0 && (
                <>Kami menemukan <strong>{competitors.length} kompetitor utama</strong> yang aktif di ruang ini. </>
              )}
              {topics.length > 0 && (
                <>Ada <strong>{topics.length} topik konten</strong> yang bisa kamu dominasi dan <strong>peluang SEO</strong> yang belum dimanfaatkan. </>
              )}
              Ini adalah kesempatan nyata untuk membangun kehadiran digital yang kuat dan ditemukan oleh orang yang tepat.
            </p>

            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-700)", lineHeight: 1.8, margin: "0 0 20px" }}>
              GeoVera dirancang untuk membantu brand seperti {brand.brand_name} — untuk tidak hanya terlihat,
              tapi <strong style={{ color: "var(--gv-color-neutral-900)" }}>direkomendasikan</strong> dan{" "}
              <strong style={{ color: "var(--gv-color-neutral-900)" }}>dipercaya</strong> oleh audience yang tepat.
            </p>

            <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", fontStyle: "italic", borderTop: "1px solid var(--gv-color-neutral-100)", paddingTop: 16 }}>
              Salam,<br/>
              <strong style={{ fontStyle: "normal", color: "var(--gv-color-neutral-700)" }}>Tim GeoVera</strong>
              <span style={{ marginLeft: 8 }}>· support@geovera.xyz</span>
            </div>
          </div>
        </div>

        {/* ── What GeoVera can do ─────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.03em", margin: "0 0 6px" }}>
              Yang bisa GeoVera lakukan untuk kamu
            </h2>
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", margin: 0 }}>
              Lebih dari sekedar analisis — GeoVera adalah mesin pertumbuhan brand kamu.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {GV_CAPABILITIES.map((cap, i) => (
              <div key={i} style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl)", padding: "20px", boxShadow: "var(--gv7-depth-1)" }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{cap.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-800)", fontFamily: "var(--gv-font-body)", marginBottom: 8 }}>{cap.title}</div>
                <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", lineHeight: 1.6 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA → Pricing ────────────────────────────────────────────── */}
        <div style={{ background: "var(--gv-color-primary-900)", borderRadius: "var(--gv-radius-xl)", padding: "40px 32px", textAlign: "center", position: "relative", overflow: "hidden", boxShadow: "var(--gv7-depth-3)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(122,179,171,0.22) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "var(--gv-radius-full)", padding: "6px 16px", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "var(--gv-font-body)", fontWeight: 500 }}>
                {competitors.length > 0 && `${competitors.length} kompetitor kamu sudah online · `}Brand Intelligence siap untuk di-unlock
              </span>
            </div>

            <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 28, fontWeight: 900, color: "white", letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.15 }}>
              Mulai bersama GeoVera sekarang.
            </h2>
            <p style={{ fontSize: 14, color: "var(--gv-color-primary-200)", fontFamily: "var(--gv-font-body)", marginBottom: 32, lineHeight: 1.7, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
              Buka akses penuh ke competitor intelligence, content calendar AI, brand AI chat, dan semua tools yang dibutuhkan untuk mendominasi niche kamu.
            </p>

            <a
              href="/subscription"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--gv-gradient-primary)", color: "white", borderRadius: "var(--gv-radius-md)", padding: "15px 32px", fontSize: 15, fontWeight: 700, textDecoration: "none", fontFamily: "var(--gv-font-body)", boxShadow: "0 6px 24px rgba(95,143,139,0.5)" }}
            >
              Lihat Paket & Harga
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12M10 4l5 5-5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>

            <div style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "var(--gv-font-body)" }}>
              Mulai dari Rp 299.000/bulan · Bisa cancel kapan saja
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <span style={{ fontSize: 12, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
            Butuh bantuan?{" "}
            <strong style={{ color: "var(--gv-color-neutral-600)" }}>support@geovera.xyz</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
