// lib/fastReversalAccess.ts
// ─────────────────────────────────────────────
// Akses mode FAST REVERSAL per user (fitur terkunci — pola sama dgn AI Signal),
// TAPI dengan MASA BERLAKU: saat admin mengaktivasi, user aktif selama 30 hari
// lalu OTOMATIS kedaluwarsa (perlu aktivasi ulang).
//
// Penyimpanan: app_config key 'fastreversal_access' = JSON object
//   { "<stockity_user_id>": <expiresAt epoch ms>, ... }
// Baca: anon Supabase. Tulis: backend admin-guarded via api.admin.upsertConfig
// (TANPA perubahan backend/schema).
//
// CATATAN: user yang aktif (belum kedaluwarsa) OTOMATIS boleh akses saldo REAL
// (dashboard: realAccess = hasRealAccess || isFastReversalUnlocked).
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { api } from './api';
import { isPrivilegedUser } from './adminEntitlement';
import { bacaPetaAkses, masihBerlaku, uidAktif, uidExpiry, type EntriAkses } from './aksesFitur';

const KEY = 'fastreversal_access';

/** Entri akses satu pengguna — dipakai pemberitahuan aktivasi di dashboard. */
export async function getFastReversalEntry(
  userId: string | number | null | undefined,
): Promise<EntriAkses | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error || !data?.value) return null;
  const e = bacaPetaAkses(data.value)[uid];
  return masihBerlaku(e) ? e : null;
}

/** Durasi aktivasi Fast Reversal (hari) */
export const FR_DURATION_DAYS = 30;
const FR_DURATION_MS = FR_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Email kontak resmi untuk permintaan aktivasi Fast Reversal */
export const FAST_REVERSAL_CONTACT_EMAIL = 'supportstockity@gmail.com';

/** Peta userId → expiresAt (epoch ms). Aktif jika expiresAt > sekarang. */
export type FrAccessMap = Record<string, number>;

/** expiresAt untuk aktivasi baru (sekarang + 30 hari) */
export function frExpiryFromNow(): number {
  return Date.now() + FR_DURATION_MS;
}

/** Ambil seluruh peta akses (mentah — termasuk yang mungkin sudah kedaluwarsa) */
export async function getFastReversalMap(): Promise<FrAccessMap> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (error || !data?.value) return {};
  // Robust ke SEMUA bentuk (array lama, {id:exp}, {id:{sejak,sampai}}) via bacaPetaAkses.
  const peta = bacaPetaAkses(data.value);
  const out: FrAccessMap = {};
  for (const [uid, e] of Object.entries(peta)) out[uid] = e.sampai ?? Number.MAX_SAFE_INTEGER;
  return out;
}

/** Apakah user aktif (terdaftar & belum kedaluwarsa) — tahan semua bentuk simpan */
export async function isFastReversalUnlocked(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) return false;
  return uidAktif(data?.value, userId);
}

/** expiresAt (epoch ms) bila masih aktif; null bila selamanya/tidak aktif */
export async function getFastReversalExpiry(userId: string | number | null | undefined): Promise<number | null> {
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) return null;
  const exp = uidExpiry(data?.value, userId);
  if (exp !== null && exp > Date.now()) return exp;
  // Admin tanpa entri tersimpan tetap berhak, tapi TIDAK punya tanggal
  // kedaluwarsa — dashboard memakai null untuk menyembunyikan sisa harinya.
  return null;
}

/** Simpan ulang seluruh peta (dipanggil dari panel admin). Entri kedaluwarsa dipangkas. */
export async function saveFastReversalMap(map: FrAccessMap): Promise<void> {
  const now = Date.now();
  const clean: FrAccessMap = {};
  for (const [uid, exp] of Object.entries(map)) {
    const key = String(uid).trim();
    const ts = Number(exp);
    // simpan hanya yang masih berlaku (buang yang sudah lewat)
    if (key && Number.isFinite(ts) && ts > now) clean[key] = ts;
  }
  await api.admin.upsertConfig(KEY, JSON.stringify(clean));
}
