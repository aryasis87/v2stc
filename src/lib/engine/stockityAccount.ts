// lib/engine/stockityAccount.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase C — DATA AKUN LANGSUNG DARI PERANGKAT (pengganti /profile/* VPS).
//
// Semua request memakai CapacitorHttp (native, bebas CORS) dengan header
// autentikasi Stockity — sama seperti yang dilakukan VPS, hanya saja dari
// koneksi user sendiri.
//
// Catatan geo: daftar `currencies` di Stockity DIFILTER berdasarkan IP.
// Dulu VPS harus memakai proxy residensial agar IDR muncul; dari perangkat
// user di Indonesia hasilnya benar tanpa proxy sama sekali.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorHttp } from '@capacitor/core';

const BASE = 'https://api.stockity1.id';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface AccountAuth {
  authToken: string;
  deviceId: string;
  deviceType?: string;
}

export interface StockityAsset {
  ric: string;
  name: string;
  type: number;
  typeName: string;
  profitRate: number;
  iconUrl: string | null;
}

export interface BalanceInfo {
  demoBalance: number;
  realBalance: number;
  currency: string;
}

const TYPE_NAME_MAPPING: Record<number, string> = {
  1: 'Currency', 2: 'Stock', 3: 'Index', 4: 'Commodity', 5: 'Crypto',
};

function headers(a: AccountAuth): Record<string, string> {
  return {
    'device-id':           a.deviceId,
    'device-type':         a.deviceType ?? 'web',
    'user-timezone':       'Asia/Jakarta',
    'authorization-token': a.authToken,
    'User-Agent':          DEFAULT_UA,
    'Accept':              'application/json, text/plain, */*',
    'Origin':              'https://stockity1.id',
    'Referer':             'https://stockity1.id/',
  };
}

async function get(url: string, a: AccountAuth, timeout = 12000): Promise<any | null> {
  try {
    const res = await CapacitorHttp.get({
      url, headers: headers(a), readTimeout: timeout, connectTimeout: timeout,
    });
    if ((res?.status ?? 0) >= 400) return null;
    return res?.data ?? null;
  } catch { return null; }
}

/** Profil akun (nama, email, negara, mata uang, status) */
export async function getProfile(a: AccountAuth): Promise<any | null> {
  const body = await get(`${BASE}/platform/private/v2/profile?locale=id`, a, 10000);
  return body?.data ?? null;
}

/** Saldo demo & real + mata uang otoritatif dari Stockity */
export async function getBalance(a: AccountAuth): Promise<BalanceInfo | null> {
  const body = await get(`${BASE}/bank/v1/read?locale=id`, a, 10000);
  const rows: any[] = body?.data ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const real = rows.find(r => r.account_type === 'real');
  const demo = rows.find(r => r.account_type === 'demo');

  return {
    demoBalance: Number(demo?.amount ?? 0),
    realBalance: Number(real?.amount ?? 0),
    // bank/v1/read adalah sumber kebenaran mata uang (bukan tebakan sesi)
    currency: real?.currency ?? demo?.currency ?? 'IDR',
  };
}

