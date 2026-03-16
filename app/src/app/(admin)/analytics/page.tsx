"use client";
import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shared/AppShell";
import { supabase } from "@/lib/supabase";

/* ─────────────────── Types ─────────────────── */
interface BrandData {
  research_status: string;
  source_of_truth?: {
    brand_foundation?: { brand_name?: string; digital_presence?: { website?: string } };
    brand_presence?: { digital_footprint_score?: number; whats_working?: string[]; whats_broken?: string[] };
    keyword_intelligence?: { ranking_keywords?: string[]; gap?: string[]; quick_win?: string[] };
    competitor_intelligence?: Array<{
      name: string; seo_rank?: number; social_presence?: string;
      strengths?: string[]; weaknesses?: string[]; threat_level?: string;
    }>;
    trend_intelligence?: { trending_now?: string[]; emerging?: string[]; declining?: string[] };
    content_intelligence?: {
      top_topics?: string[]; content_gaps?: string[];
      platform_strategies?: { instagram?: string; tiktok?: string; blog?: string };
    };
    market_intelligence?: { category_size?: string; growth?: string };
    opportunity_map?: { immediate_wins?: string[]; prioritized_actions?: Array<{ topic?: string; priority?: string }> };
  };
  serpapi_data?: {
    brand_rankings?: { found_in?: Array<{ query: string; position: number }>; avg_position?: number };
    keyword_intelligence?: { ranking_keywords?: string[]; gap?: string[]; quick_wins?: string[] };
    whats_good?: string[]; whats_bad?: string[];
    news_coverage?: Array<{ title: string; source: string; date?: string }>;
  };
  perplexity_data?: {
    competitor_research?: { competitors?: Array<{ name: string; strengths?: string[]; digital_presence?: string }> };
    trend_research?: { trending_now?: string[]; emerging_trends?: string[] };
    opportunity_research?: { gaps_found?: string[]; quick_wins?: string[] };
    citations?: Array<{ url: string; title: string; snippet?: string }>;
  };
  apify_data?: {
    instagram?: { avg_engagement?: number; posting_frequency?: string; top_topics?: string[] };
    tiktok?: { avg_views?: number; top_topics?: string[] };
    content_patterns?: { best_performing_topics?: string[]; best_posting_times?: string; engagement_patterns?: string };
  };
  firecrawl_data?: {
    content_intelligence?: { content_depth?: string; seo_quality?: string; topic_coverage?: string[] };
    opportunities?: string[];
  };
}

/* ─────────────────── Helpers ─────────────────── */
function pct(val: number, max: number) { return Math.min(100, Math.round((val / max) * 100)); }

const LAYER_COLORS = {
  l0: { border: "#10B981", badge_bg: "var(--gv-color-success-50)",  badge_c: "var(--gv-color-success-700)", bar: "var(--gv-color-success-500)", role_bg: "var(--gv-color-success-50)", role_c: "var(--gv-color-success-700)" },
  l1: { border: "#3B82F6", badge_bg: "var(--gv-color-info-50)",     badge_c: "var(--gv-color-info-700)",    bar: "var(--gv-color-info-500)",    role_bg: "var(--gv-color-info-50)",    role_c: "var(--gv-color-info-700)"    },
  l2: { border: "var(--gv-color-primary-500)", badge_bg: "var(--gv-color-primary-50)", badge_c: "var(--gv-color-primary-700)", bar: "var(--gv-color-primary-500)", role_bg: "var(--gv-color-primary-50)", role_c: "var(--gv-color-primary-700)" },
  l3: { border: "#F59E0B", badge_bg: "var(--gv-color-warning-50)",  badge_c: "var(--gv-color-warning-700)", bar: "var(--gv-color-warning-500)", role_bg: "var(--gv-color-warning-50)", role_c: "var(--gv-color-warning-700)" },
};

const ENGINE_COLORS: Record<string, string> = {
  GPT: "#10A37F", Px: "#7C3AED", Gm: "#1A73E8", Co: "#0078D4", Ma: "#0082FB",
};

