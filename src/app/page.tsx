'use client';

// Halaman muka web (stcautotradepro.id) — HALAMAN UNDUH.
//
// Sejak v4, eksekusi trading berjalan dari perangkat pengguna sendiri dan
// menuntut koneksi realtime yang tidak diizinkan browser. Web karena itu tidak
// lagi menjadi tempat trading, melainkan pintu masuk: mengunduh aplikasi.
//
// Di dalam APK halaman ini tidak pernah tampil — pengguna aplikasi langsung
// diarahkan ke dashboard seperti sebelumnya.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const APK_URL  = 'https://stcautotrade.id/StcAutoTrade.apk';
const INFO_URL = 'https://stcautotrade.id';

const STEPS = [
  'Tekan tombol unduh di atas',
  'Buka file-nya, pilih Izinkan lalu Pasang',
  'Masuk pakai akun Stockity Anda',
  'Coba dulu di mode Demo — pakai uang mainan',
];

export default function RootPage() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'web' | 'app'>('checking');

  useEffect(() => {
    const isApp = (window as any).Capacitor?.isNativePlatform?.() === true;
    if (isApp) { setState('app'); router.replace('/dashboard'); return; }
    setState('web');
  }, [router]);

  if (state !== 'web') return null;

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>STC AutoTrade</h1>
        <p style={S.lead}>Robot trading Stockity. Hanya untuk HP Android.</p>

        <a href={APK_URL} style={S.cta} download>Unduh Aplikasi</a>

        {!isAndroid && (
          <p style={S.note}>Buka halaman ini di HP Android Anda untuk memasangnya.</p>
        )}

        <div style={S.steps}>
          <div style={S.stepsTitle}>Cara pasang</div>
          {STEPS.map((t, i) => (
            <div key={t} style={S.step}>
              <div style={S.stepNum}>{i + 1}</div>
              <div style={S.stepText}>{t}</div>
            </div>
          ))}
        </div>

        <div style={S.footer}>
          <a href={INFO_URL} style={S.link}>Tentang STC AutoTrade</a>
          <span style={S.dot}>·</span>
          <a href="mailto:supportstockity@gmail.com" style={S.link}>Butuh bantuan?</a>
        </div>

        <p style={S.risk}>
          Trading bisa untung, bisa juga rugi. Pakai uang yang Anda siap kehilangannya.
        </p>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', background: '#0B0C0E', color: '#E8EAED',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 20px', overflowY: 'auto',
  },
  wrap: { width: '100%', maxWidth: 420, textAlign: 'center' },
  h1: { fontSize: 30, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.02em' },
  lead: { fontSize: 16, lineHeight: 1.6, color: '#A1A8B3', margin: '0 0 30px' },
  cta: {
    display: 'block', textAlign: 'center', background: '#2DD4A7', color: '#08120F',
    fontSize: 17, fontWeight: 700, padding: '18px 24px', borderRadius: 14,
    textDecoration: 'none', boxShadow: '0 8px 24px -8px rgba(45,212,167,0.5)',
  },
  note: {
    fontSize: 13, lineHeight: 1.6, color: '#F0B849', marginTop: 14,
    background: 'rgba(240,184,73,0.09)', border: '1px solid rgba(240,184,73,0.22)',
    borderRadius: 12, padding: '12px 14px',
  },
  steps: { marginTop: 36, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' },
  stepsTitle: { fontSize: 13, fontWeight: 600, color: '#8C939E', marginBottom: 2 },
  step: { display: 'flex', gap: 12, alignItems: 'center' },
  stepText: { fontSize: 15, lineHeight: 1.5 },
  stepNum: {
    flexShrink: 0, width: 26, height: 26, borderRadius: 99, fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
  },
  footer: {
    marginTop: 36, display: 'flex', gap: 10, alignItems: 'center',
    justifyContent: 'center', fontSize: 14,
  },
  link: { color: '#2DD4A7', textDecoration: 'none' },
  dot: { color: '#4A505A' },
  risk: { marginTop: 16, fontSize: 12.5, lineHeight: 1.6, color: '#6B717B' },
};
