"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import AppShell from "@/components/shared/AppShell";

// ── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Brand colour tokens (CG-specific, not always in global CSS) ────────────
const ART = { c: "#F59E0B", l: "#FFFBEB", m: "#FEF3C7", d: "#B45309", grad: "linear-gradient(135deg,#F59E0B,#FBBF24)" };
const IMG = { c: "#8B5CF6", l: "#F5F3FF", m: "#EDE9FE", d: "#6D28D9", grad: "linear-gradient(135deg,#8B5CF6,#A78BFA)" };
const VID = { c: "#EF4444", l: "#FEF2F2", m: "#FEE2E2", d: "#B91C1C", grad: "linear-gradient(135deg,#EF4444,#F87171)" };

// ── Types ─────────────────────────────────────────────────────────────────────
type TabType = "Article" | "Image" | "Video";
interface HistItem { id: string; type: "article" | "image" | "video"; title: string; status: string; created_at: string; }
interface SotTopic { topic: string; format: string; platform: string; priority: string; reasoning?: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Baru saja";
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, accentColor, style = {} }: { children: React.ReactNode; accentColor?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--gv-color-bg-surface,#fff)", borderRadius: "var(--gv-radius-2xl,24px)", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", boxShadow: "0 2px 12px rgba(31,36,40,.06)", overflow: "hidden", position: "relative", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentColor ?? "var(--gv-gradient-primary,linear-gradient(135deg,#5F8F8B,#7AB3AB))" }} />
      {children}
    </div>
  );
}
function CardInner({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: "20px 22px", ...style }}>{children}</div>;
}
function CardLabel({ eyebrow, title, accentColor }: { eyebrow: string; title: string; accentColor?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontFamily: "var(--gv-font-mono,'JetBrains Mono',monospace)", fontSize: 11, fontWeight: 600, color: accentColor ?? "var(--gv-color-primary-500,#5F8F8B)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 2 }}>• {eyebrow}</p>
      <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 15, fontWeight: 700, color: "var(--gv-color-neutral-900,#1F2428)", letterSpacing: "-.01em" }}>{title}</p>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ steps, active, typeColor }: { steps: string[]; active: number; typeColor: typeof ART }) {
  return (
    <div style={{ display: "flex", alignItems: "center", background: "var(--gv-color-bg-elevated,#FAFBFC)", borderRadius: 999, padding: "6px 8px", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", gap: 0, overflowX: "auto" }}>
      {steps.map((s, i) => {
        const isDone = i < active;
        const isActive = i === active;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {i > 0 && <div style={{ width: 24, height: 1, background: "var(--gv-color-neutral-200,#E5E7EB)", flexShrink: 0 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, padding: "6px 14px", borderRadius: 999, fontSize: 14, fontWeight: 600, color: isActive ? typeColor.d : isDone ? "var(--gv-color-neutral-700,#4A545B)" : "var(--gv-color-neutral-400,#9CA3AF)", background: isActive ? typeColor.l : "transparent", transition: "all .2s" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: "var(--gv-font-mono)", background: isActive ? typeColor.c : isDone ? "rgba(95,143,139,.15)" : "var(--gv-color-neutral-200,#E5E7EB)", color: isActive ? "#fff" : isDone ? "var(--gv-color-primary-700,#3D6562)" : "var(--gv-color-neutral-500,#6B7280)", flexShrink: 0 }}>
                {isDone ? "✓" : i + 1}
              </div>
              {s}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Progress block ────────────────────────────────────────────────────────────
function GeneratingState({ label, sub, progress, steps: genSteps, typeColor }: { label: string; sub: string; progress: number; steps: { label: string; done: boolean; active: boolean }[]; typeColor: typeof ART }) {
  return (
    <div style={{ background: "var(--gv-color-bg-surface,#fff)", borderRadius: "var(--gv-radius-2xl,24px)", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", padding: 28, display: "flex", flexDirection: "column", gap: 18, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%,${typeColor.c}18 0%,transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ width: 68, height: 68, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, background: `radial-gradient(circle,${typeColor.c}60,${typeColor.c}18)`, boxShadow: `0 0 30px ${typeColor.c}50`, animation: "gv-float 3s ease-in-out infinite" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={typeColor.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
      </div>
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 17, fontWeight: 800, color: "var(--gv-color-neutral-900,#1F2428)", marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 14, color: "var(--gv-color-neutral-500,#6B7280)" }}>{sub}</p>
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ height: 8, background: "var(--gv-color-neutral-100,#F3F4F6)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: typeColor.grad, width: `${progress}%`, transition: "width .5s ease", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)", backgroundSize: "200%", animation: "gv-shimmer 1.6s infinite" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900)" }}>{progress}%</span>
          <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 13, color: "var(--gv-color-neutral-500)" }}>mohon tunggu…</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative", zIndex: 1 }}>
        {genSteps.map((gs, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,.05)", border: "1px solid var(--gv-color-neutral-100,#F3F4F6)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: gs.done ? "var(--gv-color-success-500,#10B981)" : gs.active ? typeColor.c : "var(--gv-color-neutral-300,#D1D5DB)", animation: gs.active ? "gv-pulse-dot 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: gs.done || gs.active ? "var(--gv-color-neutral-700,#4A545B)" : "var(--gv-color-neutral-400,#9CA3AF)" }}>{gs.label}</span>
            {gs.done && <span style={{ marginLeft: "auto", fontFamily: "var(--gv-font-mono)", fontSize: 12, color: "var(--gv-color-success-500,#10B981)" }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ARTICLE FLOW ─────────────────────────────────────────────────────────────
function ArticleFlow({ brandId, sotTopics }: { brandId: string | null; sotTopics: SotTopic[] }) {
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [length, setLength] = useState("medium");
  const [objective, setObjective] = useState("educational");
  const [progress, setProgress] = useState(0);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<any>(null);

  const LENGTHS = [
    { id: "short",     name: "Short",     range: "~300 kata",  bars: 1, desc: "Caption, quick tip, promo copy" },
    { id: "medium",    name: "Medium",    range: "~800 kata",  bars: 2, desc: "Blog post, newsletter, update" },
    { id: "long",      name: "Long",      range: "~1500 kata", bars: 3, desc: "SEO article, guide, review" },
    { id: "very_long", name: "Very Long", range: "3000+ kata", bars: 4, desc: "Pillar content, whitepaper" },
  ];

  const OBJECTIVES = [
    { id: "educational", emoji: "📚", name: "Edukatif" },
    { id: "faq",         emoji: "❓", name: "FAQ" },
    { id: "trend",       emoji: "🔥", name: "Trending" },
    { id: "review",      emoji: "⭐", name: "Review" },
    { id: "tutorial",    emoji: "🎯", name: "Tutorial" },
    { id: "ads",         emoji: "📢", name: "Ads Copy" },
  ];

  const GEN_STEPS = [
    "Membaca brand context",
    "Menyusun struktur artikel",
    "Menulis konten utama",
    "Optimasi SEO & GEO",
    "Finalisasi & formatting",
  ];

  async function generate() {
    if (!brandId) return;
    setStep(1);
    setProgress(0);
    setGenStepIdx(0);

    // Simulate progress
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(timer); return 90; }
        return p + Math.random() * 12;
      });
      setGenStepIdx(i => Math.min(i + 1, GEN_STEPS.length - 1));
    }, 1800);

    try {
      const { data, error } = await supabase.functions.invoke("content-studio-handler", {
        body: { action: "generate_article", brand_id: brandId, topic: topic || customTopic, objective, length, include_hashtags: true },
      });
      clearInterval(timer);
      if (error || !data) throw error;
      setProgress(100);
      setResult(data);
      setTimeout(() => setStep(2), 600);
    } catch {
      clearInterval(timer);
      setStep(0);
    }
  }

  if (step === 1) {
    return (
      <GeneratingState
        label="Menulis artikel…"
        sub="Claude Sonnet 4.6 sedang menyusun konten brand-aware"
        progress={Math.round(progress)}
        steps={GEN_STEPS.map((l, i) => ({ label: l, done: i < genStepIdx, active: i === genStepIdx }))}
        typeColor={ART}
      />
    );
  }

  if (step === 2 && result) {
    const articleText = result.content ?? result.article ?? "";
    const title = result.meta_title ?? topic ?? customTopic ?? "Artikel";
    const wordCount = articleText.split(" ").length;
    const hashtags: string[] = result.hashtags ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 16, background: "var(--gv-color-bg-elevated,#FAFBFC)", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", flexWrap: "wrap" }}>
          {["H1", "H2", "Bold", "Italic", "Link"].map(t => (
            <button key={t} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-500)", background: "var(--gv-color-bg-surface,#fff)", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", cursor: "pointer" }}>{t}</button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, fontFamily: "var(--gv-font-mono)", color: ART.d, background: ART.l, padding: "4px 10px", borderRadius: 999, border: `1px solid ${ART.m}` }}>
            ✏️ Edit Mode
          </div>
        </div>

        {/* Article content */}
        <div style={{ border: "1.5px solid var(--gv-color-neutral-200,#E5E7EB)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--gv-color-bg-elevated,#FAFBFC)", borderBottom: "1px solid var(--gv-color-neutral-100,#F3F4F6)" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: ART.c }} />
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-400)" }}>PREVIEW</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--gv-font-mono)", fontSize: 12, color: "var(--gv-color-neutral-400)" }}>{wordCount} kata</span>
          </div>
          <div style={{ padding: 20, maxHeight: 340, overflowY: "auto" }}>
            <h1 style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 18, fontWeight: 800, color: "var(--gv-color-neutral-900,#1F2428)", letterSpacing: "-.02em", marginBottom: 10, borderBottom: `2px solid ${ART.m}`, paddingBottom: 8 }}>{title}</h1>
            <p style={{ fontSize: 15, color: "var(--gv-color-neutral-700,#4A545B)", lineHeight: 1.7 }}>{articleText.slice(0, 600)}{articleText.length > 600 ? "…" : ""}</p>
            {hashtags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                {hashtags.slice(0, 8).map((h: string, i: number) => (
                  <span key={i} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: ART.l, color: ART.d, border: `1px solid ${ART.m}` }}>{h}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--gv-color-neutral-100,#F3F4F6)", background: "var(--gv-color-bg-elevated,#FAFBFC)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-neutral-500)" }}>SEO Score</span>
            <div style={{ display: "flex", gap: 3, flex: 1 }}>
              {[...Array(10)].map((_, i) => (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < 8 ? "var(--gv-color-success-500,#10B981)" : "var(--gv-color-neutral-200,#E5E7EB)" }} />
              ))}
            </div>
            <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 13, fontWeight: 800, color: "var(--gv-color-success-500,#10B981)" }}>82/100</span>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 24, background: "var(--gv-color-neutral-900,#1F2428)", boxShadow: "0 8px 32px rgba(0,0,0,.15)" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 15, fontWeight: 800, color: "white", marginBottom: 2 }}>{title}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{wordCount} kata · {length} · {objective}</p>
          </div>
          <button onClick={() => setStep(0)} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "rgba(239,68,68,.15)", color: "#F87171", border: "1px solid rgba(239,68,68,.25)", cursor: "pointer" }}>Ulangi</button>
          <button style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,.1)", color: "white", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer" }}>Simpan Draft</button>
          <button style={{ padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: ART.grad, color: "#1C1400", cursor: "pointer", border: "none" }}>Jadwalkan</button>
        </div>
      </div>
    );
  }

  // Step 0: Config
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Stepper steps={["Topik & Format", "Panjang Konten", "Generate"]} active={0} typeColor={ART} />

      {/* Topic picker */}
      <Card accentColor={ART.grad}>
        <CardInner>
          <CardLabel eyebrow="CG04 · Topic" title="Pilih Topik Konten" accentColor={ART.d} />
          {sotTopics.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {sotTopics.slice(0, 6).map((t, i) => (
                <div key={i} onClick={() => setTopic(t.topic)} style={{ padding: "12px 10px", borderRadius: 16, border: `1.5px solid ${topic === t.topic ? ART.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: topic === t.topic ? ART.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", boxShadow: topic === t.topic ? `0 0 0 3px ${ART.c}25` : "none", transition: "all .15s" }}>
                  <span style={{ fontSize: 22 }}>📌</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: topic === t.topic ? ART.d : "var(--gv-color-neutral-900,#1F2428)", fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)" }}>{t.topic}</span>
                  <span style={{ fontSize: 11, fontFamily: "var(--gv-font-mono)", color: "var(--gv-color-neutral-400)" }}>{t.platform}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "var(--gv-color-neutral-400)", textAlign: "center", padding: "16px 0" }}>Brand intelligence belum tersedia. Topik dari SoT akan muncul di sini.</p>
          )}
          <div style={{ marginTop: 12 }}>
            <input value={customTopic} onChange={e => { setCustomTopic(e.target.value); setTopic(""); }} placeholder="Atau ketik topik kustom…" style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${customTopic ? ART.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, borderRadius: 16, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontFamily: "var(--gv-font-body,'Inter',sans-serif)", fontSize: 15, color: "var(--gv-color-neutral-900,#1F2428)", outline: "none" }} />
          </div>
        </CardInner>
      </Card>

      {/* Objective + Length */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card accentColor={ART.grad}>
          <CardInner>
            <CardLabel eyebrow="Objective" title="Tujuan Konten" accentColor={ART.d} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {OBJECTIVES.map(o => (
                <div key={o.id} onClick={() => setObjective(o.id)} style={{ padding: "10px 8px", borderRadius: 12, border: `1.5px solid ${objective === o.id ? ART.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: objective === o.id ? ART.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all .15s" }}>
                  <span style={{ fontSize: 18 }}>{o.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: objective === o.id ? ART.d : "var(--gv-color-neutral-700,#4A545B)", fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)" }}>{o.name}</span>
                </div>
              ))}
            </div>
          </CardInner>
        </Card>

        <Card accentColor={ART.grad}>
          <CardInner>
            <CardLabel eyebrow="CG02 · Length" title="Panjang Artikel" accentColor={ART.d} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LENGTHS.map(l => (
                <div key={l.id} onClick={() => setLength(l.id)} style={{ padding: "12px 14px", borderRadius: 12, border: `2px solid ${length === l.id ? ART.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: length === l.id ? ART.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .15s" }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[...Array(4)].map((_, i) => <div key={i} style={{ width: 12, height: 4, borderRadius: 2, background: i < l.bars ? ART.c : "var(--gv-color-neutral-200,#E5E7EB)" }} />)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "var(--gv-color-neutral-900,#1F2428)", fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)" }}>{l.name}</p>
                    <p style={{ fontSize: 12, color: ART.d, fontFamily: "var(--gv-font-mono)", fontWeight: 600 }}>{l.range}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardInner>
        </Card>
      </div>

      {/* Generate CTA */}
      <button onClick={generate} disabled={!brandId || (!topic && !customTopic)} style={{ width: "100%", padding: "14px", borderRadius: 999, fontSize: 16, fontWeight: 800, fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", background: (!brandId || (!topic && !customTopic)) ? "var(--gv-color-neutral-200,#E5E7EB)" : ART.grad, color: (!brandId || (!topic && !customTopic)) ? "var(--gv-color-neutral-400,#9CA3AF)" : "#1C1400", border: "none", cursor: (!brandId || (!topic && !customTopic)) ? "not-allowed" : "pointer", boxShadow: (!brandId || (!topic && !customTopic)) ? "none" : `0 4px 16px ${ART.c}40`, transition: "all .2s" }}>
        ✍️ Generate Artikel
      </button>
    </div>
  );
}

// ── IMAGE FLOW ─────────────────────────────────────────────────────────────────
function ImageFlow({ brandId }: { brandId: string | null }) {
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState("product_showcase");
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(3);
  const [progress, setProgress] = useState(0);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [images, setImages] = useState<any[]>([]);

  const OBJECTIVES = [
    { id: "product_showcase",   emoji: "📦", name: "Product",   desc: "Single/multi product" },
    { id: "lifestyle",          emoji: "🌿", name: "Lifestyle",  desc: "Context & mood" },
    { id: "character_only",     emoji: "👤", name: "Character",  desc: "Person/mascot" },
    { id: "world_building",     emoji: "🌍", name: "World",      desc: "Scene/environment" },
    { id: "mixed",              emoji: "✨", name: "Mixed",      desc: "Combined approach" },
  ];

  const RATIOS = [
    { id: "1:1",   w: 40, h: 40, label: "1:1",   platform: "Instagram Feed" },
    { id: "9:16",  w: 22, h: 40, label: "9:16",  platform: "Stories/Reels" },
    { id: "16:9",  w: 40, h: 22, label: "16:9",  platform: "YouTube/Web" },
    { id: "4:5",   w: 32, h: 40, label: "4:5",   platform: "Portrait Feed" },
  ];

  const GEN_STEPS = ["Memproses brand context", "Menghitung prompt optimal", `Generating ${count} gambar`, "Quality check"];

  async function generate() {
    if (!brandId || !prompt) return;
    setStep(1);
    setProgress(0);
    setGenStepIdx(0);

    const timer = setInterval(() => {
      setProgress(p => { if (p >= 90) { clearInterval(timer); return 90; } return p + Math.random() * 15; });
      setGenStepIdx(i => Math.min(i + 1, GEN_STEPS.length - 1));
    }, 2200);

    try {
      const { data, error } = await supabase.functions.invoke("content-studio-handler", {
        body: { action: "generate_image", brand_id: brandId, prompt_text: prompt, objective, aspect_ratio: ratio, image_count: count, include_hashtags: true },
      });
      clearInterval(timer);
      if (error) throw error;
      setProgress(100);
      const imgs = Array.isArray(data?.images) ? data.images : (data?.image_url ? [data] : []);
      setImages(imgs);
      setTimeout(() => setStep(2), 600);
    } catch {
      clearInterval(timer);
      setStep(0);
    }
  }

  if (step === 1) {
    return <GeneratingState label="Generating images…" sub="Flux Schnell via Modal sedang render" progress={Math.round(progress)} steps={GEN_STEPS.map((l, i) => ({ label: l, done: i < genStepIdx, active: i === genStepIdx }))} typeColor={IMG} />;
  }

  if (step === 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {images.length > 0 ? images.map((img: any, i: number) => (
            <div key={i} style={{ borderRadius: 16, overflow: "hidden", border: "2px solid var(--gv-color-neutral-200,#E5E7EB)", background: "var(--gv-color-bg-elevated,#FAFBFC)", position: "relative", cursor: "pointer", transition: "all .2s" }}>
              {img.image_url || img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.image_url || img.url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${IMG.l},${IMG.m})` }}>
                  <div style={{ width: 48, height: 48, borderRadius: 16, background: `${IMG.c}50`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={IMG.c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
                  </div>
                </div>
              )}
              <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)" }}>#{i + 1}</span>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--gv-font-mono)", padding: "2px 6px", borderRadius: 999, background: IMG.l, color: IMG.d }}>{ratio}</span>
              </div>
            </div>
          )) : [...Array(count)].map((_, i) => (
            <div key={i} style={{ borderRadius: 16, overflow: "hidden", border: "2px solid var(--gv-color-neutral-200,#E5E7EB)", background: `linear-gradient(135deg,${IMG.l},${IMG.m})`, cursor: "pointer" }}>
              <div style={{ width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: `${IMG.c}50`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={IMG.c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
                </div>
              </div>
              <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)" }}>#{i + 1}</span>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--gv-font-mono)", padding: "2px 6px", borderRadius: 999, background: IMG.l, color: IMG.d }}>{ratio}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 24, background: "var(--gv-color-neutral-900,#1F2428)", boxShadow: "0 8px 32px rgba(0,0,0,.15)" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 14, fontWeight: 800, color: "white", marginBottom: 2 }}>{images.length || count} gambar siap</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{objective} · {ratio}</p>
          </div>
          <button onClick={() => setStep(0)} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "rgba(239,68,68,.15)", color: "#F87171", border: "1px solid rgba(239,68,68,.25)", cursor: "pointer" }}>Buat Lagi</button>
          <button style={{ padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: IMG.grad, color: "white", border: "none", cursor: "pointer" }}>Download All</button>
        </div>
      </div>
    );
  }

  // Config step
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Stepper steps={["Prompt & Objective", "Ratio & Count", "Generate"]} active={0} typeColor={IMG} />

      <Card accentColor={IMG.grad}>
        <CardInner>
          <CardLabel eyebrow="CG09 · Prompt" title="Deskripsikan Visual" accentColor={IMG.d} />
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Deskripsikan gambar yang kamu inginkan… (produk, suasana, gaya, warna)" rows={3} style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${prompt ? IMG.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, borderRadius: 16, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontFamily: "var(--gv-font-body,'Inter',sans-serif)", fontSize: 15, color: "var(--gv-color-neutral-900,#1F2428)", outline: "none", resize: "none", boxShadow: prompt ? `0 0 0 3px ${IMG.c}1E` : "none" }} />
        </CardInner>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card accentColor={IMG.grad}>
          <CardInner>
            <CardLabel eyebrow="CG10 · Objective" title="Tujuan Visual" accentColor={IMG.d} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {OBJECTIVES.map(o => (
                <div key={o.id} onClick={() => setObjective(o.id)} style={{ padding: "14px 8px", borderRadius: 16, border: `2px solid ${objective === o.id ? IMG.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: objective === o.id ? IMG.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", boxShadow: objective === o.id ? `0 0 0 3px ${IMG.c}25` : "none", transition: "all .15s" }}>
                  <span style={{ fontSize: 24 }}>{o.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: objective === o.id ? IMG.d : "var(--gv-color-neutral-900,#1F2428)", fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)" }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", lineHeight: 1.4 }}>{o.desc}</span>
                </div>
              ))}
            </div>
          </CardInner>
        </Card>

        <Card accentColor={IMG.grad}>
          <CardInner>
            <CardLabel eyebrow="CG11 · Ratio" title="Rasio & Jumlah" accentColor={IMG.d} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {RATIOS.map(r => (
                <div key={r.id} onClick={() => setRatio(r.id)} style={{ flex: 1, padding: "14px 10px", borderRadius: 16, border: `2px solid ${ratio === r.id ? IMG.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: ratio === r.id ? IMG.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "all .15s" }}>
                  <div style={{ width: r.w, height: r.h, borderRadius: 4, background: ratio === r.id ? IMG.c : "var(--gv-color-neutral-300,#D1D5DB)", opacity: ratio === r.id ? 1 : 0.5, transition: "all .15s" }} />
                  <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 800, color: ratio === r.id ? IMG.d : "var(--gv-color-neutral-700,#4A545B)" }}>{r.label}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Jumlah Gambar</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <button onClick={() => setCount(c => Math.max(1, c - 1))} style={{ width: 36, height: 36, borderRadius: 999, border: `1.5px solid ${IMG.c}`, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontSize: 18, fontWeight: 700, color: IMG.c, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 32, fontWeight: 900, color: "var(--gv-color-neutral-900,#1F2428)", letterSpacing: "-.03em" }}>{count}</span>
                <button onClick={() => setCount(c => Math.min(6, c + 1))} style={{ width: 36, height: 36, borderRadius: 999, border: `1.5px solid ${IMG.c}`, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontSize: 18, fontWeight: 700, color: IMG.c, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
          </CardInner>
        </Card>
      </div>

      <button onClick={generate} disabled={!brandId || !prompt} style={{ width: "100%", padding: 14, borderRadius: 999, fontSize: 16, fontWeight: 800, fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", background: (!brandId || !prompt) ? "var(--gv-color-neutral-200,#E5E7EB)" : IMG.grad, color: (!brandId || !prompt) ? "var(--gv-color-neutral-400,#9CA3AF)" : "white", border: "none", cursor: (!brandId || !prompt) ? "not-allowed" : "pointer", boxShadow: (!brandId || !prompt) ? "none" : `0 4px 16px ${IMG.c}40`, transition: "all .2s" }}>
        🎨 Generate Gambar
      </button>
    </div>
  );
}

// ── VIDEO FLOW ─────────────────────────────────────────────────────────────────
function VideoFlow({ brandId }: { brandId: string | null }) {
  const [step, setStep] = useState(0);
  const [hook, setHook] = useState("");
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("promo");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [progress, setProgress] = useState(0);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<any>(null);

  const OBJECTIVES = [
    { id: "promo",     emoji: "📢", name: "Promo" },
    { id: "tutorial",  emoji: "🎯", name: "Tutorial" },
    { id: "review",    emoji: "⭐", name: "Review" },
    { id: "trending",  emoji: "🔥", name: "Trending" },
    { id: "behind_scene", emoji: "🎬", name: "Behind Scene" },
  ];

  const GEN_STEPS = ["Menyiapkan brief video", "Membangun scene storyboard", "Rendering dengan Runway Gen4", "Post-processing", "Quality check"];

  async function generate() {
    if (!brandId || !hook) return;
    setStep(1);
    setProgress(0);
    setGenStepIdx(0);

    const timer = setInterval(() => {
      setProgress(p => { if (p >= 88) { clearInterval(timer); return 88; } return p + Math.random() * 8; });
      setGenStepIdx(i => Math.min(i + 1, GEN_STEPS.length - 1));
    }, 3000);

    try {
      const { data, error } = await supabase.functions.invoke("content-studio-handler", {
        body: { action: "generate_video", brand_id: brandId, hook, topic: topic || hook, objective, duration, include_hashtags: true, include_music: true },
      });
      clearInterval(timer);
      if (error) throw error;
      setProgress(100);
      setResult(data);
      setTimeout(() => setStep(2), 600);
    } catch {
      clearInterval(timer);
      setStep(0);
    }
  }

  if (step === 1) {
    return <GeneratingState label="Rendering video…" sub="Runway Gen4 Turbo sedang bekerja" progress={Math.round(progress)} steps={GEN_STEPS.map((l, i) => ({ label: l, done: i < genStepIdx, active: i === genStepIdx }))} typeColor={VID} />;
  }

  if (step === 2) {
    const videoUrl = result?.video_url ?? null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ borderRadius: 24, overflow: "hidden", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", background: "var(--gv-color-bg-surface,#fff)", boxShadow: "var(--gv-shadow-card)" }}>
          <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--gv-color-bg-sunken,#EFF2F4)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 60%,${VID.c}25,transparent 60%)` }} />
            {videoUrl ? (
              <video src={videoUrl} controls style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
            ) : (
              <>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${VID.c}E6`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, boxShadow: `0 0 0 12px ${VID.c}35,0 0 0 24px ${VID.c}15`, cursor: "pointer" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 4 }}><polygon points="5,3 19,12 5,21" /></svg>
                </div>
                <div style={{ position: "absolute", bottom: 8, right: 10, fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-neutral-700)", background: "rgba(0,0,0,.5)", padding: "2px 6px", borderRadius: 4 }}>0:{duration}0</div>
              </>
            )}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(255,255,255,.15)" }}>
              <div style={{ height: "100%", width: "28%", background: VID.grad }} />
            </div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 16, fontWeight: 700, color: "var(--gv-color-neutral-900,#1F2428)", marginBottom: 4 }}>{topic || hook}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--gv-color-neutral-500)" }}>
              <span>{objective}</span>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--gv-color-neutral-300)" }} />
              <span>{duration}s</span>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--gv-color-neutral-300)" }} />
              <span>Runway Gen4</span>
            </div>
            {result?.hashtags && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {(result.hashtags as string[]).slice(0, 6).map((h: string, i: number) => (
                  <span key={i} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: VID.l, color: VID.d, border: `1px solid ${VID.m}` }}>{h}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gv-color-neutral-100,#F3F4F6)" }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "8px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: VID.l, color: VID.d, border: `1px solid ${VID.m}`, cursor: "pointer" }}>Buat Lagi</button>
              {videoUrl && <a href={videoUrl} download style={{ flex: 1, padding: "8px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: VID.grad, color: "white", textAlign: "center", textDecoration: "none" }}>Download</a>}
              <button style={{ flex: 1, padding: "8px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "var(--gv-gradient-primary)", color: "white", border: "none", cursor: "pointer" }}>Jadwalkan</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Stepper steps={["Hook & Topik", "Objective", "Generate"]} active={0} typeColor={VID} />

      <Card accentColor={VID.grad}>
        <CardInner>
          <CardLabel eyebrow="CG14 · Video Config" title="Buat Video" accentColor={VID.d} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--gv-font-body,'Inter',sans-serif)", color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Hook Pembuka</p>
              <input value={hook} onChange={e => setHook(e.target.value)} placeholder="Kalimat pembuka yang menarik…" style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${hook ? VID.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, borderRadius: 16, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontFamily: "var(--gv-font-body,'Inter',sans-serif)", fontSize: 15, color: "var(--gv-color-neutral-900,#1F2428)", outline: "none" }} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--gv-font-body,'Inter',sans-serif)", color: "var(--gv-color-neutral-500)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Topik Video</p>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topik utama konten video…" style={{ width: "100%", padding: "10px 14px", border: "1.5px solid var(--gv-color-neutral-200,#E5E7EB)", borderRadius: 16, background: "var(--gv-color-bg-elevated,#FAFBFC)", fontFamily: "var(--gv-font-body,'Inter',sans-serif)", fontSize: 15, color: "var(--gv-color-neutral-900,#1F2428)", outline: "none" }} />
            </div>
          </div>
        </CardInner>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card accentColor={VID.grad}>
          <CardInner>
            <CardLabel eyebrow="Objective" title="Tujuan Video" accentColor={VID.d} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {OBJECTIVES.map(o => (
                <div key={o.id} onClick={() => setObjective(o.id)} style={{ padding: "10px 6px", borderRadius: 12, border: `1.5px solid ${objective === o.id ? VID.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: objective === o.id ? VID.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", boxShadow: objective === o.id ? `0 0 0 3px ${VID.c}20` : "none", transition: "all .15s" }}>
                  <span style={{ fontSize: 20 }}>{o.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: objective === o.id ? VID.d : "var(--gv-color-neutral-700,#4A545B)", fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)" }}>{o.name}</span>
                </div>
              ))}
            </div>
          </CardInner>
        </Card>

        <Card accentColor={VID.grad}>
          <CardInner>
            <CardLabel eyebrow="Duration" title="Durasi Video" accentColor={VID.d} />
            <div style={{ display: "flex", gap: 10 }}>
              {([5, 10] as (5 | 10)[]).map(d => (
                <div key={d} onClick={() => setDuration(d)} style={{ flex: 1, padding: "20px 10px", borderRadius: 16, border: `2px solid ${duration === d ? VID.c : "var(--gv-color-neutral-200,#E5E7EB)"}`, background: duration === d ? VID.l : "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all .15s" }}>
                  <span style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 28, fontWeight: 900, color: duration === d ? VID.c : "var(--gv-color-neutral-900,#1F2428)" }}>{d}s</span>
                  <span style={{ fontSize: 12, color: "var(--gv-color-neutral-500)", fontFamily: "var(--gv-font-mono)" }}>{d === 5 ? "Short-form" : "Long-form"}</span>
                </div>
              ))}
            </div>
          </CardInner>
        </Card>
      </div>

      <button onClick={generate} disabled={!brandId || !hook} style={{ width: "100%", padding: 14, borderRadius: 999, fontSize: 16, fontWeight: 800, fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", background: (!brandId || !hook) ? "var(--gv-color-neutral-200,#E5E7EB)" : VID.grad, color: (!brandId || !hook) ? "var(--gv-color-neutral-400,#9CA3AF)" : "white", border: "none", cursor: (!brandId || !hook) ? "not-allowed" : "pointer", boxShadow: (!brandId || !hook) ? "none" : `0 4px 16px ${VID.c}40`, transition: "all .2s" }}>
        🎬 Generate Video
      </button>
    </div>
  );
}

// ── CENTER ─────────────────────────────────────────────────────────────────────
function ContentCenter({ activeTab, brandId, sotTopics }: { activeTab: TabType; brandId: string | null; sotTopics: SotTopic[] }) {
  const typeColor = activeTab === "Article" ? ART : activeTab === "Image" ? IMG : VID;

  return (
    <div style={{ padding: "0 2px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${typeColor.c}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 16 }}>{activeTab === "Article" ? "✍️" : activeTab === "Image" ? "🎨" : "🎬"}</span>
        </div>
        <div>
          <p style={{ fontFamily: "var(--gv-font-mono,'JetBrains Mono',monospace)", fontSize: 11, fontWeight: 600, color: typeColor.d, letterSpacing: ".1em", textTransform: "uppercase" }}>Content Engine</p>
          <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 17, fontWeight: 800, color: "var(--gv-color-neutral-900,#1F2428)", letterSpacing: "-.02em" }}>{activeTab} Generator</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, background: `${typeColor.c}15`, border: `1px solid ${typeColor.c}35`, fontSize: 12, fontWeight: 800, fontFamily: "var(--gv-font-mono)", color: typeColor.d }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor.c, animation: "gv-pulse-dot 2s infinite" }} />
          AI Ready
        </div>
      </div>

      {activeTab === "Article" && <ArticleFlow brandId={brandId} sotTopics={sotTopics} />}
      {activeTab === "Image"   && <ImageFlow brandId={brandId} />}
      {activeTab === "Video"   && <VideoFlow brandId={brandId} />}
    </div>
  );
}

// ── RIGHT PANEL ───────────────────────────────────────────────────────────────
function ContentRight({ brandId, stats, history, histFilter, onHistFilter }: {
  brandId: string | null;
  stats: { articles: number; images: number; videos: number };
  history: HistItem[];
  histFilter: string;
  onHistFilter: (f: string) => void;
}) {
  const filtered = histFilter === "all" ? history : history.filter(h => h.type === histFilter);
  const PLATFORMS = [
    { id: "ig", name: "Instagram", dot: "linear-gradient(135deg,#F09433,#BC1888)", fit: 92, tags: ["Reels", "Feed", "Story"] },
    { id: "tt", name: "TikTok",    dot: "#00f2ea",                                 fit: 87, tags: ["Video", "Sound"] },
    { id: "li", name: "LinkedIn",  dot: "#0077B5",                                 fit: 74, tags: ["Article", "Post"] },
    { id: "wa", name: "WhatsApp",  dot: "#25D366",                                 fit: 68, tags: ["Broadcast"] },
  ];

  // Calendar mini
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays: (number | null)[] = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)];
  const monthName = today.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  function typeIcon(type: string) {
    if (type === "article") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ART.c} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>;
    if (type === "image") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={IMG.c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>;
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={VID.c} strokeWidth="2" strokeLinecap="round"><polygon points="23,7 16,12 23,17" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>;
  }

  function statusBadge(s: string, type: string) {
    const tc = type === "article" ? ART : type === "image" ? IMG : VID;
    const map: Record<string, [string, string]> = {
      done:      ["var(--gv-color-success-50,#ECFDF3)", "var(--gv-color-success-500,#10B981)"],
      scheduled: ["var(--gv-color-primary-50,#EDF5F4)", "var(--gv-color-primary-600,#4E7C78)"],
      draft:     [tc.l, tc.d],
    };
    const [bg, color] = map[s] ?? ["var(--gv-color-neutral-100,#F3F4F6)", "var(--gv-color-neutral-500,#6B7280)"];
    return <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "var(--gv-font-mono)", padding: "2px 7px", borderRadius: 999, background: bg, color, textTransform: "uppercase" }}>{s}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* CG20 Stats */}
      <Card>
        <div style={{ padding: "18px 20px 14px" }}>
          <p style={{ fontFamily: "var(--gv-font-mono,'JetBrains Mono',monospace)", fontSize: 11, fontWeight: 600, color: "rgba(167,139,250,.75)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>Content Engine</p>
          <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 18, fontWeight: 900, color: "var(--gv-color-neutral-900,#1F2428)", letterSpacing: "-.025em", marginBottom: 12 }}>Stats Bulan Ini</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { icon: "✍️", val: stats.articles, label: "Artikel",  color: ART },
              { icon: "🎨", val: stats.images,   label: "Gambar",   color: IMG },
              { icon: "🎬", val: stats.videos,   label: "Video",    color: VID },
            ].map(s => (
              <div key={s.label} style={{ padding: 12, borderRadius: 16, background: "var(--gv-color-bg-sunken,#EFF2F4)", border: "1px solid var(--gv-color-neutral-200,#E5E7EB)" }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 22, fontWeight: 900, color: s.color.c, letterSpacing: "-.03em", lineHeight: 1 }}>{s.val}</p>
                <p style={{ fontFamily: "var(--gv-font-mono)", fontSize: 11, fontWeight: 600, color: "var(--gv-color-neutral-400)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* CG07 Platform Recommendations */}
      <Card>
        <CardInner>
          <CardLabel eyebrow="CG07 · Platform" title="Rekomendasi Platform" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PLATFORMS.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", background: "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: p.dot, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 13, fontWeight: 800, color: "white" }}>{p.name[0]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--gv-color-neutral-900,#1F2428)", marginBottom: 4 }}>{p.name}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--gv-color-neutral-500)" }}>Fit</span>
                    <div style={{ width: 60, height: 4, background: "var(--gv-color-neutral-100,#F3F4F6)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${p.fit}%`, background: "var(--gv-gradient-primary)" }} />
                    </div>
                    <span style={{ fontFamily: "var(--gv-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--gv-color-primary-600,#4E7C78)" }}>{p.fit}%</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {p.tags.map(t => <span key={t} style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--gv-font-mono)", padding: "2px 6px", borderRadius: 999, background: "var(--gv-color-primary-50,#EDF5F4)", color: "var(--gv-color-primary-700,#3D6562)", textTransform: "uppercase" }}>{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </CardInner>
      </Card>

      {/* CG17 History Hub */}
      <Card>
        <CardInner>
          <CardLabel eyebrow="CG17 · History" title="Riwayat Konten" />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { id: "all",     label: "Semua",   cnt: history.length },
              { id: "article", label: "Artikel",  cnt: history.filter(h => h.type === "article").length },
              { id: "image",   label: "Gambar",  cnt: history.filter(h => h.type === "image").length },
              { id: "video",   label: "Video",   cnt: history.filter(h => h.type === "video").length },
            ].map(f => {
              const isActive = histFilter === f.id;
              const bg = isActive ? (f.id === "all" ? "var(--gv-color-neutral-900,#1F2428)" : f.id === "article" ? ART.l : f.id === "image" ? IMG.l : VID.l) : "var(--gv-color-bg-elevated,#FAFBFC)";
              const color = isActive ? (f.id === "all" ? "white" : f.id === "article" ? ART.d : f.id === "image" ? IMG.d : VID.d) : "var(--gv-color-neutral-500)";
              const border = isActive ? (f.id === "all" ? "var(--gv-color-neutral-900)" : f.id === "article" ? ART.c : f.id === "image" ? IMG.c : VID.c) : "var(--gv-color-neutral-200,#E5E7EB)";
              return (
                <button key={f.id} onClick={() => onHistFilter(f.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: "var(--gv-font-body,'Inter',sans-serif)", cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color }}>
                  {f.label}
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", fontSize: 10, background: "rgba(0,0,0,.1)" }}>{f.cnt}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--gv-color-neutral-400)", textAlign: "center", padding: "20px 0" }}>Belum ada konten yang dibuat.</p>
            ) : filtered.map(h => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--gv-color-neutral-200,#E5E7EB)", background: "var(--gv-color-bg-elevated,#FAFBFC)", cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: h.type === "article" ? ART.l : h.type === "image" ? IMG.l : VID.l }}>
                  {typeIcon(h.type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900,#1F2428)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.title}</p>
                  <p style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", marginTop: 1 }}>{timeAgo(h.created_at)}</p>
                </div>
                {statusBadge(h.status ?? "draft", h.type)}
              </div>
            ))}
          </div>
        </CardInner>
      </Card>

      {/* CG18 Calendar mini */}
      <Card>
        <CardInner>
          <CardLabel eyebrow="CG18 · Calendar" title="Content Calendar" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontFamily: "var(--gv-font-heading,'Manrope',sans-serif)", fontSize: 15, fontWeight: 800, color: "var(--gv-color-neutral-900,#1F2428)" }}>{monthName}</p>
            <div style={{ display: "flex", gap: 4 }}>
              {["‹","›"].map((arrow, i) => (
                <button key={i} style={{ width: 26, height: 26, borderRadius: 999, border: "1.5px solid var(--gv-color-neutral-200,#E5E7EB)", background: "var(--gv-color-bg-elevated,#FAFBFC)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13 }}>{arrow}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(d => (
              <div key={d} style={{ fontFamily: "var(--gv-font-mono)", fontSize: 10, fontWeight: 700, color: "var(--gv-color-neutral-400)", textAlign: "center", padding: "3px 0", textTransform: "uppercase" }}>{d}</div>
            ))}
            {calDays.map((day, i) => {
              if (!day) return <div key={i} />;
              const isToday = day === today.getDate();
              return (
                <div key={i} style={{ aspectRatio: "1", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? "white" : "var(--gv-color-neutral-700,#4A545B)", background: isToday ? "var(--gv-color-neutral-900,#1F2428)" : "transparent", cursor: "pointer", position: "relative" }}>
                  {day}
                </div>
              );
            })}
          </div>
        </CardInner>
      </Card>

    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ContentStudioPage() {
  const [activeTab, setActiveTab] = useState<TabType>("Article");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [sotTopics, setSotTopics] = useState<SotTopic[]>([]);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [histFilter, setHistFilter] = useState("all");
  const [stats, setStats] = useState({ articles: 0, images: 0, videos: 0 });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get brand profile
      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("id, source_of_truth")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (bp) {
        setBrandId(bp.id);
        const sot = bp.source_of_truth as any;
        const topics: SotTopic[] = sot?.content_calendar?.recommended_topics ?? [];
        setSotTopics(topics);

        // Fetch history
        const { data: hist } = await supabase.functions.invoke("content-studio-handler", {
          body: { action: "get_history", brand_id: bp.id, limit: 30, type: "all" },
        });
        if (hist) {
          const articles = (hist.articles ?? []).map((a: any) => ({ id: a.id, type: "article" as const, title: a.topic ?? a.meta_title ?? "Artikel", status: a.status ?? "done", created_at: a.created_at }));
          const images   = (hist.images   ?? []).map((i: any) => ({ id: i.id, type: "image"   as const, title: i.topic ?? i.prompt_text ?? "Gambar",  status: i.status ?? "done", created_at: i.created_at }));
          const videos   = (hist.videos   ?? []).map((v: any) => ({ id: v.id, type: "video"   as const, title: v.topic ?? v.hook ?? "Video",           status: v.video_status ?? "done", created_at: v.created_at }));
          const all = [...articles, ...images, ...videos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setHistory(all);
          setStats({ articles: articles.length, images: images.length, videos: videos.length });
        }
      }
    })();
  }, []);

  return (
    <>
      <style>{`
        @keyframes gv-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes gv-shimmer{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes gv-pulse-dot{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
      `}</style>
      <AppShell
        activeSubItem={activeTab}
        onSubMenuChange={(_section, sub) => setActiveTab(sub as TabType)}
        center={<ContentCenter activeTab={activeTab} brandId={brandId} sotTopics={sotTopics} />}
        right={<ContentRight brandId={brandId} stats={stats} history={history} histFilter={histFilter} onHistFilter={setHistFilter} />}
      />
    </>
  );
}
