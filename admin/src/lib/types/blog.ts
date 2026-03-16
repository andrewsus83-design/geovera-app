export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  cover_color: string | null;
  category: string | null;
  tags: string[];
  brand_tags: string[];
  author_name: string | null;
  author_avatar: string | null;
  read_time: number;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
