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

/* ── Color tokens (ST/BL DS v5.8/5.9) ── */
const ST = {
  research: "#3B82F6", r50: "#EFF6FF", r100: "#DBEAFE", r700: "#1D4ED8",
  deep: "#8B5CF6", d50: "#F5F3FF", d100: "#EDE9FE", d700: "#6D28D9",
  chronicle: "#F59E0B", c50: "#FFFBEB", c100: "#FEF3C7", c700: "#B45309",
  dna: "#10B981", dn50: "#ECFDF3", dn100: "#D1FAE5", dn700: "#047857",
  tone: "#EF4444", t50: "#FEF2F2", t100: "#FEE2E2", t700: "#B91C1C",
  dark: "#0F1923", dark2: "#162030",
};

/* ── Platform logos ── */
const PLATFORMS = [
  {
    id: "instagram", name: "Instagram",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
    fieldKey: "instagram_handle",
  },
  {
    id: "tiktok", name: "TikTok",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.15 8.15 0 0 0 4.77 1.52V6.75a4.85 4.85 0 0 1-1-.06z"/></svg>,
    fieldKey: "tiktok_handle",
  },
  {
    id: "linkedin", name: "LinkedIn",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>,
    fieldKey: null,
  },
  {
    id: "youtube", name: "YouTube",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/></svg>,
    fieldKey: null,
  },
  {
    id: "whatsapp", name: "WhatsApp",
    logo: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.12 1.527 5.854L.057 23.928a.5.5 0 0 0 .609.637l6.333-1.657A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.69-.513-5.22-1.406l-.374-.222-3.88 1.016 1.035-3.775-.243-.389A9.957 9.957 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>,
    fieldKey: "whatsapp_number",
  },
];

