"use client";
import Link from "next/link";

export default function PaymentFailedPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl)", overflow: "hidden", boxShadow: "var(--gv7-depth-2)", textAlign: "center" }}>
          {/* Hero */}
          <div style={{ padding: "40px 32px 32px", background: "var(--gv-color-primary-900)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.12) 0%, transparent 70%)" }} />
            <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px", position: "relative", zIndex: 1, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--gv-color-danger-500)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(239,68,68,0.4)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 24, fontWeight: 900, color: "var(--gv-color-bg-surface)", letterSpacing: "-0.04em", marginBottom: 6, position: "relative", zIndex: 1 }}>
              Pembayaran Gagal
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, position: "relative", zIndex: 1 }}>
              Pembayaran tidak dapat diselesaikan
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "24px 32px" }}>
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", marginBottom: 24, lineHeight: 1.6 }}>
              Terjadi kesalahan saat memproses pembayaran kamu. Silakan coba lagi atau hubungi tim support kami.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Link
                href="/pricing"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gv-gradient-primary)", color: "white", borderRadius: "var(--gv-radius-sm)", padding: "11px 20px", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "var(--gv-font-body)", boxShadow: "0 3px 12px rgba(95,143,139,0.3)" }}
              >
                Coba Lagi
              </Link>
              <Link
                href="/analytics"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gv-color-bg-surface)", color: "var(--gv-color-neutral-700)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", padding: "11px 20px", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "var(--gv-font-body)" }}
              >
                Dashboard
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--gv-color-neutral-100)", background: "var(--gv-color-bg-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
              Butuh bantuan? <strong style={{ color: "var(--gv-color-neutral-600)" }}>support@geovera.xyz</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
