'use client';
// app/aktivasi-real/page.tsx
// Portal publik aktivasi Mode REAL — STC AutoTrade.
// Brand emerald, layout satu-alur bernomor. Submit → backend → Telegram admin.

import { useState, useRef } from 'react';
import { Upload, Check, Loader2, ShieldCheck, X } from 'lucide-react';

const PRICE = 'Rp 180.000';
const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const AC = '#10b981';

export default function AktivasiRealPage() {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'stc', name: name.trim(), stockityId: sid.trim(), proof }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Gagal mengirim. Coba lagi.');
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || 'Gagal mengirim. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={sx.page}>
        <div style={sx.wrap}>
          <div style={{ ...sx.panel, textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <Check style={{ width: 32, height: 32, color: '#04210b' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#eaf2ee' }}>Pengajuan Terkirim</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#9fb3aa', maxWidth: 360, margin: '0 auto' }}>
              Pembayaranmu akan diverifikasi. Mode <b style={{ color: '#eaf2ee' }}>REAL</b> diaktifkan pada akun Stockity <b style={{ color: AC }}>{sid}</b> paling lambat 1×24 jam.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={sx.page}>
      <div style={sx.wrap}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: AC }}>STC · AUTOTRADE</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
            <ShieldCheck style={{ width: 24, height: 24, color: AC }} />
            <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.5px', color: '#eaf2ee' }}>Aktivasi Mode REAL</h1>
          </div>
          <p style={{ fontSize: 13.5, color: '#9fb3aa', marginTop: 8, lineHeight: 1.6 }}>
            Buka trading akun REAL. Biaya aktivasi sekali bayar <b style={{ color: AC }}>{PRICE}</b>.
          </p>
        </div>

        <div style={sx.panel}>
          {/* langkah 1 */}
          <div style={sx.stepRow}><span style={sx.num}>1</span><span style={sx.stepTitle}>Data Kamu</span></div>
          <label style={sx.label}>NAMA LENGKAP</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama sesuai identitas" style={sx.input} />
          <label style={{ ...sx.label, marginTop: 14 }}>ID AKUN STOCKITY</label>
          <input value={sid} onChange={e => setSid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="mis. 183xxxxxx" style={sx.input} />

          <div style={sx.divider} />

          {/* langkah 2 */}
          <div style={sx.stepRow}><span style={sx.num}>2</span><span style={sx.stepTitle}>Bayar {PRICE} · QRIS</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 12, background: '#fff', borderRadius: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/qris-aktivasi.jpg" alt="QRIS" style={{ width: 230, maxWidth: '68vw', height: 'auto', display: 'block', borderRadius: 8 }} />
            </div>
            <p style={{ fontSize: 12.5, color: '#9fb3aa', textAlign: 'center', lineHeight: 1.55 }}>Scan dengan bank/e-wallet, bayar tepat <b style={{ color: AC }}>{PRICE}</b>, simpan buktinya.</p>
          </div>

          <div style={sx.divider} />

          {/* langkah 3 */}
          <div style={sx.stepRow}><span style={sx.num}>3</span><span style={sx.stepTitle}>Unggah Bukti Bayar</span></div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0] ?? null)} />
          {proof ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="bukti" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, border: '1px solid #23433a', background: '#0d1512' }} />
              <button onClick={() => { setProof(''); setProofName(''); }} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 16, height: 16, color: '#fff' }} />
              </button>
              <p style={{ fontSize: 11.5, color: '#8fa89f', marginTop: 6 }}>{proofName}</p>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '26px 0', borderRadius: 12, border: `1.5px dashed ${AC}66`, background: 'rgba(16,185,129,0.06)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Upload style={{ width: 24, height: 24, color: AC }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#cfe0d8' }}>Pilih gambar bukti bayar</span>
              <span style={{ fontSize: 11, color: '#7d9389' }}>JPG / PNG · maks 5MB</span>
            </button>
          )}

          {err && <p style={{ fontSize: 12.5, color: '#f87171', textAlign: 'center', marginTop: 14 }}>{err}</p>}

          <button onClick={submit} disabled={!valid || busy} style={{ ...sx.submit, opacity: valid && !busy ? 1 : 0.5, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />MENGIRIM…</> : <>KIRIM PENGAJUAN</>}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#7d9389', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>Data diverifikasi admin untuk aktivasi. Diproses maksimal 1×24 jam.</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const sx: Record<string, React.CSSProperties> = {
  page: { minHeight: '100%', background: '#080b0a', color: '#eaf2ee', padding: '24px 16px 44px', overflowY: 'auto' },
  wrap: { maxWidth: 460, margin: '0 auto' },
  panel: { background: '#0d1512', border: '1px solid #1c332b', borderRadius: 18, padding: 20, marginBottom: 6 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  num: { width: 24, height: 24, borderRadius: 7, background: 'rgba(16,185,129,0.14)', border: `1px solid ${AC}55`, color: AC, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepTitle: { fontSize: 14, fontWeight: 700, color: '#eaf2ee' },
  label: { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: '#7d9389', marginBottom: 6 },
  input: { width: '100%', padding: '13px 14px', borderRadius: 11, border: '1px solid #23433a', outline: 'none', fontSize: 15, fontWeight: 500, background: '#0a110e', color: '#eaf2ee' },
  divider: { height: 1, background: '#1c332b', margin: '18px 0' },
  submit: { width: '100%', marginTop: 18, padding: '15px 0', borderRadius: 12, border: 'none', fontSize: 14.5, fontWeight: 800, letterSpacing: '0.03em', color: '#04210b', background: AC, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
};
