'use client';
// components/AktivasiShell.tsx
// Shell premium untuk SEMUA portal aktivasi STC (REAL / AI Signal / 5st).
// Satu desain, tiap halaman cukup mengoper konfigurasi (fitur, harga, benefit).
// Tema gelap Apple-like, aksen emerald. Alur: ringkasan pesanan → 3 langkah
// (data → bayar QRIS → unggah bukti) dengan progress, lalu kirim.

import { useState, useRef } from 'react';
import { Upload, Check, Loader2, X, Lock, Download, ShieldCheck } from 'lucide-react';
import { saveQris } from '@/lib/saveQris';

const AC = '#10b981';
const AC2 = '#34d399';
const API = process.env.NEXT_PUBLIC_API_URL ?? '';

type IconKey = 'real' | 'ai' | 'blitz';

// Glyph fitur KUSTOM (bukan ikon template lucide) — terisi penuh, tampak premium.
// REAL: perisai + centang tembus (duotone), AI: kilau/sparkle, 5st: petir.
function FeatureGlyph({ k, size, color }: { k: IconKey; size: number; color: string }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', style: { display: 'block' } as React.CSSProperties, 'aria-hidden': true } as const;
  if (k === 'ai') return (
    <svg {...c}>
      <path fill={color} d="M12 1.9c.43 0 .8.29.92.7l1.15 3.86c.26.87.94 1.55 1.81 1.81l3.86 1.15c.41.12.7.49.7.92s-.29.8-.7.92l-3.86 1.15c-.87.26-1.55.94-1.81 1.81l-1.15 3.86c-.12.41-.49.7-.92.7s-.8-.29-.92-.7l-1.15-3.86a2.62 2.62 0 0 0-1.81-1.81l-3.86-1.15c-.41-.12-.7-.49-.7-.92s.29-.8.7-.92l3.86-1.15c.87-.26 1.55-.94 1.81-1.81l1.15-3.86c.12-.41.49-.7.92-.7Z" />
      <path fill={color} opacity="0.5" d="M18.7 2.1c.2 0 .38.14.44.34l.42 1.4c.12.41.44.73.85.85l1.4.42c.2.06.34.24.34.44s-.14.38-.34.44l-1.4.42c-.41.12-.73.44-.85.85l-.42 1.4c-.06.2-.24.34-.44.34s-.38-.14-.44-.34l-.42-1.4a1.05 1.05 0 0 0-.85-.85l-1.4-.42c-.2-.06-.34-.24-.34-.44s.14-.38.34-.44l1.4-.42c.41-.12.73-.44.85-.85l.42-1.4c.06-.2.24-.34.44-.34Z" />
    </svg>
  );
  if (k === 'blitz') return (
    <svg {...c}>
      <path fill={color} d="M14.05 1.83c.53-.62 1.53-.13 1.38.67L14.2 9.1h4.7c.86 0 1.3 1.03.72 1.67l-9.67 10.6c-.53.58-1.47.06-1.28-.7l1.4-6.67H5.1c-.86 0-1.3-1.03-.72-1.67l9.67-10.5Z" />
    </svg>
  );
  return (
    <svg {...c}>
      <path fill={color} fillRule="evenodd" clipRule="evenodd" d="M12 1.7c-.28 0-.51.06-.75.16L4.87 4.63A2 2 0 0 0 3.6 6.5v4.72c0 4.72 3.08 9.1 7.66 11.1.5.22 1.06.22 1.56 0 4.58-2 7.66-6.38 7.66-11.1V6.5a2 2 0 0 0-1.27-1.87L12.75 1.86c-.24-.1-.47-.16-.75-.16Zm4.05 7.8a1 1 0 0 0-1.47-1.36l-3.92 4.24-1.56-1.64a1 1 0 1 0-1.45 1.38l2.29 2.42a1 1 0 0 0 1.46-.01l4.65-5.03Z" />
    </svg>
  );
}

