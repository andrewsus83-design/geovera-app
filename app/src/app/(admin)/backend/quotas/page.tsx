"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PlanName = "trial" | "basic" | "pro" | "enterprise";

interface PlanQuota {
  plan_name: PlanName;
  // Feature toggles
  feature_start_enabled: boolean;
  feature_ai_chat_enabled: boolean;
  feature_content_enabled: boolean;
  feature_reply_enabled: boolean;
  feature_report_enabled: boolean;
  feature_chronicle_enabled: boolean;
  // Start
  brands_limit: number;
  onboarding_runs_limit: number;
  // AI Chat
  ai_chat_messages_per_day: number;
  suggested_prompts_per_day: number;
  // Content
  content_articles_per_month: number;
  content_images_per_month: number;
  content_videos_per_month: number;
  // QA
  qa_tier: string;
  qa_runs_per_cycle: number;
  qa_probes_total: number;
  // Report
  reports_per_month: number;
  // Reply / Chronicle
  auto_reply_per_day: number;
  auto_publish_per_month: number;
  chronicle_runs_per_cycle: number;
}

const PLANS: PlanName[] = ["trial", "basic", "pro", "enterprise"];

const PLAN_COLORS: Record<PlanName, string> = {
  trial: "var(--gv-color-neutral-400)",
  basic: "var(--gv-color-primary-500)",
  pro: "#7c3aed",
  enterprise: "#d97706",
};

