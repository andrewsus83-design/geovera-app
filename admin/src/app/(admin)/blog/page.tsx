'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { useBlogPosts } from '@/lib/hooks/useBlogPosts';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Table from '@/components/ui/Table';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils/format';

const statusVariant: Record<string, 'default' | 'success' | 'warning'> = {
  draft: 'default', published: 'success', archived: 'warning',
};

export default function BlogPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: posts = [], isLoading, refetch } = useBlogPosts({ status: statusFilter });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toggleFeatured = async (id: string, current: boolean) => {
    const supabase = createClient();
    await supabase.from('blog_posts').update({ featured: !current }).eq('id', id);
    refetch();
  };

  const togglePublish = async (id: string, currentStatus: string) => {
    const supabase = createClient();
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    await supabase.from('blog_posts').update({
      status: newStatus,
      published_at: newStatus === 'published' ? new Date().toISOString() : null,
    }).eq('id', id);
    toast('success', newStatus === 'published' ? 'Post dipublikasikan' : 'Post dikembalikan ke draft');
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const supabase = createClient();
    await supabase.from('blog_posts').update({ status: 'archived' }).eq('id', deleteId);
    toast('success', 'Post diarsipkan');
    setDeleteId(null);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--fs-lg)] font-bold font-heading">Blog Posts</h1>
        <Link href="/blog/new"><Button icon={PlusCircle}>Buat Post Baru</Button></Link>
      </div>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)]">
        <option value="all">Semua Status</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>

      <Table.Root>
        <Table.Header>
          <Table.Cell header>Judul</Table.Cell>
          <Table.Cell header>Slug</Table.Cell>
          <Table.Cell header>Status</Table.Cell>
          <Table.Cell header>Featured</Table.Cell>
          <Table.Cell header>Penulis</Table.Cell>
          <Table.Cell header>Tanggal</Table.Cell>
          <Table.Cell header>Aksi</Table.Cell>
        </Table.Header>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--t3)]">Memuat...</td></tr>
          ) : posts.length === 0 ? (
            <Table.Empty message="Belum ada blog post." />
          ) : (
            posts.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell><span className="font-medium">{p.title}</span></Table.Cell>
                <Table.Cell><code className="text-[var(--fs-3xs)] text-[var(--t3)]">{p.slug}</code></Table.Cell>
                <Table.Cell><Badge variant={statusVariant[p.status] || 'default'}>{p.status}</Badge></Table.Cell>
                <Table.Cell><Toggle checked={p.featured} onChange={() => toggleFeatured(p.id, p.featured)} /></Table.Cell>
                <Table.Cell>{p.author_name || '-'}</Table.Cell>
                <Table.Cell>{formatDate(p.published_at || p.created_at)}</Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    <Link href={`/blog/${p.id}`}>
                      <button className="p-1.5 rounded text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"><Pencil className="w-3.5 h-3.5" /></button>
                    </Link>
                    <button onClick={() => togglePublish(p.id, p.status)} className="px-2 py-1 rounded text-[var(--fs-3xs)] text-[var(--t2)] hover:bg-[var(--s2)]">
                      {p.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded text-[var(--t3)] hover:text-[var(--red)] hover:bg-[rgba(248,113,113,.1)]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </tbody>
      </Table.Root>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Arsipkan Post?" footer={
        <><Button variant="ghost" onClick={() => setDeleteId(null)}>Batal</Button><Button variant="danger" onClick={handleDelete}>Arsipkan</Button></>
      }>
        <p className="text-[var(--t2)]">Post akan diarsipkan dan tidak ditampilkan di website.</p>
      </Modal>
    </div>
  );
}