export interface AktivasiConfig {
  /** Kunci glyph fitur kustom (bukan ikon template). */
  iconKey: IconKey;
  /** Nama fitur, mis. "Mode REAL". */
  title: string;
  /** Kalimat pengantar 1 baris. */
  tagline: string;
  /** Harga tampil, mis. "Rp 150.000". */
  price: string;
  /** Keterangan tagihan, mis. "sekali bayar" atau "/ bulan". */
  billing: string;
  /** 3–4 manfaat yang didapat. */
  benefits: string[];
  /** feature utk body request; kosong = REAL. */
  apiFeature?: 'aisignal' | 'blitz5s';
  /** Nama brand, mis. "STC AutoTrade". */
  brand: string;
}

const PAYMENTS: { name: string; color: string }[] = [
  { name: 'DANA', color: '#118EEA' }, { name: 'OVO', color: '#4C2A86' },
  { name: 'GoPay', color: '#0093C4' }, { name: 'ShopeePay', color: '#EE4D2D' },
  { name: 'BCA', color: '#0060AF' }, { name: 'Mandiri', color: '#003D79' },
  { name: 'BRI', color: '#00529C' }, { name: 'BNI', color: '#EE7203' },
];

function PayLogo({ p }: { p: (typeof PAYMENTS)[number] }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 34, minWidth: 60, padding: '0 12px', background: '#fff', borderRadius: 9, boxShadow: '0 2px 8px -3px rgba(0,0,0,0.5)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: p.color }}>{p.name}</span>
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 34, minWidth: 62, padding: '0 11px', background: '#fff', borderRadius: 9, boxShadow: '0 2px 8px -3px rgba(0,0,0,0.5)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/pay/${p.name.toLowerCase()}.svg`} alt={p.name} onError={() => setErr(true)} style={{ height: 20, width: 'auto', maxWidth: 80, objectFit: 'contain', display: 'block' }} />
    </span>
  );
}

