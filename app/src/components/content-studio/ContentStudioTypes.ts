// Shared types for Content Studio — backed by gv_content_ideas table
export type ContentPlatform = "all" | "instagram" | "tiktok" | "blog" | "youtube" | "linkedin";
export type ContentStatus = "all" | "draft" | "scheduled" | "published";
export type ContentTone = "inspirational" | "professional" | "casual" | "viral" | "educational";

export interface ContentIdea {
  id: string;
  brand_id: string;
  title: string;
  description: string | null;
  content_type: string | null;      // "post" | "reel" | "article" | "video" | "carousel"
  platform: string | null;           // "instagram" | "tiktok" | "blog" | "youtube"
  tone: string | null;
  hook_angle: string | null;
  suggested_hashtags: string[] | null;
  viral_hooks: string[] | null;
  target_audience: string | null;
  estimated_engagement: string | null;
  status: string | null;             // "draft" | "scheduled" | "published"
  scheduled_for: string | null;
  published_at: string | null;
  published_url: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export const PLATFORM_ICON: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  blog: "📝",
  youtube: "🎬",
  linkedin: "💼",
  general: "✨",
};

export const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-pink-50 text-pink-600",
  tiktok: "bg-gray-900 text-white",
  blog: "bg-blue-50 text-blue-600",
  youtube: "bg-red-50 text-red-600",
  linkedin: "bg-sky-50 text-sky-600",
  general: "bg-brand-50 text-brand-600",
};

export const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-500",
  scheduled: "bg-amber-50 text-amber-600",
  published: "bg-green-50 text-green-600",
};
