'use client';

// Halaman Panduan STC AutoTrade — desain "friendly": hero hangat, catatan
// singkat bahwa bot berjalan di server, lalu kartu seksi berwarna yang
// bisa dibuka-tutup. Isi teks tetap dari guideText (dwibahasa).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib';
import { panduan } from '@/lib/guideText';
import {
  BookOpen, Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity,
  LifeBuoy, ChevronDown, Info, ExternalLink, Smartphone, Sparkles, KeyRound,
} from 'lucide-react';

const IKON: Record<string, typeof BookOpen> = {
  Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity, LifeBuoy, Smartphone, KeyRound,
};

// Aksen TUNGGAL & konsisten (emerald) — bersih & premium, bukan pelangi dekoratif.
//
// Dulu nilainya dipatok mati '#10b981' — emerald KETIGA yang bukan token terang
// (#059669) maupun gelap (#2DD4A7), sehingga halaman ini memakai hijau yang
// sedikit berbeda dari seluruh aplikasi DAN tidak ikut berubah saat tema
// diganti. Sekarang membaca token design system, jadi satu sumber warna.
const ACCENT = 'var(--s-acc)';

// TRADE_URL dipindah ke /webview, yang membukanya di dalam aplikasi.

export default function PanduanPage() {
  const { language } = useLanguage();
  const lang = language === 'id' ? 'id' : 'en';
  const teks = panduan(language);
  const BAGIAN = teks.bagian;
  const router = useRouter();
  const [terbuka, setTerbuka] = useState<string | null>('daftar');

  return (
    <div style={S.halaman}>
      <style>{`
        .pan-acc { transition: background .15s ease; }
        .pan-acc:active { opacity: .78; }
        @media (hover: hover) { .pan-acc:hover { background: var(--s2) !important; } }
        .pan-acc:focus-visible, .pan-link:focus-visible { outline: 2px solid var(--s-acc); outline-offset: 2px; }
        .pan-link { transition: filter .15s ease, transform .12s ease; }
        .pan-link:active { transform: scale(.99); }
        @media (hover: hover) { .pan-link:hover { filter: brightness(1.05); } }
      `}</style>

      <div style={S.wadah}>
        {/* HERO ramah */}
        <header style={S.kepala}>
          <span style={S.lencana}>
            <Sparkles size={13} strokeWidth={2.2} />
            {teks.lencana}
          </span>
          <h1 style={S.judul}>{teks.judulHalaman}</h1>
          <p style={S.sub}>{teks.pengantar}</p>
        </header>

        {/* CATATAN — bot berjalan di server (aman ditutup) */}
        <div style={S.serverNote}>
          <span style={S.serverIkon}><ShieldCheck size={16} strokeWidth={2} color={ACCENT} /></span>
          <p style={S.serverTeks}>
            {lang === 'id'
              ? 'Bot berjalan di server kami, jadi Anda boleh menutup aplikasi, berpindah menu, atau mematikan layar — sesi tetap berjalan sampai selesai atau Anda hentikan. Buka lagi kapan pun untuk memantau hasilnya.'
              : 'The bot runs on our server, so you can close the app, switch menus, or turn off the screen — the session keeps going until it finishes or you stop it. Reopen anytime to check the results.'}
          </p>
        </div>

        {/* SEKSI accordion berwarna */}
        <div style={S.daftar}>
          {BAGIAN.map((b, idx) => {
            const buka = terbuka === b.id;
            const Ikon = IKON[b.ikon] ?? BookOpen;
            const ac = ACCENT;
            return (
              <section key={b.id} style={{ ...S.kartu, ...(buka ? { borderColor: `${ac}55` } : null) }}>
                <button type="button" onClick={() => setTerbuka(buka ? null : b.id)} className="pan-acc" style={S.tombol} aria-expanded={buka}>
                  <span style={{ ...S.ikonKotak, background: buka ? `${ac}1c` : 'var(--s2)', color: buka ? ac : 'var(--text-2)' }}>
                    <Ikon size={18} strokeWidth={2} />
                  </span>
                  <span style={S.tengah}>
                    <span style={S.barisJudul}>
                      <span style={{ ...S.nomor, color: ac }}>{String(idx + 1).padStart(2, '0')}</span>
                      <span style={S.judulBagian}>{b.judul}</span>
                    </span>
                    <span style={S.ringkasBagian}>{b.ringkas}</span>
                  </span>
                  <ChevronDown size={18} strokeWidth={2.2} style={{ flexShrink: 0, opacity: 0.5, color: buka ? ac : 'var(--text-3)', transform: buka ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }} />
                </button>

                {buka && (
                  <div style={S.isi}>
                    {b.isi.map((it, n) => (
                      <div key={it.h} style={{ ...S.butir, ...(n === b.isi.length - 1 ? S.butirAkhir : null) }}>
                        <span style={{ ...S.titik, background: ac }} aria-hidden="true" />
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
          <p style={S.catatanTeks}>{teks.catatan}</p>
        </div>

        {/* Lewat /webview, bukan tautan langsung: di APK halaman itu membuka
            Stockity di dalam aplikasi (Capacitor Browser) sehingga pengguna
            tidak terlempar keluar. Di web ia jatuh ke tab baru seperti dulu. */}
        <button onClick={() => router.push('/webview')} className="pan-link"
                style={{ ...S.tautan, border: 'none', cursor: 'pointer', width: '100%' }}>
          {teks.tautan}
          <ExternalLink size={15} strokeWidth={2} />
        </button>

        <p style={S.risiko}>{teks.risiko}</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  halaman: { position: 'relative', minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as never },
  cahaya: { position: 'absolute', top: -140, left: '50%', transform: 'translateX(-50%)', width: 440, height: 300, borderRadius: '50%', background: 'var(--accent, var(--s-acc))', opacity: 0.08, filter: 'blur(90px)', pointerEvents: 'none' },
  wadah: { position: 'relative', maxWidth: 640, margin: '0 auto', padding: '26px 16px 44px' },

  kepala: { marginBottom: 22, textAlign: 'center' },
  lencana: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, color: 'var(--accent, var(--s-acc))', background: 'var(--s-acc-tint)', border: '1px solid var(--s-acc-bdr)', marginBottom: 14 },
  judul: { fontSize: 27, fontWeight: 750, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 9 },
  sub: { fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)', maxWidth: 430, margin: '0 auto' },

  // Catatan bot berjalan di server
  serverNote: { display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 15px', borderRadius: 16, background: 'var(--s1)', border: '1px solid var(--bdr)', marginBottom: 20 },
  serverIkon: { display: 'inline-flex', flexShrink: 0, width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: 'var(--s-acc-tint)' },
  serverTeks: { fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-2)' },

  daftar: { display: 'flex', flexDirection: 'column', gap: 10 },
  kartu: { background: 'var(--s1)', border: '1px solid var(--bdr)', borderRadius: 18, overflow: 'hidden', transition: 'border-color 0.22s ease, box-shadow 0.22s ease' },
  tombol: { display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '15px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' },
  ikonKotak: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 13, flexShrink: 0, transition: 'background 0.22s ease, color 0.22s ease' },
  tengah: { flex: 1, minWidth: 0 },
  barisJudul: { display: 'flex', alignItems: 'baseline', gap: 8 },
  nomor: { fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', flexShrink: 0 },
  judulBagian: { fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' },
  ringkasBagian: { display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-3)', marginTop: 3, paddingLeft: 26 },

  isi: { padding: '2px 16px 4px 69px' },
  butir: { display: 'flex', gap: 10, paddingBottom: 15, marginBottom: 15, borderBottom: '1px solid var(--bdr)' },
  butirAkhir: { borderBottom: 'none', marginBottom: 4 },
  titik: { width: 6, height: 6, borderRadius: 99, flexShrink: 0, marginTop: 7 },
  butirJudul: { fontSize: 13.5, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.005em' },
  butirTeks: { fontSize: 13, lineHeight: 1.75, color: 'var(--text-2)' },

  catatan: { display: 'flex', gap: 10, marginTop: 18, padding: '14px 15px', borderRadius: 15, background: 'var(--s2)', border: '1px solid var(--bdr)', color: 'var(--text-2)' },
  catatanTeks: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' },
  tautan: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, padding: '14px 18px', borderRadius: 15, fontSize: 14.5, fontWeight: 700, color: '#04210b', background: 'var(--accent, var(--s-acc))', border: 'none', textDecoration: 'none' },
  risiko: { marginTop: 16, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-3)', textAlign: 'center' },
};
