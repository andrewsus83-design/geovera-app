'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { File, Image, Video, FileText, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import FileDropzone from '@/components/ui/FileDropzone';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils/format';
import type { BrandAsset } from '@/lib/types/brand';

function getIcon(type: string) {
  if (type === 'image') return Image;
  if (type === 'video') return Video;
  if (type === 'article') return FileText;
  return File;
}

const typeVariant: Record<string, 'info' | 'violet' | 'warning' | 'success' | 'default'> = {
  image: 'info', video: 'violet', article: 'success', data: 'warning', other: 'default',
};

export default function AssetsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchAssets = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('brand_assets').select('*').eq('brand_id', id).order('uploaded_at', { ascending: false });
    setAssets((data as BrandAsset[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, [id]);

  const handleDelete = async (assetId: string) => {
    if (!confirm('Hapus file ini?')) return;
    const supabase = createClient();

    // Get the file URL to extract storage path before deleting the record
    const asset = assets.find(a => a.id === assetId);
    if (asset?.file_url) {
      const storagePath = asset.file_url.split('/brand-media/')[1];
      if (storagePath) {
        await supabase.storage.from('brand-media').remove([decodeURIComponent(storagePath)]);
      }
    }

    const { error } = await supabase.from('brand_assets').delete().eq('id', assetId);
    if (error) { toast('error', 'Gagal menghapus file'); return; }
    toast('success', 'File dihapus');
    fetchAssets();
  };

  const handleUpload = async (files: File[]) => {
    const supabase = createClient();
    for (const file of files) {
      const path = `${id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('brand-media').upload(path, file);
      if (error) { toast('error', `Gagal upload ${file.name}`); continue; }
      const { data: { publicUrl } } = supabase.storage.from('brand-media').getPublicUrl(path);
      await supabase.from('brand_assets').insert({
        brand_id: id,
        asset_type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'other',
        file_name: file.name,
        file_url: publicUrl,
        mime_type: file.type,
      });
    }
    toast('success', `${files.length} file berhasil diupload`);
    setShowUpload(false);
    fetchAssets();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--fs-lg)] font-bold font-heading">Assets</h1>
        <Button icon={Upload} onClick={() => setShowUpload(true)}>Upload File</Button>
      </div>

      {loading ? (
        <p className="text-[var(--t3)]">Memuat...</p>
      ) : assets.length === 0 ? (
        <div className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-12 text-center text-[var(--t3)]">
          Belum ada file. Klik &quot;Upload File&quot; untuk menambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {assets.map((a) => {
            const Icon = getIcon(a.asset_type);
            return (
              <div key={a.id} className="bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-5 h-5 text-[var(--t3)]" />
                  <Badge variant={typeVariant[a.asset_type] || 'default'} size="sm">{a.asset_type}</Badge>
                </div>
                <p className="text-[var(--fs-2xs)] text-[var(--t1)] truncate font-medium">{a.file_name}</p>
                <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-1">{formatDate(a.uploaded_at)}</p>
                <div className="flex gap-2 mt-3">
                  {a.file_url && (
                    <a href={a.file_url} target="_blank" className="text-[var(--fs-3xs)] text-[var(--di)] hover:underline">Lihat</a>
                  )}
                  <button onClick={() => handleDelete(a.id)} className="text-[var(--fs-3xs)] text-[var(--red)] hover:underline">Hapus</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload File Baru">
        <FileDropzone onFiles={handleUpload} />
      </Modal>
    </div>
  );
}
