'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * TabLoadingBar — v3 (redesign kompetisi)
 *
 * v2 memakai overlay gelap full-screen + spinner dengan durasi minimum
 * 500ms — setiap pindah tab terasa "berat" walau halamannya instan.
 *
 * v3 = progress bar tipis di tepi atas (pola nprogress/YouTube):
 *  - Tidak memblokir/menggelapkan apa pun — navigasi terasa instan
 *  - Bar merayap ke ~80% selama menunggu (ease-out), lalu melesat ke
 *    100% dan fade saat halaman tiba
 *  - GPU-friendly: hanya transform scaleX + opacity
 *  - State machine tetap: idle → entering/visible → leaving → idle,
 *    dipicu event 'stc:navstart' dari BottomNav & selesai via pathname
 */

const MIN_VISIBLE_MS = 200; // supaya bar sempat terlihat pada navigasi instan
const DONE_MS        = 260; // durasi lari ke 100% + fade

type Phase = 'idle' | 'loading' | 'done';

export function TabLoadingBar() {
  const pathname     = usePathname();
  const prevPathRef  = useRef(pathname);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef     = useRef<Phase>('idle');
  const startRef     = useRef(0);

  const setPhaseSync = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ── Mulai saat user klik tab ──────────────────────────────────────────────
  useEffect(() => {
    const handleNavStart = () => {
      if (phaseRef.current === 'loading') return;
      startRef.current = Date.now();
      setPhaseSync('loading');
    };
    window.addEventListener('stc:navstart', handleNavStart);
    return () => window.removeEventListener('stc:navstart', handleNavStart);
  }, []);

  // ── Navigasi selesai via perubahan pathname ───────────────────────────────
  useEffect(() => {
    if (pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;
    if (phaseRef.current !== 'loading') return;

    const elapsed   = Date.now() - startRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const t1 = setTimeout(() => {
      setPhaseSync('done');
      setTimeout(() => setPhaseSync('idle'), DONE_MS + 60);
    }, remaining);
    return () => clearTimeout(t1);
  }, [pathname]);

  if (phase === 'idle') return null;

  const loading = phase === 'loading';

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 2147483647,
        pointerEvents: 'none',
        // hormati notch/status bar Android WebView
        paddingTop: 'env(safe-area-inset-top, 0px)',
        opacity: loading ? 1 : 0,
        transition: loading ? 'none' : `opacity ${DONE_MS}ms ease ${DONE_MS * 0.4}ms`,
      }}
    >
      <style>{`
        /* mulai dari 0 → merayap ke ~80% dan melambat (pola nprogress) */
        @keyframes __bar_creep  { from { transform: scaleX(0.03); } to { transform: scaleX(0.82); } }
        /* halaman tiba → lari dari 80% ke penuh */
        @keyframes __bar_finish { from { transform: scaleX(0.82); } to { transform: scaleX(1); } }
      `}</style>
      <div
        style={{
          height: 3,
          borderRadius: '0 2px 2px 0',
          background: 'linear-gradient(90deg, #059669, #2DD4A7)',
          transformOrigin: 'left center',
          animation: loading
            ? '__bar_creep 6s cubic-bezier(0.08, 0.6, 0.16, 1) forwards'
            : `__bar_finish ${DONE_MS}ms ease-out forwards`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}
