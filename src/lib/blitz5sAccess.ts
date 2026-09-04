// lib/blitz5sAccess.ts
// ─────────────────────────────────────────────
// Akses mode 5st (order BLITZ 5 detik) per user — fitur BERBAYAR terkunci,
// pola sama dgn Fast Reversal: saat admin mengaktivasi, user aktif 30 hari
// lalu OTOMATIS kedaluwarsa (perlu aktivasi ulang). Harga aktivasi Rp 85.000.
//
// Penyimpanan: app_config key 'blitz5s_access' = JSON object
//   { "<stockity_user_id>": <expiresAt epoch ms>, ... }
// Baca: anon Supabase. Tulis: backend admin-guarded via api.admin.upsertConfig
// (TANPA perubahan schema).
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { api } from './api';
import { isPrivilegedUser } from './adminEntitlement';
import { bacaPetaAkses, masihBerlaku, uidAktif, uidExpiry, type EntriAkses } from './aksesFitur';

const KEY = 'blitz5s_access';

/** Durasi aktivasi 5st (hari). Ditagih bulanan. */
export const BLITZ5S_DURATION_DAYS = 30;
const BLITZ5S_DURATION_MS = BLITZ5S_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Harga aktivasi 5st (Rupiah). */
export const BLITZ5S_PRICE = 85_000;

/** Email kontak resmi untuk permintaan aktivasi 5st */
export const BLITZ5S_CONTACT_EMAIL = 'supportstockity@gmail.com';

/** Peta userId → expiresAt (epoch ms). Aktif jika expiresAt > sekarang. */
export type Blitz5sAccessMap = Record<string, number>;

/** expiresAt untuk aktivasi baru (sekarang + 30 hari) */
export function blitz5sExpiryFromNow(): number {
  return Date.now() + BLITZ5S_DURATION_MS;
}

/** Entri akses satu pengguna — dipakai pemberitahuan aktivasi di dashboard. */
export async function getBlitz5sEntry(
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

/** Ambil seluruh peta akses (mentah — termasuk yang mungkin sudah kedaluwarsa) */
export async function getBlitz5sMap(): Promise<Blitz5sAccessMap> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (error || !data?.value) return {};
  // Robust ke SEMUA bentuk (array lama, {id:exp}, {id:{sejak,sampai}}) via bacaPetaAkses.
  // Tanpa expiry (array lama / sampai=null) → sentinel jauh-depan agar dianggap aktif.
  const peta = bacaPetaAkses(data.value);
  const out: Blitz5sAccessMap = {};
  for (const [uid, e] of Object.entries(peta)) out[uid] = e.sampai ?? Number.MAX_SAFE_INTEGER;
  return out;
}

/** Apakah user aktif (terdaftar & belum kedaluwarsa) — tahan semua bentuk simpan */
export async function isBlitz5sUnlocked(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) return false;
  return uidAktif(data?.value, userId);
}

/** expiresAt (epoch ms) bila masih aktif; null bila selamanya/tidak aktif */
export async function getBlitz5sExpiry(userId: string | number | null | undefined): Promise<number | null> {
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) return null;
  return uidExpiry(data?.value, userId);
}

/** Simpan ulang seluruh peta (dipanggil dari panel admin). Entri kedaluwarsa dipangkas. */
export async function saveBlitz5sMap(map: Blitz5sAccessMap): Promise<void> {
  const now = Date.now();
  const clean: Blitz5sAccessMap = {};
  for (const [uid, exp] of Object.entries(map)) {
    const key = String(uid).trim();
    const ts = Number(exp);
    if (key && Number.isFinite(ts) && ts > now) clean[key] = ts;
  }
  await api.admin.upsertConfig(KEY, JSON.stringify(clean));
}
