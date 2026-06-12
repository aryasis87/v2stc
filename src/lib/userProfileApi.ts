// lib/userProfileApi.ts
// ✅ FIXED — Multi-country support: locale & timezone dinamis dari akun user
//
// PERUBAHAN:
//   - buildStockityHeaders terima param timezone (bukan hardcode 'Asia/Bangkok')
//   - fetchPlatformCurrencies return CurrencyConfig lengkap (minAmount, quickAmounts, unit)
//   - Semua fungsi terima locale sebagai param (caller harus pass hasil countryToStockityLocale)
//   - loginToStockity pakai timezone browser (Intl) sebagai fallback sebelum session ada

import { countryToStockityLocale } from './localeUtils';
export { countryToStockityLocale };

const STOCKITY_BASE_URL =
  process.env.NEXT_PUBLIC_STOCKITY_API_URL ?? 'https://api.stockity.id/';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:           number;
  email:        string;
  firstName:    string;
  lastName:     string;
  username?:    string;
  nickname?:    string;
  phone?:       string;
  gender?:      string;
  country?:     string;
  birthday?:    string;
  registeredAt?: string;
  avatar?:      string;
}

export interface UserProfileResponse {
  data: UserProfile | null;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface LoginResponse {
  data?: {
    authorizationToken?: string;
    accessToken?:        string;
    deviceId?:           string;
    userId?:             string | number;
  };
}

interface CurrencyItem {
  iso:   string;
  unit:  string;
  name?: string;
}

interface CurrencyData {
  current: string;
  list:    CurrencyItem[];
}

interface CurrencyResponse {
  data?: CurrencyData;
}

export interface FetchedCurrency {
  currency:    string;
  currencyIso: string;
}

/**
 * Config currency lengkap yang dipakai di dashboard.
 * Semua amount dalam satuan display (sudah dibagi 100 dari Stockity API).
 */
export interface CurrencyConfig {
  /** ISO code mata uang, e.g. "IDR", "COP" */
  currencyIso:  string;
  /** Simbol/unit, e.g. "Rp", "Col$" */
  currencyUnit: string;
  /** Minimum amount order dalam satuan display, e.g. 14000 (IDR) atau 4000 (COP) */
  minAmount:    number;
  /** Maximum amount order dalam satuan display */
  maxAmount:    number;
  /** Preset quick-pick amounts (sudah dibagi 100), e.g. [14000,70000,...] */
  quickAmounts: number[];
}

// Default IDR — dipakai sebelum API response tersedia
export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  currencyIso:  'IDR',
  currencyUnit: 'Rp',
  minAmount:    14_000,
  maxAmount:    74_000_000,
  quickAmounts: [14_000, 70_000, 140_000, 280_000, 700_000, 1_400_000, 2_800_000],
};

// ── ISO_TO_UNIT — fallback simbol jika API tidak mengembalikan unit ────────────
// Dipakai di fetchPlatformCurrencies & fetchUserCurrency agar tidak hardcode 'Rp'
// sebagai default untuk semua currency.
export const ISO_TO_UNIT: Record<string, string> = {
  IDR: 'Rp',    USD: '$',     EUR: '€',     GBP: '£',     BRL: 'R$',
  COP: 'Col$',  MXN: 'MX$',  ARS: 'AR$',   PEN: 'S/',    CLP: 'CL$',
  NGN: '₦',     KES: 'KSh',  GHS: 'GH₵',   ZAR: 'R',
  INR: '₹',     PKR: '₨',    BDT: '৳',      LKR: 'Rs',
  PHP: '₱',     VND: '₫',    THB: '฿',      MYR: 'RM',    SGD: 'S$',
  TRY: '₺',     UAH: '₴',    KZT: '₸',      UZS: "so'm",
  RUB: '₽',     AMD: '֏',    AZN: '₼',      GEL: '₾',
  EGP: 'E£',    MAD: 'MAD',  TND: 'DT',     DZD: 'DA',
  SAR: '﷼',     AED: 'AED',  KWD: 'KD',     QAR: 'QR',    OMR: 'OMR',
  HKD: 'HK$',   TWD: 'NT$',  CAD: 'CA$',    AUD: 'A$',    NZD: 'NZ$',
  VES: 'Bs.S',  BOB: 'Bs.',  PYG: '₲',      UYU: '$U',    GTQ: 'Q',
  HNL: 'L',     CRC: '₡',    DOP: 'RD$',    CUP: '$',     NIO: 'C$',
};