/* ── Plan feature lists ── */
const PLAN_FEATURES: Record<string, string[]> = {
  basic: ["10 artikel/bulan", "5 gambar/bulan", "2 video/bulan", "AI Chat (basic)", "Smart Reply (100 komentar)"],
  premium: ["50 artikel/bulan", "20 gambar/bulan", "10 video/bulan", "AI Chat (full)", "Smart Reply (500 komentar)", "Brand DNA + Chronicle", "Deep Research"],
  enterprise: ["Unlimited artikel", "Unlimited gambar", "30 video/bulan", "AI Chat (priority)", "Smart Reply (unlimited)", "Full Brand Intelligence", "Dedicated Support"],
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
   Tab: Connect
══════════════════════════════════════════════════════════════ */
function ConnectTab({ profile }: { profile: BrandProfile | null }) {
  const connected = PLATFORMS.filter(p => {
    if (!profile) return false;
    if (!p.fieldKey) return false;
    const val = (profile as Record<string, unknown>)[p.fieldKey];
    return val && String(val).trim() !== "";
  });
  const disconnected = PLATFORMS.filter(p => !connected.includes(p));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Platform Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {PLATFORMS.map(p => {
          const isOn = connected.includes(p);
          const handle = profile && p.fieldKey ? (profile as Record<string, unknown>)[p.fieldKey] as string : null;
          return (
            <div key={p.id} style={{
              padding: "14px 10px", borderRadius: 16,
              border: `1.5px solid ${isOn ? "var(--gv-color-primary-500, #5F8F8B)" : "var(--gv-color-neutral-200)"}`,
              background: isOn ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface-elevated)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative",
              cursor: "pointer",
            }}>
              {isOn && (
                <div style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: "50%", background: "var(--gv-color-success-500)", boxShadow: "0 0 0 2px var(--gv-color-success-50, #ECFDF3)" }} />
              )}
              <div style={{ width: 38, height: 38, borderRadius: 10, background: isOn ? "var(--gv-color-primary-100)" : "var(--gv-color-neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: isOn ? "var(--gv-color-primary-600)" : "var(--gv-color-neutral-700)" }}>
                {p.logo}
              </div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 12, fontWeight: 700, color: isOn ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-700)", textAlign: "center" }}>{p.name}</div>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: isOn ? "var(--gv-color-success-500)" : "var(--gv-color-neutral-400)" }}>
                {isOn ? (handle ? `@${handle}` : "Connected") : "Connect"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected platforms detail */}
      {connected.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em" }}>Platform Terkoneksi</div>
          {connected.map(p => {
            const handle = profile && p.fieldKey ? (profile as Record<string, unknown>)[p.fieldKey] as string : "";
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--gv-color-primary-200)", background: "var(--gv-color-primary-50)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--gv-color-primary-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gv-color-primary-600)", flexShrink: 0 }}>{p.logo}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{p.name}</div>
                  <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, color: "var(--gv-color-primary-600)", marginTop: 1 }}>@{handle}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gv-color-success-500)" }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Disconnected platforms */}
      {disconnected.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em" }}>Belum Terkoneksi</div>
          {disconnected.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--gv-color-neutral-200)", background: "var(--gv-color-bg-surface-elevated)", opacity: 0.75 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--gv-color-neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gv-color-neutral-700)", flexShrink: 0 }}>{p.logo}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>Hubungkan akun untuk sync data</div>
              </div>
              <button style={{ padding: "5px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 700, fontFamily: "var(--gv-font-body)", background: "var(--gv-gradient-primary)", color: "white", border: "none", cursor: "pointer" }}>Connect</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tab: Subscription
══════════════════════════════════════════════════════════════ */
function SubscriptionTab({
  sub, plans, user, onPasswordChange,
}: {
  sub: Subscription | null;
  plans: Plan[];
  user: { name: string; email: string; initials: string } | null;
  onPasswordChange: () => void;
}) {
  const activePlan = sub?.plan ?? null;
  const isActive = sub?.status === "active";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Profile card (ST18 style) */}
      <div style={{ borderRadius: 24, overflow: "hidden", border: "1.5px solid var(--gv-color-neutral-200)" }}>
        <div style={{ height: 64, background: "linear-gradient(135deg, var(--gv-color-primary-700), var(--gv-color-primary-400), #8B5CF6)", position: "relative" }} />
        <div style={{ padding: "0 18px 16px" }}>
          <div style={{ position: "relative", marginTop: -24, marginBottom: 8, width: "fit-content" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--gv-gradient-primary)", border: "3px solid white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}>
              <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 900, color: "white" }}>{user?.initials ?? "?"}</span>
            </div>
          </div>
          <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 16, fontWeight: 900, color: "var(--gv-color-neutral-900)", marginBottom: 1 }}>{user?.name ?? "—"}</div>
          <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, color: "var(--gv-color-neutral-400)", marginBottom: 12 }}>{user?.email ?? "—"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 14, background: "var(--gv-color-bg-surface-sunken)", border: "1px solid var(--gv-color-neutral-200)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 9999, background: "linear-gradient(135deg, #F59E0B, #FBBF24)", fontFamily: "var(--gv-font-heading)", fontSize: 12, fontWeight: 800, color: "#1C1400" }}>
              {activePlan ? activePlan.name.toUpperCase() : "FREE"}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: "var(--gv-color-neutral-700)" }}>
              {isActive ? `Aktif · Berakhir ${fmtDate(sub?.expires_at ?? null)}` : sub?.status === "pending_payment" ? "Menunggu pembayaran" : "Tidak ada langganan aktif"}
            </span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div style={{ border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--gv-color-bg-surface-elevated)", borderBottom: "1px solid var(--gv-color-neutral-200)" }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--gv-color-primary-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)", flex: 1 }}>Ubah Password</span>
        </div>
        <div style={{ padding: "12px 14px" }}>
          <button
            onClick={onPasswordChange}
            style={{ width: "100%", padding: "10px 16px", borderRadius: 10, background: "var(--gv-color-bg-surface-elevated)", border: "1.5px solid var(--gv-color-neutral-200)", fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-700)", fontFamily: "var(--gv-font-body)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Kirim link reset password ke email
          </button>
        </div>
      </div>

      {/* Subscription Status (BL08 style) */}
      {sub && (
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 24, overflow: "hidden" }}>
          <div style={{ background: "var(--gv-color-primary-900)", padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 14, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -20, top: -20, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(122,179,171,.15) 0%, transparent 70%)" }} />
            <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(95,143,139,.2)", border: "1.5px solid rgba(122,179,171,.25)", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 8, fontWeight: 700, color: "var(--gv-color-primary-200, #A8D5CF)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 3 }}>Plan</div>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 15, fontWeight: 900, color: "white" }}>{activePlan?.name ?? "—"}</div>
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: isActive ? "var(--gv-color-success-500)" : "#9CA3AF" }} />
                <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: isActive ? "var(--gv-color-success-500)" : "#9CA3AF", textTransform: "uppercase", letterSpacing: ".1em" }}>
                  {isActive ? "AKTIF" : sub.status.toUpperCase().replace("_", " ")}
                </span>
              </div>
              {activePlan && <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 20, fontWeight: 900, color: "white", letterSpacing: "-.04em" }}>
                {fmtIDR(activePlan.price_idr)}<span style={{ fontSize: 11, fontWeight: 500, color: "var(--gv-color-primary-300, #90C4BE)" }}>/bulan</span>
              </div>}
              {sub.expires_at && <div style={{ fontSize: 12, color: "var(--gv-color-primary-300, #90C4BE)", marginTop: 2 }}>Berakhir {fmtDate(sub.expires_at)}</div>}
            </div>
          </div>
          {/* Invoice detail rows */}
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { lbl: "No. Invoice", val: sub.invoice_number ?? "—" },
              { lbl: "Tanggal Aktif", val: fmtDate(sub.activated_at) },
              { lbl: "Status Bukti", val: sub.proof_url ? "Terkirim ✓" : "Belum upload" },
            ].map(r => (
              <div key={r.lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
                <span style={{ fontSize: 12, color: "var(--gv-color-neutral-500)" }}>{r.lbl}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-900)", fontFamily: r.lbl === "No. Invoice" ? "var(--gv-font-mono)" : undefined }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Cards (BL01 style) */}
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 8 }}>
        {isActive ? "Upgrade Plan" : "Pilih Plan"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plans.map(plan => {
          const isFeatured = plan.slug === "premium";
          const isCurrent = sub?.plan?.slug === plan.slug && isActive;
          const features = PLAN_FEATURES[plan.slug] ?? [];
          return (
            <div key={plan.id} style={{
              background: isFeatured ? "var(--gv-color-primary-900)" : "var(--gv-color-bg-surface)",
              border: `1.5px solid ${isFeatured ? "var(--gv-color-primary-400)" : "var(--gv-color-neutral-200)"}`,
              borderRadius: 20, padding: "20px 18px", position: "relative", overflow: "hidden",
              boxShadow: isFeatured ? "0 0 30px rgba(95,143,139,.15)" : undefined,
            }}>
              {isFeatured && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--gv-gradient-primary)" }} />}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 9999, fontSize: 9, fontWeight: 700, fontFamily: "var(--gv-font-mono)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6,
                    background: isFeatured ? "rgba(95,143,139,.2)" : "var(--gv-color-neutral-100)",
                    color: isFeatured ? "var(--gv-color-primary-200, #A8D5CF)" : "var(--gv-color-neutral-700)",
                  }}>
                    {plan.name}{isFeatured && " ★ Popular"}
                  </div>
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 18, fontWeight: 900, color: isFeatured ? "white" : "var(--gv-color-neutral-900)", letterSpacing: "-.03em" }}>{plan.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: isFeatured ? "white" : "var(--gv-color-neutral-900)", letterSpacing: "-.04em", lineHeight: 1 }}>
                    {fmtIDR(plan.price_idr)}
                  </div>
                  <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, color: isFeatured ? "var(--gv-color-primary-200, #A8D5CF)" : "var(--gv-color-neutral-400)", marginTop: 2 }}>/bulan</div>
                </div>
              </div>
              <div style={{ height: 1, background: isFeatured ? "rgba(255,255,255,.1)" : "var(--gv-color-neutral-200)", marginBottom: 12 }} />
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                {features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: isFeatured ? "var(--gv-color-primary-100, #D4EAE7)" : "var(--gv-color-neutral-700)", lineHeight: 1.4 }}>
                    <div style={{ width: 15, height: 15, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: isFeatured ? "var(--gv-color-primary-400)" : "var(--gv-color-success-500)" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <button style={{
                width: "100%", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body)", cursor: isCurrent ? "default" : "pointer", border: "1.5px solid",
                background: isCurrent ? "transparent" : isFeatured ? "var(--gv-gradient-primary)" : "var(--gv-color-primary-50)",
                borderColor: isCurrent ? "rgba(255,255,255,.2)" : isFeatured ? "transparent" : "var(--gv-color-primary-300, #8EC8C2)",
                color: isCurrent ? (isFeatured ? "rgba(255,255,255,.4)" : "var(--gv-color-neutral-400)") : isFeatured ? "white" : "var(--gv-color-primary-600)",
              }}>
                {isCurrent ? "Plan Aktif" : isActive ? "Upgrade" : "Pilih Plan"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Header (ST01 style)
══════════════════════════════════════════════════════════════ */
function StartHeader({ profile, sub }: { profile: BrandProfile | null; sub: Subscription | null }) {
  const stats = [
    { mod: "c", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, val: PLATFORMS.filter(p => profile && p.fieldKey && (profile as Record<string, unknown>)[p.fieldKey]).length, lb: "Platforms" },
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
  activeTab, profile, sub, plans, user, onPasswordChange,
}: {
  activeTab: string;
  profile: BrandProfile | null;
  sub: Subscription | null;
  plans: Plan[];
  user: { name: string; email: string; initials: string } | null;
  onPasswordChange: () => void;
}) {
  return (
    <div style={{ padding: "20px 20px 80px", display: "flex", flexDirection: "column", gap: 0, overflowY: "auto", height: "100%" }}>
      {activeTab === "101 Brand" && <BrandTab profile={profile} />}
      {activeTab === "Chronicle" && <ChronicleRight profile={profile} />}
      {activeTab === "Connect" && <ConnectTab profile={profile} />}
      {activeTab === "Subscription" && <SubscriptionTab sub={sub} plans={plans} user={user} onPasswordChange={onPasswordChange} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Center Panel
══════════════════════════════════════════════════════════════ */
function CenterPanel({
  activeTab, profile, sub, plans, user,
}: {
  activeTab: string;
  profile: BrandProfile | null;
  sub: Subscription | null;
  plans: Plan[];
  user: { name: string; email: string; initials: string } | null;
}) {
  const sot = profile?.source_of_truth as Record<string, unknown> | null;
  const rd  = profile?.research_data  as Record<string, unknown> | null;

  // Market intelligence for 101 Brand center
  const marketIntel = (sot?.market_intelligence as Record<string, unknown> | null) ?? null;
  const competitors  = (sot?.competitor_intelligence as Array<Record<string, unknown>> | null) ?? [];
  const opportunities = (sot?.opportunity_map as Record<string, unknown> | null) ?? null;
  const quickWins    = (opportunities?.immediate_wins as string[] | null) ?? [];

  // Daily insights
  const dailyInsights = profile?.source_of_truth as Record<string, unknown> | null;
  const tasks = (dailyInsights?.tasks as Array<Record<string, unknown>> | null) ?? [];

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

      {activeTab === "Connect" && (
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 20, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Platform Onboarding</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--gv-color-neutral-600)", lineHeight: 1.7, marginBottom: 12 }}>
            Hubungkan akun sosial media brand kamu agar GeoVera bisa menganalisis performa, scraping konten, dan optimasi otomatis.
          </div>
          {[
            { title: "Langkah 1", desc: "Pilih platform di panel kanan" },
            { title: "Langkah 2", desc: "Klik Connect → masukkan handle akun" },
            { title: "Langkah 3", desc: "GeoVera sync data secara otomatis" },
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--gv-color-primary-50)", border: "1.5px solid var(--gv-color-primary-200)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 800, color: "var(--gv-color-primary-600)" }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{step.title}</div>
                <div style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", marginTop: 1 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Subscription" && (
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: 20, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ST.chronicle} strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span style={{ fontFamily: "var(--gv-font-heading)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>Riwayat Transaksi</span>
          </div>
          {sub ? (
            <div>
              {[
                { lbl: "Invoice", val: sub.invoice_number ?? "—", mono: true },
                { lbl: "Status", val: sub.status, mono: false },
                { lbl: "Aktif Sejak", val: fmtDate(sub.activated_at), mono: false },
                { lbl: "Berakhir", val: fmtDate(sub.expires_at), mono: false },
                { lbl: "Bukti Transfer", val: sub.proof_url ? "Terkirim" : "Belum", mono: false },
              ].map((r, i) => (
                <div key={r.lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 4 ? "1px solid var(--gv-color-neutral-100)" : undefined }}>
                  <span style={{ fontSize: 12, color: "var(--gv-color-neutral-500)" }}>{r.lbl}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-900)", fontFamily: r.mono ? "var(--gv-font-mono)" : undefined }}>{r.val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", textAlign: "center", padding: "20px 0" }}>Belum ada transaksi.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Page Root
══════════════════════════════════════════════════════════════ */
export default function StartPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("101 Brand");
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [user, setUser] = useState<{ name: string; email: string; initials: string } | null>(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      const email   = session.user.email ?? "";
      const rawName = (session.user.user_metadata?.full_name as string | undefined) || email.split("@")[0];
      const initials = rawName.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase().slice(0, 2);
      setUser({ name: rawName, email, initials });

      // Load brand profile
      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("id, brand_name, website_url, instagram_handle, tiktok_handle, country, whatsapp_number, research_status, brand_dna, research_data, source_of_truth, chronicle_updated_at, qa_analytics, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setProfile(bp ?? null);

      // Load active subscription with plan
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("id, status, invoice_number, activated_at, expires_at, proof_url, plans(id, name, slug, price_idr)")
        .eq("user_id", session.user.id)
        .in("status", ["active", "pending_payment", "proof_uploaded"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subData) {
        const planRaw = subData.plans as unknown as { id: string; name: string; slug: string; price_idr: number } | null;
        setSub({ ...subData, plan: planRaw });
      }

      // Load all plans
      const { data: plansData } = await supabase
        .from("plans")
        .select("id, name, slug, price_idr, is_active")
        .eq("is_active", true)
        .order("price_idr", { ascending: true });
      setPlans(plansData ?? []);

      setLoading(false);
    }
    load();
  }, [router]);

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
          />
        }
        right={
          <RightPanel
            activeTab={activeTab}
            profile={profile}
            sub={sub}
            plans={plans}
            user={user}
            onPasswordChange={() => setShowPwModal(true)}
          />
        }
      />
    </>
  );
}
