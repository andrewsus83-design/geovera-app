"use client";
import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ThreeColumnLayout from "@/components/shared/ThreeColumnLayout";
import NavColumn from "@/components/shared/NavColumn";

// ── Config ────────────────────────────────────────────────────────────────────
const TIKTOK_CLIENT_KEY =
  process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || "";
const TIKTOK_REDIRECT_URI =
  process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI ||
  "https://report.geovera.xyz/api/tiktok/callback";
const DEMO_BRAND_ID =
  process.env.NEXT_PUBLIC_DEMO_BRAND_ID || "a37dee82-5ed5-4ba4-991a-4d93dde9ff7a";

// ── Types ─────────────────────────────────────────────────────────────────────
type PostStatus = "draft" | "scheduled" | "published" | "failed";

type TikTokPost = {
  id: string;
  date: string;
  time: string;
  title: string;
  caption: string;
  hashtags: string[];
  status: PostStatus;
  duration: string;
  videoUrl?: string;
  accentColor: string;
  views?: string;
  likes?: string;
};

// ── Demo Posts ────────────────────────────────────────────────────────────────
const DEMO_POSTS: TikTokPost[] = [
  {
    id: "tt1",
    date: "2026-02-18",
    time: "09:00",
    title: "Rahasia Brand Lokal Tembus 1 Juta Followers",
    caption:
      "Tahukah kamu? Brand lokal Indonesia ini berhasil menembus 1 juta TikTok followers dalam 6 bulan — tanpa budget iklan besar. Rahasianya ada di strategi konten yang tepat! 🔥💡\n\nGeoVera AI menganalisis ribuan konten viral untuk membantumu menemukan formula yang sama.",
    hashtags: ["#BrandIndonesia", "#TikTokMarketing", "#ViralStrategy", "#GeoVera", "#UMKM", "#ContentCreator"],
    status: "published",
    duration: "45s",
    accentColor: "#FE2C55",
    views: "284K",
    likes: "31.2K",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt2",
    date: "2026-02-20",
    time: "11:00",
    title: "AI vs Human: Siapa yang Lebih Paham Konsumen?",
    caption:
      "Banyak yang takut AI akan gantikan marketer. Tapi kenyataannya? AI + Human = kombinasi yang tak terkalahkan. 🤖🤝\n\nGeoVera tidak menggantikan timmu — kami memperkuat mereka dengan data dan analisis real-time.",
    hashtags: ["#AIMarketing", "#DigitalMarketing", "#MarketingIndonesia", "#GeoVera", "#TechStartup"],
    status: "published",
    duration: "38s",
    accentColor: "#25F4EE",
    views: "156K",
    likes: "18.7K",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt3",
    date: "2026-02-23",
    time: "14:00",
    title: "3 Kesalahan Fatal Brand di TikTok (dan Cara Hindarinya)",
    caption:
      "95% brand baru melakukan 3 kesalahan ini di TikTok dan akhirnya menyerah. Apakah brandmu juga melakukannya? ❌\n\n1. Posting tanpa strategi\n2. Mengabaikan analytics\n3. Tidak konsisten\n\nGeoVera hadir untuk memastikan kamu tidak melakukan kesalahan yang sama! ✅",
    hashtags: ["#TikTokTips", "#BrandMistakes", "#ContentStrategy", "#GeoVera", "#MarketingTips"],
    status: "published",
    duration: "52s",
    accentColor: "#FF6B6B",
    views: "412K",
    likes: "47.3K",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt4",
    date: "2026-02-25",
    time: "10:00",
    title: "Behind the Scenes: Cara GeoVera Generate Konten",
    caption:
      "Dari riset tren → AI analysis → konten siap publish — semua dalam hitungan menit! ⚡\n\nIni dia proses di balik layar bagaimana GeoVera membantu brand Indonesia menciptakan konten TikTok yang relevan, engaging, dan konsisten setiap hari.",
    hashtags: ["#BehindTheScenes", "#AIContent", "#ContentCreation", "#GeoVera", "#ProductDemo", "#TechIndonesia"],
    status: "scheduled",
    duration: "60s",
    accentColor: "#6C63FF",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt5",
    date: "2026-02-26",
    time: "16:00",
    title: "Tren Konten TikTok Indonesia Maret 2026",
    caption:
      "GeoVera AI sudah analisis 50.000+ konten TikTok Indonesia untuk Maret 2026. Hasilnya? Ada 5 format konten yang akan MELEDAK bulan depan! 📊🚀\n\nBrand mana yang paling siap memanfaatkan tren ini?",
    hashtags: ["#TrendAnalysis", "#TikTokTrends", "#MarketingIntelligence", "#GeoVera", "#Indonesia2026"],
    status: "scheduled",
    duration: "47s",
    accentColor: "#F7B731",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt6",
    date: "2026-02-27",
    time: "09:00",
    title: "Case Study: Brand F&B Jakarta +340% Engagement",
    caption:
      "Dalam 30 hari menggunakan GeoVera, brand F&B ini berhasil:\n✅ Engagement naik 340%\n✅ Followers baru: +12.400\n✅ 3 konten masuk FYP organik\n\nApa yang berbeda? Strategi konten berbasis data, bukan feeling. 📈",
    hashtags: ["#CaseStudy", "#FoodBeverage", "#TikTokSuccess", "#GeoVera", "#DataDriven", "#UMKM"],
    status: "scheduled",
    duration: "55s",
    accentColor: "#FF9A3C",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    id: "tt7",
    date: "2026-02-28",
    time: "13:00",
    title: "GeoVera x TikTok: Publish Langsung dari Dashboard",
    caption:
      "Bayangkan: buat konten, preview di TikTok mockup, edit caption & hashtag, lalu publish — semua dari satu dashboard tanpa berpindah aplikasi. 🎯\n\nItulah yang bisa kamu lakukan di GeoVera. Coba gratis sekarang!",
    hashtags: ["#GeoVera", "#TikTokPublish", "#SocialMediaManagement", "#ProductFeature", "#DigitalMarketing"],
    status: "draft",
    duration: "42s",
    accentColor: "#1DB954",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function getFirstDayOfMonth(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayStr() {
  const n = new Date();
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate());
}

// ── PKCE ─────────────────────────────────────────────────────────────────────
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const verifier = btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { verifier, challenge };
}

// ── TikTok icon ───────────────────────────────────────────────────────────────
const TikTokIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z" />
  </svg>
);

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PostStatus }) {
  const map: Record<PostStatus, { cls: string; label: string }> = {
    published: { cls: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400", label: "✓ Published" },
    scheduled: { cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",   label: "⏰ Scheduled" },
    draft:     { cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400", label: "Draft" },
    failed:    { cls: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",       label: "⚠ Failed" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniMonthCalendar({ year, month, selectedDate, postDates, onSelect }: {
  year: number; month: number; selectedDate: string | null;
  postDates: Set<string>; onSelect: (d: string) => void;
}) {
  const days  = getDaysInMonth(year, month);
  const first = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [...Array(first).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(d);
  const today = todayStr();
  return (
    <div className="pt-1">
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <span key={i} className="text-[10px] font-medium text-gray-400 text-center">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds     = toDateStr(year, month, day);
          const hasPst = postDates.has(ds);
          const isSel  = selectedDate === ds;
          const isTdy  = ds === today;
          return (
            <button key={i} onClick={() => onSelect(ds)}
              className={`relative mx-auto w-6 h-6 rounded-full text-[10px] flex items-center justify-center transition-colors ${
                isSel  ? "bg-[#FE2C55] text-white font-bold" :
                isTdy  ? "bg-brand-50 text-brand-600 font-semibold dark:bg-brand-500/10 dark:text-brand-300" :
                         "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              }`}>
              {day}
              {hasPst && (
                <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSel ? "bg-white" : "bg-[#FE2C55]"}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Phone Mockup ──────────────────────────────────────────────────────────────
function TikTokPhoneMockup({ post, caption, hashtags }: {
  post: TikTokPost; caption: string; hashtags: string[];
}) {
  return (
    <div className="flex justify-center py-3">
      <div className="relative w-[160px] h-[284px] rounded-[20px] overflow-hidden shadow-2xl border-[3px] border-gray-800" style={{ background: "#000" }}>
        {/* Video bg */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${post.accentColor}bb 0%, #111 65%)` }} />
        {/* GeoVera watermark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <span className="text-white/60 text-lg ml-0.5">▶</span>
          </div>
        </div>
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 flex justify-between items-start px-2 pt-2">
          <span className="text-white/70 text-[7px] font-medium">Following &nbsp;|&nbsp; For You</span>
          <span className="text-white/70 text-[9px]">🔍</span>
        </div>
        {/* Duration badge */}
        <div className="absolute top-7 right-2 bg-black/50 rounded px-1 py-0.5">
          <span className="text-white text-[7px]">{post.duration}</span>
        </div>
        {/* Bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 px-2 pb-8">
          <div className="flex items-center gap-1 mb-1">
            <div className="w-4 h-4 rounded-full bg-gray-500 border border-gray-400 flex-shrink-0" />
            <span className="text-white text-[8px] font-bold">@geovera.id</span>
          </div>
          <p className="text-white text-[7px] leading-tight line-clamp-3 mb-1">{caption}</p>
          <p className="text-[#25F4EE] text-[7px] leading-tight truncate">{hashtags.slice(0,3).join(" ")}</p>
        </div>
        {/* Side actions */}
        <div className="absolute right-1.5 bottom-10 flex flex-col items-center gap-2.5">
          {[
            { icon: "♥", val: post.likes || "24.1K" },
            { icon: "💬", val: "1.8K" },
            { icon: "↗",  val: "Share" },
          ].map(({ icon, val }) => (
            <div key={val} className="flex flex-col items-center">
              <span className="text-white text-[11px]">{icon}</span>
              <span className="text-white/70 text-[6px] mt-0.5">{val}</span>
            </div>
          ))}
        </div>
        {/* Bottom nav */}
        <div className="absolute bottom-0 inset-x-0 h-7 bg-black/70 flex items-center justify-around px-3">
          {["🏠","🔍","＋","📬","👤"].map((ic, i) => (
            <span key={i} className={`text-[10px] ${i === 2 ? "text-white" : "text-white/50"}`}>{ic}</span>
          ))}
        </div>
        {/* Views badge */}
        {post.views && (
          <div className="absolute top-7 left-2 bg-black/50 rounded px-1 py-0.5 flex items-center gap-0.5">
            <span className="text-white/80 text-[6px]">▶</span>
            <span className="text-white text-[7px] font-medium">{post.views}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inner Page ────────────────────────────────────────────────────────────────
function TikTokCalendarInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ?demo=true → simulated connected state (for TikTok review video)
  const isDemoMode = searchParams.get("demo") === "true";

  const [year,  setYear]  = useState(2026);
  const [month, setMonth] = useState(1); // Feb

  const [posts,           setPosts]           = useState<TikTokPost[]>(DEMO_POSTS);
  const [selectedId,      setSelectedId]      = useState<string | null>("tt4");
  const [tiktokConnected, setTiktokConnected] = useState(isDemoMode);
  const [publishing,      setPublishing]      = useState(false);
  const [publishStep,     setPublishStep]     = useState<"idle"|"connecting"|"uploading"|"success">("idle");
  const [toast,           setToast]           = useState<{ type: "success"|"error"; msg: string }|null>(null);
  const [editCaption,     setEditCaption]     = useState("");
  const [editHashtags,    setEditHashtags]    = useState("");

  // Handle OAuth callback params
  useEffect(() => {
    const tk  = searchParams.get("tiktok_connected");
    const err = searchParams.get("error");
    if (tk === "true") {
      setTiktokConnected(true);
      showToast("success", "TikTok account connected! Ready to publish.");
      router.replace("/calendar");
    } else if (err) {
      showToast("error", `Connection failed: ${decodeURIComponent(err)}`);
      router.replace("/calendar");
    }
  }, [searchParams]); // eslint-disable-line

  const selectedPost = posts.find((p) => p.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedPost) {
      setEditCaption(selectedPost.caption);
      setEditHashtags(selectedPost.hashtags.join(" "));
    }
  }, [selectedId]); // eslint-disable-line

  const showToast = (type: "success"|"error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const postDates   = useMemo(() => new Set(posts.map((p) => p.date)), [posts]);
  const postsByDate = useMemo(() => {
    const m: Record<string, TikTokPost[]> = {};
    posts.forEach((p) => { (m[p.date] ??= []).push(p); });
    return m;
  }, [posts]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const calendarCells = useMemo(() => {
    const cells: (number|null)[] = [...Array(getFirstDayOfMonth(year, month)).fill(null)];
    for (let d = 1; d <= getDaysInMonth(year, month); d++) cells.push(d);
    return cells;
  }, [year, month]);

  // ── TikTok OAuth → redirect to TikTok login ───────────────────────────────
  const redirectToTikTokLogin = useCallback(async () => {
    const { verifier, challenge } = await generatePKCE();
    // Embed verifier in state so server-side callback can do PKCE exchange
    // Format: "{brandId}:{source}:{verifier}"
    const params = new URLSearchParams({
      client_key:            TIKTOK_CLIENT_KEY || "aw_demo_key",
      response_type:         "code",
      scope:                 "user.info.basic,video.publish,video.upload",
      redirect_uri:          TIKTOK_REDIRECT_URI,
      state:                 `${DEMO_BRAND_ID}:calendar:${verifier}`,
      code_challenge:        challenge,
      code_challenge_method: "S256",
    });
    window.location.href = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }, []);

  // ── Demo publish animation (for ?demo=true mode) ──────────────────────────
  const runDemoPublish = useCallback(async () => {
    if (!selectedPost) return;
    setPublishing(true);
    setPublishStep("connecting");
    await new Promise(r => setTimeout(r, 900));
    setPublishStep("uploading");
    await new Promise(r => setTimeout(r, 1400));
    setPublishStep("success");
    await new Promise(r => setTimeout(r, 800));
    setPosts(prev => prev.map(p =>
      p.id === selectedPost.id ? { ...p, status: "published" as PostStatus } : p
    ));
    showToast("success", "✅ Post berhasil dikirim ke TikTok! Buka TikTok untuk review.");
    setPublishing(false);
    setPublishStep("idle");
  }, [selectedPost]);

  // ── Real publish (calls API) ──────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!selectedPost) return;

    // Not connected → redirect to TikTok login
    if (!tiktokConnected) {
      redirectToTikTokLogin();
      return;
    }

    // Demo mode → animated simulation
    if (isDemoMode) {
      runDemoPublish();
      return;
    }

    // Real API call
    setPublishing(true);
    setPublishStep("uploading");
    try {
      const res  = await fetch("/api/tiktok/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId:   selectedPost.id,
          caption:  `${editCaption}\n\n${editHashtags}`.trim(),
          videoUrl: selectedPost.videoUrl,
          brandId:  DEMO_BRAND_ID,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.map(p =>
          p.id === selectedPost.id ? { ...p, status: "published" as PostStatus } : p
        ));
        showToast("success", "✅ Post dikirim ke TikTok! Buka TikTok app untuk review.");
      } else {
        showToast("error", data.error || "Publish gagal — cek logs.");
      }
    } catch {
      showToast("error", "Network error.");
    } finally {
      setPublishing(false);
      setPublishStep("idle");
    }
  }, [selectedPost, tiktokConnected, isDemoMode, editCaption, editHashtags, redirectToTikTokLogin, runDemoPublish]);

  // Publish button label
  const publishBtnLabel = () => {
    if (!tiktokConnected) return (
      <><TikTokIcon size={16} /> Login TikTok &amp; Publish</>
    );
    if (publishStep === "connecting") return <>🔗 Connecting to TikTok…</>;
    if (publishStep === "uploading")  return <>⬆ Uploading video…</>;
    if (publishStep === "success")    return <>✅ Published!</>;
    if (selectedPost?.status === "published") return <>✓ Published to TikTok</>;
    return <><TikTokIcon size={16} /> Publish to TikTok</>;
  };

  // ── LEFT COLUMN ───────────────────────────────────────────────────────────
  const leftCol = (
    <NavColumn>
      <div className="space-y-4">
        {/* Demo mode badge */}
        {isDemoMode && (
          <div className="rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 p-2.5 flex items-center gap-2">
            <span className="text-sm">🎬</span>
            <div>
              <p className="text-[10px] font-bold text-purple-700 dark:text-purple-400">Demo Mode</p>
              <p className="text-[9px] text-purple-600 dark:text-purple-300">Simulasi untuk TikTok review</p>
            </div>
          </div>
        )}

        {/* Connection card */}
        <div className={`rounded-xl p-3 border ${
          tiktokConnected
            ? "border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/10"
            : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03]"
        }`}>
          <div className="flex items-center gap-2 mb-2.5">
            <TikTokIcon size={16} className={tiktokConnected ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"} />
            <span className="text-xs font-semibold text-gray-800 dark:text-white">TikTok Account</span>
          </div>
          {tiktokConnected ? (
            <div>
              <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">✓ Connected</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">@geovera.id</p>
            </div>
          ) : (
            <button onClick={redirectToTikTokLogin}
              className="w-full rounded-lg bg-black text-white text-[11px] font-semibold py-2 flex items-center justify-center gap-1.5 hover:bg-gray-800 transition-colors">
              <TikTokIcon size={12} />
              Login &amp; Connect TikTok
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">{MONTH_NAMES[month]}</p>
          {([
            { label: "Published", status: "published", color: "text-green-600 dark:text-green-400" },
            { label: "Scheduled", status: "scheduled", color: "text-blue-600 dark:text-blue-400" },
            { label: "Draft",     status: "draft",     color: "text-gray-500 dark:text-gray-400" },
          ] as const).map(({ label, status, color }) => (
            <div key={label} className="flex items-center justify-between px-1 py-0.5">
              <span className="text-[11px] text-gray-600 dark:text-gray-400">{label}</span>
              <span className={`text-[12px] font-bold ${color}`}>
                {posts.filter(p => p.status === status).length}
              </span>
            </div>
          ))}
        </div>

        {/* Total reach if published */}
        <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800 p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Total Reach</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">852K</p>
          <p className="text-[10px] text-gray-400">views · this month</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-green-500 text-[10px] font-semibold">↑ 34%</span>
            <span className="text-[10px] text-gray-400">vs last month</span>
          </div>
        </div>

        {/* Mini calendar */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{MONTH_NAMES[month]} {year}</p>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">‹</button>
              <button onClick={nextMonth} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">›</button>
            </div>
          </div>
          <MiniMonthCalendar year={year} month={month}
            selectedDate={selectedPost?.date ?? null}
            postDates={postDates}
            onSelect={(ds) => { const p = posts.find(x => x.date === ds); if (p) setSelectedId(p.id); }}
          />
        </div>
      </div>
    </NavColumn>
  );

  // ── CENTER COLUMN ─────────────────────────────────────────────────────────
  const today = todayStr();
  const centerCol = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TikTokIcon size={18} className="text-[#FE2C55]" />
            TikTok Content Calendar
          </h1>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Schedule &amp; publish TikTok content</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.05] text-xs font-bold">‹</button>
          <span className="text-xs font-semibold text-gray-800 dark:text-white min-w-[100px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.05] text-xs font-bold">›</button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {calendarCells.map((day, i) => {
          const ds       = day ? toDateStr(year, month, day) : "";
          const dayPosts = day ? (postsByDate[ds] ?? []) : [];
          const isToday  = ds === today;
          return (
            <div key={i} className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 flex flex-col overflow-hidden ${!day ? "bg-gray-50/60 dark:bg-white/[0.01]" : ""}`}>
              {day && (
                <>
                  <span className={`self-start text-[10px] font-semibold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-[#FE2C55] text-white" : "text-gray-500 dark:text-gray-400"
                  }`}>{day}</span>
                  {dayPosts.map(p => (
                    <button key={p.id} onClick={() => setSelectedId(p.id)}
                      className={`text-left rounded px-1.5 py-0.5 mb-0.5 w-full text-[9px] leading-tight transition-all ${
                        selectedId === p.id
                          ? "ring-1 ring-[#FE2C55] bg-red-50 dark:bg-[#FE2C55]/10 font-medium"
                          : "bg-gray-100 dark:bg-white/[0.05] hover:bg-gray-200 dark:hover:bg-white/[0.08]"
                      }`}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: p.accentColor }} />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {p.time} · {p.title.split(":")[0].slice(0, 20)}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {posts.length} posts · {posts.filter(p => p.status === "scheduled").length} pending · {posts.filter(p => p.status === "published").length} published
        </span>
        <button className="flex items-center gap-1 rounded-lg bg-[#FE2C55] text-white text-[11px] font-semibold px-3 py-1.5 hover:bg-[#e0264c] transition-colors">
          <span className="text-sm leading-none">+</span> New Post
        </button>
      </div>
    </div>
  );

  // ── RIGHT COLUMN ──────────────────────────────────────────────────────────
  const rightCol = selectedPost ? (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <StatusBadge status={selectedPost.status} />
            <h2 className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white leading-snug">{selectedPost.title}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{selectedPost.date} · {selectedPost.time} WIB · {selectedPost.duration}</p>
            {selectedPost.views && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{selectedPost.views}</span> views ·{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-300">{selectedPost.likes}</span> likes
              </p>
            )}
          </div>
          <span className="flex-shrink-0 w-3 h-3 rounded-full mt-1.5" style={{ background: selectedPost.accentColor }} />
        </div>
      </div>

      {/* Phone preview */}
      <TikTokPhoneMockup post={selectedPost} caption={editCaption} hashtags={editHashtags.split(/\s+/)} />

      {/* Edit fields */}
      <div className="px-4 pb-6 space-y-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Caption</label>
          <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={5}
            className="w-full text-[12px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/30" />
          <span className="text-[10px] text-gray-400 float-right">{editCaption.length}/2200</span>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Hashtags</label>
          <input value={editHashtags} onChange={e => setEditHashtags(e.target.value)}
            className="w-full text-[12px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/30"
            placeholder="#hashtag1 #hashtag2 ..." />
        </div>

        <div className="flex items-center gap-2 bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3">
          <span className="text-sm">📅</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{selectedPost.date}</p>
            <p className="text-[10px] text-gray-400">at {selectedPost.time} WIB</p>
          </div>
          <button className="text-[11px] text-brand-500 hover:underline font-medium">Edit</button>
        </div>

        {/* ── MAIN PUBLISH BUTTON ─────────────────────────────────────────── */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handlePublish}
            disabled={publishing || selectedPost.status === "published"}
            className={`w-full rounded-xl font-semibold py-3.5 text-sm flex items-center justify-center gap-2 transition-all ${
              selectedPost.status === "published"
                ? "bg-green-100 text-green-700 cursor-default dark:bg-green-500/10 dark:text-green-400"
                : publishing
                ? "bg-[#FE2C55]/70 text-white cursor-wait"
                : tiktokConnected
                ? "bg-[#FE2C55] text-white hover:bg-[#e0264c] shadow-md hover:shadow-lg"
                : "bg-black text-white hover:bg-gray-900 shadow-md"
            }`}
          >
            {publishBtnLabel()}
          </button>

          {/* Progress bar saat publishing */}
          {publishing && (
            <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FE2C55] rounded-full transition-all duration-500"
                style={{ width: publishStep === "connecting" ? "35%" : publishStep === "uploading" ? "75%" : "100%" }}
              />
            </div>
          )}

          {tiktokConnected && selectedPost.status !== "published" && (
            <button className="w-full rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
              📅 Schedule · {selectedPost.date} {selectedPost.time}
            </button>
          )}

          {!tiktokConnected && (
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500">
              Kamu akan diarahkan ke halaman login TikTok
            </p>
          )}
        </div>

        {/* API info */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-3">
          <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">📡 TikTok Content Posting API v2</p>
          <p className="text-[10px] text-blue-600 dark:text-blue-300 mt-0.5 leading-relaxed">
            Scopes: <code className="font-mono">video.publish</code> · <code className="font-mono">video.upload</code><br/>
            Mode: <code className="font-mono">SEND_TO_USER_INBOX</code>
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div className="h-full flex items-center justify-center">
      <div className="text-center text-gray-400 dark:text-gray-600">
        <TikTokIcon size={40} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Pilih post untuk lihat detail</p>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <ThreeColumnLayout left={leftCol} center={centerCol} right={rightCol} />
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-lg text-sm font-medium flex items-center gap-2 max-w-sm ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function TikTokCalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
        Loading TikTok Calendar…
      </div>
    }>
      <TikTokCalendarInner />
    </Suspense>
  );
}
