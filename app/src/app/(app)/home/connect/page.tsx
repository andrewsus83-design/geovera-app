"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = "https://vozjwptzutolvkvfpknk.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const EDGE_BASE = `${SUPABASE_URL}/functions/v1/social-connect`;

type LateAccount = {
  id: string;
  platform: string;
  username?: string;
  displayName?: string;
  name?: string;
  status?: string;
};

const PLATFORMS = [
  {
    id: "tiktok",
    name: "TikTok",
    desc: "Video & konten short-form",
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
    accent: "var(--text-primary)",
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
    accent: "var(--text-primary)",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.243 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    desc: "Profesional & B2B",
    accent: "#0A66C2",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    id: "pinterest",
    name: "Pinterest",
    desc: "Visual discovery & pins",
    accent: "#E60023",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
      </svg>
    ),
  },
];

function ConnectPageInner() {
  const searchParams = useSearchParams();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<LateAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Show toast from oauth-done redirect
  useEffect(() => {
    const connected = searchParams.get("connected");
    const err = searchParams.get("error");
    if (connected) setToast(`Platform berhasil terhubung!`);
    if (err) setError(`OAuth gagal: ${err}`);
  }, [searchParams]);

  const refreshStatus = useCallback(async (bid: string, token: string) => {
    try {
      const res = await fetch(`${EDGE_BASE}/status?brand_id=${bid}`, {
        headers: { "Authorization": `Bearer ${token}`, "apikey": ANON_KEY },
      });
      if (res.ok) {
        const data = await res.json() as { accounts?: LateAccount[] };
        setAccounts(data.accounts || []);
      }
    } catch {
      // silently fail — just show empty state
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || ANON_KEY;

        if (!session) {
          setError("Sesi tidak ditemukan. Silakan masuk kembali.");
          return;
        }

        const { data: brand } = await supabase
          .from("brands")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

        if (!brand) {
          setError("Brand tidak ditemukan.");
          return;
        }

        setBrandId(brand.id);
        await refreshStatus(brand.id, token);
      } catch {
        setError("Gagal memuat data koneksi.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [refreshStatus]);

  async function handleConnect(platformId: string) {
    if (!brandId || connecting) return;
    setConnecting(platformId);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || ANON_KEY;
      const redirectUri = `${window.location.origin}/oauth-done`;

      const res = await fetch(
        `${EDGE_BASE}?platform=${platformId}&brand_id=${brandId}&redirect_uri=${encodeURIComponent(redirectUri)}`,
        { headers: { "Authorization": `Bearer ${token}`, "apikey": ANON_KEY } }
      );
      const data = await res.json() as { auth_url?: string; error?: string };

      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setError(data.error || "Gagal mendapatkan link koneksi.");
        setConnecting(null);
      }
    } catch {
      setError("Gagal terhubung ke server.");
      setConnecting(null);
    }
  }

  async function handleDisconnect(platformId: string, accountId: string) {
    if (!brandId || connecting) return;
    setConnecting(platformId);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || ANON_KEY;

      const res = await fetch(
        `${EDGE_BASE}?platform=${platformId}&account_id=${accountId}`,
        { method: "DELETE", headers: { "Authorization": `Bearer ${token}`, "apikey": ANON_KEY } }
      );

      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error || "Gagal memutuskan koneksi.");
      }
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setConnecting(null);
    }
  }

  function getAccount(platformId: string): LateAccount | undefined {
    return accounts.find(a =>
      a.platform === platformId ||
      a.platform?.toLowerCase() === platformId.toLowerCase()
    );
  }

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
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}>
        <Link href="/home" style={{
          width: "40px", height: "40px", minWidth: "40px", minHeight: "40px",
          borderRadius: "50%", padding: 0, boxSizing: "border-box",
          background: "var(--bg-recessed)",
          border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", textDecoration: "none",
          WebkitTapHighlightColor: "transparent",
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Toast success */}
      {toast && (
        <div style={{
          margin: "12px 16px 0",
          padding: "10px 14px",
          background: "var(--success-subtle)",
          border: "1px solid var(--success-subtle)",
          borderRadius: "10px",
          fontSize: "13px", color: "var(--success)",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          margin: "12px 16px 0",
          padding: "10px 14px",
          background: "var(--danger-subtle)",
          border: "1px solid var(--danger-subtle)",
          borderRadius: "10px",
          fontSize: "13px", color: "var(--danger)",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

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
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "50%",
            border: "2px solid var(--border-default)",
            borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite",
          }} />
        </div>
      ) : (
        <div style={{ padding: "4px 16px calc(80px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: "8px" }}>
          {PLATFORMS.map((p) => {
            const account = getAccount(p.id);
            const isConnected = !!account;
            const isBusy = connecting === p.id;

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
                  <div style={{ fontSize: "11px", color: "var(--text-disabled)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isConnected ? (
                      <span style={{ color: "var(--success)" }}>
                        ● {account.username || account.displayName || account.name || "Terhubung"}
                      </span>
                    ) : p.desc}
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => {
                    if (isConnected && account) {
                      handleDisconnect(p.id, account.id);
                    } else {
                      handleConnect(p.id);
                    }
                  }}
                  disabled={isBusy}
                  style={{
                    height: "32px",
                    padding: "0 14px",
                    borderRadius: "8px",
                    border: isConnected
                      ? "1px solid var(--danger-subtle)"
                      : "1px solid var(--border-strong)",
                    background: isConnected ? "var(--danger-subtle)" : "var(--glass-border)",
                    color: isBusy ? "var(--text-disabled)" : isConnected ? "var(--danger)" : "var(--accent)",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: isBusy ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    WebkitTapHighlightColor: "transparent",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    minWidth: "80px",
                    justifyContent: "center",
                  }}
                >
                  {isBusy ? (
                    <div style={{
                      width: "12px", height: "12px", borderRadius: "50%",
                      border: "1.5px solid var(--border-default)",
                      borderTopColor: "var(--accent)",
                      animation: "spin 0.8s linear infinite",
                    }} />
                  ) : null}
                  {isBusy ? "" : isConnected ? "Putuskan" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ConnectPage() {
  return <Suspense fallback={null}><ConnectPageInner /></Suspense>;
}