/* ─────────────────── Card Shell ─────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--gv-color-bg-surface)",
      borderRadius: "var(--gv-radius-lg)",
      padding: "20px",
      border: "1px solid var(--gv-color-neutral-200)",
      boxShadow: "var(--gv-shadow-card)",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--gv-gradient-primary)" }} />
      {children}
    </div>
  );
}

function CardLabel({ label, title }: { label: string; title: string }) {
  return (
    <>
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 500, color: "var(--gv-color-primary-500)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 700, color: "var(--gv-color-neutral-900)", marginBottom: 14, letterSpacing: "-.01em" }}>{title}</div>
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--gv-color-neutral-400)", fontSize: 13, fontFamily: "var(--gv-font-body)" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32" style={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }}>
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      {text}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   A13 — Signal Layers
══════════════════════════════════════════════════ */
function SignalLayers({ data }: { data: BrandData }) {
  const sot = data.source_of_truth;
  const serpapi = data.serpapi_data;

  const layers = [
    {
      key: "l0" as const, badge: "L0", name: "Origin / Authenticity Gate", role: "Auth Gate",
      desc: "Verifikasi domain, E-E-A-T signals, schema markup & author credentials.",
      metrics: [
        { val: sot?.keyword_intelligence?.ranking_keywords?.length ?? 0, lbl: "Keywords" },
        { val: sot?.brand_presence?.whats_working?.length ?? 0, lbl: "Strengths" },
        { val: serpapi?.brand_rankings?.found_in?.length ?? 0, lbl: "Ranked" },
      ],
      score: Math.min(98, (sot?.brand_presence?.digital_footprint_score ?? 0.7) * 100),
      status: "ok",
    },
    {
      key: "l1" as const, badge: "L1", name: "Stability Amplifier", role: "Amplifier",
      desc: "Backlink stability, content freshness & domain age signals. Memperkuat L0.",
      metrics: [
        { val: serpapi?.brand_rankings?.avg_position ? Math.round(10 / Math.max(1, serpapi.brand_rankings.avg_position) * 100) : 72, lbl: "Stability" },
        { val: serpapi?.keyword_intelligence?.ranking_keywords?.length ?? 0, lbl: "Kw Ranking" },
        { val: sot?.content_intelligence?.top_topics?.length ?? 0, lbl: "Topics" },
      ],
      score: serpapi?.brand_rankings?.avg_position ? Math.min(95, 100 - (serpapi.brand_rankings.avg_position - 1) * 5) : 75,
      status: "ok",
    },
    {
      key: "l2" as const, badge: "L2", name: "Strategic Signal ★ Primary", role: "Primary Source",
      desc: "Sumber utama insight GeoVera. GEO citations, topic authority, AI mention frequency.",
      metrics: [
        { val: sot?.competitor_intelligence?.length ?? 0, lbl: "Competitors" },
        { val: sot?.trend_intelligence?.trending_now?.length ?? 0, lbl: "Trending" },
        { val: sot?.opportunity_map?.immediate_wins?.length ?? 0, lbl: "Quick Wins" },
      ],
      score: sot ? 72 : 0,
      status: sot ? "ok" : "warn",
    },
    {
      key: "l3" as const, badge: "L3", name: "Pulse / Volatility", role: "Volatile",
      desc: "Social trending, real-time mentions, viral content. Monitoring only.",
      metrics: [
        { val: data.apify_data?.instagram?.avg_engagement ?? 0, lbl: "IG Engage" },
        { val: data.apify_data?.tiktok?.avg_views ?? 0, lbl: "TK Views" },
        { val: data.apify_data?.content_patterns?.best_performing_topics?.length ?? 0, lbl: "Top Topics" },
      ],
      score: data.apify_data ? 66 : 0,
      status: data.apify_data ? "warn" : "blocked",
    },
  ];

  return (
    <Card>
      <CardLabel label="A13 · Signal Layer Status" title="L0 · L1 · L2 · L3 Signal Layers" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layers.map((layer) => {
          const col = LAYER_COLORS[layer.key];
          return (
            <div key={layer.key} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px", borderRadius: "var(--gv-radius-md)",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-surface-elevated)",
              position: "relative", overflow: "hidden",
              cursor: "pointer",
            }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col.border }} />
              <div style={{ width: 36, height: 36, borderRadius: "var(--gv-radius-sm)", background: col.badge_bg, color: col.badge_c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{layer.badge}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{layer.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--gv-radius-full)", background: col.role_bg, color: col.role_c, fontFamily: "var(--gv-font-body)", textTransform: "uppercase", letterSpacing: ".04em" }}>{layer.role}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", lineHeight: 1.5, marginBottom: 8 }}>{layer.desc}</div>
                <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                  {layer.metrics.map((m) => (
                    <div key={m.lbl}>
                      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1 }}>{m.val}</div>
                      <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".05em" }}>{m.lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 4, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${layer.score}%`, background: col.bar, borderRadius: "var(--gv-radius-full)", transition: "width 0.8s ease" }} />
                </div>
              </div>
              <div style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, alignSelf: "center",
                background: layer.status === "ok" ? "var(--gv-color-success-500)" : layer.status === "warn" ? "var(--gv-color-warning-500)" : "var(--gv-color-danger-500)",
                animation: layer.status === "ok" ? "pulse-dot 2.2s infinite" : "none",
              }} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A14 — Content Score
══════════════════════════════════════════════════ */
function ContentScore({ data }: { data: BrandData }) {
  const sot = data.source_of_truth;
  const fc = data.firecrawl_data;

  const rows: Array<{ label: string; hint: string; status: "good"|"warn"|"bad"|"neutral"; score: number; max: number }> = [
    { label: "E-E-A-T Signals", hint: "Author bio, credentials, citations", status: "good", score: sot?.brand_presence?.whats_working?.length ? 18 : 10, max: 20 },
    { label: "Structured Data / Schema", hint: "FAQ, Product, Organization schema", status: sot ? "good" : "warn", score: sot ? 17 : 8, max: 20 },
    { label: "Keyword Density & Placement", hint: "Heading, intro, alt text coverage", status: data.serpapi_data ? "warn" : "neutral", score: data.serpapi_data?.keyword_intelligence?.ranking_keywords?.length ? 15 : 10, max: 20 },
    { label: "Content Freshness", hint: "Update frequency, date signals", status: "neutral", score: fc?.content_intelligence?.content_depth ? 15 : 12, max: 20 },
    { label: "Multimedia Optimization", hint: "Image alt, video transcript, infographic", status: "bad", score: data.apify_data ? 10 : 6, max: 20 },
  ];

  const total = rows.reduce((s, r) => s + r.score, 0);
  const maxTotal = rows.reduce((s, r) => s + r.max, 0);

  const iconMap = {
    good: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M20 6 9 17l-5-5"/></svg>,
    warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    bad:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M18 6 6 18M6 6l12 12"/></svg>,
    neutral: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
  };
  const bgMap = { good: "var(--gv-color-success-50)", warn: "var(--gv-color-warning-50)", bad: "var(--gv-color-danger-50)", neutral: "var(--gv-color-neutral-100)" };
  const cMap  = { good: "var(--gv-color-success-700)", warn: "var(--gv-color-warning-700)", bad: "var(--gv-color-danger-700)", neutral: "var(--gv-color-neutral-500)" };
  const barMap = { good: "var(--gv-color-success-500)", warn: "var(--gv-color-warning-500)", bad: "var(--gv-color-danger-500)", neutral: "var(--gv-color-primary-400)" };

  return (
    <Card>
      <CardLabel label="A14 · Content Score" title="Content Optimization Breakdown" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((row) => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 8px", borderBottom: "1px solid var(--gv-color-neutral-100)",
            cursor: "pointer", borderRadius: "var(--gv-radius-xs)",
          }}>
            <div style={{ width: 28, height: 28, borderRadius: "var(--gv-radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: bgMap[row.status], color: cMap[row.status] }}>
              {iconMap[row.status]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gv-color-neutral-900)" }}>{row.label}</div>
              <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>{row.hint}</div>
            </div>
            <div style={{ width: 42, height: 5, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full)", overflow: "hidden", flexShrink: 0 }}>
              <div style={{ height: "100%", width: `${pct(row.score, row.max)}%`, background: barMap[row.status], borderRadius: "var(--gv-radius-full)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, minWidth: 32 }}>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>{row.score}</span>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: "var(--gv-color-neutral-400)" }}>/{row.max}</span>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 8px 4px", borderTop: "2px solid var(--gv-color-neutral-200)", marginTop: 4 }}>
          <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-700)" }}>Total Content Score</span>
          <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, color: "var(--gv-color-primary-600)", letterSpacing: "-.02em" }}>{total} / {maxTotal}</span>
        </div>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A15 — Engagement Heatmap
══════════════════════════════════════════════════ */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["06", "09", "12", "15", "18", "21"];
// Default heatmap intensity grid (rows=hours, cols=days)
const DEFAULT_GRID = [
  [1, 1, 2, 1, 2, 0, 0],
  [4, 5, 5, 4, 6, 2, 1],
  [6, 7, "peak", 7, "peak", 5, 4],
  [5, 6, 6, 5, 7, 6, 5],
  [7, "peak", 7, "peak", "peak", 7, 6],
  [4, 5, 4, 4, 6, 7, "peak"],
];

const CELL_BG: Record<string, string> = {
  "0": "var(--gv-color-neutral-100)",
  "1": "rgba(95,143,139,.12)",
  "2": "rgba(95,143,139,.22)",
  "3": "rgba(95,143,139,.34)",
  "4": "rgba(95,143,139,.48)",
  "5": "rgba(95,143,139,.62)",
  "6": "rgba(95,143,139,.76)",
  "7": "var(--gv-color-primary-500)",
  peak: "var(--gv-gradient-primary)",
};

function EngagementHeatmap() {
  return (
    <Card>
      <CardLabel label="A15 · Engagement Heatmap" title="Day × Hour Engagement (7d)" />
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7,1fr)", gap: 4, minWidth: 380 }}>
          {/* Header row */}
          <div />
          {DAYS.map((d) => (
            <div key={d} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-500)", textAlign: "center", paddingBottom: 4 }}>{d}</div>
          ))}
          {/* Data rows */}
          {HOURS.map((h, hi) => (
            <>
              <div key={`h-${h}`} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-400)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>{h}</div>
              {DEFAULT_GRID[hi].map((cell, ci) => (
                <div key={ci} style={{
                  aspectRatio: "1", borderRadius: "var(--gv-radius-xs)",
                  background: CELL_BG[String(cell)] ?? "var(--gv-color-neutral-100)",
                  cursor: "pointer", transition: "transform .15s ease",
                }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; }}
                   onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }} />
              ))}
            </>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-mono)", flexWrap: "wrap" }}>
        <span>Less</span>
        {["0","1","3","5","7","peak"].map((k) => (
          <div key={k} style={{ width: 12, height: 12, borderRadius: 3, background: CELL_BG[k] }} />
        ))}
        <span>Peak</span>
        <span style={{ marginLeft: "auto", color: "var(--gv-color-primary-500)", fontSize: 11 }}>⚡ Best: Fri–Sat 18:00–21:00 WIB</span>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A11 — AI Visibility
══════════════════════════════════════════════════ */
const AI_ENGINES = [
  { logo: "GPT", name: "ChatGPT",   sub: "OpenAI",    dot: "live",    base: 91, delta: "+4" },
  { logo: "Px",  name: "Perplexity",sub: "AI Search",  dot: "live",    base: 79, delta: "+7" },
  { logo: "Gm",  name: "Gemini",    sub: "Google",     dot: "indexed", base: 53, delta: "+2" },
  { logo: "Co",  name: "Copilot",   sub: "Microsoft",  dot: "indexed", base: 18, delta: "−1" },
  { logo: "Ma",  name: "Meta AI",   sub: "Meta",       dot: "none",    base: 5,  delta: "→ 0" },
];

function AIVisibility({ data }: { data: BrandData }) {
  const citations = data.perplexity_data?.citations?.length ?? 0;

  return (
    <Card>
      <CardLabel label="A11 · AI Visibility" title="AI Search Engine Visibility" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--gv-color-neutral-100)", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-700)" }}>Visibility Across AI Engines</span>
        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-500)" }}>
          <strong style={{ fontSize: 17, fontWeight: 900, color: "var(--gv-color-primary-600)", fontFamily: "var(--gv-font-heading)" }}>{citations > 0 ? citations : "—"}</strong> citations
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AI_ENGINES.map((eng) => {
          const isDown = eng.delta.startsWith("−") || eng.delta.startsWith("-");
          const isFlat = eng.delta.startsWith("→");
          return (
            <div key={eng.name} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: "var(--gv-radius-sm)",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-surface-elevated)",
              cursor: "pointer", transition: "all .15s ease",
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-200)"; (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)"; (e.currentTarget as HTMLElement).style.transform = "translateX(3px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)"; (e.currentTarget as HTMLElement).style.background = "var(--gv-color-bg-surface-elevated)"; (e.currentTarget as HTMLElement).style.transform = "translateX(0)"; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "var(--gv-radius-xs)", background: ENGINE_COLORS[eng.logo] ?? "var(--gv-color-neutral-500)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gv-font-heading)", fontSize: 12, fontWeight: 800, color: "white", flexShrink: 0, letterSpacing: "-.02em" }}>{eng.logo}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{eng.name}</div>
                <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", marginTop: 1 }}>{eng.sub}</div>
              </div>
              <div style={{ width: 72, height: 5, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full)", overflow: "hidden", flexShrink: 0 }}>
                <div style={{ height: "100%", width: `${eng.base}%`, background: "var(--gv-gradient-primary)", borderRadius: "var(--gv-radius-full)" }} />
              </div>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)", width: 34, textAlign: "right", flexShrink: 0 }}>{eng.base}%</span>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, width: 32, textAlign: "right", flexShrink: 0, color: isDown ? "var(--gv-color-danger-500)" : isFlat ? "var(--gv-color-neutral-400)" : "var(--gv-color-success-500)" }}>{eng.delta}</span>
              <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: eng.dot === "live" ? "var(--gv-color-success-500)" : eng.dot === "indexed" ? "var(--gv-color-warning-500)" : "var(--gv-color-neutral-300)", animation: eng.dot === "live" ? "pulse-dot 2s infinite" : "none" }} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A16 — Trending Topics
══════════════════════════════════════════════════ */
function TrendingTopics({ data }: { data: BrandData }) {
  const sot = data.source_of_truth;
  const perp = data.perplexity_data;

  const trending = [
    ...(sot?.trend_intelligence?.trending_now ?? []),
    ...(perp?.trend_research?.trending_now ?? []),
    ...(sot?.trend_intelligence?.emerging ?? []),
  ].slice(0, 6);

  const gaps = sot?.content_intelligence?.content_gaps ?? [];

  if (trending.length === 0) return (
    <Card>
      <CardLabel label="A16 · Trending Topics" title="Trending Topic Discovery" />
      <EmptyState text="Data trend tersedia setelah research selesai" />
    </Card>
  );

  return (
    <Card>
      <CardLabel label="A16 · Trending Topics" title="Trending Topic Discovery" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {trending.map((topic, i) => {
          const isHot = i === 0;
          const isGap = gaps.some((g) => topic.toLowerCase().includes(g.toLowerCase().slice(0, 5)));
          const pill = isGap ? "gap" : isHot ? "fire" : "owned";
          const pillBg = pill === "gap" ? "var(--gv-color-danger-50)" : pill === "fire" ? "var(--gv-color-warning-50)" : "var(--gv-color-primary-100)";
          const pillC  = pill === "gap" ? "var(--gv-color-danger-700)" : pill === "fire" ? "var(--gv-color-warning-700)" : "var(--gv-color-primary-700)";
          const pillLabel = pill === "gap" ? "Gap" : pill === "fire" ? "🔥 Hot" : "Owned";

          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: "var(--gv-radius-sm)",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-surface-elevated)",
              cursor: "pointer", transition: "border-color .15s ease",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ width: 24, height: 24, borderRadius: "var(--gv-radius-xs)", background: isHot ? "var(--gv-color-warning-50)" : i < 2 ? "var(--gv-color-success-50)" : "var(--gv-color-neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 800, color: isHot ? "var(--gv-color-warning-700)" : i < 2 ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-500)", flexShrink: 0 }}>
                {isHot ? "🔥" : String(i).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{topic}</div>
                <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", display: "flex", gap: 8, marginTop: 2 }}>
                  <span>Search</span><span>GEO</span>
                </div>
              </div>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: "var(--gv-radius-full)", background: pillBg, color: pillC, textTransform: "uppercase", flexShrink: 0 }}>{pillLabel}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A12 — Competitor Gap
══════════════════════════════════════════════════ */
function CompetitorGap({ data }: { data: BrandData }) {
  const sot = data.source_of_truth;
  const competitors = sot?.competitor_intelligence?.slice(0, 2) ?? [];
  const serpBad = data.serpapi_data?.whats_bad ?? [];
  const serpGood = data.serpapi_data?.whats_good ?? [];

  const metrics = [
    { label: "SEO Score",     mine: data.serpapi_data ? 79 : 0, comps: [72, 85],  diff: -6 },
    { label: "GEO Citations", mine: data.perplexity_data?.citations?.length ?? 0, comps: [189, 138], diff: 58 },
    { label: "Social Score",  mine: data.apify_data?.instagram?.avg_engagement ? 66 : 0, comps: [78, 61], diff: -12 },
    { label: "Authority",     mine: sot?.brand_presence?.digital_footprint_score ? 65 : 0, comps: [63, 70], diff: -5 },
  ];

  return (
    <Card>
      <CardLabel label="A12 · Competitor Gap" title="Competitor Gap Analysis" />
      {competitors.length === 0 ? (
        <EmptyState text="Data kompetitor tersedia setelah research selesai" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "var(--gv-font-mono)", fontSize: 12, color: "var(--gv-color-neutral-500)", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gv-color-primary-500)" }} /> Your Brand
            </div>
            {competitors.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gv-color-neutral-300)" }} /> {c.name}
              </div>
            ))}
          </div>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px" }}>
            <thead>
              <tr>
                {["Metric", "Yours", ...competitors.map((c) => c.name.split(" ")[0]), "Gap"].map((h, i) => (
                  <th key={i} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".08em", padding: "4px 8px", textAlign: i === 0 ? "left" : "center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label} style={{ cursor: "pointer" }}>
                  <td style={{ padding: "8px 8px", fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-900)", background: "var(--gv-color-bg-surface-elevated)", borderRadius: "var(--gv-radius-xs) 0 0 var(--gv-radius-xs)" }}>{m.label}</td>
                  {[m.mine, ...m.comps].map((v, i) => (
                    <td key={i} style={{ padding: "8px 8px", background: "var(--gv-color-bg-surface-elevated)", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 48, height: 4, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct(v, 120)}%`, borderRadius: "var(--gv-radius-full)", background: i === 0 ? "var(--gv-gradient-primary)" : "var(--gv-color-neutral-300)" }} />
                        </div>
                        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-700)" }}>{v}</span>
                      </div>
                    </td>
                  ))}
                  <td style={{ padding: "8px 8px", background: "var(--gv-color-bg-surface-elevated)", textAlign: "center", borderRadius: "0 var(--gv-radius-xs) var(--gv-radius-xs) 0" }}>
                    <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: "var(--gv-radius-full)", background: m.diff >= 0 ? "var(--gv-color-success-50)" : "var(--gv-color-danger-50)", color: m.diff >= 0 ? "var(--gv-color-success-700)" : "var(--gv-color-danger-700)" }}>
                      {m.diff >= 0 ? `+${m.diff}` : m.diff}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {serpGood.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-success-50)", border: "1px solid var(--gv-color-success-500)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gv-color-success-700)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>✓ What's Working</div>
              {serpGood.slice(0, 2).map((g, i) => <div key={i} style={{ fontSize: 12, color: "var(--gv-color-success-700)", lineHeight: 1.5 }}>• {g}</div>)}
            </div>
          )}
          {serpBad.length > 0 && (
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-danger-50)", border: "1px solid var(--gv-color-danger-500)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gv-color-danger-700)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>✗ Needs Fixing</div>
              {serpBad.slice(0, 2).map((b, i) => <div key={i} style={{ fontSize: 12, color: "var(--gv-color-danger-700)", lineHeight: 1.5 }}>• {b}</div>)}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A17 — DQS Gauge
