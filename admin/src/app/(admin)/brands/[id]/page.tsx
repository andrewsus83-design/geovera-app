'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import Tabs from '@/components/ui/Tabs';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FileDropzone from '@/components/ui/FileDropzone';
import { useToast } from '@/components/ui/Toast';
import { useBrand } from '@/lib/hooks/useBrands';
import { updateBrand, triggerRefresh } from '../actions';

const CATEGORIES = ['F&B', 'Fashion', 'Beauty', 'Health', 'Tech', 'Education', 'Finance', 'Property', 'Automotive', 'Travel', 'Entertainment', 'Sport', 'Lainnya'];
const TIER_OPTIONS = [
  { value: 'go', label: 'Go — Rp 4.900.000/bln' },
  { value: 'pro', label: 'Pro — Rp 8.900.000/bln' },
  { value: 'enterprise', label: 'Enterprise — Rp 16.900.000/bln' },
];
const TABS = [
  { id: 'info', label: 'Info Brand' },
  { id: 'wa', label: 'WhatsApp Setup' },
  { id: 'api', label: 'API Keys' },
  { id: 'files', label: 'Upload Files' },
];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', indexing: 'info', complete: 'success', failed: 'error',
  gemini_complete: 'info', researching_deep: 'info', consolidating: 'info', sot_ready: 'success',
};

export default function EditBrandPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading } = useBrand(id);
  const [activeTab, setActiveTab] = useState('info');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({
    name: '', slug: '', category: '', tier: 'go',
    website: '', bot_prefix: '', wa_number: '', group_wa_id: '',
    social: { instagram: '', tiktok: '', facebook: '', youtube: '', pinterest: '' },
    api_keys: { tiktok: {} as Record<string, string>, meta: {}, google: {}, other: {} },
  });

  useEffect(() => {
    if (data?.brand) {
      const b = data.brand;
      const p = data.profile;
      setForm({
        name: b.name || '', slug: b.slug || '', category: b.category || '', tier: b.tier || 'go',
        website: b.website || '', bot_prefix: b.bot_prefix || '', wa_number: b.wa_number || '',
        group_wa_id: b.group_wa_id || '',
        social: {
          instagram: p?.instagram_handle || p?.social_handles?.instagram || '',
          tiktok: p?.tiktok_handle || p?.social_handles?.tiktok || '',
          facebook: p?.facebook_page || p?.social_handles?.facebook || '',
          youtube: p?.social_handles?.youtube || '',
          pinterest: p?.social_handles?.pinterest || '',
        },
        api_keys: { tiktok: {}, meta: {}, google: {}, other: {} },
      });
    }
  }, [data]);

  const updateForm = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));
  const updateSocial = (key: string, value: string) => setForm((p) => ({ ...p, social: { ...p.social, [key]: value.replace(/^@/, '') } }));
  const updateApiKey = (platform: string, key: string, value: string) => {
    setForm((p) => ({ ...p, api_keys: { ...p.api_keys, [platform]: { ...(p.api_keys as Record<string, Record<string, string>>)[platform], [key]: value } } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBrand(id, { ...form, social_handles: form.social });
      toast('success', 'Brand berhasil diperbarui');
    } catch {
      toast('error', 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerRefresh(id);
      toast('success', 'Refresh pipeline dipicu');
    } catch {
      toast('error', 'Gagal trigger refresh');
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) return <div className="p-8 text-[var(--t3)]">Memuat data brand...</div>;

  const researchStatus = data?.profile?.research_status || 'pending';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[var(--fs-lg)] font-bold font-heading">Edit Brand</h1>
          <Badge variant={statusVariant[researchStatus] || 'default'}>{researchStatus}</Badge>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
          Trigger Refresh
        </Button>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-6">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <Input label="Nama Brand *" value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
            <Input label="Slug *" value={form.slug} onChange={(e) => updateForm('slug', e.target.value)} />
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Kategori *</label>
              <select value={form.category} onChange={(e) => updateForm('category', e.target.value)} className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)]">
                <option value="">Pilih kategori...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Tier *</label>
              <select value={form.tier} onChange={(e) => updateForm('tier', e.target.value)} className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)]">
                {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <Input label="Website" type="url" value={form.website} onChange={(e) => updateForm('website', e.target.value)} />
            <Input label="Bot Prefix WA" value={form.bot_prefix} onChange={(e) => updateForm('bot_prefix', e.target.value)} />
            <div className="pt-4 border-t border-[var(--b0)]">
              <p className="text-[var(--fs-2xs)] font-medium text-[var(--t2)] mb-3">Social Media Handles</p>
              <div className="grid grid-cols-2 gap-3">
                {['instagram', 'tiktok', 'facebook', 'youtube', 'pinterest'].map((k) => (
                  <Input key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={(form.social as Record<string, string>)[k]} onChange={(e) => updateSocial(k, e.target.value)} />
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'wa' && (
          <div className="space-y-4">
            <Input label="Nomor WA Brand *" type="tel" value={form.wa_number} onChange={(e) => updateForm('wa_number', e.target.value)} />
            <Input label="Group WA ID" value={form.group_wa_id} onChange={(e) => updateForm('group_wa_id', e.target.value)} />
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Webhook URL</label>
              <div className="h-9 px-3 bg-[var(--s2)] border border-[var(--b0)] rounded-[var(--r4)] flex items-center text-[var(--fs-3xs)] text-[var(--t3)] font-mono">
                https://vozjwptzutolvkvfpknk.supabase.co/functions/v1/wa-receive
              </div>
            </div>
          </div>
        )}
        {activeTab === 'api' && (
          <div className="space-y-6">
            {[
              { platform: 'tiktok', label: 'TikTok', fields: ['App ID', 'App Secret', 'Access Token', 'Business Account ID', 'Advertiser ID', 'Pixel ID'] },
              { platform: 'meta', label: 'Meta', fields: ['App ID', 'App Secret', 'Access Token', 'IG Business Account ID', 'Ad Account ID', 'Meta Pixel ID', 'Business Manager ID'] },
              { platform: 'google', label: 'Google', fields: ['Client ID', 'Client Secret', 'Refresh Token', 'GA4 Property ID', 'Search Console Property', 'Ads Customer ID', 'Developer Token'] },
              { platform: 'other', label: 'Lainnya', fields: ['Late Profile ID', 'Late Profile Name'] },
            ].map(({ platform, label, fields }) => (
              <div key={platform} className="border border-[var(--b0)] rounded-[var(--r5)] p-4">
                <p className="text-[var(--fs-2xs)] font-semibold text-[var(--t1)] mb-3">{label}</p>
                <div className="grid grid-cols-2 gap-3">
                  {fields.map((field) => {
                    const key = field.toLowerCase().replace(/\s+/g, '_');
                    return <Input key={key} label={field} type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('token') ? 'password' : 'text'} value={(form.api_keys as Record<string, Record<string, string>>)[platform]?.[key] || ''} onChange={(e) => updateApiKey(platform, key, e.target.value)} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'files' && <FileDropzone onFiles={() => {}} />}
      </div>

      <Button onClick={handleSave} loading={saving} className="w-full" size="lg">Simpan Perubahan</Button>
    </div>
  );
}
