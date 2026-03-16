'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Brand, BrandProfile } from '@/lib/types/brand';

interface BrandFilters {
  tier?: string;
  status?: string;
  search?: string;
}

export function useBrands(filters?: BrandFilters) {
  return useQuery({
    queryKey: ['brands', filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from('brands').select('*').order('created_at', { ascending: false });

      if (filters?.tier && filters.tier !== 'all') {
        query = query.eq('tier', filters.tier);
      }
      if (filters?.status === 'active') {
        query = query.eq('onboarding_done', true);
      } else if (filters?.status === 'pending') {
        query = query.eq('onboarding_done', false);
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,wa_number.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Brand[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrand(id: string) {
  return useQuery({
    queryKey: ['brand', id],
    queryFn: async () => {
      const supabase = createClient();

      const [brandRes, profileRes] = await Promise.all([
        supabase.from('brands').select('*').eq('id', id).single(),
        supabase.from('brand_profiles').select('*').eq('brand_id', id).single(),
      ]);

      if (brandRes.error) throw brandRes.error;

      return {
        brand: brandRes.data as Brand,
        profile: profileRes.data as BrandProfile | null,
      };
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
