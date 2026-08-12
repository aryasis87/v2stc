// ═══════════════════════════════════════════
// theme.ts — palet dashboard, satu sumber tipe.
//
// Dipisahkan dari page.tsx sebagai langkah pertama pemecahan berkas itu
// (6.325 baris). Fungsi ini murni — masuk `isDark`, keluar objek warna,
// tanpa menyentuh apa pun di halaman — jadi ia bisa berdiri sendiri tanpa
// mengubah perilaku sedikit pun.
//
// ─────────────────────────────────────────────────────────────────────────
// KENAPA MASIH HEX, BUKAN var(--s-*) SEPERTI HALAMAN PROFIL
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
// AKARNYA `let C` global yang bisa berubah + gaya sebaris. Selama warna
// mengalir lewat variabel modul, token CSS tak akan pernah bisa jadi
// sumbernya. Perbaikan sebenarnya: ubah komponen memakai KELAS CSS.
// Nilai di bawah SENGAJA dijaga sama persis dengan token di
// src/app/ds/tokens.css supaya tampilannya tetap seragam sampai saat itu.
// ═══════════════════════════════════════════

export function getColors(isDark: boolean) {
  return {
    // Penanda tema. Sebelumnya mode gelap dideteksi dengan membandingkan
    // C.bg terhadap hex tertentu — cara itu diam-diam rusak begitu warna
    // latarnya disetel ulang, jadi statusnya dibawa langsung di sini.
    dark:  isDark,
    // Surfaces — gelap berlapis (dark) / abu sangat terang (light).
    // Jarak antartingkat sengaja sekitar enam belas: versi lama menumpuk
    // #0B0C0E/#141518/#1B1D21 yang selisihnya hanya sembilan, sehingga
    // kartu nyaris menyatu dengan latar dan halaman terlihat rata.
    bg:    isDark ? '#0F1114' : '#F6F7F9',
    card:  isDark ? '#1A1C20' : '#FFFFFF',
    card2: isDark ? '#24262B' : '#F1F3F5',
    // Borders — hairline netral tipis; aktif = emerald halus
    bdr:   isDark ? 'rgba(255,255,255,0.11)' : '#E6E8EB',
    bdrAct:isDark ? 'rgba(45,212,167,0.55)'  : 'rgba(5,150,105,0.45)',
    // Primary accent — emerald bersih
    cyan:  isDark ? '#2DD4A7' : '#059669',
    cyand: isDark ? 'rgba(45,212,167,0.14)' : 'rgba(5,150,105,0.09)',
    // Error / loss
    coral: isDark ? '#FB7185' : '#E11D48',
    cord:  isDark ? 'rgba(251,113,133,0.14)' : 'rgba(225,29,72,0.08)',
    // Warning / martingale
    amber: isDark ? '#FBBF24' : '#B45309',
    ambd:  isDark ? 'rgba(251,191,36,0.14)'  : 'rgba(180,83,9,0.09)',
    // Teks di atas amber solid — adaptif agar selalu terbaca
    onAmber: isDark ? '#1a1612' : '#ffffff',
    // Misc accent colors
    violet: isDark ? '#C084FC' : '#7C3AED',
    vltd:  isDark ? 'rgba(192,132,252,0.14)' : 'rgba(124,58,237,0.08)',
    sky:   isDark ? '#4ADE80' : '#16A34A',
    skyd:  isDark ? 'rgba(74,222,128,0.14)'  : 'rgba(22,163,74,0.09)',
    orange: isDark ? '#FB923C' : '#EA580C',
    orgd:  isDark ? 'rgba(251,146,60,0.14)'  : 'rgba(234,88,12,0.09)',
    pink:  isDark ? '#F472B6' : '#BE185D',
    pinkd: isDark ? 'rgba(244,114,182,0.14)' : 'rgba(190,24,93,0.08)',
    // Text — hierarki lebih jelas, netral (bukan kebiruan)
    text:  isDark ? '#F4F5F7' : '#0F172A',
    sub:   isDark ? '#AEB5BF' : '#475569',
    muted: isDark ? 'rgba(174,181,191,0.66)' : '#94A3B8',
    faint: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(2,6,23,0.035)',
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
