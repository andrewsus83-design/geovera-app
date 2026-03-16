import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const { wa_number, otp_code } = await request.json();

    if (!wa_number || !otp_code) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // Check if latest unused token for this WA has exceeded max attempts
    const { data: latestToken } = await adminClient
      .from('admin_otp_tokens')
      .select('id, failed_attempts, otp_code, hashed_token, used, expires_at')
      .eq('wa_number', wa_number)
      .eq('used', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestToken) {
      return NextResponse.json({ error: 'Kode OTP sudah kadaluarsa. Minta kode baru.' }, { status: 401 });
    }

    if ((latestToken.failed_attempts || 0) >= MAX_ATTEMPTS) {
      await adminClient.from('admin_otp_tokens').update({ used: true }).eq('id', latestToken.id);
      return NextResponse.json({ error: 'Terlalu banyak percobaan salah. Minta kode baru.' }, { status: 429 });
    }

    // Check if the code matches
    if (latestToken.otp_code !== otp_code) {
      await adminClient
        .from('admin_otp_tokens')
        .update({ failed_attempts: (latestToken.failed_attempts || 0) + 1 })
        .eq('id', latestToken.id);

      // Update daily failed log so send-otp rate limiting works
      const today = new Date().toISOString().slice(0, 10);
      const { data: failLog } = await adminClient
        .from('admin_otp_failed_log')
        .select('attempts')
        .eq('wa_number', wa_number)
        .eq('attempt_date', today)
        .single();

      if (failLog) {
        await adminClient
          .from('admin_otp_failed_log')
          .update({ attempts: (failLog.attempts || 0) + 1, last_attempt_at: new Date().toISOString() })
          .eq('wa_number', wa_number)
          .eq('attempt_date', today);
      } else {
        await adminClient
          .from('admin_otp_failed_log')
          .insert({ wa_number, attempt_date: today, attempts: 1, last_attempt_at: new Date().toISOString() });
      }

      return NextResponse.json({ error: 'Kode OTP salah atau sudah kadaluarsa' }, { status: 401 });
    }

    // Code matches — mark as used
    await adminClient
      .from('admin_otp_tokens')
      .update({ used: true })
      .eq('id', latestToken.id);

    // Create Supabase session server-side using SSR client with cookie support
    let response = NextResponse.json({ success: true });

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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: latestToken.hashed_token,
      type: 'magiclink',
    });

    if (sessionError) {
      console.error('Session creation error:', sessionError.message);
      return NextResponse.json({ error: 'Gagal membuat sesi. Coba minta kode baru.' }, { status: 500 });
    }

    return response;
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
