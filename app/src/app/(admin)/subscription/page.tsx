"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavColumn from "@/components/shared/NavColumn";
import { supabase } from "@/lib/supabase";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_idr: number;
  is_popular: boolean;
}

interface PlanQuota {
  plan_name: string;
  // Feature toggles
  feature_start_enabled: boolean;
  feature_ai_chat_enabled: boolean;
  feature_content_enabled: boolean;
  feature_reply_enabled: boolean;
  feature_report_enabled: boolean;
  feature_chronicle_enabled: boolean;
  // Limits
  brands_limit: number;
  onboarding_runs_limit: number;
  ai_chat_messages_per_day: number;
  suggested_prompts_per_day: number;
  content_articles_per_day: number;
  content_articles_short_per_day: number;
  content_articles_medium_per_day: number;
  content_articles_long_per_day: number;
  content_articles_verylong_per_day: number;
  analytics_keywords_tracked: number;
  analytics_topics_tracked: number;
  content_images_per_day: number;
  content_videos_per_day: number;
  qa_tier: string;
  qa_runs_per_cycle: number;
  qa_probes_total: number;
  reports_per_month: number;
  auto_reply_per_5min: number;
  auto_publish_per_month: number;
  chronicle_runs_per_cycle: number;
}

interface BankSettings {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  bank_transfer_note: string;
}

interface SuccessState {
  invoice_number: string;
  plan_name: string;
  plan_price_idr: number;
  bank_settings: BankSettings;
}

// Maps plans.slug → plan_quotas.plan_name
const QUOTA_NAME_MAP: Record<string, string> = {
  basic: "basic",
  premium: "pro",
  enterprise: "enterprise",
};

function fmt(n: number, singular: string, plural?: string): string {
  if (n === -1) return `Unlimited ${plural ?? singular}`;
  return `${n} ${n === 1 ? singular : (plural ?? singular)}`;
}

function quotaToFeatures(q: PlanQuota): string[] {
  const features: string[] = [];

  // Brands
  if (q.brands_limit !== 0)
    features.push(q.brands_limit === -1 ? "Unlimited brand" : `${q.brands_limit} brand`);

  // Onboarding
  if (q.feature_start_enabled && q.onboarding_runs_limit !== 0)
    features.push(q.onboarding_runs_limit === -1 ? "Unlimited brand onboarding" : `${q.onboarding_runs_limit}x brand onboarding`);

  // AI Chat
  if (q.feature_ai_chat_enabled) {
    features.push(q.ai_chat_messages_per_day === -1 ? "Unlimited AI chat/hari" : `${q.ai_chat_messages_per_day} AI chat messages/hari`);
    if (q.suggested_prompts_per_day !== 0)
      features.push(q.suggested_prompts_per_day === -1 ? "Unlimited suggested prompts/hari" : `${q.suggested_prompts_per_day} suggested prompts/hari`);
  }

  // Content
  if (q.feature_content_enabled) {
    if (q.content_articles_short_per_day !== 0)
      features.push(q.content_articles_short_per_day === -1 ? "Unlimited artikel short/hari" : `${q.content_articles_short_per_day} artikel short (≤300w)/hari`);
    if (q.content_articles_medium_per_day !== 0)
      features.push(q.content_articles_medium_per_day === -1 ? "Unlimited artikel medium/hari" : `${q.content_articles_medium_per_day} artikel medium (≤800w)/hari`);
    if (q.content_articles_long_per_day !== 0)
      features.push(q.content_articles_long_per_day === -1 ? "Unlimited artikel long/hari" : `${q.content_articles_long_per_day} artikel long (≤1500w)/hari`);
    if (q.content_articles_verylong_per_day !== 0)
      features.push(q.content_articles_verylong_per_day === -1 ? "Unlimited artikel very long/hari" : `${q.content_articles_verylong_per_day} artikel very long (3000w+)/hari`);
    if (q.content_images_per_day !== 0)
      features.push(q.content_images_per_day === -1 ? "Unlimited gambar/hari" : `${q.content_images_per_day} gambar/hari`);
    if (q.content_videos_per_day !== 0)
      features.push(q.content_videos_per_day === -1 ? "Unlimited video/hari" : `${q.content_videos_per_day} video/hari`);
    if (q.auto_publish_per_month !== 0)
      features.push(q.auto_publish_per_month === -1 ? "Unlimited auto-publish/bulan" : `${q.auto_publish_per_month} auto-publish/bulan`);
  }

  // Analytics
  if (q.feature_report_enabled) {
    features.push("Analytics (SEO · GEO · Social)");
    if (q.analytics_keywords_tracked !== 0)
      features.push(q.analytics_keywords_tracked === -1 ? "Unlimited keywords tracked" : `${q.analytics_keywords_tracked} keywords tracked & optimized`);
    if (q.analytics_topics_tracked !== 0)
      features.push(q.analytics_topics_tracked === -1 ? "Unlimited topics tracked" : `${q.analytics_topics_tracked} topics tracked & optimized`);
    if (q.reports_per_month !== 0)
      features.push(q.reports_per_month === -1 ? "Unlimited analytic cycles/bulan" : `${q.reports_per_month} analytic cycles/bulan`);
  }

  // Reply
  if (q.feature_reply_enabled && q.auto_reply_per_5min !== 0)
    features.push(q.auto_reply_per_5min === -1 ? "Unlimited auto-reply" : `${q.auto_reply_per_5min} auto-reply per 5 menit`);

  // QA
  if (q.qa_tier && q.qa_tier !== "none") {
    features.push(`QA tier: ${q.qa_tier}`);
    if (q.qa_probes_total !== 0)
      features.push(q.qa_probes_total === -1 ? "Unlimited QA probes/cycle" : `${q.qa_probes_total} QA probes/cycle`);
  }

  // Chronicle
  if (q.feature_chronicle_enabled) {
    features.push("Brand Chronicle");
    if (q.chronicle_runs_per_cycle !== 0)
      features.push(q.chronicle_runs_per_cycle === -1 ? "Unlimited chronicle cycles" : `${q.chronicle_runs_per_cycle} chronicle runs/cycle`);
  }

  return features;
}

