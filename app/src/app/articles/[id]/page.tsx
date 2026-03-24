import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// HMAC-SHA256 token — shared secret bound to brand+article, not per-WA-number.
// Anyone who receives the WA message has the token; outsiders cannot guess it.
async function verifyToken(brandId: string, articleId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.CONTENT_URL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) return true; // dev mode: skip auth if no secret configured
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${brandId}:${articleId}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "").slice(0, 16);
    return token === expected;
  } catch { return false; }
}

interface ArticleRow {
  id: string;
  brand_id: string;
  topic: string;
  content: string | null;
  content_very_long: string | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keywords: string[] | null;
  social: Record<string, string> | null;
  geo: { faq?: Array<{ question: string; answer: string }> } | null;
  objective: string | null;
  length: string | null;
  requested_by: string | null;
  created_at: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { data } = await getSupabase()
      .from("gv_article_generations")
      .select("meta_title, meta_description, topic")
      .eq("id", id)
      .single();
    if (!data) return { title: "Artikel | GeoVera" };
    return {
      title: data.meta_title || data.topic || "Artikel | GeoVera",
      description: data.meta_description || undefined,
    };
  } catch { return { title: "Artikel | GeoVera" }; }
}

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;

  // Fetch article first to get brand_id for token verification
  let article: ArticleRow | null = null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("gv_article_generations")
      .select("id, brand_id, topic, content, content_very_long, meta_title, meta_description, focus_keywords, social, geo, objective, length, requested_by, created_at")
      .eq("id", id)
      .single<ArticleRow>();
    article = data;
  } catch { /* env vars not set in dev */ }

  if (!article) notFound();

  // Verify access token
  const authorized = await verifyToken(article.brand_id, article.id, token ?? "");
  if (!authorized) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Akses Terbatas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Konten ini hanya dapat diakses melalui link resmi yang dikirim via WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  const content = article.content_very_long || article.content || "";
  const publishedDate = new Date(article.created_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  let brandName = "";
  try {
    const { data: brand } = await getSupabase()
      .from("brands").select("name").eq("id", article.brand_id).maybeSingle();
    brandName = brand?.name ?? "";
  } catch { /* */ }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">GeoVera</span>
          {brandName && <><span>·</span><span>{brandName}</span></>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 leading-tight">
          {article.meta_title || article.topic}
        </h1>

        <div className="flex flex-wrap gap-3 mb-6 text-sm text-gray-500 dark:text-gray-400">
          {brandName && (
            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full text-xs font-medium">
              {brandName}
            </span>
          )}
          <span>{publishedDate}</span>
          {article.requested_by && <span>oleh {article.requested_by}</span>}
        </div>

        {article.meta_description && (
          <p className="text-gray-600 dark:text-gray-300 text-base mb-6 italic border-l-4 border-indigo-200 dark:border-indigo-700 pl-4">
            {article.meta_description}
          </p>
        )}

        <div
          className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-indigo-600 dark:prose-a:text-indigo-400"
          dangerouslySetInnerHTML={{ __html: content }}
        />

        {article.focus_keywords && article.focus_keywords.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {article.focus_keywords.map((kw) => (
                <span key={kw} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded text-xs">{kw}</span>
              ))}
            </div>
          </div>
        )}

        {article.geo?.faq && article.geo.faq.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">FAQ</h2>
            <div className="space-y-4">
              {article.geo.faq.map((item, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">{item.question}</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {article.social && Object.keys(article.social).length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Social Captions</h2>
            <div className="space-y-3">
              {Object.entries(article.social).map(([platform, caption]) =>
                caption ? (
                  <div key={platform} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase mb-1">{platform}</p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">{String(caption)}</p>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-600">
          Generated by GeoVera AI · {publishedDate}
        </div>
      </main>
    </div>
  );
}
