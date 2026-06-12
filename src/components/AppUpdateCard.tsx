'use client';

// components/AppUpdateCard.tsx
// ✅ Hardcoded DARK GREEN theme — sinkron dengan halaman profile & login
// Tidak menggunakan useDarkMode, semua warna fixed ke dark-green palette.

import React, { useEffect, useRef, useState } from 'react';
import { checkForUpdate, type UpdateCheckResult } from '@/lib/appUpdateApi';
import { APP_VERSION_NAME } from '@/lib/appVersion';

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'error';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PLAY STORE BUILD — downloadAndInstall DINONAKTIFKAN                   ║
// ║  ApkInstallerPlugin membutuhkan REQUEST_INSTALL_PACKAGES yang tidak    ║
// ║  diizinkan Google Play Store. Aktifkan kembali untuk distribusi        ║
// ║  luar Play Store (sideload / direct APK).                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// async function downloadAndInstall(
//   url: string,
//   onProgress: (p: number) => void,
// ): Promise<void> {
//   const { registerPlugin } = await import('@capacitor/core');
//   const ApkInstaller = registerPlugin<{
//     downloadAndInstall(opts: { url: string }): Promise<{ success: boolean }>;
//     cancelDownload(): Promise<void>;
//     addListener(event: string, cb: (data: { progress: number }) => void): Promise<{ remove(): void }>;
//   }>('ApkInstaller');
//
//   const handle = await ApkInstaller.addListener('downloadProgress', ({ progress }) => {
//     onProgress(progress);
//   });
//
//   try {
//     await ApkInstaller.downloadAndInstall({ url });
//   } finally {
//     handle.remove();
//   }
// }

// ── Palette (hardcode dark green — sinkron dengan login & profile) ────────────
const C = {
  bg:          'rgba(6, 30, 15, 0.88)',
  border:      'rgba(76, 175, 80, 0.20)',
  text:        '#ffffff',
  textSec:     'rgba(255,255,255,0.55)',
  textTert:    'rgba(255,255,255,0.30)',
  accent:      '#4caf50',
  accentLight: '#66bb6a',
  blue:        '#0A84FF',
  green:       '#30d158',
  orange:      '#ff9f0a',
  red:         '#ff453a',
  greenBg:     'rgba(48,209,88,0.12)',
  blueBg:      'rgba(10,132,255,0.14)',
  orangeBg:    'rgba(255,159,10,0.12)',
  redBg:       'rgba(255,69,58,0.12)',
  shadow:      '0 8px 32px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(76,175,80,0.10)',
} as const;

