'use client';

import { useEffect, useState } from 'react';
import { Building2, CheckCircle, FileText, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Table from '@/components/ui/Table';
import { formatDate } from '@/lib/utils/format';
import type { Brand } from '@/lib/types/brand';

interface Stats {
  totalBrands: number;
  activeBrands: number;
  blogPosts: number;
  authUsers: number;
}

interface TierCount {
  tier: string;
  count: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ totalBrands: 0, activeBrands: 0, blogPosts: 0, authUsers: 0 });
  const [tiers, setTiers] = useState<TierCount[]>([]);
  const [recentBrands, setRecentBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [brandsRes, activeRes, blogRes, recentRes] = await Promise.allSettled([
        supabase.from('brands').select('id', { count: 'exact', head: true }),
        supabase.from('brands').select('id', { count: 'exact', head: true }).eq('onboarding_done', true),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
        supabase.from('brands').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      const totalBrands = brandsRes.status === 'fulfilled' ? (brandsRes.value.count || 0) : 0;
      const activeBrands = activeRes.status === 'fulfilled' ? (activeRes.value.count || 0) : 0;
      const blogPosts = blogRes.status === 'fulfilled' ? (blogRes.value.count || 0) : 0;
      const recent = recentRes.status === 'fulfilled' ? (recentRes.value.data as Brand[] || []) : [];

      setStats({ totalBrands, activeBrands, blogPosts, authUsers: 0 });
      setRecentBrands(recent);

      // Compute tier distribution
      const tierMap: Record<string, number> = {};
      if (recentRes.status === 'fulfilled') {
        const { data: allBrands } = await supabase.from('brands').select('tier');
        (allBrands || []).forEach((b: { tier: string }) => {
          tierMap[b.tier] = (tierMap[b.tier] || 0) + 1;
        });
      }
      setTiers(Object.entries(tierMap).map(([tier, count]) => ({ tier, count })));
      setLoading(false);
    };

    fetchData();
  }, []);

  const statCards = [
    { label: 'Total Brand', value: stats.totalBrands, icon: Building2, color: 'text-[var(--di)]' },
    { label: 'Brand Aktif', value: stats.activeBrands, icon: CheckCircle, color: 'text-[var(--g4)]' },
    { label: 'Blog Posts', value: stats.blogPosts, icon: FileText, color: 'text-[var(--vi)]' },
    { label: 'Pengguna Auth', value: stats.authUsers, icon: Users, color: 'text-[var(--au)]' },
  ];

  const tierColors: Record<string, string> = { go: 'info', pro: 'violet', enterprise: 'warning' };
  const tierLabels: Record<string, string> = { go: 'Go', pro: 'Pro', enterprise: 'Enterprise' };

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Dashboard</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[var(--r5)] bg-[var(--b0)] flex items-center justify-center">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <p className="text-[var(--fs-2xl)] font-bold font-heading">{loading ? '—' : s.value}</p>
            <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Tier Distribution */}
        <Card title="Distribusi Tier">
          <div className="space-y-3">
            {['go', 'pro', 'enterprise'].map((t) => {
              const count = tiers.find((x) => x.tier === t)?.count || 0;
              return (
                <div key={t} className="flex items-center justify-between">
                  <Badge variant={(tierColors[t] || 'default') as 'info' | 'violet' | 'warning'}>{tierLabels[t] || t}</Badge>
                  <span className="text-[var(--fs-xs)] font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Brands */}
        <div className="col-span-2">
          <Card title="Brand Terbaru">
            <Table.Root>
              <Table.Header>
                <Table.Cell header>Nama</Table.Cell>
                <Table.Cell header>Tier</Table.Cell>
                <Table.Cell header>WA</Table.Cell>
                <Table.Cell header>Dibuat</Table.Cell>
              </Table.Header>
              <tbody>
                {recentBrands.length === 0 ? (
                  <Table.Empty message="Belum ada brand." />
                ) : (
                  recentBrands.map((b) => (
                    <Table.Row key={b.id}>
                      <Table.Cell>{b.name}</Table.Cell>
                      <Table.Cell>
                        <Badge variant={(tierColors[b.tier] || 'default') as 'info' | 'violet' | 'warning'}>
                          {tierLabels[b.tier] || b.tier}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>{b.wa_number || '-'}</Table.Cell>
                      <Table.Cell>{formatDate(b.created_at)}</Table.Cell>
                    </Table.Row>
                  ))
                )}
              </tbody>
            </Table.Root>
          </Card>
        </div>
      </div>
    </div>
  );
}
