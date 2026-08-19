// lib/engine/edgeCall.ts
// ─────────────────────────────────────────────────────────────────────
// v4 — pemanggil Edge Function yang aman dari CORS di dalam APK.
//
// KENAPA ADA: `fetch()` dari WebView Capacitor tetap tunduk pada CORS
// (termasuk preflight OPTIONS untuk header `apikey`/`authorization`).
// Bila preflight gagal, panggilan gagal diam-diam dan aplikasi hanya
// melihat "gagal" tanpa sebab — persis gejala login yang tidak lanjut.
// Di perangkat kita pakai CapacitorHttp (HTTP native, tanpa CORS);
// di browser tetap fetch biasa.
//
// Selain itu fungsi ini MENGEMBALIKAN PESAN ERROR yang sebenarnya,
// bukan null, supaya masalah berikutnya bisa didiagnosis dari layar.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorHttp } from '@capacitor/core';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseConfig';

const SB_URL  = SUPABASE_URL;
const SB_ANON = SUPABASE_ANON_KEY;

export interface EdgeResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

function isNative(): boolean {
  try {
    return (typeof window !== 'undefined') &&
      (window as any)?.Capacitor?.isNativePlatform?.() === true;
  } catch { return false; }
}

/**
 * Panggil Edge Function Supabase.
 * @param fn   nama fungsi, mis. 'stc-auth'
 * @param body payload JSON
 */
export async function edgeCall<T = any>(fn: string, body: unknown): Promise<EdgeResult<T>> {
  if (!SB_URL.startsWith('http')) {
    return { ok: false, status: 0, data: null, error: 'Konfigurasi server belum lengkap (SUPABASE_URL kosong).' };
  }

  const url = `${SB_URL}/functions/v1/${fn}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SB_ANON) { headers.apikey = SB_ANON; headers.Authorization = `Bearer ${SB_ANON}`; }

  try {
    if (isNative()) {
      // HTTP native → tidak ada preflight/CORS sama sekali
      const res = await CapacitorHttp.post({
        url, headers, data: body, readTimeout: 30000, connectTimeout: 30000,
      });
      const status = res?.status ?? 0;
      let parsed: any = res?.data;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { /* biarkan */ } }
      if (status >= 200 && status < 300) return { ok: true, status, data: parsed as T };
      return { ok: false, status, data: parsed ?? null, error: parsed?.error ?? `HTTP ${status}` };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const parsed = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: parsed as T };
    return { ok: false, status: res.status, data: parsed, error: (parsed as any)?.error ?? `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message ?? 'Tidak dapat menghubungi server.' };
  }
}