// ── Progress Bar ──────────────────────────────────────────────────────────────
const ProgressBar = ({ value }: { value: number }) => (
  <div style={{ height: 4, borderRadius: 99, background: 'rgba(10,132,255,0.18)', overflow: 'hidden', marginTop: 10 }}>
    <div
      style={{
        height: '100%',
        borderRadius: 99,
        background: C.blue,
        width: value < 0 ? '100%' : `${value}%`,
        transition: 'width 0.3s ease',
        ...(value < 0 ? { animation: 'auc-indeterminate 1.4s ease-in-out infinite' } : {}),
      }}
    />
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export function AppUpdateCard() {
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [result,   setResult]   = useState<UpdateCheckResult | null>(null);
  // ── PLAY STORE BUILD: progress & dlError tidak dipakai (download dinonaktifkan) ──
  // const [progress, setProgress] = useState<number>(-1);
  // const [dlError,  setDlError]  = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setPhase('checking');
      try {
        const res = await checkForUpdate();
        if (!mounted) return;
        setResult(res);
        if (res.error && !res.hasUpdate) setPhase('error');
        else setPhase(res.hasUpdate ? 'available' : 'up-to-date');
      } catch {
        if (mounted) setPhase('error');
      }
    };
    run();
    return () => { mounted = false; };
  }, []);

  const handleRetry = async () => {
    setPhase('checking');
    try {
      const res = await checkForUpdate();
      setResult(res);
      setPhase(res.hasUpdate ? 'available' : 'up-to-date');
    } catch {
      setPhase('error');
    }
  };

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  PLAY STORE BUILD — handleDownload DINONAKTIFKAN                       ║
  // ║  Aktifkan kembali untuk distribusi luar Play Store.                    ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  // const handleDownload = async () => {
  //   if (!result?.resolvedDownloadUrl) return;
  //   cancelRef.current = false;
  //   setDlError(null);
  //   setPhase('downloading');
  //   setProgress(-1);
  //   try {
  //     await downloadAndInstall(result.resolvedDownloadUrl, (p) => {
  //       if (!cancelRef.current) setProgress(p);
  //     });
  //   } catch (e: unknown) {
  //     if (!cancelRef.current) {
  //       setDlError(e instanceof Error ? e.message : 'Download gagal');
  //       setPhase('available');
  //     }
  //   }
  // };

  // ── Icon wrapper helper ───────────────────────────────────────────────────
  const IconBox = ({ bg, children }: { bg: string; children: React.ReactNode }) => (
    <div style={{
      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
      background: bg,
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </div>
  );

  // ── Shared card wrapper ───────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    backdropFilter: 'saturate(110%) blur(24px)',
    WebkitBackdropFilter: 'saturate(110%) blur(24px)',
    boxShadow: C.shadow,
    overflow: 'hidden',
    marginBottom: 12,
    animation: 'auc-pop 0.3s cubic-bezier(0.22,1,0.36,1) both',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes auc-indeterminate {
          0%   { transform: translateX(-100%) scaleX(0.5); }
          50%  { transform: translateX(0%)    scaleX(0.6); }
          100% { transform: translateX(200%)  scaleX(0.5); }
        }
        @keyframes auc-spin { to { transform: rotate(360deg); } }
        @keyframes auc-pop  {
          from { opacity:0; transform:scale(0.95) translateY(4px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        .auc-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer;
          font-size: 14px; font-weight: 600; font-family: inherit;
          transition: opacity 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        .auc-btn:active  { opacity: 0.75; transform: scale(0.97); }
        .auc-btn:disabled{ opacity: 0.40; cursor: not-allowed; transform: none; }

        .auc-icon-btn {
          background: transparent; border: none; cursor: pointer; padding: 6px;
          color: rgba(255,255,255,0.30);
          -webkit-tap-highlight-color: transparent;
          transition: color 0.15s;
          border-radius: 6px;
        }
        .auc-icon-btn:hover  { color: rgba(255,255,255,0.55); }
        .auc-icon-btn:active { opacity: 0.6; }
      ` }} />

      <div style={cardStyle}>

        {/* ── CHECKING ── */}
        {phase === 'checking' && (
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconBox bg={C.blueBg}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round"
                style={{ animation: 'auc-spin 0.9s linear infinite' }}>
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </IconBox>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>Memeriksa pembaruan…</p>
              <p style={{ fontSize: 12, color: C.textTert }}>Versi saat ini: {APP_VERSION_NAME}</p>
            </div>
          </div>
        )}

        {/* ── UP TO DATE ── */}
        {phase === 'up-to-date' && (
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconBox bg={C.greenBg}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </IconBox>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>Aplikasi sudah terbaru</p>
              <p style={{ fontSize: 12, color: C.textTert }}>Versi {APP_VERSION_NAME}</p>
            </div>
            <button onClick={handleRetry} className="auc-icon-btn" title="Cek ulang">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── UPDATE AVAILABLE ── */}
        {phase === 'available' && result?.latest && (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <IconBox bg={C.orangeBg}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 2v10m0 0l-3-3m3 3l3-3"/><path d="M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>
                </svg>
              </IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Pembaruan tersedia</p>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: C.orange,
                    background: C.orangeBg,
                    border: '1px solid rgba(255,159,10,0.22)',
                    padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                  }}>
                    v{result.latest.versionName}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: C.textTert }}>
                  Saat ini: v{APP_VERSION_NAME} → Terbaru: v{result.latest.versionName}
                </p>
                {/* ── PLAY STORE BUILD: pesan update via store, tombol download dinonaktifkan ── */}
                <p style={{ fontSize: 12, color: C.orange, marginTop: 6 }}>
                  Perbarui aplikasi melalui Google Play Store.
                </p>
              </div>
            </div>

            {/* ╔══════════════════════════════════════════════════════════════╗
                ║  PLAY STORE BUILD — tombol "Unduh & Pasang" DINONAKTIFKAN   ║
                ║  REQUEST_INSTALL_PACKAGES tidak diizinkan di Play Store.    ║
                ║  Aktifkan kembali untuk distribusi luar Play Store.         ║
                ╚══════════════════════════════════════════════════════════════╝
            {dlError && (
              <p style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{dlError}</p>
            )}
            <button
              className="auc-btn"
              onClick={handleDownload}
              style={{ marginTop: 12, background: 'linear-gradient(180deg,#55c75a 0%,#3ea844 100%)', color: '#fff', width: '100%', boxShadow: '0 4px 16px rgba(76,175,80,0.35)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2v10m0 0l-3-3m3 3l3-3"/><path d="M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>
              </svg>
              Unduh &amp; Pasang
            </button>
            */}
          </div>
        )}

        {/* ╔══════════════════════════════════════════════════════════════════╗
            ║  PLAY STORE BUILD — phase "downloading" DINONAKTIFKAN          ║
            ║  Aktifkan kembali untuk distribusi luar Play Store.            ║
            ╚══════════════════════════════════════════════════════════════════╝
        {phase === 'downloading' && (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconBox bg={C.blueBg}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round"
                  style={{ animation: 'auc-spin 0.9s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke={C.blue} strokeOpacity="0.22"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke={C.blue}/>
                </svg>
              </IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                  {progress < 0 ? 'Mengunduh…' : `Mengunduh… ${progress}%`}
                </p>
                <p style={{ fontSize: 12, color: C.textTert }}>
                  {result?.latest ? `v${result.latest.versionName}` : 'Pembaruan'}
                </p>
              </div>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}
        */}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconBox bg={C.redBg}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
            </IconBox>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>Gagal memeriksa pembaruan</p>
              <p style={{ fontSize: 12, color: C.textTert }}>Versi {APP_VERSION_NAME}</p>
            </div>
            <button
              onClick={handleRetry}
              style={{
                flexShrink: 0,
                background: C.blueBg,
                color: C.blue,
                border: '1px solid rgba(10,132,255,0.22)',
                borderRadius: 8, padding: '6px 12px',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Coba lagi
            </button>
          </div>
        )}

      </div>
    </>
  );
}