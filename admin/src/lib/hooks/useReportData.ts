'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useReportData(brandId: string, periodDays: number = 30) {
  return useQuery({
    queryKey: ['report-data', brandId, periodDays],
    queryFn: async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - periodDays * 86400000).toISOString();

      const [reports, doneTasks, skippedTasks, activeTasks, insights, health] = await Promise.allSettled([
        supabase
          .from('biweekly_reports')
          .select('*')
          .eq('brand_id', brandId)
          .order('generated_at', { ascending: false })
          .limit(3),
        supabase
          .from('tasks')
          .select('*')
          .eq('brand_id', brandId)
          .eq('status', 'done')
          .gte('completed_at', since),
        supabase
          .from('tasks')
          .select('*')
          .eq('brand_id', brandId)
          .eq('status', 'skipped'),
        supabase
          .from('tasks')
          .select('*')
          .eq('brand_id', brandId)
          .eq('status', 'active')
          .order('priority_score', { ascending: false })
          .limit(20),
        supabase
          .from('insights')
          .select('*')
          .eq('brand_id', brandId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('health_scores')
          .select('*')
          .eq('brand_id', brandId)
          .single(),
      ]);

      return {
        reports: reports.status === 'fulfilled' ? reports.value.data : [],
        doneTasks: doneTasks.status === 'fulfilled' ? doneTasks.value.data : [],
        skippedTasks: skippedTasks.status === 'fulfilled' ? skippedTasks.value.data : [],
        activeTasks: activeTasks.status === 'fulfilled' ? activeTasks.value.data : [],
        insights: insights.status === 'fulfilled' ? insights.value.data : [],
        health: health.status === 'fulfilled' ? health.value.data : null,
      };
    },
    enabled: !!brandId,
    staleTime: 5 * 60 * 1000,
  });
}
