// supabase/functions/stc-auth/index.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase C — SESI & REGISTRASI TANPA VPS.
//
// Menggantikan endpoint botstc: /auth/login, /auth/register-whitelist,
// /auth/stockity-token, /auth/me, /auth/logout.
//
// Perubahan alur (inti v4): LOGIN KE STOCKITY DILAKUKAN DI PERANGKAT
// (IP milik user sendiri — inilah tujuan meninggalkan VPS). Perangkat
// mengirim authtoken hasil login ke sini; fungsi ini memvalidasi token
// ke Stockity lalu menulis `sessions` + `whitelist_users` memakai
// service_role (anon diblokir RLS). user_id & email diambil dari respons
// Stockity — otoritatif, bukan dari body request.
//
// Endpoint: POST /functions/v1/stc-auth
//   { authToken, deviceId?, deviceType?, action: 'session'|'register'|'logout',
//     password? }
//     session  → upsert sesi + whitelist; balikan flag akses.
//                `password` opsional: disimpan ke kolom "PK" HANYA bila akun
//                terbukti bukan afiliasi (lihat gerbang simpanPK di bawah).
//                Bot Telegram memakai PK untuk login ulang saat token mati.
//     register → sama, plus buka real_access bila akun Stockity masih baru
//                (<48 jam) — mengunci mode REAL hanya untuk pendaftar afiliasi
//     logout   → tandai sesi berakhir
//
// Deploy: supabase functions deploy stc-auth --no-verify-jwt
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

/**
 * Validasi token ke Stockity → profil otoritatif.
 * Mengembalikan detail kegagalan (status + cuplikan balasan) agar penyebab
 * sebenarnya terlihat di aplikasi, bukan sekadar "token tidak valid".
 */
async function stockityProfile(authToken: string, deviceId: string): Promise<
  { ok: true; userId: string; email: string; profile: any } |
  { ok: false; status: number; detail: string }
