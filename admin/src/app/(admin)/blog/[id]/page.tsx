'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBlogPost } from '@/lib/hooks/useBlogPosts';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';

const CATEGORIES = ['AI & Technology', 'Digital Marketing', 'SEO', 'GEO & AI Search', 'Social Media', 'Business Strategy', 'Case Study', 'Tutorial', 'Industry News', 'Product Update'];

const TOOLBAR = [
  { label: 'B', prefix: '**', suffix: '**' },
  { label: 'I', prefix: '*', suffix: '*' },
  { label: 'H2', prefix: '## ', suffix: '' },
  { label: 'H3', prefix: '### ', suffix: '' },
  { label: 'List', prefix: '- ', suffix: '' },
  { label: 'Code', prefix: '```\n', suffix: '\n```' },
  { label: 'Link', prefix: '[', suffix: '](url)' },
];

export default function EditBlogPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: post, isLoading } = useBlogPost(id);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', slug: '', excerpt: '', content: '', category: '', tags: '',
    cover_image: '', cover_color: '', author_name: '', featured: false, read_time: 3,
    status: 'draft' as string,
  });

  useEffect(() => {
    if (post) {
      setForm({
        title: post.title || '', slug: post.slug || '', excerpt: post.excerpt || '',
        content: post.content || '', category: post.category || '',
        tags: post.tags?.join(', ') || '', cover_image: post.cover_image || '',
        cover_color: post.cover_color || '', author_name: post.author_name || '',
        featured: post.featured, read_time: post.read_time, status: post.status,
      });
    }
  }, [post]);

  const update = (key: string, value: unknown) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async (publish?: boolean) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const status = publish !== undefined ? (publish ? 'published' : 'draft') : form.status;
      await supabase.from('blog_posts').update({
        title: form.title, slug: form.slug, excerpt: form.excerpt || null,
        content: form.content || null, category: form.category || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        cover_image: form.cover_image || null, cover_color: form.cover_color || null,
        author_name: form.author_name, featured: form.featured, read_time: form.read_time,
        status,
        published_at: status === 'published' ? (post?.published_at || new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      toast('success', 'Post berhasil diperbarui');
    } catch {
      toast('error', 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Arsipkan post ini?')) return;
    const supabase = createClient();
    await supabase.from('blog_posts').update({ status: 'archived' }).eq('id', id);
    toast('success', 'Post diarsipkan');
    router.push('/blog');
  };

  if (isLoading) return <div className="p-8 text-[var(--t3)]">Memuat...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Edit Post</h1>
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <input type="text" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Judul artikel..." className="w-full bg-transparent text-[var(--fs-md)] font-bold text-[var(--t1)] placeholder:text-[var(--t3)] border-none outline-none" />
          <textarea value={form.excerpt} onChange={(e) => update('excerpt', e.target.value)} placeholder="Ringkasan..." rows={2} className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-3 text-[var(--fs-2xs)] text-[var(--t1)] resize-none" />
          <div className="flex gap-1 border-b border-[var(--b1)] pb-2">
            {TOOLBAR.map((t) => (
              <button key={t.label} className="px-2 py-1 text-[var(--fs-3xs)] font-mono text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] rounded">{t.label}</button>
            ))}
          </div>
          <textarea value={form.content} onChange={(e) => update('content', e.target.value)} rows={20} className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-4 text-[var(--fs-2xs)] text-[var(--t1)] font-mono resize-y min-h-[400px]" />
        </div>
        <div className="space-y-4 sticky top-[calc(var(--topbar-h)+24px)]">
          <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-4 space-y-4">
            <Input label="Slug" value={form.slug} onChange={(e) => update('slug', e.target.value)} />
            <div>
              <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">Kategori</label>
              <select value={form.category} onChange={(e) => update('category', e.target.value)} className="w-full h-9 px-3 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] text-[var(--fs-2xs)] text-[var(--t1)]">
                <option value="">Pilih...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input label="Waktu Baca" type="number" value={String(form.read_time)} onChange={(e) => update('read_time', parseInt(e.target.value) || 1)} />
            <Input label="Tags" value={form.tags} onChange={(e) => update('tags', e.target.value)} />
            <Input label="Cover Image URL" value={form.cover_image} onChange={(e) => update('cover_image', e.target.value)} />
            <Input label="Penulis" value={form.author_name} onChange={(e) => update('author_name', e.target.value)} />
            <Toggle checked={form.featured} onChange={(v) => update('featured', v)} label="Featured" />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => handleSave(false)} loading={saving} className="flex-1">Draft</Button>
            <Button onClick={() => handleSave(true)} loading={saving} className="flex-1">
              {form.status === 'published' ? 'Update' : 'Publish'}
            </Button>
          </div>
          <Button variant="danger" onClick={handleDelete} className="w-full" size="sm">Arsipkan Post</Button>
        </div>
      </div>
    </div>
  );
}
