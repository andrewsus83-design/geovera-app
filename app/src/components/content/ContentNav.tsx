"use client";
import React from "react";

export type ContentSection = "article" | "image" | "video";

interface ContentNavProps {
  active: ContentSection;
  onChange: (section: ContentSection) => void;
  counts?: { article?: number; image?: number; video?: number };
}

// ── DS v5.8 mode token map ─────────────────────────────────────────
const MODE = {
  article: {
    accent: "var(--gv7-mode-general-accent)",
    light:  "var(--gv7-mode-general-light)",
    border: "var(--gv7-mode-general-border)",
    text:   "var(--gv7-mode-general-text)",
  },
  image: {
    accent: "var(--gv7-mode-seo-accent)",
    light:  "var(--gv7-mode-seo-light)",
    border: "var(--gv7-mode-seo-border)",
    text:   "var(--gv7-mode-seo-text)",
  },
  video: {
    accent: "var(--gv7-mode-geo-accent)",
    light:  "var(--gv7-mode-geo-light)",
    border: "var(--gv7-mode-geo-border)",
    text:   "var(--gv7-mode-geo-text)",
  },
} as const;

const ITEMS: { key: ContentSection; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    key: "article",
    label: "Article",
    sub: "SEO copy · Blog · Social",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3L21 7L8 20L3 21L4 16L17 3Z"/>
        <line x1="13" y1="7" x2="17" y2="11"/>
      </svg>
    ),
  },
  {
    key: "image",
    label: "Image",
    sub: "Flux · Claude art director",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
  },
  {
    key: "video",
    label: "Video",
    sub: "Runway Gen 4 · Motion AI",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="14" height="12" rx="2"/>
        <path d="M16 10l5-3v10l-5-3V10z"/>
      </svg>
    ),
  },
];

// ── Pill row variant (compact header) ─────────────────────────────
export function ContentPillNav({ active, onChange, counts }: ContentNavProps) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6 }}>
      {ITEMS.map(({ key, label, icon }) => {
        const isActive = active === key;
        const m = MODE[key];
        const count = counts?.[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
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
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = m.light;
                el.style.color = m.text;
                el.style.borderColor = m.border;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "var(--gv-color-neutral-100)";
                el.style.color = "var(--gv-color-neutral-500)";
                el.style.borderColor = "transparent";
              }
            }}
          >
            <span style={{ color: isActive ? m.accent : "currentColor" }}>{icon}</span>
            {label}
            {count !== undefined && count > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 5px",
                  borderRadius: 999,
                  background: isActive ? m.accent : "var(--gv-color-neutral-200)",
                  color: isActive ? "#fff" : "var(--gv-color-neutral-500)",
                  transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Card list variant (left-panel sidebar menu) ────────────────────
export function ContentSideNav({ active, onChange }: ContentNavProps) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {ITEMS.map(({ key, label, sub, icon }) => {
        const isActive = active === key;
        const m = MODE[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "var(--gv-radius-sm)",
              cursor: "pointer",
              border: `1.5px solid ${isActive ? m.border : "transparent"}`,
              background: isActive ? m.light : "transparent",
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = m.light;
                (e.currentTarget as HTMLElement).style.borderColor = m.border;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }
            }}
          >
            {/* Active left accent bar */}
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 6,
                  bottom: 6,
                  width: 3,
                  borderRadius: 99,
                  background: m.accent,
                }}
              />
            )}
            {/* Icon badge */}
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--gv-radius-xs)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: isActive ? m.accent : "var(--gv-color-neutral-100)",
                color: isActive ? "#fff" : "var(--gv-color-neutral-400)",
                transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              }}
            >
              {icon}
            </span>
            {/* Labels */}
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: isActive ? m.text : "var(--gv-color-neutral-700)",
                  transition: "color var(--gv-duration-fast) var(--gv-easing-default)",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  color: isActive ? m.accent : "var(--gv-color-neutral-400)",
                  transition: "color var(--gv-duration-fast) var(--gv-easing-default)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sub}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