/** Mirrors: userProfile.getFullName() di Kotlin */
export function getFullName(p: UserProfile): string {
  const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return full || p.nickname || p.username || p.email;
}

// ── resolveAvatarUrl ──────────────────────────────────────────────────────────
// Endpoint passport/v1/user_profile  → avatar = "uploads/user/xxx.png"  (relative)
// Endpoint platform/private/v2/profile → avatar = "https://stockity.id/uploads/..." (full)
// Fungsi ini menormalisasi keduanya menjadi full URL yang siap dipakai di <img src>.
export function resolveAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar || avatar.trim() === '') return null;
  if (avatar.startsWith('https://') || avatar.startsWith('http://')) return avatar;
  // Relative path — prepend CDN base stockity.id
  return `https://stockity.id/${avatar.replace(/^\//, '')}`;
}

// ── buildStockityHeaders ──────────────────────────────────────────────────────
function buildStockityHeaders(
  authToken: string,
  deviceId:  string,
  timezone:  string = (typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'Asia/Bangkok'),
  extra:     Record<string, string> = {},
): Record<string, string> {
  return {
    'device-id':           deviceId,
    'device-type':         'web',
    'user-timezone':       timezone,
    'authorization-token': authToken,
    'User-Agent':          USER_AGENT,
    'Accept':              'application/json, text/plain, */*',
    'Origin':              'https://stockity.id',
    'Referer':             'https://stockity.id/',
    ...extra,
  };
}

// ── httpGet — wrapper CapacitorHttp dengan fallback ke fetch ──────────────────
// CapacitorHttp membuat request lewat native Android → tidak ada CORS
async function httpGet(url: string, headers: Record<string, string>): Promise<unknown> {
  try {
    // Coba CapacitorHttp (native Android / iOS)
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({ url, headers });
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.data;
  } catch (capErr: unknown) {
    // Jika CapacitorHttp tidak tersedia (browser/web), fallback ke fetch biasa
    const isNotAvailable =
      capErr instanceof Error &&
      (capErr.message.includes('not implemented') ||
       capErr.message.includes('CapacitorHttp') ||
       capErr.message.includes('undefined'));

    if (isNotAvailable) {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    throw capErr;
  }
}

// ── httpPost — wrapper CapacitorHttp dengan fallback ke fetch ─────────────────
async function httpPost(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.post({
      url,
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: body,
    });
    if (res.status >= 400) {
      const status = res.status;
      if (status === 401 || status === 403)
        throw new Error('Email atau password salah untuk akun Stockity');
      if (status === 423)
        throw new Error('Akun Stockity diblokir');
      if (status >= 500)
        throw new Error('Server Stockity error');
      throw new Error(`Login gagal (${status})`);
    }
    return res.data;
  } catch (capErr: unknown) {
    const isNotAvailable =
      capErr instanceof Error &&
      (capErr.message.includes('not implemented') ||
       capErr.message.includes('CapacitorHttp') ||
       capErr.message.includes('undefined'));

    if (isNotAvailable) {
      const res = await fetch(url, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403)
          throw new Error('Email atau password salah untuk akun Stockity');
        if (res.status === 423)
          throw new Error('Akun Stockity diblokir');
        if (res.status >= 500)
          throw new Error('Server Stockity error');
        throw new Error(`Login gagal (${res.status})`);
      }
      return res.json();
    }
    throw capErr;
  }
}

