'use client';
// components/SessionPill.tsx
// ─────────────────────────────────────────────────────────────────────
// Pil sesi — pantauan sesi yang sedang berjalan dari tab mana pun.
//
// Mesinnya hidup di server, jadi meninggalkan Beranda tidak pernah mematikan
// sesi — yang hilang hanya PANTAUANNYA. Pil ini mengembalikannya.
//
// Berbeda dengan versi koala yang memakai kelas design system `k-*`, STC belum
// punya lapisan itu, jadi gayanya ditulis inline memakai palet STC.
//
// Durasi ditulis LANGSUNG ke DOM lewat ref, bukan state: pil ini tampil di
// setiap halaman, dan satu render per detik di seluruh aplikasi adalah harga
// yang tidak perlu dibayar hanya untuk sebuah stopwatch.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { sessionBeacon, type SessionBeaconState } from '@/lib/sessionBeacon';

const HIDE_ON = ['/dashboard', '/login', '/register', '/webview', '/unduh'];

export function SessionPill() {
  const router = useRouter();
  const pathname = usePathname();
  const [s, setS] = useState<SessionBeaconState>(() => sessionBeacon.get());
  const clockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => sessionBeacon.subscribe(setS), []);

  // Stopwatch — hanya berjalan saat pil benar-benar tampil.
  useEffect(() => {
    if (!s.running || !s.startedAt) return;
    const p2 = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      if (!clockRef.current) return;
      const sec = Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      clockRef.current.textContent = h > 0
        ? `${h}:${p2(m)}:${p2(sec % 60)}`
        : `${p2(m)}:${p2(sec % 60)}`;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [s.running, s.startedAt]);

  const hidden = !s.running || HIDE_ON.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (hidden) return null;

  const pos = s.pnlCents >= 0;
  const amount = Math.abs(s.pnlCents / 100).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const warna = pos ? '#2DD4A7' : '#FF6B6B';

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 74, zIndex: 45,
      display: 'flex', justifyContent: 'center', padding: '0 14px', pointerEvents: 'none',
    }}>
      <button
        onClick={() => router.push('/dashboard')}
        aria-label="Kembali ke sesi yang sedang berjalan"
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
          maxWidth: 420, width: '100%', padding: '9px 13px', borderRadius: 999,
          background: 'rgba(18,18,22,0.92)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 8px 28px -10px rgba(0,0,0,0.65)',
          cursor: 'pointer', font: 'inherit', color: '#fff',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#2DD4A7',
          flexShrink: 0, boxShadow: '0 0 0 4px rgba(45,212,167,0.18)',
        }} />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {s.modeLabel || 'Sesi'} berjalan
          </b>
          <span ref={clockRef} suppressHydrationWarning
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
            00:00
          </span>
        </span>
        {/* Angka ini P/L SESI BERJALAN, bukan keuntungan hari ini — cakupannya
            berbeda, jadi diberi label agar tidak dikira angka yang sama. */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            Sesi
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: warna, fontVariantNumeric: 'tabular-nums' }}>
            {pos ? '+' : '−'}{s.currencyUnit} {amount}
          </span>
        </span>
      </button>
    </div>
  );
}
