"use client";
import React from "react";

export type AnalyticsSection = "overview" | "seo" | "geo" | "social";

interface AnalyticsScores {
  overall?: number | null;
  seo?: number | null;
  geo?: number | null;
  social?: number | null;
}

interface AnalyticsNavProps {
  activeSection: AnalyticsSection;
  onSectionChange: (section: AnalyticsSection) => void;
  scores?: AnalyticsScores;
  loading?: boolean;
}

// ── DS v5.8 mode token map ─────────────────────────────────────────
const MODE_TOKENS = {
  overview: {
    accent: "var(--gv7-mode-general-accent)",
    light:  "var(--gv7-mode-general-light)",
    border: "var(--gv7-mode-general-border)",
    text:   "var(--gv7-mode-general-text)",
  },
  seo: {
    accent: "var(--gv7-mode-seo-accent)",
    light:  "var(--gv7-mode-seo-light)",
    border: "var(--gv7-mode-seo-border)",
    text:   "var(--gv7-mode-seo-text)",
  },
  geo: {
    accent: "var(--gv7-mode-geo-accent)",
    light:  "var(--gv7-mode-geo-light)",
    border: "var(--gv7-mode-geo-border)",
    text:   "var(--gv7-mode-geo-text)",
  },
  social: {
    accent: "var(--gv7-mode-social-accent)",
    light:  "var(--gv7-mode-social-light)",
    border: "var(--gv7-mode-social-border)",
    text:   "var(--gv7-mode-social-text)",
  },
} as const;

const NAV_ITEMS: {
  key: AnalyticsSection;
  label: string;
  scoreKey: keyof AnalyticsScores;
  icon: React.ReactNode;
}[] = [
  {
    key: "overview",
    label: "Overview",
    scoreKey: "overall",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    key: "seo",
    label: "SEO",
    scoreKey: "seo",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    key: "geo",
    label: "GEO",
    scoreKey: "geo",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    ),
  },
  {
    key: "social",
    label: "Social",
    scoreKey: "social",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    ),
  },
];

// ── AnalyticsNav: pill row (top header usage) ──────────────────────
export function AnalyticsPillNav({ activeSection, onSectionChange, scores, loading }: AnalyticsNavProps) {
  return (
    <div
      role="tablist"
      aria-label="Analytics sections"
      style={{ display: "flex", gap: 6 }}
    >
      {NAV_ITEMS.map(({ key, label, scoreKey }) => {
        const isActive = activeSection === key;
        const score = scores?.[scoreKey];
        const m = MODE_TOKENS[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSectionChange(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              cursor: "pointer",
              border: `1.5px solid ${isActive ? m.border : "transparent"}`,
              background: isActive ? m.light : "var(--gv-color-neutral-100)",
              color: isActive ? m.text : "var(--gv-color-neutral-500)",
              transition: `all var(--gv-duration-normal) var(--gv-easing-default)`,
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = m.light;
                (e.currentTarget as HTMLElement).style.color = m.text;
                (e.currentTarget as HTMLElement).style.borderColor = m.border;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }
            }}
          >
            {label}
            {!loading && score !== null && score !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: "2px 5px",
                  borderRadius: 999,
                  background: isActive ? m.accent : "var(--gv-color-neutral-200)",
                  color: isActive ? "#fff" : "var(--gv-color-neutral-500)",
                  transition: `all var(--gv-duration-normal) var(--gv-easing-default)`,
                }}
              >
                {score}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── AnalyticsTabBar: sticky bottom tab usage ───────────────────────
export function AnalyticsTabBar({ activeSection, onSectionChange, scores, loading }: AnalyticsNavProps) {
  return (
    <nav
      role="tablist"
      aria-label="Analytics sections"
      style={{
        display: "flex",
        height: "100%",
      }}
    >
      {NAV_ITEMS.map(({ key, icon, label, scoreKey }) => {
        const isActive = activeSection === key;
        const score = scores?.[scoreKey];
        const m = MODE_TOKENS[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSectionChange(key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              lineHeight: 1.2,
              cursor: "pointer",
              outline: "none",
              border: "none",
              borderRight: "1px solid var(--gv-color-neutral-200)",
              position: "relative",
              overflow: "hidden",
              background: isActive ? m.light : "var(--gv-color-bg-surface)",
              color: isActive ? m.text : "var(--gv-color-neutral-400)",
              transition: `all var(--gv-duration-normal) var(--gv-easing-default)`,
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = m.light;
                (e.currentTarget as HTMLElement).style.color = m.text;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "var(--gv-color-bg-surface)";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-400)";
              }
            }}
          >
            {/* Active indicator strip at top */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                borderRadius: "0 0 2px 2px",
                background: m.accent,
                transform: isActive ? "scaleX(1)" : "scaleX(0)",
                transition: `transform var(--gv-duration-normal) var(--gv-easing-spring)`,
                transformOrigin: "center",
              }}
            />

            {/* Icon */}
            <span style={{ color: isActive ? m.accent : "var(--gv-color-neutral-400)", transition: `color var(--gv-duration-fast) var(--gv-easing-default)` }}>
              {icon}
            </span>

            {/* Label + score chip */}
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {label}
              {!loading && score !== null && score !== undefined && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: "1px 4px",
                    borderRadius: 999,
                    background: isActive ? m.accent : "var(--gv-color-neutral-200)",
                    color: isActive ? "#fff" : "var(--gv-color-neutral-400)",
                    transition: `all var(--gv-duration-normal) var(--gv-easing-default)`,
                  }}
                >
                  {score}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
