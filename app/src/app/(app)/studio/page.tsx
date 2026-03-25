"use client";
import { useState } from "react";

// ── Detail item union ─────────────────────────────────────────────────────────
type DetailItem =
  | { kind: "list";   data: typeof LIST_ITEMS[0];    bg: string; accent: string }
  | { kind: "grid3";  data: typeof ARTIKEL_ITEMS[0]; bg: string; accent: string }
  | { kind: "image";  data: typeof IMAGE_ITEMS[0];   bg: string; accent: string }
  | { kind: "video";  data: typeof VIDEO_ITEMS[0];   bg: string; accent: string };

type ContentType = "artikel" | "image" | "video";

const ARTIKEL_ITEMS = [
  { id: 1, title: "10 Tren Marketing Digital 2026 yang Wajib Kamu Tahu", date: "24 Mar", words: "1.2k" },
  { id: 2, title: "Cara Membangun Brand Authority di Era AI", date: "23 Mar", words: "890" },
  { id: 3, title: "Strategi Konten Ramadan untuk UMKM Indonesia", date: "22 Mar", words: "1.1k" },
  { id: 4, title: "SEO vs GEO: Mana yang Lebih Penting?", date: "21 Mar", words: "750" },
  { id: 5, title: "Panduan Lengkap TikTok Shop 2026", date: "20 Mar", words: "2.0k" },
  { id: 6, title: "Psikologi Warna dalam Branding Modern", date: "19 Mar", words: "640" },
  { id: 7, title: "5 Kesalahan Fatal Brand di Social Media", date: "18 Mar", words: "980" },
  { id: 8, title: "Cara Kerja Algoritma Instagram 2026", date: "17 Mar", words: "1.3k" },
  { id: 9, title: "Content Repurposing: Satu Konten, Banyak Platform", date: "16 Mar", words: "870" },
];

const IMAGE_ITEMS = [
  { id: 1, prompt: "Product photography minimalist white background", date: "24 Mar", model: "Flux H100" },
  { id: 2, prompt: "Lifestyle brand shot warm tones", date: "24 Mar", model: "Flux H100" },
  { id: 3, prompt: "Ramadan campaign visual crescent moon", date: "23 Mar", model: "DALL-E 3" },
  { id: 4, prompt: "Social media carousel template teal", date: "23 Mar", model: "Flux H100" },
  { id: 5, prompt: "Behind the scenes coffee roasting", date: "22 Mar", model: "Flux H100" },
  { id: 6, prompt: "Brand logo mockup on packaging", date: "21 Mar", model: "Flux H100" },
];

const VIDEO_ITEMS = [
  { id: 1, title: "Brand Story — 30s Hook", duration: "0:30", date: "24 Mar", status: "done", tall: true },
  { id: 2, title: "Product Demo Reels", duration: "0:15", date: "23 Mar", status: "done", tall: false },
  { id: 3, title: "Ramadan Campaign", duration: "0:45", date: "22 Mar", status: "processing", tall: false },
  { id: 4, title: "Behind The Scenes", duration: "0:20", date: "21 Mar", status: "done", tall: true },
  { id: 5, title: "Tutorial Singkat", duration: "0:60", date: "20 Mar", status: "done", tall: false },
  { id: 6, title: "Testimonial Compilation", duration: "0:35", date: "19 Mar", status: "done", tall: true },
];

// Deterministic color palette for artikel cards
const CARD_COLORS = [
  ["#1a2e22", "#22C55E"],
  ["#1e2233", "#60A5FA"],
  ["#2a1e33", "#A78BFA"],
  ["#2e221a", "#F59E0B"],
  ["#1a2233", "#34D399"],
  ["#2e1a1a", "#F87171"],
  ["#1a2a2e", "#22D3EE"],
  ["#2e2a1a", "#FBBF24"],
  ["#1e2e1a", "#4ADE80"],
];

type Layout = "masonry" | "grid3" | "list";

