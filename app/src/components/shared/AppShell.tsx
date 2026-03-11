"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ── Icon factory ── */
const mkIcon = (size: number, children: React.ReactNode) => {
  const Icon = () => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
  Icon.displayName = "GvIcon";
  return Icon;
};

/* ── Nav icons (16×16) ── */
const HubIcon = mkIcon(16, <>
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</>);

const AIChatIcon = mkIcon(16, <>
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</>);

const ContentIcon = mkIcon(16, <>
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
</>);

const CalendarIcon = mkIcon(16, <>
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
  <line x1="16" y1="2" x2="16" y2="6"/>
  <line x1="8" y1="2" x2="8" y2="6"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
</>);

const AnalyticIcon = mkIcon(16, <>
  <line x1="18" y1="20" x2="18" y2="10"/>
  <line x1="12" y1="20" x2="12" y2="4"/>
  <line x1="6" y1="20" x2="6" y2="14"/>
</>);

/* ── User menu icons (15×15) ── */
const SettingsIcon = mkIcon(15, <>
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</>);

const BillingIcon = mkIcon(15, <>
  <rect width="20" height="14" x="2" y="5" rx="2"/>
  <line x1="2" y1="10" x2="22" y2="10"/>
</>);

const LogoutIcon = mkIcon(15, <>
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
  <polyline points="16 17 21 12 16 7"/>
  <line x1="21" y1="12" x2="9" y2="12"/>
</>);

const ChevronUpIcon = mkIcon(13, <>
  <polyline points="18 15 12 9 6 15"/>
</>);

/* ── Tab icons (13×13) ── */
const T = (children: React.ReactNode) => {
  const Icon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
  Icon.displayName = "GvTabIcon";
  return Icon;
};

const TTag       = T(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>);
const TChronicle = T(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>);
const TLink      = T(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>);
const TCard      = T(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>);
const TChat      = T(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>);
const TFile      = T(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>);
const TClock     = T(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>);
const TArticle   = T(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>);
const TImage     = T(<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>);
const TVideo     = T(<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>);
const TCalGrid   = T(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>);
const TCalWeek   = T(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="22"/><line x1="15" y1="4" x2="15" y2="22"/></>);
const TList      = T(<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>);
const TSearch    = T(<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>);
const TGlobe     = T(<><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></>);
const TBars      = T(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>);

/* ── Nav definitions ── */
const NAV_ITEMS = [
  { icon: <HubIcon />,      name: "Start",          path: "/start"          },
  { icon: <AIChatIcon />,   name: "AI Chat",        path: "/ai-chat"        },
  { icon: <ContentIcon />,  name: "Content Engine", path: "/content-studio" },
  { icon: <CalendarIcon />, name: "Calendar",       path: "/calendar"       },
  { icon: <AnalyticIcon />, name: "Analytics",      path: "/analytics"      },
];

/* Divider appears before these nav paths */
const NAV_DIVIDER_BEFORE = new Set(["/analytics"]);

/* ── Tab map per section ── */
type TabDef = { key: string; label: string; icon: React.ReactNode };
type SectionDef = { label: string; tabs: TabDef[] };
const TAB_MAP: Record<string, SectionDef> = {
  "/start": {
    label: "Start",
    tabs: [
      { key: "101 Brand",    label: "101 Brand",    icon: <TTag /> },
      { key: "Chronicle",    label: "Chronicle",    icon: <TChronicle /> },
      { key: "Connect",      label: "Connect",      icon: <TLink /> },
      { key: "Subscription", label: "Subscription", icon: <TCard /> },
    ],
  },
  "/ai-chat": {
    label: "AI Chat",
    tabs: [
      { key: "Chat",    label: "Chat",    icon: <TChat /> },
      { key: "Docs",    label: "Docs",    icon: <TFile /> },
      { key: "History", label: "History", icon: <TClock /> },
    ],
  },
  "/content-studio": {
    label: "Content Engine",
    tabs: [
      { key: "Article", label: "Article", icon: <TArticle /> },
      { key: "Image",   label: "Image",   icon: <TImage /> },
      { key: "Video",   label: "Video",   icon: <TVideo /> },
    ],
  },
  "/calendar": {
    label: "Calendar",
    tabs: [
      { key: "Month",    label: "Month",    icon: <TCalGrid /> },
      { key: "Week",     label: "Week",     icon: <TCalWeek /> },
      { key: "Schedule", label: "Schedule", icon: <TList /> },
    ],
  },
  "/analytics": {
    label: "Analytics",
    tabs: [
      { key: "SEO",          label: "SEO",    icon: <TSearch /> },
      { key: "GEO",          label: "GEO",    icon: <TGlobe /> },
      { key: "Social Search",label: "Social", icon: <TBars /> },
    ],
  },
};

