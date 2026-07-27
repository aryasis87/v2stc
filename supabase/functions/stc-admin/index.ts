// supabase/functions/stc-admin/index.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase C — OPERASI ADMIN TANPA VPS.
// Menggantikan seluruh /admin/* di botstc (whitelist, admin users,
// super admin, app_config, statistik).
//
// Autentikasi: TIDAK memakai JWT aplikasi. Pemanggil mengirim authtoken
// Stockity; fungsi memvalidasinya ke Stockity untuk mendapat email
// otoritatif, lalu memeriksa tabel `admin_users`/`super_admins`.
// Semua penulisan memakai service_role (anon diblokir RLS).
//
// Endpoint: POST /functions/v1/stc-admin
//   { authToken, deviceId?, action, payload? }
//
// action:
//   me · listWhitelist · addWhitelist · updateWhitelist · toggleWhitelist
//   deleteWhitelist · importWhitelist · stats
//   listAdmins · addAdmin · updateAdmin · removeAdmin
//   listSuperAdmins · addSuperAdmin · deleteSuperAdmin
//   getConfig · upsertConfig
//
// Deploy: supabase functions deploy stc-admin --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STOCKITY_BASE = 'https://api.stockity1.id';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function stockityEmail(authToken: string, deviceId: string): Promise<string | null> {
  const res = await fetch(`${STOCKITY_BASE}/platform/private/v2/profile?locale=id`, {
    headers: {
      'device-id': deviceId || '',
      'device-type': 'web',
      'user-timezone': 'Asia/Bangkok',
      'authorization-token': authToken,
      'User-Agent': DEFAULT_UA,
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://stockity1.id',
      'Referer': 'https://stockity1.id/',
    },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const email = String(body?.data?.email ?? '').toLowerCase().trim();
  return email || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Body JSON tidak valid' }, 400); }

  const { authToken, deviceId = '', action, payload = {} } = body ?? {};
  if (!authToken) return json({ error: 'authToken wajib diisi' }, 401);
  if (!action) return json({ error: 'action wajib diisi' }, 400);

  const email = await stockityEmail(authToken, deviceId);
  if (!email) return json({ error: 'Token Stockity tidak valid' }, 401);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ── Otorisasi: hanya admin aktif; sebagian aksi khusus super admin ──
  const [{ data: adm }, { data: sup }] = await Promise.all([
    db.from('admin_users').select('role, is_active').eq('email', email).maybeSingle(),
    db.from('super_admins').select('email').eq('email', email).maybeSingle(),
  ]);

  const isSuperAdmin = !!sup || adm?.role === 'super_admin';
  const isAdmin = (!!adm && adm.is_active !== false) || isSuperAdmin;

  if (action === 'me') return json({ email, isAdmin, isSuperAdmin, role: adm?.role ?? (isSuperAdmin ? 'super_admin' : null) });
  if (!isAdmin) return json({ error: 'Akses ditolak — bukan admin' }, 403);

  const superOnly = new Set([
    'addAdmin', 'updateAdmin', 'removeAdmin',
    'listSuperAdmins', 'addSuperAdmin', 'deleteSuperAdmin',
  ]);
  if (superOnly.has(action) && !isSuperAdmin) {
    return json({ error: 'Akses ditolak — khusus super admin' }, 403);
  }

  const now = new Date().toISOString();
  const lower = (v: unknown) => String(v ?? '').toLowerCase().trim();

  try {
    switch (action) {
      // ── Whitelist ──
      case 'listWhitelist': {
        const { data, error } = await db.from('whitelist_users').select('*').order('added_at', { ascending: false });
        if (error) throw error;
        return json(data ?? []);
      }
      case 'addWhitelist': {
        const { error } = await db.from('whitelist_users').insert({
          email: lower(payload.email), name: payload.name ?? null,
          user_id: payload.userId ?? null, device_id: payload.deviceId ?? null,
          is_active: true, is_primary: payload.isPrimary ?? false,
          added_at: now, added_by: payload.addedBy ?? email, last_login: null,
        });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'updateWhitelist': {
        const patch: Record<string, unknown> = {};
        if (payload.email    !== undefined) patch.email     = lower(payload.email);
        if (payload.name     !== undefined) patch.name      = payload.name;
        if (payload.userId   !== undefined) patch.user_id   = payload.userId;
        if (payload.deviceId !== undefined) patch.device_id = payload.deviceId;
        if (payload.isActive !== undefined) patch.is_active = payload.isActive;
        if (payload.realAccess !== undefined) patch.real_access = payload.realAccess;
        const { error } = await db.from('whitelist_users').update(patch).eq('email', lower(payload.oldEmail));
        if (error) throw error;
        return json({ ok: true });
      }
      case 'toggleWhitelist': {
        const { error } = await db.from('whitelist_users')
          .update({ is_active: payload.isActive === true })
          .eq('email', lower(payload.email));
        if (error) throw error;
        return json({ ok: true });
      }
      case 'deleteWhitelist': {
        const key = String(payload.emailOrId ?? '');
        let res = await db.from('whitelist_users').delete().eq('email', lower(key));
        if (res.error) res = await db.from('whitelist_users').delete().eq('id', key);
        if (res.error) throw res.error;
        return json({ ok: true });
      }
      case 'importWhitelist': {
        const rows = (Array.isArray(payload.rows) ? payload.rows : []).map((r: any) => ({
          email: lower(typeof r === 'string' ? r : r.email),
          name: typeof r === 'string' ? null : (r.name ?? null),
          user_id: typeof r === 'string' ? null : (r.userId ?? null),
          is_active: true, added_at: now, added_by: payload.addedBy ?? email,
        })).filter((r: any) => r.email.includes('@') || r.user_id);
        if (rows.length === 0) return json({ success: 0, skipped: 0 });
        const { data, error } = await db.from('whitelist_users')
          .upsert(rows, { onConflict: 'email', ignoreDuplicates: true }).select('email');
        if (error) throw error;
        const success = data?.length ?? 0;
        return json({ success, skipped: rows.length - success });
      }
      case 'stats': {
        const count = async (q: any) => (await q).count ?? 0;
        const total    = await count(db.from('whitelist_users').select('email', { count: 'exact', head: true }));
        const active   = await count(db.from('whitelist_users').select('email', { count: 'exact', head: true }).eq('is_active', true));
        const dayAgo   = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const recent   = await count(db.from('whitelist_users').select('email', { count: 'exact', head: true }).gte('last_login', dayAgo));
        const added    = await count(db.from('whitelist_users').select('email', { count: 'exact', head: true }).gte('added_at', dayAgo));
        return json({ total, active, inactive: total - active, recent, recentAdded: added });
      }

      // ── Admin & super admin ──
      case 'listAdmins': {
        const { data, error } = await db.from('admin_users').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return json(data ?? []);
      }
      case 'addAdmin': {
        const { error } = await db.from('admin_users').insert({
          email: lower(payload.email), name: payload.name ?? null,
          role: payload.role ?? 'admin', is_active: true, created_at: now,
        });
        if (error) throw error;
        if (payload.role === 'super_admin') {
          await db.from('super_admins').upsert({ email: lower(payload.email) }, { onConflict: 'email' });
        }
        return json({ ok: true });
      }
      case 'updateAdmin': {
        const patch: Record<string, unknown> = {};
        if (payload.name      !== undefined) patch.name      = payload.name;
        if (payload.role      !== undefined) patch.role      = payload.role;
        if (payload.is_active !== undefined) patch.is_active = payload.is_active;
        const { error } = await db.from('admin_users').update(patch).eq('id', payload.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'removeAdmin': {
        const key = String(payload.emailOrId ?? '');
        let res = await db.from('admin_users').delete().eq('email', lower(key));
        if (res.error) res = await db.from('admin_users').delete().eq('id', key);
        if (res.error) throw res.error;
        await db.from('super_admins').delete().eq('email', lower(key));
        return json({ ok: true });
      }
      case 'listSuperAdmins': {
        const { data, error } = await db.from('super_admins').select('*');
        if (error) throw error;
        return json(data ?? []);
      }
      case 'addSuperAdmin': {
        const { error } = await db.from('super_admins').upsert({ email: lower(payload.email) }, { onConflict: 'email' });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'deleteSuperAdmin': {
        const { error } = await db.from('super_admins').delete().eq('email', lower(payload.email));
        if (error) throw error;
        return json({ ok: true });
      }

      // ── Konfigurasi aplikasi ──
      case 'getConfig': {
        const { data, error } = await db.from('app_config').select('*');
        if (error) throw error;
        return json(data ?? []);
      }
      case 'upsertConfig': {
        const { error } = await db.from('app_config')
          .upsert({ key: payload.key, value: payload.value, updated_at: now }, { onConflict: 'key' });
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: `action tidak dikenal: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Kesalahan tak terduga' }, 500);
  }
});
