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
  brands_limit: number;
  ai_chat_messages_per_day: number;
  content_articles_per_month: number;
  content_images_per_month: number;
  content_videos_per_month: number;
  reports_per_month: number;
  feature_chronicle_enabled: boolean;
  feature_ai_chat_enabled: boolean;
  feature_content_enabled: boolean;
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
  if (q.brands_limit !== 0) features.push(fmt(q.brands_limit, "brand"));
  if (q.feature_ai_chat_enabled) {
    features.push(
      q.ai_chat_messages_per_day === -1
        ? "Unlimited AI chat/hari"
        : `${q.ai_chat_messages_per_day} AI chat messages/hari`
    );
  }
  if (q.feature_content_enabled) {
    features.push(
      q.content_articles_per_month === -1
        ? "Unlimited artikel/hari"
        : `${q.content_articles_per_month} artikel/hari`
    );
    features.push(
      q.content_images_per_month === -1
        ? "Unlimited gambar/hari"
        : `${q.content_images_per_month} gambar/hari`
    );
    if (q.content_videos_per_month !== 0) {
      features.push(
        q.content_videos_per_month === -1
          ? "Unlimited video/hari"
          : `${q.content_videos_per_month} video/hari`
      );
    }
  }
  features.push(
    q.reports_per_month === -1
      ? "Unlimited reports/bulan"
      : `${q.reports_per_month} brand report/bulan`
  );
  if (q.feature_chronicle_enabled) features.push("Brand Chronicle included");
  return features;
}

