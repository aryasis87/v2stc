// lib/supabaseRepository.ts
// ✅ FIXED v2 — Semua bug audit diperbaiki:
//   Bug 1: getUserStatistics → return key disesuaikan dengan admin page (total/active/inactive/recent/recentAdded)
//   Bug 3: addWhitelistUser → extra field diubah ke snake_case (user_id, device_id)
//   Bug 4: updateWhitelistUser → is_active dan last_login ikut diupdate
//   Bug 5: exportWhitelistAsJson & exportWhitelistAsCsv → trigger browser download langsung

import { supabase } from './supabase';
import { api } from './api';

// ─────────────────────────────────────────────
// C2: Operasi TULIS & cek-role admin kini lewat backend (service_role) — bukan
// lagi anon key dari browser (diblokir RLS). Operasi BACA tabel yang masih
// anon-readable (whitelist_users, app_config) tetap langsung ke Supabase
// untuk mendukung realtime + alur publik (login/register) tanpa app-JWT.
// Signature fungsi DIPERTAHANKAN agar pemanggil (admin/login/register) tak berubah.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface WhitelistUser {
  id?: string;
  email: string;
  /** UI display name */
  name?: string;
  /** UI user identifier */
  userId?: string;
  /** UI device identifier */
  deviceId?: string;
  /** DB field: active status */
  is_active?: boolean;
  /** camelCase alias for UI convenience */
  isActive?: boolean;
  /** DB field: ISO timestamp string */
  added_at?: string;
  /** UI field: numeric timestamp (ms) derived from added_at */
  addedAt?: number;
  /** DB field: admin who added */
  added_by?: string;
  /** camelCase alias for UI convenience */
  addedBy?: string;
  /** UI field: creation timestamp (numeric ms, derived from added_at) */
  createdAt?: number;
  /** UI field: last login timestamp (numeric ms, derived from last_login) */
  lastLogin?: number;
  /** DB field: last login ISO timestamp */
  last_login?: string;
  /** DB field: FCM push token */
  fcmToken?: string;
  /** DB field: FCM token update timestamp */
  fcmTokenUpdatedAt?: number;
  /** DB field: true = user registrasi via primary URL (disembunyikan di whitelist admin) */
  is_primary?: boolean;
  /** camelCase alias */
  isPrimary?: boolean;
}

export interface AdminUser {
  id?: string;
  email: string;
  /** UI display name */
  name?: string;
  /** UI role: 'admin' | 'super_admin' */
  role?: 'admin' | 'super_admin';
  is_active?: boolean;
  created_at?: string;
  /** Masa aktif (ISO) dari whitelist — null = permanen */
  expires_at?: string | null;
}

export interface RegistrationConfig {
  minStockity?: number;
  maxRetries?: number;
  lockDuration?: number;
  maintenance?: boolean;
  /** UI field: WhatsApp help URL */
  whatsappHelpUrl?: string;
  /** UI field: Kode referral/afiliasi Stockity untuk register inline (cookie `a`) */
  stockityReferral?: string;
  /** UI field: last updated timestamp (numeric ms) */
  updatedAt?: number;
}

export interface ImportResult {
  success: number;
  skipped: number;
}

// ─────────────────────────────────────────────
// WHITELIST USERS
// ─────────────────────────────────────────────

export async function getAllWhitelistUsers(
  _email?: string,
  _superAdmin?: boolean,
  _pageSize?: number,
): Promise<WhitelistUser[]> {
  // C2: backend (admin-guarded) yang menentukan scope (super → semua, admin → miliknya)
  const rows = await api.admin.listWhitelist();
  return (rows ?? []).map((row: any) => normalizeWhitelistUser(row));
}

export async function addWhitelistUser(
  emailOrUser: string | Omit<WhitelistUser, 'id'>,
  addedBy?: string,
): Promise<void> {
  let normalizedEmail: string;
  // ✅ FIX Bug 3: gunakan snake_case agar sesuai kolom Supabase
  let extra: Record<string, unknown> = {};

  let name: string | undefined;
  let userId: string | undefined;
  let deviceId: string | undefined;

  if (typeof emailOrUser === 'string') {
    normalizedEmail = emailOrUser.toLowerCase().trim();
  } else {
    normalizedEmail = emailOrUser.email.toLowerCase().trim();
    name     = emailOrUser.name     ?? undefined;
    userId   = emailOrUser.userId   ?? undefined;
    deviceId = emailOrUser.deviceId ?? undefined;
  }

  // C2: admin menambah user → backend (service_role). Registrasi self-add pakai
  // addWhitelistUserViaToken() (tervalidasi token), bukan fungsi ini.
  void extra;
  await api.admin.addWhitelist({
    email:     normalizedEmail,
    name,
    userId,
    deviceId,
    isPrimary: (emailOrUser as any)?.isPrimary ?? false,
    addedBy:   addedBy ?? 'system',
  });
}

