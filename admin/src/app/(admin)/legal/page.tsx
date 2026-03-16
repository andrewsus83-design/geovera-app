'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Tabs from '@/components/ui/Tabs';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils/format';

const LEGAL_TABS = [
  { id: 'privacy-policy', label: 'Kebijakan Privasi' },
  { id: 'terms-of-service', label: 'Syarat & Ketentuan' },
  { id: 'cookie-policy', label: 'Kebijakan Cookie' },
];

interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  last_updated_at: string | null;
  updated_by: string | null;
}

export default function LegalPagesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('privacy-policy');
  const [pages, setPages] = useState<Record<string, LegalPage>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPages = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('legal_pages').select('*');
      const map: Record<string, LegalPage> = {};
      (data || []).forEach((p: LegalPage) => { map[p.slug] = p; });
      setPages(map);
      setLoading(false);
    };
    fetchPages();
  }, []);

  const currentPage = pages[activeTab];

  const updatePage = (field: string, value: string) => {
    setPages((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!currentPage) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from('legal_pages').update({
        title: currentPage.title,
        content: currentPage.content,
        last_updated_at: new Date().toISOString(),
        updated_by: 'Admin',
      }).eq('slug', activeTab);
      toast('success', 'Halaman legal berhasil disimpan');
    } catch {
      toast('error', 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Legal Pages</h1>

      <Tabs tabs={LEGAL_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {loading ? (
        <p className="text-[var(--t3)]">Memuat...</p>
      ) : !currentPage ? (
        <p className="text-[var(--t3)]">Halaman belum dibuat.</p>
      ) : (
        <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-6 space-y-4">
          <Input label="Judul" value={currentPage.title || ''} onChange={(e) => updatePage('title', e.target.value)} />
          <div>
            <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Konten (Markdown)</label>
            <textarea
              value={currentPage.content || ''}
              onChange={(e) => updatePage('content', e.target.value)}
              rows={25}
              className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-4 text-[var(--fs-2xs)] text-[var(--t1)] font-mono resize-y min-h-[500px]"
            />
          </div>
          {currentPage.last_updated_at && (
            <p className="text-[var(--fs-3xs)] text-[var(--t3)]">
              Terakhir diperbarui: {formatDate(currentPage.last_updated_at)} oleh {currentPage.updated_by || '-'}
            </p>
          )}
          <Button onClick={handleSave} loading={saving}>Simpan</Button>
        </div>
      )}
    </div>
  );
}
