"use client";
import React from "react";

export type StartSection = "brand101" | "chronicle" | "connect" | "subscription";

interface StartNavProps {
  active: StartSection;
  onChange: (section: StartSection) => void;
}

const ITEMS: { key: StartSection; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    key: "brand101",
    label: "101 Brand",
    sub: "Brand DNA · Deep Research",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2" />
        <circle cx="6"  cy="6"  r="2" />
        <circle cx="18" cy="6"  r="2" />
        <circle cx="6"  cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <line x1="8"  y1="6"  x2="10" y2="11" />
        <line x1="16" y1="6"  x2="14" y2="11" />
        <line x1="8"  y1="18" x2="10" y2="13" />
        <line x1="16" y1="18" x2="14" y2="13" />
      </svg>
    ),
  },
  {
    key: "chronicle",
    label: "Chronicle",
    sub: "Brand story · Milestones",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <line x1="8" y1="7"  x2="16" y2="7"  />
        <line x1="8" y1="11" x2="16" y2="11" />
        <line x1="8" y1="15" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    key: "connect",
    label: "Connect",
    sub: "Platforms · Accounts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    key: "subscription",
    label: "Subscription",
    sub: "Plan · Billing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
];

// ── Pill row variant (compact header) ─────────────────────────────
export function StartPillNav({ active, onChange }: StartNavProps) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6 }}>
      {ITEMS.map(({ key, label }) => {
        const isActive = active === key;
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
              border: `1.5px solid ${isActive ? "var(--gv-color-primary-200)" : "transparent"}`,
              background: isActive ? "var(--gv-color-primary-50)" : "var(--gv-color-neutral-100)",
              color: isActive ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-500)",
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "var(--gv-color-primary-50)";
                el.style.color = "var(--gv-color-primary-700)";
                el.style.borderColor = "var(--gv-color-primary-200)";
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
          </button>
        );
      })}
    </div>
  );
}

// ── Card list variant (left-panel sidebar menu) ────────────────────
export function StartSideNav({ active, onChange }: StartNavProps) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {ITEMS.map(({ key, label, sub, icon }) => {
        const isActive = active === key;
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
              border: `1.5px solid ${isActive ? "var(--gv-color-primary-200)" : "transparent"}`,
              background: isActive ? "var(--gv-color-primary-50)" : "transparent",
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-200)";
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
                  background: "var(--gv-color-primary-500)",
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
                background: isActive ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-100)",
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
                  color: isActive ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-700)",
                  transition: "color var(--gv-duration-fast) var(--gv-easing-default)",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  color: isActive ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)",
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

// ── Bottom tab bar variant ─────────────────────────────────────────
export function StartTabBar({ active, onChange }: StartNavProps) {
  return (
    <nav role="tablist" style={{ display: "flex", height: "100%" }}>
      {ITEMS.map(({ key, icon, label }) => {
        const isActive = active === key;
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
              background: isActive ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
              color: isActive ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-400)",
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-primary-700)";
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
                background: "var(--gv-color-primary-500)",
                transform: isActive ? "scaleX(1)" : "scaleX(0)",
                transition: "transform var(--gv-duration-normal) var(--gv-easing-spring)",
                transformOrigin: "center",
              }}
            />
            <span style={{ color: isActive ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)", transition: "color var(--gv-duration-fast) var(--gv-easing-default)" }}>
              {icon}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
