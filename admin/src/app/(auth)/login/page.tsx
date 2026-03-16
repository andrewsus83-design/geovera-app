'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeWA, validateWA } from '@/lib/utils/wa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Step = 'wa' | 'otp';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'andrewsus83@gmail.com';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('wa');
  const [waNumber, setWaNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleWaSubmit = async () => {
    setError('');
    if (!validateWA(waNumber)) {
      setError('Format nomor WA tidak valid. Gunakan format 08xx atau 62xx.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_number: normalizeWA(waNumber) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim OTP');
        return;
      }
      setStep('otp');
      setCountdown(300);
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d) && newOtp.join('').length === 6) {
      verifyOtp(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const verifyRes = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_number: normalizeWA(waNumber), otp_code: code }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error || 'Kode OTP salah atau sudah kadaluarsa');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }
      // Session cookie set by server — redirect
      router.push('/dashboard');
    } catch {
      setError('Terjadi kesalahan verifikasi');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setCountdown(300);
    setOtp(['', '', '', '', '', '']);
    setError('');
    try {
      await fetch('/api/admin/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_number: normalizeWA(waNumber) }),
      });
    } catch {
      setError('Gagal mengirim ulang OTP');
    }
  };

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[var(--void)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="text-[var(--fs-md)] font-bold text-[var(--t1)]">Geo</span>
            <span className="text-[var(--fs-md)] font-bold text-[var(--g5)] italic">Vera</span>
          </div>
          <p className="text-[var(--fs-3xs)] text-[var(--t3)]">Admin Panel</p>
        </div>

        {step === 'wa' && (
          <>
            <h1 className="text-[var(--fs-xs)] font-semibold text-[var(--t1)] text-center mb-6">
              Masuk ke Admin Panel
            </h1>

            <div className="space-y-4">
              <div>
                <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)] mb-1.5 block">
                  Nomor WhatsApp
                </label>
                <div className="flex gap-2">
                  <span className="h-9 px-3 bg-[var(--s2)] border border-[var(--b1)] rounded-[var(--r4)] flex items-center text-[var(--fs-2xs)] text-[var(--t3)]">
                    +62
                  </span>
                  <input
                    type="tel"
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleWaSubmit()}
                    placeholder="8159944200"
                    className="flex-1 h-9 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)] px-3 text-[var(--fs-2xs)] text-[var(--t1)] placeholder:text-[var(--t3)] focus:border-[var(--g6)] focus:outline-none focus:ring-1 focus:ring-[var(--g6)]"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="text-[var(--fs-3xs)] text-[var(--red)] bg-[rgba(248,113,113,.1)] px-3 py-2 rounded-[var(--r4)]">
                  {error}
                </p>
              )}

              <Button onClick={handleWaSubmit} loading={loading} className="w-full" size="lg">
                Lanjutkan
              </Button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="text-[var(--fs-xs)] font-semibold text-[var(--t1)] text-center mb-2">
              Masukkan Kode OTP
            </h1>
            <p className="text-[var(--fs-3xs)] text-[var(--t3)] text-center mb-6">
              Kode dikirim ke {ADMIN_EMAIL}
            </p>

            <div className="flex justify-center gap-2 mb-4">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-12 h-14 bg-[var(--s1)] border border-[var(--b2)] rounded-[var(--r5)] text-center text-[var(--fs-md)] font-semibold text-[var(--t1)] focus:border-[var(--g6)] focus:outline-none focus:ring-1 focus:ring-[var(--g6)]"
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {error && (
              <p className="text-[var(--fs-3xs)] text-[var(--red)] bg-[rgba(248,113,113,.1)] px-3 py-2 rounded-[var(--r4)] mb-4 text-center">
                {error}
              </p>
            )}

            {countdown > 0 && (
              <p className="text-[var(--fs-3xs)] text-[var(--t3)] text-center mb-4">
                Kirim ulang dalam {formatCountdown()}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => { setStep('wa'); setError(''); setOtp(['', '', '', '', '', '']); }}
                className="flex-1"
              >
                Kembali
              </Button>
              <Button
                variant="secondary"
                onClick={handleResend}
                disabled={countdown > 0}
                className="flex-1"
              >
                Kirim Ulang
              </Button>
            </div>

            {loading && (
              <p className="text-[var(--fs-3xs)] text-[var(--g5)] text-center mt-4">
                Memverifikasi...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