/* ── Props ── */
export interface AppShellProps {
  center?: React.ReactNode;
  right?: React.ReactNode;
  onSubMenuChange?: (section: string, subItem: string) => void;
  activeSubItem?: string;
}

/* ══════════════════════════════════════════════════════════════════
   AppShell — GeoVera DS v5.9
   Layout: [sidebar 12–16%] [main 50%] [right flex-1]
   Floating fixed tab bar at bottom center (changes per section)
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
  const ctxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showUserMenu,     setShowUserMenu]     = useState(false);
  const [showCtxLabel,     setShowCtxLabel]     = useState(false);
  const [internalSubItem,  setInternalSubItem]  = useState<string>("");
  const [user, setUser] = useState<{
    name: string; email: string; initials: string; planName: string;
  } | null>(null);

  const activeSubItem = controlledSubItem ?? internalSubItem;

  /* Active nav + tab config */
  const activeNav = NAV_ITEMS.find((n) => pathname.startsWith(n.path));
  const section   = activeNav ? TAB_MAP[activeNav.path] : null;
  const tabs      = section?.tabs ?? [];

  /* Default to first tab when section changes */
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.key === internalSubItem)) {
      setInternalSubItem(tabs[0].key);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Show context label briefly when section changes */
  useEffect(() => {
    if (!section) return;
    setShowCtxLabel(true);
    if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current);
    ctxTimerRef.current = setTimeout(() => setShowCtxLabel(false), 2000);
    return () => { if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current); };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load user + plan */
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const email    = session.user.email ?? "";
      const rawName  = (session.user.user_metadata?.full_name as string | undefined) || email.split("@")[0];
      const initials = rawName.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase().slice(0, 2);

      let planName = "Free";
      try {
        const { data } = await supabase
          .from("subscriptions")
          .select("plans(name)")
          .eq("user_id", session.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (data?.plans) planName = (data.plans as unknown as { name: string }).name;
      } catch { /* ignore */ }

      setUser({ name: rawName, email, initials, planName });
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
    (key: string) => {
      setInternalSubItem(key);
      if (onSubMenuChange && activeNav) onSubMenuChange(activeNav.path, key);
    },
    [onSubMenuChange, activeNav],
  );

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes gv-float-in {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes gv-tab-swap {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        background: "var(--gv-color-bg-base)",
      }}>

        {/* ══════════════ LEFT SIDEBAR ══════════════ */}
        <aside style={{
          width: "12%",
          minWidth: 180,
          maxWidth: 210,
          height: "100%",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--gv-color-bg-surface)",
          borderRight: "1px solid var(--gv-color-neutral-200)",
          overflow: "hidden",
          position: "relative",
          zIndex: 20,
        }}>

          {/* Logo */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "18px 16px 16px",
            borderBottom: "1px solid var(--gv-color-neutral-100)",
            flexShrink: 0,
          }}>
            {/* GeoVera diamond SVG mark */}
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="gv-logo-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7AB3AB"/>
                  <stop offset="100%" stopColor="#3D6562"/>
                </linearGradient>
              </defs>
              <path d="M24 2 L46 24 L24 46 L2 24 Z" fill="url(#gv-logo-grad)"/>
              <path d="M24 12 L36 24 L24 36 L12 24 Z" fill="rgba(255,255,255,0.14)"/>
              <circle cx="24" cy="24" r="4" fill="white"/>
              <circle cx="24" cy="5" r="2.5" fill="white" opacity="0.8"/>
              <circle cx="43" cy="24" r="2.5" fill="white" opacity="0.8"/>
              <circle cx="24" cy="43" r="2.5" fill="white" opacity="0.8"/>
              <circle cx="5" cy="24" r="2.5" fill="white" opacity="0.8"/>
            </svg>
            <span style={{
              fontFamily: "var(--gv-font-heading)",
              fontSize: 15,
              fontWeight: 900,
              color: "var(--gv-color-neutral-900)",
              letterSpacing: "-0.04em",
            }}>GeoVera</span>
            {user?.planName && user.planName !== "Free" && (
              <span style={{
                marginLeft: "auto",
                fontFamily: "var(--gv-font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--gv-color-primary-600)",
                background: "var(--gv-color-primary-50)",
                border: "1px solid var(--gv-color-primary-200)",
                borderRadius: "var(--gv-radius-full)",
                padding: "2px 7px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                {user.planName}
              </span>
            )}
          </div>

          {/* Nav */}
          <nav style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 10px 0",
            scrollbarWidth: "none",
          }}>
            {/* Section label */}
            <div style={{
              fontFamily: "var(--gv-font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--gv-color-neutral-400)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "10px 8px 6px",
            }}>Menu</div>

            {NAV_ITEMS.map((item) => {
              const active = isActive(item.path);
              const showDivider = NAV_DIVIDER_BEFORE.has(item.path);
              return (
                <div key={item.name}>
                  {showDivider && (
                    <div style={{
                      height: 1,
                      background: "var(--gv-color-neutral-100)",
                      margin: "8px 10px",
                    }} />
                  )}
                  <Link
                    href={item.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "8px 10px",
                      borderRadius: "var(--gv-radius-sm)",
                      background: active ? "var(--gv-color-primary-50)" : "transparent",
                      color: active ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-500)",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                      position: "relative",
                      userSelect: "none",
                      marginBottom: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                        (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-900)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                      }
                    }}
                  >
                    {/* Left accent bar for active item */}
                    {active && (
                      <span style={{
                        position: "absolute",
                        left: 0,
                        top: "20%",
                        bottom: "20%",
                        width: 3,
                        borderRadius: "0 var(--gv-radius-full) var(--gv-radius-full) 0",
                        background: "var(--gv-gradient-primary)",
                        pointerEvents: "none",
                      }} />
                    )}
                    <span style={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: active ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)",
                      transition: "color var(--gv-duration-fast)",
                    }}>
                      {item.icon}
                    </span>
                    <span style={{
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {item.name}
                    </span>
                  </Link>
                </div>
              );
            })}
          </nav>

          {/* User section */}
          <div ref={menuRef} style={{
            flexShrink: 0,
            padding: 10,
            borderTop: "1px solid var(--gv-color-neutral-100)",
            position: "relative",
          }}>
            {/* User popup menu */}
            <div style={{
              position: "absolute",
              bottom: "calc(100% + 4px)",
              left: 10,
              right: 10,
              background: "var(--gv-color-bg-surface)",
              border: "1px solid var(--gv-color-neutral-200)",
              borderRadius: "var(--gv-radius-md)",
              boxShadow: "var(--gv-shadow-modal)",
              overflow: "hidden",
              zIndex: 100,
              opacity: showUserMenu ? 1 : 0,
              transform: showUserMenu ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
              transformOrigin: "bottom center",
              pointerEvents: showUserMenu ? "all" : "none",
              transition: `opacity var(--gv-duration-fast) var(--gv-easing-default), transform var(--gv-duration-fast) var(--gv-easing-spring)`,
            }}>
              {/* Header */}
              <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
                <p style={{ fontFamily: "var(--gv-font-heading)", fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", marginBottom: 1 }}>
                  {user?.name ?? "—"}
                </p>
                <p style={{ fontSize: 11, color: "var(--gv-color-neutral-500)" }}>
                  {user?.email ?? ""}
                </p>
              </div>

              {/* Menu items */}
              <div style={{ padding: 6 }}>
                {/* Settings */}
                <Link
                  href="/subscription"
                  onClick={() => setShowUserMenu(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: "var(--gv-radius-sm)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--gv-color-neutral-700)",
                    textDecoration: "none",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-900)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-700)";
                  }}
                >
                  <span style={{ color: "var(--gv-color-neutral-400)", flexShrink: 0, display: "flex" }}><SettingsIcon /></span>
                  Settings
                </Link>

                {/* Billing */}
                <Link
                  href="/subscription"
                  onClick={() => setShowUserMenu(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: "var(--gv-radius-sm)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--gv-color-neutral-700)",
                    textDecoration: "none",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-900)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-700)";
                  }}
                >
                  <span style={{ color: "var(--gv-color-neutral-400)", flexShrink: 0, display: "flex" }}><BillingIcon /></span>
                  Billing
                </Link>

                {/* Divider */}
                <div style={{ height: 1, background: "var(--gv-color-neutral-100)", margin: "5px 6px" }} />

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: "var(--gv-radius-sm)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--gv-color-danger-500)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-danger-50)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span style={{ color: "var(--gv-color-danger-500)", opacity: 0.7, flexShrink: 0, display: "flex" }}><LogoutIcon /></span>
                  Log Out
                </button>
              </div>
            </div>

            {/* User trigger button */}
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 10px",
                borderRadius: "var(--gv-radius-sm)",
                border: "none",
                background: showUserMenu ? "var(--gv-color-primary-50)" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--gv-duration-fast)",
              }}
              onMouseEnter={(e) => {
                if (!showUserMenu) (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
              }}
              onMouseLeave={(e) => {
                if (!showUserMenu) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Avatar with gradient + online dot */}
              <span style={{
                position: "relative",
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--gv-gradient-primary)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--gv-font-heading)",
                fontSize: 11,
                fontWeight: 800,
                color: "white",
                letterSpacing: "0.02em",
                boxShadow: "0 2px 6px rgba(95,143,139,0.3)",
              }}>
                {user?.initials ?? "?"}
                <span style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--gv-color-success-500)",
                  border: "1.5px solid var(--gv-color-bg-surface)",
                }} />
              </span>

              {/* Name + plan */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--gv-color-neutral-900)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.3,
                }}>
                  {user?.name ?? "Loading…"}
                </p>
                <p style={{
                  fontFamily: "var(--gv-font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--gv-color-primary-600)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}>
                  {user?.planName ? `${user.planName} Plan` : ""}
                </p>
              </div>

              {/* Chevron */}
              <span style={{
                color: "var(--gv-color-neutral-400)",
                flexShrink: 0,
                display: "flex",
                transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform var(--gv-duration-fast) var(--gv-easing-default)",
              }}>
                <ChevronUpIcon />
              </span>
            </button>
          </div>
        </aside>

        {/* ══════════════ MAIN COLUMN (50%) ══════════════ */}
        <main style={{
          flex: "0 0 50%",
          height: "100%",
          overflowY: "auto",
          borderRight: "1px solid var(--gv-color-neutral-200)",
          background: "var(--gv-color-bg-base)",
          position: "relative",
        }}>
          <div className="custom-scrollbar" style={{ minHeight: "100%", paddingBottom: 80 }}>
            {center}
          </div>
        </main>

        {/* ══════════════ RIGHT COLUMN (flex-1) ══════════════ */}
        <aside style={{
          flex: 1,
          height: "100%",
          overflowY: "auto",
          background: "var(--gv-color-bg-surface-elevated)",
        }}>
          <div className="custom-scrollbar" style={{ minHeight: "100%", paddingBottom: 80 }}>
            {right}
          </div>
        </aside>
      </div>

      {/* ══════════════ FLOATING TAB BAR (fixed) ══════════════ */}
      {tabs.length > 0 && (
        <>
          {/* Context label */}
          <div style={{
            position: "fixed",
            bottom: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            fontFamily: "var(--gv-font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--gv-color-neutral-400)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "3px 10px",
            borderRadius: "var(--gv-radius-full)",
            border: "1px solid var(--gv-color-neutral-200)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            opacity: showCtxLabel ? 1 : 0,
            transition: "opacity 0.2s",
          }}>
            {section?.label}
          </div>

          {/* Floatbar */}
          <div
            key={pathname}
            style={{
              position: "fixed",
              bottom: 22,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 5,
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.95)",
              borderRadius: "var(--gv-radius-full)",
              boxShadow: "0 8px 32px rgba(31,36,40,0.12), 0 2px 8px rgba(31,36,40,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
              animation: "gv-float-in 0.4s var(--gv-easing-spring) both",
            }}
          >
            {tabs.map((tab, i) => {
              const isActiveTab = activeSubItem === tab.key;
              const nextTab = tabs[i + 1];
              const showSep = !isActiveTab && nextTab && nextTab.key !== activeSubItem && i < tabs.length - 1;

              return (
                <div key={tab.key} style={{ display: "flex", alignItems: "center" }}>
                  <button
                    onClick={() => handleSubItemClick(tab.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "8px 16px",
                      borderRadius: "var(--gv-radius-full)",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: isActiveTab ? "white" : "var(--gv-color-neutral-500)",
                      background: isActiveTab ? "var(--gv-gradient-primary)" : "transparent",
                      boxShadow: isActiveTab ? "0 3px 12px rgba(95,143,139,0.35)" : "none",
                      transition: "all var(--gv-duration-fast) var(--gv-easing-spring)",
                      whiteSpace: "nowrap",
                      fontFamily: "var(--gv-font-body)",
                      animation: `gv-tab-swap 0.2s var(--gv-easing-spring) ${i * 0.03}s both`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActiveTab) {
                        (e.currentTarget as HTMLElement).style.background = "var(--gv-color-neutral-100)";
                        (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-900)";
                      } else {
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(95,143,139,0.45)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActiveTab) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                      } else {
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 12px rgba(95,143,139,0.35)";
                      }
                    }}
                  >
                    <span style={{
                      display: "flex",
                      opacity: isActiveTab ? 1 : 0.7,
                      color: isActiveTab ? "white" : "currentColor",
                      transition: "all var(--gv-duration-fast)",
                    }}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>

                  {/* Separator dot between inactive adjacent tabs */}
                  {showSep && (
                    <span style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background: "var(--gv-color-neutral-200)",
                      flexShrink: 0,
                      margin: "0 2px",
                      display: "flex",
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