/**
 * C2: Registrasi whitelist untuk DIRI SENDIRI (alur register manual & webview).
 * Backend memvalidasi Stockity token → menulis whitelist via service_role.
 * Email & userId diambil backend dari token (otoritatif), bukan dari client.
 */
export async function addWhitelistUserViaToken(
  authToken: string,
  deviceId: string,
  payload: { name?: string; isPrimary?: boolean; addedBy?: string } = {},
): Promise<{ email: string; userId: string; isActive: boolean; exists: boolean }> {
  return api.registerWhitelist({ authToken, deviceId, ...payload });
}

export async function updateWhitelistUser(
  oldEmailOrUser: string | WhitelistUser,
  newEmail?: string,
): Promise<void> {
  const payload: {
    oldEmail: string; email?: string; name?: string; userId?: string;
    deviceId?: string; isActive?: boolean; lastLogin?: number | null;
  } = { oldEmail: '' };

  if (typeof oldEmailOrUser === 'string') {
    payload.oldEmail = oldEmailOrUser;
    if (newEmail) payload.email = newEmail.toLowerCase().trim();
  } else {
    payload.oldEmail = oldEmailOrUser.email;
    if (oldEmailOrUser.name     !== undefined) payload.name     = oldEmailOrUser.name;
    if (oldEmailOrUser.userId   !== undefined) payload.userId   = oldEmailOrUser.userId;
    if (oldEmailOrUser.deviceId !== undefined) payload.deviceId = oldEmailOrUser.deviceId;
    if (oldEmailOrUser.email    !== undefined) payload.email    = oldEmailOrUser.email.toLowerCase().trim();
    if (oldEmailOrUser.isActive !== undefined) payload.isActive = oldEmailOrUser.isActive;
    else if (oldEmailOrUser.is_active !== undefined) payload.isActive = oldEmailOrUser.is_active;
    if (oldEmailOrUser.lastLogin !== undefined) payload.lastLogin = oldEmailOrUser.lastLogin;
  }

  // C2: tulis via backend (service_role)
  await api.admin.updateWhitelist(payload);
}

export async function toggleWhitelistUserStatus(
  emailOrUser: string | WhitelistUser,
  isActive?: boolean,
): Promise<void> {
  let email: string;
  let active: boolean;

  if (typeof emailOrUser === 'string') {
    email  = emailOrUser;
    active = isActive ?? true;
  } else {
    // Toggle current state — gunakan is_active (DB) atau isActive (UI alias)
    email  = emailOrUser.email;
    const current = emailOrUser.is_active ?? emailOrUser.isActive ?? true;
    active = !current;
  }

  await api.admin.toggleWhitelist(email.toLowerCase().trim(), active);
}

export async function deleteWhitelistUser(emailOrId: string): Promise<void> {
  // Backend mencoba hapus by email lalu fallback by id (service_role)
  await api.admin.deleteWhitelist(emailOrId);
}

export async function importWhitelistUsers(
  emailsOrUsers: string[] | any[],
  addedBy?: string,
): Promise<ImportResult> {
  if (emailsOrUsers.length === 0) return { success: 0, skipped: 0 };

  // Normalisasi ke array objek; backend (service_role) yang insert + hitung skip.
  const rows = (emailsOrUsers as any[]).map((u) =>
    typeof u === 'string' ? { email: u } : u,
  );

  return api.admin.importWhitelist(rows, addedBy);
}

// ✅ FIX Bug 5: langsung trigger browser download — tidak lagi return string
export function exportWhitelistAsJson(users: WhitelistUser[]): void {
  const json = JSON.stringify(users, null, 2);
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `whitelist-${isoDate()}.json`,
  );
}

// ✅ FIX Bug 5: langsung trigger browser download — tidak lagi return string
export function exportWhitelistAsCsv(users: WhitelistUser[]): void {
  const header = 'email,name,user_id,device_id,is_active,added_at,added_by,last_login';
  const rows = users.map(u =>
    [
      u.email,
      escapeCsv(u.name       ?? ''),
      escapeCsv(u.userId     ?? ''),
      escapeCsv(u.deviceId   ?? ''),
      u.isActive ?? u.is_active ?? true,
      u.added_at  ?? '',
      escapeCsv(u.addedBy    ?? u.added_by ?? ''),
      u.last_login ?? '',
    ].join(',')
  );
  triggerDownload(
    new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `whitelist-${isoDate()}.csv`,
  );
}

