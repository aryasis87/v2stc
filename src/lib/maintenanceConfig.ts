// lib/maintenanceConfig.ts
// ─────────────────────────────────────────────
// MODE PEMELIHARAAN (maintenance) — dikendalikan SUPER ADMIN.
//
// Saat aktif, aplikasi & web trading menampilkan layar pemberitahuan bahwa
// server sedang diperbaiki dan pengguna biasa tidak bisa memakainya. Super
// admin TETAP bisa masuk supaya dapat mematikan mode ini kembali.
//
// Penyimpanan: app_config key 'maintenance' (pola sama dgn aisignal_access):
//   { "enabled": true, "message": "...", "startAt": <ms>, "endAt": <ms> }
// Baca: anon Supabase. Tulis: backend admin-guarded via api.admin.upsertConfig
// — TANPA perubahan backend/schema.
// ─────────────────────────────────────────────

import { supabase } from './supabase';
import { api } from './api';

const KEY = 'maintenance';

export interface MaintenanceInfo {
  enabled: boolean;
  /** Pesan opsional dari admin (kosong = pakai teks bawaan) */
  message?: string;
  /** Perkiraan mulai (epoch ms) — opsional, sekadar informasi */
  startAt?: number | null;
  /** Perkiraan selesai (epoch ms) — dipakai hitung mundur di layar peringatan */
  endAt?: number | null;
}

export const MAINTENANCE_OFF: MaintenanceInfo = { enabled: false };

/** Baca status pemeliharaan. Gagal baca = dianggap TIDAK maintenance (fail-open,
 *  supaya gangguan jaringan tidak mengunci semua pengguna). */
export async function getMaintenance(): Promise<MaintenanceInfo> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', KEY)
      .maybeSingle();
    if (error || !data?.value) return MAINTENANCE_OFF;

    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!v || typeof v !== 'object') return MAINTENANCE_OFF;

    const num = (x: any): number | null => {
      const n = typeof x === 'number' ? x : Number(x);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
      enabled: v.enabled === true,
      message: typeof v.message === 'string' ? v.message : undefined,
      startAt: num(v.startAt),
      endAt:   num(v.endAt),
    };
  } catch {
    return MAINTENANCE_OFF;
  }
}

/** Simpan status pemeliharaan (dipanggil dari panel super admin) */
export async function setMaintenance(info: MaintenanceInfo): Promise<void> {
  const payload: MaintenanceInfo = {
    enabled: !!info.enabled,
    message: info.message?.trim() || undefined,
    startAt: info.startAt ?? null,
    endAt:   info.endAt ?? null,
  };
  await api.admin.upsertConfig(KEY, JSON.stringify(payload));
}

/** Format sisa waktu ("2 jam 15 menit") — dipakai layar peringatan */
export function formatRemaining(endAt: number | null | undefined): string | null {
  if (!endAt) return null;
  const ms = endAt - Date.now();
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
  return `${m} menit`;
}
