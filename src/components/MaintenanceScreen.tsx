'use client';
// components/MaintenanceScreen.tsx
// Layar pemberitahuan saat MODE PEMELIHARAAN aktif. Ditampilkan menggantikan
// isi dashboard sehingga pengguna tidak bisa memakai aplikasi selagi server
// diperbaiki. Super admin dikecualikan (lihat pemakaian di dashboard).

import React from 'react';
import { formatRemaining, type MaintenanceInfo } from '@/lib/maintenanceConfig';

export default function MaintenanceScreen({
  info, C, appName, onRetry,
}: {
  info: MaintenanceInfo;
  C: any;
  appName: string;
  onRetry?: () => void;
}) {
  // Hitung mundur diperbarui tiap 30 detik supaya sisa waktunya tetap akurat
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const remaining = formatRemaining(info.endAt);
  const fmtTime = (ms?: number | null) =>
    ms ? new Date(ms).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const startLbl = fmtTime(info.startAt);
  const endLbl = fmtTime(info.endAt);

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 18px', background: C.bg,
    }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420, overflow: 'hidden',
        background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 24,
        padding: '30px 24px 26px', textAlign: 'center',
        boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
        animation: 'slide-up 0.4s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Aksen atas */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${C.amber}, ${C.cyan}, ${C.amber})`,
          backgroundSize: '200% 100%', animation: 'header-shimmer 3.5s ease infinite',
        }} />

        {/* Ikon berdenyut */}
        <div style={{ position: 'relative', width: 78, height: 78, margin: '4px auto 20px' }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `${C.amber}1f`, animation: 'ping 2.4s cubic-bezier(0,0,0.2,1) infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${C.amber}14`, border: `1px solid ${C.amber}40`,
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.amber}
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
        </div>

        <p style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Sedang Pemeliharaan
        </p>
        <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, marginBottom: 18 }}>
          {info.message?.trim()
            || `Server ${appName} sedang diperbaiki untuk meningkatkan layanan. Untuk sementara aplikasi belum bisa digunakan.`}
        </p>

        {/* Perkiraan waktu */}
        {(remaining || startLbl || endLbl) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
            padding: '13px 15px', borderRadius: 15, marginBottom: 18,
            background: C.card2, border: `1px solid ${C.bdr}`,
          }}>
            {remaining && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Perkiraan selesai dalam</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{remaining}</span>
              </div>
            )}
            {startLbl && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Mulai</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub }}>{startLbl}</span>
              </div>
            )}
            {endLbl && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Perkiraan sampai</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub }}>{endLbl}</span>
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginBottom: 18 }}>
          Mohon tunggu sebentar — tidak perlu memasang ulang aplikasi. Terima kasih atas kesabarannya.
        </p>

        {onRetry && (
          <button onClick={onRetry} style={{
            width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            background: C.cyan, color: C.onAccent ?? '#fff',
          }}>
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}
