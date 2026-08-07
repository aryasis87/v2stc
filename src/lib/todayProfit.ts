// lib/todayProfit.ts
// ─────────────────────────────────────────────────────────────────────
// SUMBER TUNGGAL perhitungan "keuntungan hari ini".
//
// Masalah sebelumnya — angka di Dashboard dan di halaman Riwayat berbeda:
//   • Dashboard menjumlah catatan mode (mode_logs Supabase) saja, sehingga
//     transaksi yang tidak lewat bot (mis. trading manual di Stockity, atau
//     catatan perangkat yang hilang) tidak ikut terhitung.
//   • Batas "hari" memakai tengah malam WAKTU PERANGKAT, padahal Stockity
//     memotong hari memakai zona waktu akun. Beda zona → beda isi hari.
//   • Halaman Riwayat malah memakai rentang 24 jam terakhir (bergulir), bukan
//     sejak tengah malam, dan totalnya dihitung dari SELURUH log (mengabaikan
//     filter tanggal yang sedang dipilih).
//
// Sekarang keduanya memakai modul ini: transaksi diambil dari SERVER STOCKITY
// (sumber kebenaran, mencakup semua transaksi akun) dan hari dipotong memakai
// zona waktu akun yang sama dengan yang dikirim aplikasi ke Stockity.
// ─────────────────────────────────────────────────────────────────────

import { storage, SESSION_KEYS } from './storage';
import { getDealsHistory } from './engine/stockityAccount';

/**
 * Zona waktu yang dipakai Stockity untuk memotong hari.
 * Nilai ini HARUS sama dengan header `user-timezone` yang dikirim aplikasi
 * (lihat engine/stockityAccount.ts & engine/stockityRest.ts) — kalau berbeda,
 * batas harinya ikut bergeser dan angkanya tidak akan pernah cocok.
 */
export const STOCKITY_TZ_FALLBACK = 'Asia/Jakarta';

/** Zona waktu akun (dari sesi); jatuh ke bawaan bila belum tersimpan. */
export async function getAccountTimezone(): Promise<string> {
  try {
    const tz = await storage.get(SESSION_KEYS.USER_TIMEZONE);
    if (tz && typeof tz === 'string' && tz.includes('/')) return tz;
  } catch { /* pakai bawaan */ }
  return STOCKITY_TZ_FALLBACK;
}

/** Selisih (ms) antara waktu dinding zona `tz` dan UTC pada saat `at`. */
function tzOffsetMs(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = dtf.formatToParts(at);
    const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
    const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
    return asUtc - at.getTime();
  } catch {
    return 0; // zona tak dikenal → perlakukan sebagai UTC
  }
}

/** Epoch ms tengah malam HARI INI menurut zona `tz`. */
export function startOfDayInTz(tz: string, now: Date = new Date()): number {
  const off = tzOffsetMs(tz, now);
  const wall = new Date(now.getTime() + off); // waktu dinding, dibaca sbg UTC
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return midnightWall - off;
}

/** Label tanggal (YYYY-MM-DD) menurut zona `tz`. */
export function todayLabelInTz(tz: string, now: Date = new Date()): string {
  const off = tzOffsetMs(tz, now);
  return new Date(now.getTime() + off).toISOString().slice(0, 10);
}

// ── Pembacaan transaksi Stockity ──────────────────────────────────────────

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
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface DealSummary {
  totalPnL: number;      // dalam satuan terkecil (×100), sama dgn catatan engine
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  winRate: number;
}

/** Ringkas transaksi Stockity yang SELESAI sejak `sinceMs`. */
export function summarizeDeals(deals: any[], sinceMs: number): DealSummary {
  let totalPnL = 0, wins = 0, losses = 0, draws = 0, n = 0;

  for (const d of deals) {
    // Pakai waktu TUTUP bila ada — hasilnya baru masuk hari itu saat ditutup.
    const at = toMillis(pick(d, 'closed_at', 'close_time', 'finished_at', 'expired_at')
                     ?? pick(d, 'created_at', 'opened_at', 'open_time'));
    if (!at || at < sinceMs) continue;

    const amount = Number(pick(d, 'amount', 'bet_amount', 'investment') ?? 0);
    const payout = Number(pick(d, 'payout', 'win_amount', 'profit') ?? 0);
    const status = String(pick(d, 'status', 'result', 'outcome') ?? '').toLowerCase();

    // Transaksi yang masih terbuka belum boleh dihitung
    const open = status.includes('open') || status.includes('active') || status === 'pending';
    if (open) continue;

    n++;
    if (payout > amount || status.includes('win')) { wins++; totalPnL += payout - amount; }
    else if (payout === amount || status.includes('draw') || status.includes('stand') || status.includes('tie')) { draws++; }
    else { losses++; totalPnL -= amount; }
  }

  return {
    totalPnL, totalTrades: n, totalWins: wins, totalLosses: losses, totalDraws: draws,
    winRate: n > 0 ? Math.round((wins / n) * 100) : 0,
  };
}

/**
 * Keuntungan hari ini menurut SERVER STOCKITY (semua transaksi akun, termasuk
 * yang tidak lewat bot). `null` bila sesi/riwayat tidak bisa diambil — pemanggil
 * boleh jatuh ke perhitungan dari catatan mode.
 */
export async function fetchTodayProfitFromStockity(
  accountType: 'demo' | 'real' | 'both' = 'real',
): Promise<(DealSummary & { date: string; timezone: string }) | null> {
  try {
    const authToken =
      (await storage.get('stc_stockity_token')) ?? (await storage.get(SESSION_KEYS.AUTHTOKEN));
    const deviceId = (await storage.get(SESSION_KEYS.DEVICE_ID)) ?? '';
    if (!authToken) return null;

    const auth = { authToken, deviceId, deviceType: 'web' } as any;
    const tz = await getAccountTimezone();
    const since = startOfDayInTz(tz);

    const wanted: ('demo' | 'real')[] =
      accountType === 'both' ? ['demo', 'real'] : [accountType];
    const lists = await Promise.all(wanted.map((t) => getDealsHistory(auth, t).catch(() => [])));
    const deals = lists.flat();
    if (!deals.length) {
      return { ...summarizeDeals([], since), date: todayLabelInTz(tz), timezone: tz };
    }
    return { ...summarizeDeals(deals, since), date: todayLabelInTz(tz), timezone: tz };
  } catch {
    return null;
  }
}
