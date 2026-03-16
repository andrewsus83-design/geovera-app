'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { BlogPost } from '@/lib/types/blog';

interface BlogFilters {
  status?: string;
  category?: string;
  brand_tag?: string;
}

export function useBlogPosts(filters?: BlogFilters) {
  return useQuery({
    queryKey: ['blog-posts', filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from('blog_posts').select('*').order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters?.brand_tag) {
        query = query.contains('brand_tags', [filters.brand_tag]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BlogPost[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBlogPost(id: string) {
  return useQuery({
    queryKey: ['blog-post', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as BlogPost;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
