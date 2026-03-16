import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { wa_number } = await request.json();

    if (!wa_number) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: admin } = await supabase
      .from('master_admins')
      .select('name')
      .eq('wa_number', wa_number)
      .eq('is_active', true)
      .single();

    return NextResponse.json({
      valid: !!admin,
      name: admin?.name || null,
    });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