export default function AktivasiShell({ cfg }: { cfg: AktivasiConfig }) {
  const [name, setName] = useState('');
  const [sid, setSid] = useState('');
  const [proof, setProof] = useState('');
  const [proofName, setProofName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const dataOk = name.trim().length >= 2 && sid.trim().length >= 3;
  const valid = dataOk && !!proof;
  // Langkah aktif untuk progress: 0=data, 1=bayar, 2=bukti, 3=siap kirim.
  const step = !dataOk ? 0 : !proof ? 2 : 3;

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr('Ukuran gambar maksimal 5MB.'); return; }
    const r = new FileReader();
    r.onload = () => { setProof(String(r.result)); setProofName(f.name); setErr(''); };
    r.readAsDataURL(f);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const body: Record<string, unknown> = { app: 'stc', name: name.trim(), stockityId: sid.trim(), proof };
      if (cfg.apiFeature) body.feature = cfg.apiFeature;
      const res = await fetch(`${API}/api/v1/activation/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Gagal mengirim. Coba lagi.');
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || 'Gagal mengirim. Periksa koneksi lalu coba lagi.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div style={sx.page}>
        <div style={sx.wrap}>
          <div style={{ ...sx.card, textAlign: 'center', padding: '44px 26px', marginTop: 8 }}>
            <div style={sx.doneBadge}><Check style={{ width: 36, height: 36, color: '#04210b' }} /></div>
            <h1 style={{ fontSize: 22, fontWeight: 750, marginBottom: 10, letterSpacing: '-0.4px', color: '#f4f6f5' }}>Pengajuan Terkirim</h1>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#9aa6a1', maxWidth: 360, margin: '0 auto' }}>
              Pengajuan kamu <b style={{ color: '#f4f6f5' }}>sedang diproses</b>, mohon menunggu. Setelah pembayaran diverifikasi admin, <b style={{ color: '#f4f6f5' }}>{cfg.title}</b> akan aktif pada akun <b style={{ color: AC }}>{sid}</b> — biasanya dalam ~10 menit.
            </p>
            <div style={sx.doneNote}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#c4cec9', margin: 0 }}>Belum ada respons setelah <b style={{ color: '#f4f6f5' }}>12 jam</b>? Laporkan ke kami:</p>
              <a href="mailto:supportstockity@gmail.com?subject=Aktivasi%20belum%20diproses" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: AC, textDecoration: 'none' }}>✉️ supportstockity@gmail.com</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const STEPS = ['Data', 'Bayar', 'Bukti'];

  return (
    <div style={sx.page}>
      <div style={sx.wrap}>
        {/* HERO */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={sx.eyebrow}><ShieldCheck style={{ width: 12, height: 12 }} /> PORTAL AKTIVASI · {cfg.brand}</span>
          <div style={sx.heroIcon}><FeatureGlyph k={cfg.iconKey} size={30} color="#04210b" /></div>
          <h1 style={sx.heroTitle}>Aktivasi {cfg.title}</h1>
          <p style={sx.heroTagline}>{cfg.tagline}</p>
        </div>

        {/* RINGKASAN PESANAN */}
        <div style={sx.summary}>
          <div style={sx.summaryGlow} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sx.summaryLabel}>YANG KAMU AKTIFKAN</div>
                <div style={sx.summaryFeature}>{cfg.title}</div>
              </div>
              <span style={sx.summaryIcon}><FeatureGlyph k={cfg.iconKey} size={18} color={AC} /></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={sx.priceBig}>{cfg.price}</span>
              <span style={sx.billing}>{cfg.billing}</span>
            </div>
            <div style={sx.hr} />
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9, margin: 0, padding: 0 }}>
              {cfg.benefits.map((b) => (
                <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: '#d4ddd8', lineHeight: 1.45 }}>
                  <span style={sx.benefitTick}><Check style={{ width: 11, height: 11, color: AC }} strokeWidth={3} /></span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* PROGRESS LANGKAH */}
        <div style={sx.stepper}>
          {STEPS.map((s, i) => {
            const dstep = i === 0 ? 0 : i === 1 ? 2 : 3;   // batas "done" per langkah
            const doneStep = step > dstep;
            const active = step === dstep || (i === 1 && step === 2) || (i === 2 && step === 3);
            const on = doneStep || active;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none', minWidth: 0 }}>
                <span style={{ ...sx.stepDot, ...(on ? sx.stepDotOn : null) }}>
                  {doneStep ? <Check style={{ width: 12, height: 12, color: '#04210b' }} strokeWidth={3} /> : i + 1}
                </span>
                <span style={{ ...sx.stepLabel, color: on ? '#f4f6f5' : '#6b7873' }}>{s}</span>
                {i < 2 && <span style={{ ...sx.stepLine, background: step > dstep ? AC : '#1c2b24' }} />}
              </div>
            );
          })}
        </div>

        {/* LANGKAH 1 · DATA */}
        <div style={sx.card}>
          <div style={sx.stepHead}>
            <span style={{ ...sx.stepNum, ...(dataOk ? sx.stepNumDone : null) }}>{dataOk ? <Check style={{ width: 14, height: 14, color: '#04210b' }} strokeWidth={3} /> : '1'}</span>
            <span style={sx.stepTitle}>Data Kamu</span>
          </div>
          <label style={sx.label}>NAMA LENGKAP</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama sesuai identitas" className="aktv-in" style={sx.input} />
          <label style={{ ...sx.label, marginTop: 14 }}>ID AKUN STOCKITY</label>
          <input value={sid} onChange={e => setSid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="mis. 183xxxxxx" className="aktv-in" style={sx.input} />
          <p style={sx.hint}>ID akun bisa dilihat di profil Stockity kamu.</p>
        </div>

        {/* LANGKAH 2 · BAYAR */}
        <div style={sx.card}>
          <div style={sx.stepHead}>
            <span style={sx.stepNum}>2</span>
            <span style={sx.stepTitle}>Bayar {cfg.price}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={sx.qrisFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/qr-pembayaran-terbaru.jpeg" alt="QRIS" style={{ width: 232, maxWidth: '64vw', height: 'auto', display: 'block', borderRadius: 10 }} />
            </div>
            <button type="button" onClick={() => saveQris('/qr-pembayaran-terbaru.jpeg', 'QRIS-StcAutoTrade.jpg')} className="aktv-tap" style={sx.qrisBtn}>
              <Download style={{ width: 15, height: 15 }} /> Unduh QRIS
            </button>
            <p style={{ fontSize: 12.5, color: '#9aa6a1', textAlign: 'center', lineHeight: 1.55 }}>Scan atau unduh <b style={{ color: '#f4f6f5' }}>QRIS</b>, bayar tepat <b style={{ color: AC }}>{cfg.price}</b>, lalu simpan buktinya.</p>
          </div>
          <div style={{ marginTop: 4 }}>
            <p style={sx.payHead}>DIDUKUNG SEMUA E-WALLET &amp; BANK VIA QRIS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
              {PAYMENTS.map(p => <PayLogo key={p.name} p={p} />)}
            </div>
          </div>
        </div>

        {/* LANGKAH 3 · BUKTI */}
        <div style={sx.card}>
          <div style={sx.stepHead}>
            <span style={{ ...sx.stepNum, ...(proof ? sx.stepNumDone : null) }}>{proof ? <Check style={{ width: 14, height: 14, color: '#04210b' }} strokeWidth={3} /> : '3'}</span>
            <span style={sx.stepTitle}>Unggah Bukti Bayar</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0] ?? null)} />
          {proof ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="bukti" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 14, border: '1px solid #1f3a31', background: '#0c1512' }} />
              <button onClick={() => { setProof(''); setProofName(''); }} style={sx.removeBtn}><X style={{ width: 16, height: 16, color: '#fff' }} /></button>
              <p style={{ fontSize: 11.5, color: '#7d8a84', marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proofName}</p>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="aktv-tap" style={sx.upload}>
              <span style={sx.uploadIcon}><Upload style={{ width: 22, height: 22, color: AC }} /></span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#c4cec9' }}>Pilih gambar bukti bayar</span>
              <span style={{ fontSize: 11.5, color: '#7d8a84' }}>JPG / PNG · maks 5MB</span>
            </button>
          )}
        </div>

        {err && <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center', marginBottom: 12 }}>{err}</p>}

        <button onClick={submit} disabled={!valid || busy} className="aktv-btn" style={{ ...sx.submit, opacity: valid && !busy ? 1 : 0.5, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />Mengirim…</> : <>Kirim Pengajuan · {cfg.price}</>}
        </button>
        <p style={sx.foot}>
          <Lock style={{ width: 12, height: 12 }} /> Diverifikasi admin · online 24 jam · rata-rata ~10 menit
        </p>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .aktv-in{ transition:border-color .16s ease, box-shadow .16s ease, background .16s ease; }
        .aktv-in::placeholder{ color:#5f6f68; }
        .aktv-in:focus{ border-color:${AC}; box-shadow:0 0 0 3px ${AC}2e; background:#0c1512; }
        .aktv-btn{ transition:transform .12s ease, filter .16s ease; }
        .aktv-btn:not(:disabled):hover{ filter:brightness(1.05); }
        .aktv-btn:not(:disabled):active{ transform:scale(.985); }
        .aktv-tap{ transition:background .15s ease, transform .12s ease; -webkit-tap-highlight-color:transparent; }
        .aktv-tap:active{ transform:scale(.98); }
        .aktv-in:focus-visible, .aktv-btn:focus-visible, .aktv-tap:focus-visible{ outline:2px solid ${AC}; outline-offset:2px; }
      `}</style>
    </div>
  );
}

