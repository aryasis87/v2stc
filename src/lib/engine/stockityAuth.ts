// lib/engine/stockityAuth.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase C — LOGIN LANGSUNG DARI PERANGKAT (tanpa VPS).
//
// Sebelumnya login diproksikan botstc lewat proxy residensial agar IP-nya
// tidak terlihat sebagai IP server. Di v4 hal itu tidak diperlukan lagi:
// perangkat user login memakai koneksinya sendiri — justru inilah alasan
// VPS ditinggalkan.
//
// Alur:
//   1. loginToStockity()  → POST sign_in via CapacitorHttp (native, bebas CORS)
//   2. createSession()    → kirim token ke Edge Function `stc-auth` yang
//      memvalidasi ulang ke Stockity lalu menulis sessions + whitelist
//      (service_role) dan mengembalikan status akses.
//
// Di browser murni langkah 1 akan gagal (CORS) — konsisten dengan
// kebijakan v4: eksekusi & login penuh hanya di APK.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorHttp } from '@capacitor/core';
import { edgeCall } from './edgeCall';

const STOCKITY_BASE = 'https://api.stockity1.id';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/stc-auth`;
const ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Ringkasan struktur respons login terakhir (untuk diagnosa, tanpa nilai rahasia) */
export let lastLoginShape = "";

export interface StockityLoginResult {
  ok: boolean;
  authToken?: string;
  userId?: string;
  /** Pesan siap tampil bila gagal */
  error?: string;
  status?: number;
}

export interface SessionResult {
  userId: string;
  email: string;
  currency: string | null;
  country: string | null;
  isActive: boolean;
  realAccess: boolean;
  isAdmin: boolean;
  role: string | null;
}

function headers(deviceId: string): Record<string, string> {
  return {
    'device-id':     deviceId,
    'device-type':   'web',
    'user-timezone': 'Asia/Bangkok',
    'accept':        'application/json, text/plain, */*',
    'Content-Type':  'application/json',
    'User-Agent':    DEFAULT_UA,
    'Origin':        'https://stockity1.id',
    'Referer':       'https://stockity1.id/',
  };
}

/**
 * Daftarkan "kunjungan" afiliasi ke traffic-tracker Stockity.
 * INI yang mengikat kode afiliasi ke device_id; `track_token` hasilnya WAJIB
 * dipakai saat sign_up agar registrasi ter-atribusi ke afiliasi kita.
 */
async function fireTrafficTracker(deviceId: string, referral: string): Promise<string | null> {
  try {
    const res = await CapacitorHttp.post({
      url: `${STOCKITY_BASE}/traffic-tracker/v1/track?a=${encodeURIComponent(referral)}&t=0&locale=id`,
      headers: headers(deviceId),
      data: {},
      readTimeout: 15000,
      connectTimeout: 15000,
    });
    const d: any = res?.data ?? {};
    return d?.data?.track_token ?? d?.track_token ?? null;
  } catch {
    return null;
  }
}

/** Token pelacakan cadangan bila tracker gagal (format sama dengan web client) */
function buildTrackToken(): string {
  const rnd = () => Math.random().toString(16).slice(2, 10);
  return `${rnd()}${rnd()}${rnd()}${rnd()}`;
}

/**
 * Registrasi akun Stockity baru langsung dari perangkat, LENGKAP dengan
 * atribusi afiliasi (kode `a` dari app_config, dikirim via traffic-tracker
 * + cookie) — inilah yang membuat pendaftaran terhitung sebagai referral kita.
 */
export async function registerToStockity(
  email: string, password: string, deviceId: string,
  referral: string, currency = 'IDR',
): Promise<StockityLoginResult> {
  try {
    const trackToken = (referral ? await fireTrafficTracker(deviceId, referral) : null) ?? buildTrackToken();

    const res = await CapacitorHttp.post({
      url: `${STOCKITY_BASE}/passport/v1/sign_up?locale=id`,
      headers: {
        ...headers(deviceId),
        // Atribusi afiliasi, sama seperti web client
        ...(referral ? { Cookie: `a=${referral}` } : {}),
      },
      data: { email: email.toLowerCase().trim(), password, currency, i_agree: true, track_token: trackToken },
      readTimeout: 25000,
      connectTimeout: 25000,
    });

    const status = res?.status ?? 0;
    const data: any = res?.data ?? {};

    if (status >= 400) {
      const msg =
        data?.errors?.[0]?.context?.message ||
        data?.errors?.[0]?.message ||
        'Pendaftaran gagal. Periksa email dan kata sandi Anda.';
      return { ok: false, error: msg, status };
    }

    const token  = data?.data?.authtoken ?? data?.data?.token ?? '';
    const userId = String(data?.data?.user_id ?? data?.data?.id ?? '');
    if (!token) return { ok: false, error: 'Pendaftaran gagal: token tidak diterima.', status };

    return { ok: true, authToken: token, userId, status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Tidak dapat menghubungi Stockity.' };
  }
}

/**
 * Ambil device-id yang sudah dikenal akun ini (dari sesi lama).
 * Stockity mengikat sesi ke device-id: memakai device lama membuat token
 * hasil login langsung sah, tanpa verifikasi perangkat baru.
 */
export async function getKnownDeviceId(email: string): Promise<string | null> {
  const res = await edgeCall<{ deviceId: string | null }>("stc-auth", { authToken: "lookup", action: "device-hint", email });
  return res.ok ? (res.data?.deviceId ?? null) : null;
}

/** Login email+password langsung ke Stockity dari perangkat */
export async function loginToStockity(
  email: string, password: string, deviceId: string,
): Promise<StockityLoginResult> {
  try {
    const res = await CapacitorHttp.post({
      url: `${STOCKITY_BASE}/passport/v2/sign_in?locale=id`,
      headers: headers(deviceId),
      data: { email, password },
      readTimeout: 20000,
      connectTimeout: 20000,
    });

    const status = res?.status ?? 0;
    const data: any = res?.data ?? {};

    if (status >= 400) {
      const msg =
        data?.errors?.[0]?.context?.message ||
        data?.errors?.[0]?.message ||
        (status === 429
          ? 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.'
          : 'Email atau password salah.');
      return { ok: false, error: msg, status };
    }

    // Rekam bentuk respons agar salah-ambil-field bisa dikenali dari layar
    try {
      const top = typeof data === "string" ? "[string]" : Object.keys(data ?? {}).join(",");
      const inner = (data && typeof data === "object" && data.data && typeof data.data === "object")
        ? Object.keys(data.data).join(",") : "-";
      lastLoginShape = "top=" + top + " data=" + inner;
    } catch { lastLoginShape = "?"; }

    const token  = data?.data?.authtoken ?? data?.data?.token ?? data?.authtoken ?? data?.token ?? "";
    const userId = String(data?.data?.user_id ?? data?.data?.id ?? data?.user_id ?? "");
    if (!token) return { ok: false, error: "Login gagal: token tidak ada di respons (" + lastLoginShape + ").", status };

    lastLoginShape += " tokenLen=" + String(token).length;
    return { ok: true, authToken: String(token), userId, status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Tidak dapat menghubungi Stockity.' };
  }
}

/**
 * Buat/refresh sesi aplikasi lewat Edge Function.
 * `action: 'register'` dipakai alur pendaftaran agar akses mode REAL dibuka
 * untuk akun baru (afiliasi).
 */
/** Pesan kegagalan terakhir dari createSession (untuk ditampilkan ke user) */
export let lastSessionError = "";

export async function createSession(
  authToken: string, deviceId: string, action: 'session' | 'register' = 'session',
): Promise<SessionResult | null> {
  const res = await edgeCall<SessionResult>('stc-auth', { authToken, deviceId, action });
  if (res.ok && res.data) { lastSessionError = ""; return res.data; }
  lastSessionError = res.error ?? 'Gagal menghubungi server sesi.';
  return null;
}

/** Tandai sesi berakhir (best-effort) */
/** Tandai sesi berakhir (best-effort) */
export async function endSession(authToken: string, deviceId: string): Promise<void> {
  await edgeCall('stc-auth', { authToken, deviceId, action: 'logout' });
}
