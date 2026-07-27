// lib/engine/deviceLogs.ts
// ─────────────────────────────────────────────────────────────────────
// v4 — Baca riwayat eksekusi langsung dari Supabase (tabel `mode_logs`).
//
// Kenapa perlu: sejak engine berjalan di PERANGKAT, server tidak lagi
// punya log di memori — `api.scheduleLogs()` (VPS) mengembalikan kosong,
// sehingga halaman Riwayat tampak kosong padahal order benar-benar
// tereksekusi. Log kini ditulis engine perangkat ke `mode_logs` (tabel
// yang SAMA dengan engine server) lewat Edge Function, dan dibaca di sini
// dengan anon key (RLS: READ diizinkan, WRITE ditolak — terverifikasi).
//
// Karena tabelnya sama, riwayat era-VPS dan era-perangkat tampil menyatu,
// dan pembacaan ini tetap bekerja setelah VPS dimatikan.
// ─────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';
import { storage, SESSION_KEYS } from '../storage';

export interface DeviceLogRow {
  id: string;
  mode: string;
  data: any;
  executed_at: string;
}

/**
 * Ambil log eksekusi milik user saat ini.
 * @param mode filter mode (default 'schedule'); null = semua mode
 */
export async function fetchDeviceLogs(mode: string | null = 'schedule', limit = 200): Promise<any[]> {
  try {
    const userId = await storage.get(SESSION_KEYS.USER_ID);
    if (!userId) return [];

    let q = supabase
      .from('mode_logs')
      .select('id, mode, data, executed_at')
      .eq('user_id', String(userId))
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (mode) q = q.eq('mode', mode);

    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];

    // Kolom `data` menyimpan objek log apa adanya (bentuknya sama dengan
    // ExecutionLog dari API), jadi pemanggil tidak perlu memetakan ulang.
    return data
      .map((r: any) => r.data)
      .filter((l: any) => l && typeof l === 'object');
  } catch {
    return [];
  }
}
