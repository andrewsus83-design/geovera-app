"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const desc = params.get("error_description") || oauthError;
      router.replace("/signin?error=" + encodeURIComponent(desc));
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.replace("/signin");
        return;
      }
      // Always go to pricing after login (new flow)
      router.replace("/pricing");
    });
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--gv-color-bg-base)",
      fontFamily: "var(--gv-font-body)",
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "3px solid var(--gv-color-neutral-200)",
        borderTopColor: "var(--gv-color-primary-500)",
        animation: "gv-spin 0.8s linear infinite",
        marginBottom: 16,
      }} />
      <p style={{ color: "var(--gv-color-neutral-500)", fontSize: 15 }}>
        Memverifikasi akun…
      </p>
    </div>
  );
}
