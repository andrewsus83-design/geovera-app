"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/shared/AppShell";
import { supabase } from "@/lib/supabase";

/* ── Types ── */
interface BrandProfile {
  id: string;
  brand_name: string;
  website_url: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  country: string | null;
  research_status: string;
  brand_dna: Record<string, unknown> | null;
  research_data: Record<string, unknown> | null;
  source_of_truth: Record<string, unknown> | null;
  chronicle_updated_at: string | null;
  qa_analytics: Record<string, unknown> | null;
  created_at: string;
}

interface Subscription {
  id: string;
  status: string;
  invoice_number: string | null;
  activated_at: string | null;
  expires_at: string | null;
  proof_url: string | null;
  plan: {
    name: string;
    slug: string;
    price_idr: number;
  } | null;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_idr: number;
  is_active: boolean;
}

interface PlanQuota {
  plan_name: string;
  brands_limit: number;
  onboarding_runs_limit: number;
  ai_chat_messages_per_day: number;
  content_articles_per_day: number;
  content_images_per_day: number;
  content_videos_per_day: number;
  qa_probes_total: number;
  qa_runs_per_cycle: number;
  chronicle_runs_per_cycle: number;
}

interface Invoice {
  id: string;
  activated_at: string | null;
  expires_at: string | null;
  status: string;
  invoice_number: string | null;
  plan: { name: string; slug: string; price_idr: number } | null;
}

/* ── Color tokens (ST/BL DS v5.8/5.9) ── */
const ST = {
  research: "#3B82F6", r50: "#EFF6FF", r100: "#DBEAFE", r700: "#1D4ED8",
  deep: "#8B5CF6", d50: "#F5F3FF", d100: "#EDE9FE", d700: "#6D28D9",
  chronicle: "#F59E0B", c50: "#FFFBEB", c100: "#FEF3C7", c700: "#B45309",
  dna: "#10B981", dn50: "#ECFDF3", dn100: "#D1FAE5", dn700: "#047857",
  tone: "#EF4444", t50: "#FEF2F2", t100: "#FEE2E2", t700: "#B91C1C",
  dark: "#0F1923", dark2: "#162030",
};

/* ── Connect DS: gv_start_connect platform definitions ── */
interface ConnectPlatformDef {
  id: string; name: string; fieldKey: string | null;
  logo: React.ReactNode;
  coverGrad: string;  // platform identity cover gradient
}

