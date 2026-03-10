"use client";
import Link from "next/link";

export default function PaymentSuccessPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        {/* BL07 gv-payment-success */}
        <div style={{ background: "var(--gv-color-bg-surface)", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-xl)", overflow: "hidden", boxShadow: "var(--gv7-depth-2)", textAlign: "center" }}>
          {/* Dark hero */}
          <div style={{ padding: "40px 32px 32px", background: "var(--gv-color-primary-900)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(122,179,171,0.25) 0%, transparent 70%)" }} />
            <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px", position: "relative", zIndex: 1, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid rgba(16,185,129,0.3)", animation: "gv-ss-blink 2s ease-in-out infinite" }} />
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--gv-color-success-500)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(16,185,129,0.4)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: 24, fontWeight: 900, color: "var(--gv-color-bg-surface)", letterSpacing: "-0.04em", marginBottom: 6, position: "relative", zIndex: 1 }}>
              Bukti Pembayaran Diterima!
            </div>
            <div style={{ fontSize: 13, color: "var(--gv-color-primary-200)", lineHeight: 1.6, position: "relative", zIndex: 1 }}>
              Tim GeoVera akan memverifikasi dan mengaktifkan akun kamu
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "24px 32px" }}>
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", marginBottom: 24, lineHeight: 1.6 }}>
              Proses verifikasi membutuhkan waktu <strong style={{ color: "var(--gv-color-neutral-700)" }}>1×24 jam hari kerja</strong>. Kamu akan menerima email konfirmasi saat akun diaktifkan.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Link
                href="/analytics"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gv-gradient-primary)", color: "white", borderRadius: "var(--gv-radius-sm)", padding: "11px 20px", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "var(--gv-font-body)", boxShadow: "0 3px 12px rgba(95,143,139,0.3)" }}
              >
                Ke Dashboard
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--gv-color-neutral-100)", background: "var(--gv-color-bg-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 4.5v3M6 3.5h.01" stroke="var(--gv-color-success-500)" strokeWidth="1.2" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
              Butuh bantuan? <strong style={{ color: "var(--gv-color-neutral-600)" }}>support@geovera.xyz</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
