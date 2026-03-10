"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import AppShell from "@/components/shared/AppShell";

// ── DS v5.8 Smart Reply color tokens ─────────────────────────────────────────
const SR = {
  manual: "#7C3AED",  manual50: "#F5F3FF",  manual100: "#EDE9FE",
  manualGrad: "linear-gradient(135deg,#7C3AED,#A78BFA)",
  auto: "#5F8F8B",    auto50: "#EDF5F4",
  grad: "linear-gradient(135deg,#5F8F8B,#7AB3AB)",
  pos: "#10B981",  pos50: "#ECFDF3",  pos700: "#047857",
  neg: "#EF4444",  neg50: "#FEF2F2",  neg700: "#B91C1C",
  neu: "#6B7280",  neu50: "#F9FAFB",  neu700: "#374151",
  que: "#3B82F6",  que50: "#EFF6FF",  que700: "#1D4ED8",
  com: "#F59E0B",  com50: "#FFFBEB",  com700: "#B45309",
  n900: "#1F2428", n700: "#4A545B",  n500: "#6B7280",
  n400: "#9CA3AF", n300: "#D1D5DB",  n200: "#E5E7EB",
  n100: "#F3F4F6", n50:  "#F9FAFB",
  bg: "#FFFFFF",   bgEl: "#FAFBFC",  bgSunk: "#EFF2F4",
  warn50: "#FFFBEB", warn500: "#F59E0B", warn700: "#B45309",
  succ50: "#ECFDF3", succ500: "#10B981", succ700: "#047857",
  danger50: "#FEF2F2", danger700: "#B91C1C",
  shadow: "0 2px 12px rgba(31,36,40,.06)",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface AttentionItem {
  id: string; platform: string; commenter_username: string;
  comment_text: string; classification: string; sentiment: string;
  urgency: string; ai_suggestion: string | null; is_read: boolean;
  created_at: string;
}
interface QueueItem {
  id: string; platform: string; commenter_username: string;
  comment_text: string; ai_reply_draft: string | null;
  weight: number; profile_tier: string; profile_score: number;
  status: string; created_at: string;
}
interface HistoryItem {
  id: string; platform: string; commenter_username: string;
  comment_text: string; ai_reply_draft: string | null; sent_at: string | null;
  type: "auto" | "manual";
}
interface Stats {
  attention_pending: number; queue_pending: number;
  total_sent: number; sent_today: number;
  attention_resolved: number; resolved_today: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function initials(name: string) { return (name ?? "?").slice(0, 2).toUpperCase(); }
function pLabel(p: string) { return (p ?? "IG").toUpperCase().slice(0, 2); }

const SENT_TAG: Record<string, { bg: string; color: string; label: string }> = {
  positive:  { bg: SR.pos50, color: SR.pos700, label: "Positive" },
  negative:  { bg: SR.neg50, color: SR.neg700, label: "Negative" },
  neutral:   { bg: SR.neu50, color: SR.neu700, label: "Neutral" },
  question:  { bg: SR.que50, color: SR.que700, label: "Question" },
  complaint: { bg: SR.com50, color: SR.com700, label: "Complaint" },
  praise:    { bg: "#F0FDF4",color: "#15803D", label: "Praise" },
  intent:    { bg: "#FFF7ED",color: "#C2410C", label: "Intent" },
};
function getTag(s: string) { return SENT_TAG[s?.toLowerCase()] ?? SENT_TAG.neutral; }

const URGENCY_C: Record<string, string> = {
  high: SR.neg, medium: SR.com, normal: SR.neu, low: SR.neu,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function NlpChip({ label, s }: { label: string; s: string }) {
  const t = getTag(s);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 9999,
      background: t.bg, color: t.color,
      fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.color }} />
      {label || t.label}
    </span>
  );
}

function PlatformBadge({ p }: { p: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, fontFamily: "Inter, sans-serif",
      padding: "2px 5px", borderRadius: 9999,
      background: SR.n100, color: SR.n500, textTransform: "uppercase",
    }}>
      {pLabel(p)}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6,
      background: SR.grad,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 800, color: "white",
      fontFamily: "Manrope, sans-serif", flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

