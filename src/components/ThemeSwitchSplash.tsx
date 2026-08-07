'use client';
// components/ThemeSwitchSplash.tsx
// ─────────────────────────────────────────────────────────────────────
// Layar transisi singkat saat pengguna berganti mode gelap/terang —
// bergaya sama dengan splash keluar akun, hanya lebih pendek.
//
// Ringan: hanya tampil ~900ms, semua animasinya CSS (transform/opacity),
// dan tidak memblokir interaksi lebih lama dari itu.
// ─────────────────────────────────────────────────────────────────────

import React from 'react';

export default function ThemeSwitchSplash({ toDark }: { toDark: boolean }) {
  const bg = toDark
    ? 'linear-gradient(160deg,#07090C 0%,#0B0F13 60%,#0D1418 100%)'
    : 'linear-gradient(160deg,#FFFFFF 0%,#F3F1EC 58%,#E9EEEA 100%)';
  const accent = toDark ? '#3FB984' : '#2E9E6E';
  const text   = toDark ? '#FFFFFF' : '#0F172A';
  const sub    = toDark ? 'rgba(255,255,255,0.52)' : 'rgba(15,23,42,0.55)';

  return (
    <div className="ts-splash" style={{ background: bg }} aria-hidden>
      <div className="ts-glow" style={{ background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)` }} />

      <div className="ts-icon-wrap">
        <span className="ts-ring"   style={{ borderColor: `${accent}44` }} />
        <span className="ts-ring ts-ring-2" style={{ borderColor: `${accent}26` }} />
        <div className="ts-icon" style={{
          background: toDark ? 'rgba(13,16,19,0.97)' : '#FFFFFF',
          borderColor: `${accent}44`,
          boxShadow: `0 8px 34px ${accent}26`,
        }}>
          {toDark ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4.6" />
              <line x1="12" y1="1.6" x2="12" y2="3.6" /><line x1="12" y1="20.4" x2="12" y2="22.4" />
              <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
              <line x1="1.6" y1="12" x2="3.6" y2="12" /><line x1="20.4" y1="12" x2="22.4" y2="12" />
              <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
            </svg>
          )}
        </div>
      </div>

      <p className="ts-title" style={{ color: text }}>
        {toDark ? 'Mode Gelap' : 'Mode Terang'}
      </p>
      <p className="ts-sub" style={{ color: sub }}>Menyesuaikan tampilan…</p>

      <div className="ts-bar-wrap" style={{ background: `${accent}26` }}>
        <div className="ts-bar" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}cc)` }} />
      </div>
    </div>
  );
}
