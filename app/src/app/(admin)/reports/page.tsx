"use client";
import React, { useState, useEffect, useCallback } from "react";
import NavColumn from "@/components/shared/NavColumn";
import { supabase } from "@/lib/supabase";
import { useUserQuota } from "@/hooks/useUserQuota";
import FeatureGate from "@/components/shared/FeatureGate";

const BRAND_ID = process.env.NEXT_PUBLIC_brandId || "a37dee82-5ed5-4ba4-991a-4d93dde9ff7a";

interface Report {
  id: string;
  report_type: string;
  report_period_start: string;
  report_period_end: string;
  status: string;
  geo_score_current: number | null;
  geo_score_previous: number | null;
  geo_score_delta: number | null;
  geo_score_trend: string | null;
  total_tasks_created: number | null;
  total_tasks_completed: number | null;
  total_content_published: number | null;
  executive_summary: string | null;
  key_wins: string[] | null;
  key_risks: string[] | null;
  recommendations: string[] | null;
  created_at: string;
}

interface BiweeklyBrief {
  id: string;
  brief_period: string;
  status: string;
  top_opportunities: unknown;
  competitor_moves: unknown;
  done_tasks_count: number | null;
  avg_engagement_delta: number | null;
  claude_analysis: string | null;
  created_at: string;
}

