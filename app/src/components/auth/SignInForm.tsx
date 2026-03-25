"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Step = "credentials" | "otp";

// ─── Design tokens (from gv_design_tokens) ───────────────────────────────────
const T = {
  bgPrimary:     "var(--bg-primary)",
  bgRecessed:    "var(--bg-recessed)",
  accent:        "var(--accent)",
  accentHover:   "var(--accent-hover)",
  accentActive:  "var(--accent-active)",
  accentSubtle:  "var(--accent-subtle)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",
  textDisabled:  "var(--text-disabled)",
  borderDefault: "var(--border-default)",
  borderStrong:  "var(--border-strong)",
  danger:        "var(--danger)",
  dangerSubtle:  "var(--danger-subtle)",
  success:       "var(--success)",
  successSubtle: "var(--success-subtle)",
  // typography
  fontHeading:   "var(--font-heading)",
  fontBody:      "var(--font-body)",
  fontMono:      "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  // spacing
  space2: "8px", space3: "12px", space4: "16px", space5: "20px",
  space6: "24px", space8: "32px", space10: "40px", space12: "48px",
  space16: "64px",
  // radius
  radiusMd: "10px",
};

export default function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [brandSlug, setBrandSlug] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandSlug.trim() || !waNumber.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wa-auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug.trim(), wa_number: waNumber.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Gagal kirim OTP"); return; }
      setInfo("Kode OTP dikirim ke WhatsApp kamu.");
      setStep("otp");
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wa-auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug.trim(), wa_number: waNumber.trim(), otp_code: otp.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "OTP salah"); return; }

      const { error: authErr } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "email",
      });
      if (authErr) { setError("Gagal buat sesi: " + authErr.message); return; }

      router.push(data.redirect || "/home");
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100svh",
      width: "100%",
      background: T.bgPrimary,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: `max(${T.space6}, env(safe-area-inset-top)) ${T.space6} max(${T.space6}, env(safe-area-inset-bottom))`,
      fontFamily: T.fontBody,
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: T.space10 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 38 38" fill="none" aria-hidden="true">
              <circle cx="19" cy="19" r="17.5" stroke="#16A34A" strokeWidth="1" strokeDasharray="80 30" strokeDashoffset="10"/>
              <circle cx="19" cy="19" r="9" fill="#090D12" stroke="#1C2535" strokeWidth="1"/>
              <circle cx="19" cy="19" r="3.5" fill="#16A34A"/>
              <line x1="10" y1="19" x2="14.5" y2="19" stroke="#3D5070" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="23.5" y1="19" x2="28" y2="19" stroke="#3D5070" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="19" y1="10" x2="19" y2="14.5" stroke="#3D5070" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="19" y1="23.5" x2="19" y2="28" stroke="#3D5070" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="19" cy="3.5" r="1.5" fill="#16A34A" opacity=".7"/>
              <circle cx="34.5" cy="19" r="1.5" fill="#16A34A" opacity=".4"/>
            </svg>
            <span style={{
              fontFamily: T.fontHeading,
              fontWeight: 800,
              fontSize: "20px",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: T.textPrimary,
            }}>
              Geo<em style={{ fontStyle: "normal", color: "var(--success)" }}>Vera</em>
            </span>
          </a>
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: T.space8 }}>
          <h1 style={{
            fontFamily: T.fontHeading,
            fontSize: "28px",
            fontWeight: 700,
            color: T.textPrimary,
            margin: `0 0 ${T.space3}`,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            {step === "credentials" ? "Masuk ke GeoVera" : "Verifikasi WhatsApp"}
          </h1>
          <p style={{
            fontSize: "16px",
            color: T.textSecondary,
            margin: 0,
            lineHeight: 1.5,
          }}>
            {step === "credentials"
              ? "Gunakan nama brand dan nomor WhatsApp kamu"
              : `Masukkan kode OTP yang dikirim ke +${waNumber.replace(/\D/g, "")}`}
          </p>
        </div>

        {/* Alert: Error */}
        {error && (
          <div style={{
            marginBottom: T.space5,
            padding: `${T.space3} ${T.space4}`,
            background: T.dangerSubtle,
            border: `1px solid var(--danger-subtle)`,
            borderRadius: T.radiusMd,
            fontSize: "14px",
            color: T.danger,
            display: "flex",
            alignItems: "flex-start",
            gap: T.space2,
            lineHeight: 1.5,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px" }}>
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            {error}
          </div>
        )}

        {/* Alert: Info */}
        {info && !error && (
          <div style={{
            marginBottom: T.space5,
            padding: `${T.space3} ${T.space4}`,
            background: T.successSubtle,
            border: `1px solid var(--success-subtle)`,
            borderRadius: T.radiusMd,
            fontSize: "14px",
            color: T.success,
            display: "flex",
            alignItems: "flex-start",
            gap: T.space2,
            lineHeight: 1.5,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px" }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {info}
          </div>
        )}

        {/* Step 1: brand + WA */}
        {step === "credentials" && (
          <form onSubmit={handleSendOtp}>
            <div style={{ display: "flex", flexDirection: "column", gap: T.space5 }}>
              <Field label="Nama Brand" value={brandSlug} onChange={setBrandSlug}
                placeholder="geovera" hint="Nama brand (lowercase, tanpa spasi)" />
              <Field label="Nomor WhatsApp" value={waNumber} onChange={setWaNumber}
                placeholder="628xxxxxxxxx" type="tel" hint="Format internasional, mulai dari 62" />
              <SubmitBtn loading={loading} label="Kirim Kode OTP" loadingLabel="Mengirim…" />
            </div>
          </form>
        )}

        {/* Step 2: OTP */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ display: "flex", flexDirection: "column", gap: T.space5 }}>
              <div>
                <label style={labelStyle}>Kode OTP (6 digit)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  required
                  autoFocus
                  style={{
                    ...inputStyle,
                    textAlign: "center",
                    fontSize: "28px",
                    letterSpacing: "12px",
                    fontWeight: 700,
                    fontFamily: T.fontMono,
                    paddingLeft: "24px",
                  }}
                  onFocus={e => (e.target.style.borderColor = T.accent)}
                  onBlur={e => (e.target.style.borderColor = T.borderStrong)}
                />
              </div>
              <SubmitBtn loading={loading} label="Verifikasi & Masuk" loadingLabel="Memverifikasi…" />
              <button
                type="button"
                onClick={() => { setStep("credentials"); setOtp(""); setError(""); setInfo(""); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: T.textMuted,
                  fontSize: "14px",
                  fontFamily: T.fontBody,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: T.space2,
                  lineHeight: 1.5,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                Ubah nomor / kirim ulang OTP
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <p style={{
          textAlign: "center",
          marginTop: T.space10,
          fontSize: "13px",
          color: T.textDisabled,
          lineHeight: 1.6,
          borderTop: `1px solid ${T.borderDefault}`,
          paddingTop: T.space6,
        }}>
          Hanya pengguna terdaftar yang dapat masuk.<br />
          Hubungi admin untuk mendaftarkan nomor kamu.
        </p>

      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "6px",
  fontFamily: "var(--font-body)",
  letterSpacing: "0.01em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "48px",
  padding: "0 16px",
  border: "1px solid var(--border-strong)",
  borderRadius: "10px",
  fontSize: "16px",
  fontFamily: "var(--font-body)",
  color: "var(--text-primary)",
  background: "var(--bg-recessed)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 150ms",
};

function Field({ label, value, onChange, placeholder, type = "text", hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; hint?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
      />
      {hint && (
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-disabled)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function SubmitBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%",
        height: "48px",
        background: loading ? "var(--accent-active)" : "var(--accent)",
        border: "none",
        borderRadius: "10px",
        fontSize: "15px",
        fontWeight: 600,
        color: "var(--text-primary)",
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--font-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        letterSpacing: "0.01em",
        transition: "background 150ms",
        marginTop: "4px",
      }}
    >
      {loading && (
        <div style={{
          width: 16, height: 16,
          borderRadius: "50%",
          border: "2px solid rgba(241,245,251,0.3)",
          borderTopColor: "var(--text-primary)",
          animation: "spin 0.8s linear infinite",
        }} />
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}