// ── fetchUserProfile ──────────────────────────────────────────────────────────
// Mirrors: UserProfileApiService.getUserProfile()
// locale: hasil countryToStockityLocale(profile.country) — caller yang menentukan
export async function fetchUserProfile(
  authToken: string,
  deviceId:  string,
  locale     = 'en',
  timezone?: string,
): Promise<UserProfile> {
  const url = `${STOCKITY_BASE_URL}passport/v1/user_profile?locale=${locale}`;

  const json = await httpGet(url, buildStockityHeaders(authToken, deviceId, timezone)) as UserProfileResponse;

  if (!json.data) {
    throw new Error('Terjadi kesalahan saat memproses akun (data kosong)');
  }

  return {
    ...json.data,
    avatar: resolveAvatarUrl(json.data.avatar) ?? undefined,
  };
}

// ── fetchUserCurrency ─────────────────────────────────────────────────────────
// Mirrors: CurrencyRepository.fetchUserCurrency()
export async function fetchUserCurrency(
  authToken: string,
  deviceId:  string,
  locale     = 'en',
  timezone?: string,
): Promise<FetchedCurrency> {
  try {
    const url  = `${STOCKITY_BASE_URL}currency/v1/user_currency?locale=${locale}`;
    const json = await httpGet(url, buildStockityHeaders(authToken, deviceId, timezone)) as CurrencyResponse;
    const data = json.data;

    if (!data) return { currency: 'IDR', currencyIso: 'Rp' };

    const currentCode = data.current ?? 'IDR';
    const currentItem = data.list?.find(c => c.iso === currentCode);
    // ✅ FIX: Gunakan ISO_TO_UNIT sebagai fallback agar tidak selalu default ke 'Rp'
    //    Sebelumnya: ?? 'Rp' → COP/USD/dll tanpa unit dari API akan salah tampil sebagai 'Rp'
    const unitSymbol  = currentItem?.unit || ISO_TO_UNIT[currentCode] || currentCode;

    return { currency: currentCode, currencyIso: unitSymbol };
  } catch (e) {
    console.warn('[Currency] fetchUserCurrency error:', e);
    return { currency: 'IDR', currencyIso: 'Rp' };
  }
}

// ── fetchPlatformCurrencies ───────────────────────────────────────────────────
// Ambil currency aktif user + config amount dari /platform/private/v2/currencies
// (endpoint utama yang dipakai Stockity web)
//
// Response:
//   data.current      → ISO code, e.g. "COP" / "IDR"
//   data.list[].unit  → simbol, e.g. "Col$" / "Rp"
//   data.list[].summs.standard_trade → preset amounts (dalam cents, dibagi 100)
//   data.list[].limits.standard_trade → {min, max} dalam cents
//
// Returns CurrencyConfig lengkap — dipakai di dashboard untuk minAmount, quickAmounts, dll.
//
// ✅ FIX: Tidak lagi membungkus dengan try/catch internal.
//    Di browser (bukan native Capacitor), httpGet ke Stockity gagal karena CORS.
//    Sebelumnya error langsung ditelan di sini dan mengembalikan DEFAULT_CURRENCY_CONFIG (IDR/Rp),
//    sehingga blok catch di runSplash (loginpage.tsx) tidak pernah tercapai,
//    dan fallback api.balance() yang bebas CORS tidak pernah jalan.
//    Sekarang error dibiarkan naik ke caller (runSplash) agar fallback chain bekerja benar.
export async function fetchPlatformCurrencies(
  authToken: string,
  deviceId:  string,
  locale     = 'en',
  timezone?: string,
): Promise<CurrencyConfig> {
  // ── Browser guard: throw segera, tidak buat HTTP request → tidak ada CORS preflight ──
  // Di native Capacitor: (window as any).Capacitor.isNativePlatform() === true → skip guard.
  // Di browser (web/dev): throw → caller catch → fallback ke api.currencyConfig() (backend proxy).
  if (typeof window !== 'undefined') {
    const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;
    if (!isNative) {
      throw new Error(
        '[fetchPlatformCurrencies] Browser environment — gunakan api.currencyConfig() (backend proxy, bebas CORS).',
      );
    }
  }

  const url  = `${STOCKITY_BASE_URL}platform/private/v2/currencies?locale=${locale}`;
  const json = await httpGet(url, buildStockityHeaders(authToken, deviceId, timezone)) as {
    data?: {
      current?: string;
      list?: {
        iso:    string;
        unit:   string;
        summs?: { standard_trade?: number[] };
        limits?: { standard_trade?: { min?: number; max?: number } };
      }[];
    };
  };

  const data = json.data;
  if (!data) throw new Error('[fetchPlatformCurrencies] Response data kosong');

  const current = data.current ?? 'IDR';
  const item    = data.list?.find(c => c.iso === current);
  if (!item) throw new Error(`[fetchPlatformCurrencies] Item currency tidak ditemukan untuk: ${current}`);

  const unit        = item.unit || ISO_TO_UNIT[current] || current;
  // ✅ FIX: Sebelumnya `item.unit ?? 'Rp'` → jika Stockity API return unit=null/""
  //    untuk COP/USD/dll, symbol akan tampil sebagai 'Rp'. Sekarang pakai ISO_TO_UNIT
  //    sebagai fallback sehingga COP → 'Col$', USD → '$', dsb.
  const rawSumms    = item.summs?.standard_trade ?? [];
  const rawMin      = item.limits?.standard_trade?.min ?? 1_400_000;
  const rawMax      = item.limits?.standard_trade?.max ?? 74_000_000_00;

  // Stockity menyimpan amounts dalam cents (×100) → bagi 100 untuk display
  const quickAmounts = rawSumms.map((v: number) => Math.round(v / 100));
  const minAmount    = Math.round(rawMin / 100);
  const maxAmount    = Math.round(rawMax / 100);

  return {
    currencyIso:  current,
    currencyUnit: unit,
    minAmount,
    maxAmount,
    quickAmounts: quickAmounts.length > 0 ? quickAmounts : DEFAULT_CURRENCY_CONFIG.quickAmounts,
  };
}

