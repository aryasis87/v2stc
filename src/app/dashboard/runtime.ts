// ═══════════════════════════════════════════
// runtime.ts — wadah nilai yang berubah tiap render.
//
// KENAPA WADAH, BUKAN IMPOR LANGSUNG
//
// page.tsx memegang palet dan penerjemah sebagai variabel modul yang bisa
// berubah (`let C`, `let T`), diisi ulang tiap render oleh DashboardPage.
// Komponen yang dipindah keluar dari berkas itu tidak bisa ikut membacanya —
// `import { C }` akan membekukan nilai saat impor, yaitu tema gelap bawaan,
// dan komponen tersebut selamanya memakai warna yang salah di mode terang.
//
// Wadah ini memberi satu objek yang stabil rujukannya sementara ISINYA
// diperbarui. Syaratnya satu, dan wajib:
//
//   BACA `rt.C` DI DALAM BADAN KOMPONEN, JANGAN DI TINGKAT MODUL.
//
//   ❌  const { C } = rt;              // beku di nilai saat impor
//       export const Foo = () => <div style={{color: C.text}}/>;
//
//   ✅  export const Foo = () => {
//         const C = rt.C;              // dibaca ulang tiap render
//         return <div style={{color: C.text}}/>;
//       };
//
// Pola yang sama dipakai di koala setelah dashboard-nya dipecah.
// ═══════════════════════════════════════════

import { getColors, type Colors, type TradingMode } from './theme';

export const rt: {
  C: Colors;
  T: (k: string) => string;
  /** Format angka mengikuti locale akun. */
  FMT: (n: number) => string;
  /** Satuan mata uang akun (mis. "Rp", "$"). */
  CURR_UNIT: string;
  /** Taruhan minimum akun, dalam satuan di atas. */
  MIN_AMOUNT: number;
  /** Kode bahasa aktif — dipakai helper ui(). */
  LANG: string;
  /** Nominal cepat, ikut mata uang akun. */
  QUICK_AMOUNTS: number[];
} = {
  // Nilai awal dipakai sampai DashboardPage render pertama kali mengisinya.
  C: getColors(true),
  T: (k: string) => k,
  FMT: (n: number) => Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 }),
  CURR_UNIT: 'Rp',
  MIN_AMOUNT: 14_000,
  LANG: 'id',
  QUICK_AMOUNTS: [14_000, 70_000, 140_000, 280_000, 700_000, 1_400_000, 2_800_000],
};

/**
 * Warna penanda tiap mode. Ada di sini, bukan di theme.ts, karena ia
 * bergantung pada palet YANG SEDANG BERLAKU — bukan pada fungsi paletnya.
 */
export function modeAccent(mode: TradingMode): string {
  const C = rt.C;
  if (mode === 'ctc')       return C.violet;
  if (mode === 'aisignal')  return C.sky;
  if (mode === 'indicator') return C.orange;
  if (mode === 'momentum')  return C.pink;
  return C.cyan;
}
