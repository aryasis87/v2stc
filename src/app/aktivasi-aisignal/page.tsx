'use client';
// app/aktivasi-real/page.tsx
// Portal publik aktivasi Mode REAL — STC AutoTrade. Desain modern gelap
// (Apple-like dark): permukaan gelap lembut, aksen emerald, elemen trust.

import { useState, useRef } from 'react';
import { Upload, Check, Loader2, Radio, X, Lock, BadgeCheck, Download } from 'lucide-react';
import { saveQris } from '@/lib/saveQris';

const PRICE = 'Rp 50.000';
const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const AC = '#10b981';

// Metode pembayaran didukung QRIS — badge brand-warna (bukan logo resmi).
const PAYMENTS: { name: string; color: string; type: 'ewallet' | 'bank' }[] = [
  { name: 'DANA', color: '#118EEA', type: 'ewallet' },
  { name: 'OVO', color: '#4C2A86', type: 'ewallet' },
  { name: 'GoPay', color: '#0093C4', type: 'ewallet' },
  { name: 'ShopeePay', color: '#EE4D2D', type: 'ewallet' },
  { name: 'BCA', color: '#0060AF', type: 'bank' },
  { name: 'Mandiri', color: '#003D79', type: 'bank' },
  { name: 'BRI', color: '#00529C', type: 'bank' },
  { name: 'BNI', color: '#EE7203', type: 'bank' },
];

// Menampilkan logo pembayaran asli dari /public/pay/<nama>.png (mis. /pay/dana.png).
// Jika berkas logo belum ada, jatuh ke chip berwarna (ikon + nama) sebagai fallback.
function PayLogo({ p }: { p: (typeof PAYMENTS)[number] }) {
  const [err, setErr] = useState(false);
  if (err) {
    // Fallback (belum ada file logo): kartu putih dengan nama brand di warna khasnya.
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 36, minWidth: 64, padding: '0 13px', background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px -2px rgba(0,0,0,0.4)' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: p.color, letterSpacing: '-0.01em' }}>{p.name}</span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 36, minWidth: 66, padding: '0 12px', background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px -2px rgba(0,0,0,0.4)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/pay/${p.name.toLowerCase()}.svg`} alt={p.name} onError={() => setErr(true)} style={{ height: 22, width: 'auto', maxWidth: 84, objectFit: 'contain', display: 'block' }} />
    </span>
  );
}

