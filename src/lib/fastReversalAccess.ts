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
import { bacaPetaAkses, masihBerlaku, type EntriAkses } from './aksesFitur';

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

const KEY = 'fastreversal_access';

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
  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: FrAccessMap = {};
    for (const [uid, exp] of Object.entries(v)) {
      const key = String(uid).trim();
      const ts = typeof exp === 'number' ? exp : Number(exp);
      if (key && Number.isFinite(ts)) out[key] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

/** Apakah user aktif (terdaftar & belum kedaluwarsa) */
export async function isFastReversalUnlocked(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  const map = await getFastReversalMap();
  const exp = map[uid];
  return typeof exp === 'number' && exp > Date.now();
}

/** expiresAt (epoch ms) bila masih aktif; null bila tidak aktif/kedaluwarsa */
export async function getFastReversalExpiry(userId: string | number | null | undefined): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  const map = uid ? await getFastReversalMap() : {};
  const exp = uid ? map[uid] : undefined;
  if (typeof exp === 'number' && exp > Date.now()) return exp;
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
