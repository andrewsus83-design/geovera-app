"use client";
import AppShell from "@/components/shared/AppShell";

/* ══════════════════════════════════════════════════════════════════
   Blank page — AppShell layout demo
   17% sidebar | ~47% center | ~36% right
   Floating submenu bar at bottom
══════════════════════════════════════════════════════════════════ */
export default function BlankPage() {
  return (
    <AppShell
      center={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: 320,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--gv-color-neutral-300)", fontFamily: "var(--gv-font-body)" }}>
            Center column
          </p>
        </div>
      }
      right={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: 320,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--gv-color-neutral-300)", fontFamily: "var(--gv-font-body)" }}>
            Right column
          </p>
        </div>
      }
    />
  );
}
