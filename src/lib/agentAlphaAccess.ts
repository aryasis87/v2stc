// lib/agentAlphaAccess.ts
// ─────────────────────────────────────────────
// Akses mode AGENT ALPHA (agentic reversal-chase, WR ~85%) per user — fitur
// BERBAYAR terkunci, pola sama dgn 5st/Fast Reversal. Aktivasi SEKALI BAYAR
// Rp 850.000 (bukan langganan) — disimpan dengan expiry "seumur hidup".
//
// Penyimpanan: app_config key 'agentalpha_access' = JSON object
//   { "<stockity_user_id>": <expiresAt epoch ms>, ... }
// Baca: anon Supabase. Tulis: backend admin-guarded via api.admin.upsertConfig
// (TANPA perubahan schema). Backend juga menegakkan gerbang ini di start().
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { api } from './api';
import { isPrivilegedUser } from './adminEntitlement';
import { bacaPetaAkses, masihBerlaku, type EntriAkses } from './aksesFitur';

const KEY = 'agentalpha_access';

/** Aktivasi SEKALI BAYAR — disimpan sbg expiry "seumur hidup" (~50 tahun). */
const AGENTALPHA_LIFETIME_MS = 50 * 365 * 24 * 60 * 60 * 1000;

/** Harga aktivasi Agent Alpha (Rupiah). */
export const AGENTALPHA_PRICE = 850_000;

/** Peluang menang yang dipromosikan (persen). */
export const AGENTALPHA_WR = 85;

/** Email kontak resmi untuk permintaan aktivasi */
export const AGENTALPHA_CONTACT_EMAIL = 'supportstockity@gmail.com';

/** Peta userId → expiresAt (epoch ms). Aktif jika expiresAt > sekarang. */
export type AgentAlphaAccessMap = Record<string, number>;

/** expiresAt untuk aktivasi baru (sekali bayar → seumur hidup) */
export function agentAlphaExpiryFromNow(): number {
  return Date.now() + AGENTALPHA_LIFETIME_MS;
}

/** Entri akses satu pengguna — dipakai pemberitahuan aktivasi di dashboard. */
export async function getAgentAlphaEntry(
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
export async function getAgentAlphaMap(): Promise<AgentAlphaAccessMap> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (error || !data?.value) return {};
  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: AgentAlphaAccessMap = {};
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
export async function isAgentAlphaUnlocked(userId: string | number | null | undefined): Promise<boolean> {
  // Admin & super admin selalu berhak — lihat lib/adminEntitlement.ts
  if (await isPrivilegedUser()) return true;
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  const map = await getAgentAlphaMap();
  const exp = map[uid];
  return typeof exp === 'number' && exp > Date.now();
}

/** expiresAt (epoch ms) bila masih aktif; null bila tidak aktif/kedaluwarsa */
export async function getAgentAlphaExpiry(userId: string | number | null | undefined): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  const map = uid ? await getAgentAlphaMap() : {};
  const exp = uid ? map[uid] : undefined;
  if (typeof exp === 'number' && exp > Date.now()) return exp;
  return null;
}

/** Simpan ulang seluruh peta (dipanggil dari panel admin). Entri kedaluwarsa dipangkas. */
export async function saveAgentAlphaMap(map: AgentAlphaAccessMap): Promise<void> {
  const now = Date.now();
  const clean: AgentAlphaAccessMap = {};
  for (const [uid, exp] of Object.entries(map)) {
    const key = String(uid).trim();
    const ts = Number(exp);
    if (key && Number.isFinite(ts) && ts > now) clean[key] = ts;
  }
  await api.admin.upsertConfig(KEY, JSON.stringify(clean));
}
