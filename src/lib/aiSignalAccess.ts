// lib/aiSignalAccess.ts
// ─────────────────────────────────────────────
// Akses mode AI Signal per user (fitur terkunci).
// Penyimpanan: app_config key 'aisignal_access' = JSON array Stockity user_id
// yang diizinkan. Baca: anon Supabase (app_config anon-readable, pola sama
// dengan getRegistrationConfig). Tulis: backend admin-guarded via
// api.admin.upsertConfig — TANPA perubahan backend/schema.
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { api } from './api';
import { isPrivilegedUser } from './adminEntitlement';
import { bacaPetaAkses, masihBerlaku, uidAktif, type PetaAkses, type EntriAkses } from './aksesFitur';

const KEY = 'aisignal_access';

/** Email kontak resmi untuk permintaan aktivasi AI Signal */
export const AI_SIGNAL_CONTACT_EMAIL = 'supportstockity@gmail.com';

/** Daftar Stockity user_id yang boleh memakai mode AI Signal */
export async function getAiSignalAllowlist(): Promise<string[]> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (error || !data?.value) return [];
  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Apakah user (Stockity user_id) boleh memakai mode AI Signal */
export async function isAiSignalUnlocked(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
  // Tahan SEMUA bentuk: array lama (allowlist) DAN object {id:{sejak,sampai}}
  // (bila admin memberi masa berlaku). bacaPetaAkses menangani keduanya.
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) return false;
  return uidAktif(data?.value, userId);
}

/** Simpan ulang seluruh allowlist (dipanggil dari panel admin) */
export async function setAiSignalAllowlist(userIds: string[]): Promise<void> {
  const unique = Array.from(
    new Set(userIds.map((u) => String(u).trim()).filter(Boolean)),
  );
  await api.admin.upsertConfig(KEY, JSON.stringify(unique));
}

/** Masa berlaku langganan AI Signal (hari). Ditagih bulanan. */
export const AI_DURASI_HARI = 30;

/** Peta akses AI Signal apa pun bentuk tersimpannya (array lama pun terbaca). */
export async function getAiSignalMap(): Promise<PetaAkses> {
  const { data, error } = await supabase
    .from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error || !data?.value) return {};
  return bacaPetaAkses(data.value);
}

/** Entri akses satu pengguna — dipakai pemberitahuan aktivasi di dashboard. */
export async function getAiSignalEntry(
  userId: string | number | null | undefined,
): Promise<EntriAkses | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;
  const e = (await getAiSignalMap())[uid];
  return masihBerlaku(e) ? e : null;
}
