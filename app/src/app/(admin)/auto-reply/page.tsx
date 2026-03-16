"use client";
import { useState, CSSProperties } from "react";
import AppShell from "@/components/shared/AppShell";
import { supabase } from "@/lib/supabase";

/* ── Mock data ── */
const MOCK_COMMENTS = [
  { id: "c1", plat: "ig",  user: "@marina_shop",   time: "2m ago",  txt: "Berapa harga untuk paket premium? Ada diskon ga?",                         unread: true  },
  { id: "c2", plat: "tt",  user: "@rifki.digital",  time: "5m ago",  txt: "Wah kontennya bagus banget! Bisa collab gak?",                              unread: true  },
  { id: "c3", plat: "ig",  user: "@store_bunda",    time: "12m ago", txt: "Min, produknya tersedia di Shopee juga gak?",                               unread: false },
  { id: "c4", plat: "yt",  user: "Budi Santoso",   time: "18m ago", txt: "Tutorial-nya sangat membantu, terima kasih!",                               unread: false },
  { id: "c5", plat: "tt",  user: "@cindy.creates",  time: "24m ago", txt: "Sound apa yang kamu pakai di video ini? Fire banget!",                      unread: false },
  { id: "c6", plat: "ig",  user: "@toko_online99",  time: "31m ago", txt: "Reseller boleh? Minimum order berapa?",                                     unread: false },
];
const MOCK_RULES = [
  { id: "r1", name: "Greeting Auto Reply",   keywords: ["halo","hai","hi","hello"],                   action: "Balas dengan sapaan ramah + link produk",   platforms: ["ig","tt"], active: true  },
  { id: "r2", name: "Price Inquiry",         keywords: ["harga","price","berapa","cost"],             action: "Kirim price list + link pemesanan",          platforms: ["ig","yt"], active: true  },
  { id: "r3", name: "Reseller Inquiry",      keywords: ["reseller","distributor","agen","dropship"],  action: "Arahkan ke halaman reseller",                platforms: ["ig"],      active: false },
  { id: "r4", name: "Thank You Reply",       keywords: ["makasih","thanks","terima kasih","bagus"],   action: "Balas terima kasih + follow CTA",           platforms: ["ig","tt","yt"], active: true },
];
const TONE_OPTIONS = [
  { key: "professional", icon: "💼", name: "Professional",   desc: "Formal dan tepercaya" },
  { key: "friendly",     icon: "😊", name: "Friendly",       desc: "Hangat dan ramah" },
  { key: "casual",       icon: "✌️", name: "Casual",         desc: "Santai dan relatable" },
  { key: "energetic",    icon: "⚡", name: "Energetic",      desc: "Bersemangat dan motivatif" },
  { key: "empathetic",   icon: "🤝", name: "Empathetic",     desc: "Penuh pengertian" },
  { key: "witty",        icon: "🎯", name: "Witty",          desc: "Cerdas dan menghibur" },
];
const PLATFORMS_SETTING = [
  { key: "ig",  name: "Instagram",  account: "@brand_official",       connected: true  },
  { key: "tt",  name: "TikTok",     account: "@brand.tiktok",         connected: true  },
  { key: "yt",  name: "YouTube",    account: "Brand Channel",         connected: false },
  { key: "fb",  name: "Facebook",   account: "Brand Facebook Page",   connected: false },
];
const AI_TEMPLATES = [
  { cat: "Greeting",    txt: "Halo! Terima kasih sudah menghubungi kami 😊 Ada yang bisa kami bantu?" },
  { cat: "Price",       txt: "Untuk info harga lengkap, silakan cek link di bio ya! 🛍️" },
  { cat: "Thank You",   txt: "Makasih banyak udah support kami! 🙏 Jangan lupa share ke teman-teman ya!" },
  { cat: "Collab",      txt: "Haii! Untuk kolaborasi, DM kami ya dengan detail proposal kamu 🤝" },
];
const LOG_ITEMS = [
  { plat: "ig", user: "@toko_rina", action: "Auto-replied to price inquiry", time: "3m ago" },
  { plat: "tt", user: "@budi23",    action: "Auto-replied with greeting",    time: "7m ago" },
  { plat: "ig", user: "@shop_nia",  action: "Auto-replied to reseller DM",  time: "12m ago"},
  { plat: "yt", user: "Deni W.",    action: "Auto-replied to thank you",    time: "19m ago"},
];

