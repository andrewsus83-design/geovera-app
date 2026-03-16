'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Key, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { PlatformApiKey } from '@/lib/types/brand';

function mask(val: string | null): string {
  if (!val) return '—';
  if (val.length <= 4) return '••••';
  return '••••' + val.slice(-4);
}

export default function ApiKeysPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [keys, setKeys] = useState<PlatformApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('platform_api_keys').select('*').eq('brand_id', id).order('platform');
    setKeys((data as PlatformApiKey[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, [id]);

  const grouped = keys.reduce<Record<string, PlatformApiKey[]>>((acc, k) => {
    (acc[k.platform] = acc[k.platform] || []).push(k);
    return acc;
  }, {});

  const handleDelete = async (keyId: string) => {
    if (!confirm('Hapus API key ini?')) return;
    const supabase = createClient();
    await supabase.from('platform_api_keys').delete().eq('id', keyId);
    toast('success', 'API key dihapus');
    fetchKeys();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--fs-lg)] font-bold font-heading">API Keys</h1>
      </div>

      {loading ? (
        <p className="text-[var(--t3)]">Memuat...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><p className="text-[var(--t3)]">Belum ada API keys untuk brand ini.</p></Card>
      ) : (
        Object.entries(grouped).map(([platform, platformKeys]) => (
          <Card key={platform} title={platform.charAt(0).toUpperCase() + platform.slice(1)} icon={Key}>
            <div className="space-y-2">
              {platformKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-2 border-b border-[var(--b0)] last:border-0">
                  <div>
                    <span className="text-[var(--fs-3xs)] text-[var(--t2)]">{k.key_name}</span>
                    <p className="text-[var(--fs-2xs)] text-[var(--t1)] font-mono">{mask(k.api_key)}</p>
                  </div>
                  <button onClick={() => handleDelete(k.id)} className="p-1.5 rounded text-[var(--t3)] hover:text-[var(--red)] hover:bg-[rgba(248,113,113,.1)]">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
