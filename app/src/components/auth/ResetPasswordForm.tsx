"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/auth/callback",
    });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  };

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: "var(--gv-color-bg-base)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
    }}>
      <div style={{
        position: "fixed",
        inset: 0,
        background: "var(--gv-color-ai-glow)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div style={{
        width: "100%",
        maxWidth: "440px",
        background: "var(--gv-color-bg-surface)",
        borderRadius: "var(--gv-radius-xl)",
        boxShadow: "var(--gv-shadow-modal)",
        padding: "48px 40px",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: "var(--gv-radius-md)",
            background: "var(--gv-gradient-primary)",
            marginBottom: "16px",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="rgba(255,255,255,0.95)" fillRule="evenodd"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: "22px", fontWeight: 700, color: "var(--gv-color-neutral-900)", margin: "0 0 8px" }}>
            Reset Password
          </h1>
          <p style={{ fontSize: "14px", color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", margin: 0 }}>
            Masukkan email kamu untuk menerima link reset password
          </p>
        </div>

        {sent ? (
          <div style={{ padding: "20px", borderRadius: "var(--gv-radius-md)", background: "var(--gv-color-success-50)", border: "1px solid #6EE7B7", textAlign: "center", marginBottom: "24px" }}>
            <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--gv-color-success-700)", fontFamily: "var(--gv-font-body)", marginBottom: 6 }}>Email terkirim!</p>
            <p style={{ fontSize: "13px", color: "var(--gv-color-success-600)", fontFamily: "var(--gv-font-body)" }}>Cek inbox kamu dan klik link untuk reset password.</p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-danger-50)", border: "1px solid #FECACA", fontSize: "14px", color: "var(--gv-color-danger-700)", fontFamily: "var(--gv-font-body)" }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "var(--gv-color-neutral-700)", marginBottom: "6px", fontFamily: "var(--gv-font-body)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="nama@gmail.com"
                  required
                  style={{ width: "100%", height: "48px", padding: "0 14px", border: "1.5px solid var(--gv-color-neutral-200)", borderRadius: "var(--gv-radius-sm)", fontSize: "15px", fontFamily: "var(--gv-font-body)", color: "var(--gv-color-neutral-900)", background: "white", outline: "none", boxSizing: "border-box" }}
                  onFocus={e => (e.target.style.borderColor = "var(--gv-color-primary-500)")}
                  onBlur={e => (e.target.style.borderColor = "var(--gv-color-neutral-200)")}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", height: "52px", background: loading ? "var(--gv-color-primary-400)" : "var(--gv-color-primary-500)", border: "none", borderRadius: "var(--gv-radius-md)", fontSize: "16px", fontWeight: 600, color: "white", cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--gv-font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {loading ? <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", animation: "gv-spin 0.8s linear infinite" }} /> : null}
                {loading ? "Mengirim…" : "Kirim Link Reset"}
              </button>
            </form>
          </>
        )}

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)" }}>
          <Link href="/signin" style={{ color: "var(--gv-color-primary-500)", fontWeight: 600, textDecoration: "none" }}>
            ← Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
