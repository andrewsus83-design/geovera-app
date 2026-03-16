'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Tabs from '@/components/ui/Tabs';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FileDropzone from '@/components/ui/FileDropzone';
import { useToast } from '@/components/ui/Toast';
import { autoSlug } from '@/lib/utils/slug';
import { createBrand } from '../actions';
import { Instagram, Facebook, Youtube } from 'lucide-react';

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

export default function NewBrandPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', slug: '', category: '', tier: 'go',
    website: '', bot_prefix: '', wa_number: '', group_wa_id: '', fonnte_token: '',
    social: { instagram: '', tiktok: '', facebook: '', youtube: '', pinterest: '' },
    api_keys: {
      tiktok: {} as Record<string, string>,
      meta: {} as Record<string, string>,
      google: {} as Record<string, string>,
      other: {} as Record<string, string>,
    },
  });

  const updateForm = (key: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name') next.slug = autoSlug(value);
      return next;
    });
  };

  const updateSocial = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, social: { ...prev.social, [key]: value.replace(/^@/, '') } }));
  };

  const updateApiKey = (platform: string, key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      api_keys: { ...prev.api_keys, [platform]: { ...prev.api_keys[platform as keyof typeof prev.api_keys], [key]: value } },
    }));
  };

  const handleSave = async () => {
    if (!form.name || !form.slug || !form.category) {
      toast('error', 'Nama, slug, dan kategori wajib diisi');
      return;
    }
    setLoading(true);
    try {
      await createBrand({
        name: form.name, slug: form.slug, category: form.category, tier: form.tier,
        website: form.website, bot_prefix: form.bot_prefix, wa_number: form.wa_number,
        group_wa_id: form.group_wa_id, social_handles: form.social, api_keys: form.api_keys,
      });
      toast('success', 'Brand berhasil disimpan. AI pipeline sedang berjalan.');
      router.push('/brands');
    } catch (err) {
      toast('error', 'Gagal menyimpan brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Tambah Brand Baru</h1>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-6">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <Input label="Nama Brand *" value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Contoh: Aquviva Indonesia" />
            <div>
              <Input label="Slug *" value={form.slug} onChange={(e) => updateForm('slug', e.target.value)} />
              <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-1">{form.slug}.geovera.xyz</p>
            </div>
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Kategori *</label>
              <select value={form.category} onChange={(e) => updateForm('category', e.target.value)} className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none">
                <option value="">Pilih kategori...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Tier *</label>
              <select value={form.tier} onChange={(e) => updateForm('tier', e.target.value)} className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none">
                {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <Input label="Website" type="url" value={form.website} onChange={(e) => updateForm('website', e.target.value)} placeholder="https://..." />
            <Input label="Bot Prefix WA" value={form.bot_prefix} onChange={(e) => updateForm('bot_prefix', e.target.value)} placeholder="brandname" />

            <div className="pt-4 border-t border-[var(--b0)]">
              <p className="text-[var(--fs-2xs)] font-medium text-[var(--t2)] mb-3">Social Media Handles</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Instagram" value={form.social.instagram} onChange={(e) => updateSocial('instagram', e.target.value)} placeholder="@username" />
                <Input label="TikTok" value={form.social.tiktok} onChange={(e) => updateSocial('tiktok', e.target.value)} placeholder="@username" />
                <Input label="Facebook" value={form.social.facebook} onChange={(e) => updateSocial('facebook', e.target.value)} placeholder="Page name" />
                <Input label="YouTube" value={form.social.youtube} onChange={(e) => updateSocial('youtube', e.target.value)} placeholder="Channel" />
                <Input label="Pinterest" value={form.social.pinterest} onChange={(e) => updateSocial('pinterest', e.target.value)} placeholder="@username" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wa' && (
          <div className="space-y-4">
            <Input label="Nomor WA Brand *" type="tel" value={form.wa_number} onChange={(e) => updateForm('wa_number', e.target.value)} placeholder="628159944200" />
            <Input label="Group WA ID" value={form.group_wa_id} onChange={(e) => updateForm('group_wa_id', e.target.value)} placeholder="Dari Fonnte dashboard" />
            <Input label="Fonnte Device Token" type="password" value={form.fonnte_token} onChange={(e) => updateForm('fonnte_token', e.target.value)} />
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Webhook URL (read-only)</label>
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
                    return (
                      <Input
                        key={key}
                        label={field}
                        type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('token') ? 'password' : 'text'}
                        value={form.api_keys[platform as keyof typeof form.api_keys]?.[key] || ''}
                        onChange={(e) => updateApiKey(platform, key, e.target.value)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'files' && (
          <FileDropzone onFiles={(files) => { /* handled on save */ }} />
        )}
      </div>

      <Button onClick={handleSave} loading={loading} className="w-full" size="lg">
        Simpan Brand
      </Button>
    </div>
  );
}
