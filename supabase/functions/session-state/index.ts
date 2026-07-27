// supabase/functions/session-state/index.ts
// ─────────────────────────────────────────────────────────────────────
// v4 — Penyimpanan & pemulihan sesi trading perangkat (pengganti VPS).
//
// KENAPA ADA: RLS mengunci tabel backend dari anon key (terverifikasi:
// READ 200, WRITE 401), sementara aplikasi di perangkat tidak boleh
// memegang service_role. Fungsi ini memegang service_role di sisi server
// dan hanya menulis untuk user yang TERBUKTI memiliki akun Stockity —
// dibuktikan dengan memvalidasi authtoken ke Stockity (pola sama dengan
// registerWhitelistFromToken di botstc). user_id diambil dari respons
// Stockity (otoritatif), BUKAN dari body request.
//
// Endpoint: POST /functions/v1/session-state
//   body: { authToken, deviceId?, action: 'save'|'load'|'clear', state? }
//   save  → upsert schedule_configs (asset/martingale/orders/…) + schedule_status
//   load  → { config, status } untuk melanjutkan sesi yang tertunda
//   clear → tandai sesi berhenti
//
// Deploy: supabase functions deploy session-state --no-verify-jwt
//   (--no-verify-jwt karena autentikasi memakai token Stockity, bukan JWT Supabase)
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
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Validasi token Stockity → identitas otoritatif (user_id + email) */
async function verifyStockity(authToken: string, deviceId: string) {
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
  const d = body?.data ?? {};
  const userId = String(d.id ?? '').trim();
  if (!userId) return null;
  return { userId, email: String(d.email ?? '').toLowerCase().trim() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Body JSON tidak valid' }, 400); }

  const { authToken, deviceId = '', action, state, logs } = body ?? {};
  if (!authToken) return json({ error: 'authToken wajib diisi' }, 401);
  if (!['save', 'load', 'clear', 'log'].includes(action)) return json({ error: 'action tidak dikenal' }, 400);

  const who = await verifyStockity(authToken, deviceId);
  if (!who) return json({ error: 'Token Stockity tidak valid' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const now = new Date().toISOString();

  try {
    if (action === 'load') {
      const [cfg, st] = await Promise.all([
        supabase.from('schedule_configs').select('*').eq('user_id', who.userId).maybeSingle(),
        supabase.from('schedule_status').select('*').eq('user_id', who.userId).maybeSingle(),
      ]);
      return json({ userId: who.userId, config: cfg.data ?? null, status: st.data ?? null });
    }

    if (action === 'log') {
      // Riwayat eksekusi dari engine perangkat → tabel yang SAMA dengan engine
      // server (`mode_logs`), sehingga halaman Riwayat tidak perlu dua sumber.
      const arr = Array.isArray(logs) ? logs : [];
      if (arr.length === 0) return json({ ok: true, saved: 0 });
      const rows = arr.slice(0, 100).map((l: any) => ({
        id:          String(l.id),
        user_id:     who.userId,
        mode:        l.mode ?? 'schedule',
        data:        l,
        executed_at: new Date(Number(l.executedAt) || Date.now()).toISOString(),
      }));
      const { error } = await supabase.from('mode_logs').upsert(rows, { onConflict: 'id' });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, saved: rows.length });
    }

    if (action === 'clear') {
      await supabase.from('schedule_status').upsert({
        user_id: who.userId, bot_state: 'STOPPED', stopped_at: now, updated_at: now,
      }, { onConflict: 'user_id' });
      return json({ ok: true });
    }

    // save — orders & konfigurasi disimpan agar sesi bisa dilanjutkan
    const s = state ?? {};
    const cfgRow = {
      user_id:         who.userId,
      asset:           s.asset ?? null,
      martingale:      s.martingale ?? null,
      is_demo_account: s.isDemoAccount ?? true,
      currency:        s.currency ?? null,
      currency_iso:    s.currencyIso ?? null,
      stop_loss:       s.stopLoss ?? 0,
      stop_profit:     s.stopProfit ?? 0,
      orders:          s.orders ?? [],
      updated_at:      now,
    };
    const statusRow: Record<string, unknown> = {
      user_id:     who.userId,
      bot_state:   s.botState ?? 'RUNNING',
      session_pnl: s.sessionPnL ?? 0,
      updated_at:  now,
    };
    if (s.startedAt) statusRow.started_at = new Date(s.startedAt).toISOString();
    if (s.botState === 'STOPPED') statusRow.stopped_at = now;

    const [c, st] = await Promise.all([
      supabase.from('schedule_configs').upsert(cfgRow,   { onConflict: 'user_id' }),
      supabase.from('schedule_status').upsert(statusRow, { onConflict: 'user_id' }),
    ]);
    if (c.error || st.error) {
      return json({ error: c.error?.message ?? st.error?.message ?? 'Gagal menyimpan' }, 500);
    }
    return json({ ok: true, userId: who.userId });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Kesalahan tak terduga' }, 500);
  }
});