const PLAN_COLORS: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  basic: {
    bg: "var(--gv-color-neutral-50)",
    border: "var(--gv-color-neutral-200)",
    text: "var(--gv-color-neutral-900)",
    sub: "var(--gv-color-neutral-500)",
  },
  premium: {
    bg: "var(--gv-color-primary-50, #EDF5F4)",
    border: "var(--gv-color-primary-300, #82C8C4)",
    text: "var(--gv-color-primary-900, #0f2926)",
    sub: "var(--gv-color-primary-600, #2a6b65)",
  },
  enterprise: {
    bg: "#1a2e2b",
    border: "#2e4a45",
    text: "#ffffff",
    sub: "#9dddd9",
  },
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
            .select("plan_name, brands_limit, ai_chat_messages_per_day, content_articles_per_month, content_images_per_month, content_videos_per_month, reports_per_month, feature_chronicle_enabled, feature_ai_chat_enabled, feature_content_enabled"),
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
        router.push("/getting-started");
      } else {
        setError(data.error || "Gagal aktivasi free trial.");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    }
    setSubmitting(null);
  }

  // ── SUCCESS STATE ──────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex h-full overflow-hidden" style={{ background: "var(--gv-color-bg-base)" }}>
        <div className="hidden lg:block flex-shrink-0 w-[88px]"><NavColumn /></div>
        <div className="hidden lg:block flex-shrink-0 w-4" />
        <div
          className="flex flex-col flex-1 min-w-0 overflow-y-auto lg:rounded-[32px] my-0 lg:my-4 custom-scrollbar"
          style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", boxShadow: "var(--gv-shadow-card)" }}
        >
          <div className="p-6 lg:p-10 flex flex-col items-center text-center max-w-lg mx-auto w-full">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
              style={{ background: "var(--gv-color-primary-100, #C8E6E4)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h1 className="text-[24px] font-bold mb-2" style={{ color: "var(--gv-color-neutral-900)", fontFamily: "Georgia, serif" }}>
              Permintaan Terkirim!
            </h1>
            <p className="text-[14px] mb-8" style={{ color: "var(--gv-color-neutral-500)" }}>
              Invoice <strong style={{ color: "var(--gv-color-neutral-800)" }}>{success.invoice_number}</strong> untuk plan{" "}
              <strong style={{ color: "var(--gv-color-neutral-800)" }}>{success.plan_name}</strong> telah dikirim ke email kamu.
            </p>

            {/* Amount */}
            <div className="w-full p-5 rounded-[18px] mb-4 text-left"
              style={{ background: "var(--gv-color-primary-50, #EDF5F4)", border: "1px solid var(--gv-color-primary-200, #A8D5D2)" }}>
              <p className="text-[12px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--gv-color-primary-600, #2a6b65)" }}>Jumlah Transfer</p>
              <p className="text-[28px] font-bold" style={{ color: "var(--gv-color-primary-800, #1a3d38)" }}>
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(success.plan_price_idr)}
              </p>
            </div>

            {/* Bank details */}
            <div className="w-full p-5 rounded-[18px] mb-6 text-left"
              style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-200)" }}>
              <p className="text-[12px] font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--gv-color-neutral-500)" }}>Info Transfer</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Bank", value: success.bank_settings.bank_name },
                  { label: "No. Rekening", value: success.bank_settings.bank_account_no },
                  { label: "Atas Nama", value: success.bank_settings.bank_account_name },
                  { label: "Berita Transfer", value: success.invoice_number },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-[13px]" style={{ color: "var(--gv-color-neutral-500)" }}>{label}</span>
                    <span className="text-[13px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>{value}</span>
                  </div>
                ))}
              </div>
              {success.bank_settings.bank_transfer_note && (
                <p className="text-[12px] mt-4 p-3 rounded-[10px]"
                  style={{ background: "var(--gv-color-neutral-100)", color: "var(--gv-color-neutral-600)" }}>
                  {success.bank_settings.bank_transfer_note}
                </p>
              )}
            </div>

            <p className="text-[12px]" style={{ color: "var(--gv-color-neutral-400)" }}>
              Akun kamu akan diaktifkan setelah tim GeoVera memverifikasi pembayaran (maks. 1×24 jam hari kerja).
            </p>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-6 px-6 py-3 rounded-[12px] text-[14px] font-semibold"
              style={{ background: "var(--gv-color-primary-600)", color: "white" }}
            >
              Kembali ke Dashboard
            </button>
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
              style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
              <span className="text-[20px]">⏳</span>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "#92400E" }}>
                  Menunggu konfirmasi pembayaran
                </p>
                <p className="text-[12px]" style={{ color: "#B45309" }}>
                  Tim GeoVera akan mengaktifkan akun kamu setelah pembayaran dikonfirmasi.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 rounded-[12px] text-[13px]"
              style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
              {error}
            </div>
          )}

          {/* Plans grid */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--gv-color-primary-400)" }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const colors = PLAN_COLORS[plan.slug] ?? PLAN_COLORS.basic;
                const quota = quotas[QUOTA_NAME_MAP[plan.slug] ?? plan.slug];
                const features = quota ? quotaToFeatures(quota) : [];
                const isActive = currentSub?.status === "active" && currentSub?.plan_id === plan.id;
                const isLoading = submitting === plan.id;

                return (
                  <div
                    key={plan.id}
                    className="rounded-[20px] p-6 flex flex-col"
                    style={{
                      background: colors.bg,
                      border: isActive ? "2px solid var(--gv-color-primary-500)" : `1px solid ${colors.border}`,
                    }}
                  >
                    {plan.is_popular && (
                      <div className="text-[11px] font-bold uppercase tracking-wider mb-3"
                        style={{ color: "var(--gv-color-primary-500)" }}>
                        ⭐ Most Popular
                      </div>
                    )}

                    <h2 className="text-[22px] font-bold mb-1" style={{ color: colors.text }}>
                      {plan.name}
                    </h2>
                    <p className="text-[13px] mb-4" style={{ color: colors.sub }}>
                      {plan.description}
                    </p>

                    <div className="flex items-end gap-1 mb-6">
                      <span className="text-[30px] font-bold" style={{ color: colors.text }}>
                        {formatIDR(plan.price_idr)}
                      </span>
                      <span className="text-[13px] mb-1.5" style={{ color: colors.sub }}>/bulan</span>
                    </div>

                    <ul className="flex flex-col gap-2 mb-6 flex-1">
                      {features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-[13px]"
                          style={{ color: plan.slug === "enterprise" ? "#ccc" : "var(--gv-color-neutral-600)" }}>
                          <span style={{ color: plan.slug === "enterprise" ? "#9dddd9" : "var(--gv-color-primary-500)" }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isActive || isLoading}
                      className="w-full py-3 rounded-[12px] text-[14px] font-bold transition-all"
                      style={{
                        background: isActive
                          ? "var(--gv-color-neutral-200)"
                          : plan.slug === "enterprise"
                            ? "white"
                            : "var(--gv-color-primary-600)",
                        color: isActive
                          ? "var(--gv-color-neutral-400)"
                          : plan.slug === "enterprise"
                            ? "#1a2e2b"
                            : "white",
                        opacity: isLoading ? 0.7 : 1,
                      }}
                    >
                      {isLoading ? "Memproses..." : isActive ? "Plan Aktif" : `Pilih ${plan.name}`}
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