// ── SR01 Header ───────────────────────────────────────────────────────────────
function SRHeader({
  stats, syncing, onSync, onSendAll, sending,
}: {
  stats: Stats | null; syncing: boolean; onSync: () => void;
  onSendAll: () => void; sending: boolean;
}) {
  const totalPending = (stats?.attention_pending ?? 0) + (stats?.queue_pending ?? 0);
  const responseRate = stats && stats.total_sent + (stats.attention_pending ?? 0) > 0
    ? Math.round(stats.total_sent / (stats.total_sent + totalPending) * 100) : 0;

  return (
    <div style={{
      padding: "24px", borderRadius: 24,
      background: SR.n900, position: "relative", overflow: "hidden", marginBottom: 16,
    }}>
      {/* gradient glows */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse at 20% 50%,rgba(124,58,237,.18) 0%,transparent 55%),
                     radial-gradient(ellipse at 80% 30%,rgba(95,143,139,.15) 0%,transparent 50%)`,
      }} />
      {/* top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, position: "relative", zIndex: 1 }}>
        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 600, color: "rgba(167,139,250,.85)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Smart Reply — AI Comment Engine
          </div>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-0.02em" }}>
            Reply Dashboard
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.45)", marginTop: 4 }}>
            Auto-classify · NLP routing · AI drafts
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onSync} disabled={syncing} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: 9999, fontSize: 14, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer",
            background: SR.manualGrad, color: "white", border: "none",
            boxShadow: "0 3px 12px rgba(124,58,237,.35)", opacity: syncing ? 0.7 : 1,
            fontFamily: "Inter, sans-serif",
          }}>
            {syncing ? "Syncing…" : "↻ Sync Comments"}
          </button>
          <button onClick={onSendAll} disabled={sending || (stats?.queue_pending ?? 0) === 0} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: 9999, fontSize: 14, fontWeight: 700,
            cursor: sending || (stats?.queue_pending ?? 0) === 0 ? "not-allowed" : "pointer",
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
            color: "rgba(255,255,255,.75)", opacity: sending ? 0.7 : 1,
            fontFamily: "Inter, sans-serif",
          }}>
            {sending ? "Sending…" : "⚡ Send Auto-Replies"}
          </button>
        </div>
      </div>
      {/* 5-stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, position: "relative", zIndex: 1 }}>
        {[
          { label: "Attention", value: stats?.attention_pending ?? 0, color: SR.manual, delta: null },
          { label: "Auto Queue", value: stats?.queue_pending ?? 0, color: "#7AB3AB", delta: null },
          { label: "Sent Today", value: stats?.sent_today ?? 0, color: "white", delta: "↑" },
          { label: "Total Sent", value: stats?.total_sent ?? 0, color: "white", delta: null },
          { label: "Response %", value: `${responseRate}%`, color: SR.succ500, delta: null },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "12px 14px",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 16,
          }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: "-0.03em" }}>
              {s.value}
            </div>
            {s.delta && (
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: "#6EE7B7", marginTop: 4 }}>
                {s.delta} Today
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SR04 Group Tabs ───────────────────────────────────────────────────────────
function GroupTabs({
  active, attentionCount, queueCount, onSwitch,
}: { active: "attention" | "auto"; attentionCount: number; queueCount: number; onSwitch: (g: "attention" | "auto") => void }) {
  const tabs: Array<{ key: "attention" | "auto"; label: string; count: number; icon: string; desc: string }> = [
    { key: "attention", label: "Needs Attention", count: attentionCount, icon: "🧑‍💼", desc: "Complex comments needing human moderation" },
    { key: "auto", label: "Auto Reply", count: queueCount, icon: "⚡", desc: "Simple comments — AI replies automatically" },
  ];
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 0, background: SR.n100, borderRadius: 16, padding: 4, marginBottom: 12 }}>
        {tabs.map((t) => {
          const isManual = t.key === "attention";
          const isActive = active === t.key;
          return (
            <button key={t.key} onClick={() => onSwitch(t.key)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 16px", borderRadius: 12,
              fontSize: 15, fontWeight: 700, fontFamily: "Manrope, sans-serif",
              cursor: "pointer", border: "none", transition: "all 0.2s",
              background: isActive ? "white" : "transparent",
              color: isActive ? (isManual ? SR.manual : SR.auto) : SR.n500,
              boxShadow: isActive ? `0 2px 10px rgba(${isManual ? "124,58,237" : "95,143,139"},.18)` : "none",
            }}>
              <span>{t.icon}</span>
              {t.label}
              <span style={{
                minWidth: 20, height: 20, padding: "0 6px",
                borderRadius: 9999, fontSize: 12, fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isActive ? (isManual ? SR.manual50 : SR.auto50) : SR.n200,
                color: isActive ? (isManual ? SR.manual : SR.auto) : SR.n500,
              }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      {/* Group description cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {tabs.map((t) => {
          const isManual = t.key === "attention";
          return (
            <div key={t.key} style={{
              padding: "14px 16px", borderRadius: 16,
              background: isManual ? SR.manual50 : SR.auto50,
              border: `1px solid ${isManual ? "#DDD6FE" : "#A8D5CF"}`,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, marginBottom: 8,
                background: isManual ? SR.manual : SR.grad,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>
                {t.icon}
              </div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 4, color: isManual ? SR.manual : "#3D6562" }}>
                Group {isManual ? "1" : "2"}: {isManual ? "Manual Review" : "Auto Reply"}
              </div>
              <div style={{ fontSize: 13, color: SR.n500, lineHeight: 1.5 }}>{t.desc}</div>
              <div style={{ marginTop: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 900, color: isManual ? SR.manual : "#4E7C78" }}>
                {t.count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SR03 Comment Card (manual attention) ─────────────────────────────────────
function AttentionCard({
  item, selected, onSelect, onSend,
}: {
  item: AttentionItem; selected: boolean; onSelect: () => void; onSend: (text: string) => Promise<void>;
}) {
  const [reply, setReply] = useState(item.ai_suggestion ?? "");
  const [sending, setSending] = useState(false);
  const tag = getTag(item.sentiment);
  const cls = getTag(item.classification);

  return (
    <div style={{
      borderRadius: 16, border: `1px solid ${selected ? "#A8D5CF" : SR.n200}`,
      background: SR.bgEl, marginBottom: 8, overflow: "hidden",
      transition: "all 0.15s", cursor: "pointer",
      boxShadow: selected ? "0 4px 16px rgba(95,143,139,.12)" : SR.shadow,
    }}>
      {/* left accent */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: SR.manual, borderRadius: "0 0 0 0", opacity: selected ? 1 : 0, transition: "opacity 0.15s" }} />
        <div style={{ padding: "12px 14px 12px 17px" }} onClick={onSelect}>
          {/* top row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Avatar name={item.commenter_username} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: SR.n900 }}>{item.commenter_username}</div>
              <div style={{ fontSize: 12, color: SR.n400, fontFamily: "Inter, sans-serif" }}>
                {timeAgo(item.created_at)}
              </div>
            </div>
            <PlatformBadge p={item.platform} />
            <span style={{
              fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
              padding: "4px 8px", borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.05em",
              background: SR.manual50, color: SR.manual, border: "1px solid #DDD6FE",
            }}>Manual</span>
          </div>
          {/* comment text */}
          <div style={{ fontSize: 15, color: SR.n900, lineHeight: 1.55, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.comment_text}
          </div>
          {/* NLP tags */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            <NlpChip label={tag.label} s={item.sentiment} />
            {item.classification !== item.sentiment && <NlpChip label={cls.label} s={item.classification} />}
            <span style={{
              fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
              color: URGENCY_C[item.urgency] ?? SR.neu,
              marginLeft: "auto",
            }}>
              {item.urgency?.toUpperCase()} urgency
            </span>
          </div>
          {/* action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: `1px solid ${SR.n100}` }}>
            <button onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
              borderRadius: 9999, fontSize: 13, fontWeight: 700,
              background: SR.grad, color: "white", border: "none", cursor: "pointer",
              boxShadow: "0 2px 8px rgba(95,143,139,.3)",
            }}>↩ Reply</button>
            <button style={{
              display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
              borderRadius: 9999, fontSize: 13, fontWeight: 700,
              background: SR.manual50, color: SR.manual, border: `1px solid #DDD6FE`, cursor: "pointer",
            }}>🧑‍💼 Manual</button>
          </div>
        </div>
      </div>
      {/* Composer (expanded inline when selected) */}
      {selected && (
        <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${SR.n100}`, background: SR.bg }}>
          {/* original context */}
          <div style={{ padding: "8px 10px", borderRadius: 8, background: SR.bgSunk, borderLeft: `3px solid #A8D5CF`, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter, sans-serif", color: "#4E7C78", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Original Comment</div>
            <div style={{ fontSize: 14, color: SR.n700, lineHeight: 1.5 }}>{item.comment_text}</div>
          </div>
          {/* AI suggestion */}
          {item.ai_suggestion && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: SR.n400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <span>✨</span> AI Suggestion
              </div>
              <div
                onClick={() => setReply(item.ai_suggestion!)}
                style={{
                  padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${SR.n200}`,
                  background: SR.bgEl, fontSize: 14, color: SR.n900, lineHeight: 1.5, cursor: "pointer",
                  position: "relative", transition: "all 0.15s",
                }}
              >
                {item.ai_suggestion}
                <span style={{ position: "absolute", top: 7, right: 8, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", padding: "2px 4px", borderRadius: 9999, background: "#D4EAE7", color: "#3D6562" }}>
                  USE
                </span>
              </div>
            </div>
          )}
          {/* textarea */}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Write your reply…"
            style={{
              width: "100%", padding: "12px 14px", border: `1.5px solid ${SR.n200}`,
              borderRadius: 16, background: SR.bg, fontFamily: "Inter, sans-serif",
              fontSize: 15, color: SR.n900, lineHeight: 1.6, resize: "none", outline: "none",
              transition: "border-color 0.15s",
            }}
          />
          {/* footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button
              onClick={async () => { if (!reply.trim()) return; setSending(true); await onSend(reply); setSending(false); }}
              disabled={sending || !reply.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "8px 18px",
                borderRadius: 9999, background: SR.grad, color: "white",
                fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
                boxShadow: "0 3px 10px rgba(95,143,139,.35)", opacity: sending ? 0.7 : 1,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {sending ? "Sending…" : "↩ Send Reply"}
            </button>
            <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: SR.n400 }}>
              {reply.length} chars
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SR12 Approval Card (auto queue) ──────────────────────────────────────────
function AutoCard({
  item, onApprove, onReject,
}: {
  item: QueueItem; onApprove: () => Promise<void>; onReject: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const tierColor = item.profile_tier === "vip" ? "#7C3AED" : item.profile_tier === "high" ? SR.pos : SR.n500;

  return (
    <div style={{
      borderRadius: 16, border: `1px solid ${SR.n200}`, background: SR.bg,
      overflow: "hidden", boxShadow: SR.shadow, marginBottom: 8,
      transition: "all 0.15s",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: SR.bgEl, borderBottom: `1px solid ${SR.n100}` }}>
        <Avatar name={item.commenter_username} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: SR.n900 }}>{item.commenter_username}</div>
          <div style={{ fontSize: 12, color: SR.n400, fontFamily: "Inter, sans-serif" }}>
            {pLabel(item.platform)} · {timeAgo(item.created_at)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 15, fontWeight: 800, color: "#4E7C78" }}>
            {item.profile_score}pts
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: tierColor, textTransform: "uppercase" }}>
            {item.profile_tier}
          </span>
        </div>
      </div>
      {/* body */}
      <div style={{ padding: "12px 14px" }}>
        {/* original comment */}
        <div style={{ fontSize: 14, color: SR.n600 ?? SR.n500, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: SR.bgSunk, borderLeft: `3px solid ${SR.n300}`, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: SR.n400, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Comment</div>
          {item.comment_text}
        </div>
        {/* AI reply */}
        {item.ai_reply_draft && (
          <div style={{ fontSize: 15, color: SR.n900, lineHeight: 1.55, padding: "10px 12px", borderRadius: 10, background: SR.auto50, border: `1px solid #A8D5CF`, borderLeft: `3px solid ${SR.auto}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "#4E7C78", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              ✨ AI Draft
            </div>
            {item.ai_reply_draft}
          </div>
        )}
      </div>
      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: `1px solid ${SR.n100}` }}>
        <button
          onClick={async () => { setApproving(true); await onApprove(); setApproving(false); }}
          disabled={approving}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
            borderRadius: 9999, background: SR.grad, color: "white",
            fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
            boxShadow: "0 2px 8px rgba(95,143,139,.3)", opacity: approving ? 0.7 : 1,
            fontFamily: "Inter, sans-serif",
          }}
        >
          ✓ Approve & Send
        </button>
        <button onClick={onReject} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
          borderRadius: 9999, background: SR.danger50, color: SR.danger700,
          fontSize: 14, fontWeight: 700, border: `1px solid rgba(239,68,68,.2)`, cursor: "pointer",
          fontFamily: "Inter, sans-serif",
        }}>
          ✕ Skip
        </button>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <NlpChip label="Auto" s="neutral" />
        </div>
      </div>
    </div>
  );
}

