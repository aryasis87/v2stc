// lib/engine/stockityHistory.ts
// ─────────────────────────────────────────────────────────────────────
// v4 — Riwayat dari server Stockity sebagai sumber kebenaran.
//
// Catatan yang dibuat engine perangkat bisa hilang (aplikasi ditutup di
// tengah order, penulisan ke server gagal, HP ganti). Stockity sendiri
// selalu menyimpan setiap transaksi akun. Jadi riwayat ditarik dari sana,
// dicocokkan dengan catatan perangkat untuk tahu modenya, lalu disimpan ke
// Supabase agar riwayatnya tetap ada meski aplikasi dipasang ulang.
// ─────────────────────────────────────────────────────────────────────

import { storage, SESSION_KEYS } from '../storage';
import { getDealsHistory } from './stockityAccount';
import { readLocalLogs, appendLog } from './sessionStore';

/** Jeda minimum antar penarikan — halaman Riwayat memanggil tiap tab dibuka */
const SYNC_INTERVAL_MS = 60_000;
let lastSyncAt = 0;
let inFlight: Promise<any[]> | null = null;

function pick(d: any, ...keys: string[]): any {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, part) => (o == null ? o : o[part]), d);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function toMillis(v: any): number {
  if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
  const parsed = Date.parse(String(v ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Ubah satu transaksi Stockity menjadi bentuk log yang dipakai halaman Riwayat */
function dealToLog(d: any, isDemo: boolean, byDealId: Map<string, any>, fallbackMode: string): any {
  const dealId = String(pick(d, 'id', 'deal_id', 'trade_id', 'uuid') ?? '');
  const known  = byDealId.get(dealId);

  const amountRaw = Number(pick(d, 'amount', 'bet_amount', 'investment') ?? 0);
  const payout    = Number(pick(d, 'payout', 'win_amount', 'profit') ?? 0);
  const closed    = pick(d, 'closed_at', 'close_time', 'expired_at', 'finished_at');
  const status    = String(pick(d, 'status', 'result', 'outcome') ?? '').toLowerCase();

  // Stockity mengirim nominal dalam satuan terkecil (×100), sama seperti saat
  // order dikirim — dibiarkan apa adanya agar sebangun dengan catatan engine.
  const profit = payout > 0 ? payout - amountRaw : -amountRaw;
  const result =
    known?.result ??
    (status.includes('win') || payout > amountRaw ? 'WIN'
      : status.includes('draw') || payout === amountRaw ? 'DRAW'
      : payout > 0 || status.includes('lose') || status.includes('loss') ? 'LOSE'
      : undefined);

  return {
    ...(known ?? {}),
    id:        known?.id ?? `sty_${dealId}`,
    orderId:   known?.orderId ?? dealId,
    dealId,
    trend:     known?.trend ?? String(pick(d, 'trend', 'direction', 'type') ?? '').toLowerCase(),
    ric:       known?.ric ?? pick(d, 'asset', 'ric', 'symbol', 'asset_ric'),
    amount:    known?.amount ?? amountRaw,
    result,
    profit:    known?.profit ?? profit,
    executedAt: known?.executedAt ?? toMillis(pick(d, 'created_at', 'opened_at', 'open_time') ?? closed),
    isDemoAccount: known?.isDemoAccount ?? isDemo,
    // Mode diambil dari catatan perangkat bila transaksinya dikenali; bila
    // tidak (mis. trading manual di aplikasi Stockity), ditandai terpisah.
    mode:      known?.mode ?? fallbackMode,
    source:    'stockity',
  };
}

/**
 * Tarik riwayat akun dari Stockity, cocokkan dengan catatan perangkat, lalu
 * simpan ke Supabase. Aman dipanggil berkali-kali — ada jeda antar penarikan.
 */
export async function syncStockityHistory(force = false): Promise<any[]> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return [];

  inFlight = (async () => {
    try {
      const authToken =
        (await storage.get('stc_stockity_token')) ?? (await storage.get(SESSION_KEYS.AUTHTOKEN));
      const deviceId = (await storage.get(SESSION_KEYS.DEVICE_ID)) ?? '';
      if (!authToken) return [];

      const auth = { authToken, deviceId, deviceType: 'web' } as any;
      const [demo, real] = await Promise.all([
        getDealsHistory(auth, 'demo').catch(() => []),
        getDealsHistory(auth, 'real').catch(() => []),
      ]);

      const local = await readLocalLogs();
      const byDealId = new Map<string, any>();
      for (const l of local) if (l?.dealId) byDealId.set(String(l.dealId), l);

      // Transaksi yang tak cocok dengan catatan perangkat (mis. catatan hilang)
      // tetap perlu tampil — ditaruh pada mode yang terakhir dijalankan.
      const fallbackMode = (await storage.get('stc_last_mode')) || 'schedule';
      const logs = [
        ...demo.map(d => dealToLog(d, true, byDealId, fallbackMode)),
        ...real.map(d => dealToLog(d, false, byDealId, fallbackMode)),
      ].filter(l => l.dealId);

      // Ditulis lewat jalur yang sama dengan log engine: masuk ke Supabase
      // sekaligus tercermin di perangkat.
      for (const l of logs) appendLog(l);

      lastSyncAt = Date.now();
      return logs;
    } catch {
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
