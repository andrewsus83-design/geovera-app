"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ── WIRED-style icons (currentColor, strokeLinecap square) ── */

const HubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
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
);

const AIChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
  </svg>
);

const ContentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M2 8l10-5 10 5-10 5-10-5z" />
    <path d="M2 13l10 5 10-5" />
    <path d="M2 18l10 5 10-5" />
  </svg>
);

const SmartReplyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M21 11.5C21 16.75 16.97 21 12 21C10.5 21 9.1 20.65 7.85 20.05L3 21L4.35 16.85C3.45 15.45 3 13.8 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 11.5Z" />
    <circle cx="8"  cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const AnalyticIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="15 7 21 7 21 13" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

/* ── Nav definitions ── */
const NAV_ITEMS = [
  { icon: <HubIcon />,        name: "Start",          path: "/start"          },
  { icon: <AIChatIcon />,     name: "AI Chat",        path: "/ai-chat"        },
  { icon: <ContentIcon />,    name: "Content Engine", path: "/content-studio" },
  { icon: <SmartReplyIcon />, name: "Smart Reply",    path: "/auto-reply"     },
  { icon: <AnalyticIcon />,   name: "Analytics",      path: "/analytics"      },
];

/* Submenu items per section */
const SUBMENUS: Record<string, string[]> = {
  "/start":           ["101 Brand", "Chronicle", "Connect", "Subscription"],
  "/ai-chat":         ["Chat", "Docs", "History"],
  "/content-studio":  ["Article", "Image", "Video"],
  "/auto-reply":      ["Manual", "Auto", "Setting"],
  "/analytics":       ["SEO", "GEO", "Social Search"],
};

/* ── Mode accent colors per section (DS tokens) ── */
const MODE_ACCENTS: Record<string, string> = {
  "/start":           "var(--gv7-mode-general-accent)",
  "/ai-chat":         "var(--gv7-mode-general-accent)",
  "/content-studio":  "var(--gv7-mode-seo-accent)",
  "/auto-reply":      "var(--gv7-mode-social-accent)",
  "/analytics":       "var(--gv7-mode-geo-accent)",
};

/* ── Props ── */
export interface AppShellProps {
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** Called when the user clicks a submenu item */
  onSubMenuChange?: (section: string, subItem: string) => void;
  /** Controlled active submenu item (optional — AppShell manages it internally if not provided) */
  activeSubItem?: string;
}