// ── checkHasTradingHistory ────────────────────────────────────────────────────
export async function checkHasTradingHistory(
  authToken: string,
  deviceId:  string,
  locale     = 'en',
  timezone?: string,
): Promise<boolean> {
  const headers = buildStockityHeaders(authToken, deviceId, timezone);
  const buildUrl = (type: 'real' | 'demo') =>
    `${STOCKITY_BASE_URL}bo-deals-history/v3/deals/trade?type=${type}&locale=${locale}`;

  // Cek real dan demo secara paralel — kalau salah satu ada isinya, tolak
  const [realResult, demoResult] = await Promise.allSettled([
    httpGet(buildUrl('real'), headers),
    httpGet(buildUrl('demo'), headers),
  ]);

  const hasDeals = (result: PromiseSettledResult<unknown>): boolean => {
    if (result.status === 'rejected') return false;
    const deals = (result.value as any)?.data?.standard_trade_deals ?? [];
    return (deals as unknown[]).length > 0;
  };

  return hasDeals(realResult) || hasDeals(demoResult);
}

// ── loginToStockity ───────────────────────────────────────────────────────────
// Mirrors: LoginApiService.login()
// locale: pakai 'en' sebagai default saat login (session belum ada, tidak tahu negara user).
//         Setelah login berhasil dan profile di-fetch, caller bisa update locale di session.
export async function loginToStockity(
  email:    string,
  password: string,
  deviceId: string,
  locale    = 'en',
): Promise<{ authToken: string; deviceId: string }> {
  const url = `${STOCKITY_BASE_URL}passport/v2/sign_in?locale=${locale}`;

  // Timezone dari browser saat login — belum ada session untuk dibaca
  const browserTz = typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'Asia/Bangkok';

  const json = await httpPost(
    url,
    {
      'device-id':     deviceId,
      'device-type':   'web',
      'user-timezone': browserTz,
      'User-Agent':    USER_AGENT,
      'Accept':        'application/json',
      'Origin':        'https://stockity.id',
      'Referer':       'https://stockity.id/',
    },
    { email, password },
  ) as LoginResponse;

  const token    = json.data?.authorizationToken ?? json.data?.accessToken ?? '';
  const retDevId = json.data?.deviceId ?? deviceId;

  if (!token) throw new Error('Token tidak ditemukan dalam response login');

  return { authToken: token, deviceId: retDevId };
}