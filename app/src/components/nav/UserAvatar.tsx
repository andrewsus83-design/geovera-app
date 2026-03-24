"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function UserAvatar() {
  const [initials, setInitials] = useState<string>("?");
  const [waNumber, setWaNumber] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      const email = user.email ?? "";
      const meta = user.user_metadata as Record<string, string> | null;
      const name: string = meta?.full_name ?? meta?.name ?? email;
      setInitials(name.slice(0, 2).toUpperCase() || "GV");
      if (meta?.wa_number) setWaNumber(String(meta.wa_number));
    });
  }, []);

  return (
    <Link href="/home/account" style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
    }}>
      {waNumber && (
        <span style={{
          fontSize: "11px",
          color: "var(--text-disabled)",
          fontFamily: "var(--font-body)",
          maxWidth: "100px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          +{waNumber.replace(/\D/g, "")}
        </span>
      )}
      <div style={{
        width: "34px",
        height: "34px",
        borderRadius: "50%",
        background: "var(--border-strong)",
        border: "1.5px solid var(--border-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--accent)",
          fontFamily: "var(--font-heading)",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}>
          {initials}
        </span>
      </div>
    </Link>
  );
}
