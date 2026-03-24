"use client";
import { useState } from "react";
import Link from "next/link";

const PLATFORMS = [
  {
    id: "tiktok",
    name: "TikTok",
    desc: "Video & konten short-form",
    color: "#010101",
    accent: "#FE2C55",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/>
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    desc: "Feed, Reels & Stories",
    color: "#833AB4",
    accent: "#E1306C",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5"/>
        <circle cx="12" cy="12" r="5"/>
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: "facebook",
    name: "Facebook",
    desc: "Page, Ads & Audience",
    color: "#1877F2",
    accent: "#1877F2",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.254h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
      </svg>
    ),
  },
  {
    id: "youtube",
    name: "YouTube",
    desc: "Video & channel analytics",
    color: "#FF0000",
    accent: "#FF0000",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  {
    id: "threads",
    name: "Threads",
    desc: "Text & komunitas",
    color: "#000000",
    accent: "#ffffff",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 012.2.068c-.068-.263-.15-.5-.247-.715-.358-.807-.977-1.245-1.928-1.271-1.123-.032-1.955.424-2.48 1.353l-1.71-1.18c.805-1.355 2.16-2.107 3.908-2.107.1 0 .2.002.3.007 1.904.058 3.233.878 3.948 2.435.257.56.436 1.184.535 1.875.71.198 1.36.495 1.937.884.995.677 1.738 1.578 2.164 2.608.716 1.73.64 4.546-1.673 6.797-1.904 1.841-4.168 2.627-7.4 2.649z"/>
      </svg>
    ),
  },
  {
    id: "twitter",
    name: "X / Twitter",
    desc: "Tweet, trends & reach",
    color: "#000000",
    accent: "#ffffff",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.243 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    id: "pinterest",
    name: "Pinterest",
    desc: "Visual discovery & pins",
    color: "#E60023",
    accent: "#E60023",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
      </svg>
    ),
  },
  {
    id: "web",
    name: "Web URL",
    desc: "Website & blog brand",
    color: "var(--accent)",
    accent: "var(--success)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    ),
  },
];

export default function ConnectPage() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--bg-primary)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid var(--glass-border)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}>
        <Link href="/home" style={{
          width: "34px", height: "34px", borderRadius: "50%",
          background: "var(--bg-recessed)",
          border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", textDecoration: "none",
          WebkitTapHighlightColor: "transparent",
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "18px", fontWeight: 800, color: "var(--text-primary)",
            margin: 0, letterSpacing: "-0.02em",
          }}>
            Connect Platform
          </h1>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-disabled)", marginTop: "1px" }}>
            Hubungkan akun untuk data performa real-time
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        margin: "12px 16px",
        padding: "10px 14px",
        background: "var(--border-subtle)",
        border: "1px solid var(--border-strong)",
        borderRadius: "10px",
        fontSize: "12px",
        color: "var(--accent)",
        lineHeight: 1.5,
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Platform yang terhubung akan dianalisa otomatis oleh AI setiap 14 hari untuk menghasilkan insights dan task yang lebih akurat.
      </div>

      {/* Platform list */}
      <div style={{ padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {PLATFORMS.map((p) => {
          const isConnected = connected[p.id];
          return (
            <div key={p.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px",
              background: "var(--bg-recessed)",
              border: `1px solid ${isConnected ? "var(--success-subtle)" : "var(--border-subtle)"}`,
              borderRadius: "12px",
            }}>
              {/* Icon */}
              <div style={{
                width: "42px", height: "42px", borderRadius: "10px",
                background: isConnected ? `${p.accent}18` : "var(--border-subtle)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isConnected ? p.accent : "var(--text-disabled)",
                flexShrink: 0,
              }}>
                {p.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700, fontSize: "14px", color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}>
                  {p.name}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-disabled)", marginTop: "1px" }}>
                  {isConnected ? (
                    <span style={{ color: "var(--success)" }}>● Terhubung</span>
                  ) : p.desc}
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => setConnected(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                style={{
                  height: "32px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: isConnected
                    ? "1px solid var(--danger-subtle)"
                    : "1px solid var(--border-strong)",
                  background: isConnected ? "var(--danger-subtle)" : "var(--glass-border)",
                  color: isConnected ? "var(--danger)" : "var(--accent)",
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                  flexShrink: 0,
                  WebkitTapHighlightColor: "transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {isConnected ? "Putuskan" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
