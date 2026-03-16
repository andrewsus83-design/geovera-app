'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils/format';
import { Eye, CheckCircle, XCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';

interface GeneratedContent {
  id: string;
  brand_id: string;
  brand_name?: string;
  set_number: number;
  topic: string | null;
  pillar: string | null;
  persona_id: string | null;
  status: 'generating' | 'generated' | 'approved' | 'published' | 'rejected' | 'expired';
  instagram_post: Record<string, unknown> | null;
  tiktok: Record<string, unknown> | null;
  reels: Record<string, unknown> | null;
  shorts: Record<string, unknown> | null;
  x_post: Record<string, unknown> | null;
  linkedin: Record<string, unknown> | null;
  pinterest: Record<string, unknown> | null;
  blog: Record<string, unknown> | null;
  generation_model: string | null;
  generation_cost_usd: number;
  created_at: string;
  approved_at: string | null;
  published_at: string | null;
  expires_at: string | null;
}

interface ContentStats {
  total: number;
  generated: number;
  approved: number;
  published: number;
  rejected: number;
  expired: number;
}

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error' | 'violet'> = {
  generating: 'info',
  generated: 'warning',
  approved: 'violet',
  published: 'success',
  rejected: 'error',
  expired: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  generating: 'Generating',
  generated: 'Siap Review',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  expired: 'Expired',
};

