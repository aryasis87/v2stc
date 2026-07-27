// lib/engine/tokenProbe.ts
// ─────────────────────────────────────────────────────────────────────
// Diagnostik sementara (v4): cari kombinasi header yang diterima Stockity
// saat memakai authtoken hasil login dari perangkat.
//
// Latar: login berhasil dan field token sudah benar (data.authtoken, 36
// karakter), tetapi Stockity membalas 422 "unauthorized" — baik dari HP
// maupun dari Edge Function. Fungsi ini mencoba beberapa variasi header
// dalam satu kali login lalu melaporkan mana yang lolos, sehingga akar
// masalahnya terlihat tanpa menebak.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorHttp } from '@capacitor/core';

const BASE = 'https://api.stockity1.id';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

/**
 * Coba ambil profil dengan beberapa variasi header.
 * @returns ringkasan pendek, mis. "A=422 B=200 C=422 D=422"
 */
export async function probeToken(authToken: string, deviceId: string): Promise<string> {
  const base: Record<string, string> = {
    'device-id':     deviceId,
    'device-type':   'web',
    'user-timezone': 'Asia/Bangkok',
    'Accept':        'application/json, text/plain, */*',
    'User-Agent':    UA,
    'Origin':        'https://stockity1.id',
    'Referer':       'https://stockity1.id/',
  };

  const variants: Record<string, Record<string, string>> = {
    // A: seperti server lama (header authorization-token saja)
    A: { ...base, 'authorization-token': authToken },
    // B: tambah cookie authtoken (seperti klien web)
    B: { ...base, 'authorization-token': authToken, 'Cookie': `authtoken=${authToken}; device_id=${deviceId}; device_type=web` },
    // C: skema Bearer
    C: { ...base, 'Authorization': `Bearer ${authToken}` },
    // D: device-type android (bukan web)
    D: { ...base, 'device-type': 'android', 'authorization-token': authToken },
    // E: tanpa Origin/Referer (beberapa gateway menolak asal-usul yang tak cocok)
    E: {
      'device-id': deviceId, 'device-type': 'web', 'user-timezone': 'Asia/Bangkok',
      'Accept': 'application/json', 'authorization-token': authToken,
    },
  };

  const out: string[] = [];
  for (const [name, headers] of Object.entries(variants)) {
    try {
      const res = await CapacitorHttp.get({
        url: `${BASE}/platform/private/v2/profile?locale=id`,
        headers, readTimeout: 12000, connectTimeout: 12000,
      });
      out.push(`${name}=${res?.status ?? 0}`);
    } catch {
      out.push(`${name}=ERR`);
    }
  }
  return out.join(' ');
}
