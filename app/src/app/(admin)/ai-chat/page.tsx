"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import AppShell from "@/components/shared/AppShell";
import { supabase } from "@/lib/supabase";

/* ── Types ── */
interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  message: string;
  conversation_type?: string;
  created_at: string;
}

/* ── Models ── */
const MODELS = [
  { id: "gpt-4o",           name: "GPT-4o",         desc: "Insight Synthesis — OpenAI",     dot: "gpt"    },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet", desc: "Deep Analysis — Anthropic",      dot: "claude" },
  { id: "perplexity",       name: "Perplexity Pro",  desc: "External Reality Engine",        dot: "perp"   },
];

const DOT_COLORS: Record<string, string> = {
  gpt:    "var(--gv-color-success-500)",
  claude: "var(--gv-color-warning-500)",
  perp:   "var(--gv-color-info-500)",
};

/* ── Suggestion chips ── */
const CHIPS = [
  { label: "Apa itu GEO?" },
  { label: "Audit Website" },
  { label: "AI Authority Score" },
  { label: "Dashboard Signal" },
  { label: "Competitor Gap" },
];

/* ── Quick actions for empty state ── */
const QUICK_ACTIONS = [
  { title: "Audit Signal",   sub: "Cek score L0–L3",  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { title: "AI Search Gap",  sub: "Temukan peluang",   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> },
  { title: "Authority Score",sub: "Bangun kepercayaan",icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
  { title: "Content Matrix", sub: "Strategi konten AI",icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg> },
];

/* ════════════════════════════════════════════════
   Chat Center Column
════════════════════════════════════════════════ */
function ChatCenter({
  messages,
  isTyping,
  input,
  onInputChange,
  onSend,
  onChipClick,
  model,
  charCount,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onChipClick: (label: string) => void;
  model: string;
  charCount: number;
}) {
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Scroll to bottom on new messages */
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  /* Auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const modelObj = MODELS.find((m) => m.id === model) ?? MODELS[0];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const [copied, setCopied] = useState<string | null>(null);
  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── C01: Chat Header ── */}
      <div style={{
        flexShrink: 0,
        padding: "14px 20px",
        background: "var(--gv-color-glass-bg, rgba(255,255,255,0.72))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--gv-color-neutral-100)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        {/* Avatar with online dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "var(--gv-gradient-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "white",
            fontFamily: "var(--gv-font-heading)",
          }}>GV</div>
          <div style={{
            position: "absolute", bottom: 1, right: 1,
            width: 9, height: 9, borderRadius: "50%",
            background: "var(--gv-color-success-500)",
            border: "2px solid var(--gv-color-bg-surface, white)",
          }} />
        </div>

        {/* Name + model */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-heading)", lineHeight: 1.2 }}>
            GeoVera AI
          </div>
          <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-mono)", marginTop: 1 }}>
            {modelObj.name} · Online
          </div>
        </div>

        {/* Action buttons */}
        {[
          <svg key="search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
          <svg key="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
        ].map((icon, i) => (
          <button key={i} style={{
            width: 32, height: 32, borderRadius: "var(--gv-radius-sm, 8px)",
            border: "1px solid var(--gv-color-neutral-200)",
            background: "var(--gv-color-bg-surface)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--gv-color-neutral-500)", cursor: "pointer",
          }}>{icon}</button>
        ))}
      </div>

      {/* ── Thread area ── */}
      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 0" }}>

        {/* C10: Empty state */}
        {messages.length === 0 && !isTyping && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 40, paddingBottom: 24 }}>
            {/* Orb */}
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "var(--gv-gradient-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 24, position: "relative",
              animation: "gv-float 3s ease-in-out infinite",
            }}>
              <div style={{
                position: "absolute", inset: -8, borderRadius: "50%",
                border: "2px solid var(--gv-color-primary-200)",
                animation: "gv-pulse-ring 2.5s ease-out infinite",
              }} />
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="32" height="32">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>

            <h2 style={{ fontFamily: "var(--gv-font-heading)", fontSize: 22, fontWeight: 900, color: "var(--gv-color-neutral-900)", letterSpacing: "-0.03em", marginBottom: 8 }}>
              Selamat datang di GeoVera AI
            </h2>
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-body)", lineHeight: 1.7, maxWidth: 380, marginBottom: 32 }}>
              Tanyakan apa saja tentang SEO, GEO, dan Social Discovery. Saya akan membantu bisnis kamu <strong style={{ color: "var(--gv-color-neutral-700)" }}>Own the Algorithm</strong>.
            </p>

            {/* C10: Quick actions 2×2 grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 440 }}>
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.title}
                  onClick={() => onChipClick(qa.title)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    padding: "16px 16px", borderRadius: "var(--gv-radius-md, 12px)",
                    border: "1.5px solid var(--gv-color-neutral-200)",
                    background: "var(--gv-color-bg-surface)",
                    cursor: "pointer", textAlign: "left", gap: 8,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-300)";
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-primary-50)";
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)";
                    (e.currentTarget as HTMLElement).style.background = "var(--gv-color-bg-surface)";
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  }}
                >
                  <span style={{ color: "var(--gv-color-primary-500)", display: "flex" }}>{qa.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-body)" }}>{qa.title}</div>
                    <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>{qa.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* C02: Chat bubbles */}
        {messages.map((msg) => {
          const isAI = msg.role === "assistant";
          const time = new Date(msg.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={msg.id} style={{
              display: "flex",
              flexDirection: isAI ? "row" : "row-reverse",
              gap: 10,
              marginBottom: 20,
              alignItems: "flex-start",
            }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: isAI ? "var(--gv-gradient-primary)" : "var(--gv-color-primary-100)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                color: isAI ? "white" : "var(--gv-color-primary-700)",
                fontFamily: "var(--gv-font-heading)",
              }}>
                {isAI ? "GV" : "U"}
              </div>

              <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Bubble */}
                <div style={{
                  padding: "12px 16px",
                  borderRadius: isAI
                    ? "4px 12px 12px 12px"
                    : "12px 4px 12px 12px",
                  background: isAI
                    ? "var(--gv-color-bg-surface)"
                    : "var(--gv-gradient-primary)",
                  boxShadow: isAI ? "0 2px 8px rgba(31,36,40,0.08)" : "0 2px 12px rgba(95,143,139,0.25)",
                  border: isAI ? "1px solid var(--gv-color-neutral-100)" : "none",
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: isAI ? "var(--gv-color-neutral-800)" : "white",
                  fontFamily: "var(--gv-font-body)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.message}
                </div>

                {/* Meta */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, color: "var(--gv-color-neutral-400)",
                  justifyContent: isAI ? "flex-start" : "flex-end",
                }}>
                  <span>{time}</span>
                  {isAI && <><span>·</span><span style={{ fontFamily: "var(--gv-font-mono)" }}>{modelObj.name}</span></>}
                  {!isAI && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-400)" strokeWidth="2.5" width="12" height="12">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                  )}
                </div>

                {/* C08: Feedback actions — AI only */}
                {isAI && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    {[
                      { label: "Copy",       action: () => handleCopy(msg.message, msg.id), icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>, active: copied === msg.id },
                      { label: "Helpful",    action: () => {},                               icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg> },
                      { label: "Not Helpful",action: () => {},                               icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg> },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        title={btn.label}
                        onClick={btn.action}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 8px", borderRadius: "var(--gv-radius-xs, 6px)",
                          border: "1px solid var(--gv-color-neutral-200)",
                          background: btn.active ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
                          color: btn.active ? "var(--gv-color-primary-600)" : "var(--gv-color-neutral-500)",
                          fontSize: 11, cursor: "pointer", fontFamily: "var(--gv-font-body)",
                          transition: "all 0.12s ease",
                        }}
                      >
                        {btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* C03: Typing indicator */}
        {isTyping && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "flex-start" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "var(--gv-gradient-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white", fontFamily: "var(--gv-font-heading)", flexShrink: 0,
            }}>GV</div>
            <div style={{
              padding: "12px 16px", borderRadius: "4px 12px 12px 12px",
              background: "var(--gv-color-bg-surface)",
              border: "1px solid var(--gv-color-neutral-100)",
              boxShadow: "0 2px 8px rgba(31,36,40,0.08)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "var(--gv-color-primary-400)",
                    animation: `gv-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)" }}>
                GeoVera AI sedang mengetik…
              </span>
            </div>
          </div>
        )}

        {/* Bottom padding */}
        <div style={{ height: 16 }} />
      </div>

      {/* ── C05: Suggestion chips (only when no messages) ── */}
      {messages.length === 0 && (
        <div style={{
          flexShrink: 0, padding: "8px 20px 4px",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-body)", flexShrink: 0 }}>
            Saran:
          </span>
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => onChipClick(chip.label)}
              style={{
                padding: "5px 12px", borderRadius: "var(--gv-radius-full, 999px)",
                border: "1.5px solid var(--gv-color-neutral-200)",
                background: "var(--gv-color-bg-surface)",
                fontSize: 12, color: "var(--gv-color-neutral-700)",
                fontFamily: "var(--gv-font-body)", cursor: "pointer",
                transition: "all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-primary-400)";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-primary-600)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--gv-color-neutral-200)";
                (e.currentTarget as HTMLElement).style.color = "var(--gv-color-neutral-700)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* ── C04: Chat input ── */}
      <div style={{
        flexShrink: 0, padding: "12px 20px 16px",
        borderTop: messages.length > 0 ? "1px solid var(--gv-color-neutral-100)" : "none",
      }}>
        <div style={{
          borderRadius: "var(--gv-radius-xl, 20px)",
          border: "1.5px solid var(--gv-color-neutral-200)",
          background: "var(--gv-color-bg-surface)",
          overflow: "hidden",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
          onFocus={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "var(--gv-color-primary-400)";
            el.style.boxShadow = "0 0 0 3px var(--gv-color-primary-50)";
          }}
          onBlur={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "var(--gv-color-neutral-200)";
            el.style.boxShadow = "none";
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 14px" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tanya GeoVera AI…"
              rows={1}
              maxLength={4000}
              style={{
                flex: 1, resize: "none", border: "none", outline: "none",
                background: "transparent", fontSize: 14, lineHeight: 1.6,
                color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-body)",
                minHeight: 22, maxHeight: 160, overflow: "auto",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {/* Attach */}
              <button style={{
                width: 30, height: 30, borderRadius: "var(--gv-radius-sm, 8px)",
                border: "1px solid var(--gv-color-neutral-200)",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--gv-color-neutral-400)",
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 0 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.47"/></svg>
              </button>
              {/* Send */}
              <button
                onClick={onSend}
                disabled={!input.trim()}
                style={{
                  width: 34, height: 34, borderRadius: "var(--gv-radius-sm, 8px)",
                  background: input.trim() ? "var(--gv-gradient-primary)" : "var(--gv-color-neutral-200)",
                  border: "none", cursor: input.trim() ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", transition: "opacity 0.15s",
                  boxShadow: input.trim() ? "0 3px 10px rgba(95,143,139,0.35)" : "none",
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15"><path d="M22 2L11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 14px 8px",
            borderTop: "1px solid var(--gv-color-neutral-100)",
          }}>
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--gv-font-body)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              Shift + Enter untuk baris baru
            </span>
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-mono)" }}>
              {charCount} / 4000
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   Chat Right Column
════════════════════════════════════════════════ */
function ChatRight({
  sessions,
  activeSessionId,
  onSessionClick,
  onNewChat,
  model,
  onModelChange,
  modelOpen,
  setModelOpen,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onNewChat: () => void;
  model: string;
  onModelChange: (id: string) => void;
  modelOpen: boolean;
  setModelOpen: (v: boolean) => void;
}) {
  const modelObj = MODELS.find((m) => m.id === model) ?? MODELS[0];

  /* Group sessions by date */
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const todaySessions    = sessions.filter((s) => new Date(s.created_at).toDateString() === today);
  const yesterdaySessions = sessions.filter((s) => new Date(s.created_at).toDateString() === yesterday);
  const olderSessions    = sessions.filter((s) => {
    const d = new Date(s.created_at).toDateString();
    return d !== today && d !== yesterday;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "16px 16px 16px 0" }}>

      {/* ── C06: Model Selector ── */}
      <div style={{ flexShrink: 0, marginBottom: 16, position: "relative" }}>
        <div style={{
          borderRadius: "var(--gv-radius-md, 12px)",
          border: "1.5px solid var(--gv-color-neutral-200)",
          background: "var(--gv-color-bg-surface)",
          overflow: "hidden",
        }}>
          {/* Trigger */}
          <button
            onClick={() => setModelOpen(!modelOpen)}
            style={{
              width: "100%", padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 10,
              background: "transparent", border: "none", cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: "var(--gv-radius-sm, 8px)",
              background: "var(--gv-color-primary-50)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--gv-color-primary-500)", flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-body)" }}>{modelObj.name}</div>
              <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>{modelObj.desc}</div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: "var(--gv-color-success-50)", color: "var(--gv-color-success-600)",
              flexShrink: 0,
            }}>Active</div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14"
              style={{ color: "var(--gv-color-neutral-400)", transform: modelOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          {/* Dropdown */}
          {modelOpen && (
            <div style={{ borderTop: "1px solid var(--gv-color-neutral-100)" }}>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                  style={{
                    width: "100%", padding: "9px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    background: m.id === model ? "var(--gv-color-primary-50)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: DOT_COLORS[m.dot] ?? "var(--gv-color-neutral-400)",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-body)" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 1 }}>{m.desc}</div>
                  </div>
                  {m.id === model && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-primary-500)" strokeWidth="2.5" width="14" height="14">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── C09: Chat History Sidebar ── */}
      <div style={{
        flex: 1, overflowY: "auto",
        borderRadius: "var(--gv-radius-md, 12px)",
        border: "1.5px solid var(--gv-color-neutral-200)",
        background: "var(--gv-color-bg-surface)",
        display: "flex", flexDirection: "column",
        padding: "12px",
        gap: 4,
      }}>
        {/* New conversation */}
        <button
          onClick={onNewChat}
          style={{
            width: "100%", padding: "9px 12px",
            borderRadius: "var(--gv-radius-sm, 8px)",
            border: "1.5px dashed var(--gv-color-neutral-300)",
            background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            color: "var(--gv-color-primary-500)", fontSize: 13, fontFamily: "var(--gv-font-body)", fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
          New Conversation
        </button>

        {/* Session list */}
        {sessions.length === 0 && (
          <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--gv-color-neutral-400)", fontSize: 12, fontFamily: "var(--gv-font-body)" }}>
            Belum ada percakapan
          </div>
        )}

        {[
          { label: "Today",     list: todaySessions },
          { label: "Yesterday", list: yesterdaySessions },
          { label: "Older",     list: olderSessions },
        ].map(({ label, list }) => list.length > 0 && (
          <div key={label}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              color: "var(--gv-color-neutral-400)", fontFamily: "var(--gv-font-mono)",
              padding: "6px 6px 4px", marginTop: 4,
            }}>{label}</div>
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => onSessionClick(s.id)}
                style={{
                  width: "100%", padding: "8px 10px",
                  borderRadius: "var(--gv-radius-sm, 8px)",
                  border: "none", cursor: "pointer", textAlign: "left",
                  background: s.id === activeSessionId ? "var(--gv-color-primary-50)" : "transparent",
                  display: "flex", alignItems: "flex-start", gap: 8,
                  marginBottom: 2,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
                  style={{ color: s.id === activeSessionId ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)", marginTop: 2, flexShrink: 0 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, fontFamily: "var(--gv-font-body)",
                    color: s.id === activeSessionId ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-800)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    lineHeight: 1.3,
                  }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>
                    {s.message_count} pesan
                  </div>
                </div>
                {s.id === activeSessionId && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px",
                    borderRadius: 4, background: "var(--gv-color-primary-100)",
                    color: "var(--gv-color-primary-600)", flexShrink: 0,
                  }}>
                    {s.message_count}
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   Main Page
════════════════════════════════════════════════ */
export default function AIChatPage() {
  const [sessions, setSessions]       = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [isTyping, setIsTyping]       = useState(false);
  const [model, setModel]             = useState(MODELS[0].id);
  const [modelOpen, setModelOpen]     = useState(false);
  const [brandId, setBrandId]         = useState<string | null>(null);

  /* Load user + brand profile */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: brand } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();
      if (brand) setBrandId(brand.id);
    })();
  }, []);

  /* Load chat sessions */
  const loadSessions = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from("gv_ai_chat_sessions")
      .select("id, title, message_count, created_at, updated_at")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) setSessions(data);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  /* Load messages for active session */
  const loadMessages = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("gv_ai_conversations")
      .select("id, role, message, conversation_type, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as ChatMessage[]);
  }, []);

  const handleSessionClick = useCallback((id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    loadMessages(id);
  }, [loadMessages]);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !brandId) return;

    /* Optimistically add user message */
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsTyping(false); return; }

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          brand_id: brandId,
          session_id: activeSessionId ?? undefined,
          message: text,
          chat_mode: "general",
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      /* Update active session from response */
      if (data?.session_id && !activeSessionId) {
        setActiveSessionId(data.session_id);
        loadSessions();
      }

      /* Reload messages from DB (to get persisted IDs) */
      const targetSession = data?.session_id ?? activeSessionId;
      if (targetSession) await loadMessages(targetSession);

    } catch (err) {
      console.error("AI chat error:", err);
      /* Show error message */
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        message: "Maaf, terjadi kesalahan. Silakan coba lagi.",
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, brandId, activeSessionId, loadMessages, loadSessions]);

  const handleChipClick = useCallback((label: string) => {
    setInput(label);
  }, []);

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes gv-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-7px); }
        }
        @keyframes gv-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gv-pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <AppShell
        center={
          <ChatCenter
            messages={messages}
            isTyping={isTyping}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onChipClick={handleChipClick}
            model={model}
            charCount={input.length}
          />
        }
        right={
          <ChatRight
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
            onNewChat={handleNewChat}
            model={model}
            onModelChange={setModel}
            modelOpen={modelOpen}
            setModelOpen={setModelOpen}
          />
        }
      />
    </>
  );
}