const PLATFORMS: { id: string; label: string; type: string; accent: string; layout: Layout; icon: React.ReactNode }[] = [
  { id: "tiktok",      label: "TikTok",            type: "video",   accent: "#FE2C55", layout: "masonry",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/></svg> },
  { id: "ig-post",     label: "Instagram Post",    type: "image",   accent: "#E1306C", layout: "grid3",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> },
  { id: "ig-reels",    label: "Instagram Reels",   type: "video",   accent: "#E1306C", layout: "masonry",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg> },
  { id: "facebook",    label: "Facebook",          type: "image",   accent: "#1877F2", layout: "grid3",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.254h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg> },
  { id: "threads",     label: "Threads",           type: "text",    accent: "var(--text-primary)", layout: "list",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 012.2.068c-.068-.263-.15-.5-.247-.715-.358-.807-.977-1.245-1.928-1.271-1.123-.032-1.955.424-2.48 1.353l-1.71-1.18c.805-1.355 2.16-2.107 3.908-2.107.1 0 .2.002.3.007 1.904.058 3.233.878 3.948 2.435.257.56.436 1.184.535 1.875.71.198 1.36.495 1.937.884.995.677 1.738 1.578 2.164 2.608.716 1.73.64 4.546-1.673 6.797-1.904 1.841-4.168 2.627-7.4 2.649z"/></svg> },
  { id: "yt-video",    label: "YouTube Video",     type: "video",   accent: "#FF0000", layout: "grid3",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
  { id: "yt-shorts",   label: "YouTube Shorts",    type: "video",   accent: "#FF0000", layout: "masonry",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/><path d="M19 3l-3 3 3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "twitter",     label: "X / Twitter",       type: "text",    accent: "var(--text-primary)", layout: "list",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.243 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { id: "linkedin",    label: "LinkedIn",          type: "image",   accent: "#0A66C2", layout: "grid3",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
  { id: "artikel-img", label: "Artikel + Gambar",  type: "artikel", accent: "var(--success)", layout: "grid3",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
  { id: "artikel",     label: "Artikel",           type: "artikel", accent: "var(--success)", layout: "list",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
];

const LIST_ITEMS = [
  { id: 1, title: "10 Tren Marketing Digital 2026", body: "AI mengubah cara brand berkomunikasi dengan audiens. Berikut tren yang tidak boleh kamu lewatkan tahun ini...", date: "24 Mar", words: "1.2k" },
  { id: 2, title: "Cara Membangun Brand Authority", body: "Authority bukan soal ukuran, tapi soal kepercayaan. Ikuti framework 3-langkah ini untuk membangun otoritas...", date: "23 Mar", words: "890" },
  { id: 3, title: "Strategi Konten Ramadan", body: "Ramadan adalah momen emas untuk brand Indonesia. Gunakan emotional storytelling dan nilai-nilai yang relevan...", date: "22 Mar", words: "1.1k" },
  { id: 4, title: "SEO vs GEO: Mana Lebih Penting?", body: "Google bukan satu-satunya mesin pencari yang penting. GEO (Generative Engine Optimization) kini semakin krusial...", date: "21 Mar", words: "750" },
];

// ── Full-screen Content Detail ────────────────────────────────────────────────
function ContentDetail({ item, onClose }: { item: DetailItem; onClose: () => void }) {
  const isVideo = item.kind === "video";
  const isImage = item.kind === "image";
  const isProcessing = isVideo && item.data.status === "processing";

  const title =
    item.kind === "image" ? item.data.prompt :
    item.kind === "list"  ? item.data.title  :
    item.data.title;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "var(--bg-primary)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
      display: "flex", flexDirection: "column",
      overflowY: "hidden",
    }}>

      {/* ── Top bar (sticky) ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "14px 16px 12px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-primary)",
        flexShrink: 0,
      }}>
        {/* Back */}
        <button onClick={onClose} style={{
          width: "36px", height: "36px", minWidth: "36px", minHeight: "36px",
          borderRadius: "50%", flexShrink: 0, padding: 0,
          background: "var(--bg-recessed)", border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          boxSizing: "border-box",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "10px", color: "var(--text-disabled)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {item.kind === "video" ? "Video" : item.kind === "image" ? "Gambar" : "Artikel"}
          </p>
          <h2 style={{
            margin: 0, fontFamily: "var(--font-heading)", fontWeight: 700,
            fontSize: "14px", color: "var(--text-primary)", letterSpacing: "-0.01em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {title}
          </h2>
        </div>
        {/* Download */}
        <button style={{
          width: "36px", height: "36px", minWidth: "36px", minHeight: "36px",
          borderRadius: "50%", flexShrink: 0, padding: 0,
          background: "var(--bg-recessed)", border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          boxSizing: "border-box",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        {/* Share / Forward */}
        <button style={{
          width: "36px", height: "36px", minWidth: "36px", minHeight: "36px",
          borderRadius: "50%", flexShrink: 0, padding: 0,
          background: "var(--bg-recessed)", border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          boxSizing: "border-box",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>

        {/* Video / Image preview */}
        {(isVideo || isImage) && (
          <div style={{
            width: "100%",
            aspectRatio: isVideo ? "9/16" : "1",
            maxHeight: isVideo ? "55vh" : "50vw",
            background: item.bg,
            borderRadius: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
            marginBottom: "20px",
            margin: "0 auto 20px",
          }}>
            {isVideo && (
              isProcessing ? (
                <div style={{
                  width: "56px", height: "56px", borderRadius: "50%",
                  border: "3px solid var(--border-default)",
                  borderTopColor: item.accent,
                  animation: "spin 1s linear infinite",
                }} />
              ) : (
                <div style={{
                  width: "60px", height: "60px", borderRadius: "50%",
                  background: "var(--glass-bg-strong)",
                  border: `2px solid ${item.accent}60`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={item.accent}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </div>
              )
            )}
            {isImage && (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={item.accent} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            )}
            {/* Duration badge for video */}
            {isVideo && (
              <span style={{
                position: "absolute", top: "12px", right: "12px",
                fontSize: "11px", fontWeight: 700,
                background: "var(--glass-bg-strong)", color: "var(--text-primary)",
                padding: "3px 8px", borderRadius: "6px",
              }}>{(item.data as typeof VIDEO_ITEMS[0]).duration}</span>
            )}
            {/* Status badge */}
            {isVideo && (
              <span style={{
                position: "absolute", bottom: "12px", left: "12px",
                fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px",
                background: isProcessing ? "var(--warning-subtle)" : "var(--success-subtle)",
                color: isProcessing ? "var(--warning)" : "var(--success)",
              }}>
                {isProcessing ? "Sedang diproses…" : "Selesai"}
              </span>
            )}
            {isImage && (
              <span style={{
                position: "absolute", bottom: "12px", right: "12px",
                fontSize: "10px", fontWeight: 600,
                color: item.accent, background: `${item.accent}18`,
                padding: "3px 8px", borderRadius: "6px",
              }}>{(item.data as typeof IMAGE_ITEMS[0]).model}</span>
            )}
          </div>
        )}

        {/* Artikel / Text content */}
        {(item.kind === "list" || item.kind === "grid3") && (
          <div style={{
            background: "var(--bg-recessed)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            marginBottom: "20px",
          }}>
            <h1 style={{
              fontFamily: "var(--font-heading)", fontWeight: 800,
              fontSize: "20px", color: "var(--text-primary)",
              letterSpacing: "-0.02em", lineHeight: 1.3, margin: "0 0 16px",
            }}>{title}</h1>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px",
                background: "var(--accent-subtle)", color: "var(--accent)",
              }}>
                {item.kind === "list" ? item.data.words : (item.data as typeof ARTIKEL_ITEMS[0]).words} kata
              </span>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px",
                background: "var(--success-subtle)", color: "var(--success)",
              }}>Selesai</span>
              <span style={{ fontSize: "11px", color: "var(--text-disabled)", padding: "3px 0" }}>
                {item.data.date}
              </span>
            </div>
            {/* Body text — dummy full content */}
            {[1,2,3].map((p) => (
              <p key={p} style={{
                margin: "0 0 14px", fontSize: "14px", color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}>
                {item.kind === "list"
                  ? item.data.body.replace("...", " Pelajari lebih lanjut strategi yang terbukti berhasil untuk brand di Indonesia. Dengan pendekatan berbasis data dan AI, GeoVera membantu brand kamu tampil lebih relevan di setiap touchpoint digital.")
                  : `Konten ini dihasilkan oleh AI GeoVera berdasarkan riset brand, source of truth, dan tren terkini. Setiap bagian telah dioptimasi untuk SEO, GEO, dan visibilitas di mesin pencari generatif seperti Perplexity dan ChatGPT.`
                }
              </p>
            ))}
          </div>
        )}

        {/* Image prompt detail */}
        {isImage && (
          <div style={{
            background: "var(--bg-recessed)", border: "1px solid var(--border-subtle)",
            borderRadius: "14px", padding: "16px", marginBottom: "20px",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: "11px", color: "var(--text-disabled)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>Prompt</p>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.6 }}>
              {(item.data as typeof IMAGE_ITEMS[0]).prompt}
            </p>
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display: "flex", gap: "10px", flexWrap: "wrap",
          padding: "12px 14px",
          background: "var(--bg-recessed)", border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
        }}>
          <div style={{ flex: 1, minWidth: "80px" }}>
            <p style={{ margin: "0 0 2px", fontSize: "10px", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Dibuat</p>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{item.data.date}</p>
          </div>
          <div style={{ flex: 1, minWidth: "80px" }}>
            <p style={{ margin: "0 0 2px", fontSize: "10px", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Model AI</p>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>
              {isImage ? (item.data as typeof IMAGE_ITEMS[0]).model : "Claude Sonnet"}
            </p>
          </div>
          <div style={{ flex: 1, minWidth: "80px" }}>
            <p style={{ margin: "0 0 2px", fontSize: "10px", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Status</p>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: isProcessing ? "var(--warning)" : "var(--success)" }}>
              {isProcessing ? "Proses…" : "Siap"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA bar ── */}
      <div style={{
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--bg-secondary)",
        display: "flex", gap: "8px",
        flexShrink: 0,
      }}>
        {/* Reject */}
        <button onClick={onClose} style={{
          flex: 1, height: "46px", borderRadius: "12px",
          background: "var(--danger-subtle)", border: "1px solid var(--danger-subtle)",
          color: "var(--danger)", fontSize: "13px", fontWeight: 600,
          fontFamily: "var(--font-body)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
          WebkitTapHighlightColor: "transparent",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Reject
        </button>
        {/* Jadwalkan */}
        <button disabled={isProcessing} style={{
          flex: 1, height: "46px", borderRadius: "12px",
          background: "var(--bg-recessed)", border: "1px solid var(--border-strong)",
          color: isProcessing ? "var(--text-disabled)" : "var(--accent)",
          fontSize: "13px", fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: isProcessing ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
          WebkitTapHighlightColor: "transparent",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Jadwalkan
        </button>
        {/* Publish Now — primary */}
        <button disabled={isProcessing} style={{
          flex: 2, height: "46px", borderRadius: "12px",
          background: isProcessing ? "var(--bg-recessed)" : "var(--accent)",
          border: "none",
          color: isProcessing ? "var(--text-disabled)" : "var(--bg-primary)",
          fontSize: "13px", fontWeight: 700,
          fontFamily: "var(--font-body)",
          cursor: isProcessing ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          WebkitTapHighlightColor: "transparent",
          letterSpacing: "0.01em",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          {isProcessing ? "Diproses…" : "Publish Now"}
        </button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [type, setType] = useState<ContentType>("artikel");
  const [showFab, setShowFab] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<typeof PLATFORMS[0] | null>(null);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);

  const activeLayout: Layout = selectedPlatform?.layout ?? "list";

  return (
    <div style={{ minHeight: "100svh", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Full-screen content detail */}
      {selectedItem && <ContentDetail item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* Header */}
      <div style={{ padding: "24px 16px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "22px", fontWeight: 800, color: "var(--text-primary)",
            margin: 0, letterSpacing: "-0.02em",
          }}>Studio</h1>
          {/* Platform chip */}
          {selectedPlatform ? (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: selectedPlatform.accent }}>
                {selectedPlatform.label}
              </span>
              <button onClick={() => setSelectedPlatform(null)} style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "var(--text-disabled)", display: "flex", alignItems: "center",
                WebkitTapHighlightColor: "transparent",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ) : (
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-disabled)" }}>Konten via WhatsApp</p>
          )}
        </div>

        {/* 3 type icons */}
        <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
          {/* Artikel */}
          <button onClick={() => setType("artikel")} title="Artikel" style={{
            width: "34px", height: "34px", minWidth: "34px", minHeight: "34px", borderRadius: "50%",
            border: type === "artikel" ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
            background: type === "artikel" ? "var(--border-strong)" : "var(--bg-recessed)",
            color: type === "artikel" ? "var(--accent)" : "var(--text-disabled)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", WebkitTapHighlightColor: "transparent", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </button>
          {/* Image */}
          <button onClick={() => setType("image")} title="Image" style={{
            width: "34px", height: "34px", minWidth: "34px", minHeight: "34px", borderRadius: "50%",
            border: type === "image" ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
            background: type === "image" ? "var(--border-strong)" : "var(--bg-recessed)",
            color: type === "image" ? "var(--accent)" : "var(--text-disabled)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", WebkitTapHighlightColor: "transparent", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          {/* Video */}
          <button onClick={() => setType("video")} title="Video" style={{
            width: "34px", height: "34px", minWidth: "34px", minHeight: "34px", borderRadius: "50%",
            border: type === "video" ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
            background: type === "video" ? "var(--border-strong)" : "var(--bg-recessed)",
            color: type === "video" ? "var(--accent)" : "var(--text-disabled)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", WebkitTapHighlightColor: "transparent", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Count label */}
      <div style={{ padding: "10px 16px 4px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-disabled)", fontWeight: 500 }}>
          {activeLayout === "list"    && `${LIST_ITEMS.length} konten`}
          {activeLayout === "grid3"   && `${IMAGE_ITEMS.length} konten`}
          {activeLayout === "masonry" && `${VIDEO_ITEMS.length} konten`}
        </span>
      </div>

      {/* ── LIST — text card (X/Twitter, Threads, Artikel teks) ── */}
      {activeLayout === "list" && (
        <div style={{
          padding: "4px 16px calc(80px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: "10px",
        }}>
          {LIST_ITEMS.map((a, i) => {
            const [bg, accent] = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div
                key={a.id}
                onClick={() => setSelectedItem({ kind: "list", data: a, bg, accent })}
                style={{
                  background: "var(--bg-recessed)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg, 14px)",
                  padding: "14px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {/* Title row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <h3 style={{
                    margin: 0,
                    fontFamily: "var(--font-heading)",
                    fontWeight: 700,
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.4,
                    flex: 1,
                  }}>{a.title}</h3>
                  <span style={{
                    fontSize: "10px",
                    color: "var(--text-disabled)",
                    flexShrink: 0,
                    fontFamily: "var(--font-body)",
                    lineHeight: 1.4,
                    paddingTop: "1px",
                  }}>{a.date}</span>
                </div>
                {/* Body preview */}
                <p style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  fontFamily: "var(--font-body)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                } as React.CSSProperties}>{a.body}</p>
                {/* Badges */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 600,
                    padding: "2px 8px", borderRadius: "20px",
                    background: "var(--accent-subtle)", color: "var(--accent)",
                    fontFamily: "var(--font-body)",
                  }}>{a.words} kata</span>
                  <span style={{
                    fontSize: "10px", fontWeight: 600,
                    padding: "2px 8px", borderRadius: "20px",
                    background: "var(--success-subtle)", color: "var(--success)",
                    fontFamily: "var(--font-body)",
                  }}>Selesai</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── GRID3 — 3-column Instagram grid (Facebook, IG Post, Artikel+Gambar) ── */}
      {activeLayout === "grid3" && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: "2px", padding: "2px",
        }}>
          {ARTIKEL_ITEMS.map((a, i) => {
            const [bg, accent] = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div key={a.id} onClick={() => setSelectedItem({ kind: "grid3", data: a, bg, accent })} style={{
                aspectRatio: "1",
                background: bg,
                display: "flex", flexDirection: "column",
                justifyContent: "space-between",
                padding: "10px 8px 8px",
                cursor: "pointer",
                overflow: "hidden",
                position: "relative",
              }}>
                {/* Accent bar */}
                <div style={{ width: "20px", height: "2px", borderRadius: "1px", background: accent, marginBottom: "6px" }} />
                {/* Title */}
                <p style={{
                  margin: 0, fontSize: "9px", fontWeight: 600,
                  color: "var(--text-primary)", lineHeight: 1.4,
                  display: "-webkit-box", WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical", overflow: "hidden",
                  flex: 1,
                } as React.CSSProperties}>
                  {a.title}
                </p>
                {/* Meta */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                  <span style={{ fontSize: "8px", color: accent, fontWeight: 700 }}>{a.words}</span>
                  <span style={{ fontSize: "8px", color: "var(--text-muted)" }}>{a.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── IMAGE — 2-column grid (kept for type toggle) ── */}
      {type === "image" && activeLayout !== "grid3" && activeLayout !== "masonry" && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "3px", padding: "3px",
        }}>
          {IMAGE_ITEMS.map((img, i) => {
            const [bg, accent] = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div key={img.id} onClick={() => setSelectedItem({ kind: "image", data: img, bg, accent })} style={{
                aspectRatio: "1",
                background: bg,
                display: "flex", flexDirection: "column",
                justifyContent: "flex-end",
                padding: "10px",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Image placeholder lines */}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                {/* Gradient overlay */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <p style={{ margin: 0, fontSize: "10px", color: "var(--text-primary)", lineHeight: 1.3, fontWeight: 500,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  } as React.CSSProperties}>{img.prompt}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <span style={{ fontSize: "9px", color: accent, fontWeight: 600 }}>{img.model}</span>
                    <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{img.date}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MASONRY — 2-column 9:16 grid (TikTok, Reels, Shorts) ── */}
      {activeLayout === "masonry" && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "3px", padding: "3px",
        }}>
          {VIDEO_ITEMS.map((vid, i) => {
            const [bg, accent] = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div key={vid.id} onClick={() => setSelectedItem({ kind: "video", data: vid, bg, accent })} style={{
                aspectRatio: "9/16",
                background: bg,
                borderRadius: "8px",
                display: "flex", flexDirection: "column",
                justifyContent: "space-between",
                padding: "12px",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Play icon */}
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {vid.status === "processing" ? (
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%",
                      border: "2px solid var(--border-default)",
                      borderTopColor: accent,
                      animation: "spin 1s linear infinite",
                    }} />
                  ) : (
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%",
                      background: "var(--glass-bg-strong)",
                      border: `1px solid ${accent}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={accent}>
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                  )}
                </div>
                {/* Top: duration */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 700,
                    background: "var(--glass-bg-strong)", color: "var(--text-primary)",
                    padding: "2px 6px", borderRadius: "4px",
                  }}>{vid.duration}</span>
                </div>
                {/* Bottom: title + date */}
                <div>
                  <p style={{
                    margin: "0 0 3px", fontSize: "11px", fontWeight: 700,
                    color: "var(--text-primary)", lineHeight: 1.3,
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  } as React.CSSProperties}>{vid.title}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: 600, padding: "2px 6px", borderRadius: "4px",
                      background: vid.status === "processing" ? "var(--warning-subtle)" : "var(--success-subtle)",
                      color: vid.status === "processing" ? "var(--warning)" : "var(--success)",
                    }}>
                      {vid.status === "processing" ? "Proses..." : "Selesai"}
                    </span>
                    <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{vid.date}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowFab(true)} style={{
        position: "fixed", right: "16px",
        bottom: `calc(60px + env(safe-area-inset-bottom) + 14px)`,
        zIndex: 30,
        width: "48px", height: "48px", borderRadius: "50%",
        background: "var(--accent)", border: "none",
        boxShadow: "var(--shadow-md), 0 0 0 1px var(--accent-subtle)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-primary)", cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* Platform bottom sheet */}
      {showFab && (
        <>
          <div onClick={() => setShowFab(false)} style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "20px 20px 0 0",
            paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 8px)",
          }}>
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--border-strong)" }} />
            </div>
            {/* Title */}
            <div style={{ padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
                Konten
              </span>
              <button onClick={() => setShowFab(false)} style={{
                background: "none", border: "none", color: "var(--text-disabled)", cursor: "pointer",
                padding: "4px", WebkitTapHighlightColor: "transparent",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {/* Platform grid — 3 columns, 1:1 cards */}
            <div style={{ padding: "0 12px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", maxHeight: "55vh", overflowY: "auto" }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => { setSelectedPlatform(p); setShowFab(false); }} style={{
                  aspectRatio: "1",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
                  padding: "0",
                  background: "var(--bg-recessed)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "14px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "12px",
                    background: `${p.accent}18`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: p.accent,
                  }}>
                    {p.icon}
                  </div>
                  <span style={{
                    fontFamily: "var(--font-heading)", fontWeight: 600,
                    fontSize: "10px", color: "var(--text-secondary)",
                    textAlign: "center", lineHeight: 1.3,
                    padding: "0 6px",
                  }}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

    </div>
  );
}
