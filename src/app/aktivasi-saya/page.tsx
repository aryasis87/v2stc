'use client';
// Halaman "Aktivasi Saya" — ringkasan pembelian/langganan fitur yang sudah aktif
// untuk AKUN INI. Dibuka dari tombol Aktivasi di halaman Profil.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storage, SESSION_KEYS } from '@/lib/storage';
import { getRealAccessAt } from '@/lib/realAccess';
import { getAiSignalEntry } from '@/lib/aiSignalAccess';
import { getBlitz5sEntry } from '@/lib/blitz5sAccess';
import { getFastReversalEntry } from '@/lib/fastReversalAccess';
import { getAgentAlphaEntry } from '@/lib/agentAlphaAccess';

interface Item {
  key: string; label: string; emoji: string; accent: string;
  active: boolean; sejak: number | null; sampai: number | null;
}

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const sisaHari = (ms: number | null) =>
  ms ? Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000)) : null;

export default function AktivasiSayaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const uid = await storage.get(SESSION_KEYS.USER_ID);
        if (!uid) { if (!batal) setLoading(false); return; }
        const [real, ai, b5, fr, aa] = await Promise.all([
          getRealAccessAt(uid), getAiSignalEntry(uid), getBlitz5sEntry(uid),
          getFastReversalEntry(uid), getAgentAlphaEntry(uid),
        ]);
        if (batal) return;
        setItems([
          { key: 'real', label: 'Mode REAL', emoji: '💵', accent: '#2DD4A7', active: !!real, sejak: real, sampai: null },
          { key: 'aisignal', label: 'AI Signal', emoji: '📡', accent: '#4ADE80', active: !!ai, sejak: ai?.sejak ?? null, sampai: ai?.sampai ?? null },
          { key: 'blitz5s', label: '5st · Blitz 5 Detik', emoji: '⚡', accent: '#FBBF24', active: !!b5, sejak: b5?.sejak ?? null, sampai: b5?.sampai ?? null },
          { key: 'fastreversal', label: 'Fast Reversal', emoji: '🔄', accent: '#FB7185', active: !!fr, sejak: fr?.sejak ?? null, sampai: fr?.sampai ?? null },
          { key: 'agentalpha', label: 'Agent Alpha', emoji: '🤖', accent: '#8B5CF6', active: !!aa, sejak: aa?.sejak ?? null, sampai: aa?.sampai ?? null },
        ]);
      } catch { /* diamkan */ }
      if (!batal) setLoading(false);
    })();
    return () => { batal = true; };
  }, []);

  const aktif = items.filter((i) => i.active);

  return (
    <div style={{ minHeight: '100%', background: 'var(--surface)', color: 'var(--text-1)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
      }}>
        <button onClick={() => router.push('/profile')} aria-label="Kembali" style={{
          width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--press)', border: '1px solid var(--hairline)', cursor: 'pointer', color: 'var(--text-1)', flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>Aktivasi Saya</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Ringkasan fitur & langganan aktif</div>
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 560, margin: '0 auto' }}>
        {!loading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, marginBottom: 14,
            background: 'var(--press)', border: '1px solid var(--hairline)',
          }}>
            <span style={{ fontSize: 22 }}>🎫</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{aktif.length} fitur aktif</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Pembelian/langganan yang sudah teraktivasi di akun ini.</div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Memuat…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => {
              const sisa = sisaHari(it.sampai);
              return (
                <div key={it.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14,
                  background: 'var(--press)', border: `1px solid ${it.active ? it.accent + '55' : 'var(--hairline)'}`,
                  opacity: it.active ? 1 : 0.6,
                }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, background: it.accent + '1e', border: `1px solid ${it.accent}30`,
                  }}>{it.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{it.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      {!it.active ? 'Belum aktif' : it.sampai == null
                        ? `Aktif · selamanya${it.sejak ? ` · sejak ${fmt(it.sejak)}` : ''}`
                        : `Aktif · s/d ${fmt(it.sampai)}${sisa != null ? ` (${sisa} hari lagi)` : ''}`}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 9px', borderRadius: 99, flexShrink: 0,
                    color: it.active ? '#fff' : 'var(--text-3)',
                    background: it.active ? it.accent : 'var(--hairline)',
                  }}>{it.active ? 'AKTIF' : 'OFF'}</span>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.6 }}>
          Aktivasi diproses otomatis setelah pembayaran diverifikasi. Perlu perpanjangan atau aktivasi fitur lain?
          Hubungi admin/reseller kamu.
        </p>
      </div>
    </div>
  );
}
