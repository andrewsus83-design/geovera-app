"use client";
import Link from "next/link";

export default function PaymentSuccessPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--gv-color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ background: "var(--gv-color-bg-surface)", borderRadius: "var(--gv-radius-xl)", boxShadow: "var(--gv-shadow-modal)", padding: "48px 40px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--gv-color-success-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-success-600)" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 700, color: "var(--gv-color-neutral-900)", margin: "0 0 8px" }}>
            Bukti Pembayaran Diterima!
          </h1>
          <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tim GeoVera akan memverifikasi pembayaran kamu dan mengaktifkan akun dalam 1×24 jam kerja.
          </p>
          <Link
            href="/analytics"
            style={{ display: "block", width: "100%", background: "var(--gv-color-primary-500)", color: "white", borderRadius: "var(--gv-radius-md)", padding: "14px 24px", fontSize: 15, fontWeight: 600, textDecoration: "none", fontFamily: "var(--gv-font-body)" }}
          >
            Ke Dashboard
          </Link>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--gv-color-neutral-400)", marginTop: 16, fontFamily: "var(--gv-font-body)" }}>
          Butuh bantuan? Hubungi <span style={{ fontWeight: 600 }}>support@geovera.xyz</span>
        </p>
      </div>
    </div>
  );
}