/* ══════════════════════════════════════════════════════════════════
   AppShell — GeoVera Design System
   Layout: [sidebar 16%] [center ~48%] [right 36%]
   Floating sticky submenu bar at bottom (changes per section)
══════════════════════════════════════════════════════════════════ */
export default function AppShell({
  center,
  right,
  onSubMenuChange,
  activeSubItem: controlledSubItem,
}: AppShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const menuRef  = useRef<HTMLDivElement>(null);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; initials: string } | null>(null);
  const [internalSubItem, setInternalSubItem] = useState<string>("");

  /* Active submenu (controlled vs uncontrolled) */
  const activeSubItem = controlledSubItem ?? internalSubItem;

  /* Detect active nav section */
  const activeNav = NAV_ITEMS.find((n) => pathname.startsWith(n.path));
  const subItems  = activeNav ? (SUBMENUS[activeNav.path] ?? []) : [];
  const modeAccent = activeNav ? (MODE_ACCENTS[activeNav.path] ?? "var(--gv-color-primary-500)") : "var(--gv-color-primary-500)";

  /* Default first submenu item when section changes */
  useEffect(() => {
    if (subItems.length > 0 && !subItems.includes(internalSubItem)) {
      setInternalSubItem(subItems[0]);
    }
  }, [pathname, subItems, internalSubItem]);

  /* Load current user */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const email   = session.user.email ?? "";
      const rawName = (session.user.user_metadata?.full_name as string | undefined) || email.split("@")[0];
      const initials = rawName.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase().slice(0, 2);
      setUser({ name: rawName, email, initials });
    });
  }, []);

  /* Close user menu on outside click */
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/signin");
  };

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  const handleSubItemClick = useCallback(
    (item: string) => {
      setInternalSubItem(item);
      if (onSubMenuChange && activeNav) onSubMenuChange(activeNav.path, item);
    },
    [onSubMenuChange, activeNav],
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        background: "var(--gv-color-bg-base)",
        position: "relative",
      }}
    >
      {/* ═══════════════════ LEFT SIDEBAR (16%) ═══════════════════ */}
      <div
        style={{
          width: "16%",
          minWidth: 172,
          maxWidth: 240,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--gv-color-bg-surface)",
          borderRight: "1px solid var(--gv-color-neutral-100)",
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid var(--gv-color-neutral-100)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image
              src="/images/geoveralogo.png"
              alt="GeoVera"
              width={32}
              height={32}
              style={{ borderRadius: 10 }}
            />
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--gv-color-neutral-900)",
                fontFamily: "var(--gv-font-heading)",
                letterSpacing: "-0.02em",
              }}
            >
              GeoVera
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: "10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflowY: "auto",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.name}
                href={item.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: "var(--gv-radius-sm)",
                  background: active ? "var(--gv-color-primary-50)" : "transparent",
                  color: active ? "var(--gv-color-primary-600)" : "var(--gv-color-neutral-500)",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  fontFamily: "var(--gv-font-body)",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-50)";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-700)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                  }
                }}
              >
                <span
                  style={{
                    color: active ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {item.icon}
                </span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div
          ref={menuRef}
          style={{
            padding: "10px",
            borderTop: "1px solid var(--gv-color-neutral-100)",
            flexShrink: 0,
            position: "relative",
          }}
        >
          {/* User popup */}
          {showUserMenu && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 10,
                right: 10,
                borderRadius: "var(--gv-radius-md)",
                background: "var(--gv-color-bg-surface)",
                border: "1px solid var(--gv-color-neutral-200)",
                boxShadow: "var(--gv-shadow-modal)",
                overflow: "hidden",
                zIndex: 200,
              }}
            >
              {/* User info */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-900)", lineHeight: 1.3 }}>
                  {user?.name ?? "—"}
                </p>
                <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>
                  {user?.email ?? ""}
                </p>
              </div>

              {/* Settings */}
              <Link
                href="/subscription"
                onClick={() => setShowUserMenu(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--gv-color-neutral-700)",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--gv-color-neutral-100)",
                  transition: "background var(--gv-duration-fast) var(--gv-easing-default)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gv-color-neutral-50)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <SettingsIcon />
                Settings
              </Link>

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--gv-color-danger-600)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--gv-duration-fast) var(--gv-easing-default)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--gv-color-danger-50)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <LogoutIcon />
                Log out
              </button>
            </div>
          )}

          {/* User trigger button */}
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: "var(--gv-radius-sm)",
              border: "none",
              background: showUserMenu ? "var(--gv-color-primary-50)" : "transparent",
              cursor: "pointer",
              transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
            }}
            onMouseEnter={(e) => {
              if (!showUserMenu) (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-50)";
            }}
            onMouseLeave={(e) => {
              if (!showUserMenu) (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: "var(--gv-color-primary-500)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                letterSpacing: "0.04em",
              }}
            >
              {user?.initials ?? "?"}
            </span>
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                {user?.name ?? "Loading…"}
              </p>
              <p style={{ fontSize: 10, color: "var(--gv-color-neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, marginTop: 1 }}>
                {user?.email ?? ""}
              </p>
            </div>
            <span
              style={{
                color: "var(--gv-color-neutral-400)",
                flexShrink: 0,
                transform: showUserMenu ? "rotate(0deg)" : "rotate(180deg)",
                transition: "transform var(--gv-duration-fast) var(--gv-easing-default)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronUpIcon />
            </span>
          </button>
        </div>
      </div>

      {/* ═══════════════════ CENTER + RIGHT WRAPPER ═══════════════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 12,
          padding: "12px 12px 12px 12px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* CENTER (~48% of viewport, flex-1) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "var(--gv-radius-xl)",
            background: "var(--gv-color-bg-surface)",
            border: "1px solid var(--gv-color-neutral-200)",
            boxShadow: "var(--gv-shadow-card)",
            position: "relative",
          }}
        >
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingBottom: 72 }}>
            {center}
          </div>
        </div>

        {/* RIGHT (36% of viewport) */}
        <div
          style={{
            flex: "0 0 calc(36% - 12px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "var(--gv-radius-xl)",
            background: "var(--gv-color-bg-surface)",
            border: "1px solid var(--gv-color-neutral-200)",
            boxShadow: "var(--gv-shadow-card)",
          }}
        >
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {right}
          </div>
        </div>

        {/* ═══════════════════ FLOATING SUBMENU BAR ═══════════════════
            Sticky bottom, floats over center+right columns
        ══════════════════════════════════════════════════════════════ */}
        {subItems.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 6px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid var(--gv-color-neutral-200)",
              boxShadow: "var(--gv-shadow-modal)",
            }}
          >
            {subItems.map((item) => {
              const isActiveItem = activeSubItem === item;
              return (
                <button
                  key={item}
                  onClick={() => handleSubItemClick(item)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: isActiveItem ? 600 : 500,
                    border: "none",
                    background: isActiveItem ? modeAccent : "transparent",
                    color: isActiveItem ? "#fff" : "var(--gv-color-neutral-500)",
                    cursor: "pointer",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--gv-font-body)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveItem) (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                    if (!isActiveItem) (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-700)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveItem) (e.currentTarget as HTMLElement).style.background = "transparent";
                    if (!isActiveItem) (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                  }}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
