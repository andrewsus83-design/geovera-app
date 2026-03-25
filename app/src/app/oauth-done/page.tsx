"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * OAuth landing page — Late API redirects here after platform authorization.
 * Immediately forwards back to /home/connect with ?connected=1 or ?error=...
 */
function OAuthDoneInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      router.replace(`/home/connect?error=${encodeURIComponent(error)}`);
    } else {
      router.replace("/home/connect?connected=1");
    }
  }, [router, searchParams]);

  return null;
}

export default function OAuthDonePage() {
  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--bg-primary)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      fontFamily: "var(--font-body)",
      color: "var(--text-primary)",
    }}>
      <Suspense fallback={null}>
        <OAuthDoneInner />
      </Suspense>
      <div style={{
        width: "40px", height: "40px", borderRadius: "50%",
        border: "3px solid var(--border-default)",
        borderTopColor: "var(--accent)",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>
        Menyelesaikan koneksi…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
