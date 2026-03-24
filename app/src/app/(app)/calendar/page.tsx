"use client";
import { useState } from "react";

const TABS = [
  {
    id: "reply",
    label: "Reply",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    badge: 5,
    empty: "Tidak ada komentar yang perlu dibalas",
    emptyDesc: "Komentar baru dari social media akan muncul di sini",
    items: [
      { platform: "Instagram", user: "@user_kopi123", comment: "Berapa harga untuk paket bulanan kak?", time: "2 menit lalu", urgent: true },
      { platform: "TikTok", user: "@brandlover_id", comment: "Kontennya bagus banget! Ada collab gak?", time: "15 menit lalu", urgent: false },
      { platform: "Facebook", user: "Rina Sari", comment: "Sudah coba produknya, recommended!", time: "1 jam lalu", urgent: false },
      { platform: "Instagram", user: "@foodie.jakarta", comment: "Bisa dikirim ke Bandung gak?", time: "2 jam lalu", urgent: true },
      { platform: "X / Twitter", user: "@techreview_id", comment: "Review honest, platform ini worth it!", time: "3 jam lalu", urgent: false },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
    badge: 3,
    empty: "Tidak ada konten yang dijadwalkan",
    emptyDesc: "Buat konten dari Studio lalu jadwalkan publikasinya di sini",
    items: [
      { platform: "Instagram", title: "Tips Marketing Digital 2026", type: "Carousel", time: "Hari ini 14:00", status: "scheduled" },
      { platform: "TikTok", title: "Behind the scenes produksi", type: "Video", time: "Besok 09:00", status: "scheduled" },
      { platform: "Facebook", title: "Promo Ramadan Brand Campaign", type: "Gambar", time: "Besok 11:00", status: "draft" },
    ],
  },
  {
    id: "report",
    label: "Report",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    badge: 0,
    empty: "Belum ada laporan yang dibuat",
    emptyDesc: "Laporan performa brand akan digenerate otomatis setiap 14 hari",
    items: [
      { title: "Laporan Mingguan — Maret W4", period: "17–23 Mar 2026", status: "ready", score: 78 },
      { title: "Laporan Mingguan — Maret W3", period: "10–16 Mar 2026", status: "ready", score: 71 },
      { title: "Laporan Bulanan — Februari 2026", period: "Feb 2026", status: "ready", score: 65 },
    ],
  },
  {
    id: "approval",
    label: "Approval",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
    badge: 2,
    empty: "Tidak ada yang menunggu persetujuan",
    emptyDesc: "Konten yang perlu di-approve sebelum dipublikasi akan muncul di sini",
    items: [
      { title: "Artikel: 10 Tren Marketing 2026", type: "Artikel", requestedBy: "AI Content", time: "1 jam lalu", urgent: true },
      { title: "Gambar: Campaign Ramadan 3 variasi", type: "Gambar", requestedBy: "AI Studio", time: "3 jam lalu", urgent: false },
    ],
  },
  {
    id: "news",
    label: "News",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
        <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
      </svg>
    ),
    badge: 4,
    empty: "Tidak ada berita terbaru",
    emptyDesc: "Update platform dan informasi industri akan tampil di sini",
    items: [
      { title: "Instagram update algoritma Reels April 2026", category: "Platform Update", time: "2 jam lalu", important: true },
      { title: "TikTok Shop Indonesia Q2 merchant promo", category: "Peluang", time: "5 jam lalu", important: false },
      { title: "GeoVera: fitur auto-reply aktif untuk semua tier", category: "GeoVera Update", time: "1 hari lalu", important: false },
      { title: "Tren hashtag Indonesia minggu ini", category: "Trend", time: "1 hari lalu", important: false },
    ],
  },
];

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: "#E1306C", TikTok: "#FE2C55", Facebook: "#1877F2",
  "X / Twitter": "#ffffff", YouTube: "#FF0000", Pinterest: "#E60023",
};

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarPage() {
  const [active, setActive] = useState("reply");
  const tab = TABS.find(t => t.id === active)!;

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(today.getMonth());

  const cells = buildCalendar(pickerYear, pickerMonth);

  const fmtDate = (d: Date) =>
    `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

  const isToday = (d: number) =>
    d === today.getDate() && pickerMonth === today.getMonth() && pickerYear === today.getFullYear();

  const isSelected = (d: number) =>
    d === selectedDate.getDate() && pickerMonth === selectedDate.getMonth() && pickerYear === selectedDate.getFullYear();

  return (
    <div style={{ minHeight: "100svh", background: "#080d0b", color: "#e8ede9", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: "24px 16px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{
            fontFamily: "Manrope, system-ui, sans-serif",
            fontSize: "22px", fontWeight: 800, color: "#e8ede9",
            margin: 0, letterSpacing: "-0.02em",
          }}>
            Calendar
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#3d4f44" }}>
            Aktivitas & jadwal brand kamu
          </p>
        </div>
        {/* Selected date chip */}
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "6px 10px", borderRadius: "20px",
          background: "#0a100d", border: "1px solid rgba(95,122,107,0.2)",
          marginTop: "2px",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5f7a6b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#a3c4b5", whiteSpace: "nowrap" }}>
            {fmtDate(selectedDate)}
          </span>
        </div>
      </div>

      {/* Calendar Bottom Sheet Overlay */}
      {showPicker && (
        <>
          <div onClick={() => setShowPicker(false)} style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
            background: "#0d1510",
            border: "1px solid rgba(95,122,107,0.2)",
            borderRadius: "20px 20px 0 0",
            padding: "0 16px calc(60px + env(safe-area-inset-bottom) + 16px)",
          }}>
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(95,122,107,0.3)" }} />
            </div>

            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px 14px" }}>
              <button onClick={() => {
                if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
                else setPickerMonth(m => m - 1);
              }} style={{ background: "none", border: "none", color: "#5f7a6b", cursor: "pointer", padding: "4px 8px", WebkitTapHighlightColor: "transparent" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "15px", color: "#e8ede9" }}>
                {MONTHS[pickerMonth]} {pickerYear}
              </span>
              <button onClick={() => {
                if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
                else setPickerMonth(m => m + 1);
              }} style={{ background: "none", border: "none", color: "#5f7a6b", cursor: "pointer", padding: "4px 8px", WebkitTapHighlightColor: "transparent" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "8px" }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: 600, color: "#3d4f44", padding: "4px 0" }}>{d}</div>
              ))}
            </div>

            {/* Date cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const sel = isSelected(d);
                const tod = isToday(d);
                return (
                  <button key={i} onClick={() => {
                    setSelectedDate(new Date(pickerYear, pickerMonth, d));
                    setShowPicker(false);
                  }} style={{
                    height: "38px", borderRadius: "8px",
                    background: sel ? "#5f7a6b" : tod ? "rgba(95,122,107,0.15)" : "none",
                    border: tod && !sel ? "1px solid rgba(95,122,107,0.3)" : "none",
                    color: sel ? "#e8ede9" : tod ? "#a3c4b5" : "#6b7f72",
                    fontSize: "13px", fontWeight: sel || tod ? 700 : 400,
                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                  }}>
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Today shortcut */}
            <button onClick={() => {
              setSelectedDate(today);
              setPickerMonth(today.getMonth());
              setPickerYear(today.getFullYear());
              setShowPicker(false);
            }} style={{
              width: "100%", height: "40px", marginTop: "14px",
              borderRadius: "10px", border: "1px solid rgba(95,122,107,0.25)",
              background: "rgba(95,122,107,0.08)", color: "#5f7a6b",
              fontSize: "13px", fontWeight: 600, fontFamily: "Inter, sans-serif",
              cursor: "pointer", WebkitTapHighlightColor: "transparent",
            }}>
              Hari Ini
            </button>
          </div>
        </>
      )}

      {/* FAB — floating calendar button */}
      <button onClick={() => setShowPicker(true)} style={{
        position: "fixed",
        right: "16px",
        bottom: `calc(60px + env(safe-area-inset-bottom) + 14px)`,
        zIndex: 30,
        width: "48px", height: "48px", borderRadius: "50%",
        background: "#5f7a6b",
        border: "none",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(95,122,107,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#e8ede9", cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/>
        </svg>
      </button>

      {/* Tabs — horizontal scroll */}
      <div style={{
        display: "flex", gap: "6px",
        padding: "14px 16px 0",
        overflowX: "auto", scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        {TABS.map(t => {
          const isActive = t.id === active;
          return (
            <button key={t.id} onClick={() => setActive(t.id)} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 12px",
              borderRadius: "20px",
              border: isActive ? "1px solid rgba(95,122,107,0.4)" : "1px solid rgba(95,122,107,0.13)",
              background: isActive ? "rgba(95,122,107,0.15)" : "#0a100d",
              color: isActive ? "#a3c4b5" : "#3d4f44",
              fontSize: "13px", fontWeight: isActive ? 600 : 400,
              fontFamily: "Inter, system-ui, sans-serif",
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
              transition: "all 150ms",
            }}>
              {t.icon}
              {t.label}
              {t.badge > 0 && (
                <span style={{
                  minWidth: "18px", height: "18px", borderRadius: "9px",
                  background: isActive ? "#5f7a6b" : "rgba(95,122,107,0.25)",
                  color: isActive ? "#e8ede9" : "#5f7a6b",
                  fontSize: "11px", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "rgba(95,122,107,0.1)", margin: "12px 0 0" }} />

      {/* Content */}
      <div style={{ padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>

        {/* REPLY */}
        {active === "reply" && tab.items.map((item: Record<string, unknown>, i) => (
          <div key={i} style={{
            background: "#0a100d",
            border: `1px solid ${item.urgent ? "rgba(248,113,113,0.2)" : "rgba(95,122,107,0.13)"}`,
            borderRadius: "12px", padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px",
                background: `${PLATFORM_COLOR[item.platform as string] || "#5f7a6b"}18`,
                color: PLATFORM_COLOR[item.platform as string] || "#5f7a6b",
              }}>{item.platform as string}</span>
              <span style={{ fontSize: "10px", color: "#3d4f44", marginLeft: "auto" }}>{item.time as string}</span>
              {!!item.urgent && <span style={{ fontSize: "10px", color: "#f87171", fontWeight: 600 }}>Urgent</span>}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7f72", marginBottom: "4px" }}>{item.user as string}</div>
            <div style={{ fontSize: "13px", color: "#e8ede9", lineHeight: 1.5, marginBottom: "10px" }}>"{item.comment as string}"</div>
            <button style={{
              height: "30px", padding: "0 14px", borderRadius: "8px",
              border: "1px solid rgba(95,122,107,0.3)", background: "rgba(95,122,107,0.1)",
              color: "#5f7a6b", fontSize: "12px", fontWeight: 600,
              fontFamily: "Inter, system-ui, sans-serif", cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}>Balas</button>
          </div>
        ))}

        {/* PUBLISH */}
        {active === "publish" && tab.items.map((item: Record<string, unknown>, i) => (
          <div key={i} style={{
            background: "#0a100d", border: "1px solid rgba(95,122,107,0.13)",
            borderRadius: "12px", padding: "12px 14px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "9px", flexShrink: 0,
              background: `${PLATFORM_COLOR[item.platform as string] || "#5f7a6b"}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: PLATFORM_COLOR[item.platform as string] || "#5f7a6b",
              fontSize: "11px", fontWeight: 700,
            }}>
              {(item.platform as string).slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "13px", color: "#e8ede9", marginBottom: "2px" }}>
                {item.title as string}
              </div>
              <div style={{ fontSize: "11px", color: "#3d4f44" }}>{item.type as string} · {item.time as string}</div>
            </div>
            <span style={{
              fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "20px",
              background: item.status === "scheduled" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
              color: item.status === "scheduled" ? "#22C55E" : "#F59E0B",
              flexShrink: 0,
            }}>
              {item.status === "scheduled" ? "Terjadwal" : "Draft"}
            </span>
          </div>
        ))}

        {/* REPORT */}
        {active === "report" && tab.items.map((item: Record<string, unknown>, i) => (
          <div key={i} style={{
            background: "#0a100d", border: "1px solid rgba(95,122,107,0.13)",
            borderRadius: "12px", padding: "14px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "10px", flexShrink: 0,
              background: "rgba(95,122,107,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "16px", color: "#5f7a6b",
            }}>
              {item.score as number}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "13px", color: "#e8ede9", marginBottom: "2px" }}>
                {item.title as string}
              </div>
              <div style={{ fontSize: "11px", color: "#3d4f44" }}>{item.period as string}</div>
            </div>
            <button style={{
              height: "30px", padding: "0 12px", borderRadius: "8px",
              border: "1px solid rgba(95,122,107,0.3)", background: "rgba(95,122,107,0.1)",
              color: "#5f7a6b", fontSize: "12px", fontWeight: 600,
              fontFamily: "Inter, system-ui, sans-serif", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", flexShrink: 0,
            }}>Lihat</button>
          </div>
        ))}

        {/* APPROVAL */}
        {active === "approval" && tab.items.map((item: Record<string, unknown>, i) => (
          <div key={i} style={{
            background: "#0a100d",
            border: `1px solid ${item.urgent ? "rgba(248,113,113,0.2)" : "rgba(95,122,107,0.13)"}`,
            borderRadius: "12px", padding: "14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px",
                background: "rgba(95,122,107,0.12)", color: "#5f7a6b",
              }}>{item.type as string}</span>
              {!!item.urgent && <span style={{ fontSize: "10px", color: "#f87171", fontWeight: 600 }}>Urgent</span>}
              <span style={{ fontSize: "10px", color: "#3d4f44", marginLeft: "auto" }}>{item.time as string}</span>
            </div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "13px", color: "#e8ede9", marginBottom: "4px" }}>
              {item.title as string}
            </div>
            <div style={{ fontSize: "11px", color: "#3d4f44", marginBottom: "12px" }}>Diminta oleh: {item.requestedBy as string}</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{
                flex: 1, height: "32px", borderRadius: "8px",
                border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)",
                color: "#22C55E", fontSize: "12px", fontWeight: 600,
                fontFamily: "Inter, system-ui, sans-serif", cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}>Approve</button>
              <button style={{
                flex: 1, height: "32px", borderRadius: "8px",
                border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)",
                color: "#f87171", fontSize: "12px", fontWeight: 600,
                fontFamily: "Inter, system-ui, sans-serif", cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}>Tolak</button>
            </div>
          </div>
        ))}

        {/* NEWS */}
        {active === "news" && tab.items.map((item: Record<string, unknown>, i) => (
          <div key={i} style={{
            background: "#0a100d",
            border: `1px solid ${item.important ? "rgba(95,122,107,0.25)" : "rgba(95,122,107,0.1)"}`,
            borderRadius: "12px", padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px",
                background: "rgba(95,122,107,0.1)", color: "#5f7a6b",
              }}>{item.category as string}</span>
              <span style={{ fontSize: "10px", color: "#3d4f44", marginLeft: "auto" }}>{item.time as string}</span>
            </div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "13px", color: "#e8ede9", lineHeight: 1.4 }}>
              {item.title as string}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
