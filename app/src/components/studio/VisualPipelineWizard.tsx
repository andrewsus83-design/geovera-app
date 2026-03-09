"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
type Plan = "basic" | "premium" | "partner";

type ObjectiveKey =
  | "multi_angles" | "theme_variants" | "sequence_story"
  | "multi_catalog" | "brand_campaign" | "character_sheet";

type PlatformKey =
  | "tiktok_9_16" | "instagram_story_9_16" | "instagram_1_1" | "linkedin_16_9";

interface Objective { objective_type: ObjectiveKey; weight: number; }
interface QuotaInfo {
  plan: Plan; tier_name: string;
  submissions_per_day: number; submissions_today: number;
  submissions_remaining: number; can_submit: boolean;
  images_per_submission: number; max_objectives: number;
  video_available: boolean; video_max_sec: number;
  reset_at: string;
}
interface JobStatus {
  job_id: string; status: string;
  quality_gate_passed: boolean | null; error_message: string | null;
  objectives: Objective[]; objective_confirmed: boolean;
  image_analysis: any;
  progress: { generated: number; total: number; refined: number; gpu_warming: boolean; top12_count: Record<string, number> };
  video_info: { requested: boolean; allowed: boolean; duration_sec: number | null; status: string | null };
  flux_outputs: { id: string; cdn_url: string; ratio: string; objective_source?: string }[];
  video_outputs: { cdn_url: string; duration_sec: number }[];
  quota: { submissions_remaining: number; reset_at: string } | null;
}
interface GvTask { id: string; title: string; status: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
const OBJECTIVES: { key: ObjectiveKey; label: string; desc: string; icon: string }[] = [
  { key: "brand_campaign",   label: "Brand Campaign",   desc: "Aspirational world-building with emotion", icon: "🌟" },
  { key: "multi_angles",     label: "Multi Angles",     desc: "Same product, exhaustive viewpoint coverage", icon: "🔄" },
  { key: "theme_variants",   label: "Theme Variants",   desc: "Same product, different mood/season/style", icon: "🎨" },
  { key: "sequence_story",   label: "Sequence Story",   desc: "Narrative arc — before / during / after", icon: "📖" },
  { key: "multi_catalog",    label: "Multi Catalog",    desc: "Multiple SKUs, conversion-optimized", icon: "🛍️" },
  { key: "character_sheet",  label: "Character Sheet",  desc: "Reference-grade character consistency", icon: "👤" },
];

const PLATFORMS: { key: PlatformKey; label: string; ratio: string; icon: string }[] = [
  { key: "tiktok_9_16",          label: "TikTok",           ratio: "9:16", icon: "🎵" },
  { key: "instagram_story_9_16", label: "IG Stories",       ratio: "9:16", icon: "📸" },
  { key: "instagram_1_1",        label: "Instagram Grid",   ratio: "1:1",  icon: "⬜" },
  { key: "linkedin_16_9",        label: "LinkedIn",         ratio: "16:9", icon: "💼" },
];

const STATUS_LABELS: Record<string, string> = {
  image_analyzing:      "Analyzing reference images…",
  image_analysis_review:"Image analysis ready",
  confirmed:            "Objectives confirmed",
  prompt_engineering:   "Engineering prompts…",
  generating:           "Generating images (Gemini)…",
  scoring:              "Scoring + selecting top images…",
  refining:             "Refining with Flux Dev GPU…",
  video_analyzing:      "Determining video duration…",
  video_gen:            "Generating TikTok video (Veo)…",
  done:                 "Done! 🎉",
  quality_gate_failed:  "Quality gate failed",
  error:                "Error occurred",
};

const ACTIVE_STATUSES = new Set([
  "image_analyzing","prompt_engineering","generating","scoring","refining","video_analyzing","video_gen",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

async function apiFetch(path: string, opts?: RequestInit) {
  const auth = await getAuthHeader();
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: auth, ...(opts?.headers || {}) },
  });
  return res.json();
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuotaBadge({ quota }: { quota: QuotaInfo | null }) {
  if (!quota) return null;
  const used = quota.submissions_today;
  const total = quota.submissions_per_day;
  const remaining = quota.submissions_remaining;
  const resetIn = quota.reset_at ? new Date(quota.reset_at) : null;
  const hoursLeft = resetIn ? Math.max(0, Math.ceil((resetIn.getTime() - Date.now()) / 3_600_000)) : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
      style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-200)" }}>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold" style={{ color: "var(--gv-color-neutral-600)" }}>
            Daily Submissions
          </span>
          <span className="text-[11px] font-bold" style={{ color: remaining > 0 ? "var(--gv-color-primary-600)" : "var(--gv-color-error-500)" }}>
            {remaining}/{total} left
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full"
              style={{ background: i < used ? "var(--gv-color-neutral-300)" : "var(--gv-color-primary-500)" }} />
          ))}
        </div>
      </div>
      {remaining === 0 && (
        <span className="text-[10px]" style={{ color: "var(--gv-color-neutral-400)" }}>
          resets in {hoursLeft}h
        </span>
      )}
    </div>
  );
}