══════════════════════════════════════════════════ */
function DQSGauge({ data }: { data: BrandData }) {
  // Calculate DQS from available data sources
  const score = (
    (data.source_of_truth ? 0.4 : 0) +
    (data.perplexity_data ? 0.2 : 0) +
    (data.serpapi_data ? 0.2 : 0) +
    (data.apify_data ? 0.1 : 0) +
    (data.firecrawl_data ? 0.1 : 0)
  );
  const offset = 172 - 172 * score;
  const status = score >= 0.6 ? "pass" : score >= 0.4 ? "warn" : "block";
  const breakdown = [
    { lbl: "Completeness", val: data.source_of_truth ? 0.88 : 0.3 },
    { lbl: "Consistency",  val: data.serpapi_data    ? 0.81 : 0.2 },
    { lbl: "Timeliness",   val: data.apify_data      ? 0.72 : 0.2 },
    { lbl: "Accuracy",     val: data.perplexity_data ? 0.69 : 0.2 },
  ];
  const barColors = ["var(--gv-color-success-500)", "var(--gv-color-primary-500)", "var(--gv-color-warning-500)", "var(--gv-color-info-500)"];

  return (
    <Card style={{ padding: 16 }}>
      <CardLabel label="A17 · DQS Gauge" title="Data Quality Score" />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        {/* Arc */}
        <div style={{ position: "relative", width: 100, height: 60, flexShrink: 0 }}>
          <svg viewBox="0 0 110 70" width="100" height="60" style={{ overflow: "visible" }}>
            <path d="M 5 60 A 50 50 0 0 1 105 60" fill="none" stroke="var(--gv-color-neutral-100)" strokeWidth="9" strokeLinecap="round" />
            <path d="M 5 60 A 50 50 0 0 1 105 60" fill="none"
              stroke={status === "pass" ? "var(--gv-color-success-500)" : status === "warn" ? "var(--gv-color-warning-500)" : "var(--gv-color-danger-500)"}
              strokeWidth="9" strokeLinecap="round" strokeDasharray="172" strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1.4s ease" }} />
          </svg>
          <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, color: "var(--gv-color-neutral-900)", lineHeight: 1 }}>{score.toFixed(2)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--gv-radius-full)", marginBottom: 5,
            background: status === "pass" ? "var(--gv-color-success-50)" : status === "warn" ? "var(--gv-color-warning-50)" : "var(--gv-color-danger-50)",
            color: status === "pass" ? "var(--gv-color-success-700)" : status === "warn" ? "var(--gv-color-warning-700)" : "var(--gv-color-danger-700)",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            {status === "pass" ? "Perplexity: UNLOCKED" : status === "warn" ? "Partially Ready" : "Data Insufficient"}
          </div>
          <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", lineHeight: 1.5 }}>
            {score >= 0.6 ? "DQS ≥ 0.6 — pipeline aktif untuk semua engine." : "Lengkapi research untuk meningkatkan DQS."}
          </div>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 4 }}>Threshold: DQS &lt; 0.6 = BLOCKED · Current: {score.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
        {breakdown.map((item, i) => (
          <div key={item.lbl} style={{ padding: "8px 10px", borderRadius: "var(--gv-radius-sm)", border: "1px solid var(--gv-color-neutral-200)", background: "var(--gv-color-bg-surface-elevated)", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600, color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".05em" }}>{item.lbl}</div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 16, fontWeight: 900, color: "var(--gv-color-neutral-900)", lineHeight: 1 }}>{item.val.toFixed(2)}</div>
            <div style={{ height: 3, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${item.val * 100}%`, background: barColors[i], borderRadius: "var(--gv-radius-full)" }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   A18 — Report Export
══════════════════════════════════════════════════ */
const SECTIONS = [
  { label: "SEO · GEO · Social Score Overview", badge: "A01" },
  { label: "Keyword Rankings & Delta",           badge: "A02" },
  { label: "AI Visibility by Engine",            badge: "A11" },
  { label: "Competitor Gap Analysis",            badge: "A12" },
  { label: "Engagement Heatmap",                 badge: "A15" },
];

function ReportExport() {
  const [checked, setChecked] = useState([true, true, true, true, false]);
  const toggle = (i: number) => setChecked((prev) => { const n = [...prev]; n[i] = !n[i]; return n; });

  return (
    <Card style={{ padding: 16 }}>
      <CardLabel label="A18 · Report Export" title="Generate & Export Report" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { lbl: "Report Type",  opts: ["Full Analytics Report", "SEO Summary", "GEO Citation Report", "Social Discovery"] },
          { lbl: "Window",       opts: ["7-Day Window", "14-Day Window", "28-Day Window"] },
          { lbl: "Format",       opts: ["PDF Report", "CSV Export", "JSON Data"] },
          { lbl: "Branding",     opts: ["GeoVera White-label", "Client Branding", "No Branding"] },
        ].map((f) => (
          <div key={f.lbl} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".06em", fontFamily: "var(--gv-font-body)" }}>{f.lbl}</label>
            <select style={{ padding: "7px 10px", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-bg-surface-elevated)", fontFamily: "var(--gv-font-body)", fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-900)", cursor: "pointer", outline: "none", appearance: "none" }}>
              {f.opts.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Include Sections</div>
        {SECTIONS.map((s, i) => (
          <div key={s.badge} onClick={() => toggle(i)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
            borderRadius: "var(--gv-radius-xs)", cursor: "pointer",
            border: `1px solid ${checked[i] ? "var(--gv-color-primary-200)" : "transparent"}`,
            background: checked[i] ? "var(--gv-color-primary-50)" : "transparent",
            marginBottom: 3,
          }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked[i] ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-300)"}`, background: checked[i] ? "var(--gv-color-primary-500)" : "var(--gv-color-bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {checked[i] && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" width="10" height="10"><path d="M20 6 9 17l-5-5"/></svg>}
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-900)" }}>{s.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--gv-font-mono)", padding: "1px 6px", borderRadius: "var(--gv-radius-full)", textTransform: "uppercase", background: checked[i] ? "var(--gv-color-primary-100)" : "var(--gv-color-neutral-100)", color: checked[i] ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-500)" }}>{s.badge}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid var(--gv-color-neutral-100)" }}>
        <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: "var(--gv-radius-sm)", fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body)", cursor: "pointer", background: "var(--gv-color-bg-surface-elevated)", border: "1.5px solid var(--gv-color-neutral-200)", color: "var(--gv-color-neutral-700)", transition: "all .15s ease" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          Preview
        </button>
        <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: "var(--gv-radius-sm)", fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body)", cursor: "pointer", background: "var(--gv-gradient-primary)", border: "none", color: "white", boxShadow: "0 3px 10px rgba(95,143,139,.3)", transition: "all .15s ease" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Generate & Export
        </button>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   KPI Mini Cards (right panel)
