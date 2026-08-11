// lib/adminEntitlement.ts
// ─────────────────────────────────────────────
// Admin & super admin berhak atas SEMUA fitur terkunci (mode REAL, AI Signal,
// Fast Reversal) tanpa perlu didaftarkan ke allowlist masing-masing.
//
// Alasannya praktis: merekalah yang mengelola daftar itu lewat panel di halaman
// profil. Mengunci mereka dari fiturnya sendiri berarti panelnya tidak bisa
// diuji tanpa lebih dulu mendaftarkan diri sendiri — dan itu mengotori data
// yang seharusnya berisi pengguna sungguhan.
//
// Dipakai DI DALAM helper akses (realAccess / aiSignalAccess /
// fastReversalAccess), bukan di pemanggilnya, supaya semua tempat yang
// menanyakan "boleh tidak?" mendapat jawaban yang sama — dashboard, lencana di
// profil, dan pemeriksaan saat menekan Mulai.
//
// CATATAN: panel admin SENGAJA tetap menampilkan isi allowlist apa adanya.
// Panel itu menyunting penyimpanan; menampilkan admin sebagai "tercentang"
// padahal tidak tersimpan akan membuat tombol simpan berbohong.
//
// KENAPA HASILNYA DISIMPAN DI PERANGKAT: `api.admin.me()` di APK berjalan lewat
// Edge Function `stc-admin`, yang memvalidasi token dengan MENGHUBUNGI Stockity.
// Versi pertama fungsi ini hanya menyimpan hasil di memori, sehingga setiap
// pengguna — bukan hanya admin — memicu satu panggilan Stockity tambahan tiap
// kali aplikasi dibuka. Dengan disimpan di perangkat, pemeriksaannya jadi
// sekali per pengguna dan hasilnya bertahan lintas pembukaan aplikasi.
// ─────────────────────────────────────────────

import { api } from './api';

const KUNCI = 'stc_admin_entitlement';
/** Umur cache. Cukup lama untuk menghapus panggilan berulang, cukup pendek
 *  supaya pencabutan hak admin tetap berlaku dalam sehari. */
const UMUR_MS = 24 * 60 * 60 * 1000;

let diMemori: Promise<boolean> | null = null;

async function idPengguna(): Promise<string> {
  try {
    const mod = await import('./storage');
    return String((await mod.storage.get(mod.SESSION_KEYS.USER_ID)) ?? '').trim();
  } catch {
    return '';
  }
}

async function periksa(): Promise<boolean> {
  const uid = await idPengguna();

  // 1) Jawaban tersimpan di perangkat — dipakai bila masih untuk pengguna yang
  //    sama dan belum kedaluwarsa.
  try {
    const mod = await import('./storage');
    const raw = await mod.storage.get(KUNCI);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.uid === uid && Date.now() - Number(c.at) < UMUR_MS) {
        return c.admin === true;
      }
    }
  } catch { /* cache rusak/absen → tanya server */ }

  // 2) Tanya sekali, lalu simpan.
  let admin = false;
  try {
    const r: any = await api.admin.me();
    admin = r?.isAdmin === true || r?.isSuperAdmin === true;
  } catch {
    admin = false; // gagal cek → tidak berhak (default aman)
  }

  try {
    const mod = await import('./storage');
    await mod.storage.set(KUNCI, JSON.stringify({ uid, admin, at: Date.now() }));
  } catch { /* gagal menyimpan hanya berarti ditanya lagi nanti */ }

  return admin;
}

/** Apakah pengguna saat ini admin atau super admin. Gagal cek → false (aman). */
export function isPrivilegedUser(): Promise<boolean> {
  if (!diMemori) diMemori = periksa();
  return diMemori;
}

/** Buang cache — dipanggil saat logout supaya sesi berikutnya memeriksa ulang. */
export function resetPrivilegeCache(): void {
  diMemori = null;
  void (async () => {
    try {
      const mod = await import('./storage');
      await mod.storage.remove(KUNCI);
    } catch { /* tidak ada yang perlu dibuang */ }
  })();
}
