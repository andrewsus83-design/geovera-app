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
      if (!session?.user) { router.replace("/signin"); return; }
      router.replace("/home");
    });
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "3px solid var(--border-default)",
        borderTopColor: "var(--accent)",
        animation: "spin 0.8s linear infinite",
        marginBottom: 16,
      }} />
      <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
        Memverifikasi akun…
      </p>
    </div>
  );
}