export async function getWhitelistUserByEmail(email: string): Promise<WhitelistUser | null> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getWhitelistUserByEmail error:', error);
    return null;
  }
  return data ? normalizeWhitelistUser(data) : null;
}

export async function getWhitelistUserByUserId(userId: string): Promise<WhitelistUser | null> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const { data: byEmail, error: emailErr } = await supabase
      .from('whitelist_users')
      .select('*')
      .eq('email', userId.toLowerCase().trim())
      .maybeSingle();
    if (emailErr) return null;
    return byEmail ? normalizeWhitelistUser(byEmail) : null;
  }
  return data ? normalizeWhitelistUser(data) : null;
}

export async function updateLastLogin(_email: string): Promise<void> {
  // C2: no-op. last_login kini di-update server-side saat /auth/login (manual)
  // dan saat /auth/register-whitelist (registrasi). Penulisan whitelist_users
  // dari browser diblokir RLS (anon). Dipertahankan demi kompatibilitas signature.
}

export async function isWhitelisted(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] isWhitelisted error:', error);
    return false;
  }
  return !!data;
}

export async function checkWhitelist(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[Supabase] checkWhitelist error:', error);
    return false;
  }
  return !!data;
}

// ─────────────────────────────────────────────
// ADMIN USERS
// ─────────────────────────────────────────────

export async function getAdminUsers(): Promise<AdminUser[]> {
  const data = await api.admin.listAdmins();

  return (data ?? []).map((row: any) => ({
    id:         row.id,
    email:      row.email,
    name:       row.name || row.email.split('@')[0],
    role:       (row.role as 'admin' | 'super_admin') || 'admin',
    is_active:  row.is_active,
    created_at: row.created_at,
    expires_at: row.expires_at ?? null,
  }));
}

export async function addAdminUser(
  email: string,
  name?: string,
  role?: string,
  _addedBy?: string,
): Promise<void> {
  // C2: backend (super-admin guarded) — termasuk sync super_admins
  await api.admin.addAdmin(email.toLowerCase().trim(), name, role);
}

export async function updateAdminUser(
  id: string,
  updates: { name?: string; role?: 'admin' | 'super_admin'; is_active?: boolean },
): Promise<void> {
  // C2: backend (super-admin guarded) — termasuk sync super_admins
  await api.admin.updateAdmin(id, updates);
}

export async function removeAdminUser(emailOrId: string): Promise<void> {
  // C2: backend (super-admin guarded) — termasuk sync super_admins
  await api.admin.removeAdmin(emailOrId);
}