// DS v5.9 — use gv-pricing-card pattern (BL01)
const PLAN_FEATURED: Record<string, "starter" | "pro" | "scale"> = {
  basic: "starter",
  premium: "pro",
  enterprise: "scale",
};

function formatIDR(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quotas, setQuotas] = useState<Record<string, PlanQuota>>({});
  const [currentSub, setCurrentSub] = useState<{ status: string; plan_id?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [{ data: plansData }, { data: quotasData }] = await Promise.all([
          supabase
            .from("plans")
            .select("id, name, slug, description, price_idr, is_popular")
            .eq("is_active", true)
            .order("price_idr", { ascending: true }),
          supabase
            .from("plan_quotas")
            .select("*"),
        ]);

        if (plansData) setPlans(plansData);
        if (quotasData) {
          const map: Record<string, PlanQuota> = {};
          quotasData.forEach((q) => { map[q.plan_name] = q; });
          setQuotas(map);
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const res = await fetch("/api/payment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: "get_subscription", user_id: session.user.id }),
          });
          const data = await res.json();
          if (data.success && data.subscription) {
            setCurrentSub({
              status: data.subscription.status,
              plan_id: data.subscription.plan_id,
            });
          }
        }
      } catch {
        // ignore load errors
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSelectPlan(plan: Plan) {
    setSubmitting(plan.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Belum login");

      const res = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "request_subscription",
          user_id: session.user.id,
          plan_id: plan.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data);
      } else {
        setError(data.error || "Gagal membuat permintaan. Coba lagi.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan. Coba lagi.");
    }
    setSubmitting(null);
  }

  async function handleFreeTrial() {
    setSubmitting("free");
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Belum login");

      const res = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "activate_free_tier", user_id: session.user.id }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/analytics");
      } else {
        setError(data.error || "Gagal aktivasi free trial.");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    }
    setSubmitting(null);
  }

  // ── SUCCESS STATE — BL07 gv-payment-success ───────────────────────
  if (success) {
    const fmtIDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(success.plan_price_idr);
    return (
      <div className="flex h-full overflow-hidden" style={{ background: "var(--gv-color-bg-base)" }}>
        <div className="hidden lg:block flex-shrink-0 w-[88px]"><NavColumn /></div>
        <div className="hidden lg:block flex-shrink-0 w-4" />
        <div
          className="flex flex-col flex-1 min-w-0 overflow-y-auto lg:rounded-[32px] my-0 lg:my-4 custom-scrollbar"
          style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", boxShadow: "var(--gv-shadow-card)" }}
        >
          <div style={{ padding: "40px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              background: "var(--gv-color-bg-surface)",
              border: "1.5px solid var(--gv-color-neutral-200)",
              borderRadius: "var(--gv-radius-xl)",
              overflow: "hidden",
              textAlign: "center",
              maxWidth: 520,
              width: "100%",
              boxShadow: "var(--gv7-depth-2)",
            }}>
              {/* Dark hero — BL07 gv-ps-hero */}
              <div style={{
                padding: "40px 32px 32px",
                background: "var(--gv-color-primary-900)",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(122,179,171,0.25) 0%, transparent 70%)" }} />
                {/* Animated pulse ring */}
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  margin: "0 auto 16px",
                  position: "relative", zIndex: 1,
                  background: "rgba(16,185,129,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    position: "absolute", inset: -6, borderRadius: "50%",
                    border: "2px solid rgba(16,185,129,0.3)",
                    animation: "gv-ss-blink 2s ease-in-out infinite",
                  }} />
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "var(--gv-color-success-500)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 6px 20px rgba(16,185,129,0.4)",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 24, fontWeight: 900, color: "var(--gv-color-bg-surface)", letterSpacing: "-0.04em", marginBottom: 6, position: "relative", zIndex: 1 }}>
                  Permintaan Terkirim!
                </div>
                <div style={{ fontSize: 13, color: "var(--gv-color-primary-200)", lineHeight: 1.6, position: "relative", zIndex: 1 }}>
                  Invoice <strong>{success.invoice_number}</strong> telah dikirim ke email kamu
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "24px 32px" }}>
                {/* Amount */}
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 38, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.05em", lineHeight: 1, marginBottom: 4 }}>
                  {fmtIDR}
                </div>
                <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20 }}>
                  {success.plan_name} · 1 Bulan
                </div>

                {/* Details */}
                <div style={{ background: "var(--gv-color-bg-surface-elevated)", border: "1px solid var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-md)", padding: 16, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20, textAlign: "left" }}>
                  {[
                    { label: "Bank", value: success.bank_settings.bank_name },
                    { label: "No. Rekening", value: success.bank_settings.bank_account_no },
                    { label: "Atas Nama", value: success.bank_settings.bank_account_name },
                    { label: "Berita Transfer", value: success.invoice_number },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)" }}>{label}</span>
                      <span style={{ fontWeight: 600, color: "var(--gv-color-neutral-900)", fontFamily: label === "Berita Transfer" ? "var(--gv-font-mono)" : "var(--gv-font-body)" }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => router.push(`/payment/proof/${success.invoice_number}`)}
                    style={{ flex: 1, padding: 11, borderRadius: "var(--gv-radius-sm)", fontFamily: "var(--gv-font-body)", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: "var(--gv-gradient-primary)", color: "var(--gv-color-bg-surface)", boxShadow: "0 3px 12px rgba(95,143,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M2 6l5-5 5 5M1 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Upload Bukti Transfer
                  </button>
                  <button
                    onClick={() => router.push("/analytics")}
                    style={{ flex: 1, padding: 11, borderRadius: "var(--gv-radius-sm)", fontFamily: "var(--gv-font-body)", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "var(--gv-color-bg-surface)", color: "var(--gv-color-neutral-700)", border: "1.5px solid var(--gv-color-neutral-200)" }}
                  >
                    Ke Dashboard
                  </button>
                </div>

                <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", textAlign: "center", lineHeight: 1.6, marginTop: 16, fontFamily: "var(--gv-font-body)" }}>
                  Akun aktif setelah verifikasi admin · maks. 1×24 jam kerja
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden lg:block flex-shrink-0 w-4" />
      </div>
    );
  }

  // ── MAIN PAGE ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--gv-color-bg-base)" }}>
      <div className="hidden lg:block flex-shrink-0 w-[88px]"><NavColumn /></div>
      <div className="hidden lg:block flex-shrink-0 w-4" />

      <div
        className="flex flex-col flex-1 min-w-0 overflow-y-auto lg:rounded-[32px] my-0 lg:my-4 custom-scrollbar"
        style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", boxShadow: "var(--gv-shadow-card)" }}
      >
        <div className="p-6 lg:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2" style={{ color: "var(--gv-color-neutral-900)", fontFamily: "Georgia, serif" }}>
              Pilih Plan GeoVera
            </h1>
            <p className="text-[15px]" style={{ color: "var(--gv-color-neutral-500)" }}>
              Semua plan termasuk AI CMO, content generation, dan competitive intelligence.
            </p>
          </div>

          {/* Current subscription banner */}
          {currentSub && currentSub.status === "active" && (
            <div className="mb-6 p-4 rounded-[16px] flex items-center gap-3"
              style={{ background: "var(--gv-color-primary-50, #EDF5F4)", border: "1px solid var(--gv-color-primary-200, #A8D5D2)" }}>
              <span className="text-[20px]">✅</span>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--gv-color-primary-800, #1a3d38)" }}>
                  Berlangganan aktif
                </p>
                <p className="text-[12px]" style={{ color: "var(--gv-color-neutral-500)" }}>
                  Plan sedang berjalan
                </p>
              </div>
            </div>
          )}

          {currentSub && currentSub.status === "pending_payment" && (
            <div className="mb-6 p-4 rounded-[16px] flex items-center gap-3"
              style={{ background: "var(--gv-color-warning-50)", border: "1px solid var(--gv-color-warning-500)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}><circle cx="9" cy="9" r="8" stroke="var(--gv-color-warning-500)" strokeWidth="1.5"/><path d="M9 5v4M9 12h.01" stroke="var(--gv-color-warning-700)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--gv-color-warning-700)" }}>
                  Menunggu konfirmasi pembayaran
                </p>
                <p className="text-[12px]" style={{ color: "var(--gv-color-warning-700)", opacity: 0.8 }}>
                  Tim GeoVera akan mengaktifkan akun kamu setelah pembayaran dikonfirmasi.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 rounded-[12px] text-[13px]"
              style={{ background: "var(--gv-color-danger-50)", color: "var(--gv-color-danger-700)", border: "1px solid rgba(239,68,68,0.3)", fontFamily: "var(--gv-font-body)" }}>
              {error}
            </div>
          )}

          {/* Plans grid — BL01 gv-pricing-card */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2.5px solid var(--gv-color-primary-200)", borderTopColor: "var(--gv-color-primary-500)", animation: "gv-spin 0.7s linear infinite" }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const tier = PLAN_FEATURED[plan.slug] ?? "starter";
                const isFeatured = tier === "pro";
                const isScale = tier === "scale";
                const quota = quotas[QUOTA_NAME_MAP[plan.slug] ?? plan.slug];
                const features = quota ? quotaToFeatures(quota) : [];
                const isActive = currentSub?.status === "active" && currentSub?.plan_id === plan.id;
                const isLoading = submitting === plan.id;
                const priceNum = plan.price_idr;
                const priceDisplay = priceNum >= 1_000_000
                  ? `${(priceNum / 1_000_000).toFixed(1)}jt`
                  : `${(priceNum / 1_000).toFixed(0)}rb`;

                return (
                  <div
                    key={plan.id}
                    style={{
                      background: (isFeatured || isScale) ? "var(--gv-color-primary-900)" : "var(--gv-color-bg-surface)",
                      border: `1.5px solid ${isActive ? "var(--gv-color-primary-500)" : isFeatured ? "var(--gv-color-primary-400)" : isScale ? "#2e4a45" : "var(--gv-color-neutral-200)"}`,
                      borderRadius: "var(--gv-radius-xl)",
                      padding: "28px 24px",
                      position: "relative",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: isFeatured ? "var(--gv7-depth-3), 0 0 40px rgba(95,143,139,0.18)" : isActive ? "var(--gv-shadow-focus)" : "var(--gv7-depth-1)",
                    }}
                  >
                    {/* Top gradient accent for featured */}
                    {(isFeatured || isActive) && (
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--gv-gradient-primary)" }} />
                    )}

                    {/* Badge */}
                    <div style={{
                      fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700,
                      padding: "3px 10px", borderRadius: "var(--gv-radius-full)",
                      display: "inline-flex", alignItems: "center", gap: 5,
                      marginBottom: 16, letterSpacing: "0.08em", textTransform: "uppercase", width: "fit-content",
                      background: isFeatured ? "rgba(95,143,139,0.2)" : isScale ? "var(--gv-color-primary-900)" : "var(--gv-color-neutral-100)",
                      color: isFeatured ? "var(--gv-color-primary-200)" : isScale ? "var(--gv-color-primary-200)" : "var(--gv-color-neutral-700)",
                    }}>
                      {isFeatured ? "★ Most Popular" : isScale ? "Enterprise" : "Starter"}
                    </div>

                    {/* Name */}
                    <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4, color: (isFeatured || isScale) ? "var(--gv-color-bg-surface)" : "var(--gv-color-neutral-900)" }}>
                      {plan.name}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 20, color: (isFeatured || isScale) ? "var(--gv-color-primary-200)" : "var(--gv-color-neutral-500)" }}>
                      {plan.description}
                    </div>

                    {/* Price */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 8, color: (isFeatured || isScale) ? "var(--gv-color-primary-200)" : "var(--gv-color-neutral-400)" }}>Rp</span>
                      <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 40, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, color: (isFeatured || isScale) ? "var(--gv-color-bg-surface)" : "var(--gv-color-neutral-900)" }}>
                        {priceDisplay}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, marginBottom: 20, color: (isFeatured || isScale) ? "var(--gv-color-primary-200)" : "var(--gv-color-neutral-400)" }}>
                      /bulan · Transfer bank
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: (isFeatured || isScale) ? "rgba(255,255,255,0.1)" : "var(--gv-color-neutral-200)", marginBottom: 20 }} />

                    {/* Features */}
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, flex: 1 }}>
                      {features.map((f) => (
                        <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, lineHeight: 1.4, color: (isFeatured || isScale) ? "var(--gv-color-primary-100)" : "var(--gv-color-neutral-700)" }}>
                          <div style={{ width: 16, height: 16, borderRadius: "50%", background: isFeatured ? "var(--gv-color-primary-400)" : "var(--gv-color-success-500)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </div>
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isActive || isLoading}
                      style={{
                        width: "100%", padding: "11px 20px",
                        borderRadius: "var(--gv-radius-sm)",
                        fontFamily: "var(--gv-font-body)", fontSize: 13, fontWeight: 700,
                        cursor: isActive || isLoading ? "not-allowed" : "pointer",
                        border: isActive ? "1.5px solid transparent" : isFeatured ? "1.5px solid transparent" : isScale ? "1.5px solid rgba(122,179,171,0.3)" : "1.5px solid var(--gv-color-primary-300)",
                        background: isActive ? "var(--gv-color-neutral-200)" : isFeatured ? "var(--gv-gradient-primary)" : isScale ? "rgba(95,143,139,0.08)" : "var(--gv-color-primary-50)",
                        color: isActive ? "var(--gv-color-neutral-400)" : isFeatured ? "var(--gv-color-bg-surface)" : isScale ? "var(--gv-color-primary-200)" : "var(--gv-color-primary-600)",
                        boxShadow: isFeatured && !isActive ? "0 4px 14px rgba(95,143,139,0.3)" : "none",
                        opacity: isLoading ? 0.7 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        transition: "all var(--gv-duration-fast) var(--gv-easing-spring)",
                      }}
                    >
                      {isLoading ? "Memproses..." : isActive ? "✓ Plan Aktif" : `Pilih ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Free trial */}
          {(!currentSub || currentSub.status === "pending_payment") && (
            <div className="mt-6 text-center">
              <button
                onClick={handleFreeTrial}
                disabled={submitting === "free"}
                className="text-[13px] transition-colors"
                style={{ color: "var(--gv-color-neutral-400)" }}
              >
                {submitting === "free" ? "Mengaktifkan..." : "Lanjut dengan Free Trial →"}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 p-4 rounded-[14px] text-center"
            style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-100)" }}>
            <p className="text-[12px]" style={{ color: "var(--gv-color-neutral-400)" }}>
              Harga dalam IDR · Transfer bank · Aktivasi setelah konfirmasi admin · Tidak ada biaya tersembunyi
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block flex-shrink-0 w-4" />
    </div>
  );
}