const sx: Record<string, React.CSSProperties> = {
  page: { minHeight: '100%', background: 'radial-gradient(120% 60% at 50% -8%, #0c1a15 0%, #070a09 46%)', color: '#f4f6f5', padding: '22px 16px 48px', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif' },
  wrap: { maxWidth: 468, margin: '0 auto' },
  eyebrow: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: AC, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 99, padding: '5px 12px', marginBottom: 16 },
  heroIcon: { width: 62, height: 62, borderRadius: 21, background: `linear-gradient(155deg,${AC},${AC2})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 12px 28px -12px ${AC}66`, marginBottom: 14 },
  heroTitle: { fontSize: 27, fontWeight: 750, letterSpacing: '-0.7px', lineHeight: 1.1, color: '#f4f6f5' },
  heroTagline: { fontSize: 14, color: '#9aa6a1', marginTop: 8, lineHeight: 1.55, maxWidth: 400, marginInline: 'auto' },

  summary: { position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, marginBottom: 18, background: 'linear-gradient(180deg,#0f1c17,#0c1512)', border: '1px solid rgba(16,185,129,0.30)', boxShadow: '0 18px 40px -24px rgba(16,185,129,0.35)' },
  summaryGlow: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: '50%', background: AC, opacity: 0.14, filter: 'blur(48px)', pointerEvents: 'none' },
  summaryLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', color: '#7d8a84' },
  summaryFeature: { fontSize: 19, fontWeight: 750, letterSpacing: '-0.3px', color: '#f4f6f5', marginTop: 3 },
  summaryIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: 13, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  priceBig: { fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: '#f4f6f5', lineHeight: 1 },
  billing: { fontSize: 13, fontWeight: 600, color: '#9aa6a1' },
  hr: { height: 1, background: 'linear-gradient(90deg,transparent,#1f3a31,transparent)', margin: '16px 0 14px' },
  benefitTick: { flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: 'rgba(16,185,129,0.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },

  stepper: { display: 'flex', alignItems: 'center', gap: 0, marginBottom: 18, padding: '0 4px' },
  stepDot: { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: '#0d1512', border: '1.5px solid #1c2b24', color: '#6b7873', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { background: `linear-gradient(155deg,${AC},${AC2})`, border: `1.5px solid ${AC}`, color: '#04210b' },
  stepLabel: { fontSize: 11.5, fontWeight: 700, marginLeft: 7, letterSpacing: '-0.01em', whiteSpace: 'nowrap' },
  stepLine: { flex: 1, height: 2, borderRadius: 2, margin: '0 8px', minWidth: 12 },

  card: { position: 'relative', background: '#0d1512', borderRadius: 20, padding: 20, marginBottom: 15, border: '1px solid #17251f', boxShadow: '0 8px 30px -20px rgba(0,0,0,0.7)' },
  stepHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepNum: { width: 27, height: 27, borderRadius: 9, background: '#16241e', border: '1px solid #223731', color: '#8aa79c', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumDone: { background: `linear-gradient(155deg,${AC},${AC2})`, border: `1px solid ${AC}`, color: '#04210b' },
  stepTitle: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.2px', color: '#f4f6f5' },
  label: { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: '#7d8a84', marginBottom: 7 },
  input: { width: '100%', padding: '14px 15px', borderRadius: 13, border: '1px solid #1f3a31', outline: 'none', fontSize: 16, fontWeight: 500, background: '#0a1210', color: '#f4f6f5' },
  hint: { fontSize: 11.5, color: '#7d8a84', marginTop: 9, lineHeight: 1.5 },
  qrisFrame: { padding: 13, background: '#fff', borderRadius: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,0.6)' },
  qrisBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: AC, background: 'rgba(16,185,129,0.12)', border: `1px solid ${AC}44`, borderRadius: 11, padding: '9px 16px', cursor: 'pointer' },
  payHead: { fontSize: 10, fontWeight: 700, color: '#7d8a84', textAlign: 'center', letterSpacing: '0.06em', margin: '16px 0 10px' },
  upload: { width: '100%', padding: '26px 0', borderRadius: 16, border: `1.5px dashed ${AC}55`, background: 'rgba(16,185,129,0.05)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  uploadIcon: { width: 46, height: 46, borderRadius: 14, background: 'rgba(16,185,129,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  removeBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  submit: { width: '100%', padding: '17px 0', borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 800, color: '#04210b', background: `linear-gradient(155deg,${AC},${AC2})`, boxShadow: `0 12px 26px -14px ${AC}66`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '-0.2px' },
  foot: { fontSize: 11.5, color: '#7d8a84', textAlign: 'center', marginTop: 14, lineHeight: 1.55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  doneBadge: { width: 70, height: 70, borderRadius: '50%', background: `linear-gradient(155deg,${AC},${AC2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 14px 30px -14px ${AC}66` },
  doneNote: { marginTop: 18, padding: '13px 15px', borderRadius: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', maxWidth: 360, marginInline: 'auto' },
};
