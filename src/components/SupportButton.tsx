'use client';
// components/SupportButton.tsx
// ─────────────────────────────────────────────────────────────────────
// Tombol support bulat melayang → popup lapor bug/error.
// Gaya STC: kartu tengah "terminal/spec", pita aksen, label mono, kategori
// list radio. SENGAJA beda dari koala (yang bottom-sheet bubble).
// Laporan dikirim via email support (mailto) + metadata otomatis.
// ─────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { LifeBuoy, X, Send, Check, ChevronRight } from 'lucide-react';
import { APP_VERSION_NAME } from '@/lib/appVersion';

const SUPPORT_EMAIL = 'supportstockity@gmail.com';
const ACCENT = 'var(--accent, #10b981)';
const CATS = [
  { id: 'tampilan', label: 'Tampilan / UI',  code: 'UI' },
  { id: 'sistem',   label: 'Sistem & Bot',   code: 'SYS' },
  { id: 'login',    label: 'Login & Akun',   code: 'AUTH' },
  { id: 'transaksi',label: 'Transaksi',      code: 'TXN' },
  { id: 'lainnya',  label: 'Lainnya',        code: 'ETC' },
];

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState('sistem');
  const [desc, setDesc] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    const c = CATS.find(x => x.id === cat)?.label ?? cat;
    const meta = `\n\n———\nSTC AutoTrade v${APP_VERSION_NAME}\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}\n${new Date().toISOString()}`;
    const subject = `[Bug - ${c}] STC AutoTrade`;
    const body = `Kategori: ${c}\n\nDeskripsi masalah:\n${desc || '(mohon jelaskan)'}${meta}`;
    setSent(true);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setTimeout(() => { setOpen(false); setSent(false); setDesc(''); }, 900);
  };

  return (
    <>
      <button
        aria-label="Lapor bug"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 16,
          bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))',
          zIndex: 45, width: 52, height: 52, borderRadius: '50%', cursor: 'pointer',
          background: 'var(--s1, #14161a)', border: `1.5px solid ${ACCENT}`,
          boxShadow: '0 8px 24px -6px rgba(16,185,129,0.45), 0 2px 8px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <LifeBuoy style={{ width: 23, height: 23, color: ACCENT }} />
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'fade-in 0.15s ease' }} />
          {/* kartu tengah — terminal/spec (gaya STC) */}
          <div style={{
            position: 'relative', width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--bg, #0c0e12)', color: 'var(--text, #e8eaed)',
            borderRadius: 16, border: '1px solid var(--bdr, rgba(255,255,255,0.1))', overflowX: 'hidden',
            animation: 'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
          }}>
            <div style={{ height: 3, background: `linear-gradient(90deg, ${ACCENT}, transparent)` }} />
            <div style={{ padding: '16px 20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: ACCENT, fontFamily: 'var(--font-mono, monospace)' }}>LAPORAN · BUG</span>
                <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}><X style={{ width: 17, height: 17, color: 'var(--muted, #8a8f98)' }} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <LifeBuoy style={{ width: 20, height: 20, color: ACCENT }} />
                <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>Laporkan Masalah</p>
              </div>

              {/* kategori — list radio bergaris */}
              <p style={{ fontSize: 11, color: 'var(--muted, #8a8f98)', letterSpacing: '0.04em', marginBottom: 8 }}>PILIH KATEGORI</p>
              <div style={{ border: '1px solid var(--bdr, rgba(255,255,255,0.1))', borderRadius: 12, overflow: 'hidden' }}>
                {CATS.map((c, i) => {
                  const act = cat === c.id;
                  return (
                    <button key={c.id} onClick={() => setCat(c.id)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                      background: act ? 'rgba(16,185,129,0.10)' : 'transparent',
                      border: 'none', borderBottom: i < CATS.length - 1 ? '1px solid var(--bdr, rgba(255,255,255,0.08))' : 'none',
                      textAlign: 'left',
                    }}>
                      <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${act ? ACCENT : 'var(--muted, #8a8f98)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {act && <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: act ? 700 : 500, color: act ? 'var(--text, #e8eaed)' : 'var(--sub, #b4b8bf)' }}>{c.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: act ? ACCENT : 'var(--muted, #8a8f98)', fontFamily: 'var(--font-mono, monospace)' }}>{c.code}</span>
                    </button>
                  );
                })}
              </div>

              {/* deskripsi */}
              <p style={{ fontSize: 11, color: 'var(--muted, #8a8f98)', letterSpacing: '0.04em', margin: '18px 0 8px' }}>DESKRIPSI MASALAH</p>
              <textarea
                value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                placeholder="Jelaskan bug/error yang terjadi dan langkah munculnya…"
                style={{
                  width: '100%', resize: 'none', borderRadius: 10, padding: '12px 13px', fontSize: 14, lineHeight: 1.5,
                  background: 'var(--s1, rgba(255,255,255,0.04))', color: 'var(--text, #e8eaed)',
                  border: '1px solid var(--bdr, rgba(255,255,255,0.12))', outline: 'none', fontFamily: 'inherit',
                }}
              />

              <button
                onClick={submit}
                style={{
                  width: '100%', marginTop: 16, padding: '14px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                  fontSize: 14.5, fontWeight: 800, letterSpacing: '0.02em', color: '#04210b',
                  background: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {sent ? <><Check style={{ width: 18, height: 18 }} />MEMBUKA EMAIL…</> : <><Send style={{ width: 16, height: 16 }} />KIRIM LAPORAN<ChevronRight style={{ width: 15, height: 15 }} /></>}
              </button>
              <p style={{ fontSize: 10.5, color: 'var(--muted, #8a8f98)', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>Terkirim ke tim via email dengan info versi &amp; perangkat otomatis.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
