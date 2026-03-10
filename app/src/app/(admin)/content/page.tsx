"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import ThreeColumnLayout from "@/components/shared/ThreeColumnLayout";
import NavColumn from "@/components/shared/NavColumn";
import { ContentSideNav, ContentPillNav, type ContentSection } from "@/components/content/ContentNav";
import { supabase } from "@/lib/supabase";
import { useUserQuota } from "@/hooks/useUserQuota";

// ── DS v5.8 mode token helpers ─────────────────────────────────────
const MODE_TOKENS = {
  article: { accent: "var(--gv7-mode-general-accent)", light: "var(--gv7-mode-general-light)", border: "var(--gv7-mode-general-border)", text: "var(--gv7-mode-general-text)" },
  image:   { accent: "var(--gv7-mode-seo-accent)",     light: "var(--gv7-mode-seo-light)",     border: "var(--gv7-mode-seo-border)",     text: "var(--gv7-mode-seo-text)"     },
  video:   { accent: "var(--gv7-mode-geo-accent)",     light: "var(--gv7-mode-geo-light)",     border: "var(--gv7-mode-geo-border)",     text: "var(--gv7-mode-geo-text)"     },
} as const;

// ── Types — match real Supabase table columns ──────────────────────
interface HistoryArticle { id: string; topic: string; meta_title: string; content: string; objective: string; status: string; created_at: string; }
interface HistoryImage   { id: string; image_url: string; prompt_text: string; status: string; created_at: string; }
interface HistoryVideo   { id: string; video_url: string; hook: string; video_status: string; created_at: string; }

// ── Utilities ──────────────────────────────────────────────────────
async function fetchSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function callContent(token: string, body: Record<string, unknown>) {
  const res = await fetch("/api/content", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
  return res.json();
}

// ── DS v5.8 Input ──────────────────────────────────────────────────
function GVTextarea({ value, onChange, placeholder, rows = 3, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--gv-radius-sm)",
        border: "1.5px solid var(--gv-color-neutral-200)",
        background: "var(--gv-color-bg-surface)",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--gv-color-neutral-900)",
        resize: "vertical",
        outline: "none",
        transition: "border-color var(--gv-duration-fast) var(--gv-easing-default)",
        fontFamily: "var(--gv-font-body)",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gv7-mode-general-accent)"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gv-color-neutral-200)"; }}
    />
  );
}

