'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { TierQuotaConfig } from '@/lib/types/quota';

const TIER_META: Record<string, { label: string; variant: 'info' | 'violet' | 'warning' }> = {
  go: { label: 'Go', variant: 'info' },
  pro: { label: 'Pro', variant: 'violet' },
  enterprise: { label: 'Enterprise', variant: 'warning' },
};

const NUMBER_FIELDS = [
  { key: 'content_sets_per_day', label: 'Content Sets / hari' },
  { key: 'images_per_day', label: 'Gambar / hari' },
  { key: 'videos_per_day', label: 'Video / hari' },
  { key: 'articles_per_day', label: 'Artikel / hari' },
  { key: 'smart_reply_per_day', label: 'Smart Reply / hari' },
  { key: 'manual_reply_per_day', label: 'Manual Reply / hari' },
  { key: 'tasks_per_cycle', label: 'Tasks / cycle' },
  { key: 'tasks_active_max', label: 'Tasks aktif maks' },
  { key: 'qa_per_cycle', label: 'QA / cycle' },
  { key: 'approval_expiry_hours', label: 'Approval expiry (jam)' },
  { key: 'smart_reply_per_5min', label: 'Smart Reply / 5 menit' },
];

export default function QuotaPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<TierQuotaConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('tier_quota_config').select('*').order('tier');
      setConfigs((data as TierQuotaConfig[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const updateField = (idx: number, key: string, value: unknown) => {
    setConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, [key]: value } : c));
  };

  const handleSave = async (config: TierQuotaConfig) => {
    const supabase = createClient();
    const { id, tier, updated_by, updated_at: _ua, notes: _n, ...mutableFields } = config;
    const { error, data } = await supabase
      .from('tier_quota_config')
      .update({ ...mutableFields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');

    if (error) {
      toast('error', `Gagal menyimpan: ${error.message}`);
    } else if (!data || data.length === 0) {
      toast('error', 'Tidak ada perubahan tersimpan — periksa hak akses admin');
    } else {
      toast('success', `Quota tier ${TIER_META[tier]?.label || tier} berhasil disimpan`);
    }
  };

  if (loading) return <div className="p-8 text-[var(--t3)]">Memuat...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Kelola Quota</h1>

      <div className="grid grid-cols-3 gap-4">
        {configs.map((config, idx) => {
          const meta = TIER_META[config.tier] || { label: config.tier, variant: 'default' as const };
          return (
            <div key={config.id} className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-5 space-y-4">
              <Badge variant={meta.variant}>{meta.label}</Badge>

              {NUMBER_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[var(--fs-3xs)] text-[var(--t3)] mb-1 block">{label}</label>
                  <input
                    type="number"
                    value={(config as unknown as Record<string, unknown>)[key] as number || 0}
                    onChange={(e) => updateField(idx, key, parseInt(e.target.value) || 0)}
                    className="w-full h-8 px-2 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r2)] text-[var(--fs-3xs)] text-[var(--t1)]"
                  />
                </div>
              ))}

              <div>
                <label className="text-[var(--fs-3xs)] text-[var(--t3)] mb-1 block">Research Depth</label>
                <select
                  value={config.research_depth}
                  onChange={(e) => updateField(idx, 'research_depth', e.target.value)}
                  className="w-full h-8 px-2 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r2)] text-[var(--fs-3xs)] text-[var(--t1)]"
                >
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
              </div>

              <Toggle checked={config.auto_publish_enabled} onChange={(v) => updateField(idx, 'auto_publish_enabled', v)} label="Auto Publish" />
              <Toggle checked={config.biweekly_report} onChange={(v) => updateField(idx, 'biweekly_report', v)} label="Biweekly Report" />
              <Toggle checked={config.overage_allowed} onChange={(v) => updateField(idx, 'overage_allowed', v)} label="Overage Allowed" />

              {config.overage_allowed && (
                <div>
                  <label className="text-[var(--fs-3xs)] text-[var(--t3)] mb-1 block">Overage Multiplier</label>
                  <input
                    type="number" step="0.1"
                    value={config.overage_multiplier}
                    onChange={(e) => updateField(idx, 'overage_multiplier', parseFloat(e.target.value) || 1)}
                    className="w-full h-8 px-2 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r2)] text-[var(--fs-3xs)] text-[var(--t1)]"
                  />
                </div>
              )}

              <Button onClick={() => handleSave(config)} className="w-full" size="sm">Simpan</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
