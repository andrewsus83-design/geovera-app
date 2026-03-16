'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PlusCircle, Eye, Pencil, Search } from 'lucide-react';
import { useBrands } from '@/lib/hooks/useBrands';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Table from '@/components/ui/Table';
import { formatDate } from '@/lib/utils/format';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

const TIERS = [
  { value: 'all', label: 'Semua Tier' },
  { value: 'go', label: 'Go' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const STATUSES = [
  { value: 'all', label: 'Semua Status' },
  { value: 'active', label: 'Aktif' },
  { value: 'pending', label: 'Pending' },
];

const PER_PAGE = 20;

export default function BrandsPage() {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: brands = [], isLoading, refetch } = useBrands({
    tier: tierFilter,
    status: statusFilter,
    search: search || undefined,
  });

  const totalPages = Math.ceil(brands.length / PER_PAGE);
  const paginated = brands.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const tierColors: Record<string, 'info' | 'violet' | 'warning'> = {
    go: 'info', pro: 'violet', enterprise: 'warning',
  };
  const tierLabels: Record<string, string> = { go: 'Go', pro: 'Pro', enterprise: 'Enterprise' };

  const handleToggle = async (id: string, currentPaused: boolean) => {
    const supabase = createClient();
    await supabase.from('brands').update({ god_mode_paused: !currentPaused }).eq('id', id);
    toast('success', `Brand ${currentPaused ? 'diaktifkan' : 'dinonaktifkan'}`);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--fs-lg)] font-bold font-heading">Daftar Brand</h1>
        <Link href="/brands/new">
          <Button icon={PlusCircle}>Tambah Brand Baru</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t3)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari nama, WA, atau slug..."
            className="w-full h-9 pl-10 pr-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] placeholder:text-[var(--t3)] focus:border-[var(--g6)] focus:outline-none"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none"
        >
          {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)] focus:outline-none"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <Table.Root>
        <Table.Header>
          <Table.Cell header>Nama Brand</Table.Cell>
          <Table.Cell header>Kategori</Table.Cell>
          <Table.Cell header>Tier</Table.Cell>
          <Table.Cell header>No. WA</Table.Cell>
          <Table.Cell header>Status</Table.Cell>
          <Table.Cell header>Slug</Table.Cell>
          <Table.Cell header>Dibuat</Table.Cell>
          <Table.Cell header>Aksi</Table.Cell>
        </Table.Header>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--t3)]">Memuat...</td></tr>
          ) : paginated.length === 0 ? (
            <Table.Empty message="Belum ada brand. Tambah brand pertama Anda." />
          ) : (
            paginated.map((b) => (
              <Table.Row key={b.id}>
                <Table.Cell><span className="font-medium">{b.name}</span></Table.Cell>
                <Table.Cell>{b.category || '-'}</Table.Cell>
                <Table.Cell><Badge variant={tierColors[b.tier] || 'default'}>{tierLabels[b.tier] || b.tier}</Badge></Table.Cell>
                <Table.Cell>{b.wa_number || '-'}</Table.Cell>
                <Table.Cell>
                  <Badge variant={b.onboarding_done ? 'success' : 'warning'}>
                    {b.onboarding_done ? 'Aktif' : 'Pending'}
                  </Badge>
                </Table.Cell>
                <Table.Cell><code className="text-[var(--fs-3xs)] text-[var(--t3)]">{b.slug}</code></Table.Cell>
                <Table.Cell>{formatDate(b.created_at)}</Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    <Link href={`/brands/${b.id}`}>
                      <button className="p-1.5 rounded-[var(--r2)] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                    <Link href={`/brands/${b.id}`}>
                      <button className="p-1.5 rounded-[var(--r2)] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </tbody>
      </Table.Root>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[var(--fs-3xs)] text-[var(--t3)]">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Selanjutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
