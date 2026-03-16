"use client";
import React from "react";

export type ReplySection = "manual" | "auto" | "setting";

interface ReplyNavProps {
  active: ReplySection;
  onChange: (section: ReplySection) => void;
  counts?: { manual?: number; auto?: number; setting?: number };
}

const MODE = {
  manual:  { accent: "var(--gv-color-primary-500)", light: "var(--gv-color-primary-50)",  border: "var(--gv-color-primary-200)",  text: "var(--gv-color-primary-700)"  },
  auto:    { accent: "var(--gv7-mode-seo-accent)",  light: "var(--gv7-mode-seo-light)",   border: "var(--gv7-mode-seo-border)",   text: "var(--gv7-mode-seo-text)"   },
  setting: { accent: "var(--gv7-mode-geo-accent)",  light: "var(--gv7-mode-geo-light)",   border: "var(--gv7-mode-geo-border)",   text: "var(--gv7-mode-geo-text)"   },
} as const;

const ITEMS: { key: ReplySection; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    key: "manual",
    label: "Manual Reply",
    sub: "Queued · Attention",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5C21 16.75 16.97 21 12 21C10.5 21 9.1 20.65 7.85 20.05L3 21L4.35 16.85C3.45 15.45 3 13.8 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 11.5Z" />
        <line x1="8"  y1="10" x2="16" y2="10" />
        <line x1="8"  y1="14" x2="12" y2="14" />
      </svg>
    ),
  },
  {
    key: "auto",
    label: "Auto Reply",
    sub: "AI · Late API · Sent",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
    ),
  },
  {
    key: "setting",
    label: "Setting",
    sub: "Cooldown · Mode · Rules",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

// ── Pill row variant ───────────────────────────────────────────────
export function ReplyPillNav({ active, onChange, counts }: ReplyNavProps) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6 }}>
      {ITEMS.map(({ key, label }) => {
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

// ── Card list (sidebar) variant ────────────────────────────────────
export function ReplySideNav({ active, onChange, counts }: ReplyNavProps) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {ITEMS.map(({ key, label, sub, icon }) => {
        const isActive = active === key;
        const m = MODE[key];
        const count = counts?.[key];
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
            {count !== undefined && count > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: isActive ? m.accent : "var(--gv-color-neutral-200)",
                  color: isActive ? "#fff" : "var(--gv-color-neutral-500)",
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ── Bottom tab bar ─────────────────────────────────────────────────
export function ReplyTabBar({ active, onChange, counts }: ReplyNavProps) {
  return (
    <nav role="tablist" style={{ display: "flex", height: "100%" }}>
      {ITEMS.map(({ key, icon, label }) => {
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
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
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
                transition: "transform var(--gv-duration-normal) var(--gv-easing-spring)",
                transformOrigin: "center",
              }}
            />
            <span style={{ color: isActive ? m.accent : "var(--gv-color-neutral-400)", transition: "color var(--gv-duration-fast) var(--gv-easing-default)" }}>
              {icon}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {label}
              {count !== undefined && count > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 4px",
                    borderRadius: 999,
                    background: isActive ? m.accent : "var(--gv-color-neutral-200)",
                    color: isActive ? "#fff" : "var(--gv-color-neutral-400)",
                  }}
                >
                  {count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