══════════════════════════════════════════════════ */
function KPICards({ data }: { data: BrandData | null }) {
  const score  = data?.source_of_truth?.brand_presence?.digital_footprint_score ?? 0;
  const kws    = data?.source_of_truth?.keyword_intelligence?.ranking_keywords?.length ?? 0;
  const comps  = data?.source_of_truth?.competitor_intelligence?.length ?? 0;

  const cards = [
    { lbl: "Digital Score", val: score > 0 ? `${Math.round(score * 100)}` : "—", unit: "/100", up: true  },
    { lbl: "Kw Ranking",    val: kws > 0 ? String(kws) : "—",                    unit: "kw",   up: true  },
    { lbl: "Competitors",   val: comps > 0 ? String(comps) : "—",                unit: "tracked", up: null },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
      {cards.map((c) => (
        <div key={c.lbl} style={{ padding: "12px", borderRadius: "var(--gv-radius-md)", background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", boxShadow: "var(--gv-shadow-card)" }}>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{c.lbl}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-900)", lineHeight: 1 }}>{c.val}</span>
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-mono)" }}>{c.unit}</span>
          </div>
          {c.up !== null && (
            <div style={{ fontSize: 11, fontWeight: 700, color: c.up ? "var(--gv-color-success-500)" : "var(--gv-color-danger-500)", marginTop: 3 }}>
              {c.up ? "↑ Rising" : "↓ Drop"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Research Loading Banner
══════════════════════════════════════════════════ */
function ResearchBanner({ status }: { status: string }) {
  if (status === "sot_ready") return null;
  const msg: Record<string, string> = {
    pending:          "Research belum dimulai. Selesaikan onboarding untuk memulai.",
    indexing:         "Brand sedang diindeks oleh Gemini…",
    gemini_complete:  "Indexing selesai. Deep research sedang berjalan…",
    researching_deep: "Deep research aktif: Perplexity, SERP, Apify, Firecrawl…",
    consolidating:    "Mengkonsolidasi semua data menjadi Brand Source of Truth…",
    failed:           "Research gagal. Hubungi support.",
  };
  return (
    <div style={{ padding: "12px 16px", borderRadius: "var(--gv-radius-md)", background: "var(--gv-color-warning-50)", border: "1px solid var(--gv-color-warning-500)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--gv-color-warning-500)", borderTopColor: "transparent", animation: status !== "failed" ? "gv-spin .8s linear infinite" : "none", flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--gv-color-warning-700)", fontFamily: "var(--gv-font-body)" }}>{msg[status] ?? "Memproses data…"}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Tab content
══════════════════════════════════════════════════ */
function CenterContent({ tab, data }: { tab: string; data: BrandData | null }) {
  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--gv-color-neutral-400)", fontSize: 14 }}>
      Memuat data…
    </div>
  );

  if (tab === "GEO") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AIVisibility data={data} />
      <TrendingTopics data={data} />
    </div>
  );

  if (tab === "Social Search") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CompetitorGap data={data} />
      <TrendingTopics data={data} />
    </div>
  );

  // Default: SEO
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SignalLayers data={data} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ContentScore data={data} />
        <EngagementHeatmap />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════════ */
export default function AnalyticsPage() {
  const [data, setData] = useState<BrandData | null>(null);
  const [activeTab, setActiveTab] = useState("SEO");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: brand } = await supabase
        .from("brand_profiles")
        .select("research_status, source_of_truth, serpapi_data, perplexity_data, apify_data, firecrawl_data")
        .eq("user_id", session.user.id)
        .single();
      if (brand) setData(brand as BrandData);
    })();
  }, []);

  const handleSubMenuChange = useCallback((_section: string, sub: string) => {
    setActiveTab(sub);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes gv-spin { to{transform:rotate(360deg)} }
      `}</style>

      <AppShell
        onSubMenuChange={handleSubMenuChange}
        center={
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Page header */}
            <div style={{ flexShrink: 0, padding: "16px 20px 12px", borderBottom: "1px solid var(--gv-color-neutral-100)", background: "var(--gv-color-bg-surface)" }}>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-primary-500)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 2 }}>Analytics · {activeTab}</div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-.02em" }}>
                {activeTab === "SEO" ? "Signal Layer & Content Score" : activeTab === "GEO" ? "GEO & AI Engine Visibility" : "Social Discovery & Competitor Gap"}
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
              {data && <ResearchBanner status={data.research_status} />}
              <CenterContent tab={activeTab} data={data} />
            </div>
          </div>
        }
        right={
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "16px 16px 16px 0" }}>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <KPICards data={data} />
              <DQSGauge data={data ?? { research_status: "pending" }} />
              <ReportExport />
            </div>
          </div>
        }
      />
    </>
  );
}
