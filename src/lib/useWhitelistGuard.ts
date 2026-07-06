// lib/useWhitelistGuard.ts
// Gate whitelist DINONAKTIFKAN (2026-07).
//
// Sebelumnya hook ini mengecek keanggotaan whitelist secara berkala + realtime
// dan mem-blokir (auto-logout) user yang tidak terdaftar / dinonaktifkan.
// Kini semua pengguna dengan akun Stockity valid boleh mengakses aplikasi tanpa
// harus terdaftar, jadi hook ini menjadi no-op yang tidak pernah memblokir.
// Signature dipertahankan agar ClientLayout tidak perlu diubah.

'use client';

export interface WhitelistGuardState {
  /** true = user terkonfirmasi diblokir / dihapus dari whitelist */
  isBlocked:  boolean;
  /** true = sedang melakukan pengecekan pertama (initial check belum selesai) */
  isChecking: boolean;
  /** Email user saat ini (diisi setelah session dibaca) */
  email:      string | null;
}

export function useWhitelistGuard(_enabled: boolean): WhitelistGuardState {
  // Tidak ada pengecekan whitelist lagi — selalu izinkan akses.
  return { isBlocked: false, isChecking: false, email: null };
}