const PLAN_LABELS: Record<PlanName, string> = {
  trial: "Trial",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

const FEATURES: Array<{ key: keyof PlanQuota; label: string; menu: string }> = [
  { key: "feature_start_enabled",     label: "Start / Onboarding",  menu: "Start" },
  { key: "feature_ai_chat_enabled",   label: "AI Chat",              menu: "AI Chat" },
  { key: "feature_content_enabled",   label: "Content Generation",   menu: "Content" },
  { key: "feature_reply_enabled",     label: "Auto Reply (Late API)",menu: "Reply" },
  { key: "feature_report_enabled",    label: "Report",               menu: "Report" },
  { key: "feature_chronicle_enabled", label: "Chronicle (14D)",      menu: "Chronicle" },
];

const QUOTA_FIELDS: Array<{ key: keyof PlanQuota; label: string; section: string; type?: "select" }> = [
  // Start
  { key: "brands_limit",           label: "Brand profiles limit",     section: "Start" },
  { key: "onboarding_runs_limit",  label: "Onboarding pipeline runs", section: "Start" },
  // AI Chat
  { key: "ai_chat_messages_per_day",   label: "AI Chat messages / day",     section: "AI Chat" },
  { key: "suggested_prompts_per_day",  label: "Suggested prompts / day",    section: "AI Chat" },
  // Content
  { key: "content_articles_per_month", label: "Articles / month",    section: "Content" },
  { key: "content_images_per_month",   label: "Images / month",      section: "Content" },
  { key: "content_videos_per_month",   label: "Videos / month",      section: "Content" },
  // QA
  { key: "qa_tier",              label: "QA tier",               section: "QA", type: "select" },
  { key: "qa_runs_per_cycle",    label: "QA runs / biweek cycle", section: "QA" },
  { key: "qa_probes_total",      label: "Total QA probes",        section: "QA" },
  // Report
  { key: "reports_per_month",    label: "Reports / month",        section: "Report" },
  // Reply / Chronicle
  { key: "auto_reply_per_day",          label: "Auto replies / day",       section: "Reply" },
  { key: "auto_publish_per_month",      label: "Auto publishes / month",   section: "Reply" },
  { key: "chronicle_runs_per_cycle",    label: "Chronicle runs / 14D",     section: "Chronicle" },
];

const SECTIONS = ["Start", "AI Chat", "Content", "QA", "Report", "Reply", "Chronicle"];

const DEFAULT_QUOTA: PlanQuota = {
  plan_name: "basic",
  feature_start_enabled: true, feature_ai_chat_enabled: true, feature_content_enabled: true,
  feature_reply_enabled: false, feature_report_enabled: true, feature_chronicle_enabled: false,
  brands_limit: 1, onboarding_runs_limit: 1,
  ai_chat_messages_per_day: 20, suggested_prompts_per_day: 5,
  content_articles_per_month: 10, content_images_per_month: 5, content_videos_per_month: 0,
  qa_tier: "basic", qa_runs_per_cycle: 1, qa_probes_total: 15,
  reports_per_month: 3,
  auto_reply_per_day: 0, auto_publish_per_month: 0, chronicle_runs_per_cycle: 0,
};

export default function QuotasPage() {
  const [quotas, setQuotas] = useState<Record<PlanName, PlanQuota>>({} as Record<PlanName, PlanQuota>);
  const [activePlan, setActivePlan] = useState<PlanName>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    supabase.from("plan_quotas").select("*").then(({ data }) => {
      const map = {} as Record<PlanName, PlanQuota>;
      PLANS.forEach(p => { map[p] = { ...DEFAULT_QUOTA, plan_name: p }; });
      (data ?? []).forEach((row: PlanQuota) => { if (row.plan_name) map[row.plan_name as PlanName] = row; });
      setQuotas(map);
      setLoading(false);
    });
  }, []);

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(""), 3500);
  }

  function updateField(key: keyof PlanQuota, value: boolean | number | string) {
    setQuotas(q => ({ ...q, [activePlan]: { ...q[activePlan], [key]: value } }));
  }

  async function savePlan() {
    setSaving(true);
    const row = quotas[activePlan];
    const { error } = await supabase.from("plan_quotas").upsert(row, { onConflict: "plan_name" });
    setSaving(false);
    if (error) {
      showToast(`Gagal: ${error.message}`, true);
    } else {
      showToast(`Plan "${PLAN_LABELS[activePlan]}" berhasil disimpan!`);
    }
  }

  const plan = quotas[activePlan];

  return (
    <div style={{ padding: 32, maxWidth: 740 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: toastError ? "var(--gv-color-danger-600)" : "var(--gv-color-neutral-900)",
          color: "white", padding: "12px 20px", borderRadius: 10,
          fontSize: 14, fontFamily: "var(--gv-font-body)", boxShadow: "var(--gv-shadow-modal)",
        }}>{toast}</div>
      )}

      <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 700, color: "var(--gv-color-neutral-900)", margin: "0 0 6px" }}>
        Quota Management
      </h1>
      <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", margin: "0 0 28px" }}>
        Atur fitur dan kuota untuk setiap plan. Nilai <code style={{ background: "var(--gv-color-neutral-100)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>-1</code> = unlimited.
      </p>

      {/* Plan Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {PLANS.map(p => (
          <button
            key={p}
            onClick={() => setActivePlan(p)}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "var(--gv-font-body)",
              background: activePlan === p ? PLAN_COLORS[p] : "var(--gv-color-neutral-100)",
              color: activePlan === p ? "white" : "var(--gv-color-neutral-600)",
              transition: "all 0.15s",
            }}
          >{PLAN_LABELS[p]}</button>
        ))}
      </div>

      {loading || !plan ? (
        <div style={{ color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>Memuat…</div>
      ) : (
        <>
          {/* Feature Toggles */}
          <div style={{ background: "var(--gv-color-bg-surface)", borderRadius: "var(--gv-radius-lg)", boxShadow: "var(--gv-shadow-card)", padding: 24, marginBottom: 20 }}>
            <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-700)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>
              FITUR AKTIF
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {FEATURES.map(f => (
                <label key={f.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--gv-color-neutral-150)", background: "var(--gv-color-bg-base)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-800)", fontFamily: "var(--gv-font-body)" }}>{f.menu}</div>
                    <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>{f.label}</div>
                  </div>
                  <div
                    onClick={() => updateField(f.key, !(plan[f.key] as boolean))}
                    style={{
                      width: 40, height: 22, borderRadius: 11,
                      background: plan[f.key] ? PLAN_COLORS[activePlan] : "var(--gv-color-neutral-200)",
                      position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3,
                      left: plan[f.key] ? 21 : 3,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "white", transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Quota Numbers per section */}
          {SECTIONS.map(section => {
            const fields = QUOTA_FIELDS.filter(f => f.section === section);
            if (!fields.length) return null;
            return (
              <div key={section} style={{ background: "var(--gv-color-bg-surface)", borderRadius: "var(--gv-radius-lg)", boxShadow: "var(--gv-shadow-card)", padding: 24, marginBottom: 16 }}>
                <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {section}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {fields.map(f => (
                    <div key={f.key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-600)", marginBottom: 5, fontFamily: "var(--gv-font-body)" }}>
                        {f.label}
                      </label>
                      {f.type === "select" ? (
                        <select
                          value={String(plan[f.key])}
                          onChange={e => updateField(f.key, e.target.value)}
                          style={{ width: "100%", height: 38, padding: "0 10px", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 8, fontSize: 13, fontFamily: "var(--gv-font-body)", background: "var(--gv-color-bg-base)", cursor: "pointer" }}
                        >
                          <option value="basic">Basic (15 probes)</option>
                          <option value="pro">Pro (30 probes)</option>
                          <option value="enterprise">Enterprise (50 probes)</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={-1}
                          value={plan[f.key] as number}
                          onChange={e => updateField(f.key, Number(e.target.value))}
                          placeholder="-1 = unlimited"
                          style={{ width: "100%", height: 38, padding: "0 10px", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 8, fontSize: 13, fontFamily: "var(--gv-font-body)", boxSizing: "border-box", background: "var(--gv-color-bg-base)" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            disabled={saving}
            onClick={savePlan}
            style={{
              width: "100%", height: 48, borderRadius: 10, border: "none",
              background: saving ? "var(--gv-color-primary-300)" : PLAN_COLORS[activePlan],
              color: "white", fontSize: 15, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "var(--gv-font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {saving ? (
              <><div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", animation: "gv-spin 0.8s linear infinite" }} />Menyimpan…</>
            ) : `Simpan Plan ${PLAN_LABELS[activePlan]}`}
          </button>
        </>
      )}
    </div>
  );
}
