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
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  const list = await getAiSignalAllowlist();
  return list.includes(uid);
}

/** Simpan ulang seluruh allowlist (dipanggil dari panel admin) */
export async function setAiSignalAllowlist(userIds: string[]): Promise<void> {
  const unique = Array.from(
    new Set(userIds.map((u) => String(u).trim()).filter(Boolean)),
  );
  await api.admin.upsertConfig(KEY, JSON.stringify(unique));
}