// ── DS v5.8 Chip group ─────────────────────────────────────────────
function ChipGroup<T extends string>({ options, value, onChange, mode }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  mode: "article" | "image" | "video";
}) {
  const m = MODE_TOKENS[mode];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              border: `1.5px solid ${active ? m.border : "var(--gv-color-neutral-200)"}`,
              background: active ? m.light : "var(--gv-color-neutral-50)",
              color: active ? m.text : "var(--gv-color-neutral-500)",
              transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
              outline: "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── DS v5.8 Generate Button ────────────────────────────────────────
function GenerateBtn({ onClick, loading, disabled, mode, children }: {
  onClick: () => void; loading: boolean; disabled?: boolean; mode: "article" | "image" | "video"; children: React.ReactNode;
}) {
  const m = MODE_TOKENS[mode];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 16px",
        borderRadius: "var(--gv-radius-sm)",
        border: "none",
        background: disabled || loading ? "var(--gv-color-neutral-200)" : m.accent,
        color: disabled || loading ? "var(--gv-color-neutral-400)" : "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
        boxShadow: disabled || loading ? "none" : `0 2px 12px ${m.accent}40`,
      }}
    >
      {loading ? (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
          <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Section label + divider ────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gv-color-neutral-400)", marginBottom: 6 }}>
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ARTICLE WIZARD
// ═══════════════════════════════════════════════════════════════════
const ARTICLE_OBJECTIVES = [
  { value: "seo_blog", label: "SEO Blog" },
  { value: "product_review", label: "Product Review" },
  { value: "how_to", label: "How-To Guide" },
  { value: "brand_story", label: "Brand Story" },
  { value: "social_caption", label: "Social Caption" },
  { value: "press_release", label: "Press Release" },
] as const;

const ARTICLE_LENGTHS = [
  { value: "short", label: "Short · 300w" },
  { value: "medium", label: "Medium · 800w" },
  { value: "long", label: "Long · 1500w" },
  { value: "very_long", label: "Deep · 3000w" },
] as const;

type ArticleObjective = typeof ARTICLE_OBJECTIVES[number]["value"];
type ArticleLength    = typeof ARTICLE_LENGTHS[number]["value"];

function ArticleWizard({ brandId, onGenerated }: { brandId: string | null; onGenerated: () => void }) {
  const [topic, setTopic]         = useState("");
  const [objective, setObjective] = useState<ArticleObjective>("seo_blog");
  const [length, setLength]       = useState<ArticleLength>("medium");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return;
    setLoading(true); setError(null); setDone(false);
    try {
      const token = await fetchSession();
      if (!token) throw new Error("Not authenticated");
      await callContent(token, { action: "generate_article", brand_id: brandId, topic, objective, length });
      setDone(true);
      setTopic("");
      onGenerated();
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [topic, objective, length, brandId, onGenerated]);

  const m = MODE_TOKENS.article;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Topic */}
      <div>
        <FieldLabel>Topic or Brief</FieldLabel>
        <GVTextarea value={topic} onChange={setTopic} placeholder="e.g. 5 benefits of sustainable fashion for Gen Z audience…" rows={3} disabled={loading} />
      </div>

      {/* Objective */}
      <div>
        <FieldLabel>Content Objective</FieldLabel>
        <ChipGroup options={ARTICLE_OBJECTIVES as unknown as { value: ArticleObjective; label: string }[]} value={objective} onChange={setObjective} mode="article" />
      </div>

      {/* Length */}
      <div>
        <FieldLabel>Article Length</FieldLabel>
        <ChipGroup options={ARTICLE_LENGTHS as unknown as { value: ArticleLength; label: string }[]} value={length} onChange={setLength} mode="article" />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--gv-radius-xs)", background: "var(--gv-color-danger-50)", color: "var(--gv-color-danger-700)", fontSize: 12, border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <GenerateBtn onClick={handleGenerate} loading={loading} disabled={!topic.trim()} mode="article">
        {done ? "Article generated!" : loading ? "Writing article…" : "Generate Article"}
      </GenerateBtn>

      {/* Hint */}
      {!brandId && (
        <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", textAlign: "center" }}>
          Connect a brand profile to unlock brand voice &amp; tone
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// IMAGE WIZARD
// ═══════════════════════════════════════════════════════════════════
const IMAGE_OBJECTIVES = [
  { value: "product_hero", label: "Product Hero" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "social_post", label: "Social Post" },
  { value: "brand_story", label: "Brand Story" },
  { value: "abstract", label: "Abstract" },
  { value: "infographic", label: "Infographic" },
] as const;

const IMAGE_RATIOS = [
  { value: "1:1", label: "1:1 · Square" },
  { value: "4:5", label: "4:5 · Portrait" },
  { value: "16:9", label: "16:9 · Wide" },
  { value: "9:16", label: "9:16 · Story" },
] as const;

type ImageObjective = typeof IMAGE_OBJECTIVES[number]["value"];
type ImageRatio     = typeof IMAGE_RATIOS[number]["value"];

function ImageWizard({ brandId, onGenerated }: { brandId: string | null; onGenerated: () => void }) {
  const [topic, setTopic]         = useState("");
  const [objective, setObjective] = useState<ImageObjective>("product_hero");
  const [ratio, setRatio]         = useState<ImageRatio>("1:1");
  const [count, setCount]         = useState(2);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [refs, setRefs]           = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadRef = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const path = `${session.user.id}/refs/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("content-refs").upload(path, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("content-refs").getPublicUrl(path);
      setRefs((prev) => [...prev, publicUrl]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(uploadRef);
  };

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return;
    if (!brandId) { setError("Connect a brand profile to generate images."); return; }
    setLoading(true); setError(null); setDone(false);
    try {
      const token = await fetchSession();
      if (!token) throw new Error("Not authenticated");
      await callContent(token, { action: "generate_image", brand_id: brandId, topic, objective, ratio, count, ref_images: refs });
      setDone(true);
      setTopic(""); setRefs([]);
      onGenerated();
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [topic, objective, ratio, count, refs, brandId, onGenerated]);

  const m = MODE_TOKENS.image;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Prompt */}
      <div>
        <FieldLabel>Prompt / Topic</FieldLabel>
        <GVTextarea value={topic} onChange={setTopic} placeholder="e.g. Minimalist white sneakers on marble surface, editorial lighting…" rows={3} disabled={loading} />
      </div>

      {/* Objective */}
      <div>
        <FieldLabel>Image Style</FieldLabel>
        <ChipGroup options={IMAGE_OBJECTIVES as unknown as { value: ImageObjective; label: string }[]} value={objective} onChange={setObjective} mode="image" />
      </div>

      {/* Ratio + Count row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <FieldLabel>Aspect Ratio</FieldLabel>
          <ChipGroup options={IMAGE_RATIOS as unknown as { value: ImageRatio; label: string }[]} value={ratio} onChange={setRatio} mode="image" />
        </div>
        <div>
          <FieldLabel>Count</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  width: 36,
                  height: 32,
                  borderRadius: "var(--gv-radius-xs)",
                  border: `1.5px solid ${count === n ? m.border : "var(--gv-color-neutral-200)"}`,
                  background: count === n ? m.light : "var(--gv-color-neutral-50)",
                  color: count === n ? m.text : "var(--gv-color-neutral-500)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  outline: "none",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reference images */}
      <div>
        <FieldLabel>Reference Images (optional)</FieldLabel>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${refs.length ? m.border : "var(--gv-color-neutral-200)"}`,
            borderRadius: "var(--gv-radius-sm)",
            background: refs.length ? m.light : "var(--gv-color-neutral-50)",
            padding: "12px",
            cursor: "pointer",
            transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {refs.map((url, i) => (
            <div key={i} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: `1px solid ${m.border}` }} />
              <button
                onClick={(e) => { e.stopPropagation(); setRefs((p) => p.filter((_, j) => j !== i)); }}
                style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: 99, background: "#ef4444", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>
          ))}
          {uploading ? (
            <span style={{ fontSize: 11, color: m.text }}>Uploading…</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)" }}>
              {refs.length ? `${refs.length} image${refs.length > 1 ? "s" : ""} · click to add more` : "+ Upload reference images"}
            </span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileChange} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--gv-radius-xs)", background: "var(--gv-color-danger-50)", color: "var(--gv-color-danger-700)", fontSize: 12, border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <GenerateBtn onClick={handleGenerate} loading={loading} disabled={!topic.trim()} mode="image">
        {done ? "Images queued!" : loading ? "Generating images…" : `Generate ${count} Image${count > 1 ? "s" : ""}`}
      </GenerateBtn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO WIZARD
