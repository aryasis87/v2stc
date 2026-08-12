'use client';
// ═══════════════════════════════════════════
// /webview — membuka platform Stockity.
//
// Rute ini DULU berisi halaman panduan; panduan kini pindah ke /panduan,
// menyamakan susunannya dengan koala. Nama yang sama untuk dua hal berbeda
// di dua produk adalah sumber salah baca, jadi diseragamkan.
//
// Di APK: dibuka lewat Capacitor Browser (fullscreen) sehingga pengguna tetap
// berada di dalam aplikasi, dan kembali sendiri saat ditutup. Di web biasa
// Capacitor tidak ada, jadi jatuh ke window.open tab baru.
// ═══════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const TRADE_URL = 'https://stockity1.id';

function isNative(): boolean {
  return typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

export default function WebViewPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'opening' | 'active' | 'error'>('opening');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isNative()) {
        window.open(TRADE_URL, '_blank', 'noopener,noreferrer');
        router.back();
        return;
      }

      try {
        const { Browser } = await import('@capacitor/browser');

        const handle = await Browser.addListener('browserFinished', () => {
          if (!cancelled) router.back();
        });

        setStatus('active');
        await Browser.open({ url: TRADE_URL, presentationStyle: 'fullscreen' });
        handle.remove();
        if (!cancelled) router.back();
      } catch (e) {
        console.error('[WebView] error:', e);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
    }}>
      {status === 'error' ? (
        <>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            Gagal membuka Stockity
          </span>
          <button
            onClick={() => router.back()}
            style={{
              padding: '9px 22px', borderRadius: 99,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Kembali
          </button>
        </>
      ) : (
        <>
          {/* Emerald STC (#2DD4A7) — latar halaman ini selalu gelap, jadi
              memakai nilai tema gelap, bukan token yang ikut tema. */}
          <div style={{
            width: 32, height: 32,
            border: '3px solid rgba(255,255,255,0.08)',
            borderTopColor: '#2DD4A7',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}/>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            Membuka Stockity…
          </span>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
