import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Post tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(data);
}
