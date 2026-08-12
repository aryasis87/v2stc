import { PALET_GELAP, PALET_TERANG } from './theme.colors';

// ═══════════════════════════════════════════
// theme.ts — palet dashboard, satu sumber tipe.
//
// Dipisahkan dari page.tsx sebagai langkah pertama pemecahan berkas itu
// (6.325 baris). Fungsi ini murni — masuk `isDark`, keluar objek warna,
// tanpa menyentuh apa pun di halaman — jadi ia bisa berdiri sendiri tanpa
// mengubah perilaku sedikit pun.
//
// ─────────────────────────────────────────────────────────────────────────
// NILAINYA SEKARANG DIHASILKAN — lihat theme.colors.ts, yang ditulis oleh
// design-system/_build.mjs dari token yang sama dengan tokens.css. Jadi
// warnanya tetap SATU sumber; jembatannya waktu build, bukan waktu jalan.
// Untuk mengubah warna: sunting generator, jalankan `node design-system/_build.mjs`.
//
// KENAPA HEX, BUKAN var(--s-*) SEPERTI HALAMAN PROFIL
//
// page.tsx menyisipkan alfa dengan MENYAMBUNG hex — `${C.cyan}12` menjadi
// #2DD4A712 — di 188 tempat. `var(--s-acc)12` bukan CSS yang sah: propertinya
// dibuang diam-diam, tanpa galat, dan build tetap hijau. Sudah dicoba dan
// menghasilkan tombol Start putih-di-atas-putih.
//
// Dua jalan keluar sudah diuji dan GAGAL:
//   1. Token kanal RGB (`rgba(var(--s-acc-rgb),.07)`) — mustahil secara
//      statis: 6 dari 15 kunci memakai variabel dinamis (`ac`, `col`,
//      `phaseColor`, …) yang isinya baru ditentukan saat berjalan lewat
//      modeAccent(mode), jadi token mana yang dipegang tak bisa diketahui.
//   2. Membaca token lewat getComputedStyle lalu mengembalikan hex — rusak
//      parah: `let C` dihitung saat IMPOR, sebelum data-theme terpasang,
//      sehingga sebagian komponen memakai nilai basi (mode terang tampil
//      berlatar hitam).
//
// AKARNYA `let C` global yang bisa berubah + gaya sebaris. Memindahkan
// komponen ke kelas CSS tetap perbaikan yang lebih baik, tapi bisa dikerjakan
// bertahap — sementara itu, penyalinan nilai dengan tangan sudah hilang:
// keduanya keluar dari token yang sama.
// ═══════════════════════════════════════════

export function getColors(isDark: boolean) {
  const P = isDark ? PALET_GELAP : PALET_TERANG;
  return {
    // Penanda tema. Sebelumnya mode gelap dideteksi dengan membandingkan
    // C.bg terhadap hex tertentu — cara itu diam-diam rusak begitu warna
    // latarnya disetel ulang, jadi statusnya dibawa langsung di sini.
    dark: isDark,
    ...P,
  };
}

/**
 * Tipe palet — SATU sumber untuk seluruh komponen dashboard.
 *
 * Sebelumnya tiap komponen menulis ulang bentuknya sendiri sebagai
 * anotasi lepas. Saat sebuah warna ditambah, yang terlewat baru ketahuan
 * lewat galat tipe di tempat yang tak berhubungan — atau tidak ketahuan
 * sama sekali. Diturunkan dari fungsinya, jadi tak bisa menyimpang.
 */
export type Colors = ReturnType<typeof getColors>;

/**
 * Mode trading. Ditaruh di sini supaya berkas yang dipecah keluar dari
 * page.tsx punya satu tempat mengambilnya.
 *
 * CATATAN: tipe dengan isi yang sama juga ada di src/lib/useTradingSettings.ts.
 * Duplikasi itu pernah menggigit — saat mode dicabut, TypeScript hanya
 * mengeluh di salah satunya sehingga yang lain diam-diam ketinggalan.
 * Menyatukan keduanya menyentuh berkas lain; dikerjakan terpisah.
 */
export type TradingMode =
  | 'schedule' | 'fastrade' | 'ctc' | 'aisignal' | 'indicator' | 'momentum';

/** Konfigurasi kompensasi (martingale). Dipakai page.tsx dan ControlCard. */
export interface MartingaleConfig {
  enabled: boolean;
  maxStep: number;
  multiplier: number;
  alwaysSignal?: boolean;
}

/** Rentang waktu Fastrade. Dipakai page.tsx dan SettingsCard. */
export type FastTradeTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';

/** Pilihan rentang waktu Fastrade, untuk dropdown. */
export const FT_TF: {value:FastTradeTimeframe; label:string}[] = [
  {value:'1m',label:'1 Menit'},{value:'5m',label:'5 Menit'},
  {value:'15m',label:'15 Menit'},{value:'30m',label:'30 Menit'},{value:'1h',label:'1 Jam'},
];
