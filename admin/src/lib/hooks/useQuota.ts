'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TierQuotaConfig, BrandQuotaOverride } from '@/lib/types/quota';

export function useQuotaConfig() {
  return useQuery({
    queryKey: ['quota-config'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tier_quota_config')
        .select('*')
        .order('tier');

      if (error) throw error;
      return data as TierQuotaConfig[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useQuotaOverrides(brandId?: string) {
  return useQuery({
    queryKey: ['quota-overrides', brandId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from('brand_quota_override').select('*, brands(name)').order('updated_at', { ascending: false });

      if (brandId) {
        query = query.eq('brand_id', brandId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (BrandQuotaOverride & { brands: { name: string } | null })[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