const CONNECT_PLATFORMS: ConnectPlatformDef[] = [
  {
    id: "instagram", name: "Instagram", fieldKey: "instagram_handle",
    coverGrad: "linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  },
  {
    id: "tiktok", name: "TikTok", fieldKey: "tiktok_handle",
    coverGrad: "linear-gradient(135deg,#010101,#2a2a2a)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.15 8.15 0 0 0 4.77 1.52V6.75a4.85 4.85 0 0 1-1-.06z"/></svg>,
  },
  {
    id: "youtube", name: "YouTube", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#CC0000,#FF0000)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/></svg>,
  },
  {
    id: "twitter", name: "X (Twitter)", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#1a1a1a,#333)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    id: "linkedin", name: "LinkedIn", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#004182,#0A66C2)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>,
  },
  {
    id: "facebook", name: "Facebook", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#0d47a1,#1877F2)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    id: "pinterest", name: "Pinterest", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#8b0000,#E60023)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 0 0-4.373 23.178c-.01-.937-.002-2.065.233-3.085l1.676-7.1s-.428-.856-.428-2.121c0-1.988 1.153-3.473 2.586-3.473 1.219 0 1.81.915 1.81 2.013 0 1.227-.782 3.065-1.186 4.768-.337 1.425.714 2.585 2.12 2.585 2.546 0 4.255-3.27 4.255-7.14 0-2.944-1.988-5.133-5.576-5.133-4.06 0-6.575 3.03-6.575 6.41 0 1.162.337 1.985.863 2.614.242.286.275.4.187.73-.062.24-.203.82-.262 1.048-.087.33-.352.45-.645.327-1.797-.738-2.636-2.722-2.636-4.952 0-3.67 3.09-8.083 9.221-8.083 4.951 0 8.218 3.594 8.218 7.452 0 5.1-2.834 8.903-7.007 8.903-1.4 0-2.72-.758-3.17-1.612l-.862 3.33c-.312 1.144-1.16 2.577-1.727 3.449A12 12 0 1 0 12 0z"/></svg>,
  },
  {
    id: "threads", name: "Threads", fieldKey: null,
    coverGrad: "linear-gradient(135deg,#0d0d0d,#2a2a2a)",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.01v-.017c.024-7.533 4.76-11.993 10.52-11.993h.013c4.21.013 6.927 1.989 8.11 5.23.347.953.544 2.032.594 3.195.04.974-.096 1.906-.395 2.745-.77 2.164-2.537 3.395-4.89 3.395-.923 0-1.804-.275-2.548-.796a3.35 3.35 0 0 1-3.222 2.418 3.373 3.373 0 0 1-3.373-3.373c0-.898.35-1.715.916-2.322C7.447 9.57 8.654 8.918 10.39 8.918c.466 0 .906.057 1.313.169V8.2c0-.888-.72-1.608-1.609-1.608-.564 0-1.063.29-1.35.73L6.99 6.39c.6-1.066 1.74-1.785 3.049-1.785 1.934 0 3.508 1.574 3.508 3.508v3.59c.354.505.571 1.122.571 1.788a3.373 3.373 0 0 1-3.373 3.373z"/></svg>,
  },
];

/* ── Recommended Indonesian platforms (URL-only, no API) ── */
const REC_PLATFORMS = [
  { id: "kompasiana", name: "Kompasiana", tag: "UGC · Kompas", logoColor: "#E31E24", initial: "K", placeholder: "https://www.kompasiana.com/username" },
  { id: "detik", name: "Blog Detik", tag: "Blog UGC", logoColor: "#E4002B", initial: "D", placeholder: "https://blog.detik.com/username" },
  { id: "mojok", name: "Mojok.co", tag: "Gen-Z · Opini", logoColor: "#FF6B35", initial: "Mo", placeholder: "https://mojok.co/terminal/username" },
  { id: "idntimes", name: "IDN Times Community", tag: "Mass Reach", logoColor: "#5433FF", initial: "I", placeholder: "https://www.idntimes.com/community/username" },
  { id: "medium", name: "Medium", tag: "Thought Leadership", logoColor: "#222222", initial: "M", placeholder: "https://medium.com/@username" },
];

/* ── Subscription DS component tokens (gv_start_subscription source of truth) ── */
const SUB = {
  glassXs:     "rgba(255,255,255,0.12)",
  glassSm:     "rgba(255,255,255,0.20)",
  glassMd:     "rgba(255,255,255,0.30)",
  glassFill:   "rgba(255,255,255,0.80)",
  glowPrimary: "0 2px 8px rgba(95,143,139,0.30)",
  glowSuccess: "0 0 6px rgba(111,255,212,0.80)",
};

/* ── Plan display metadata ── */
const PLAN_DISPLAY: Record<string, { name: string; tagline: string; badge?: string; badgePro?: boolean }> = {
  basic:      { name: "Free",   tagline: "Mulai tanpa biaya" },
  premium:    { name: "Growth", tagline: "Untuk tim yang berkembang", badge: "Paket Kamu" },
  enterprise: { name: "Pro",    tagline: "Full power, no limits", badge: "★ Most Popular", badgePro: true },
};

/* ── Plan feature lists — check / cross per plan (sb-plan__feats DS pattern) ── */
const PLAN_FEATS: Record<string, Array<{ label: string; check: boolean }>> = {
  basic: [
    { label: "1 Brand Profile",     check: true  },
    { label: "6 AI Questions/hari", check: true  },
    { label: "10 Artikel/bulan",    check: true  },
    { label: "5 Gambar/bulan",      check: true  },
    { label: "Auto-Reply",          check: false },
    { label: "Deep Research",       check: false },
  ],
  premium: [
    { label: "1 Brand Profile",      check: true },
    { label: "12 AI Questions/hari", check: true },
    { label: "30 Artikel/bulan",     check: true },
    { label: "20 Gambar/bulan",      check: true },
    { label: "Auto-Reply 50x/5min",  check: true },
    { label: "Deep Research",        check: true },
  ],
  enterprise: [
    { label: "1 Brand Profile",        check: true },
    { label: "20 AI Questions/hari",   check: true },
    { label: "50 Artikel/bulan",       check: true },
    { label: "30 Gambar/bulan",        check: true },
    { label: "Auto-Reply 100x/5min",   check: true },
    { label: "Deep Research Priority", check: true },
  ],
};

/* ── Formatters ── */
function fmtIDR(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function timeAgo(s: string | null) {
  if (!s) return "Belum pernah";
  const diff = Date.now() - new Date(s).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Hari ini";
  if (days === 1) return "Kemarin";
  return `${days} hari lalu`;
}
function fmtNumber(n: number | unknown) {
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  return String(v);
}

/* ══════════════════════════════════════════════════════════════
   Tab: 101 Brand
══════════════════════════════════════════════════════════════ */
function BrandTab({ profile }: { profile: BrandProfile | null }) {
  if (!profile) return <EmptyBrand />;

  const dna = profile.brand_dna as Record<string, unknown> | null;
  const sot = profile.source_of_truth as Record<string, unknown> | null;

  const mission    = (dna?.mission     ?? sot?.["brand_foundation.mission"] ?? "—") as string;
  const vision     = (dna?.vision      ?? "—") as string;
  const values     = (dna?.values      ?? sot?.brand_values ?? "—") as string;
  const personality = (dna?.personality ?? dna?.brand_personality ?? "—") as string;
  const tagline    = (dna?.tagline     ?? "") as string;

  // Keywords from research_data or source_of_truth
  const rd = profile.research_data as Record<string, unknown> | null;
  const kwRaw = (sot?.keyword_intelligence as Record<string, unknown> | null)?.ranking_keywords
    ?? (rd?.keywords ?? []);
  const keywords: Array<{ word: string; size: "xl" | "lg" | "md" | "sm" }> = [];
  if (Array.isArray(kwRaw)) {
    kwRaw.slice(0, 20).forEach((kw, i) => {
      const word = typeof kw === "string" ? kw : (kw as Record<string, string>)?.keyword ?? "";
      const size = i < 2 ? "xl" : i < 6 ? "lg" : i < 12 ? "md" : "sm";
      if (word) keywords.push({ word, size });
    });
  }

  // Tone dimensions
  const toneRaw = (sot?.brand_presence as Record<string, unknown> | null) ?? dna ?? {};
  const toneDims: Array<{ name: string; lo: string; hi: string; val: number }> = [
    { name: "Formal", lo: "Santai", hi: "Profesional", val: Number(toneRaw.formality ?? 65) },
    { name: "Energetik", lo: "Tenang", hi: "Semangat", val: Number(toneRaw.energy ?? 70) },
    { name: "Teknis", lo: "Simpel", hi: "Detail", val: Number(toneRaw.technical ?? 50) },
    { name: "Emosional", lo: "Rasional", hi: "Emosional", val: Number(toneRaw.emotional ?? 60) },
  ];

  const pillars = [
    { mod: "ms", label: "Mission", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, val: mission },
    { mod: "vi", label: "Vision", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>, val: vision },
    { mod: "va", label: "Values", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, val: values },
    { mod: "pe", label: "Personality", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, val: personality },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* DNA Hero */}
      <div style={{
        padding: 16, borderRadius: "var(--gv-color-radius-lg, 24px)",
        background: `linear-gradient(135deg, ${ST.dark}, #0a1f14)`,
        position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ position: "absolute", top: -30, right: -10, width: 150, height: 150, background: `radial-gradient(circle, rgba(16,185,129,.2) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(16,185,129,.2)", border: "1.5px solid rgba(16,185,129,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="m17 6-2.5-2.5"/><path d="m14 8.5 1 1"/><path d="m7 18 2.5 2.5"/><path d="m3.5 14.5 1 1"/></svg>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 17, fontWeight: 900, color: "white", marginBottom: 2 }}>{profile.brand_name}</div>
          {tagline && <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", fontStyle: "italic" }}>{tagline}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Status: {profile.research_status}
            </span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: profile.research_status === "sot_ready" ? ST.dna : profile.research_status === "failed" ? ST.tone : "#FBBF24" }} />
          </div>
        </div>
      </div>

      {/* DNA Pillars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        {pillars.map(p => {
          const bg = p.mod === "ms" ? "var(--gv-color-primary-50, #EDF5F4)" : p.mod === "vi" ? ST.r50 : p.mod === "va" ? ST.dn50 : ST.c50;
          const ic = p.mod === "ms" ? "var(--gv-color-primary-500, #5F8F8B)" : p.mod === "vi" ? ST.research : p.mod === "va" ? ST.dna : ST.chronicle;
          const lb = p.mod === "ms" ? "var(--gv-color-primary-600, #4E7C78)" : p.mod === "vi" ? ST.r700 : p.mod === "va" ? ST.dn700 : ST.c700;
          return (
            <div key={p.mod} style={{ padding: 12, borderRadius: 16, border: "1.5px solid var(--gv-color-neutral-200, #E5E7EB)", background: "var(--gv-color-bg-surface-elevated, #FAFBFC)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: ic }}>{p.icon}</div>
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: lb }}>{p.label}</span>
              </div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 13, fontWeight: 800, color: "var(--gv-color-neutral-900, #1F2428)", marginBottom: 3 }}>
                {typeof p.val === "string" ? p.val : JSON.stringify(p.val)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Keyword Cloud */}
      {keywords.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Keyword DNA Map</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", padding: 14, background: "var(--gv-color-bg-surface-sunken, #EFF2F4)", borderRadius: 24, minHeight: 80, alignContent: "center" }}>
            {keywords.map(kw => {
              const s = kw.size === "xl" ? { fontSize: 17, bg: ST.dn50, color: ST.dn700, border: ST.dn100 }
                      : kw.size === "lg" ? { fontSize: 14, bg: "var(--gv-color-primary-50, #EDF5F4)", color: "var(--gv-color-primary-700, #3D6562)", border: "var(--gv-color-primary-100, #D4EAE7)" }
                      : kw.size === "md" ? { fontSize: 12, bg: ST.r50, color: ST.r700, border: ST.r100 }
                      : { fontSize: 11, bg: "var(--gv-color-neutral-100, #F3F4F6)", color: "var(--gv-color-neutral-700, #4A545B)", border: "var(--gv-color-neutral-200, #E5E7EB)" };
              return (
                <span key={kw.word} style={{ padding: "4px 12px", borderRadius: 9999, fontWeight: 700, border: `1.5px solid ${s.border}`, fontSize: s.fontSize, background: s.bg, color: s.color, cursor: "default" }}>
                  {kw.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tone Dimensions */}
      <div>
        <div style={{ padding: "12px 16px", borderRadius: 16, background: `linear-gradient(135deg, ${ST.t50}, #FFF5F5)`, border: `1px solid ${ST.t100}`, display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${ST.tone}, #F87171)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Brand Voice & Tone</div>
            <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", marginTop: 1 }}>Dimensi komunikasi brand</div>
          </div>
        </div>
        {toneDims.map(dim => (
          <div key={dim.name} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{dim.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)" }}>{dim.lo}</span>
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)" }}>·</span>
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)" }}>{dim.hi}</span>
              </div>
            </div>
            <div style={{ position: "relative", height: 9, background: "var(--gv-color-neutral-100)", borderRadius: 9999 }}>
              <div style={{ width: `${dim.val}%`, height: "100%", background: `linear-gradient(90deg, ${ST.tone}, #F87171)`, borderRadius: 9999 }} />
              <div style={{ position: "absolute", top: "50%", left: `calc(${dim.val}% - 8px)`, transform: "translateY(-50%)", width: 17, height: 17, borderRadius: "50%", background: "white", border: `2.5px solid ${ST.tone}`, boxShadow: "0 2px 6px rgba(0,0,0,.1)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyBrand() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: ST.dn50, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ST.dna} strokeWidth="2"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/></svg>
      </div>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>Brand Profile Kosong</div>
      <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", lineHeight: 1.6 }}>Lengkapi onboarding brand untuk melihat DNA, keyword, dan tone.</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Chronicle — shared helpers
══════════════════════════════════════════════════════════════ */
type TagCls = "ms" | "gr" | "la" | "in" | "dn" | "pu";
function tagStyle(cls: TagCls | string): { bg: string; color: string; border: string } {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    ms: { bg: ST.c50,  color: ST.c700,  border: "#FDE68A" },
    gr: { bg: "var(--gv-color-success-50)",  color: "var(--gv-color-success-700)",  border: "#A7F3D0" },
    la: { bg: "var(--gv-color-primary-50)", color: "var(--gv-color-primary-700)", border: "var(--gv-color-primary-100)" },
    in: { bg: ST.r50,  color: ST.r700,  border: ST.r100 },
    dn: { bg: "var(--gv-color-danger-50)",   color: "var(--gv-color-danger-700)",   border: "#FECACA" },
    pu: { bg: ST.d50,  color: ST.d700,  border: "#DDD6FE" },
  };
  return map[cls] ?? map.la;
}
function Tag({ cls, text }: { cls: TagCls | string; text: string }) {
  const ts = tagStyle(cls);
  return (
    <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-mono)", background: ts.bg, color: ts.color, border: `1px solid ${ts.border}` }}>
      {text}
    </span>
  );
}

function dotBg(type: string) {
  return { ms: ST.chronicle, ev: "var(--gv-color-primary-500)", da: ST.research, gr: ST.dna }[type] ?? "var(--gv-color-primary-500)";
}
function DotIcon({ type }: { type: string }) {
  if (type === "ms") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
  if (type === "ev") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (type === "da") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
}

/* ══════════════════════════════════════════════════════════════
   Chronicle Center — full storytelling (center column)
══════════════════════════════════════════════════════════════ */
function ChronicleCenter({ profile }: { profile: BrandProfile | null }) {
  if (!profile) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center", background: "var(--gv-color-bg-surface)", borderRadius: 20, border: "1.5px dashed var(--gv-color-neutral-300)" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: ST.c50, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ST.chronicle} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </div>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>Belum ada Chronicle</div>
      <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", lineHeight: 1.6 }}>Selesaikan Brand Intelligence untuk menghasilkan chronicle otomatis.</div>
    </div>
  );

  const rd  = profile.research_data   as Record<string, unknown> | null;
  const sot = profile.source_of_truth as Record<string, unknown> | null;
  const qa  = profile.qa_analytics    as Record<string, unknown> | null;
  const dna = profile.brand_dna       as Record<string, unknown> | null;

  /* ── Scores ── */
  const seoScore = Number(qa?.seo_score    ?? 42);
  const geoScore = Number(qa?.geo_score    ?? 28);
  const socScore = Number(qa?.social_score ?? 61);
  const seoDelta = Number(qa?.seo_delta    ?? 8);
  const geoDelta = Number(qa?.geo_delta    ?? 14);
  const socDelta = Number(qa?.social_delta ?? -3);

  /* ── Duration & meta ── */
  const createdAt = new Date(profile.created_at);
  const months    = (new Date().getFullYear() - createdAt.getFullYear()) * 12 + (new Date().getMonth() - createdAt.getMonth());
  const durLabel  = months < 1 ? "< 1 Bulan" : months < 12 ? `${months} Bulan` : `${Math.floor(months / 12)} Tahun${months % 12 > 0 ? ` ${months % 12} Bulan` : ""}`;
  const startLabel = createdAt.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const milestones = [profile.instagram_handle, profile.tiktok_handle, rd, sot].filter(Boolean).length + 2;

  /* ── Score cards ── */
  const scoreCards = [
    { key: "seo", label: "SEO Score", val: seoScore, delta: seoDelta, fillBg: "var(--gv-color-info-500)" },
    { key: "geo", label: "GEO Score", val: geoScore, delta: geoDelta, fillBg: "var(--gv-color-primary-500)" },
    { key: "soc", label: "Social Score", val: socScore, delta: socDelta, fillBg: ST.deep },
  ];

  /* ── Main moment (most significant) ── */
  const mainMoment = sot ? {
    yr: "2025 · Q1", type: "Digital Milestone · AI Research",
    title: "Brand Intelligence Source of Truth — Data Penuh Siap Digunakan",
    story: [
      `Setelah melalui proses riset mendalam, <strong>${profile.brand_name}</strong> kini memiliki Brand Source of Truth yang komprehensif. GeoVera menganalisis ribuan titik data: dari SERP, media sosial, hingga percakapan di ChatGPT dan Perplexity.`,
      `Hasilnya adalah peta lengkap tentang siapa kamu, siapa kompetitor kamu, dan di mana peluang terbesar yang belum diambil. Ini bukan sekadar data — ini adalah fondasi strategi brand digital yang kokoh.`,
    ],
    kpis: [
      { label: "Keywords", value: Array.isArray((rd as Record<string,unknown>|null)?.keywords) ? String(((rd as Record<string,unknown>)?.keywords as unknown[]).length) : "10+" },
      { label: "Kompetitor", value: Array.isArray((sot as Record<string,unknown>)?.competitor_intelligence) ? String(((sot as Record<string,unknown>)?.competitor_intelligence as unknown[]).length) : "5+" },
      { label: "SEO Score", value: String(seoScore) },
      { label: "Peluang", value: "12+" },
    ],
    tags: [{ cls: "ms", text: "Milestone" }, { cls: "gr", text: "SoT Ready" }, { cls: "pu", text: "AI Powered" }],
  } : rd ? {
    yr: "2024 · Q4", type: "Research Milestone · Brand Intelligence",
    title: "Brand Research Selesai — Peta Digital Terkuak",
    story: [
      `<strong>${profile.brand_name}</strong> baru saja menyelesaikan proses riset brand pertama bersama GeoVera. AI kami menganalisis kata kunci, kompetitor, dan tren pasar terkini.`,
      `Ini adalah titik balik penting — dari awalnya tidak tahu posisi brand di pasar digital, kini kamu memiliki panduan yang jelas tentang langkah selanjutnya.`,
    ],
    kpis: [
      { label: "Keywords", value: Array.isArray((rd as Record<string,unknown>)?.keywords) ? String(((rd as Record<string,unknown>)?.keywords as unknown[]).length) : "10+" },
      { label: "Peluang", value: "8+" },
      { label: "Kompetitor", value: "5+" },
      { label: "Status", value: "Done" },
    ],
    tags: [{ cls: "la", text: "Research Done" }, { cls: "pu", text: "AI Analysis" }, { cls: "gr", text: "Complete" }],
  } : {
    yr: createdAt.toLocaleDateString("id-ID", { year: "numeric", month: "long" }),
    type: "Brand Milestone · Onboarding",
    title: `${profile.brand_name} Bergabung dengan GeoVera`,
    story: [
      `Awal dari perjalanan brand digital <strong>${profile.brand_name}</strong>. Kamu telah mengambil langkah pertama yang paling berani — bergabung dengan platform AI terdepan untuk brand intelligence.`,
      `Dari sinilah segalanya dimulai: brand DNA, konten pertama, dan strategi digital yang dibangun oleh AI.`,
    ],
    kpis: [
      { label: "Platforms", value: String([profile.instagram_handle, profile.tiktok_handle].filter(Boolean).length) },
      { label: "Research", value: profile.research_status === "sot_ready" ? "✓" : "..." },
      { label: "Status", value: "Active" },
      { label: "Negara", value: profile.country ?? "—" },
    ],
    tags: [{ cls: "la", text: "GeoVera Connected" }, { cls: "gr", text: "AI Active" }],
  };

  /* ── Full timeline ── */
  type TlItem = { type: "ms"|"ev"|"da"|"gr"; yr: string; title: string; desc: string; tags: Array<{cls:string;text:string}> };
  const founded = String(dna?.founded_year ?? rd?.founded_year ?? createdAt.getFullYear());
  const timeline: TlItem[] = [];

  timeline.push({
    type: "gr", yr: founded,
    title: `${profile.brand_name} Lahir`,
    desc: `Perjalanan brand dimulai. ${profile.brand_name} hadir dengan visi ${dna?.vision ? String(dna.vision).slice(0, 80) : "membangun kehadiran yang kuat di pasar digital"}${profile.country ? ` di ${profile.country}` : ""}.`,
    tags: [{ cls: "la", text: "Brand Founded" }],
  });
  if (profile.instagram_handle) timeline.push({
    type: "ev", yr: "2023 · Maret",
    title: "Instagram Resmi Terhubung",
    desc: `@${profile.instagram_handle} terhubung ke GeoVera. Posting pertama dengan konten terstruktur menghasilkan 3× engagement dari biasanya.`,
    tags: [{ cls: "in", text: "Social Connected" }, { cls: "gr", text: "3× Engagement" }],
  });
  if (profile.tiktok_handle) timeline.push({
    type: "ev", yr: "2023 · Juli",
    title: "TikTok Resmi Aktif",
    desc: `Ekspansi ke TikTok dengan @${profile.tiktok_handle}. Menjangkau audiens lebih muda dan membangun komunitas baru.`,
    tags: [{ cls: "in", text: "TikTok Active" }, { cls: "ms", text: "New Channel" }],
  });
  if (rd) timeline.push({
    type: "da", yr: "2024 · Q4",
    title: "Brand Research Pipeline Selesai",
    desc: `GeoVera menyelesaikan analisis mendalam terhadap ${profile.brand_name}. Keyword, kompetitor, dan peluang pasar kini terpetakan secara komprehensif.`,
    tags: [{ cls: "pu", text: "AI Research" }, { cls: "la", text: "Intelligence" }],
  });
  if (sot) timeline.push({
    type: "ms", yr: "2025 · Q1",
    title: "Source of Truth Aktif — Brand Intelligence Penuh",
    desc: "GeoVera menyelesaikan Brand Source of Truth. Kini setiap keputusan konten, SEO, dan strategi brand didukung oleh data riil — bukan tebakan.",
    tags: [{ cls: "ms", text: "Milestone" }, { cls: "gr", text: "SoT Active" }],
  });
  timeline.push({
    type: "gr", yr: "Sekarang",
    title: "GeoVera AI Bekerja Untukmu",
    desc: `${profile.brand_name} terus membangun presence digital dengan dukungan penuh AI GeoVera. Setiap hari adalah kesempatan baru untuk tumbuh.`,
    tags: [{ cls: "gr", text: "Ongoing" }, { cls: "la", text: "AI Active" }],
  });

  return (
    <div style={{ padding: "24px 28px 120px" }}>

      {/* ── chr-hdr ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em" }}>
          <div style={{ width: 16, height: 2, background: `linear-gradient(90deg, ${ST.chronicle}, #FBBF24)`, borderRadius: 1 }} />
          Chronicle
        </div>
        <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 28, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-.04em", lineHeight: 1.25, marginBottom: 8 }}>
          Perjalanan{" "}
          <span style={{ background: `linear-gradient(135deg, ${ST.chronicle}, #FBBF24)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{profile.brand_name}</span>
        </h1>
        <p style={{ fontFamily: "var(--gv-font-body)", fontSize: 16, color: "var(--gv-color-neutral-500)", lineHeight: 1.6 }}>
          Setiap langkah yang kamu ambil adalah bagian dari cerita besar sebuah brand. Inilah catatan perjalanan, perjuangan, dan pencapaian brand kamu — dari hari pertama hingga hari ini.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 9999, border: "1px solid #FDE68A", background: "#FFFBEB", fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, color: ST.c700 }}>Dimulai {startLabel}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 9999, border: "1px solid var(--gv-color-primary-200)", background: "var(--gv-color-primary-50)", fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, color: "var(--gv-color-primary-700)" }}>Aktif · {durLabel}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 9999, border: "1px solid #A7F3D0", background: "var(--gv-color-success-50)", fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, color: "var(--gv-color-success-700)" }}>{milestones} Milestone</span>
        </div>
      </div>

      {/* ── chr-scores ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
        {scoreCards.map(sc => (
          <div key={sc.key} style={{ padding: 14, borderRadius: 16, background: "var(--gv-color-bg-surface-elevated)", border: "1.5px solid var(--gv-color-neutral-200)" }}>
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{sc.label}</div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 23, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-.03em", lineHeight: 1 }}>{sc.val}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, marginTop: 4, color: sc.delta >= 0 ? "var(--gv-color-success-500)" : "var(--gv-color-danger-500)" }}>
              {sc.delta >= 0 ? "▲" : "▼"} {sc.delta >= 0 ? "+" : ""}{sc.delta}
            </div>
            <div style={{ height: 3, borderRadius: 9999, background: "var(--gv-color-neutral-200)", marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${sc.val}%`, height: "100%", background: sc.fillBg, borderRadius: 9999 }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Section: Momen Paling Berkesan ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: ST.c50, border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ST.c700} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", whiteSpace: "nowrap" }}>Momen Paling Berkesan</span>
          <div style={{ flex: 1, height: 1, background: "var(--gv-color-neutral-200)" }} />
        </div>

        {/* st-ce entry card */}
        <div style={{ borderRadius: 24, overflow: "hidden", border: `1.5px solid ${ST.c100}`, marginBottom: 16 }}>
          <div style={{ height: 4, background: `linear-gradient(90deg, ${ST.chronicle}, #FBBF24, ${ST.chronicle})` }} />
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 9999, background: ST.c50, fontFamily: "var(--gv-font-heading)", fontSize: 16, fontWeight: 900, color: ST.c700, border: "1px solid #FDE68A" }}>{mainMoment.yr}</span>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".06em" }}>{mainMoment.type}</span>
            </div>
            <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-900)", marginBottom: 8, letterSpacing: "-.03em", lineHeight: 1.4 }}>{mainMoment.title}</h2>
            <div style={{ fontFamily: "var(--gv-font-body)", fontSize: 16, color: "var(--gv-color-neutral-600)", lineHeight: 1.75, marginBottom: 16 }}>
              {mainMoment.story.map((para, i) => (
                <p key={i} style={{ marginBottom: i < mainMoment.story.length - 1 ? 12 : 0 }} dangerouslySetInnerHTML={{ __html: para }} />
              ))}
            </div>
            {/* kpis */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 12, borderRadius: 16, background: "var(--gv-color-bg-surface-sunken)", marginBottom: 12 }}>
              {mainMoment.kpis.map(kpi => (
                <div key={kpi.label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-.02em" }}>{kpi.value}</div>
                  <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 2 }}>{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--gv-color-neutral-100)", background: "var(--gv-color-bg-surface-elevated)", flexWrap: "wrap" }}>
            {mainMoment.tags.map(t => <Tag key={t.text} cls={t.cls} text={t.text} />)}
          </div>
        </div>
      </div>

      {/* ── Section: Perjalanan Lengkap ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: ST.c50, border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ST.c700} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", whiteSpace: "nowrap" }}>Perjalanan Lengkap</span>
          <div style={{ flex: 1, height: 1, background: "var(--gv-color-neutral-200)" }} />
        </div>

        {/* st-ctl timeline */}
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ position: "absolute", left: 17, top: 16, bottom: 8, width: 2, background: `linear-gradient(180deg, ${ST.chronicle} 0%, ${ST.c100} 100%)`, borderRadius: 2 }} />
          {timeline.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 24 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, border: "2.5px solid var(--gv-color-bg-base)", background: dotBg(item.type), boxShadow: item.type === "ms" ? "0 0 0 3px rgba(245,158,11,.18)" : undefined }}>
                <DotIcon type={item.type} />
              </div>
              <div style={{ flex: 1, paddingTop: 8 }}>
                <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, color: ST.chronicle, marginBottom: 2, letterSpacing: ".04em" }}>{item.yr}</div>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 17, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4, letterSpacing: "-.02em", lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ fontFamily: "var(--gv-font-body)", fontSize: 15, color: "var(--gv-color-neutral-600)", lineHeight: 1.75, marginBottom: 8 }}>{item.desc}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {item.tags.map(t => <Tag key={t.text} cls={t.cls} text={t.text} />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Chronicle Right — 2-week highlights (right column)
══════════════════════════════════════════════════════════════ */
function ChronicleRight({ profile }: { profile: BrandProfile | null }) {
  if (!profile) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: ST.c50, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ST.chronicle} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </div>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>Belum ada Highlight</div>
      <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)" }}>Selesaikan setup brand untuk melihat highlight.</div>
    </div>
  );

  const qa  = profile.qa_analytics as Record<string, unknown> | null;
  const seoScore = Number(qa?.seo_score    ?? 42);
  const geoScore = Number(qa?.geo_score    ?? 28);
  const socScore = Number(qa?.social_score ?? 61);
  const seaDelta = Number(qa?.seo_delta    ?? 8);
  const geaDelta = Number(qa?.geo_delta    ?? 14);
  const socDelta = Number(qa?.social_delta ?? -3);

  /* ── Date range ── */
  const endDate   = new Date();
  const startDate = new Date(endDate.getTime() - 14 * 86400000);
  const fmt14     = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const dateRange = `${fmt14(startDate)} — ${fmt14(endDate)}`;

  const scores = [
    { key: "seo", label: "SEO",    val: seoScore, delta: seaDelta, fillBg: "linear-gradient(90deg, var(--gv-color-info-500), #60A5FA)" },
    { key: "geo", label: "GEO",    val: geoScore, delta: geaDelta, fillBg: "linear-gradient(90deg, var(--gv-color-primary-500), var(--gv-color-primary-400))" },
    { key: "soc", label: "Social", val: socScore, delta: socDelta, fillBg: `linear-gradient(90deg, ${ST.deep}, #DDD6FE)` },
  ];

  /* ── Achievement cards ── */
  type RpCard = { accent: "accent"|"success"|"info"|"primary"|"purple"; icCls: string; icBg: string; icColor: string; title: string; desc: string; badge?: {cls:string;text:string}; date: string };
  const cards: RpCard[] = [];

  const connPlatforms = [profile.instagram_handle && `Instagram (@${profile.instagram_handle})`, profile.tiktok_handle && `TikTok (@${profile.tiktok_handle})`].filter(Boolean) as string[];
  if (connPlatforms.length > 0) cards.push({
    accent: "success",
    icCls: "gr", icBg: "var(--gv-color-success-50)", icColor: "var(--gv-color-success-500)",
    title: connPlatforms.length > 1 ? "Instagram & TikTok Terhubung" : `${connPlatforms[0]} Terhubung`,
    desc: `${connPlatforms.length} akun sosial berhasil terkoneksi ke GeoVera. AI mulai memantau performa konten secara real-time.`,
    badge: { cls: "gr", text: "Connected ✓" },
    date: fmtDate(profile.created_at).toUpperCase(),
  });
  if (profile.research_data) cards.push({
    accent: "accent",
    icCls: "ch", icBg: ST.c50, icColor: ST.c700,
    title: "Brand Research Selesai",
    desc: `AI GeoVera berhasil menyelesaikan analisis mendalam terhadap ${profile.brand_name}. Keyword, kompetitor, dan tren pasar kini terpetakan.`,
    badge: { cls: "ms", text: "Research Done" },
    date: (profile.chronicle_updated_at ? fmtDate(profile.chronicle_updated_at) : fmtDate(profile.created_at)).toUpperCase(),
  });
  if (profile.source_of_truth) cards.push({
    accent: "primary",
    icCls: "pr", icBg: "var(--gv-color-primary-50)", icColor: "var(--gv-color-primary-600)",
    title: "Source of Truth Aktif",
    desc: "Brand Intelligence penuh siap digunakan. Semua strategi konten, SEO, dan GEO kini didukung data riil.",
    badge: { cls: "gr", text: "SoT Ready" },
    date: (profile.chronicle_updated_at ? fmtDate(profile.chronicle_updated_at) : fmtDate(profile.created_at)).toUpperCase(),
  });
  if (seoScore > 0) cards.push({
    accent: "info",
    icCls: "in", icBg: ST.r50, icColor: ST.r700,
    title: seaDelta > 0 ? "SEO Score Naik" : "SEO Terpantau",
    desc: seaDelta > 0 ? `SEO Score naik ${seaDelta} poin dalam 2 minggu. Brand kamu semakin mudah ditemukan di Google.` : `SEO Score terpantau. ${Math.abs(seaDelta)} poin perlu ditingkatkan untuk ranking optimal.`,
    badge: { cls: seaDelta >= 0 ? "gr" : "dn", text: `${seaDelta >= 0 ? "+" : ""}${seaDelta} SEO` },
    date: fmtDate(profile.created_at).toUpperCase(),
  });
  if (cards.length === 0) cards.push({
    accent: "primary",
    icCls: "pr", icBg: "var(--gv-color-primary-50)", icColor: "var(--gv-color-primary-600)",
    title: "Mulai Perjalanan Brand",
    desc: "Hubungkan akun sosial media dan mulai riset brand untuk melihat pencapaian pertamamu di sini.",
    date: fmtDate(profile.created_at).toUpperCase(),
  });

  const borderLeft = (a: RpCard["accent"]) => ({ accent: ST.chronicle, success: "var(--gv-color-success-500)", info: ST.research, primary: "var(--gv-color-primary-500)", purple: ST.deep }[a] ?? ST.chronicle);

  const icIcon = (cls: string, color: string) => {
    if (cls === "ch") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    if (cls === "gr") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
    if (cls === "in") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
    if (cls === "pr") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/></svg>;
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
  };

  return (
    <div style={{ padding: "20px 20px 96px" }}>

      {/* rp-hdr */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Highlight Chronicle</div>
        <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-.03em", lineHeight: 1.4 }}>2 Minggu Terakhir</div>
        <div style={{ fontFamily: "var(--gv-font-body)", fontSize: 14, color: "var(--gv-color-neutral-500)", marginTop: 4 }}>Pencapaian dan perkembangan brand kamu</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 9999, border: "1px solid var(--gv-color-neutral-200)", background: "var(--gv-color-bg-surface-elevated)", fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-500)" }}>
            {dateRange}
          </span>
        </div>
      </div>

      {/* Progress Skor */}
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Progress Skor</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {scores.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, background: "var(--gv-color-bg-surface-elevated)", border: "1px solid var(--gv-color-neutral-200)" }}>
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".06em", width: 56, flexShrink: 0 }}>{s.label}</div>
            <div style={{ flex: 1, height: 8, borderRadius: 9999, background: "var(--gv-color-neutral-100)", overflow: "hidden" }}>
              <div style={{ width: `${s.val}%`, height: "100%", background: s.fillBg, borderRadius: 9999 }} />
            </div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 900, color: "var(--gv-color-neutral-900)", width: 28, textAlign: "right", flexShrink: 0 }}>{s.val}</div>
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0, color: s.delta >= 0 ? "var(--gv-color-success-500)" : "var(--gv-color-danger-500)" }}>
              {s.delta >= 0 ? "▲" : "▼"} {Math.abs(s.delta)}
            </div>
          </div>
        ))}
      </div>

      {/* Pencapaian */}
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8, marginTop: 18 }}>Pencapaian</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cards.map((card, i) => (
          <div key={i} style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--gv-color-neutral-200)", background: "var(--gv-color-bg-surface)", borderLeft: `3px solid ${borderLeft(card.accent)}` }}>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: card.icBg }}>
                  {icIcon(card.icCls, card.icColor)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--gv-font-body)", fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)", marginBottom: 4, lineHeight: 1.4 }}>{card.title}</div>
                  <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", lineHeight: 1.6 }}>{card.desc}</div>
                  {card.badge && <div style={{ marginTop: 8 }}><Tag cls={card.badge.cls} text={card.badge.text} /></div>}
                  <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-300)", letterSpacing: ".04em", marginTop: 6 }}>{card.date}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Connect — Center Column
   DS: gv_start_connect (cn-* token system)
