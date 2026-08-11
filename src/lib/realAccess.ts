// lib/realAccess.ts
// ─────────────────────────────────────────────
// v4: akses mode REAL per akun. Kolom whitelist_users.real_access
// (migrasi V4-MIGRATION-real-access.sql). Default & saat error/kolom belum
// ada: false → demo-only (fail-closed, sesuai kebijakan v4: semua user lama
// demo-only; REAL hanya akun baru via selfregister/affiliate).
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { isPrivilegedUser } from './adminEntitlement';

export async function hasRealAccess(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
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

/** Kapan mode REAL diaktifkan (epoch ms), atau null bila belum pernah aktif. */
export async function getRealAccessAt(
  userId: string | number | null | undefined,
): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('whitelist_users')
      .select('real_access, real_access_at')
      .eq('user_id', uid)
      .limit(1);
    if (error) return null;
    const row: any = data?.[0];
    if (!row || row.real_access !== true || !row.real_access_at) return null;
    const ms = Date.parse(String(row.real_access_at));
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}