> {
  let res: Response;
  try {
    res = await fetch(`${STOCKITY_BASE}/platform/private/v2/profile?locale=id`, {
      headers: {
        'device-id': deviceId || '',
        'device-type': 'web',
        'user-timezone': 'Asia/Bangkok',
        'authorization-token': authToken,
        // Sebagian endpoint Stockity juga membaca cookie authtoken
        'Cookie': `authtoken=${authToken}; device_id=${deviceId}; device_type=web`,
        'User-Agent': DEFAULT_UA,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://stockity1.id',
        'Referer': 'https://stockity1.id/',
      },
    });
  } catch (e) {
    return { ok: false, status: 0, detail: `tidak dapat menghubungi Stockity: ${(e as Error).message}` };
  }

  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 200) };

  let body: any = null;
  try { body = JSON.parse(text); } catch { /* bukan JSON */ }
  const d = body?.data ?? {};
  const userId = String(d.id ?? '').trim();
  if (!userId) return { ok: false, status: res.status, detail: `profil tanpa id: ${text.slice(0, 150)}` };

  return { ok: true, userId, email: String(d.email ?? '').toLowerCase().trim(), profile: d };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Body JSON tidak valid' }, 400); }

  const { authToken, deviceId = '', deviceType = 'web', action = 'session', password = '' } = body ?? {};
  if (!authToken) return json({ error: 'authToken wajib diisi' }, 401);
  if (!['session', 'register', 'logout', 'device-hint'].includes(action)) return json({ error: 'action tidak dikenal' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // device-hint: kembalikan device_id yang sudah dikenal akun ini.
  // Stockity mengikat sesi ke device-id; memakai device lama membuat token
  // hasil login langsung sah tanpa verifikasi perangkat baru.
  if (action === "device-hint") {
    const email = String(body?.email ?? "").toLowerCase().trim();
    if (!email) return json({ error: "email wajib diisi" }, 400);
    const { data: sess } = await supabase
      .from("sessions").select("device_id").eq("email", email).maybeSingle();
    let devId = sess?.device_id ?? null;
    if (!devId) {
      const { data: wl } = await supabase
        .from("whitelist_users").select("device_id").eq("email", email).maybeSingle();
      devId = wl?.device_id ?? null;
    }
    return json({ deviceId: devId });
  }

  const check = await stockityProfile(authToken, deviceId);
  if (!check.ok) {
    // Sertakan status & cuplikan balasan Stockity agar penyebabnya jelas
    return json({ error: 'Validasi token Stockity gagal (HTTP ' + check.status + '): ' + check.detail }, 401);
  }
  const who = check;

  const now = new Date().toISOString();

  try {
    if (action === 'logout') {
      await supabase.from('sessions').update({ logged_out_at: now, updated_at: now }).eq('user_id', who.userId);
      return json({ ok: true });
    }

    const d = who.profile ?? {};

    // ── Boleh menyimpan kata sandi (kolom "PK")? ──────────────────────────
    //
    // PK dipakai bot Telegram di VPS untuk login ulang saat stockity_token
    // kedaluwarsa. Aturannya satu kalimat: PK ada persis pada akun yang
    // memang dipantau bot.
    //
    //   monitored = TRUE  -> PK ditulis. Bot memang sudah memanggil Stockity
    //                        untuk akun ini, jadi PK tidak menambah paparan
    //                        apa pun — ia justru mencegah pemantauan berhenti
    //                        diam-diam ketika token mati.
    //   monitored = FALSE -> tidak pernah. Ini akun afiliasi v4; tidak boleh
    //                        ada satu pun jalan bagi VPS menyentuhnya.
    //   monitored = NULL  -> tidak juga. Penyaring bot memakai .eq(TRUE),
    //                        sehingga baris NULL tidak dipantau; PK-nya akan
    //                        menganggur dan hanya menambah risiko.
    //
    // Jadi `monitored` adalah SATU-SATUNYA penentu. Sengaja tidak melihat
    // added_by: akun afiliasi yang terdaftar sebelum v4 diperlakukan sama
    // seperti user lama — tetap dipantau, jadi tetap perlu PK.
    //
    // Keputusan diambil DI SINI dari isi basis data, bukan dari klaim
    // aplikasi. Bila pemeriksaannya bermasalah, PK tidak ditulis: salah tidak
    // menyimpan hanya berakibat user perlu masuk lagi, salah menyimpan
    // berakibat akun afiliasi punya jalan untuk disentuh VPS.
    let simpanPK = false;
    if (action === 'session' && password) {
      const sesiLama = await supabase
        .from('sessions').select('monitored').eq('user_id', who.userId).maybeSingle();
      // User BARU belum punya baris sesi; upsert di bawah membuatnya dengan
      // monitored default TRUE (dipantau). Karena itu ketiadaan baris berarti
      // "akan dipantau", bukan "tidak diketahui" — perlakukan seperti TRUE.
      // Tanpa ini, login PERTAMA setiap user non-afiliasi tak pernah dapat PK,
      // karena monitored dibaca dari baris yang belum ada (null).
      const monitored = sesiLama.data ? sesiLama.data.monitored : true;
      simpanPK = !sesiLama.error && monitored === true;
    }

    // ── Sesi (dipakai lintas perangkat & untuk audit) ──
    // Akun hasil pendaftaran v4 ditandai TIDAK dipantau: bot Telegram di VPS
    // dilarang memanggil API Stockity untuk sesi ini, agar aktivitas akun
    // afiliasi tidak pernah berasal dari IP VPS. Pada aksi 'session' kolom ini
    // sengaja tidak disertakan supaya nilai yang sudah ada tidak tertimpa.
    await supabase.from('sessions').upsert({
      user_id:        who.userId,
      email:          who.email,
      stockity_token: authToken,
      device_id:      deviceId || who.userId,
      device_type:    deviceType,
      currency:       d.currency ?? null,
      logged_out_at:  null,
      updated_at:     now,
      ...(action === 'register' ? { monitored: false, PK: null } : {}),
      ...(simpanPK ? { PK: password } : {}),
    }, { onConflict: 'user_id' });

    // ── Whitelist: idempoten, simpan profil bila kolomnya ada ──
    const { data: existing } = await supabase
      .from('whitelist_users')
      .select('id, is_active, real_access')
      .eq('email', who.email)
      .maybeSingle();

    // v4: hanya alur register yang boleh MEMBUKA akses REAL, dan hanya bila
    // akun Stockity masih baru (<48 jam) supaya akun lama tak bisa "numpang"
    // mendaftar tanpa melewati kode afiliasi. Akses tidak pernah dicabut di sini.
    let grantReal = false;
    if (action === 'register') {
      const createdAtMs = d.created_at ? Date.parse(String(d.created_at)) : NaN;
      grantReal = Number.isNaN(createdAtMs) ? true : (Date.now() - createdAtMs < 48 * 3600 * 1000);
    }

    const fullName =
      [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.nickname ?? '') || null;

    const baseRow: Record<string, unknown> = existing
      ? { name: fullName, last_login: now }
      : {
          email: who.email, is_active: true, is_primary: false,
          added_at: now, added_by: action === 'register' ? 'selfregister' : 'login',
          name: fullName, user_id: who.userId, device_id: deviceId || who.userId,
          last_login: now,
        };

    const fullRow: Record<string, unknown> = {
      ...baseRow,
      first_name: d.first_name ?? null,
      last_name:  d.last_name ?? null,
      phone:      d.phone ?? null,
      country:    d.country ?? null,
      currency:   d.currency ?? null,
      profile:    d ?? null,
      ...(grantReal ? { real_access: true } : {}),
    };

    const write = (row: Record<string, unknown>) =>
      existing
        ? supabase.from('whitelist_users').update(row).eq('email', who.email)
        : supabase.from('whitelist_users').insert(row);

    const res1 = await write(fullRow);
    if (res1.error) await write(baseRow); // kolom profil belum dimigrasi → versi dasar

    // ── Status akses untuk klien ──
    const { data: wl } = await supabase
      .from('whitelist_users')
      .select('is_active, real_access')
      .eq('email', who.email)
      .maybeSingle();

    const { data: adm } = await supabase
      .from('admin_users')
      .select('role, is_active')
      .eq('email', who.email)
      .maybeSingle();

    return json({
      userId:     who.userId,
      email:      who.email,
      currency:   d.currency ?? null,
      country:    d.country ?? null,
      isActive:   wl?.is_active ?? true,
      realAccess: wl?.real_access === true,
      isAdmin:    !!adm?.is_active,
      role:       adm?.role ?? null,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Kesalahan tak terduga' }, 500);
  }
});