/* ── Token helpers ── */
const platColor: Record<string, { bg: string; fg: string; label: string }> = {
  ig: { bg: "var(--gv-color-error-50)",   fg: "var(--gv-color-error-700)",   label: "IG"  },
  tt: { bg: "var(--gv-color-success-50)", fg: "var(--gv-color-success-800)", label: "TT"  },
  yt: { bg: "var(--gv-color-error-50)",   fg: "var(--gv-color-error-800)",   label: "YT"  },
  fb: { bg: "var(--gv-color-primary-50)", fg: "var(--gv-color-primary-700)", label: "FB"  },
};

/* ── Shared micro-components ── */
function PlatBadge({ plat }: { plat: string }) {
  const c = platColor[plat] ?? platColor.ig;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: "var(--gv-radius-full)",
      background: c.bg, color: c.fg,
      fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 800,
      letterSpacing: "0.04em", flexShrink: 0,
    }}>{c.label}</span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: "relative", width: 34, height: 18, borderRadius: "var(--gv-radius-full)",
        border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
        background: on ? "var(--gv-gradient-primary)" : "var(--gv-color-neutral-200)",
        transition: "background var(--gv-duration-fast) var(--gv-easing-default)",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 19 : 3,
        width: 12, height: 12, borderRadius: "50%",
        background: on ? "var(--gv-color-bg-surface)" : "var(--gv-color-neutral-400)",
        transition: "left var(--gv-duration-fast) var(--gv-easing-spring)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </button>
  );
}

function StatCard({ val, lbl }: { val: string; lbl: string }) {
  return (
    <div style={{
      background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
      borderRadius: "var(--gv-radius-md)", padding: "14px 16px",
    }}>
      <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", lineHeight: 1 }}>{val}</div>
      <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600, color: "var(--gv-color-neutral-400)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>{lbl}</div>
    </div>
  );
}