export default function ReportsPage() {
  const { quota, loading: quotaLoading } = useUserQuota();
  const [reports, setReports] = useState<Report[]>([]);
  const [briefs, setBriefs] = useState<BiweeklyBrief[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<BiweeklyBrief | null>(null);
  const [tab, setTab] = useState<"reports" | "briefs">("reports");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase
        .from("gv_reports")
        .select("id, report_type, report_period_start, report_period_end, status, geo_score_current, geo_score_previous, geo_score_delta, geo_score_trend, total_tasks_created, total_tasks_completed, total_content_published, executive_summary, key_wins, key_risks, recommendations, created_at")
        .eq("brand_id", BRAND_ID)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("gv_biweekly_brief")
        .select("id, brief_period, status, top_opportunities, competitor_moves, done_tasks_count, avg_engagement_delta, claude_analysis, created_at")
        .eq("brand_id", BRAND_ID)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (r) setReports(r);
    if (b) setBriefs(b);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateReport() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: BRAND_ID }),
      });
      const data = await res.json();
      if (data.success || data.report_url) {
        setTimeout(() => load(), 3000);
      } else {
        setError(data.error || "Gagal generate report.");
      }
    } catch {
      setError("Terjadi kesalahan saat generate report.");
    }
    setGenerating(false);
  }

  const fmtPeriod = (start: string, end: string) => {
    const s = new Date(start).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    const e = new Date(end).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    return `${s} – ${e}`;
  };

  const trendIcon = (trend: string | null) => {
    if (trend === "up") return <span style={{ color: "#16A34A" }}>↑</span>;
    if (trend === "down") return <span style={{ color: "#DC2626" }}>↓</span>;
    return <span style={{ color: "#94A3B8" }}>→</span>;
  };

  return (
    <FeatureGate enabled={quotaLoading || quota.feature_report_enabled} featureName="Reports">
    <div className="flex h-full overflow-hidden" style={{ background: "var(--gv-color-bg-base)" }}>
      <div className="hidden lg:block flex-shrink-0 w-[88px]"><NavColumn /></div>
      <div className="hidden lg:block flex-shrink-0 w-4" />

      <div
        className="flex flex-col flex-1 min-w-0 overflow-hidden lg:rounded-[32px] my-0 lg:my-4"
        style={{
          background: "var(--gv-color-bg-surface)",
          border: "1px solid var(--gv-color-neutral-200)",
          boxShadow: "var(--gv-shadow-card)",
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4"
          style={{ borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-bold" style={{ color: "var(--gv-color-neutral-900)", fontFamily: "Georgia, serif" }}>
                Laporan & Brief
              </h1>
              <p className="text-[13px] mt-1" style={{ color: "var(--gv-color-neutral-500)" }}>
                Biweekly/monthly reports · strategic briefs · GEO scores
              </p>
            </div>
            <button
              onClick={generateReport}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all"
              style={{ background: "var(--gv-color-primary-600)", color: "white", opacity: generating ? 0.7 : 1 }}
            >
              {generating ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              {generating ? "Generating..." : "Generate Report"}
            </button>
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-[10px] text-[12px]"
              style={{ background: "#FEF2F2", color: "#DC2626" }}>
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4">
            {([
              { key: "reports", label: `Reports (${reports.length})` },
              { key: "briefs", label: `Biweekly Brief (${briefs.length})` },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all"
                style={{
                  background: tab === t.key ? "var(--gv-color-primary-600)" : "transparent",
                  color: tab === t.key ? "white" : "var(--gv-color-neutral-500)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* List */}
          <div className="flex flex-col flex-1 min-w-0 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--gv-color-primary-400)" }} />
              </div>
            ) : tab === "reports" ? (
              reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 p-8 text-center">
                  <span className="text-[48px]">📊</span>
                  <p className="text-[16px] font-semibold" style={{ color: "var(--gv-color-neutral-700)" }}>
                    Belum ada report
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--gv-color-neutral-400)" }}>
                    Report akan otomatis dibuat setelah 14 hari data terkumpul, atau klik "Generate Report" untuk membuat sekarang.
                  </p>
                </div>
              ) : (
                reports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    className="flex items-start gap-4 px-5 py-4 text-left transition-colors"
                    style={{
                      borderBottom: "1px solid var(--gv-color-neutral-100)",
                      background: selected?.id === r.id ? "var(--gv-color-primary-50, #EDF5F4)" : "transparent",
                    }}
                  >
                    <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[18px] flex-shrink-0"
                      style={{ background: "var(--gv-color-primary-100, #C8E6E4)" }}>
                      📊
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
                        {r.report_type === "biweekly" ? "Biweekly Report" : "Monthly Report"}
                        {r.geo_score_current != null && (
                          <span className="ml-2 text-[12px] font-normal"
                            style={{ color: "var(--gv-color-neutral-400)" }}>
                            GEO {r.geo_score_current} {trendIcon(r.geo_score_trend)}
                            {r.geo_score_delta != null && (
                              <span style={{ color: r.geo_score_delta >= 0 ? "#16A34A" : "#DC2626" }}>
                                {r.geo_score_delta >= 0 ? "+" : ""}{r.geo_score_delta.toFixed(1)}
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--gv-color-neutral-400)" }}>
                        {fmtPeriod(r.report_period_start, r.report_period_end)}
                      </p>
                      {r.executive_summary && (
                        <p className="text-[12px] mt-1 line-clamp-2" style={{ color: "var(--gv-color-neutral-500)" }}>
                          {r.executive_summary}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full flex-shrink-0"
                      style={{
                        background: r.status === "delivered" ? "#D1FAE5" : "#FEF9C3",
                        color: r.status === "delivered" ? "#065F46" : "#854D0E",
                      }}>
                      {r.status}
                    </span>
                  </button>
                ))
              )
            ) : (
              // Briefs
              briefs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 p-8 text-center">
                  <span className="text-[48px]">📋</span>
                  <p className="text-[16px] font-semibold" style={{ color: "var(--gv-color-neutral-700)" }}>
                    Belum ada biweekly brief
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--gv-color-neutral-400)" }}>
                    Brief strategis akan dibuat otomatis setiap 14 hari berdasarkan data tasks dan konten.
                  </p>
                </div>
              ) : (
                briefs.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBrief(selectedBrief?.id === b.id ? null : b)}
                    className="flex items-start gap-4 px-5 py-4 text-left transition-colors"
                    style={{
                      borderBottom: "1px solid var(--gv-color-neutral-100)",
                      background: selectedBrief?.id === b.id ? "var(--gv-color-primary-50, #EDF5F4)" : "transparent",
                    }}
                  >
                    <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[18px] flex-shrink-0"
                      style={{ background: "#EEF2FF" }}>
                      📋
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
                        Biweekly Brief — {b.brief_period}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        {b.done_tasks_count != null && (
                          <span className="text-[12px]" style={{ color: "var(--gv-color-neutral-400)" }}>
                            ✅ {b.done_tasks_count} tasks done
                          </span>
                        )}
                        {b.avg_engagement_delta != null && (
                          <span className="text-[12px]"
                            style={{ color: b.avg_engagement_delta >= 0 ? "#16A34A" : "#DC2626" }}>
                            {b.avg_engagement_delta >= 0 ? "↑" : "↓"} {Math.abs(b.avg_engagement_delta).toFixed(1)}% engagement
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full flex-shrink-0"
                      style={{ background: "#D1FAE5", color: "#065F46" }}>
                      {b.status}
                    </span>
                  </button>
                ))
              )
            )}
          </div>

          {/* Detail */}
          {(selected || selectedBrief) && (
            <div className="hidden lg:flex flex-col flex-shrink-0 overflow-hidden"
              style={{ width: "42%", borderLeft: "1px solid var(--gv-color-neutral-100)" }}>
              <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
                <p className="text-[14px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
                  {selected ? "Report Detail" : "Brief Detail"}
                </p>
                <button
                  onClick={() => { setSelected(null); setSelectedBrief(null); }}
                  className="w-7 h-7 rounded-[8px] flex items-center justify-center"
                  style={{ background: "var(--gv-color-neutral-100)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {selected && (
                  <div className="flex flex-col gap-4">
                    {/* GEO Score */}
                    {selected.geo_score_current != null && (
                      <div className="p-4 rounded-[14px] text-center"
                        style={{ background: "var(--gv-color-primary-50, #EDF5F4)" }}>
                        <p className="text-[12px] font-semibold uppercase tracking-wider mb-1"
                          style={{ color: "var(--gv-color-primary-600)" }}>GEO Score</p>
                        <p className="text-[40px] font-bold" style={{ color: "var(--gv-color-primary-700)" }}>
                          {selected.geo_score_current}
                        </p>
                        {selected.geo_score_delta != null && (
                          <p className="text-[14px] font-semibold"
                            style={{ color: selected.geo_score_delta >= 0 ? "#16A34A" : "#DC2626" }}>
                            {selected.geo_score_delta >= 0 ? "+" : ""}{selected.geo_score_delta.toFixed(1)} vs period sebelumnya
                          </p>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Tasks Dibuat", value: selected.total_tasks_created ?? 0 },
                        { label: "Tasks Selesai", value: selected.total_tasks_completed ?? 0 },
                        { label: "Konten Publish", value: selected.total_content_published ?? 0 },
                      ].map(s => (
                        <div key={s.label} className="p-3 rounded-[12px] text-center"
                          style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-100)" }}>
                          <p className="text-[20px] font-bold" style={{ color: "var(--gv-color-neutral-800)" }}>{s.value}</p>
                          <p className="text-[10px]" style={{ color: "var(--gv-color-neutral-400)" }}>{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Summary */}
                    {selected.executive_summary && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--gv-color-neutral-400)" }}>Executive Summary</p>
                        <p className="text-[13px] leading-relaxed" style={{ color: "var(--gv-color-neutral-700)" }}>
                          {selected.executive_summary}
                        </p>
                      </div>
                    )}

                    {/* Key wins */}
                    {selected.key_wins && selected.key_wins.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--gv-color-neutral-400)" }}>Key Wins</p>
                        <ul className="flex flex-col gap-1.5">
                          {selected.key_wins.map((w, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px]"
                              style={{ color: "var(--gv-color-neutral-700)" }}>
                              <span style={{ color: "#16A34A" }}>✓</span>{w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {selected.recommendations && selected.recommendations.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--gv-color-neutral-400)" }}>Rekomendasi</p>
                        <ul className="flex flex-col gap-1.5">
                          {selected.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px]"
                              style={{ color: "var(--gv-color-neutral-700)" }}>
                              <span style={{ color: "var(--gv-color-primary-500)" }}>→</span>{rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {selectedBrief && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                        style={{ color: "var(--gv-color-neutral-400)" }}>Period</p>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
                        {selectedBrief.brief_period}
                      </p>
                    </div>

                    {selectedBrief.claude_analysis && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--gv-color-neutral-400)" }}>Claude Analysis</p>
                        <p className="text-[13px] leading-relaxed" style={{ color: "var(--gv-color-neutral-700)" }}>
                          {selectedBrief.claude_analysis}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:block flex-shrink-0 w-4" />
    </div>
    </FeatureGate>
  );
}
