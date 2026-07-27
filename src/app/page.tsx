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
  { n: 1, t: 'Unduh berkas aplikasi', d: 'Tekan tombol di atas, lalu tunggu unduhan selesai.' },
  { n: 2, t: 'Izinkan pemasangan', d: 'Android akan meminta izin memasang dari sumber ini. Pilih Izinkan, lalu Pasang.' },
  { n: 3, t: 'Masuk dengan akun Stockity', d: 'Gunakan email dan kata sandi akun Stockity Anda. Belum punya akun? Daftar langsung dari aplikasi.' },
  { n: 4, t: 'Mulai dari mode Demo', d: 'Uji strategi tanpa risiko lebih dulu, sebelum menjalankannya dengan dana nyata.' },
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
        <div style={S.badge}>Versi 4</div>

        <h1 style={S.h1}>STC AutoTrade</h1>
        <p style={S.lead}>
          Mulai versi 4, seluruh eksekusi trading berjalan langsung dari perangkat Anda —
          bukan dari server kami. Karena itu aplikasi hanya tersedia untuk Android.
        </p>

        <a href={APK_URL} style={S.cta} download>Unduh Aplikasi Android</a>

        {!isAndroid && (
          <p style={S.note}>
            Halaman ini sedang dibuka dari perangkat non-Android. Buka tautan yang sama di
            ponsel Android Anda untuk memasang aplikasinya.
          </p>
        )}

        <div style={S.steps}>
          {STEPS.map(s => (
            <div key={s.n} style={S.step}>
              <div style={S.stepNum}>{s.n}</div>
              <div>
                <div style={S.stepTitle}>{s.t}</div>
                <div style={S.stepDesc}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={S.why}>
          <div style={S.whyTitle}>Mengapa hanya di aplikasi?</div>
          <p style={S.whyText}>
            Trading dijalankan dari koneksi internet Anda sendiri, sehingga aktivitas akun
            tidak berbagi jaringan dengan pengguna lain. Browser tidak mengizinkan jenis
            koneksi yang dibutuhkan untuk itu — hanya aplikasi yang bisa.
          </p>
        </div>

        <div style={S.footer}>
          <a href={INFO_URL} style={S.link}>Pelajari selengkapnya</a>
          <span style={S.dot}>·</span>
          <a href="mailto:supportstockity@gmail.com" style={S.link}>supportstockity@gmail.com</a>
        </div>

        <p style={S.risk}>
          Trading mengandung risiko kehilangan modal. Gunakan mode Demo untuk menguji
          strategi, dan hanya gunakan dana yang Anda siap kehilangannya.
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
  wrap: { width: '100%', maxWidth: 520 },
  badge: {
    display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    color: '#2DD4A7', background: 'rgba(45,212,167,0.12)',
    border: '1px solid rgba(45,212,167,0.3)', borderRadius: 99, padding: '4px 12px',
  },
  h1: { fontSize: 32, fontWeight: 700, margin: '16px 0 10px', letterSpacing: '-0.02em' },
  lead: { fontSize: 15, lineHeight: 1.65, color: '#A1A8B3', margin: '0 0 28px' },
  cta: {
    display: 'block', textAlign: 'center', background: '#2DD4A7', color: '#08120F',
    fontSize: 16, fontWeight: 700, padding: '16px 24px', borderRadius: 14,
    textDecoration: 'none', boxShadow: '0 8px 24px -8px rgba(45,212,167,0.5)',
  },
  note: {
    fontSize: 13, lineHeight: 1.6, color: '#F0B849', marginTop: 14,
    background: 'rgba(240,184,73,0.09)', border: '1px solid rgba(240,184,73,0.22)',
    borderRadius: 12, padding: '12px 14px',
  },
  steps: { marginTop: 32, display: 'flex', flexDirection: 'column', gap: 18 },
  step: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    flexShrink: 0, width: 26, height: 26, borderRadius: 99, fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
  },
  stepTitle: { fontSize: 14, fontWeight: 600, marginBottom: 3 },
  stepDesc: { fontSize: 13, lineHeight: 1.6, color: '#8C939E' },
  why: {
    marginTop: 32, padding: 18, borderRadius: 14,
    background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)',
  },
  whyTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  whyText: { fontSize: 13, lineHeight: 1.65, color: '#8C939E', margin: 0 },
  footer: { marginTop: 26, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 },
  link: { color: '#2DD4A7', textDecoration: 'none' },
  dot: { color: '#4A505A' },
  risk: { marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: '#6B717B' },
};
