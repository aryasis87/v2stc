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

// Cache DI-KUNCI per user-id. Dulu hanya Promise<boolean> tanpa uid → hasil admin
// akun lama BOCOR ke akun baru saat ganti akun tanpa reload (semua mode berbayar
// jadi terbuka). Sekarang menyimpan uid pemiliknya agar bisa diperiksa ulang.
let diMemori: { uid: string; p: Promise<boolean> } | null = null;

async function idPengguna(): Promise<string> {
  try {
    const mod = await import('./storage');
    return String((await mod.storage.get(mod.SESSION_KEYS.USER_ID)) ?? '').trim();
  } catch {
    return '';
  }
}

async function periksa(uid: string): Promise<boolean> {
  // 1) Jawaban tersimpan di perangkat — dipakai HANYA bila untuk pengguna yang
  //    sama (uid TIDAK kosong) dan belum kedaluwarsa. `uid &&` mencegah entri
  //    lama beruid-kosong cocok untuk semua orang.
  try {
    const mod = await import('./storage');
    const raw = await mod.storage.get(KUNCI);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && uid && c.uid === uid && Date.now() - Number(c.at) < UMUR_MS) {
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

  // Simpan HANYA bila uid diketahui. Menyimpan di bawah uid kosong akan cocok
  // untuk SEMUA pengguna berikutnya → membocorkan hak admin (akar bug "semua
  // mode berbayar terbuka untuk user belum bayar").
  if (uid) {
    try {
      const mod = await import('./storage');
      await mod.storage.set(KUNCI, JSON.stringify({ uid, admin, at: Date.now() }));
    } catch { /* gagal menyimpan hanya berarti ditanya lagi nanti */ }
  }

  return admin;
}

/** Apakah pengguna saat ini admin atau super admin. Gagal cek / uid kosong → false
 *  (aman). Memo di-kunci per uid: ganti akun (bahkan tanpa reload) memicu cek ulang,
 *  jadi hak admin akun lama tidak bocor ke akun baru. */
export function isPrivilegedUser(): Promise<boolean> {
  return (async () => {
    const uid = await idPengguna();
    if (!uid) return false; // belum teridentifikasi → jangan beri hak apa pun
    if (!diMemori || diMemori.uid !== uid) diMemori = { uid, p: periksa(uid) };
    return diMemori.p;
  })();
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