// ═══════════════════════════════════════════════════════════════════
const VIDEO_OBJECTIVES = [
  { value: "product_demo", label: "Product Demo" },
  { value: "brand_film", label: "Brand Film" },
  { value: "social_reel", label: "Social Reel" },
  { value: "testimonial", label: "Testimonial" },
  { value: "explainer", label: "Explainer" },
] as const;

const VIDEO_RATIOS = [
  { value: "16:9", label: "16:9 · Wide" },
  { value: "9:16", label: "9:16 · Vertical" },
  { value: "1:1", label: "1:1 · Square" },
] as const;

const VIDEO_DURATIONS = [
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 16, label: "16s" },
  { value: 32, label: "32s" },
] as const;

type VideoObjective = typeof VIDEO_OBJECTIVES[number]["value"];
type VideoRatio     = typeof VIDEO_RATIOS[number]["value"];

function VideoWizard({ brandId, onGenerated }: { brandId: string | null; onGenerated: () => void }) {
  const [topic, setTopic]         = useState("");
  const [objective, setObjective] = useState<VideoObjective>("social_reel");
  const [ratio, setRatio]         = useState<VideoRatio>("9:16");
  const [duration, setDuration]   = useState(10);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return;
    if (!brandId) { setError("Connect a brand profile to generate videos."); return; }
    setLoading(true); setError(null); setDone(false);
    try {
      const token = await fetchSession();
      if (!token) throw new Error("Not authenticated");
      await callContent(token, { action: "generate_video", brand_id: brandId, topic, objective, ratio, duration });
      setDone(true);
      setTopic("");
      onGenerated();
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [topic, objective, ratio, duration, brandId, onGenerated]);

  const m = MODE_TOKENS.video;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Topic */}
      <div>
        <FieldLabel>Video Brief</FieldLabel>
        <GVTextarea value={topic} onChange={setTopic} placeholder="e.g. Showcase our new sneaker drop with cinematic slow-motion footage, urban aesthetic…" rows={4} disabled={loading} />
      </div>

      {/* Objective */}
      <div>
        <FieldLabel>Video Type</FieldLabel>
        <ChipGroup options={VIDEO_OBJECTIVES as unknown as { value: VideoObjective; label: string }[]} value={objective} onChange={setObjective} mode="video" />
      </div>

      {/* Ratio + Duration */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <FieldLabel>Format</FieldLabel>
          <ChipGroup options={VIDEO_RATIOS as unknown as { value: VideoRatio; label: string }[]} value={ratio} onChange={setRatio} mode="video" />
        </div>
        <div>
          <FieldLabel>Duration</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {VIDEO_DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "var(--gv-radius-xs)",
                  border: `1.5px solid ${duration === d.value ? m.border : "var(--gv-color-neutral-200)"}`,
                  background: duration === d.value ? m.light : "var(--gv-color-neutral-50)",
                  color: duration === d.value ? m.text : "var(--gv-color-neutral-500)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  outline: "none",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Runway watermark notice */}
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--gv-radius-xs)", background: m.light, border: `1px solid ${m.border}` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.accent} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill={m.accent}/>
        </svg>
        <p style={{ fontSize: 11, color: m.text, lineHeight: 1.4 }}>Powered by Runway Gen 4 Turbo. Rendered in ~60s.</p>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--gv-radius-xs)", background: "var(--gv-color-danger-50)", color: "var(--gv-color-danger-700)", fontSize: 12, border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      <GenerateBtn onClick={handleGenerate} loading={loading} disabled={!topic.trim()} mode="video">
        {done ? "Video queued!" : loading ? "Generating video…" : `Generate ${duration}s Video`}
      </GenerateBtn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIGHT PANEL — History / Preview
