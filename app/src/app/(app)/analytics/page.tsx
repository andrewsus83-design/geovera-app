"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "seo" | "geo" | "sso";

const TABS: { id: Tab; label: string }[] = [
  { id: "seo", label: "SEO" },
  { id: "geo", label: "GEO" },
  { id: "sso", label: "SSO" },
];

// ── Shared Components ─────────────────────────────────────────────────────────
type StatItem = { label: string; value: string; sub: string; up: boolean | null };

function StatCards({ stats }: { stats: StatItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background: "var(--bg-recessed)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "14px",
        }}>
          <div style={{ fontSize: "11px", color: "var(--text-disabled)", fontWeight: 500, marginBottom: "4px" }}>
            {s.label}
          </div>
          <div style={{
            fontFamily: "var(--font-heading)",
            fontSize: "22px", fontWeight: 800,
            color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1,
            marginBottom: "4px",
          }}>
            {s.value}
          </div>
          <div style={{
            fontSize: "11px",
            color: s.up === true ? "var(--success)" : s.up === false ? "var(--danger)" : "var(--accent)",
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
      fontFamily: "var(--font-heading)",
      fontSize: "13px", fontWeight: 700,
      color: "var(--text-primary)", letterSpacing: "-0.01em",
      marginBottom: "10px",
    }}>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: "center", padding: "40px 16px",
      background: "var(--bg-recessed)", borderRadius: "12px",
      border: "1px solid var(--border-subtle)",
    }}>
      <p style={{ color: "var(--text-disabled)", fontSize: "13px", margin: "0 0 4px" }}>Belum ada data</p>
      <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: 0 }}>Data akan muncul setelah analisis pertama selesai.</p>
    </div>
  );
}