export default function AktivasiAiSignalPage() {
  const [name, setName] = useState('');
  const [sid, setSid] = useState('');
  const [proof, setProof] = useState('');
  const [proofName, setProofName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr('Ukuran gambar maksimal 5MB.'); return; }
    const r = new FileReader();
    r.onload = () => { setProof(String(r.result)); setProofName(f.name); setErr(''); };
    r.readAsDataURL(f);
  };

  const valid = name.trim().length >= 2 && sid.trim().length >= 3 && !!proof;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${API}/api/v1/activation/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'stc', feature: 'aisignal', name: name.trim(), stockityId: sid.trim(), proof }),
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
          <div style={{ ...sx.card, textAlign: 'center', padding: '44px 26px' }}>
            <div style={sx.doneBadge}><Check style={{ width: 34, height: 34, color: '#04210b' }} /></div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.4px', color: '#f4f6f5' }}>Pengajuan Terkirim</h1>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#9aa6a1', maxWidth: 360, margin: '0 auto' }}>
              Pengajuan kamu <b style={{ color: '#f4f6f5' }}>sedang diproses</b>, mohon menunggu. Pembayaran diverifikasi admin dan <b style={{ color: '#f4f6f5' }}>AI Signal</b> akan aktif pada akun <b style={{ color: AC }}>{sid}</b> biasanya dalam ~10 menit.
            </p>
            <div style={{ marginTop: 18, padding: '13px 15px', borderRadius: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', maxWidth: 360, marginInline: 'auto' }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#c4cec9', margin: 0 }}>Belum ada respons setelah <b style={{ color: '#f4f6f5' }}>12 jam</b>? Laporkan ke kami:</p>
              <a href="mailto:supportstockity@gmail.com?subject=Aktivasi%20AI%20Signal%20belum%20diproses" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: AC, textDecoration: 'none' }}>✉️ supportstockity@gmail.com</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={sx.page}>
      <div style={sx.wrap}>
        {/* hero */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={sx.heroIcon}><Radio style={{ width: 28, height: 28, color: '#04210b' }} /></div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.12, color: '#f4f6f5' }}>Aktivasi Mode AI Signal</h1>
          <p style={{ fontSize: 14.5, color: '#9aa6a1', marginTop: 8, lineHeight: 1.55, maxWidth: 380, marginInline: 'auto' }}>
            Buka mode AI Signal di STC AutoTrade. Langganan <b style={{ color: AC }}>{PRICE} / bulan</b>.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <span style={sx.trustChip}><BadgeCheck style={{ width: 13, height: 13, color: AC }} />Aktif otomatis</span>
            <span style={sx.trustChip}><Lock style={{ width: 12, height: 12, color: AC }} />Pembayaran aman</span>
            <span style={sx.trustChip}><Check style={{ width: 13, height: 13, color: AC }} />Verifikasi ~10 menit</span>
          </div>
        </div>

        <div style={sx.note}>
          <BadgeCheck style={{ width: 18, height: 18, color: AC, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#c4cec9' }}>
            Setelah pembayaran diverifikasi, mode <b style={{ color: '#f4f6f5' }}>AI Signal</b> otomatis terbuka di akun kamu — tinggal pilih mode AI Signal di aplikasi. Langganan berlaku per bulan.
          </p>
        </div>

        <div style={sx.card}>
          <div style={sx.stepHead}><span style={sx.stepNum}>1</span><span style={sx.stepTitle}>Data Kamu</span></div>
          <label style={sx.label}>NAMA LENGKAP</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama sesuai identitas" className="aktv-in" style={sx.input} />
          <label style={{ ...sx.label, marginTop: 14 }}>ID AKUN STOCKITY</label>
          <input value={sid} onChange={e => setSid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="mis. 183xxxxxx" className="aktv-in" style={sx.input} />
        </div>

        <div style={sx.card}>
          <div style={sx.stepHead}><span style={sx.stepNum}>2</span><span style={sx.stepTitle}>Bayar {PRICE} / bulan</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={sx.qrisFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/qr-pembayaran-terbaru.jpeg" alt="QRIS" style={{ width: 232, maxWidth: '66vw', height: 'auto', display: 'block', borderRadius: 10 }} />
            </div>
            <button type="button" onClick={() => saveQris('/qr-pembayaran-terbaru.jpeg', 'QRIS-StcAutoTrade.jpg')} className="aktv-tap" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: AC, background: 'rgba(16,185,129,0.12)', border: `1px solid ${AC}44`, borderRadius: 10, padding: '9px 16px', textDecoration: 'none', cursor: 'pointer' }}>
              <Download style={{ width: 15, height: 15 }} /> Unduh QRIS
            </button>
            <p style={{ fontSize: 12.5, color: '#9aa6a1', textAlign: 'center', lineHeight: 1.55 }}>Scan atau unduh <b style={{ color: '#f4f6f5' }}>QRIS</b>, bayar tepat <b style={{ color: AC }}>{PRICE}</b>, simpan buktinya.</p>
          </div>
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: '#7d8a84', textAlign: 'center', letterSpacing: '0.06em', margin: '14px 0 10px' }}>DIDUKUNG SEMUA E-WALLET &amp; BANK VIA QRIS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {PAYMENTS.map(p => <PayLogo key={p.name} p={p} />)}
            </div>
          </div>
        </div>

        <div style={sx.card}>
          <div style={sx.stepHead}><span style={sx.stepNum}>3</span><span style={sx.stepTitle}>Unggah Bukti Bayar</span></div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0] ?? null)} />
          {proof ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="bukti" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 14, border: '1px solid #1f3a31', background: '#0c1512' }} />
              <button onClick={() => { setProof(''); setProofName(''); }} style={sx.removeBtn}><X style={{ width: 16, height: 16, color: '#fff' }} /></button>
              <p style={{ fontSize: 11.5, color: '#7d8a84', marginTop: 7 }}>{proofName}</p>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="aktv-tap" style={sx.upload}>
              <Upload style={{ width: 24, height: 24, color: AC }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#c4cec9' }}>Pilih gambar bukti bayar</span>
              <span style={{ fontSize: 11.5, color: '#7d8a84' }}>JPG / PNG · maks 5MB</span>
            </button>
          )}
        </div>

        {err && <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center', marginBottom: 12 }}>{err}</p>}

        <button onClick={submit} disabled={!valid || busy} className="aktv-btn" style={{ ...sx.submit, opacity: valid && !busy ? 1 : 0.5, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />Mengirim…</> : <>Kirim Pengajuan Aktivasi</>}
        </button>
        <p style={{ fontSize: 11.5, color: '#7d8a84', textAlign: 'center', marginTop: 14, lineHeight: 1.55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Lock style={{ width: 12, height: 12 }} /> Data diverifikasi admin · admin online 24 jam · verifikasi rata-rata ~10 menit
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
  page: { minHeight: '100%', background: '#070a09', color: '#f4f6f5', padding: '28px 16px 48px', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif' },
  wrap: { maxWidth: 460, margin: '0 auto' },
  card: { background: '#0d1512', borderRadius: 22, padding: 20, marginBottom: 16, border: '1px solid #17251f', boxShadow: '0 8px 30px -18px rgba(0,0,0,0.6)' },
  heroIcon: { width: 60, height: 60, borderRadius: 20, background: `linear-gradient(160deg,${AC},#34d399)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: `0 8px 20px -10px ${AC}35` },
  trustChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#c4cec9', background: '#0d1512', border: '1px solid #1c2b24', borderRadius: 99, padding: '6px 11px' },
  note: { display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', marginBottom: 16 },
  stepHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepNum: { width: 26, height: 26, borderRadius: 9, background: AC, color: '#04210b', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepTitle: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.2px', color: '#f4f6f5' },
  label: { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: '#7d8a84', marginBottom: 7 },
  input: { width: '100%', padding: '14px 15px', borderRadius: 13, border: '1px solid #1f3a31', outline: 'none', fontSize: 15.5, fontWeight: 500, background: '#0a1210', color: '#f4f6f5' },
  qrisFrame: { padding: 14, background: '#fff', borderRadius: 18 },
  upload: { width: '100%', padding: '30px 0', borderRadius: 16, border: `1.5px dashed ${AC}55`, background: 'rgba(16,185,129,0.05)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 },
  removeBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  submit: { width: '100%', padding: '17px 0', borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 800, color: '#04210b', background: `linear-gradient(160deg,${AC},#34d399)`, boxShadow: `0 8px 20px -12px ${AC}44`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '-0.2px' },
  doneBadge: { width: 68, height: 68, borderRadius: '50%', background: `linear-gradient(160deg,${AC},#34d399)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 10px 26px -14px ${AC}44` },
};
