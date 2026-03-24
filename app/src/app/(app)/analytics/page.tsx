"use client";
import { useState } from "react";

type Tab = "seo" | "geo" | "sso";

const TABS: { id: Tab; label: string }[] = [
  { id: "seo", label: "SEO" },
  { id: "geo", label: "GEO" },
  { id: "sso", label: "SSO" },
];

// ── SEO Data ──────────────────────────────────────────────────────────────────
const SEO_KEYWORDS = [
  { kw: "brand marketing indonesia", pos: 4, vol: "8.2K", change: +2 },
  { kw: "ai content creator", pos: 7, vol: "22K", change: -1 },
  { kw: "social media management", pos: 11, vol: "14K", change: +5 },
  { kw: "geovera platform", pos: 1, vol: "1.1K", change: 0 },
  { kw: "konten otomatis whatsapp", pos: 3, vol: "3.4K", change: +1 },
];

const SEO_STATS = [
  { label: "Avg. Posisi", value: "5.2", sub: "↑ dari 7.8", up: true },
  { label: "Kata Kunci", value: "24", sub: "5 halaman 1", up: true },
  { label: "Backlink", value: "138", sub: "+12 bulan ini", up: true },
  { label: "Click-through", value: "3.4%", sub: "↓ 0.2%", up: false },
];

// ── GEO Data ──────────────────────────────────────────────────────────────────
const GEO_LOCATIONS = [
  { city: "Jakarta", score: 87, reviews: 42, citations: 28 },
  { city: "Surabaya", score: 71, reviews: 18, citations: 15 },
  { city: "Bandung", score: 65, reviews: 12, citations: 11 },
  { city: "Medan", score: 54, reviews: 8, citations: 7 },
  { city: "Makassar", score: 48, reviews: 5, citations: 4 },
];

const GEO_STATS = [
  { label: "Local Score", value: "74", sub: "Rata-rata semua kota", up: true },
  { label: "Total Review", value: "85", sub: "+8 bulan ini", up: true },
  { label: "Konsistensi NAP", value: "91%", sub: "Nama/Alamat/Telp", up: true },
  { label: "Jangkauan Kota", value: "5", sub: "Kota aktif", up: null },
];

// ── SSO Data ──────────────────────────────────────────────────────────────────
const SSO_ENGINES = [
  { name: "Perplexity AI", visible: true, rank: 2, mentions: 14, icon: "P" },
  { name: "ChatGPT", visible: true, rank: 5, mentions: 9, icon: "G" },
  { name: "Google SGE", visible: false, rank: null, mentions: 3, icon: "Gs" },
  { name: "Gemini", visible: true, rank: 3, mentions: 11, icon: "Gm" },
  { name: "You.com", visible: false, rank: null, mentions: 2, icon: "Y" },
];

const SSO_STATS = [
  { label: "AI Visibility", value: "62%", sub: "3 dari 5 engine", up: true },
  { label: "Total Mention", value: "39", sub: "+16 bulan ini", up: true },
  { label: "Avg. AI Rank", value: "#3.3", sub: "Di engine aktif", up: true },
  { label: "Topik Terlacak", value: "18", sub: "Pertanyaan relevan", up: null },
];

const SSO_TOPICS = [
  { q: "Apa platform terbaik untuk konten marketing?", found: true },
  { q: "Cara otomasi konten whatsapp untuk bisnis", found: true },
  { q: "AI marketing tools Indonesia 2026", found: false },
  { q: "Brand analytics platform terbaik", found: true },
  { q: "Perbedaan SEO dan GEO marketing", found: false },
];

// ── Shared Components ─────────────────────────────────────────────────────────
type StatItem = { label: string; value: string; sub: string; up: boolean | null };
function StatCards({ stats }: { stats: StatItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background: "#0a100d",
          border: "1px solid rgba(95,122,107,0.13)",
          borderRadius: "12px",
          padding: "14px",
        }}>
          <div style={{ fontSize: "11px", color: "#3d4f44", fontWeight: 500, marginBottom: "4px" }}>
            {s.label}
          </div>
          <div style={{
            fontFamily: "Manrope, system-ui, sans-serif",
            fontSize: "22px", fontWeight: 800,
            color: "#e8ede9", letterSpacing: "-0.03em", lineHeight: 1,
            marginBottom: "4px",
          }}>
            {s.value}
          </div>
          <div style={{
            fontSize: "11px",
            color: s.up === true ? "#22C55E" : s.up === false ? "#f87171" : "#5f7a6b",
          }}>
            {s.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "Manrope, system-ui, sans-serif",
      fontSize: "13px", fontWeight: 700,
      color: "#e8ede9", letterSpacing: "-0.01em",
      marginBottom: "10px",
    }}>
      {children}
    </div>
  );
}