const PLATFORMS = [
  { key: 'instagram_post', label: 'Instagram', icon: '📸', connectKey: 'instagram' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', connectKey: 'tiktok' },
  { key: 'reels', label: 'Reels', icon: '🎬', connectKey: 'instagram' },
  { key: 'shorts', label: 'Shorts', icon: '📱', connectKey: 'youtube' },
  { key: 'x_post', label: 'X', icon: '𝕏', connectKey: 'twitter' },
  { key: 'linkedin', label: 'LinkedIn', icon: '💼', connectKey: 'linkedin' },
  { key: 'pinterest', label: 'Pinterest', icon: '📌', connectKey: 'pinterest' },
  { key: 'blog', label: 'Blog', icon: '📝', connectKey: null },
];

export default function GeneratedContentPage() {
  const { toast } = useToast();
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [stats, setStats] = useState<ContentStats>({ total: 0, generated: 0, approved: 0, published: 0, rejected: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, string[]>>({});

  /** Fetch connected platforms for a brand via social-connect/status */
  const fetchConnectedPlatforms = async (brandIds: string[]) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const results: Record<string, string[]> = {};

    await Promise.all(
      brandIds.map(async (brandId) => {
        try {
          const res = await fetch(
            `${supabaseUrl}/functions/v1/social-connect/status?brand_id=${brandId}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );
          if (res.ok) {
            const { accounts } = await res.json() as { accounts: { provider?: string; platform?: string }[] };
            results[brandId] = (accounts || []).map(
              (a) => (a.provider || a.platform || '').toLowerCase()
            );
          }
        } catch {
          // Silently skip — connection status is supplementary
        }
      })
    );

    setConnectedPlatforms((prev) => ({ ...prev, ...results }));
  };

  const fetchData = async () => {
    const supabase = createClient();

    // Fetch brands for filter
    const { data: brandList } = await supabase.from('brands').select('id, name').order('name');
    setBrands(brandList || []);

    // Build query
    let query = supabase
      .from('generated_content')
      .select('*, brands!inner(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (brandFilter !== 'all') query = query.eq('brand_id', brandFilter);

    const { data } = await query;
    const rows = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      brand_name: (r.brands as { name: string })?.name || 'Unknown',
    })) as GeneratedContent[];
    setContents(rows);

    // Fetch connected platforms for all unique brands
    const uniqueBrandIds = Array.from(new Set(rows.map((r) => r.brand_id)));
    if (uniqueBrandIds.length > 0) fetchConnectedPlatforms(uniqueBrandIds);

    // Compute stats
    const { data: allStats } = await supabase
      .from('generated_content')
      .select('status');
    const all = allStats || [];
    setStats({
      total: all.length,
      generated: all.filter((r: { status: string }) => r.status === 'generated').length,
      approved: all.filter((r: { status: string }) => r.status === 'approved').length,
      published: all.filter((r: { status: string }) => r.status === 'published').length,
      rejected: all.filter((r: { status: string }) => r.status === 'rejected').length,
      expired: all.filter((r: { status: string }) => r.status === 'expired').length,
    });

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter, brandFilter]);

  const updateStatus = async (id: string, newStatus: string) => {
    const supabase = createClient();
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'approved') updates.approved_at = new Date().toISOString();
    if (newStatus === 'published') updates.published_at = new Date().toISOString();
    if (newStatus === 'rejected') updates.rejected_at = new Date().toISOString();

    const { error } = await supabase.from('generated_content').update(updates).eq('id', id);
    if (error) { toast('error', 'Gagal update status'); return; }
    toast('success', `Content ${STATUS_LABEL[newStatus] || newStatus}`);
    fetchData();
  };

  const countPlatforms = (c: GeneratedContent) => {
    return PLATFORMS.filter(p => (c as unknown as Record<string, unknown>)[p.key] !== null).length;
  };

  const isPlatformConnected = (brandId: string, connectKey: string | null): boolean => {
    if (!connectKey) return true; // Blog doesn't need connection
    const connected = connectedPlatforms[brandId] || [];
    return connected.includes(connectKey);
  };

  if (loading) return <div className="p-8 text-[var(--t3)]">Memuat...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Generated Content</h1>
      <p className="text-[var(--fs-2xs)] text-[var(--t3)]">
        Content otomatis yang digenerate system setiap hari. Client tinggal approve & publish.
      </p>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total', value: stats.total, variant: 'default' as const },
          { label: 'Siap Review', value: stats.generated, variant: 'warning' as const },
          { label: 'Approved', value: stats.approved, variant: 'violet' as const },
          { label: 'Published', value: stats.published, variant: 'success' as const },
          { label: 'Rejected', value: stats.rejected, variant: 'error' as const },
          { label: 'Expired', value: stats.expired, variant: 'default' as const },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r5)] p-4 text-center">
            <p className="text-[var(--fs-xl)] font-bold font-heading">{s.value}</p>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none"
        >
          <option value="all">Semua Status</option>
          <option value="generating">Generating</option>
          <option value="generated">Siap Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none"
        >
          <option value="all">Semua Brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <Table.Root>
        <Table.Header>
          <Table.Cell header>Brand</Table.Cell>
          <Table.Cell header>Topic</Table.Cell>
          <Table.Cell header>Set #</Table.Cell>
          <Table.Cell header>Platforms</Table.Cell>
          <Table.Cell header>Status</Table.Cell>
          <Table.Cell header>Dibuat</Table.Cell>
          <Table.Cell header>Aksi</Table.Cell>
        </Table.Header>
        <tbody>
          {contents.length === 0 ? (
            <Table.Empty message="Belum ada generated content." />
          ) : (
            contents.map((c) => (
              <>
                <Table.Row key={c.id}>
                  <Table.Cell><span className="font-medium">{c.brand_name}</span></Table.Cell>
                  <Table.Cell>
                    <span className="text-[var(--fs-3xs)]">{c.topic || '-'}</span>
                    {c.pillar && <Badge variant="info">{c.pillar}</Badge>}
                  </Table.Cell>
                  <Table.Cell>#{c.set_number}</Table.Cell>
                  <Table.Cell>
                    <span className="text-[var(--fs-3xs)] flex items-center gap-0.5 flex-wrap">
                      {PLATFORMS.map(p => {
                        const hasContent = (c as unknown as Record<string, unknown>)[p.key] !== null;
                        const connected = isPlatformConnected(c.brand_id, p.connectKey);
                        if (!hasContent) return null;
                        return (
                          <span
                            key={p.key}
                            title={connected ? `${p.label} — Connected` : `${p.label} — Not Connected`}
                            className={connected ? '' : 'opacity-30 line-through'}
                          >
                            {p.icon}
                          </span>
                        );
                      })}
                      <span className="ml-1 text-[var(--t3)]">({countPlatforms(c)}/{PLATFORMS.length})</span>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={STATUS_VARIANT[c.status] || 'default'}>{STATUS_LABEL[c.status] || c.status}</Badge>
                  </Table.Cell>
                  <Table.Cell>{formatDate(c.created_at)}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        className="p-1.5 rounded-[var(--r2)] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                        title="Detail"
                      >
                        {expandedId === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {c.status === 'generated' && (
                        <>
                          <button
                            onClick={() => updateStatus(c.id, 'approved')}
                            className="p-1.5 rounded-[var(--r2)] text-[var(--g4)] hover:bg-[rgba(74,222,128,.1)]"
                            title="Approve"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => updateStatus(c.id, 'rejected')}
                            className="p-1.5 rounded-[var(--r2)] text-[var(--red)] hover:bg-[rgba(248,113,113,.1)]"
                            title="Reject"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {c.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(c.id, 'published')}
                          className="p-1.5 rounded-[var(--r2)] text-[var(--di)] hover:bg-[rgba(96,165,250,.1)]"
                          title="Publish"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
                {expandedId === c.id && (
                  <tr key={`${c.id}-detail`}>
                    <td colSpan={7} className="px-4 py-4 bg-[var(--s1)] border-b border-[var(--b0)]">
                      <div className="grid grid-cols-3 gap-4">
                        {PLATFORMS.map((p) => {
                          const data = (c as unknown as Record<string, unknown>)[p.key] as Record<string, unknown> | null;
                          const connected = isPlatformConnected(c.brand_id, p.connectKey);
                          if (!data) return (
                            <div key={p.key} className="p-3 bg-[var(--s2)] rounded-[var(--r4)] opacity-40">
                              <p className="text-[var(--fs-3xs)] font-semibold text-[var(--t3)]">{p.icon} {p.label}</p>
                              <p className="text-[var(--fs-3xs)] text-[var(--t3)] italic mt-1">Tidak tersedia</p>
                            </div>
                          );
                          const text = (data.caption || data.script || data.text || data.title || '') as string;
                          const hashtags = (data.hashtags || '') as string;
                          return (
                            <div key={p.key} className={`p-3 rounded-[var(--r4)] ${connected ? 'bg-[var(--s0)] border border-[var(--b1)]' : 'bg-[var(--s0)] border border-dashed border-[var(--red)] opacity-60'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-[var(--fs-3xs)] font-semibold text-[var(--t1)]">{p.icon} {p.label}</p>
                                {!connected && p.connectKey && (
                                  <Badge variant="error">Disconnected</Badge>
                                )}
                                {connected && p.connectKey && (
                                  <Badge variant="success">Connected</Badge>
                                )}
                              </div>
                              {!connected && p.connectKey ? (
                                <p className="text-[var(--fs-3xs)] text-[var(--red)] italic">Platform belum terhubung — content tidak akan dipublish</p>
                              ) : (
                                <>
                                  <p className="text-[var(--fs-3xs)] text-[var(--t2)] line-clamp-4">{String(text).slice(0, 300)}</p>
                                  {hashtags && <p className="text-[10px] text-[var(--di)] mt-1">{String(hashtags).slice(0, 100)}</p>}
                                  {data.word_count ? <p className="text-[10px] text-[var(--t3)] mt-1">{String(data.word_count)} words</p> : null}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-[10px] text-[var(--t3)]">
                        {c.generation_model && <span>Model: {c.generation_model}</span>}
                        {c.generation_cost_usd > 0 && <span>Cost: ${c.generation_cost_usd.toFixed(4)}</span>}
                        {c.persona_id && <span>Persona: {c.persona_id}</span>}
                        {c.expires_at && <span>Expires: {formatDate(c.expires_at)}</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))
          )}
        </tbody>
      </Table.Root>
    </div>
  );
}