function ImageUploadZone({ images, onChange }: {
  images: { file: File; preview: string }[];
  onChange: (imgs: { file: File; preview: string }[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 8 - images.length);
    const newItems = await Promise.all(arr.map(async (f) => ({ file: f, preview: await toBase64(f) })));
    onChange([...images, ...newItems].slice(0, 8));
  };

  return (
    <div>
      <div
        className="relative flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
        style={{
          minHeight: 100, borderRadius: "var(--gv-radius-md)",
          border: `2px dashed ${dragging ? "var(--gv-color-primary-400)" : "var(--gv-color-neutral-200)"}`,
          background: dragging ? "var(--gv-color-primary-50)" : "var(--gv-color-neutral-50)",
          padding: images.length > 0 ? "12px" : "20px 12px",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />

        {images.length === 0 ? (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--gv-color-neutral-400)" }}>
              <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-[12px] font-semibold" style={{ color: "var(--gv-color-neutral-500)" }}>Drop reference images here</p>
            <p className="text-[10px]" style={{ color: "var(--gv-color-neutral-400)" }}>Up to 8 images · JPG, PNG, WEBP</p>
          </>
        ) : (
          <div className="flex flex-wrap gap-2 w-full">
            {images.map((img, i) => (
              <div key={i} className="relative group" style={{ width: 64, height: 64 }}>
                <img src={img.preview} alt="" className="w-full h-full object-cover"
                  style={{ borderRadius: "var(--gv-radius-xs)" }} />
                <button
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ borderRadius: "50%", background: "var(--gv-color-error-500)", color: "#fff" }}
                  onClick={(e) => { e.stopPropagation(); onChange(images.filter((_, j) => j !== i)); }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <div className="flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: "var(--gv-radius-xs)", border: "1.5px dashed var(--gv-color-neutral-300)", color: "var(--gv-color-neutral-400)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-[10px] mt-1" style={{ color: "var(--gv-color-neutral-400)" }}>
        {images.length}/8 images selected
      </p>
    </div>
  );
}

function ObjectivePicker({ selected, maxObj, onChange }: {
  selected: Objective[];
  maxObj: number;
  onChange: (objs: Objective[]) => void;
}) {
  const toggle = (key: ObjectiveKey) => {
    const exists = selected.find((o) => o.objective_type === key);
    if (exists) {
      const next = selected.filter((o) => o.objective_type !== key);
      onChange(rebalance(next));
    } else if (selected.length < maxObj) {
      const next = [...selected, { objective_type: key, weight: 0 }];
      onChange(rebalance(next));
    }
  };

  const rebalance = (objs: Objective[]) => {
    if (objs.length === 0) return objs;
    if (objs.length === 1) return [{ ...objs[0], weight: 1.0 }];
    if (objs.length === 2) return [{ ...objs[0], weight: 0.7 }, { ...objs[1], weight: 0.3 }];
    return [{ ...objs[0], weight: 0.6 }, { ...objs[1], weight: 0.25 }, { ...objs[2], weight: 0.15 }];
  };

  const setPrimaryWeight = (w: number) => {
    if (selected.length === 2) {
      onChange([{ ...selected[0], weight: w / 100 }, { ...selected[1], weight: 1 - w / 100 }]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {OBJECTIVES.map((obj) => {
          const isSelected = selected.some((o) => o.objective_type === obj.key);
          const disabled = !isSelected && selected.length >= maxObj;
          return (
            <button
              key={obj.key}
              disabled={disabled}
              onClick={() => toggle(obj.key)}
              className="flex items-start gap-2 p-3 text-left transition-all"
              style={{
                borderRadius: "var(--gv-radius-sm)",
                border: `1.5px solid ${isSelected ? "var(--gv-color-primary-400)" : "var(--gv-color-neutral-200)"}`,
                background: isSelected ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <span className="text-base leading-none mt-0.5">{obj.icon}</span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight"
                  style={{ color: isSelected ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-800)" }}>
                  {obj.label}
                </p>
                <p className="text-[10px] mt-0.5 leading-snug"
                  style={{ color: "var(--gv-color-neutral-400)" }}>
                  {obj.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Weight slider for 2 objectives (premium+) */}
      {selected.length === 2 && (
        <div className="p-3 rounded-lg" style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-200)" }}>
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--gv-color-neutral-700)" }}>
              {selected[0]?.objective_type.replace("_", " ")}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "var(--gv-color-neutral-700)" }}>
              {selected[1]?.objective_type.replace("_", " ")}
            </span>
          </div>
          <input
            type="range" min={50} max={80} step={5}
            value={Math.round((selected[0]?.weight || 0.7) * 100)}
            onChange={(e) => setPrimaryWeight(Number(e.target.value))}
            className="w-full accent-primary-500"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] font-bold" style={{ color: "var(--gv-color-primary-600)" }}>
              {Math.round((selected[0]?.weight || 0.7) * 100)}%
            </span>
            <span className="text-[10px] font-bold" style={{ color: "var(--gv-color-primary-600)" }}>
              {Math.round((selected[1]?.weight || 0.3) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformPicker({ selected, onChange }: {
  selected: PlatformKey[];
  onChange: (p: PlatformKey[]) => void;
}) {
  const toggle = (key: PlatformKey) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map((p) => {
        const isSelected = selected.includes(p.key);
        return (
          <button
            key={p.key}
            onClick={() => toggle(p.key)}
            className="flex items-center gap-1.5 px-3 py-2 transition-all"
            style={{
              borderRadius: "var(--gv-radius-full)",
              border: `1.5px solid ${isSelected ? "var(--gv-color-primary-400)" : "var(--gv-color-neutral-200)"}`,
              background: isSelected ? "var(--gv-color-primary-50)" : "var(--gv-color-bg-surface)",
            }}
          >
            <span className="text-sm">{p.icon}</span>
            <span className="text-[12px] font-semibold"
              style={{ color: isSelected ? "var(--gv-color-primary-700)" : "var(--gv-color-neutral-700)" }}>
              {p.label}
            </span>
            <span className="text-[10px]"
              style={{ color: isSelected ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-400)" }}>
              {p.ratio}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusTimeline({ jobStatus }: { jobStatus: JobStatus }) {
  const steps = [
    { key: "image_analyzing",    label: "Image Analysis",       bg: true },
    { key: "prompt_engineering", label: "Prompt Engineering",   bg: false },
    { key: "generating",         label: "Image Generation",     bg: false },
    { key: "scoring",            label: "Quality Scoring",      bg: false },
    { key: "refining",           label: "GPU Refinement (Flux)", bg: false },
    { key: "video_gen",          label: "Video Generation",     bg: jobStatus.video_info?.requested },
    { key: "done",               label: "Done",                 bg: false },
  ].filter((s) => s.bg !== false || true); // always show all

  const ORDER = ["image_analyzing","prompt_engineering","generating","scoring","refining","video_analyzing","video_gen","done"];
  const currentIdx = ORDER.indexOf(jobStatus.status);

  return (
    <div className="space-y-2">
      {steps.filter((s) => s.key !== "video_gen" || jobStatus.video_info?.requested).map((step) => {
        const idx = ORDER.indexOf(step.key);
        const isDone = idx < currentIdx || jobStatus.status === "done";
        const isCurrent = step.key === jobStatus.status || (step.key === "image_analyzing" && jobStatus.status === "prompt_engineering");
        const isPending = idx > currentIdx;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
              style={{
                borderRadius: "50%",
                background: isDone ? "var(--gv-color-success-500)" : isCurrent ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-200)",
              }}>
              {isDone ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              ) : isCurrent ? (
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              ) : null}
            </div>
            <span className="text-[12px]"
              style={{
                color: isDone ? "var(--gv-color-success-600)"
                      : isCurrent ? "var(--gv-color-primary-600)"
                      : "var(--gv-color-neutral-400)",
                fontWeight: isCurrent ? 600 : 400,
              }}>
              {step.label}
              {isCurrent && step.key === "refining" && jobStatus.progress.gpu_warming
                && " — warming up GPU (30–90s)"}
              {isCurrent && step.key === "generating"
                && ` (${jobStatus.progress.generated}/${jobStatus.progress.total})`}
              {isCurrent && step.key === "refining"
                && !jobStatus.progress.gpu_warming
                && ` (${jobStatus.progress.refined} refined)`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FluxGallery({ outputs }: { outputs: JobStatus["flux_outputs"] }) {
  const [tab, setTab] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const filtered = outputs.filter((o) => o.ratio === tab);

  const RATIO_DIMS: Record<string, string> = { "9:16": "aspect-[9/16]", "16:9": "aspect-video", "1:1": "aspect-square" };

  return (
    <div className="space-y-3">
      {/* Ratio tabs */}
      <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--gv-color-neutral-100)" }}>
        {(["9:16","16:9","1:1"] as const).map((r) => {
          const count = outputs.filter((o) => o.ratio === r).length;
          if (!count) return null;
          return (
            <button key={r} onClick={() => setTab(r)}
              className="flex-1 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                borderRadius: "var(--gv-radius-full)",
                background: tab === r ? "var(--gv-color-bg-surface)" : "transparent",
                color: tab === r ? "var(--gv-color-neutral-900)" : "var(--gv-color-neutral-400)",
                boxShadow: tab === r ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {r} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className={`grid gap-2 ${tab === "9:16" ? "grid-cols-2" : tab === "1:1" ? "grid-cols-2" : "grid-cols-1"}`}>
        {filtered.map((img, i) => (
          <div key={i} className="relative group overflow-hidden"
            style={{ borderRadius: "var(--gv-radius-sm)", background: "var(--gv-color-neutral-100)" }}>
            <div className={RATIO_DIMS[tab] || "aspect-square"}>
              <img src={img.cdn_url} alt="" className="w-full h-full object-cover" />
            </div>
            {/* Download hover */}
            <a href={img.cdn_url} download target="_blank" rel="noopener noreferrer"
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={(e) => e.stopPropagation()}>
              <span className="text-white text-[11px] font-semibold px-3 py-1.5 rounded-full"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                ↓ Download
              </span>
            </a>
            {img.objective_source && (
              <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                {img.objective_source.replace("_", " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function VisualPipelineWizard({ brandId, plan }: {
  brandId: string;
  plan: Plan;
}) {
  // Step state: "form" | "running" | "done" | "error"
  const [step, setStep] = useState<"form" | "confirm" | "running" | "done" | "error">("form");

  // Form state
  const [images, setImages]             = useState<{ file: File; preview: string }[]>([]);
  const [objectives, setObjectives]     = useState<Objective[]>([{ objective_type: "brand_campaign", weight: 1.0 }]);
  const [platforms, setPlatforms]       = useState<PlatformKey[]>(["tiktok_9_16", "instagram_1_1"]);
  const [videoRequested, setVideoReq]   = useState(false);
  const [brandNotes, setBrandNotes]     = useState("");
  const [linkedTaskId, setLinkedTaskId] = useState<string>("");
  const [tasks, setTasks]               = useState<GvTask[]>([]);

  // Quota
  const [quota, setQuota]   = useState<QuotaInfo | null>(null);
  const [loadingQ, setLoadingQ] = useState(true);

  // Job tracking
  const [jobId, setJobId]         = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxObj       = quota?.max_objectives || (plan === "partner" ? 3 : plan === "premium" ? 2 : 1);
  const videoAllowed = quota?.video_available || false;

  // ── Load quota + tasks ────────────────────────────────────────────────────
  useEffect(() => {
    if (!brandId) return;
    setLoadingQ(true);
    apiFetch("/api/quota/visual")
      .then((d) => { if (d.quota) setQuota(d.quota); })
      .finally(() => setLoadingQ(false));

    // Load tasks for linking
    supabase.from("gv_tasks")
      .select("id, title, status")
      .eq("brand_id", brandId)
      .eq("status", "todo")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setTasks(data || []));
  }, [brandId]);

  // ── Poll job status ───────────────────────────────────────────────────────
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const d = await apiFetch(`/api/pipeline/${id}/status`);
      if (d.job_id) {
        setJobStatus(d);
        if (d.quota) setQuota((prev) => prev ? { ...prev, ...d.quota } : prev);
        if (d.status === "done") {
          clearInterval(pollRef.current!);
          setStep("done");
        } else if (d.status === "error" || d.status === "quality_gate_failed") {
          clearInterval(pollRef.current!);
          setError(d.error_message || d.status === "quality_gate_failed"
            ? "Quality gate failed — reference images were inconsistent. Your slot has been refunded."
            : "An error occurred.");
          setStep("error");
          // Refresh quota after refund
          apiFetch("/api/quota/visual").then((r) => { if (r.quota) setQuota(r.quota); });
        }
      }
    }, 5000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const input_images = images.map((i) => i.preview); // base64 data URLs
      const res = await apiFetch("/api/pipeline/create", {
        method: "POST",
        body: JSON.stringify({
          input_images,
          objectives,
          target_platforms: platforms,
          video_requested: videoRequested && videoAllowed && platforms.includes("tiktok_9_16"),
          brand_notes: brandNotes || undefined,
          linked_task_id: linkedTaskId || undefined,
        }),
      });

      if (!res.success) {
        setError(res.error || "Failed to start");
        setStep("form");
        return;
      }

      setJobId(res.job_id);
      setQuota((prev) => prev ? { ...prev, submissions_remaining: res.submissions_remaining } : prev);
      setStep("running");
      startPolling(res.job_id);
    } catch (e: any) {
      setError(e.message);
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setImages([]); setObjectives([{ objective_type: "brand_campaign", weight: 1.0 }]);
    setPlatforms(["tiktok_9_16", "instagram_1_1"]); setVideoReq(false);
    setBrandNotes(""); setLinkedTaskId(""); setJobId(null);
    setJobStatus(null); setError(null); setStep("form");
    // Refresh quota
    apiFetch("/api/quota/visual").then((d) => { if (d.quota) setQuota(d.quota); });
  };

  // ── FORM view ─────────────────────────────────────────────────────────────
  if (step === "form" || step === "confirm") {
    const canSubmit = images.length > 0
      && objectives.length > 0
      && platforms.length > 0
      && (quota?.can_submit ?? false)
      && !submitting;

    return (
      <div className="space-y-5">
        {/* Quota */}
        <QuotaBadge quota={quota} />

        {/* Error banner */}
        {error && (
          <div className="px-3 py-2.5 rounded-lg text-[12px]"
            style={{ background: "var(--gv-color-error-50)", border: "1px solid var(--gv-color-error-200)", color: "var(--gv-color-error-700)" }}>
            {error}
          </div>
        )}

        {/* 1. Upload */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--gv-color-neutral-500)" }}>
            1 · Reference Images
          </p>
          <ImageUploadZone images={images} onChange={setImages} />
        </div>

        {/* 2. Objective */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--gv-color-neutral-500)" }}>
              2 · Objective
            </p>
            {maxObj > 1 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "var(--gv-color-primary-100)", color: "var(--gv-color-primary-600)" }}>
                {plan} · max {maxObj}
              </span>
            )}
          </div>
          <ObjectivePicker selected={objectives} maxObj={maxObj} onChange={setObjectives} />
        </div>

        {/* 3. Platforms */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--gv-color-neutral-500)" }}>
            3 · Output Platforms
          </p>
          <PlatformPicker selected={platforms} onChange={setPlatforms} />
        </div>

        {/* 4. Video (premium/partner + tiktok selected) */}
        {videoAllowed && platforms.includes("tiktok_9_16") && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={videoRequested}
              onChange={(e) => setVideoReq(e.target.checked)}
              className="w-4 h-4 rounded accent-primary-500" />
            <div>
              <span className="text-[12px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
                Generate TikTok Video
              </span>
              <span className="text-[11px] ml-1.5" style={{ color: "var(--gv-color-neutral-400)" }}>
                (+5–15 min · Veo · AI-determined duration)
              </span>
            </div>
          </label>
        )}

        {/* 5. Link to Task */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--gv-color-neutral-500)" }}>
            4 · Link to Task <span className="font-normal normal-case" style={{ color: "var(--gv-color-neutral-400)" }}>(optional)</span>
          </p>
          <select
            value={linkedTaskId}
            onChange={(e) => setLinkedTaskId(e.target.value)}
            className="w-full px-3 py-2 text-[12px]"
            style={{
              borderRadius: "var(--gv-radius-sm)", outline: "none",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-surface)",
              color: "var(--gv-color-neutral-700)",
            }}
          >
            <option value="">— No task link —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        {/* 5. Brand notes */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--gv-color-neutral-500)" }}>
            5 · Brand Notes <span className="font-normal normal-case" style={{ color: "var(--gv-color-neutral-400)" }}>(optional)</span>
          </p>
          <textarea
            value={brandNotes}
            onChange={(e) => setBrandNotes(e.target.value)}
            placeholder="E.g. 'Always show label facing camera. Use dark luxury tone.'"
            rows={2}
            className="w-full px-3 py-2 text-[12px] resize-none"
            style={{
              borderRadius: "var(--gv-radius-sm)", outline: "none",
              border: "1px solid var(--gv-color-neutral-200)",
              background: "var(--gv-color-bg-surface)",
              color: "var(--gv-color-neutral-700)",
            }}
          />
        </div>

        {/* Submit info */}
        {quota && (
          <div className="text-[11px]" style={{ color: "var(--gv-color-neutral-400)" }}>
            {quota.images_per_submission} images · top 12% per ratio → Flux Dev GPU refinement
            {videoAllowed && videoRequested && " · TikTok video"}
          </div>
        )}

        {/* Confirm Modal */}
        {step === "confirm" ? (
          <div className="p-4 rounded-xl space-y-3"
            style={{ background: "var(--gv-color-warning-50)", border: "1px solid var(--gv-color-warning-200)" }}>
            <p className="text-[13px] font-bold" style={{ color: "var(--gv-color-neutral-800)" }}>
              ⚠️ Uses 1 of {quota?.submissions_remaining} remaining submissions today
            </p>
            <ul className="text-[11px] space-y-1" style={{ color: "var(--gv-color-neutral-600)" }}>
              <li>• Cannot be cancelled once started</li>
              <li>• Slot refunded if quality gate fails</li>
              <li>• Resets at midnight UTC</li>
            </ul>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep("form")}
                className="flex-1 py-2 text-[12px] font-semibold rounded-lg"
                style={{ border: "1px solid var(--gv-color-neutral-200)", background: "var(--gv-color-bg-surface)", color: "var(--gv-color-neutral-700)" }}>
                Go back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-2 text-[12px] font-semibold rounded-lg"
                style={{ background: "var(--gv-color-primary-500)", color: "#fff", opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Starting…" : `Use 1 slot — Generate`}
              </button>
            </div>
          </div>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={() => setStep("confirm")}
            className="w-full py-3 text-[13px] font-bold rounded-xl transition-all"
            style={{
              background: canSubmit ? "var(--gv-color-primary-500)" : "var(--gv-color-neutral-200)",
              color: canSubmit ? "#fff" : "var(--gv-color-neutral-400)",
            }}
          >
            {!quota?.can_submit
              ? "No submissions remaining today"
              : images.length === 0
              ? "Upload images to continue"
              : objectives.length === 0
              ? "Select an objective"
              : platforms.length === 0
              ? "Select at least one platform"
              : `Generate — ${quota?.images_per_submission} images · ${platforms.length} platform${platforms.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    );
  }

  // ── RUNNING view ──────────────────────────────────────────────────────────
  if (step === "running") {
    return (
      <div className="space-y-5">
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--gv-color-primary-500)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--gv-color-neutral-800)" }}>
              {jobStatus ? STATUS_LABELS[jobStatus.status] || jobStatus.status : "Starting pipeline…"}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--gv-color-neutral-400)" }}>
            Polling every 5s · do not close this tab
          </p>
        </div>

        {jobStatus && <StatusTimeline jobStatus={jobStatus} />}

        {/* Objectives summary */}
        <div className="p-3 rounded-lg" style={{ background: "var(--gv-color-neutral-50)", border: "1px solid var(--gv-color-neutral-200)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5"
            style={{ color: "var(--gv-color-neutral-500)" }}>Objectives</p>
          <div className="flex flex-wrap gap-1.5">
            {objectives.map((o) => (
              <span key={o.objective_type} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "var(--gv-color-primary-100)", color: "var(--gv-color-primary-700)" }}>
                {o.objective_type.replace("_", " ")} {objectives.length > 1 && `${Math.round(o.weight * 100)}%`}
              </span>
            ))}
            {platforms.map((p) => (
              <span key={p} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "var(--gv-color-neutral-200)", color: "var(--gv-color-neutral-600)" }}>
                {PLATFORMS.find((pl) => pl.key === p)?.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ERROR view ────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl"
          style={{ background: "var(--gv-color-error-50)", border: "1px solid var(--gv-color-error-200)" }}>
          <p className="text-[13px] font-bold mb-1" style={{ color: "var(--gv-color-error-700)" }}>
            ⚠️ Generation failed
          </p>
          <p className="text-[12px]" style={{ color: "var(--gv-color-error-600)" }}>{error}</p>
        </div>
        <div className="text-[11px] space-y-1" style={{ color: "var(--gv-color-neutral-500)" }}>
          <p className="font-semibold">Tips:</p>
          <p>• Use images from the same shoot / lighting setup</p>
          <p>• Avoid mixing very different backgrounds</p>
          <p>• Minimum 2 images recommended</p>
        </div>
        <button onClick={resetForm}
          className="w-full py-2.5 text-[13px] font-semibold rounded-xl"
          style={{ background: "var(--gv-color-primary-500)", color: "#fff" }}>
          Try again with new images
        </button>
      </div>
    );
  }

  // ── DONE view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-bold" style={{ color: "var(--gv-color-neutral-900)" }}>
            🎉 Visual assets ready
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--gv-color-neutral-400)" }}>
            Tasks created in your Tasks board
          </p>
        </div>
        <button onClick={resetForm}
          className="px-3 py-1.5 text-[11px] font-semibold rounded-lg"
          style={{ border: "1px solid var(--gv-color-neutral-200)", color: "var(--gv-color-neutral-600)", background: "var(--gv-color-bg-surface)" }}>
          New generation
        </button>
      </div>

      {jobStatus?.flux_outputs && jobStatus.flux_outputs.length > 0 && (
        <FluxGallery outputs={jobStatus.flux_outputs} />
      )}

      {jobStatus?.video_outputs && jobStatus.video_outputs.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--gv-color-neutral-500)" }}>
            TikTok Video
          </p>
          {jobStatus.video_outputs.map((v, i) => (
            <div key={i} className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--gv-color-neutral-200)" }}>
              <video src={v.cdn_url} controls className="w-full" style={{ maxHeight: 400 }} />
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderTop: "1px solid var(--gv-color-neutral-100)" }}>
                <span className="text-[11px]" style={{ color: "var(--gv-color-neutral-500)" }}>
                  {v.duration_sec}s · 9:16 TikTok
                </span>
                <a href={v.cdn_url} download target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-semibold" style={{ color: "var(--gv-color-primary-600)" }}>
                  ↓ Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