// ── SR11 Queue Counters ───────────────────────────────────────────────────────
function QueueCounters({ stats }: { stats: Stats | null }) {
  const items = [
    { key: "pending", label: "Pending", desc: "New comments not yet classified", icon: "⏳", count: (stats?.attention_pending ?? 0) + (stats?.queue_pending ?? 0), bg: SR.warn50, border: "rgba(245,158,11,.25)", color: "#92400E", numColor: "#B45309" },
    { key: "manual",  label: "Manual",  desc: "Need human review", icon: "🧑‍💼", count: stats?.attention_pending ?? 0, bg: SR.manual50, border: "rgba(124,58,237,.2)",   color: SR.manual, numColor: SR.manual },
    { key: "auto",    label: "Auto",    desc: "AI replies queued", icon: "⚡", count: stats?.queue_pending ?? 0, bg: SR.auto50,   border: "#A8D5CF",                    color: "#3D6562", numColor: "#4E7C78" },
    { key: "done",    label: "Done",    desc: "Replies sent today", icon: "✓", count: stats?.sent_today ?? 0, bg: SR.succ50,   border: "rgba(16,185,129,.25)",         color: SR.succ700, numColor: "#059669" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {items.map((it) => (
        <div key={it.key} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", borderRadius: 16,
          background: it.bg, border: `1px solid ${it.border}`,
          transition: "all 0.15s", cursor: "default",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, background: "rgba(255,255,255,.6)",
          }}>
            {it.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.07em", color: it.color }}>
              {it.label}
            </div>
            <div style={{ fontSize: 13, color: SR.n500, marginTop: 1 }}>{it.desc}</div>
          </div>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", color: it.numColor }}>
            {it.count}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SR05 NLP Panel ────────────────────────────────────────────────────────────
function NlpPanel({ items }: { items: AttentionItem[] }) {
  const total = items.length || 1;
  const pos  = items.filter(i => ["positive","praise"].includes(i.sentiment)).length;
  const neg  = items.filter(i => ["negative","complaint"].includes(i.sentiment)).length;
  const neu  = total - pos - neg;

  const intents = [
    { name: "Question",   color: SR.que,    count: items.filter(i => i.classification === "question").length },
    { name: "Complaint",  color: SR.com,    count: items.filter(i => i.classification === "complaint").length },
    { name: "Praise",     color: SR.pos,    count: items.filter(i => i.classification === "praise").length },
    { name: "Intent",     color: "#C2410C", count: items.filter(i => i.classification === "intent").length },
    { name: "Neutral",    color: SR.neu,    count: items.filter(i => i.classification === "neutral").length },
  ].filter(i => i.count > 0);

  return (
    <div style={{ background: SR.bg, borderRadius: 20, border: `1px solid ${SR.n200}`, padding: 20, boxShadow: SR.shadow, marginBottom: 16 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 500, color: SR.auto, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: SR.grad, display: "inline-block" }} />
        NLP Analysis
      </div>
      <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 16, fontWeight: 700, color: SR.n900, marginBottom: 16, letterSpacing: "-0.01em" }}>
        Sentiment Breakdown
      </div>
      {/* sentiment grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Positive", val: pos, icon: "😊", bg: SR.pos50, border: "rgba(16,185,129,.3)", color: SR.pos700 },
          { label: "Neutral",  val: neu, icon: "😐", bg: SR.neu50, border: SR.n200,              color: "#374151" },
          { label: "Negative", val: neg, icon: "😠", bg: SR.neg50, border: "rgba(239,68,68,.3)", color: SR.neg700 },
        ].map(s => (
          <div key={s.label} style={{ padding: 12, borderRadius: 10, border: `1px solid ${s.border}`, background: s.bg, textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.val}</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: SR.n500, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* intent rows */}
      {intents.length > 0 && (
        <>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: SR.n400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Intent Breakdown</div>
          {intents.map(it => (
            <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", transition: "background 0.15s" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: it.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: SR.n900 }}>{it.name}</div>
              <div style={{ width: 60, height: 5, background: SR.n100, borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(it.count / total) * 100}%`, background: it.color, borderRadius: 9999 }} />
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700, color: SR.n700, width: 24, textAlign: "right" }}>{it.count}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: SR.n400, width: 34, textAlign: "right" }}>{Math.round(it.count / total * 100)}%</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── SR10 Analytics ────────────────────────────────────────────────────────────
function Analytics({ stats }: { stats: Stats | null }) {
  const total = (stats?.total_sent ?? 0) + (stats?.attention_resolved ?? 0);
  const autoCount = stats?.total_sent ?? 0;
  const manualCount = stats?.attention_resolved ?? 0;

  const kpis = [
    { label: "Total Sent", value: stats?.total_sent ?? 0, delta: `+${stats?.sent_today ?? 0} today`, up: true },
    { label: "Resolved",   value: stats?.attention_resolved ?? 0, delta: `+${stats?.resolved_today ?? 0} today`, up: true },
    { label: "Today",      value: (stats?.sent_today ?? 0) + (stats?.resolved_today ?? 0), delta: "", up: true },
  ];
  return (
    <div style={{ background: SR.bg, borderRadius: 20, border: `1px solid ${SR.n200}`, padding: 20, boxShadow: SR.shadow }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 500, color: SR.auto, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: SR.grad, display: "inline-block" }} />
        Analytics
      </div>
      <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 16, fontWeight: 700, color: SR.n900, marginBottom: 14, letterSpacing: "-0.01em" }}>Reply Performance</div>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${SR.n200}`, background: SR.bgEl, display: "flex", flexDirection: "column", gap: 4, transition: "all 0.15s" }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: SR.n400, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 22, fontWeight: 900, color: SR.n900, letterSpacing: "-0.03em", lineHeight: 1 }}>{k.value}</div>
            {k.delta && <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: SR.pos }}>{k.delta}</div>}
          </div>
        ))}
      </div>
      {/* bars */}
      <div style={{ fontSize: 12, fontWeight: 700, color: SR.n400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "Manrope, sans-serif" }}>By Type</div>
      {[
        { label: "Auto Reply", count: autoCount, pct: total > 0 ? (autoCount / total * 100) : 0, color: SR.grad, dotColor: SR.auto, cls: "auto" },
        { label: "Manual",     count: manualCount, pct: total > 0 ? (manualCount / total * 100) : 0, color: SR.manualGrad, dotColor: SR.manual, cls: "manual" },
      ].map(b => (
        <div key={b.label} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: SR.n900, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: b.dotColor }} />
              {b.label}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700, color: SR.n700 }}>{b.count}</div>
          </div>
          <div style={{ height: 7, background: SR.n100, borderRadius: 9999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${b.pct}%`, background: b.color, borderRadius: 9999, transition: "width 0.5s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SR09 History Feed ─────────────────────────────────────────────────────────
function HistoryFeed({ items }: { items: HistoryItem[] }) {
  return (
    <div style={{ background: SR.bg, borderRadius: 20, border: `1px solid ${SR.n200}`, padding: 20, boxShadow: SR.shadow, marginBottom: 16 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 500, color: SR.auto, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: SR.grad, display: "inline-block" }} />
        Reply History
      </div>
      <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 16, fontWeight: 700, color: SR.n900, marginBottom: 14, letterSpacing: "-0.01em" }}>Recent Sent</div>
      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: SR.n400, fontSize: 14 }}>No replies sent yet</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(it => (
          <div key={it.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", borderRadius: 10, border: `1px solid ${SR.n200}`,
            background: SR.bgEl, cursor: "pointer", transition: "all 0.15s",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: it.type === "manual" ? SR.manual50 : SR.auto50,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12,
            }}>
              {it.type === "manual" ? "🧑‍💼" : "⚡"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: SR.n900 }}>{it.commenter_username}</div>
                <PlatformBadge p={it.platform} />
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: SR.n400, marginLeft: "auto", flexShrink: 0 }}>
                  {it.sent_at ? timeAgo(it.sent_at) : "–"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: SR.n500, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.comment_text}
              </div>
              {it.ai_reply_draft && (
                <div style={{ fontSize: 13, color: "#4E7C78", lineHeight: 1.4, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ↳ {it.ai_reply_draft}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SmartReplyPage() {
  const supabase = createClient();
  const [brandId, setBrandId]           = useState<string | null>(null);
  const [userId, setUserId]             = useState<string | null>(null);
  const [stats, setStats]               = useState<Stats | null>(null);
  const [attentionItems, setAttention]  = useState<AttentionItem[]>([]);
  const [queueItems, setQueue]          = useState<QueueItem[]>([]);
  const [historyItems, setHistory]      = useState<HistoryItem[]>([]);
  const [activeGroup, setActiveGroup]   = useState<"attention" | "auto">("attention");
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [syncing, setSyncing]           = useState(false);
  const [sending, setSending]           = useState(false);
  const [loading, setLoading]           = useState(true);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async (bid: string, uid: string) => {
    // stats
    const { data: statsData } = await supabase.functions.invoke("social-auto-reply", {
      body: { action: "get_stats", brand_id: bid, user_id: uid },
    });
    if (statsData) setStats(statsData as Stats);

    // attention queue (group 1 — manual)
    const { data: attData } = await supabase
      .from("gv_attention_queue")
      .select("id, platform, commenter_username, comment_text, classification, sentiment, urgency, ai_suggestion, is_read, created_at")
      .eq("brand_id", bid)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (attData) setAttention(attData as AttentionItem[]);

    // reply queue (group 2 — auto)
    const { data: qData } = await supabase
      .from("gv_reply_queue")
      .select("id, platform, commenter_username, comment_text, ai_reply_draft, weight, profile_tier, profile_score, status, created_at")
      .eq("brand_id", bid)
      .eq("status", "queued")
      .order("weight", { ascending: false })
      .limit(50);
    if (qData) setQueue(qData as QueueItem[]);

    // history (sent replies — both queues)
    const { data: histQ } = await supabase
      .from("gv_reply_queue")
      .select("id, platform, commenter_username, comment_text, ai_reply_draft, sent_at")
      .eq("brand_id", bid)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(20);
    const { data: histA } = await supabase
      .from("gv_attention_queue")
      .select("id, platform, commenter_username, comment_text, ai_suggestion, resolved_at")
      .eq("brand_id", bid)
      .eq("is_resolved", true)
      .order("resolved_at", { ascending: false })
      .limit(10);

    const hist: HistoryItem[] = [
      ...(histQ ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string, platform: r.platform as string,
        commenter_username: r.commenter_username as string,
        comment_text: r.comment_text as string,
        ai_reply_draft: r.ai_reply_draft as string | null,
        sent_at: r.sent_at as string | null, type: "auto" as const,
      })),
      ...(histA ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string, platform: r.platform as string,
        commenter_username: r.commenter_username as string,
        comment_text: r.comment_text as string,
        ai_reply_draft: r.ai_suggestion as string | null,
        sent_at: r.resolved_at as string | null, type: "manual" as const,
      })),
    ].sort((a, b) => new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime()).slice(0, 20);
    setHistory(hist);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const bid = bp?.id ?? null;
      setBrandId(bid);
      if (bid) await loadData(bid, session.user.id);
      setLoading(false);
    })();
  }, [supabase, loadData]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!brandId || !userId) return;
    setSyncing(true);
    await supabase.functions.invoke("social-auto-reply", {
      body: { action: "sync", brand_id: brandId, user_id: userId },
    });
    await loadData(brandId, userId);
    setSyncing(false);
  };

  const handleSendAll = async () => {
    if (!brandId || !userId) return;
    setSending(true);
    await supabase.functions.invoke("social-auto-reply", {
      body: { action: "send_replies", brand_id: brandId, user_id: userId, limit: 20 },
    });
    await loadData(brandId, userId);
    setSending(false);
  };

  const handleSendManual = async (itemId: string, replyText: string) => {
    if (!brandId) return;
    await supabase.functions.invoke("social-auto-reply", {
      body: { action: "send_single", brand_id: brandId, queue_id: itemId, reply_text: replyText, source: "attention" },
    });
    setAttention(prev => prev.filter(i => i.id !== itemId));
    setSelectedId(null);
    if (brandId && userId) await loadData(brandId, userId);
  };

  const handleApproveAuto = async (itemId: string) => {
    if (!brandId) return;
    await supabase.functions.invoke("social-auto-reply", {
      body: { action: "send_single", brand_id: brandId, queue_id: itemId, source: "queue" },
    });
    setQueue(prev => prev.filter(i => i.id !== itemId));
    if (brandId && userId) await loadData(brandId, userId);
  };

  const handleRejectAuto = (itemId: string) => {
    setQueue(prev => prev.filter(i => i.id !== itemId));
  };

  // ── Center panel ──────────────────────────────────────────────────────────
  const CenterPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "24px 0" }}>
      <SRHeader
        stats={stats} syncing={syncing} onSync={handleSync}
        sending={sending} onSendAll={handleSendAll}
      />
      <GroupTabs
        active={activeGroup}
        attentionCount={attentionItems.length}
        queueCount={queueItems.length}
        onSwitch={setActiveGroup}
      />

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: SR.n400, fontSize: 15 }}>Loading comments…</div>
      )}

      {!loading && activeGroup === "attention" && (
        <>
          {attentionItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: SR.n700 }}>All caught up!</div>
              <div style={{ fontSize: 14, color: SR.n400, marginTop: 4 }}>No comments needing attention</div>
            </div>
          ) : (
            attentionItems.map(item => (
              <AttentionCard
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
                onSend={(text) => handleSendManual(item.id, text)}
              />
            ))
          )}
        </>
      )}

      {!loading && activeGroup === "auto" && (
        <>
          {queueItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: SR.n700 }}>Auto queue empty</div>
              <div style={{ fontSize: 14, color: SR.n400, marginTop: 4 }}>Sync to fetch new comments</div>
            </div>
          ) : (
            queueItems.map(item => (
              <AutoCard
                key={item.id}
                item={item}
                onApprove={() => handleApproveAuto(item.id)}
                onReject={() => handleRejectAuto(item.id)}
              />
            ))
          )}
        </>
      )}
    </div>
  );

  // ── Right panel ───────────────────────────────────────────────────────────
  const RightPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "24px 0" }}>
      <QueueCounters stats={stats} />
      <NlpPanel items={attentionItems} />
      <HistoryFeed items={historyItems} />
      <Analytics stats={stats} />
    </div>
  );

  return (
    <AppShell center={CenterPanel} right={RightPanel} />
  );
}
