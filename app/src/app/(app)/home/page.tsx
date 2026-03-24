import Link from "next/link";
import UserAvatar from "@/components/nav/UserAvatar";

export const metadata = { title: "Home — GeoVera" };

const MENUS = [
  {
    href: "/home/brand",
    label: "Brand",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
  {
    href: "/home/connect",
    label: "Connect",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    ),
  },
  {
    href: "/home/billing",
    label: "Billing",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
];

const CHRONICLE = [
  {
    date: "Mar 2026",
    title: "Brand Didaftarkan",
    desc: "Akun brand berhasil dibuat dan diverifikasi oleh admin GeoVera.",
    status: "done",
  },
  {
    date: "Mar 2026",
    title: "Onboarding Selesai",
    desc: "Riset brand, identitas, dan sumber kebenaran (source of truth) telah dianalisa oleh AI.",
    status: "done",
  },
  {
    date: "Mar 2026",
    title: "Social Media Terhubung",
    desc: "Akun Instagram, TikTok, atau Meta Business belum terhubung.",
    status: "pending",
  },
  {
    date: "Segera",
    title: "Konten Pertama Dibuat",
    desc: "Generate artikel, gambar, atau video pertama dari Studio.",
    status: "upcoming",
  },
  {
    date: "Segera",
    title: "Task Cycle Aktif",
    desc: "Siklus 72 jam tasks akan berjalan otomatis setelah sosial media terhubung.",
    status: "upcoming",
  },
];

const statusColor: Record<string, string> = {
  done:     "#22C55E",
  pending:  "#F59E0B",
  upcoming: "#3d4f44",
};

export default function HomePage() {
  return (
    <div style={{
      minHeight: "100svh",
      background: "#080d0b",
      color: "#e8ede9",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "28px 16px 24px",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <p style={{ color: "#3d4f44", fontSize: "11px", margin: "0 0 1px", fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Selamat datang
          </p>
          <h1 style={{
            fontFamily: "Manrope, system-ui, sans-serif",
            fontSize: "24px",
            fontWeight: 800,
            color: "#e8ede9",
            margin: 0,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            Geo<em style={{ fontStyle: "normal", color: "#22C55E" }}>Vera</em>
          </h1>
        </div>
        {/* Header right: logged in + setting + help */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <UserAvatar />
          <Link href="/home/settings" style={{
            width: "34px", height: "34px", borderRadius: "50%",
            background: "#0a100d",
            border: "1px solid rgba(95,122,107,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#3d4f44", textDecoration: "none",
            WebkitTapHighlightColor: "transparent",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </Link>
          <Link href="/home/help" style={{
            width: "34px", height: "34px", borderRadius: "50%",
            background: "#0a100d",
            border: "1px solid rgba(95,122,107,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#3d4f44", textDecoration: "none",
            WebkitTapHighlightColor: "transparent",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </Link>
        </div>
      </div>

      {/* Menu Grid — 3 columns */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px",
        marginBottom: "28px",
        justifyItems: "stretch",
      }}>
        {MENUS.map(({ href, label, icon }) => (
          <Link key={href} href={href} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "14px 8px",
            background: "#0a100d",
            border: "1px solid rgba(95,122,107,0.13)",
            borderRadius: "12px",
            textDecoration: "none",
            color: "inherit",
            WebkitTapHighlightColor: "transparent",
          }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "9px",
              background: "rgba(95,122,107,0.11)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#5f7a6b",
            }}>
              {icon}
            </div>
            <span style={{
              fontFamily: "Manrope, system-ui, sans-serif",
              fontWeight: 600,
              fontSize: "11px",
              color: "#a3b5a9",
              letterSpacing: "0.01em",
              textAlign: "center",
              lineHeight: 1.2,
            }}>
              {label}
            </span>
          </Link>
        ))}
      </div>

      {/* Brand Chronicle */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <h2 style={{
            fontFamily: "Manrope, system-ui, sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            color: "#e8ede9",
            margin: 0,
            letterSpacing: "-0.01em",
          }}>
            Brand Chronicle
          </h2>
          <Link href="/home/chronicle" style={{
            fontSize: "11px",
            color: "#5f7a6b",
            textDecoration: "none",
            fontWeight: 500,
          }}>
            Lihat semua
          </Link>
        </div>

        {/* Timeline */}
        <div style={{ position: "relative", paddingLeft: "20px" }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute",
            left: "6px",
            top: "6px",
            bottom: "6px",
            width: "1px",
            background: "rgba(95,122,107,0.18)",
          }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {CHRONICLE.map((item, i) => (
              <div key={i} style={{
                position: "relative",
                paddingBottom: i < CHRONICLE.length - 1 ? "20px" : "0",
              }}>
                {/* Dot */}
                <div style={{
                  position: "absolute",
                  left: "-17px",
                  top: "4px",
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: statusColor[item.status],
                  border: `2px solid #080d0b`,
                  boxShadow: item.status === "done" ? `0 0 6px ${statusColor[item.status]}60` : "none",
                }} />

                {/* Content */}
                <div style={{
                  background: "#0a100d",
                  border: "1px solid rgba(95,122,107,0.12)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{
                      fontFamily: "Manrope, system-ui, sans-serif",
                      fontWeight: 700,
                      fontSize: "13px",
                      color: item.status === "upcoming" ? "#3d4f44" : "#e8ede9",
                      letterSpacing: "-0.01em",
                    }}>
                      {item.title}
                    </span>
                    <span style={{
                      fontSize: "10px",
                      color: statusColor[item.status],
                      fontWeight: 500,
                      opacity: item.status === "upcoming" ? 0.6 : 1,
                    }}>
                      {item.date}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: "12px",
                    color: item.status === "upcoming" ? "#2a3a2e" : "#6b7f72",
                    lineHeight: 1.5,
                  }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
