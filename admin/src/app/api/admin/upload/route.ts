import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'application/pdf',
];

export async function POST(request: Request) {
  try {
    // Auth check — verify session from cookies
    const supabase = createServerClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
      {
        cookies: {
          getAll() {
            return request.headers.get('cookie')
              ? request.headers.get('cookie')!.split(';').map(c => {
                  const [name, ...rest] = c.trim().split('=');
                  return { name, value: rest.join('=') };
                })
              : [];
          },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const brandId = formData.get('brand_id') as string;
    const assetType = (formData.get('asset_type') as string) || 'other';

    if (!file || !brandId) {
      return NextResponse.json({ error: 'File dan brand_id diperlukan' }, { status: 400 });
    }

    // File size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    // MIME type check
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Tipe file tidak diizinkan' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${brandId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from('brand-media')
      .upload(path, buffer, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = adminClient.storage.from('brand-media').getPublicUrl(path);

    const { data: asset, error: insertError } = await adminClient
      .from('brand_assets')
      .insert({
        brand_id: brandId,
        asset_type: assetType,
        file_name: safeName,
        file_url: publicUrl,
        mime_type: file.type,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl, asset_id: asset.id });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload gagal' }, { status: 500 });
  }
}
