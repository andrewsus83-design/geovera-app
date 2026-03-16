'use client';

import { useState } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBrands } from '@/lib/hooks/useBrands';
import { useQuotaOverrides } from '@/lib/hooks/useQuota';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const QUOTA_FIELDS = [
  { key: 'images_per_day', label: 'Images/hari' },
  { key: 'videos_per_day', label: 'Videos/hari' },
  { key: 'articles_per_day', label: 'Articles/hari' },
  { key: 'smart_reply_per_day', label: 'Smart Reply/hari' },
  { key: 'tasks_per_cycle', label: 'Tasks/cycle' },
  { key: 'tasks_active_max', label: 'Tasks aktif max' },
  { key: 'smart_reply_per_5min', label: 'Smart Reply/5min' },
] as const;

type FormState = Record<string, string>;

const emptyForm = (): FormState => ({
  brand_id: '',
  reason: '',
  ...Object.fromEntries(QUOTA_FIELDS.map(f => [f.key, ''])),
});

export default function QuotaOverridesPage() {
  const { toast } = useToast();
  const { data: brands = [] } = useBrands();
  const { data: overrides = [], refetch } = useQuotaOverrides();
  const [form, setForm] = useState<FormState>(emptyForm());

  const handleUpsert = async () => {
    if (!form.brand_id) {
      toast('error', 'Pilih brand terlebih dahulu');
      return;
    }

    const updates: Record<string, unknown> = {
      brand_id: form.brand_id,
      reason: form.reason || null,
      updated_at: new Date().toISOString(),
    };

    for (const f of QUOTA_FIELDS) {
      updates[f.key] = form[f.key] ? parseInt(form[f.key]) : null;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('brand_quota_override')
      .upsert(updates, { onConflict: 'brand_id' });

    if (error) {
      toast('error', error.message);
    } else {
      toast('success', 'Override berhasil disimpan');
      setForm(emptyForm());
      refetch();
    }
  };

  const handleEdit = (o: Record<string, unknown>) => {
    const newForm: FormState = {
      brand_id: String(o.brand_id || ''),
      reason: String(o.reason || ''),
    };
    for (const f of QUOTA_FIELDS) {
      newForm[f.key] = o[f.key] != null ? String(o[f.key]) : '';
    }
    setForm(newForm);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus override ini?')) return;
    const supabase = createClient();
    await supabase.from('brand_quota_override').delete().eq('id', id);
    toast('success', 'Override dihapus');
    refetch();
  };

  const activeFields = (o: Record<string, unknown>) =>
    QUOTA_FIELDS.filter(f => o[f.key] != null).map(f => `${f.label}: ${o[f.key]}`).join(', ') || 'Tidak ada override';

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Override Quota per Brand</h1>

      <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Brand</label>
            <select
              value={form.brand_id}
              onChange={(e) => setForm((p) => ({ ...p, brand_id: e.target.value }))}
              className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)]"
            >
              <option value="">Pilih brand...</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Input
            label="Alasan"
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="Alasan override..."
          />
        </div>
        <p className="text-[var(--fs-3xs)] text-[var(--t3)]">Kosongkan field untuk menggunakan default tier. Isi hanya field yang ingin di-override.</p>
        <div className="grid grid-cols-4 gap-3">
          {QUOTA_FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              type="number"
              value={form[f.key]}
              onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder="default"
            />
          ))}
        </div>
        <Button onClick={handleUpsert}>Simpan Override</Button>
      </div>

      <Table.Root>
        <Table.Header>
          <Table.Cell header>Brand</Table.Cell>
          <Table.Cell header>Override Aktif</Table.Cell>
          <Table.Cell header>Alasan</Table.Cell>
          <Table.Cell header>Aksi</Table.Cell>
        </Table.Header>
        <tbody>
          {overrides.length === 0 ? (
            <Table.Empty message="Belum ada override." />
          ) : (
            overrides.map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>{o.brands?.name || '-'}</Table.Cell>
                <Table.Cell><span className="text-[var(--fs-3xs)]">{activeFields(o as unknown as Record<string, unknown>)}</span></Table.Cell>
                <Table.Cell>{o.reason || '-'}</Table.Cell>
                <Table.Cell>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(o as unknown as Record<string, unknown>)} className="p-1.5 rounded text-[var(--t3)] hover:text-[var(--g5)]">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded text-[var(--t3)] hover:text-[var(--red)]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </tbody>
      </Table.Root>
    </div>
  );
}
