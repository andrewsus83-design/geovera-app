'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { autoSlug } from '@/lib/utils/slug';

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

export default function NewBlogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '', slug: '', excerpt: '', content: '', category: '', tags: '',
    cover_image: '', cover_color: '#090D12', author_name: 'GeoVera Team',
    featured: false, read_time: 3, brand_tags: [] as string[],
  });

  const update = (key: string, value: unknown) => {
    setForm((p) => {
      const next = { ...p, [key]: value };
      if (key === 'title') next.slug = autoSlug(value as string);
      if (key === 'content') next.read_time = Math.max(1, Math.ceil((value as string).split(/\s+/).length / 200));
      return next;
    });
  };

  const insertMarkdown = (prefix: string, suffix: string) => {
    const ta = document.getElementById('content-editor') as HTMLTextAreaElement;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = form.content;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    update('content', newText);
  };

  const handleSave = async (publish: boolean) => {
    if (!form.title) { toast('error', 'Judul wajib diisi'); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('blog_posts').insert({
        title: form.title,
        slug: form.slug || autoSlug(form.title),
        excerpt: form.excerpt || null,
        content: form.content || null,
        category: form.category || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        brand_tags: form.brand_tags,
        cover_image: form.cover_image || null,
        cover_color: form.cover_color || null,
        author_name: form.author_name,
        featured: form.featured,
        read_time: form.read_time,
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
      });
      if (error) throw error;
      toast('success', publish ? 'Post dipublikasikan' : 'Draft tersimpan');
      router.push('/blog');
    } catch {
      toast('error', 'Gagal menyimpan post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-[var(--fs-lg)] font-bold font-heading">Buat Post Baru</h1>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Left: Editor */}
        <div className="space-y-4">
          <input
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Judul artikel..."
            className="w-full bg-transparent text-[var(--fs-md)] font-bold text-[var(--t1)] placeholder:text-[var(--t3)] border-none outline-none"
          />
          <textarea
            value={form.excerpt}
            onChange={(e) => update('excerpt', e.target.value)}
            placeholder="Ringkasan singkat..."
            rows={2}
            className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-3 text-[var(--fs-2xs)] text-[var(--t1)] placeholder:text-[var(--t3)] resize-none"
          />

          {/* Toolbar */}
          <div className="flex gap-1 border-b border-[var(--b1)] pb-2">
            {TOOLBAR.map((t) => (
              <button
                key={t.label}
                onClick={() => insertMarkdown(t.prefix, t.suffix)}
                className="px-2 py-1 text-[var(--fs-3xs)] font-mono text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] rounded"
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            id="content-editor"
            value={form.content}
            onChange={(e) => update('content', e.target.value)}
            placeholder="Tulis konten dalam Markdown..."
            rows={20}
            className="w-full bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] p-4 text-[var(--fs-2xs)] text-[var(--t1)] placeholder:text-[var(--t3)] font-mono resize-y min-h-[400px]"
          />
        </div>

        {/* Right: Meta */}
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
            <Input label="Waktu Baca (menit)" type="number" value={String(form.read_time)} onChange={(e) => update('read_time', parseInt(e.target.value) || 1)} />
            <Input label="Tags (pisahkan koma)" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="seo, geo, ai" />
            <Input label="Cover Image URL" type="url" value={form.cover_image} onChange={(e) => update('cover_image', e.target.value)} />
            <Input label="Warna Cover" value={form.cover_color} onChange={(e) => update('cover_color', e.target.value)} />
            <Input label="Penulis" value={form.author_name} onChange={(e) => update('author_name', e.target.value)} />
            <Toggle checked={form.featured} onChange={(v) => update('featured', v)} label="Featured Post" />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => handleSave(false)} loading={saving} className="flex-1">
              Simpan Draft
            </Button>
            <Button onClick={() => handleSave(true)} loading={saving} className="flex-1">
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
