"use client";
import React from "react";

export type ChatSection = "chat" | "documents" | "history";

interface ChatNavProps {
  active: ChatSection;
  onChange: (section: ChatSection) => void;
  counts?: { chat?: number; documents?: number; history?: number };
}

// ── DS v5.8 accent: use primary teal for chat nav ──────────────────
const MODE = {
  chat:      { accent: "var(--gv-color-primary-500)", light: "var(--gv-color-primary-50)",  border: "var(--gv-color-primary-200)",  text: "var(--gv-color-primary-700)"  },
  documents: { accent: "var(--gv7-mode-seo-accent)",  light: "var(--gv7-mode-seo-light)",   border: "var(--gv7-mode-seo-border)",   text: "var(--gv7-mode-seo-text)"   },
  history:   { accent: "var(--gv7-mode-geo-accent)",  light: "var(--gv7-mode-geo-light)",   border: "var(--gv7-mode-geo-border)",   text: "var(--gv7-mode-geo-text)"   },
} as const;

const ITEMS: { key: ChatSection; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    key: "chat",
    label: "Chat",
    sub: "AI · Brand · SEO · GEO",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
    ),
  },
  {
    key: "documents",
    label: "Documents",
    sub: "Knowledge · Brand files",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "History",
    sub: "Sessions · Past chats",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="12 8 12 12 14 14" />
        <path d="M3.05 11a9 9 0 1 0 .5-4" />
        <polyline points="3 3 3 7 7 7" />
      </svg>
    ),
  },
];

// ── Pill row variant ───────────────────────────────────────────────
export function ChatPillNav({ active, onChange, counts }: ChatNavProps) {
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
export function ChatSideNav({ active, onChange }: ChatNavProps) {
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
          </button>
        );
      })}
    </nav>
  );
}

// ── Bottom tab bar ─────────────────────────────────────────────────
export function ChatTabBar({ active, onChange, counts }: ChatNavProps) {
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
                    transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
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