/** Daftar aset + payout turbo, diurutkan payout tertinggi (logika sama dgn server) */
export async function getAssets(a: AccountAuth): Promise<StockityAsset[]> {
  const [assetsBody, profileBody] = await Promise.all([
    get(`${BASE}/bo-assets/v6/assets?locale=id`, a, 15000),
    get(`${BASE}/platform/private/v2/profile?locale=id`, a, 10000),
  ]);

  const statusGroup: string = profileBody?.data?.status_group ?? 'standard';
  const raw: any[] = assetsBody?.data?.assets ?? [];
  const out: StockityAsset[] = [];

  for (const asset of raw) {
    const assetType: number = asset.type;
    let iconUrl: string | null = asset.icon?.url ?? null;
    if (iconUrl && !iconUrl.startsWith('http')) {
      iconUrl = `https://stockity1.id${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
    }

    // Payout: prioritas rate personal user → tier status → bo → root
    let profitRate: number | null = null;
    for (const rate of (asset.personal_user_payment_rates ?? [])) {
      if (rate.trading_type === 'turbo') { profitRate = rate.payment_rate; break; }
    }
    if (profitRate === null) {
      const settings = asset.trading_tools_settings;
      const tiers = settings?.ftt?.user_statuses;
      profitRate =
        tiers?.[statusGroup]?.payment_rate_turbo ??
        tiers?.vip?.payment_rate_turbo ??
        settings?.bo?.payment_rate_turbo ??
        settings?.payment_rate_turbo ??
        null;
    }

    if (profitRate !== null) {
      out.push({
        ric: asset.ric,
        name: asset.name,
        type: assetType,
        typeName: TYPE_NAME_MAPPING[assetType] ?? `Type-${assetType}`,
        profitRate,
        iconUrl,
      });
    }
  }

  return out.sort((x, y) => y.profitRate - x.profitRate);
}

/** Daftar mata uang yang tersedia untuk akun (geo-filtered oleh Stockity) */
export async function getCurrencies(a: AccountAuth): Promise<any[]> {
  const body = await get(`${BASE}/platform/private/v2/currencies?locale=id`, a, 12000);
  // Bentuk respons Stockity: data = { current: "USD", list: [...] } — OBJEK,
  // bukan array. Dulu langsung dicek Array.isArray(data) sehingga SELALU
  // mengembalikan [] dan daftar mata uang di perangkat tidak pernah terisi.
  const data = body?.data;
  if (Array.isArray(data)) return data;              // jaga-jaga bila API berubah
  const list = (data as any)?.list;
  return Array.isArray(list) ? list : [];
}

/**
 * Konfigurasi mata uang AKUN (dari perangkat) — ISO, simbol, nominal minimum/
 * maksimum, dan nominal cepat, diambil dari mata uang yang sedang dipakai akun.
 *
 * Dibutuhkan karena akun non-IDR (USD/EUR/dll) sebelumnya tetap memakai angka
 * bawaan IDR: jalur perangkat hanya mengambil ISO dari saldo lalu menempelkan
 * DEFAULT (Rp 14.000 dst), sehingga batas nominalnya salah untuk akun asing.
 */
export async function getCurrencyConfig(a: AccountAuth): Promise<{
  currencyIso: string; currencyUnit: string;
  minAmount: number; maxAmount: number; quickAmounts: number[];
} | null> {
  const body = await get(`${BASE}/platform/private/v2/currencies?locale=en`, a, 12000);
  const data = body?.data;
  if (!data) return null;

  const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []);
  const current: string | undefined = Array.isArray(data) ? undefined : data?.current;
  if (!list.length) return null;

  const item = (current ? list.find((c: any) => c?.iso === current) : null) ?? list[0];
  if (!item?.iso) return null;

  const rawSumms: number[] = item?.summs?.standard_trade ?? [];
  const rawMin: number | undefined = item?.limits?.standard_trade?.min;
  const rawMax: number | undefined = item?.limits?.standard_trade?.max;

  // Stockity menyimpan nominal dalam sen (×100) → bagi 100 untuk ditampilkan
  return {
    currencyIso:  item.iso,
    currencyUnit: item.unit || item.iso,
    minAmount:    typeof rawMin === 'number' ? Math.round(rawMin / 100) : 0,
    maxAmount:    typeof rawMax === 'number' ? Math.round(rawMax / 100) : 0,
    quickAmounts: rawSumms.map((v) => Math.round(v / 100)).filter((v) => v > 0),
  };
}

/** Riwayat deal (dipakai perhitungan profit hari ini) */
export async function getDealsHistory(
  a: AccountAuth, accountType: 'demo' | 'real' = 'demo',
): Promise<any[]> {
  const body = await get(
    `${BASE}/bo-deals-history/v3/deals/trade?type=${accountType}&locale=id`, a, 15000,
  );
  const list = body?.data;
  return Array.isArray(list) ? list : [];
}