// ── Tab Panels ────────────────────────────────────────────────────────────────
function SEOPanel({ keywords, stats, hasData }: {
  keywords: any[];
  stats: StatItem[];
  hasData: boolean;
}) {
  if (!hasData) return <EmptyState />;
  return (
    <>
      <StatCards stats={stats} />
      <SectionTitle>Ranking Kata Kunci</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {keywords.map((k) => (
          <div key={k.kw} style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "var(--bg-recessed)",
            border: "1px solid var(--accent-subtle)",
            borderRadius: "10px", padding: "11px 14px",
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: k.pos <= 3 ? "var(--success-subtle)" : "var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "var(--font-heading)",
                fontSize: "13px", fontWeight: 800,
                color: k.pos <= 3 ? "var(--success)" : "var(--accent)",
              }}>
                #{k.pos}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {k.kw}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-disabled)", marginTop: "2px" }}>
                Vol. {k.vol}/bln
              </div>
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 600,
              color: k.change > 0 ? "var(--success)" : k.change < 0 ? "var(--danger)" : "var(--text-disabled)",
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

function GEOPanel({ locations, stats, hasData }: {
  locations: any[];
  stats: StatItem[];
  hasData: boolean;
}) {
  if (!hasData) return <EmptyState />;
  return (
    <>
      <StatCards stats={stats} />
      <SectionTitle>Performa Per Kota</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {locations.map((loc) => {
          const pct = loc.score;
          const color = pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";
          return (
            <div key={loc.city} style={{
              background: "var(--bg-recessed)",
              border: "1px solid var(--accent-subtle)",
              borderRadius: "10px", padding: "13px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {loc.city}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "var(--font-heading)" }}>
                  {loc.score}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: "4px", background: "var(--border-default)", borderRadius: "2px", marginBottom: "8px" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "2px", transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-disabled)" }}>★ {loc.reviews} review</span>
                <span style={{ fontSize: "11px", color: "var(--text-disabled)" }}>◈ {loc.citations} citasi</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SSOPanel({ engines, topics, stats, hasData }: {
  engines: any[];
  topics: any[];
  stats: StatItem[];
  hasData: boolean;
}) {
  if (!hasData) return <EmptyState />;
  return (
    <>
      <StatCards stats={stats} />
      <SectionTitle>Visibilitas di AI Engine</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
        {engines.map((e) => (
          <div key={e.name} style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: "var(--bg-recessed)",
            border: `1px solid ${e.visible ? "var(--success-subtle)" : "var(--glass-border)"}`,
            borderRadius: "10px", padding: "12px 14px",
          }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "9px",
              background: e.visible ? "var(--success-subtle)" : "var(--accent-ghost)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: e.visible ? "var(--success)" : "var(--text-disabled)", fontFamily: "Manrope" }}>
                {e.icon}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{e.name}</div>
              <div style={{ fontSize: "11px", color: "var(--text-disabled)", marginTop: "2px" }}>
                {e.mentions} mention
                {e.rank ? ` · Rank #${e.rank}` : ""}
              </div>
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 600, paddingLeft: "8px",
              color: e.visible ? "var(--success)" : "var(--text-disabled)",
            }}>
              {e.visible ? "Terlihat" : "Tidak"}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Topik Terlacak</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {topics.map((t) => (
          <div key={t.q} style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            background: "var(--bg-recessed)",
            border: "1px solid var(--glass-border)",
            borderRadius: "10px", padding: "12px 14px",
          }}>
            <div style={{
              width: "18px", height: "18px", borderRadius: "50%",
              background: t.found ? "var(--success-subtle)" : "var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px",
            }}>
              <span style={{ fontSize: "10px", color: t.found ? "var(--success)" : "var(--text-disabled)" }}>
                {t.found ? "✓" : "·"}
              </span>
            </div>
            <span style={{ fontSize: "12px", color: t.found ? "var(--text-secondary)" : "var(--text-disabled)", lineHeight: 1.4 }}>
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

  const [brandId, setBrandId] = useState<string | null>(null);
  const [seoData, setSeoData] = useState<{ keywords: any[]; stats: any[]; hasData: boolean } | null>(null);
  const [geoData, setGeoData] = useState<{ locations: any[]; stats: any[]; hasData: boolean } | null>(null);
  const [ssoData, setSsoData] = useState<{ engines: any[]; topics: any[]; stats: any[]; hasData: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: brand } = await supabase
        .from("brands")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!brand) { setLoading(false); return; }
      setBrandId(brand.id);

      try {
        const [seoRes, geoRes, ssoRes] = await Promise.all([
          fetch(`/api/analytics/seo?brand_id=${brand.id}`),
          fetch(`/api/analytics/geo?brand_id=${brand.id}`),
          fetch(`/api/analytics/sso?brand_id=${brand.id}`),
        ]);

        const [seo, geo, sso] = await Promise.all([
          seoRes.ok ? seoRes.json() : { keywords: [], stats: [], hasData: false },
          geoRes.ok ? geoRes.json() : { locations: [], stats: [], hasData: false },
          ssoRes.ok ? ssoRes.json() : { engines: [], topics: [], stats: [], hasData: false },
        ]);

        setSeoData(seo);
        setGeoData(geo);
        setSsoData(sso);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--bg-primary)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
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
            fontFamily: "var(--font-heading)",
            fontSize: "22px", fontWeight: 800,
            color: "var(--text-primary)", margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Analytic
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-disabled)" }}>
            Brand performance & discovery
          </p>
        </div>

        {/* Tab pills — top right */}
        <div style={{
          display: "flex",
          background: "var(--bg-recessed)",
          border: "1px solid var(--border-strong)",
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
                background: tab === t.id ? "var(--success)" : "transparent",
                color: tab === t.id ? "var(--bg-primary)" : "var(--accent)",
                fontSize: "11px",
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
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
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 16px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              border: "3px solid var(--border-default)",
              borderTopColor: "var(--accent)",
              animation: "spin 1s linear infinite",
            }} />
          </div>
        ) : (
          <>
            {tab === "seo" && (
              <SEOPanel
                keywords={seoData?.keywords ?? []}
                stats={seoData?.stats ?? []}
                hasData={seoData?.hasData ?? false}
              />
            )}
            {tab === "geo" && (
              <GEOPanel
                locations={geoData?.locations ?? []}
                stats={geoData?.stats ?? []}
                hasData={geoData?.hasData ?? false}
              />
            )}
            {tab === "sso" && (
              <SSOPanel
                engines={ssoData?.engines ?? []}
                topics={ssoData?.topics ?? []}
                stats={ssoData?.stats ?? []}
                hasData={ssoData?.hasData ?? false}
              />
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