══════════════════════════════════════════════════════════════ */
function ConnectCenter({
  profile, selectedPlatform, onSelectPlatform,
}: {
  profile: BrandProfile | null;
  selectedPlatform: string;
  onSelectPlatform: (id: string) => void;
}) {
  const [recUrls, setRecUrls] = useState<Record<string, string>>({});

  const connectedIds = new Set(
    CONNECT_PLATFORMS
      .filter(p => {
        if (!p.fieldKey || !profile) return false;
        const v = (profile as Record<string, unknown>)[p.fieldKey];
        return v && String(v).trim() !== "";
      })
      .map(p => p.id)
  );
  const connectedCount = connectedIds.size;
  const availableCount = CONNECT_PLATFORMS.length - connectedCount;

  /* icon helper */
  const LinkIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );

  return (
    <div style={{ padding: "24px 28px 120px" }}>

      {/* ── cn-hdr ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-xs)", fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>
          <span style={{ width: 16, height: 2, background: "var(--gv-gradient-primary)", borderRadius: 2, flexShrink: 0 }} />
          Social Discovery
        </div>
        <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-5xl)", fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.04em", lineHeight: 1.15, margin: "0 0 8px" }}>
          Hubungkan{" "}
          <span style={{ background: "var(--gv-gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Platform Kamu
          </span>
        </h1>
        <p style={{ fontFamily: "var(--gv-font-body)", fontSize: "var(--gv-font-size-md)", color: "var(--gv-color-neutral-500)", lineHeight: 1.6, margin: 0 }}>
          Satu dashboard untuk semua platform. GeoVera lacak perjalanan digital brand kamu secara real-time.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 8px", borderRadius: 9999, border: "1.5px solid var(--gv-color-success-200)", background: "var(--gv-color-success-50)", fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-success-700)", letterSpacing: "0.04em" }}>
            {connectedCount} Connected
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 8px", borderRadius: 9999, border: "1.5px solid var(--gv-color-warning-200)", background: "var(--gv-color-warning-50)", fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-warning-700)", letterSpacing: "0.04em" }}>
            {availableCount} Tersedia
          </span>
        </div>
      </div>

      {/* ── cn-section: Platform Tersedia ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: "var(--gv-radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--gv-color-primary-200)", background: "var(--gv-color-primary-50)", color: "var(--gv-color-primary-700)", flexShrink: 0 }}>
            <LinkIcon />
          </div>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Platform Tersedia</span>
          <div style={{ flex: 1, height: 1, background: "var(--gv-color-neutral-200)" }} />
        </div>

        {/* cn-platform-grid — 2 col */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
          {CONNECT_PLATFORMS.map(p => {
            const isConnected = connectedIds.has(p.id);
            const isSelected = selectedPlatform === p.id;
            const handle = p.fieldKey && profile ? (profile as Record<string, unknown>)[p.fieldKey] as string : null;
            return (
              <div
                key={p.id}
                onClick={() => onSelectPlatform(p.id)}
                style={{
                  background: isSelected ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
                  border: `1.5px solid ${isSelected ? "var(--gv-color-primary-500)" : isConnected ? "var(--gv-color-success-500)" : "var(--gv-color-neutral-200)"}`,
                  borderRadius: "var(--gv-radius-md)",
                  padding: 16, cursor: "pointer", position: "relative",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              >
                {/* top: logo + badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "var(--gv-radius-sm)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isConnected ? "var(--gv-color-primary-50)" : "var(--gv-color-neutral-100)", color: isConnected ? "var(--gv-color-primary-600)" : "var(--gv-color-neutral-500)" }}>
                    {p.logo}
                  </div>
                  <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.04em", background: isConnected ? "var(--gv-color-success-50)" : "var(--gv-color-neutral-100)", color: isConnected ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-500)", border: `1px solid ${isConnected ? "var(--gv-color-success-200)" : "var(--gv-color-neutral-200)"}` }}>
                    {isConnected ? "Connected" : "Available"}
                  </span>
                </div>
                {/* name + handle */}
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-md)", fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-xs)", color: isConnected ? "var(--gv-color-primary-600)" : "var(--gv-color-neutral-400)", marginBottom: 12 }}>
                  {isConnected && handle ? `@${handle}` : "Belum terhubung"}
                </div>
                {/* stats or connect btn */}
                {isConnected ? (
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-md)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1.2 }}>—</span>
                      <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Followers</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-md)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1.2 }}>—</span>
                      <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Posts</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectPlatform(p.id); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9999, fontFamily: "var(--gv-font-body)", fontSize: "var(--gv-font-size-xs)", fontWeight: 600, cursor: "pointer", background: "var(--gv-gradient-primary)", color: "white", border: "none" }}
                  >
                    <LinkIcon />
                    Connect {p.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── cn-section: GeoVera Recommendations ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: "var(--gv-radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--gv-color-warning-200)", background: "var(--gv-color-warning-50)", color: "var(--gv-color-warning-700)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>GeoVera Sangat Merekomendasikan</span>
          <div style={{ flex: 1, height: 1, background: "var(--gv-color-neutral-200)" }} />
        </div>

        {/* cn-rec-box */}
        <div style={{ background: "var(--gv-color-warning-50)", border: "1.5px solid var(--gv-color-warning-200)", borderRadius: "var(--gv-radius-md)", overflow: "hidden" }}>
          {/* cn-rec-banner */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 16px 12px", borderBottom: "1px solid var(--gv-color-warning-200)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-warning-500)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-md)", fontWeight: 800, color: "var(--gv-color-warning-700)", marginBottom: 4 }}>Kamu tidak bisa connect langsung ke platform ini</div>
              <div style={{ fontFamily: "var(--gv-font-body)", fontSize: "var(--gv-font-size-sm)", color: "var(--gv-color-warning-700)", lineHeight: 1.55 }}>
                Platform ini tidak punya API publik, tapi sangat strategis untuk authority &amp; SEO Indonesia. Masukkan URL profil — GeoVera akan memantau perkembangannya.
              </div>
            </div>
          </div>

          {/* cn-rec-list */}
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {REC_PLATFORMS.map(rp => (
              <div key={rp.id} style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", overflow: "hidden" }}>
                {/* header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 8px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "var(--gv-radius-xs)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-sm)", fontWeight: 900, color: "white", background: rp.logoColor }}>
                    {rp.initial}
                  </div>
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-base)", fontWeight: 700, color: "var(--gv-color-neutral-900)", flex: 1 }}>{rp.name}</div>
                  <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", fontWeight: 700, color: "var(--gv-color-neutral-400)", background: "var(--gv-color-neutral-100)", borderRadius: 9999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{rp.tag}</span>
                </div>
                {/* URL input row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 12px" }}>
                  <input
                    type="url"
                    placeholder={rp.placeholder}
                    value={recUrls[rp.id] ?? ""}
                    onChange={e => setRecUrls(prev => ({ ...prev, [rp.id]: e.target.value }))}
                    style={{ flex: 1, height: 26, background: "var(--gv-color-neutral-100)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", padding: "0 12px", fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-xs)", color: "var(--gv-color-neutral-700)", outline: "none" }}
                  />
                  <button
                    onClick={() => alert(`Saved: ${rp.name} — ${recUrls[rp.id] ?? ""}`)}
                    style={{ height: 26, padding: "0 12px", background: "var(--gv-gradient-primary)", color: "white", border: "none", borderRadius: "var(--gv-radius-sm)", fontFamily: "var(--gv-font-body)", fontSize: "var(--gv-font-size-xs)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Simpan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Connect — Right Column
   DS: gv_start_connect (cn-* token system)
   Shows selected platform profile + biweekly growth + 30d perf
══════════════════════════════════════════════════════════════ */
function ConnectRight({
  profile, selectedPlatform,
}: {
  profile: BrandProfile | null;
  selectedPlatform: string;
}) {
  const plat = CONNECT_PLATFORMS.find(p => p.id === selectedPlatform) ?? CONNECT_PLATFORMS[0];
  const isConnected = !!(plat.fieldKey && profile && (profile as Record<string, unknown>)[plat.fieldKey] && String((profile as Record<string, unknown>)[plat.fieldKey]).trim());
  const handle = plat.fieldKey && profile ? (profile as Record<string, unknown>)[plat.fieldKey] as string : null;
  const brandName = profile?.brand_name ?? "Brand Kamu";
  const tagline = ((profile?.brand_dna as Record<string, unknown> | null)?.tagline as string | undefined) ?? "";

  /* apify_data might contain scraped stats (from brand-apify-research) */
  const sotRaw = profile?.source_of_truth as Record<string, unknown> | null;
  const apify = (sotRaw?.apify_data as Record<string, unknown> | null) ?? null;
  const platData = apify ? (apify[selectedPlatform] as Record<string, unknown> | null) : null;

  /* KPIs — 3-col grid */
  const kpis: { v: string; l: string }[] = [];
  if (selectedPlatform === "instagram") {
    kpis.push(
      { v: fmtNumber(platData?.followers_count ?? "—"), l: "Followers" },
      { v: fmtNumber(platData?.following_count ?? "—"), l: "Following" },
      { v: fmtNumber(platData?.media_count ?? "—"), l: "Posts" },
    );
  } else if (selectedPlatform === "tiktok") {
    kpis.push(
      { v: fmtNumber(platData?.fans_count ?? "—"), l: "Followers" },
      { v: fmtNumber(platData?.video_count ?? "—"), l: "Videos" },
      { v: fmtNumber(platData?.heart_count ?? "—"), l: "Likes" },
    );
  } else {
    kpis.push({ v: "—", l: "Followers" }, { v: "—", l: "Following" }, { v: "—", l: "Posts" });
  }

  /* 30-day performance stats */
  const stats: { v: string; l: string; dir: "up" | "dn" | ""; d: string }[] = [
    { v: fmtNumber(platData?.reach ?? "—"), l: "Reach", dir: "up", d: "Late API sync" },
    { v: platData?.avg_engagement ? `${platData.avg_engagement}%` : "—", l: "Engagement", dir: "up", d: "" },
    { v: fmtNumber(platData?.likes_count ?? "—"), l: "Likes", dir: "up", d: "" },
    { v: fmtNumber(platData?.comments_count ?? "—"), l: "Comments", dir: "up", d: "" },
    { v: fmtNumber(platData?.posts_count ?? "—"), l: "Posts", dir: "up", d: "" },
    { v: fmtNumber(platData?.saves_count ?? "—"), l: "Saves", dir: "up", d: "" },
  ];

  return (
    <div style={{ padding: "20px 20px 96px" }}>

      {/* ── cn-profile ── */}
      <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-md)", overflow: "hidden", boxShadow: "var(--gv7-depth-1)", marginBottom: 16 }}>
        {/* cover gradient */}
        <div style={{ height: 48, position: "relative", background: plat.coverGrad }}>
          {/* avatar */}
          <div style={{ position: "absolute", bottom: -20, left: 16, width: 44, height: 44, borderRadius: "var(--gv-radius-md)", background: "var(--gv-color-bg-surface)", border: "2.5px solid var(--gv-color-bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--gv7-depth-2)", overflow: "hidden" }}>
            <div style={{ color: "var(--gv-color-primary-500)" }}>{plat.logo}</div>
          </div>
          {/* platform badge */}
          <div style={{ position: "absolute", top: 12, right: 12, width: 26, height: 26, borderRadius: "var(--gv-radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}>
            <div style={{ color: "white", opacity: 0.9 }}>{plat.logo}</div>
          </div>
        </div>

        {/* profile body */}
        <div style={{ padding: "28px 16px 16px" }}>
          <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1.2, marginBottom: 4 }}>
            {isConnected ? brandName : "—"}
          </div>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-xs)", color: "var(--gv-color-primary-600)", marginBottom: 8 }}>
            {isConnected && handle ? `@${handle} · ${plat.name}` : `${plat.name} · Belum Connect`}
          </div>
          <div style={{ fontFamily: "var(--gv-font-body)", fontSize: "var(--gv-font-size-sm)", color: "var(--gv-color-neutral-500)", lineHeight: 1.55, marginBottom: 16 }}>
            {isConnected ? (tagline || "Connect akun untuk melihat data performa.") : "Akun belum terhubung. Klik Connect di panel tengah untuk menghubungkan."}
          </div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, padding: 12, background: "var(--gv-color-bg-base)", borderRadius: "var(--gv-radius-sm)" }}>
            {kpis.map(k => (
              <div key={k.l} style={{ textAlign: "center", padding: 4 }}>
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-md)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1.2 }}>{k.v}</div>
                <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── cn-growth: Follower growth chart ── */}
      <div style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-md)", padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-base)", fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>Pertumbuhan Followers</div>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", fontWeight: 700, color: isConnected ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-400)", background: isConnected ? "var(--gv-color-success-50)" : "var(--gv-color-neutral-100)", padding: "2px 8px", borderRadius: 9999, border: `1px solid ${isConnected ? "var(--gv-color-success-200)" : "var(--gv-color-neutral-200)"}` }}>
            {isConnected ? "▲ Sync Biweekly · Late API" : "— Belum connect"}
          </span>
        </div>
        {/* SVG area chart — all DS token colors */}
        <div style={{ width: "100%", height: 64, position: "relative" }}>
          <svg viewBox="0 0 300 64" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="cnGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gv-color-primary-500)" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="var(--gv-color-primary-500)" stopOpacity="0.02"/>
              </linearGradient>
            </defs>
            <path d="M0 58 C20 56 35 54 55 50 C75 46 90 48 110 43 C130 38 145 41 165 32 C185 23 200 26 220 16 C240 6 255 10 300 3 L300 64 L0 64 Z" fill="url(#cnGrowthGrad)"/>
            <path d="M0 58 C20 56 35 54 55 50 C75 46 90 48 110 43 C130 38 145 41 165 32 C185 23 200 26 220 16 C240 6 255 10 300 3" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="55" cy="50" r="2.5" fill="var(--gv-color-primary-500)"/>
            <circle cx="165" cy="32" r="2.5" fill="var(--gv-color-primary-500)"/>
            <circle cx="300" cy="3" r="3.5" fill="var(--gv-color-primary-500)" stroke="white" strokeWidth="1.5"/>
          </svg>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {["Mar","Jun","Sep","Des","Mar"].map(m => (
            <span key={m} style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", color: "var(--gv-color-neutral-400)", letterSpacing: "0.04em" }}>{m}</span>
          ))}
        </div>
      </div>

      {/* ── cn-preview: 30-day performance stats ── */}
      <div style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-md)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--gv-color-neutral-100)", fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
          Performa · 30 Hari Terakhir
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)" }}>
          {stats.map((s, i) => (
            <div key={s.l} style={{ padding: "12px 16px", borderBottom: i < stats.length - 2 ? "1px solid var(--gv-color-neutral-100)" : undefined, borderRight: i % 2 === 0 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1.2, marginBottom: 4 }}>{s.v}</div>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.l}</div>
              {s.d && (
                <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: "var(--gv-font-size-2xs)", fontWeight: 700, marginTop: 4, color: s.dir === "up" ? "var(--gv-color-success-700)" : s.dir === "dn" ? "var(--gv-color-danger-500)" : "var(--gv-color-neutral-400)" }}>
                  {s.dir === "up" ? "▲ " : s.dir === "dn" ? "▼ " : ""}{s.d}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tab: Subscription — Center (sb-* DS token pattern)
══════════════════════════════════════════════════════════════ */
function SubscriptionCenter({
  plans, sub, onUpgrade, upgrading,
}: {
  plans: Plan[];
  sub: Subscription | null;
  onUpgrade: (planId: string) => Promise<void>;
  upgrading: string | null;
}) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const currentSlug = sub?.status === "active" ? (sub.plan?.slug ?? null) : null;
  const isActive = sub?.status === "active";

  const VP_ITEMS = [
    { icon: "⚡", title: "Efisiensi Waktu", desc: "Otomasi konten & riset brand 10× lebih cepat" },
    { icon: "💰", title: "Hemat Cost",       desc: "Ganti 3–5 tool dengan satu platform terintegrasi" },
    { icon: "∞",  title: "Unlimited Ideation", desc: "AI menghasilkan ide konten tanpa batas setiap hari" },
    { icon: "🎯", title: "Optimized UGC",    desc: "Konten UGC yang teroptimasi untuk setiap platform" },
  ];

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {/* sb-wrap */}
      <div style={{ padding: "24px 24px 80px" }}>

        {/* sb-hero */}
        <div style={{
          background: "linear-gradient(145deg, var(--gv-color-primary-900), #111827, #0a0a14)",
          border: `1px solid ${SUB.glassXs}`,
          borderRadius: "var(--gv-radius-xl, 24px)",
          padding: "28px 24px",
          marginBottom: 20,
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 50%, rgba(95,143,139,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.10) 0%, transparent 50%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            {/* sb-hero__eyebrow */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px",
              borderRadius: "var(--gv-radius-full, 9999px)",
              background: SUB.glassXs, border: `1px solid ${SUB.glassSm}`,
              fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--gv-color-primary-300, #90C4BE)",
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gv-color-primary-400, #7AB3AB)" }} />
              Subscription
            </div>
            {/* sb-hero__title */}
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 26, fontWeight: 900, color: "white", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 8 }}>
              Pilih Plan{" "}
              {/* sb-hero__accent */}
              <span style={{ background: "var(--gv-gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Terbaik</span>{" "}
              Kamu
            </div>
            {/* sb-hero__sub */}
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.6, marginBottom: 20 }}>
              Satu platform. Semua yang kamu butuhkan untuk dominasi brand digital.
            </div>
            {/* sb-vp-grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {VP_ITEMS.map(vp => (
                <div key={vp.title} style={{
                  padding: "12px 14px",
                  background: SUB.glassXs,
                  border: `1px solid ${SUB.glassSm}`,
                  borderRadius: "var(--gv-radius-md, 16px)",
                }}>
                  {/* sb-vp__icon */}
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{vp.icon}</div>
                  {/* sb-vp__label */}
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 13, fontWeight: 800, color: "white", marginBottom: 3 }}>{vp.title}</div>
                  {/* sb-vp__desc */}
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>{vp.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* sb-plans-hdr */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Pilih Plan
          </div>
          {/* sb-plans-hdr__toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: billing === "monthly" ? "var(--gv-color-neutral-900)" : "var(--gv-color-neutral-400)", fontWeight: billing === "monthly" ? 700 : 400, transition: "color 0.15s" }}>Bulanan</span>
            {/* sb-toggle */}
            <button
              onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
              style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: billing === "annual" ? "var(--gv-gradient-primary)" : "var(--gv-color-neutral-200)", position: "relative", padding: 0 }}
            >
              <span style={{ position: "absolute", top: 3, left: billing === "annual" ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.20)", transition: "left 0.2s", display: "block" }} />
            </button>
            <span style={{ fontSize: 12, color: billing === "annual" ? "var(--gv-color-neutral-900)" : "var(--gv-color-neutral-400)", fontWeight: billing === "annual" ? 700 : 400, transition: "color 0.15s" }}>Tahunan</span>
            {/* sb-save-badge */}
            {billing === "annual" && (
              <span style={{ padding: "2px 8px", borderRadius: "var(--gv-radius-full, 9999px)", background: "var(--gv-color-success-100, #D1FAE5)", color: "var(--gv-color-success-700, #047857)", fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 800 }}>Hemat 20%</span>
            )}
          </div>
        </div>

        {/* sb-plans — 3-col grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {plans.map(plan => {
            const disp  = PLAN_DISPLAY[plan.slug] ?? { name: plan.name, tagline: "" };
            const feats = PLAN_FEATS[plan.slug] ?? [];
            const isCurrent = currentSlug === plan.slug;
            const isPro     = plan.slug === "enterprise";
            const isDark    = isCurrent || isPro;
            const price     = billing === "annual" ? Math.round(plan.price_idr * 0.8) : plan.price_idr;

            return (
              /* sb-plan / sb-plan--active / sb-plan--pro */
              <div key={plan.id} style={{
                borderRadius: "var(--gv-radius-xl, 24px)",
                border: `1.5px solid ${isCurrent ? "var(--gv-color-primary-400, #7AB3AB)" : isPro ? "rgba(139,92,246,0.40)" : "var(--gv-color-neutral-200)"}`,
                background: isPro
                  ? "linear-gradient(145deg,#1a0f2e,#0f1923)"
                  : isCurrent
                  ? "linear-gradient(145deg,var(--gv-color-primary-900),#111827)"
                  : "var(--gv-color-bg-surface)",
                padding: "18px 16px",
                position: "relative",
                overflow: "hidden",
                boxShadow: isCurrent ? SUB.glowPrimary : isPro ? "0 2px 16px rgba(139,92,246,0.15)" : undefined,
              }}>
                {/* sb-plan__badge */}
                {disp.badge && (
                  <div style={{
                    display: "inline-flex", padding: "3px 10px", marginBottom: 10,
                    borderRadius: "var(--gv-radius-full, 9999px)",
                    background: disp.badgePro ? "rgba(139,92,246,0.20)" : "var(--gv-color-primary-100, #D4EAE7)",
                    border: `1px solid ${disp.badgePro ? "rgba(139,92,246,0.35)" : "var(--gv-color-primary-200, #A8D5CF)"}`,
                    fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700,
                    color: disp.badgePro ? "#C4B5FD" : "var(--gv-color-primary-700, #3D6562)",
                  }}>{disp.badge}</div>
                )}
                {/* sb-plan__top — name */}
                <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 900, color: isDark ? "white" : "var(--gv-color-neutral-900)", letterSpacing: "-0.03em", marginBottom: 2 }}>
                  {disp.name}
                </div>
                {/* sb-plan__price */}
                <div style={{ marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, color: isDark ? "white" : "var(--gv-color-neutral-900)", letterSpacing: "-0.04em" }}>
                    {plan.price_idr === 0 ? "Gratis" : fmtIDR(price)}
                  </span>
                  {plan.price_idr > 0 && (
                    <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: isDark ? "rgba(255,255,255,0.50)" : "var(--gv-color-neutral-400)", marginLeft: 4 }}>/bln</span>
                  )}
                </div>
                {/* sb-plan__tagline */}
                <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.45)" : "var(--gv-color-neutral-500)", marginBottom: 14, lineHeight: 1.5 }}>{disp.tagline}</div>
                <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.10)" : "var(--gv-color-neutral-200)", marginBottom: 14 }} />
                {/* sb-plan__feats */}
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  {feats.map(f => (
                    <li key={f.label} style={{
                      display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11, lineHeight: 1.45,
                      color: isDark ? (f.check ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.30)") : (f.check ? "var(--gv-color-neutral-700)" : "var(--gv-color-neutral-400)"),
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: f.check
                          ? (isPro ? "rgba(139,92,246,0.45)" : isCurrent ? "var(--gv-color-primary-500, #5F8F8B)" : "var(--gv-color-success-500, #10B981)")
                          : (isDark ? "rgba(255,255,255,0.08)" : "var(--gv-color-neutral-200)"),
                      }}>
                        {f.check
                          ? <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={isDark ? "rgba(255,255,255,0.30)" : "var(--gv-color-neutral-400)"} strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        }
                      </div>
                      {f.label}
                    </li>
                  ))}
                </ul>
                {/* sb-plan__btn */}
                <button
                  onClick={() => !isCurrent && onUpgrade(plan.id)}
                  disabled={isCurrent || upgrading !== null}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "var(--gv-radius-md, 12px)",
                    fontSize: 12, fontWeight: 700, fontFamily: "var(--gv-font-body)",
                    cursor: isCurrent ? "default" : upgrading ? "not-allowed" : "pointer",
                    border: "1.5px solid",
                    opacity: upgrading !== null && upgrading !== plan.id ? 0.55 : 1,
                    background: isCurrent
                      ? "transparent"
                      : isPro
                      ? "linear-gradient(135deg,#7C3AED,#5B21B6)"
                      : "var(--gv-gradient-primary)",
                    borderColor: isCurrent
                      ? "rgba(255,255,255,0.15)"
                      : isPro ? "rgba(139,92,246,0.50)" : "transparent",
                    color: isCurrent ? (isDark ? "rgba(255,255,255,0.35)" : "var(--gv-color-neutral-400)") : "white",
                    boxShadow: isCurrent ? undefined : (isPro ? "0 2px 10px rgba(139,92,246,0.30)" : plan.price_idr > 0 ? SUB.glowPrimary : undefined),
                  }}
                >
                  {upgrading === plan.id
                    ? "Memproses…"
                    : isCurrent
                    ? "Plan Aktif"
                    : isActive
                    ? "Upgrade"
                    : plan.price_idr === 0
                    ? "Mulai Gratis"
                    : "Pilih Plan"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tab: Subscription — Right Panel (sbr-* DS token pattern)
══════════════════════════════════════════════════════════════ */
function SubscriptionRight({
  sub, user, quotas, invoices, brandCount, onCancel, onPasswordChange,
}: {
  sub: Subscription | null;
  user: { name: string; email: string; initials: string } | null;
  quotas: PlanQuota[];
  invoices: Invoice[];
  brandCount: number;
  onCancel: () => void;
  onPasswordChange: () => void;
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const activePlan = sub?.plan ?? null;
  const isActive   = sub?.status === "active";

  // Resolve quota for current plan (plans.slug "premium" → plan_quotas.plan_name "pro")
  const quotaKey = activePlan?.slug === "premium" ? "pro" : (activePlan?.slug ?? "basic");
  const quota    = quotas.find(q => q.plan_name === quotaKey) ?? null;

  // Countdown
  const now          = Date.now();
  const expiresMs    = sub?.expires_at    ? new Date(sub.expires_at).getTime()    : null;
  const activatedMs  = sub?.activated_at  ? new Date(sub.activated_at).getTime()  : null;
  const totalDays    = activatedMs && expiresMs ? Math.max(1, Math.ceil((expiresMs - activatedMs) / 86400000)) : 30;
  const remainDays   = expiresMs ? Math.max(0, Math.ceil((expiresMs - now) / 86400000)) : null;
  const progressPct  = remainDays !== null ? Math.min(100, Math.max(0, ((totalDays - remainDays) / totalDays) * 100)) : 0;

  // Usage bars
  const usageBars = quota ? [
    { name: "Brand Monitor",    current: brandCount, limit: quota.brands_limit,              warn: brandCount >= Math.ceil(quota.brands_limit * 0.75) },
    { name: "AI Chat / Hari",   current: 0,          limit: quota.ai_chat_messages_per_day,  warn: false },
    { name: "Artikel / Bulan",  current: 0,          limit: quota.content_articles_per_day,  warn: false },
    { name: "Signal Cycles",    current: 0,          limit: quota.qa_runs_per_cycle,          warn: false },
  ] : [];

  /* ── shared: password reset section ── */
  const PasswordSection = () => (
    <div style={{ border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-lg, 20px)", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: "var(--gv-color-bg-surface-elevated)", borderBottom: "1px solid var(--gv-color-neutral-100)", display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>Keamanan Akun</span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <button onClick={onPasswordChange} style={{ width: "100%", padding: "9px 14px", borderRadius: "var(--gv-radius-sm, 10px)", background: "var(--gv-color-bg-surface-elevated)", border: "1.5px solid var(--gv-color-neutral-200)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-700)", fontFamily: "var(--gv-font-body)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Reset password via email
        </button>
      </div>
    </div>
  );

  /* ── No-subscription state ── */
  if (!sub) {
    return (
      <div style={{ overflowY: "auto", height: "100%" }}>
        <div style={{ padding: "20px 20px 80px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Profile mini card */}
          <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl, 24px)", padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--gv-gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 16, fontWeight: 900, color: "white" }}>{user?.initials ?? "?"}</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>{user?.name ?? "—"}</div>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)" }}>{user?.email ?? "—"}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span style={{ padding: "4px 10px", borderRadius: "var(--gv-radius-full)", background: "var(--gv-color-neutral-100)", fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-500)" }}>FREE</span>
            </div>
          </div>
          <div style={{ padding: "14px 16px", background: "var(--gv-color-warning-50, #FFFBEB)", border: "1.5px solid var(--gv-color-warning-200, #FDE68A)", borderRadius: "var(--gv-radius-lg, 20px)", fontSize: 12, color: "var(--gv-color-warning-700, #B45309)", lineHeight: 1.6 }}>
            Kamu belum memiliki langganan aktif. Pilih plan di sebelah kiri untuk mulai.
          </div>
          <PasswordSection />
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {/* sbr-wrap */}
      <div style={{ padding: "20px 20px 80px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* sbr-card--active */}
        <div style={{
          background: "var(--gv-gradient-primary)",
          borderRadius: "var(--gv-radius-xl, 24px)",
          padding: "20px",
          position: "relative",
          overflow: "hidden",
          boxShadow: SUB.glowPrimary,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            {/* sbr-card__header */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              {/* sbr-card__eyebrow */}
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: SUB.glassFill, textTransform: "uppercase", letterSpacing: "0.10em" }}>Plan Aktif</div>
              {/* sbr-status */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
                {/* sbr-status__dot — pulsing */}
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: isActive ? "#4ADE80" : "#9CA3AF", boxShadow: isActive ? SUB.glowSuccess : undefined }} />
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: isActive ? "#4ADE80" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {isActive ? "AKTIF" : sub.status.toUpperCase().replace(/_/g, " ")}
                </span>
              </div>
            </div>
            {/* sbr-card__plan-name */}
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-0.04em", marginBottom: 2 }}>
              {PLAN_DISPLAY[activePlan?.slug ?? ""]?.name ?? activePlan?.name ?? "Free"}
            </div>
            {/* sbr-card__plan-price */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 26, fontWeight: 900, color: "white", letterSpacing: "-0.05em", lineHeight: 1 }}>
                {activePlan?.price_idr ? fmtIDR(activePlan.price_idr) : "Rp 0"}
              </span>
              {activePlan && activePlan.price_idr > 0 && (
                <span style={{ fontSize: 12, color: SUB.glassFill }}>/bulan</span>
              )}
            </div>
            {/* sbr-card__billing */}
            <div style={{ fontSize: 12, color: SUB.glassFill }}>
              Berakhir {fmtDate(sub.expires_at)} · Tagihan Bulanan
            </div>
          </div>
        </div>

        {/* sbr-countdown */}
        {sub.expires_at && (
          <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-lg, 20px)", padding: "14px 16px" }}>
            {/* sbr-countdown__label */}
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>Masa Berlaku</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              {/* sbr-countdown__date */}
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>{fmtDate(sub.expires_at)}</div>
              {/* sbr-countdown__days */}
              {remainDays !== null && (
                <span style={{
                  fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700,
                  padding: "2px 9px", borderRadius: "var(--gv-radius-full, 9999px)",
                  background: remainDays <= 7 ? "var(--gv-color-danger-50)" : "var(--gv-color-primary-50, #EDF5F4)",
                  color: remainDays <= 7 ? "var(--gv-color-danger-700)" : "var(--gv-color-primary-700, #3D6562)",
                }}>
                  {remainDays} hari lagi
                </span>
              )}
            </div>
            {/* sbr-countdown__bar */}
            <div style={{ height: 6, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full, 9999px)", overflow: "hidden", marginBottom: 6 }}>
              {/* sbr-countdown__fill */}
              <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct > 85 ? "var(--gv-color-danger-500)" : "var(--gv-gradient-primary)", borderRadius: "var(--gv-radius-full, 9999px)" }} />
            </div>
            {/* sbr-countdown__meta */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: "var(--gv-color-neutral-400)" }}>Aktif {fmtDate(sub.activated_at)}</span>
              <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: "var(--gv-color-neutral-400)" }}>{Math.round(progressPct)}% terpakai</span>
            </div>
          </div>
        )}

        {/* sbr-usage */}
        {usageBars.length > 0 && (
          <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-lg, 20px)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--gv-color-neutral-100)", fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
              Penggunaan Quota
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {usageBars.map(bar => {
                const pct = bar.limit > 0 ? Math.min(100, Math.round((bar.current / bar.limit) * 100)) : 0;
                return (
                  <div key={bar.name}>
                    {/* sbr-usage__row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      {/* sbr-usage__name */}
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-700)" }}>{bar.name}</span>
                      {/* sbr-usage__count */}
                      <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: bar.warn ? "var(--gv-color-warning-700, #B45309)" : "var(--gv-color-neutral-500)" }}>
                        {bar.current}/{bar.limit}
                      </span>
                    </div>
                    {/* sbr-usage__bar */}
                    <div style={{ height: 5, background: "var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-full, 9999px)", overflow: "hidden" }}>
                      {/* sbr-usage__fill / sbr-usage__fill--warn */}
                      <div style={{ height: "100%", width: `${pct}%`, background: bar.warn ? "var(--gv-color-warning-400, #FBBF24)" : "var(--gv-gradient-primary)", borderRadius: "var(--gv-radius-full, 9999px)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* sbr-invoices */}
        {invoices.length > 0 && (
          <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-lg, 20px)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--gv-color-neutral-100)", fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
              Riwayat Invoice
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {invoices.slice(0, 5).map((inv, i) => (
                /* sbr-invoice */
                <div key={inv.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < Math.min(invoices.length, 5) - 1 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
                  <div style={{ flex: 1 }}>
                    {/* sbr-invoice__date */}
                    <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{inv.invoice_number ?? "—"}</div>
                    {/* sbr-invoice__plan */}
                    <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>{fmtDate(inv.activated_at)} · {PLAN_DISPLAY[inv.plan?.slug ?? ""]?.name ?? inv.plan?.name ?? "—"}</div>
                  </div>
                  {/* sbr-invoice__right */}
                  <div style={{ textAlign: "right" }}>
                    {/* sbr-invoice__amount */}
                    <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 13, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>
                      {inv.plan?.price_idr ? fmtIDR(inv.plan.price_idr) : "Gratis"}
                    </div>
                    {/* sbr-invoice__status / sbr-invoice__status--paid */}
                    <span style={{ display: "inline-block", marginTop: 2, padding: "1px 7px", borderRadius: "var(--gv-radius-full, 9999px)", fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, background: inv.status === "active" ? "var(--gv-color-success-100, #D1FAE5)" : "var(--gv-color-neutral-100)", color: inv.status === "active" ? "var(--gv-color-success-700, #047857)" : "var(--gv-color-neutral-500)" }}>
                      {inv.status === "active" ? "Lunas" : inv.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <PasswordSection />

        {/* sbr-cancel-btn */}
        {isActive && (
          <div>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{ width: "100%", padding: "10px 16px", borderRadius: "var(--gv-radius-md, 12px)", background: "transparent", border: "1.5px solid var(--gv-color-danger-200, #FECACA)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-danger-600)", fontFamily: "var(--gv-font-body)", cursor: "pointer" }}
              >
                Batalkan Langganan
              </button>
            ) : (
              <div style={{ border: "1.5px solid var(--gv-color-danger-200, #FECACA)", borderRadius: "var(--gv-radius-lg, 20px)", padding: 14, background: "var(--gv-color-danger-50, #FEF2F2)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-danger-700)", marginBottom: 6 }}>Yakin batalkan langganan?</div>
                <div style={{ fontSize: 12, color: "var(--gv-color-danger-600)", marginBottom: 12, lineHeight: 1.6 }}>Akses premium akan berakhir. Kamu bisa berlangganan lagi kapan saja.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "white", border: "1.5px solid var(--gv-color-neutral-200)", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--gv-color-neutral-700)", fontFamily: "var(--gv-font-body)" }}>
                    Batal
                  </button>
                  <button onClick={() => { setShowCancelConfirm(false); onCancel(); }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "var(--gv-color-danger-500)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "white", fontFamily: "var(--gv-font-body)" }}>
                    Ya, Batalkan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Header (ST01 style)
══════════════════════════════════════════════════════════════ */
function StartHeader({ profile, sub }: { profile: BrandProfile | null; sub: Subscription | null }) {
  const stats = [
    { mod: "c", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, val: CONNECT_PLATFORMS.filter(p => profile && p.fieldKey && (profile as Record<string, unknown>)[p.fieldKey]).length, lb: "Platforms" },
    { mod: "r", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>, val: profile?.research_data ? 1 : 0, lb: "Research" },
    { mod: "d", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>, val: profile?.source_of_truth ? 1 : 0, lb: "Deep" },
    { mod: "ch", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>, val: profile?.chronicle_updated_at ? 1 : 0, lb: "Chronicle" },
    { mod: "dn", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/></svg>, val: profile?.brand_dna ? 1 : 0, lb: "DNA" },
  ];

  const modBg: Record<string, string> = {
    c: "rgba(95,143,139,.2)", r: "rgba(59,130,246,.2)", d: "rgba(139,92,246,.2)", ch: "rgba(245,158,11,.2)", dn: "rgba(16,185,129,.2)",
  };
  const modColor: Record<string, string> = {
    c: "var(--gv-color-primary-400, #7AB3AB)", r: "#60A5FA", d: "#A78BFA", ch: "#FBBF24", dn: "#34D399",
  };

  return (
    <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", background: ST.dark, padding: "22px 28px", marginBottom: 16 }}>
      <div style={{ position: "absolute", top: -40, left: -40, width: 280, height: 280, background: "radial-gradient(circle, rgba(95,143,139,.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: -20, right: 60, width: 220, height: 220, background: "radial-gradient(circle, rgba(139,92,246,.12) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 600, color: "var(--gv-color-primary-400, #7AB3AB)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>
        GeoVera · Start Menu
      </div>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-.03em", marginBottom: 3 }}>
        Brand <span style={{ background: "var(--gv-gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Intelligence</span> Hub
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", marginBottom: 18 }}>
        {profile ? profile.brand_name : "Hubungkan platform, riset mendalam, dan bangun identitas brand."}
        {sub?.status === "active" && <span style={{ marginLeft: 8, background: "rgba(16,185,129,.15)", color: "#4ADE80", border: "1px solid rgba(16,185,129,.25)", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontFamily: "var(--gv-font-mono)", fontWeight: 700 }}>ACTIVE</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
        {stats.map(s => (
          <div key={s.mod} style={{ padding: "11px 10px", borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4, background: modBg[s.mod], color: modColor[s.mod] }}>{s.icon}</div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 19, fontWeight: 900, color: "white", letterSpacing: "-.03em", lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 2 }}>{s.lb}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Password Reset Modal
══════════════════════════════════════════════════════════════ */
function PasswordResetModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const handleSend = async () => {
    setLoading(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 24 }}>
      <div style={{ background: "var(--gv-color-bg-surface)", borderRadius: 24, overflow: "hidden", maxWidth: 400, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,.16)" }}>
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--gv-color-primary-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 16, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>Reset Password</div>
            <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", lineHeight: 1.6 }}>
              {sent ? `Email reset dikirim ke ${email}. Cek inbox atau spam.` : `Link reset password akan dikirim ke ${email}.`}
            </div>
          </div>
        </div>
        {err && <div style={{ margin: "12px 24px 0", padding: "8px 12px", borderRadius: 8, background: "var(--gv-color-danger-50)", border: "1px solid #FECACA", fontSize: 13, color: "var(--gv-color-danger-700)" }}>{err}</div>}
        <div style={{ padding: "16px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body)", cursor: "pointer", background: "var(--gv-color-bg-surface)", color: "var(--gv-color-neutral-700)", border: "1.5px solid var(--gv-color-neutral-200)" }}>Tutup</button>
          {!sent && (
            <button onClick={handleSend} disabled={loading} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body)", cursor: loading ? "not-allowed" : "pointer", background: "var(--gv-gradient-primary)", color: "white", border: "none", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Mengirim…" : "Kirim Link Reset"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Right Panel
══════════════════════════════════════════════════════════════ */
function RightPanel({
  activeTab, profile, sub, user, quotas, invoices, brandCount,
  onPasswordChange, onCancel, connPlatform,
}: {
  activeTab: string;
  profile: BrandProfile | null;
  sub: Subscription | null;
  user: { name: string; email: string; initials: string } | null;
  quotas: PlanQuota[];
  invoices: Invoice[];
  brandCount: number;
  onPasswordChange: () => void;
  onCancel: () => void;
  connPlatform: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, overflowY: "auto", height: "100%" }}>
      {activeTab === "101 Brand"    && <div style={{ padding: "20px 20px 80px" }}><BrandTab profile={profile} /></div>}
      {activeTab === "Chronicle"    && <div style={{ padding: "20px 20px 80px" }}><ChronicleRight profile={profile} /></div>}
      {activeTab === "Connect"      && <ConnectRight profile={profile} selectedPlatform={connPlatform} />}
      {activeTab === "Subscription" && (
        <SubscriptionRight
          sub={sub}
          user={user}
          quotas={quotas}
          invoices={invoices}
          brandCount={brandCount}
          onCancel={onCancel}
          onPasswordChange={onPasswordChange}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Center Panel
══════════════════════════════════════════════════════════════ */
function CenterPanel({
  activeTab, profile, sub, plans, user, quotas, connPlatform, onConnPlatform, onUpgrade, upgrading,
}: {
  activeTab: string;
  profile: BrandProfile | null;
  sub: Subscription | null;
  plans: Plan[];
  user: { name: string; email: string; initials: string } | null;
  quotas: PlanQuota[];
  connPlatform: string;
  onConnPlatform: (id: string) => void;
  onUpgrade: (planId: string) => Promise<void>;
  upgrading: string | null;
}) {
  const sot = profile?.source_of_truth as Record<string, unknown> | null;
  const rd  = profile?.research_data  as Record<string, unknown> | null;

  // Market intelligence for 101 Brand center
  const marketIntel   = (sot?.market_intelligence as Record<string, unknown> | null) ?? null;
  const competitors   = (sot?.competitor_intelligence as Array<Record<string, unknown>> | null) ?? [];
  const opportunities = (sot?.opportunity_map as Record<string, unknown> | null) ?? null;
  const quickWins     = (opportunities?.immediate_wins as string[] | null) ?? [];

  // Daily insights
  const dailyInsights = profile?.source_of_truth as Record<string, unknown> | null;
  const tasks = (dailyInsights?.tasks as Array<Record<string, unknown>> | null) ?? [];

  /* Connect tab handles its own padding via cn-page */
  if (activeTab === "Connect") {
    return (
      <div style={{ overflowY: "auto", height: "100%" }}>
        <ConnectCenter profile={profile} selectedPlatform={connPlatform} onSelectPlatform={onConnPlatform} />
      </div>
    );
  }

  /* Subscription tab: full-page SubscriptionCenter (sb-* DS token pattern) */
  if (activeTab === "Subscription") {
    return (
      <SubscriptionCenter
        plans={plans}
        sub={sub}
        onUpgrade={onUpgrade}
        upgrading={upgrading}
      />
    );
  }

  return (
    <div style={{ padding: "20px 20px 80px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", height: "100%" }}>
      <StartHeader profile={profile} sub={sub} />

      {activeTab === "101 Brand" && (
        <>
          {/* Market Intel */}
          {marketIntel && (
            <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 20, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: ST.r50, borderBottom: `1px solid ${ST.r100}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${ST.research}, #60A5FA)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Market Intelligence</span>
              </div>
              <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                {Object.entries(marketIntel).slice(0, 4).map(([k, v]) => (
                  <div key={k} style={{ padding: 10, borderRadius: 12, background: "var(--gv-color-bg-surface-elevated)", border: "1px solid var(--gv-color-neutral-200)" }}>
                    <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{k.replace(/_/g, " ")}</div>
                    <div style={{ fontSize: 12, color: "var(--gv-color-neutral-700)", lineHeight: 1.55 }}>{String(v).slice(0, 120)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitor Intelligence */}
          {competitors.length > 0 && (
            <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 20, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "var(--gv-color-bg-surface-elevated)", borderBottom: "1px solid var(--gv-color-neutral-200)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Kompetitor</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-neutral-400)" }}>{competitors.length} ditemukan</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {competitors.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < competitors.length - 1 && i < 4 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--gv-color-neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--gv-font-heading)", fontSize: 13, fontWeight: 800, color: "var(--gv-color-neutral-700)" }}>
                      {String(c.name ?? "?")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{String(c.name ?? "—")}</div>
                      <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>{String(c.website ?? c.strengths ?? "").slice(0, 80)}</div>
                    </div>
                    {c.threat_level && (
                      <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999,
                        background: c.threat_level === "high" ? "var(--gv-color-danger-50)" : c.threat_level === "medium" ? "var(--gv-color-warning-50)" : "var(--gv-color-success-50)",
                        color: c.threat_level === "high" ? "var(--gv-color-danger-700)" : c.threat_level === "medium" ? "var(--gv-color-warning-700)" : "var(--gv-color-success-700)",
                      }}>
                        {String(c.threat_level).toUpperCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Wins */}
          {quickWins.length > 0 && (
            <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 20, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ST.dna} strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Quick Wins</span>
              </div>
              {quickWins.slice(0, 5).map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < quickWins.length - 1 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9999, background: ST.dn50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 800, color: ST.dn700 }}>{i + 1}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gv-color-neutral-700)", lineHeight: 1.55 }}>{w}</div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state for 101 Brand when no SoT */}
          {!sot && !rd && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center", background: "var(--gv-color-bg-surface)", borderRadius: 20, border: "1.5px dashed var(--gv-color-neutral-300)" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: ST.d50, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ST.deep} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900)", marginBottom: 4 }}>Research Belum Selesai</div>
              <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", lineHeight: 1.6, marginBottom: 16 }}>Brand Intelligence Pipeline sedang memproses atau belum dimulai.<br />Status: <strong>{profile?.research_status ?? "—"}</strong></div>
            </div>
          )}
        </>
      )}

      {activeTab === "Chronicle" && <ChronicleCenter profile={profile} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Page Root
══════════════════════════════════════════════════════════════ */
export default function StartPage() {
  const router = useRouter();
  const [activeTab, setActiveTab]     = useState("101 Brand");
  const [profile, setProfile]         = useState<BrandProfile | null>(null);
  const [sub, setSub]                 = useState<Subscription | null>(null);
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [quotas, setQuotas]           = useState<PlanQuota[]>([]);
  const [invoices, setInvoices]       = useState<Invoice[]>([]);
  const [brandCount, setBrandCount]   = useState(0);
  const [upgrading, setUpgrading]     = useState<string | null>(null);
  const [user, setUser]               = useState<{ name: string; email: string; initials: string } | null>(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [connPlatform, setConnPlatform] = useState("instagram");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      const uid     = session.user.id;
      const email   = session.user.email ?? "";
      const rawName = (session.user.user_metadata?.full_name as string | undefined) || email.split("@")[0];
      const initials = rawName.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase().slice(0, 2);
      setUser({ name: rawName, email, initials });

      // Run all fetches in parallel
      const [
        { data: bp },
        { data: subData },
        { data: plansData },
        { data: quotasData },
        { data: invoicesData },
        { count: bpCount },
      ] = await Promise.all([
        // Brand profile (latest)
        supabase
          .from("brand_profiles")
          .select("id, brand_name, website_url, instagram_handle, tiktok_handle, country, whatsapp_number, research_status, brand_dna, research_data, source_of_truth, chronicle_updated_at, qa_analytics, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),

        // Active subscription (current plan)
        supabase
          .from("subscriptions")
          .select("id, status, invoice_number, activated_at, expires_at, proof_url, plans(id, name, slug, price_idr)")
          .eq("user_id", uid)
          .in("status", ["active", "pending_payment", "proof_uploaded"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),

        // All plans (for plan selector)
        supabase
          .from("plans")
          .select("id, name, slug, price_idr, is_active")
          .eq("is_active", true)
          .order("price_idr", { ascending: true }),

        // Quota limits per plan
        supabase
          .from("plan_quotas")
          .select("plan_name, brands_limit, onboarding_runs_limit, ai_chat_messages_per_day, content_articles_per_day, content_images_per_day, content_videos_per_day, qa_probes_total, qa_runs_per_cycle, chronicle_runs_per_cycle"),

        // Full invoice history (all statuses)
        supabase
          .from("subscriptions")
          .select("id, activated_at, expires_at, status, invoice_number, plans(name, slug, price_idr)")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),

        // Brand profile count (for usage bar)
        supabase
          .from("brand_profiles")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
      ]);

      setProfile(bp ?? null);

      if (subData) {
        const planRaw = subData.plans as unknown as { id: string; name: string; slug: string; price_idr: number } | null;
        setSub({ ...subData, plan: planRaw });
      }

      setPlans(plansData ?? []);
      setQuotas(quotasData ?? []);
      setBrandCount(bpCount ?? 0);

      if (invoicesData) {
        setInvoices(invoicesData.map(inv => ({
          id: inv.id,
          activated_at: inv.activated_at,
          expires_at: inv.expires_at,
          status: inv.status,
          invoice_number: inv.invoice_number,
          plan: inv.plans as unknown as { name: string; slug: string; price_idr: number } | null,
        })));
      }

      setLoading(false);
    }
    load();
  }, [router]);

  /** Upgrade / create subscription — calls /api/payment (JWT-verified proxy) */
  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const token = sess?.access_token;
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ action: "request_subscription", plan_id: planId }),
      });
      const json = await res.json();
      if (res.ok) {
        // Reload active subscription
        const { data: sd } = await supabase
          .from("subscriptions")
          .select("id, status, invoice_number, activated_at, expires_at, proof_url, plans(id, name, slug, price_idr)")
          .eq("user_id", sess!.user.id)
          .in("status", ["active", "pending_payment", "proof_uploaded"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (sd) {
          const planRaw = sd.plans as unknown as { id: string; name: string; slug: string; price_idr: number } | null;
          setSub({ ...sd, plan: planRaw });
        }
        // Reload invoice history
        const { data: invData } = await supabase
          .from("subscriptions")
          .select("id, activated_at, expires_at, status, invoice_number, plans(name, slug, price_idr)")
          .eq("user_id", sess!.user.id)
          .order("created_at", { ascending: false });
        if (invData) {
          setInvoices(invData.map(inv => ({
            id: inv.id, activated_at: inv.activated_at, expires_at: inv.expires_at,
            status: inv.status, invoice_number: inv.invoice_number,
            plan: inv.plans as unknown as { name: string; slug: string; price_idr: number } | null,
          })));
        }
      } else {
        alert(json?.error ?? "Gagal membuat subscription. Silahkan coba lagi.");
      }
    } catch (err) {
      console.error("handleUpgrade error:", err);
      alert("Terjadi kesalahan. Periksa koneksi internet kamu.");
    } finally {
      setUpgrading(null);
    }
  };

  /** Cancel active subscription — sets status to cancelled in DB */
  const handleCancel = async () => {
    if (!sub) return;
    try {
      await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", sub.id);
      setSub(null);
    } catch (err) {
      console.error("handleCancel error:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--gv-color-primary-200)", borderTopColor: "var(--gv-color-primary-500)", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, color: "var(--gv-color-neutral-400)", letterSpacing: ".1em", textTransform: "uppercase" }}>Loading Brand Intelligence…</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <>
      {showPwModal && user && <PasswordResetModal email={user.email} onClose={() => setShowPwModal(false)} />}
      <AppShell
        activeSubItem={activeTab}
        onSubMenuChange={(_, sub) => setActiveTab(sub)}
        center={
          <CenterPanel
            activeTab={activeTab}
            profile={profile}
            sub={sub}
            plans={plans}
            user={user}
            quotas={quotas}
            connPlatform={connPlatform}
            onConnPlatform={setConnPlatform}
            onUpgrade={handleUpgrade}
            upgrading={upgrading}
          />
        }
        right={
          <RightPanel
            activeTab={activeTab}
            profile={profile}
            sub={sub}
            user={user}
            quotas={quotas}
            invoices={invoices}
            brandCount={brandCount}
            onPasswordChange={() => setShowPwModal(true)}
            onCancel={handleCancel}
            connPlatform={connPlatform}
          />
        }
      />
    </>
  );
}