export async function checkIsAdmin(_email?: string): Promise<boolean> {
  // C2: cek role user SAAT INI dari JWT (bukan email arbitrer). admin_users
  // tak lagi dapat dibaca anon, jadi pengecekan dilakukan backend.
  try {
    const { isAdmin } = await api.admin.me();
    return isAdmin;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// SUPER ADMIN
// ─────────────────────────────────────────────

export async function getAllSuperAdmins(): Promise<{ id?: string; email: string; created_at?: string }[]> {
  const data = await api.admin.listSuperAdmins();
  return (data ?? []) as { id?: string; email: string; created_at?: string }[];
}

export async function addSuperAdmin(email: string): Promise<void> {
  await api.admin.addSuperAdmin(email.toLowerCase().trim());
}

export async function deleteSuperAdmin(email: string): Promise<void> {
  await api.admin.deleteSuperAdmin(email.toLowerCase().trim());
}

export async function checkIsSuperAdmin(_email?: string): Promise<boolean> {
  // C2: cek role user SAAT INI dari JWT via backend
  try {
    const { isSuperAdmin } = await api.admin.me();
    return isSuperAdmin;
  } catch {
    return false;
  }
}

/** Ambil email super admin pertama — dipakai sebagai addedBy saat primary registration */
export async function getSuperAdminEmail(): Promise<string> {
  try {
    const list = await api.admin.listSuperAdmins();
    const first = (list ?? [])[0]?.email;
    if (first) return first;
  } catch { /* non-admin / error → fallback */ }
  return 'super_admin';
}

// ─────────────────────────────────────────────
// APP CONFIG / REGISTRATION CONFIG
// ─────────────────────────────────────────────

export async function getAppConfig(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from('app_config').select('*');
  if (error) {
    console.error('[Supabase] getAppConfig error:', error);
    throw new Error('Gagal memuat app config: ' + error.message);
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value, updated_at')
    .eq('key', 'registration')
    .maybeSingle();

  const defaults: RegistrationConfig = {
    minStockity:             100000,
    maxRetries:              3,
    lockDuration:            24,
    maintenance:             false,
    whatsappHelpUrl:         '',
    stockityReferral:        '',
    updatedAt:               0,
  };

  if (error || !data?.value) return defaults;

  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return {
      minStockity:            v.minStockity     ?? 100000,
      maxRetries:             v.maxRetries      ?? 3,
      lockDuration:           v.lockDuration    ?? 24,
      maintenance:            v.maintenance     ?? false,
      whatsappHelpUrl:        v.whatsappHelpUrl  ?? '',
      stockityReferral:       v.stockityReferral ?? '',
      updatedAt:       data.updated_at
        ? new Date(data.updated_at).getTime()
        : v.updatedAt ?? 0,
    };
  } catch {
    return defaults;
  }
}

export async function updateRegistrationConfig(
  configOrField: Partial<RegistrationConfig> | string,
  val?: string,
): Promise<void> {
  let merged: RegistrationConfig;

  if (typeof configOrField === 'string' && val !== undefined) {
    // Called as updateRegistrationConfig(field, val) from admin page
    const current = await getRegistrationConfig();
    merged = { ...current, [configOrField]: val };
  } else {
    const current = await getRegistrationConfig();
    merged = { ...current, ...(configOrField as Partial<RegistrationConfig>) };
  }

  // C2: tulis app_config via backend (service_role)
  await api.admin.upsertConfig('registration', JSON.stringify(merged));
}


export async function getUserStatistics(
  _email?: string,
  _superAdmin?: boolean,
): Promise<{ total: number; active: number; inactive: number; recent: number; recentAdded: number }> {
  // C2: dihitung backend (admin-guarded, scope super/non-super ditentukan server)
  return api.admin.stats();
}

export async function getAllUsersForStats(
  _email?: string,
  _superAdmin?: boolean,
): Promise<
  { uid: string; email: string; firstLogin: string | null; lastLogin: string | null; totalTrades: number }[]
> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[Supabase] getAllUsersForStats error:', error);
    return [];
  }

  return (data ?? []).map((u: any) => ({
    uid:         u.id    ?? u.email,
    email:       u.email,
    firstLogin:  u.added_at   ?? null,
    lastLogin:   u.last_login ?? u.added_at ?? null,
    totalTrades: 0,
  }));
}

// ─────────────────────────────────────────────
// REMOTE CONFIG / WEB SOCKET URL
// ─────────────────────────────────────────────

export async function getWebSocketUrl(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'ws_url')
    .maybeSingle();

  if (error || !data) return null;
  return (data.value as string | null) ?? null;
}

export async function updateWebSocketUrl(url: string): Promise<void> {
  await api.admin.upsertConfig('ws_url', url);
}

export async function getRemoteConfig(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('app_config')
    .select('*')
    .eq('key', 'singleton')
    .maybeSingle();

  if (error || !data) return {};
  try {
    if (typeof data.value === 'string') return JSON.parse(data.value);
    return (data.value as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// REALTIME SUBSCRIPTION
// ─────────────────────────────────────────────

export function subscribeToTable(table: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}

// ─────────────────────────────────────────────
// HELPERS (private)
// ─────────────────────────────────────────────

/** Normalize a DB row into a WhitelistUser with both snake_case and camelCase fields */
function normalizeWhitelistUser(row: any): WhitelistUser {
  const addedAtMs   = row.added_at   ? new Date(row.added_at).getTime()   : undefined;
  const lastLoginMs = row.last_login ? new Date(row.last_login).getTime() : undefined;

  return {
    // DB fields (snake_case)
    id:         row.id,
    email:      row.email,
    is_active:  row.is_active,
    added_at:   row.added_at,
    added_by:   row.added_by,
    last_login: row.last_login,
    // UI camelCase aliases
    isActive:   row.is_active,
    addedAt:    addedAtMs,
    addedBy:    row.added_by,
    createdAt:  addedAtMs,
    lastLogin:  lastLoginMs,
    // Optional extended fields
    name:       row.name      ?? undefined,
    userId:     row.user_id   ?? undefined,
    deviceId:   row.device_id ?? undefined,
    is_primary: row.is_primary ?? false,
    isPrimary:  row.is_primary ?? false,
  };
}

/** Format today's date as YYYY-MM-DD for filenames */
function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Escape a value for CSV (wrap in quotes if contains comma, newline, or quote) */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Trigger a browser file download */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke setelah delay kecil agar browser sempat mulai download
  setTimeout(() => URL.revokeObjectURL(url), 500);
}