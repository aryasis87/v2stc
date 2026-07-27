// lib/engine/stockityRest.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — akses REST Stockity dari PERANGKAT (candle & profil).
//
// Mode Fastrade/CTC, Indicator, dan Momentum butuh data candle:
//   GET https://api.stockity1.id/candles/v1/{symbol}/{date}/5
// Di server dipanggil lewat curl; di perangkat dipakai CapacitorHttp
// (HTTP native Android) sehingga BEBAS CORS dan bisa mengirim header
// `authorization-token` — sama seperti kebutuhan WebSocket.
//
// Di browser murni request ini akan gagal (CORS) — konsisten dengan
// kebijakan v4: eksekusi hanya di APK.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorHttp } from '@capacitor/core';

const BASE_URL = 'https://api.stockity1.id';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface Candle {
  timestamp: number; // detik
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StockityRestOptions {
  authToken: string;
  deviceId: string;
  deviceType?: string;
}

function headers(o: StockityRestOptions): Record<string, string> {
  return {
    'device-id':           o.deviceId,
    'device-type':         o.deviceType ?? 'web',
    'user-timezone':       'Asia/Jakarta',
    'authorization-token': o.authToken,
    'User-Agent':          DEFAULT_UA,
    'Accept':              'application/json, text/plain, */*',
    'Origin':              'https://stockity1.id',
    'Referer':             'https://stockity1.id/',
    'Cache-Control':       'no-cache, no-store, must-revalidate',
    'Pragma':              'no-cache',
  };
}

/**
 * Ambil candle 5 detik untuk jam berjalan (bentuk respons sama dengan
 * yang dipakai engine server) lalu normalkan ke {timestamp,o,h,l,c}.
 */
/** Sebab kegagalan candle terakhir — dipakai engine agar alasannya terlihat user */
export let lastCandleError: string | null = null;

export async function fetchCandles5s(
  symbol: string, opts: StockityRestOptions,
): Promise<Candle[]> {
  const encodedSymbol = symbol.replace('/', '%2F');
  const dateForApi = new Date().toISOString().slice(0, 13) + ':00:00';
  const url = `${BASE_URL}/candles/v1/${encodedSymbol}/${dateForApi}/5`;

  try {
    const res = await CapacitorHttp.get({ url, headers: headers(opts), readTimeout: 8000, connectTimeout: 8000 });
    const raw = (res?.data as any)?.data;
    if (!Array.isArray(raw)) {
      lastCandleError = `Stockity menolak data candle (HTTP ${res?.status ?? '?'})`;
      return [];
    }
    lastCandleError = null;
    return raw.map(parseCandle).filter((c): c is Candle => c !== null);
  } catch (e) {
    lastCandleError = `Tidak dapat mengambil candle: ${(e as Error)?.message ?? 'koneksi gagal'}`;
    return [];
  }
}

/** Bentuk data candle Stockity: array [ts, open, high, low, close] atau objek */
function parseCandle(d: any): Candle | null {
  try {
    if (Array.isArray(d) && d.length >= 5) {
      return {
        timestamp: Number(d[0]),
        open:  Number(d[1]),
        high:  Number(d[2]),
        low:   Number(d[3]),
        close: Number(d[4]),
      };
    }
    if (d && typeof d === 'object') {
      // Stockity mengirim `created_at` berupa teks waktu — bukan angka.
      // Tanpa ini seluruh candle dibuang dan mode FTT/CTC/Indicator/Momentum
      // tak pernah dapat harga, sehingga siklusnya berputar tanpa entry.
      const rawTs = d.timestamp ?? d.time ?? d.t ?? d.created_at ?? d.from;
      const ts = typeof rawTs === 'string' && !/^\d+$/.test(rawTs)
        ? Date.parse(rawTs)
        : Number(rawTs);
      const open  = Number(d.open  ?? d.o);
      const high  = Number(d.high  ?? d.h);
      const low   = Number(d.low   ?? d.l);
      const close = Number(d.close ?? d.c);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) return null;
      return {
        timestamp: ts,
        open:  Number.isFinite(open)  ? open  : close,
        high:  Number.isFinite(high)  ? high  : close,
        low:   Number.isFinite(low)   ? low   : close,
        close,
      };
    }
    return null;
  } catch { return null; }
}

/**
 * Gabungkan candle 5 detik menjadi candle 1 menit (dipakai Momentum &
 * Indicator yang menganalisis timeframe menit).
 */
export function aggregateToMinutes(candles5s: Candle[]): Candle[] {
  const buckets = new Map<number, Candle[]>();
  for (const c of candles5s) {
    const minute = Math.floor(c.timestamp / 60) * 60;
    const arr = buckets.get(minute);
    if (arr) arr.push(c); else buckets.set(minute, [c]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([minute, group]) => {
      const sorted = group.sort((a, b) => a.timestamp - b.timestamp);
      return {
        timestamp: minute,
        open:  sorted[0].open,
        high:  Math.max(...sorted.map(c => c.high)),
        low:   Math.min(...sorted.map(c => c.low)),
        close: sorted[sorted.length - 1].close,
      };
    });
}
