'use client';

// Halaman Panduan AutoTrade.
//
// Sebelumnya halaman ini membuka Stockity di peramban bawaan. Isinya diganti
// panduan pemakaian bot karena pengguna lebih membutuhkan penjelasan cara
// menjalankannya daripada pintasan ke platform — tautan ke Stockity tetap
// disediakan di bagian bawah.

import { useState } from 'react';
import { useLanguage } from '@/lib';
import { panduan } from '@/lib/guideText';
import { BookOpen, Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity, LifeBuoy, ChevronDown, Info, ExternalLink, Smartphone } from 'lucide-react';

/** Peta ikon per bagian — dipisah agar data panduan tetap berupa teks biasa */
const IKON: Record<string, typeof BookOpen> = {
  Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity, LifeBuoy, Smartphone,
};

const TRADE_URL = 'https://stockity.id';

export default function PanduanPage() {
  const { language } = useLanguage();
  const teks = panduan(language);
  const BAGIAN = teks.bagian;
  const [terbuka, setTerbuka] = useState<string | null>('daftar');

  return (
    <div style={S.halaman}>
      {/* Sorotan lembut di belakang kepala halaman — memberi kedalaman
          tanpa mengganggu keterbacaan. */}
      <div style={S.cahaya} aria-hidden="true" />

      <div style={S.wadah}>
        <header style={S.kepala}>
          <span style={S.lencana}>
            <BookOpen size={13} strokeWidth={2.2} />
            {teks.lencana}
          </span>
          <h1 style={S.judul}>{teks.judulHalaman}</h1>
          <p style={S.sub}>
            {teks.pengantar}
          </p>
        </header>

        <div style={S.daftar}>
          {BAGIAN.map((b, idx) => {
            const buka = terbuka === b.id;
            const Ikon = IKON[b.ikon] ?? BookOpen;
            return (
              <section key={b.id} style={{ ...S.kartu, ...(buka ? S.kartuAktif : null) }}>
                <button
                  type="button"
                  onClick={() => setTerbuka(buka ? null : b.id)}
                  style={S.tombol}
                  aria-expanded={buka}
                >
                  <span style={{ ...S.ikonKotak, ...(buka ? S.ikonKotakAktif : null) }}>
                    <Ikon size={17} strokeWidth={2} />
                  </span>

                  <span style={S.tengah}>
                    <span style={S.barisJudul}>
                      <span style={S.nomor}>{String(idx + 1).padStart(2, '0')}</span>
                      <span style={S.judulBagian}>{b.judul}</span>
                    </span>
                    <span style={S.ringkasBagian}>{b.ringkas}</span>
                  </span>

                  <ChevronDown
                    size={17}
                    strokeWidth={2.2}
                    style={{
                      flexShrink: 0,
                      opacity: 0.45,
                      transform: buka ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.25s ease',
                    }}
                  />
                </button>

                {buka && (
                  <div style={S.isi}>
                    {b.isi.map((it, n) => (
                      <div key={it.h} style={{ ...S.butir, ...(n === b.isi.length - 1 ? S.butirAkhir : null) }}>
                        <span style={S.titik} aria-hidden="true" />
                        <div>
                          <p style={S.butirJudul}>{it.h}</p>
                          <p style={S.butirTeks}>{it.p}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div style={S.catatan}>
          <Info size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1, opacity: 0.7 }} />
          <p style={S.catatanTeks}>
            {teks.catatan}
          </p>
        </div>

        <a href={TRADE_URL} target="_blank" rel="noopener noreferrer" style={S.tautan}>
          {teks.tautan}
          <ExternalLink size={15} strokeWidth={2} />
        </a>

        <p style={S.risiko}>
          {teks.risiko}
        </p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  halaman: {
    position: 'relative',
    minHeight: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as never,
  },
  cahaya: {
    position: 'absolute',
    top: -140,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 420,
    height: 300,
    borderRadius: '50%',
    background: 'var(--blue)',
    opacity: 0.09,
    filter: 'blur(90px)',
    pointerEvents: 'none',
  },
  wadah: { position: 'relative', maxWidth: 640, margin: '0 auto', padding: '26px 16px 44px' },

  kepala: { marginBottom: 26, textAlign: 'center' },
  lencana: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'var(--blue)',
    background: 'var(--blue-dim)',
    border: '1px solid var(--blue-bdr)',
    marginBottom: 14,
  },
  judul: { fontSize: 27, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 9 },
  sub: { fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)', maxWidth: 420, margin: '0 auto' },

  daftar: { display: 'flex', flexDirection: 'column', gap: 10 },
  kartu: {
    background: 'var(--s1)',
    border: '1px solid var(--bdr)',
    borderRadius: 18,
    overflow: 'hidden',
    transition: 'border-color 0.22s ease, box-shadow 0.22s ease',
  },
  kartuAktif: {
    borderColor: 'var(--blue-bdr)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 14px 34px -22px rgba(0,0,0,0.45)',
  },

  tombol: {
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    width: '100%',
    padding: '15px 16px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text)',
    textAlign: 'left',
  },
  ikonKotak: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 12,
    flexShrink: 0,
    background: 'var(--s2)',
    color: 'var(--text-2)',
    transition: 'background 0.22s ease, color 0.22s ease',
  },
  ikonKotakAktif: { background: 'var(--blue-dim)', color: 'var(--blue)' },

  tengah: { flex: 1, minWidth: 0 },
  barisJudul: { display: 'flex', alignItems: 'baseline', gap: 8 },
  nomor: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--text-3)',
    flexShrink: 0,
  },
  judulBagian: { fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em' },
  ringkasBagian: {
    display: 'block',
    fontSize: 12.5,
    lineHeight: 1.5,
    color: 'var(--text-3)',
    marginTop: 3,
    paddingLeft: 26,
  },

  isi: { padding: '2px 16px 4px 67px' },
  butir: {
    display: 'flex',
    gap: 10,
    paddingBottom: 15,
    marginBottom: 15,
    borderBottom: '1px solid var(--bdr)',
  },
  butirAkhir: { borderBottom: 'none', marginBottom: 4 },
  titik: {
    width: 5,
    height: 5,
    borderRadius: 99,
    background: 'var(--blue)',
    opacity: 0.55,
    flexShrink: 0,
    marginTop: 7,
  },
  butirJudul: { fontSize: 13.5, fontWeight: 650, marginBottom: 4, letterSpacing: '-0.005em' },
  butirTeks: { fontSize: 13, lineHeight: 1.75, color: 'var(--text-2)' },

  catatan: {
    display: 'flex',
    gap: 10,
    marginTop: 18,
    padding: '14px 15px',
    borderRadius: 15,
    background: 'var(--s2)',
    border: '1px solid var(--bdr)',
    color: 'var(--text-2)',
  },
  catatanTeks: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' },

  tautan: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    padding: '14px 18px',
    borderRadius: 15,
    fontSize: 14.5,
    fontWeight: 600,
    color: 'var(--text)',
    background: 'var(--s1)',
    border: '1px solid var(--bdr)',
    textDecoration: 'none',
  },
  risiko: {
    marginTop: 16,
    fontSize: 11.5,
    lineHeight: 1.65,
    color: 'var(--text-3)',
    textAlign: 'center',
  },
};
