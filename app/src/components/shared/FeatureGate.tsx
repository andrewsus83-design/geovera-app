"use client";

interface FeatureGateProps {
  enabled: boolean;
  featureName: string;
  children: React.ReactNode;
}

export default function FeatureGate({ enabled, featureName, children }: FeatureGateProps) {
  if (enabled) return <>{children}</>;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 400 }}>
      {/* Blurred preview */}
      <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: 0.4 }}>
        {children}
      </div>
      {/* Lock overlay */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "rgba(var(--gv-color-bg-base-rgb, 248,250,252), 0.85)",
        backdropFilter: "blur(2px)",
        borderRadius: "var(--gv-radius-lg, 16px)",
        gap: 16,
        textAlign: "center",
        padding: 32,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--gv-color-neutral-100, #F1F5F9)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--gv-color-neutral-400,#94A3B8)" strokeWidth="1.5"/>
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--gv-color-neutral-400,#94A3B8)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div style={{
            fontFamily: "var(--gv-font-heading, sans-serif)",
            fontSize: 16, fontWeight: 700,
            color: "var(--gv-color-neutral-800, #1E293B)",
            marginBottom: 6,
          }}>
            {featureName} tidak tersedia
          </div>
          <div style={{
            fontFamily: "var(--gv-font-body, sans-serif)",
            fontSize: 13,
            color: "var(--gv-color-neutral-500, #64748B)",
            maxWidth: 280,
            lineHeight: 1.5,
          }}>
            Fitur ini tidak aktif pada plan kamu saat ini. Hubungi admin untuk upgrade plan.
          </div>
        </div>
      </div>
    </div>
  );
}