// ═══════════════════════════════════════════════════════════════════
function HistoryPanel({ activeSection, refreshKey, brandId }: { activeSection: ContentSection; refreshKey: number; brandId: string | null; }) {
  const [articles, setArticles] = useState<HistoryArticle[]>([]);
  const [images, setImages]     = useState<HistoryImage[]>([]);
  const [videos, setVideos]     = useState<HistoryVideo[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      if (!brandId) return;
      setLoading(true);
      try {
        const [aRes, iRes, vRes] = await Promise.all([
          supabase.from("gv_article_generations")
            .select("id,topic,meta_title,content,objective,status,created_at")
            .eq("brand_id", brandId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("gv_image_generations")
            .select("id,image_url,prompt_text,status,created_at")
            .eq("brand_id", brandId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("gv_video_generations")
            .select("id,video_url,hook,video_status,created_at")
            .eq("brand_id", brandId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        if (!aRes.error && aRes.data) setArticles(aRes.data as HistoryArticle[]);
        if (!iRes.error && iRes.data) setImages(iRes.data as HistoryImage[]);
        if (!vRes.error && vRes.data) setVideos(vRes.data as HistoryVideo[]);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [brandId, refreshKey]);

  const m = MODE_TOKENS[activeSection];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--gv-color-neutral-100)", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-heading)" }}>
          Recent
        </p>
        <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>
          {activeSection === "article" ? "Generated articles" : activeSection === "image" ? "Generated images" : "Generated videos"}
        </p>
      </div>

      {/* List */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gv-color-neutral-300)" strokeWidth="2">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
              <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round"/>
            </svg>
          </div>
        )}

        {/* Articles */}
        {activeSection === "article" && !loading && (
          articles.length === 0 ? (
            <EmptyState mode="article" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {articles.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--gv-radius-sm)",
                    border: `1.5px solid ${expanded === a.id ? m.border : "var(--gv-color-neutral-100)"}`,
                    background: expanded === a.id ? m.light : "var(--gv-color-bg-surface)",
                    cursor: "pointer",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--gv-color-neutral-800)", lineHeight: 1.3, flex: 1 }}>{a.meta_title || a.topic || "Untitled"}</p>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: m.light, color: m.text, whiteSpace: "nowrap", flexShrink: 0 }}>{a.objective || "blog"}</span>
                  </div>
                  {expanded === a.id && (
                    <p style={{ fontSize: 11, color: "var(--gv-color-neutral-500)", marginTop: 6, lineHeight: 1.5 }}>
                      {a.content?.slice(0, 200)}{(a.content?.length ?? 0) > 200 ? "…" : ""}
                    </p>
                  )}
                  <p style={{ fontSize: 10, color: "var(--gv-color-neutral-300)", marginTop: 4 }}>
                    {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )
        )}

        {/* Images */}
        {activeSection === "image" && !loading && (
          images.length === 0 ? (
            <EmptyState mode="image" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {images.map((img) => (
                <div
                  key={img.id}
                  style={{
                    borderRadius: "var(--gv-radius-sm)",
                    overflow: "hidden",
                    border: "1px solid var(--gv-color-neutral-100)",
                    background: "var(--gv-color-neutral-50)",
                    cursor: "pointer",
                    transition: "all var(--gv-duration-fast) var(--gv-easing-default)",
                    aspectRatio: "1/1",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "var(--gv7-depth-3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img.image_url && <img src={img.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                </div>
              ))}
            </div>
          )
        )}

        {/* Videos */}
        {activeSection === "video" && !loading && (
          videos.length === 0 ? (
            <EmptyState mode="video" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {videos.map((v) => (
                <div
                  key={v.id}
                  style={{
                    borderRadius: "var(--gv-radius-sm)",
                    overflow: "hidden",
                    border: "1px solid var(--gv-color-neutral-100)",
                    background: "var(--gv-color-neutral-50)",
                    aspectRatio: "16/9",
                  }}
                >
                  {v.video_url ? (
                    <video src={v.video_url} controls style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--gv-color-neutral-400)" }}>
                        {v.video_status === "processing" ? "Rendering…" : "Processing"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: "article" | "image" | "video" }) {
  const m = MODE_TOKENS[mode];
  const labels = { article: "articles yet", image: "images yet", video: "videos yet" };
  return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <div style={{ width: 40, height: 40, borderRadius: "var(--gv-radius-sm)", background: m.light, border: `1.5px solid ${m.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={m.accent} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <p style={{ fontSize: 12, color: "var(--gv-color-neutral-400)" }}>No {labels[mode]}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function ContentPage() {
  const [activeSection, setActiveSection] = useState<ContentSection>("article");
  const [brandId, setBrandId]             = useState<string | null>(null);
  const [refreshKey, setRefreshKey]       = useState(0);
  const { quota: userQuota, loading: quotaLoading } = useUserQuota();

  // Load brand
  useEffect(() => {
    const loadBrand = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data) setBrandId(data.id);
    };
    loadBrand();
  }, []);

  const handleGenerated = useCallback(() => setRefreshKey((k) => k + 1), []);

  const m = MODE_TOKENS[activeSection];

  // ── Center panel ────────────────────────────────────────────────
  const center = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--gv-color-neutral-100)",
          background: "var(--gv7-glass)",
          backdropFilter: "blur(var(--gv-blur-sm))",
          WebkitBackdropFilter: "blur(var(--gv-blur-sm))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-heading)", lineHeight: 1.2 }}>
              Content Generator
            </h1>
            <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>
              AI-powered · Supabase edge functions
            </p>
          </div>
          {/* Active section badge */}
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: m.light,
              color: m.text,
              border: `1px solid ${m.border}`,
              transition: "all var(--gv-duration-normal) var(--gv-easing-default)",
            }}
          >
            {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
          </span>
        </div>

        {/* Pill nav */}
        <ContentPillNav active={activeSection} onChange={setActiveSection} />
      </div>

      {/* Wizard body */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {/* Quota gate */}
        {!quotaLoading && !userQuota.feature_content_enabled ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--gv-radius-sm)",
              background: "var(--gv-color-warning-50)",
              border: "1.5px solid #fde68a",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--gv-color-warning-700)" }}>Content Generator requires an active plan</p>
            <p style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>Upgrade to unlock Article, Image, and Video generation.</p>
          </div>
        ) : (
          <>
            {activeSection === "article" && <ArticleWizard brandId={brandId} onGenerated={handleGenerated} />}
            {activeSection === "image"   && <ImageWizard   brandId={brandId} onGenerated={handleGenerated} />}
            {activeSection === "video"   && <VideoWizard   brandId={brandId} onGenerated={handleGenerated} />}
          </>
        )}
      </div>
    </div>
  );

  // ── Left section nav ─────────────────────────────────────────────
  const left = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--gv-color-neutral-100)", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--gv-color-neutral-900)", fontFamily: "var(--gv-font-heading)" }}>Create</p>
        <p style={{ fontSize: 11, color: "var(--gv-color-neutral-400)", marginTop: 2 }}>Choose content type</p>
      </div>
      {/* Nav */}
      <div style={{ padding: "10px 10px", flex: 1 }}>
        <ContentSideNav active={activeSection} onChange={setActiveSection} />
      </div>
      {/* Brand indicator */}
      <div
        style={{
          margin: "0 10px 10px",
          padding: "10px 12px",
          borderRadius: "var(--gv-radius-sm)",
          background: brandId ? "var(--gv7-mode-general-light)" : "var(--gv-color-neutral-50)",
          border: `1px solid ${brandId ? "var(--gv7-mode-general-border)" : "var(--gv-color-neutral-200)"}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: brandId ? "var(--gv7-mode-general-accent)" : "var(--gv-color-neutral-300)", flexShrink: 0 }} />
          <p style={{ fontSize: 11, fontWeight: 600, color: brandId ? "var(--gv7-mode-general-text)" : "var(--gv-color-neutral-400)" }}>
            {brandId ? "Brand connected" : "No brand profile"}
          </p>
        </div>
      </div>
    </div>
  );

  // ── Right history panel ──────────────────────────────────────────
  const right = (
    <HistoryPanel activeSection={activeSection} refreshKey={refreshKey} brandId={brandId} />
  );

  return (
    <ThreeColumnLayout
      left={left}
      center={center}
      right={right}
    />
  );
}
