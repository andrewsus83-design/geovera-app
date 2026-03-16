'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { Settings, Webhook, Server } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  label: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('site_settings').select('key, value');
      const map: Record<string, string> = {};
      (data || []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value; });
      setSettings(map);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async (keys: string[]) => {
    setSaving(true);
    const supabase = createClient();
    try {
      for (const key of keys) {
        await supabase.from('site_settings').upsert({ key, value: settings[key] || '' }, { onConflict: 'key' });
      }
      toast('success', 'Pengaturan berhasil disimpan');
    } catch {
      toast('error', 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const toggleSwitch = async (key: string, value: boolean) => {
    updateSetting(key, value ? 'true' : 'false');
    const supabase = createClient();
    await supabase.from('site_settings').upsert({ key, value: value ? 'true' : 'false' }, { onConflict: 'key' });
    toast('success', `${key} ${value ? 'diaktifkan' : 'dinonaktifkan'}`);
  };

  if (loading) return <div className="p-8 text-[var(--t3)]">Memuat...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Pengaturan</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Company Info */}
        <Card title="Informasi Perusahaan" icon={Settings}>
          <div className="space-y-4">
            <Input label="Nama Perusahaan" value={settings.company_name || ''} onChange={(e) => updateSetting('company_name', e.target.value)} />
            <Input label="Email" type="email" value={settings.company_email || ''} onChange={(e) => updateSetting('company_email', e.target.value)} />
            <Input label="Telepon" value={settings.company_phone || ''} onChange={(e) => updateSetting('company_phone', e.target.value)} />
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Alamat</label>
              <textarea
                value={settings.company_address || ''}
                onChange={(e) => updateSetting('company_address', e.target.value)}
                rows={3}
                className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-3 text-[var(--fs-2xs)] text-[var(--t1)] resize-none"
              />
            </div>
            <Button onClick={() => saveSettings(['company_name', 'company_email', 'company_phone', 'company_address'])} loading={saving}>
              Simpan
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          {/* Webhook */}
          <Card title="Webhook & Integrasi" icon={Webhook}>
            <div className="space-y-4">
              <div>
                <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Webhook URL (read-only)</label>
                <div className="h-9 px-3 bg-[var(--s2)] border border-[var(--b0)] rounded-[var(--r4)] flex items-center text-[var(--fs-3xs)] text-[var(--t3)] font-mono overflow-hidden">
                  https://vozjwptzutolvkvfpknk.supabase.co/functions/v1/wa-receive
                </div>
              </div>
              <Input label="Fonnte Master Token" type="password" value={settings.fonnte_token || ''} onChange={(e) => updateSetting('fonnte_token', e.target.value)} />
              <Button onClick={() => saveSettings(['fonnte_token'])} loading={saving} size="sm">Simpan</Button>
            </div>
          </Card>

          {/* System Switches */}
          <Card title="System Switches">
            <div className="space-y-4">
              <Toggle
                checked={settings.onboarding_enabled === 'true'}
                onChange={(v) => toggleSwitch('onboarding_enabled', v)}
                label="Onboarding Aktif"
                description="Aktifkan proses onboarding otomatis untuk brand baru"
              />
              <Toggle
                checked={settings.maintenance_mode === 'true'}
                onChange={(v) => toggleSwitch('maintenance_mode', v)}
                label="Mode Maintenance"
                description="Nonaktifkan akses pengguna saat maintenance"
              />
            </div>
          </Card>

          {/* Supabase Info */}
          <Card title="Informasi Supabase" icon={Server}>
            <div className="space-y-2 text-[var(--fs-3xs)]">
              <div className="flex justify-between">
                <span className="text-[var(--t3)]">Project ref</span>
                <code className="text-[var(--t2)]">vozjwptzutolvkvfpknk</code>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--t3)]">Edge Functions</span>
                <span className="text-[var(--t1)]">42</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
