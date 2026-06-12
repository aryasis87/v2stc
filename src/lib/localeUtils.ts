// lib/localeUtils.ts
// Mapping kode negara ISO-2 → locale Stockity API dan bahasa UI app
//
// Ada DUA locale yang berbeda:
//   1. stockityLocale  → dipakai sebagai ?locale=XX ke Stockity API (19 bahasa)
//   2. appLang         → dipakai di LanguageContext untuk UI app (8 bahasa)
//
// Keduanya harus diset setelah login, berdasarkan profile.country dari Stockity.

import type { Language } from './LanguageContext';

// ── Stockity API locales yang tersedia ────────────────────────────────────────
// Sumber: GET /platform/locales → data.available_locales
export const STOCKITY_LOCALES = [
  'en','ru','id','es','th','vn','cn','tr','kr','in','ua','kz','az','fa','br','ar','bn','pt','uz',
] as const;
export type StockityLocale = typeof STOCKITY_LOCALES[number];

// ── Country ISO-2 → Stockity locale ──────────────────────────────────────────
const COUNTRY_TO_STOCKITY_LOCALE: Record<string, StockityLocale> = {
  // Indonesian
  ID: 'id', TL: 'id',
  // Spanish — Latin America + Spain
  CO: 'es', MX: 'es', AR: 'es', ES: 'es', CL: 'es',
  PE: 'es', VE: 'es', EC: 'es', BO: 'es', PY: 'es',
  UY: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', DO: 'es', CU: 'es', PR: 'es',
  // Russian / CIS
  RU: 'ru', BY: 'ru',
  UA: 'ua',
  KZ: 'kz',
  UZ: 'uz',
  AZ: 'az',
  // Thai
  TH: 'th',
  // Vietnamese
  VN: 'vn',
  // Chinese
  CN: 'cn', TW: 'cn', HK: 'cn', MO: 'cn',
  // Korean
  KR: 'kr',
  // Hindi / South Asian
  IN: 'in',
  BD: 'bn',
  // Persian
  IR: 'fa', AF: 'fa',
  // Portuguese (Stockity pakai 'br' untuk pt-BR, 'pt' untuk pt-PT)
  BR: 'br',
  PT: 'pt',
  // Arabic
  SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar',
  IQ: 'ar', JO: 'ar', KW: 'ar', LB: 'ar', LY: 'ar',
  SY: 'ar', TN: 'ar', YE: 'ar', OM: 'ar', QA: 'ar', BH: 'ar',
  // Turkish
  TR: 'tr', CY: 'tr',
  // Malay — Stockity API has no 'ms' locale, fall back to English
  MY: 'en',
};

// ── Currency ISO → App UI Language ────────────────────────────────────────────
// Dipakai setelah login untuk sinkronisasi bahasa berdasarkan mata uang akun.
// Currency lebih presisi dari country karena langsung dari setting akun Stockity user.
// Bahasa yang didukung app: 'en' | 'id' | 'ru' | 'es' | 'ms' | 'hi' | 'th' | 'tr'
const CURRENCY_TO_APP_LANG: Record<string, Language> = {
  // Indonesian
  IDR: 'id',
  // English — semua mata uang tanpa mapping spesifik fallback ke 'en'
  USD: 'en', EUR: 'en', GBP: 'en', SGD: 'en', AUD: 'en', CAD: 'en',
  NZD: 'en', HKD: 'en', TWD: 'en', PHP: 'en', NGN: 'en', GHS: 'en',
  ZAR: 'en', KES: 'en', LKR: 'en', VND: 'en', BRL: 'en',
  // Arabic countries → 'ar' tidak ada di app, fallback 'en'
  SAR: 'en', AED: 'en', EGP: 'en', MAD: 'en', KWD: 'en', QAR: 'en',
  OMR: 'en', BHD: 'en', TND: 'en', DZD: 'en',
  // Russian / CIS
  RUB: 'ru', KZT: 'ru', UAH: 'ru', UZS: 'ru', AZN: 'ru', AMD: 'ru', GEL: 'ru',
  // Spanish — Latin America + Spain
  COP: 'es', MXN: 'es', ARS: 'es', PEN: 'es', CLP: 'es', VES: 'es',
  BOB: 'es', PYG: 'es', UYU: 'es', GTQ: 'es', HNL: 'es', CRC: 'es',
  DOP: 'es', CUP: 'es', NIO: 'es', PAB: 'es',
  // Malay
  MYR: 'ms', BND: 'ms',
  // Hindi / South Asia
  INR: 'hi', PKR: 'hi', BDT: 'hi',
  // Thai
  THB: 'th',
  // Turkish
  TRY: 'tr',
};

