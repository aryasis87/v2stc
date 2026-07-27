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

const STOCKITY_BASE = 'https://api.stockity1.id';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/stc-auth`;
const ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

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

    const token  = data?.data?.authtoken ?? data?.data?.token ?? '';
    const userId = String(data?.data?.user_id ?? data?.data?.id ?? '');
    if (!token) return { ok: false, error: 'Login gagal: token tidak diterima.', status };

    return { ok: true, authToken: token, userId, status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Tidak dapat menghubungi Stockity.' };
  }
}

/**
 * Buat/refresh sesi aplikasi lewat Edge Function.
 * `action: 'register'` dipakai alur pendaftaran agar akses mode REAL dibuka
 * untuk akun baru (afiliasi).
 */
export async function createSession(
  authToken: string, deviceId: string, action: 'session' | 'register' = 'session',
): Promise<SessionResult | null> {
  try {
    if (!FN_URL.startsWith('http')) return null;
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {}),
      },
      body: JSON.stringify({ authToken, deviceId, action }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Tandai sesi berakhir (best-effort) */
export async function endSession(authToken: string, deviceId: string): Promise<void> {
  try {
    if (!FN_URL.startsWith('http')) return;
    await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {}),
      },
      body: JSON.stringify({ authToken, deviceId, action: 'logout' }),
    });
  } catch { /* diabaikan */ }
}