// ── Tab Panels ────────────────────────────────────────────────────────────────
function SEOPanel() {
  return (
    <>
      <StatCards stats={SEO_STATS} />
      <SectionTitle>Ranking Kata Kunci</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {SEO_KEYWORDS.map((k) => (
          <div key={k.kw} style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "#0a100d",
            border: "1px solid rgba(95,122,107,0.12)",
            borderRadius: "10px", padding: "11px 14px",
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: k.pos <= 3 ? "rgba(34,197,94,0.1)" : "rgba(95,122,107,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "Manrope, system-ui, sans-serif",
                fontSize: "13px", fontWeight: 800,
                color: k.pos <= 3 ? "#22C55E" : "#5f7a6b",
              }}>
                #{k.pos}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#e8ede9", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {k.kw}
              </div>
              <div style={{ fontSize: "11px", color: "#3d4f44", marginTop: "2px" }}>
                Vol. {k.vol}/bln
              </div>
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 600,
              color: k.change > 0 ? "#22C55E" : k.change < 0 ? "#f87171" : "#3d4f44",
              flexShrink: 0,
            }}>
              {k.change > 0 ? `↑${k.change}` : k.change < 0 ? `↓${Math.abs(k.change)}` : "–"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GEOPanel() {
  return (
    <>
      <StatCards stats={GEO_STATS} />
      <SectionTitle>Performa Per Kota</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {GEO_LOCATIONS.map((loc) => {
          const pct = loc.score;
          const color = pct >= 80 ? "#22C55E" : pct >= 60 ? "#F59E0B" : "#f87171";
          return (
            <div key={loc.city} style={{
              background: "#0a100d",
              border: "1px solid rgba(95,122,107,0.12)",
              borderRadius: "10px", padding: "13px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontFamily: "Manrope, system-ui, sans-serif", fontSize: "13px", fontWeight: 700, color: "#e8ede9" }}>
                  {loc.city}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "Manrope, system-ui, sans-serif" }}>
                  {loc.score}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: "4px", background: "rgba(95,122,107,0.15)", borderRadius: "2px", marginBottom: "8px" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "2px", transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <span style={{ fontSize: "11px", color: "#3d4f44" }}>★ {loc.reviews} review</span>
                <span style={{ fontSize: "11px", color: "#3d4f44" }}>◈ {loc.citations} citasi</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SSOPanel() {
  return (
    <>
      <StatCards stats={SSO_STATS} />
      <SectionTitle>Visibilitas di AI Engine</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
        {SSO_ENGINES.map((e) => (
          <div key={e.name} style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: "#0a100d",
            border: `1px solid ${e.visible ? "rgba(34,197,94,0.15)" : "rgba(95,122,107,0.1)"}`,
            borderRadius: "10px", padding: "12px 14px",
          }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "9px",
              background: e.visible ? "rgba(34,197,94,0.1)" : "rgba(95,122,107,0.07)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: e.visible ? "#22C55E" : "#3d4f44", fontFamily: "Manrope" }}>
                {e.icon}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", color: "#e8ede9", fontWeight: 500 }}>{e.name}</div>
              <div style={{ fontSize: "11px", color: "#3d4f44", marginTop: "2px" }}>
                {e.mentions} mention
                {e.rank ? ` · Rank #${e.rank}` : ""}
              </div>
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 600, paddingLeft: "8px",
              color: e.visible ? "#22C55E" : "#3d4f44",
            }}>
              {e.visible ? "Terlihat" : "Tidak"}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Topik Terlacak</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {SSO_TOPICS.map((t) => (
          <div key={t.q} style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            background: "#0a100d",
            border: "1px solid rgba(95,122,107,0.1)",
            borderRadius: "10px", padding: "12px 14px",
          }}>
            <div style={{
              width: "18px", height: "18px", borderRadius: "50%",
              background: t.found ? "rgba(34,197,94,0.12)" : "rgba(95,122,107,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px",
            }}>
              <span style={{ fontSize: "10px", color: t.found ? "#22C55E" : "#3d4f44" }}>
                {t.found ? "✓" : "·"}
              </span>
            </div>
            <span style={{ fontSize: "12px", color: t.found ? "#a3b5a9" : "#3d4f44", lineHeight: 1.4 }}>
              {t.q}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("seo");

  return (
    <div style={{
      minHeight: "100svh",
      background: "#080d0b",
      color: "#e8ede9",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 16px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <div>
          <h1 style={{
            fontFamily: "Manrope, system-ui, sans-serif",
            fontSize: "22px", fontWeight: 800,
            color: "#e8ede9", margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Analytic
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#3d4f44" }}>
            Brand performance & discovery
          </p>
        </div>

        {/* Tab pills — top right */}
        <div style={{
          display: "flex",
          background: "#0a100d",
          border: "1px solid rgba(95,122,107,0.18)",
          borderRadius: "20px",
          padding: "3px",
          gap: "2px",
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                height: "28px",
                padding: "0 12px",
                borderRadius: "16px",
                border: "none",
                background: tab === t.id ? "#22C55E" : "transparent",
                color: tab === t.id ? "#080d0b" : "#5f7a6b",
                fontSize: "11px",
                fontWeight: 700,
                fontFamily: "Manrope, system-ui, sans-serif",
                cursor: "pointer",
                minHeight: "28px",
                letterSpacing: "0.02em",
                WebkitTapHighlightColor: "transparent",
              } as React.CSSProperties}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "0 16px 24px" }}>
        {tab === "seo" && <SEOPanel />}
        {tab === "geo" && <GEOPanel />}
        {tab === "sso" && <SSOPanel />}
      </div>
    </div>
  );
}