// ── Country ISO-2 → App UI Language (hanya 8 yang didukung LanguageContext) ──
const COUNTRY_TO_APP_LANG: Record<string, Language> = {
  // Indonesian
  ID: 'id', TL: 'id',
  // Spanish
  CO: 'es', MX: 'es', AR: 'es', ES: 'es', CL: 'es',
  PE: 'es', VE: 'es', EC: 'es', BO: 'es', PY: 'es',
  UY: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', DO: 'es', CU: 'es', PR: 'es',
  // Russian / CIS → semua ke 'ru' di UI app
  RU: 'ru', BY: 'ru', UA: 'ru', KZ: 'ru', UZ: 'ru', AZ: 'ru',
  // Thai
  TH: 'th',
  // Turkish
  TR: 'tr', CY: 'tr',
  // Malay
  MY: 'ms', BN: 'ms',
  // Hindi
  IN: 'hi',
  // Sisanya (VN, CN, KR, BR, AR, dst) → fallback ke 'en' karena belum ada terjemahan
};

// ── Exports utama ─────────────────────────────────────────────────────────────

/**
 * Dari kode negara ISO-2, kembalikan locale yang dipakai di Stockity API (?locale=XX).
 * Default 'en' jika tidak dikenali.
 */
export function countryToStockityLocale(countryIso: string | null | undefined): StockityLocale {
  if (!countryIso) return 'en';
  return COUNTRY_TO_STOCKITY_LOCALE[countryIso.toUpperCase()] ?? 'en';
}

/**
 * Dari kode negara ISO-2, kembalikan Language yang dipakai di LanguageContext.
 * Default 'en' jika tidak dikenali atau bahasa tidak didukung app.
 */
export function countryToAppLang(countryIso: string | null | undefined): Language {
  if (!countryIso) return 'en';
  return COUNTRY_TO_APP_LANG[countryIso.toUpperCase()] ?? 'en';
}

/**
 * Dari ISO code mata uang, kembalikan Language yang dipakai di LanguageContext.
 * Dipakai setelah login untuk sinkronisasi bahasa berdasarkan currency akun user.
 * Currency lebih presisi dari country (langsung dari setting Stockity).
 * Default 'en' jika tidak dikenali.
 *
 * Contoh: currencyToAppLang('IDR') → 'id'
 *         currencyToAppLang('USD') → 'en'
 *         currencyToAppLang('COP') → 'es'
 *         currencyToAppLang('RUB') → 'ru'
 */
export function currencyToAppLang(currencyIso: string | null | undefined): Language {
  if (!currencyIso) return 'en';
  return CURRENCY_TO_APP_LANG[currencyIso.toUpperCase()] ?? 'en';
}

/**
 * Dari language code, kembalikan BCP-47 locale string untuk Intl.NumberFormat / toLocaleString.
 */
export function langToIntlLocale(lang: Language | string): string {
  const MAP: Record<string, string> = {
    id: 'id-ID',
    en: 'en-US',
    ru: 'ru-RU',
    es: 'es-CO',
    th: 'th-TH',
    tr: 'tr-TR',
    ms: 'ms-MY',
    hi: 'hi-IN',
  };
  return MAP[lang] ?? 'id-ID';
}

/**
 * Buat fungsi format angka berdasarkan language yang aktif.
 * Dipakai di komponen yang butuh format angka lokal.
 */
export function makeNumFormatter(lang: Language | string): (n: number) => string {
  const locale = langToIntlLocale(lang);
  return (n: number) => Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 });
}