function BarRow({ label, val, max, plat }: { label: string; val: number; max: number; plat?: string }) {
  const c = plat ? platColor[plat] : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      {plat && <PlatBadge plat={plat} />}
      {!plat && <span style={{ width: 80, fontSize: 11, color: "var(--gv-color-neutral-600)", fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
      <div style={{ flex: 1, height: 6, borderRadius: "var(--gv-radius-full)", background: "var(--gv-color-neutral-100)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${(val / max) * 100}%`, borderRadius: "var(--gv-radius-full)",
          background: c ? c.fg : "var(--gv-gradient-primary)", transition: "width 0.6s var(--gv-easing-spring)",
        }} />
      </div>
      <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-500)", width: 28, textAlign: "right", flexShrink: 0 }}>{val}</span>
    </div>
  );
}

/* ────────────────────────────────────────────
   MANUAL REPLY — Center
──────────────────────────────────────────── */
function ManualCenter() {
  const [filter, setFilter]         = useState("all");
  const [selected, setSelected]     = useState("c1");
  const [replyText, setReplyText]   = useState("");
  const [charCount, setCharCount]   = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [sending, setSending]       = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const MAX_CHARS = 280;

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const callSmartReply = async (payload: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    const { data, error } = await supabase.functions.invoke("smart-reply-handler", {
      body: payload,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const handleSuggest = async (tone: string) => {
    const c = MOCK_COMMENTS.find(x => x.id === selected);
    if (!c) return;
    setSuggesting(true);
    try {
      const res = await callSmartReply({
        action: "suggest",
        comment_text: c.txt,
        comment_user: c.user,
        platform: c.plat,
        tone,
      });
      setReplyText(res.reply ?? "");
      setCharCount((res.reply ?? "").length);
    } catch (err) {
      showToast("Gagal generate reply, coba lagi.", false);
      console.error(err);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSend = async () => {
    const c = MOCK_COMMENTS.find(x => x.id === selected);
    if (!c || !replyText.trim()) return;
    setSending(true);
    try {
      await callSmartReply({
        action: "send",
        comment_text: c.txt,
        comment_user: c.user,
        platform: c.plat,
        reply_text: replyText,
      });
      showToast("Reply terkirim!", true);
      setReplyText("");
      setCharCount(0);
    } catch (err) {
      showToast("Gagal mengirim reply, coba lagi.", false);
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const filters = [
    { key: "all",     label: "All (12)"    },
    { key: "ig",      label: "Instagram"   },
    { key: "tt",      label: "TikTok"      },
    { key: "yt",      label: "YouTube"     },
    { key: "unread",  label: "Unread (2)"  },
  ];

  const visible = filter === "all" ? MOCK_COMMENTS
    : filter === "unread" ? MOCK_COMMENTS.filter(c => c.unread)
    : MOCK_COMMENTS.filter(c => c.plat === filter);

  const selComment = MOCK_COMMENTS.find(c => c.id === selected);

  const filterPill = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center",
    padding: "5px 12px", borderRadius: "var(--gv-radius-full)",
    fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.04em", textTransform: "uppercase",
    cursor: "pointer", flexShrink: 0,
    background: active ? "var(--gv-gradient-primary)" : "var(--gv-color-bg-surface)",
    color: active ? "var(--gv-color-bg-surface)" : "var(--gv-color-neutral-500)",
    border: `1px solid ${active ? "transparent" : "var(--gv-color-neutral-200)"}`,
    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
  } as CSSProperties);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 100, padding: "10px 18px", borderRadius: "var(--gv-radius-full)",
          background: toast.ok ? "var(--gv-color-success-50)" : "var(--gv-color-error-50)",
          border: `1px solid ${toast.ok ? "var(--gv-color-success-200)" : "var(--gv-color-error-200)"}`,
          color: toast.ok ? "var(--gv-color-success-700)" : "var(--gv-color-error-700)",
          fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          boxShadow: "var(--gv-shadow-md)",
          animation: "gv-float-in 0.3s var(--gv-easing-spring) both",
          pointerEvents: "none",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-2xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.02em", marginBottom: 2 }}>
          Manual Reply
        </h1>
        <p style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", marginBottom: 14 }}>
          Respond to comments with AI suggestions
        </p>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 16, borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
          {filters.map(f => (
            <button key={f.key} style={filterPill(filter === f.key)} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue label */}
      <div style={{ padding: "12px 24px 6px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Comment Queue
        </span>
        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 600, color: "var(--gv-color-neutral-400)" }}>
          {visible.length} comments
        </span>
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px", scrollbarWidth: "none" }}>
        {visible.map(c => (
          <div
            key={c.id}
            onClick={() => setSelected(c.id)}
            style={{
              display: "flex", gap: 12, padding: "12px 14px",
              borderRadius: "var(--gv-radius-md)", marginBottom: 4, cursor: "pointer",
              background: selected === c.id ? "var(--gv-color-primary-50)" : "transparent",
              borderLeft: selected === c.id ? `3px solid var(--gv-color-primary-500)` : "3px solid transparent",
              transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
            }}
          >
            <PlatBadge plat={c.plat} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: "var(--gv-color-neutral-900)" }}>{c.user}</span>
                {c.unread && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gv-color-primary-500)", flexShrink: 0 }} />}
                <span style={{ marginLeft: "auto", fontFamily: "var(--gv-font-mono)", fontSize: 10, color: "var(--gv-color-neutral-400)", flexShrink: 0 }}>{c.time}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--gv-color-neutral-600)", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.txt}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      {selComment && (
        <div style={{
          flexShrink: 0, padding: 20, borderTop: "1px solid var(--gv-color-neutral-200)",
          background: "var(--gv-color-bg-surface)",
        }}>
          {/* To line */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.06em", textTransform: "uppercase", width: 28, flexShrink: 0 }}>To</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PlatBadge plat={selComment.plat} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-800)" }}>{selComment.user}</span>
            </div>
          </div>

          {/* AI tone buttons */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
            {["professional","friendly","casual","empathetic"].map(tone => (
              <button key={tone} disabled={suggesting} style={{
                padding: "5px 12px", borderRadius: "var(--gv-radius-full)",
                border: "1px solid var(--gv-color-neutral-200)", background: "transparent",
                fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600,
                color: "var(--gv-color-neutral-500)", cursor: suggesting ? "not-allowed" : "pointer", flexShrink: 0,
                letterSpacing: "0.03em",
                transition: "all var(--gv-duration-fast)",
                opacity: suggesting ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (!suggesting) {
                  (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)";
                  (e.currentTarget as HTMLElement).style.color = "var(--gv-color-primary-600)";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-200)";
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)";
              }}
              onClick={() => handleSuggest(tone)}>
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </button>
            ))}
            <button disabled={suggesting} style={{
              padding: "5px 14px", borderRadius: "var(--gv-radius-full)",
              border: "none", background: "var(--gv-gradient-primary)",
              fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700,
              color: "var(--gv-color-bg-surface)", cursor: suggesting ? "not-allowed" : "pointer", flexShrink: 0,
              letterSpacing: "0.04em", opacity: suggesting ? 0.7 : 1,
            }}
            onClick={() => handleSuggest("friendly")}>
              {suggesting ? "Generating…" : "✨ AI Suggest"}
            </button>
          </div>

          {/* Textarea */}
          <textarea
            value={replyText}
            onChange={e => { setReplyText(e.target.value); setCharCount(e.target.value.length); }}
            placeholder="Tulis balasan atau gunakan AI Suggest..."
            rows={3}
            style={{
              width: "100%", resize: "none", outline: "none",
              padding: "10px 12px", borderRadius: "var(--gv-radius-md)",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-base)",
              fontSize: 13, color: "var(--gv-color-neutral-800)",
              fontFamily: "var(--gv-font-body)", lineHeight: 1.6,
              transition: "border-color var(--gv-duration-fast), box-shadow var(--gv-duration-fast)",
              boxSizing: "border-box",
            }}
            onFocus={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-400)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 3px var(--gv-color-primary-100)";
            }}
            onBlur={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          />

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{
              fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600,
              color: charCount > MAX_CHARS * 0.9 ? "var(--gv-color-warning-600)" : "var(--gv-color-neutral-400)",
            }}>
              {charCount}/{MAX_CHARS}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setReplyText(""); setCharCount(0); }} style={{
                padding: "8px 16px", borderRadius: "var(--gv-radius-md)",
                border: "1px solid var(--gv-color-neutral-200)", background: "transparent",
                fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-600)", cursor: "pointer",
              }}>
                Clear
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                style={{
                  padding: "8px 20px", borderRadius: "var(--gv-radius-md)",
                  border: "none", background: "var(--gv-gradient-primary)",
                  fontSize: 12, fontWeight: 700, color: "var(--gv-color-bg-surface)",
                  cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
                  boxShadow: "0 3px 12px rgba(95,143,139,0.35)",
                  opacity: sending || !replyText.trim() ? 0.6 : 1,
                  transition: "opacity var(--gv-duration-fast)",
                }}
              >
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   MANUAL REPLY — Right
──────────────────────────────────────────── */
function ManualRight() {
  return (
    <div style={{ padding: "20px 20px 100px" }}>
      {/* Stats grid 2×2 */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Today's Stats</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <StatCard val="47" lbl="Total Comments" />
        <StatCard val="31" lbl="Replied" />
        <StatCard val="16" lbl="Pending" />
        <StatCard val="66%" lbl="Response Rate" />
      </div>

      {/* Per-platform bars */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>By Platform</p>
      <div style={{ background: "var(--gv-color-bg-surface)", borderRadius: "var(--gv-radius-md)", padding: "14px 16px", marginBottom: 20, border: "1px solid var(--gv-color-neutral-100)" }}>
        <BarRow label="Instagram" val={24} max={50} plat="ig" />
        <BarRow label="TikTok" val={18} max={50} plat="tt" />
        <BarRow label="YouTube" val={5} max={50} plat="yt" />
      </div>

      {/* AI Templates */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Quick Templates</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AI_TEMPLATES.map((t, i) => (
          <div key={i} style={{
            background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
            borderRadius: "var(--gv-radius-md)", padding: "10px 14px", cursor: "pointer",
            borderLeft: "3px solid var(--gv-color-primary-300)",
            transition: "all var(--gv-duration-fast)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)"; (e.currentTarget as HTMLElement).style.borderLeftColor = "var(--gv-color-primary-500)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--gv-color-bg-surface)"; (e.currentTarget as HTMLElement).style.borderLeftColor = "var(--gv-color-primary-300)"; }}
          >
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-primary-600)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.cat}</span>
            <p style={{ fontSize: 12, color: "var(--gv-color-neutral-600)", lineHeight: 1.5, marginTop: 4 }}>{t.txt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   AUTO REPLY — Center
──────────────────────────────────────────── */
function AutoCenter() {
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [rules, setRules]             = useState(MOCK_RULES);

  const toggleRule = (id: string) =>
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", flexShrink: 0, borderBottom: "1px solid var(--gv-color-neutral-100)" }}>
        <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-2xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.02em", marginBottom: 2 }}>
          Auto Reply
        </h1>
        <p style={{ fontSize: 13, color: "var(--gv-color-neutral-500)" }}>
          Automated keyword-triggered responses
        </p>
      </div>

      {/* Auto enable status card */}
      <div style={{ margin: "16px 24px 0", flexShrink: 0, background: autoEnabled ? "var(--gv-color-success-50)" : "var(--gv-color-neutral-50)", border: `1px solid ${autoEnabled ? "var(--gv-color-success-200)" : "var(--gv-color-neutral-200)"}`, borderRadius: "var(--gv-radius-lg)", padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: autoEnabled ? "var(--gv-color-success-500)" : "var(--gv-color-neutral-300)",
              boxShadow: autoEnabled ? "0 0 0 3px var(--gv-color-success-100)" : "none",
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: autoEnabled ? "var(--gv-color-success-800)" : "var(--gv-color-neutral-600)" }}>
              {autoEnabled ? "Auto Reply Active" : "Auto Reply Paused"}
            </span>
          </div>
          <Toggle on={autoEnabled} onChange={() => setAutoEnabled(v => !v)} />
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[{ val: "124", lbl: "Replied Today" }, { val: "98%", lbl: "Accuracy" }, { val: "2.1s", lbl: "Avg Response" }].map(s => (
            <div key={s.lbl} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-lg)", fontWeight: 800, color: autoEnabled ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-500)" }}>{s.val}</div>
              <div style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 600, color: "var(--gv-color-neutral-400)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules header */}
      <div style={{ padding: "16px 24px 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Reply Rules ({rules.length})</span>
        <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 600, color: "var(--gv-color-success-600)" }}>{rules.filter(r => r.active).length} active</span>
      </div>

      {/* Rules list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px", scrollbarWidth: "none" }}>
        {rules.map(rule => (
          <div key={rule.id} style={{
            background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
            borderRadius: "var(--gv-radius-md)", padding: "14px 16px", marginBottom: 8,
            opacity: rule.active ? 1 : 0.6,
            transition: "opacity var(--gv-duration-fast)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)" }}>{rule.name}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {rule.platforms.map(p => <PlatBadge key={p} plat={p} />)}
                </div>
              </div>
              <Toggle on={rule.active} onChange={() => toggleRule(rule.id)} />
            </div>

            {/* Keywords */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {rule.keywords.map(kw => (
                <span key={kw} style={{
                  padding: "3px 8px", borderRadius: "var(--gv-radius-full)",
                  background: "var(--gv-color-primary-50)", color: "var(--gv-color-primary-700)",
                  fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 600,
                  border: "1px solid var(--gv-color-primary-100)",
                }}>{kw}</span>
              ))}
            </div>

            {/* Preview */}
            <div style={{ borderLeft: "2px solid var(--gv-color-primary-300)", paddingLeft: 10 }}>
              <p style={{ fontSize: 11, color: "var(--gv-color-neutral-600)", lineHeight: 1.5, margin: 0 }}>{rule.action}</p>
            </div>
          </div>
        ))}

        {/* Add rule CTA */}
        <button style={{
          width: "100%", padding: "14px", borderRadius: "var(--gv-radius-md)",
          border: "2px dashed var(--gv-color-neutral-200)", background: "transparent",
          fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-500)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "all var(--gv-duration-fast)",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-300)";
          (e.currentTarget as HTMLElement).style.color = "var(--gv-color-primary-600)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)";
          (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-500)";
        }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Add New Rule
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   AUTO REPLY — Right
──────────────────────────────────────────── */
function AutoRight() {
  return (
    <div style={{ padding: "20px 20px 100px" }}>
      {/* Performance */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Performance (7d)</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <StatCard val="867" lbl="Auto Replies" />
        <StatCard val="94%" lbl="Accuracy" />
        <StatCard val="1.8s" lbl="Avg Response" />
        <StatCard val="4" lbl="Rules Active" />
      </div>

      {/* Rule triggers */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Rule Triggers Today</p>
      <div style={{ background: "var(--gv-color-bg-surface)", borderRadius: "var(--gv-radius-md)", padding: "14px 16px", marginBottom: 20, border: "1px solid var(--gv-color-neutral-100)" }}>
        <BarRow label="Greeting"    val={52} max={100} />
        <BarRow label="Price"       val={38} max={100} />
        <BarRow label="Thank You"   val={27} max={100} />
        <BarRow label="Reseller"    val={7}  max={100} />
      </div>

      {/* Activity log */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Activity Log</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {LOG_ITEMS.map((log, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
            borderRadius: "var(--gv-radius-md)", padding: "10px 12px",
          }}>
            <PlatBadge plat={log.plat} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-800)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.user}</p>
              <p style={{ fontSize: 10, color: "var(--gv-color-neutral-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.action}</p>
            </div>
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, color: "var(--gv-color-neutral-400)", flexShrink: 0 }}>{log.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   SETTING — Center
──────────────────────────────────────────── */
function SettingCenter() {
  const [platforms, setPlatforms] = useState(PLATFORMS_SETTING);
  const [activeTone, setActiveTone] = useState("friendly");
  const [limits, setLimits] = useState({ perHour: 30, perDay: 200, delayMin: 5 });

  const togglePlatform = (key: string) =>
    setPlatforms(prev => prev.map(p => p.key === key ? { ...p, connected: !p.connected } : p));

  return (
    <div style={{ overflowY: "auto", height: "100%", scrollbarWidth: "none" }}>
      <div style={{ padding: "20px 24px 100px" }}>
        {/* Header */}
        <h1 style={{ fontFamily: "var(--gv-font-heading)", fontSize: "var(--gv-font-size-2xl)", fontWeight: 800, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.02em", marginBottom: 2 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "var(--gv-color-neutral-500)", marginBottom: 24 }}>
          Configure platforms, AI tone, and reply limits
        </p>

        {/* Platform connections */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Platform Connections</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {platforms.map(p => {
              const c = platColor[p.key] ?? platColor.ig;
              return (
                <div key={p.key} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
                  borderRadius: "var(--gv-radius-md)", padding: "14px 16px",
                }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: "var(--gv-radius-md)",
                    background: c.bg, color: c.fg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 800, flexShrink: 0,
                  }}>{c.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", marginBottom: 2 }}>{p.name}</p>
                    <p style={{ fontSize: 11, color: "var(--gv-color-neutral-500)" }}>{p.account}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: "var(--gv-radius-full)",
                      fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      background: p.connected ? "var(--gv-color-success-50)" : "var(--gv-color-neutral-100)",
                      color: p.connected ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-400)",
                    }}>{p.connected ? "Connected" : "Disconnected"}</span>
                    <Toggle on={p.connected} onChange={() => togglePlatform(p.key)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Tone */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>AI Reply Tone</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {TONE_OPTIONS.map(tone => {
              const active = activeTone === tone.key;
              return (
                <button key={tone.key} onClick={() => setActiveTone(tone.key)} style={{
                  padding: "14px 12px", borderRadius: "var(--gv-radius-md)", cursor: "pointer",
                  border: `2px solid ${active ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-200)"}`,
                  background: active ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
                  textAlign: "center", transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                }}>
                  <div style={{ fontSize: 20, lineHeight: 1, marginBottom: 6 }}>{tone.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-800)", marginBottom: 3 }}>{tone.name}</div>
                  <div style={{ fontSize: 10, color: "var(--gv-color-neutral-400)", lineHeight: 1.4 }}>{tone.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Limits */}
        <div>
          <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Reply Limits & Schedule</p>
          <div style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-md)", overflow: "hidden" }}>
            {[
              { key: "perHour", label: "Max replies per hour", max: 100 },
              { key: "perDay",  label: "Max replies per day",  max: 500 },
              { key: "delayMin",label: "Min delay between replies (sec)", max: 60 },
            ].map((item, idx) => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", gap: 16, padding: "14px 16px",
                borderTop: idx > 0 ? "1px solid var(--gv-color-neutral-100)" : "none",
              }}>
                <span style={{ flex: 1, fontSize: 13, color: "var(--gv-color-neutral-700)" }}>{item.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min={1} max={item.max}
                    value={limits[item.key as keyof typeof limits]}
                    onChange={e => setLimits(prev => ({ ...prev, [item.key]: +e.target.value }))}
                    style={{ width: 100, accentColor: "var(--gv-color-primary-500)" }}
                  />
                  <span style={{
                    fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700,
                    color: "var(--gv-color-primary-600)", width: 36, textAlign: "right",
                  }}>
                    {limits[item.key as keyof typeof limits]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   SETTING — Right
──────────────────────────────────────────── */
function SettingRight() {
  return (
    <div style={{ padding: "20px 20px 100px" }}>
      {/* System status */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>System Status</p>
      <div style={{ background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)", borderRadius: "var(--gv-radius-md)", padding: "14px 16px", marginBottom: 20 }}>
        {[
          { label: "AI Engine",     status: "Operational" },
          { label: "Comment Sync",  status: "Operational" },
          { label: "Rate Limiter",  status: "Operational" },
          { label: "Queue Worker",  status: "Idle"        },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: i < 3 ? 10 : 0, marginBottom: i < 3 ? 10 : 0, borderBottom: i < 3 ? "1px solid var(--gv-color-neutral-100)" : "none" }}>
            <span style={{ fontSize: 12, color: "var(--gv-color-neutral-700)" }}>{s.label}</span>
            <span style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700,
              color: s.status === "Operational" ? "var(--gv-color-success-700)" : "var(--gv-color-neutral-400)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "Operational" ? "var(--gv-color-success-500)" : "var(--gv-color-neutral-300)", flexShrink: 0 }} />
              {s.status}
            </span>
          </div>
        ))}
      </div>

      {/* Platform health */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Platform Health</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {[
          { plat: "ig", label: "Instagram",  health: 98 },
          { plat: "tt", label: "TikTok",     health: 96 },
        ].map(p => (
          <div key={p.plat} style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--gv-color-bg-surface)", border: "1px solid var(--gv-color-neutral-100)",
            borderRadius: "var(--gv-radius-md)", padding: "10px 14px",
          }}>
            <PlatBadge plat={p.plat} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-800)" }}>{p.label}</span>
            <span style={{
              fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 800,
              color: "var(--gv-color-success-700)",
            }}>{p.health}%</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 9, fontWeight: 700, color: "var(--gv-color-neutral-400)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Quick Actions</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { label: "Test Auto Reply",   desc: "Send a test comment trigger" },
          { label: "Sync Comments",     desc: "Force refresh comment queue" },
          { label: "Export Reply Log",  desc: "Download CSV of all replies" },
          { label: "Reset Statistics",  desc: "Clear today's counters" },
        ].map((a, i) => (
          <button key={i} style={{
            width: "100%", textAlign: "left", padding: "10px 14px",
            borderRadius: "var(--gv-radius-md)", border: "1px solid var(--gv-color-neutral-200)",
            background: "var(--gv-color-bg-surface)", cursor: "pointer",
            transition: "all var(--gv-duration-fast)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-200)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--gv-color-bg-surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)"; }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-800)", marginBottom: 2 }}>{a.label}</p>
            <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)" }}>{a.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   Page root
──────────────────────────────────────────── */
export default function AutoReplyPage() {
  const [activeTab, setActiveTab] = useState("Manual Reply");

  const centerMap: Record<string, React.ReactNode> = {
    "Manual Reply": <ManualCenter />,
    "Auto Reply":   <AutoCenter />,
    "Setting":      <SettingCenter />,
  };
  const rightMap: Record<string, React.ReactNode> = {
    "Manual Reply": <ManualRight />,
    "Auto Reply":   <AutoRight />,
    "Setting":      <SettingRight />,
  };

  return (
    <AppShell
      activeSubItem={activeTab}
      onSubMenuChange={(_, tab) => setActiveTab(tab)}
      center={centerMap[activeTab] ?? null}
      right={rightMap[activeTab] ?? null}
    />
  );
}
