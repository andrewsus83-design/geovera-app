import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'andrewsus83@gmail.com').trim();
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export async function POST(request: Request) {
  try {
    const { wa_number } = await request.json();

    if (!wa_number || typeof wa_number !== 'string') {
      return NextResponse.json({ error: 'Nomor WA diperlukan' }, { status: 400 });
    }

    if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
      console.error('Missing env vars: SERVICE_ROLE_KEY or SUPABASE_URL');
      return NextResponse.json({ error: 'Server belum dikonfigurasi' }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Validate against master_admins
    const { data: admin, error: adminError } = await supabase
      .from('master_admins')
      .select('*')
      .eq('wa_number', wa_number)
      .eq('is_active', true)
      .single();

    if (adminError || !admin) {
      return NextResponse.json(
        { error: 'Nomor WA tidak terdaftar sebagai admin' },
        { status: 403 }
      );
    }

    // Check brute force protection
    const today = new Date().toISOString().slice(0, 10);
    const { data: failLog } = await supabase
      .from('admin_otp_failed_log')
      .select('attempts')
      .eq('wa_number', wa_number)
      .eq('attempt_date', today)
      .single();

    if (failLog && failLog.attempts >= 3) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan hari ini. Coba lagi besok.' },
        { status: 429 }
      );
    }

    // Generate Supabase magic link to get hashed_token for session creation
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: ADMIN_EMAIL,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Generate link error:', linkError, 'linkData:', JSON.stringify(linkData?.properties));
      return NextResponse.json({ error: 'Gagal membuat sesi OTP' }, { status: 500 });
    }

    // Generate our own 6-digit display code
    const otpCode = generateCode();
    const hashedToken = linkData.properties.hashed_token;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Invalidate any previous unused tokens for this WA
    await supabase
      .from('admin_otp_tokens')
      .update({ used: true })
      .eq('wa_number', wa_number)
      .eq('used', false);

    // Store our code + hashed_token
    const { error: insertError } = await supabase.from('admin_otp_tokens').insert({
      wa_number,
      otp_code: otpCode,
      hashed_token: hashedToken,
      expires_at: expiresAt,
      resend_after: new Date(Date.now() + 60 * 1000).toISOString(),
    });

    if (insertError) {
      console.error('Insert OTP token error:', insertError);
      return NextResponse.json({ error: 'Gagal menyimpan kode OTP' }, { status: 500 });
    }

    // Send 6-digit code via admin-mailer edge function
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-mailer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: ADMIN_EMAIL,
        subject: `[${otpCode}] Kode OTP GeoVera Admin`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d1117;color:#e6edf3;border-radius:12px"><div style="margin-bottom:24px"><span style="font-weight:700;font-size:18px;color:#e6edf3">Geo</span><span style="font-weight:700;font-size:18px;color:#3fb950;font-style:italic">Vera</span> <span style="font-size:11px;color:#7d8590;margin-left:8px;background:#21262d;padding:2px 6px;border-radius:4px">ADMIN</span></div><h2 style="margin:0 0 8px;font-size:16px;color:#e6edf3">Kode OTP Admin Panel</h2><p style="color:#7d8590;font-size:13px;margin:0 0 24px">Masukkan kode berikut untuk masuk:</p><div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px"><span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#3fb950;font-family:monospace">${otpCode}</span></div><p style="color:#7d8590;font-size:12px;margin:0">Berlaku <strong style="color:#e6edf3">5 menit</strong>. Jangan bagikan kepada siapapun.</p></div>`,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('admin-mailer error:', emailRes.status, err);
      return NextResponse.json({ error: 'Gagal mengirim email OTP' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OTP send error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
