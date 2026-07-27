// lib/realAccess.ts
// ─────────────────────────────────────────────
// v4: akses mode REAL per akun. Kolom whitelist_users.real_access
// (migrasi V4-MIGRATION-real-access.sql). Default & saat error/kolom belum
// ada: false → demo-only (fail-closed, sesuai kebijakan v4: semua user lama
// demo-only; REAL hanya akun baru via selfregister/affiliate).
// ─────────────────────────────────────────────

import { supabase } from './supabase';

export async function hasRealAccess(userId: string | number | null | undefined): Promise<boolean> {
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  try {
    const { data, error } = await supabase
      .from('whitelist_users')
      .select('real_access')
      .eq('user_id', uid)
      .limit(1);
    if (error) return false; // kolom belum dimigrasi / error → demo-only
    return (data?.[0] as any)?.real_access === true;
  } catch {
    return false;
  }
}
