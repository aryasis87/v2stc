// lib/engine/preciseTiming.ts
// ─────────────────────────────────────────────────────────────────────
// Timing PRESISI untuk engine trading on-device.
//
// Masalah: `setTimeout(fn, target - now)` tunggal bisa telat 10–50ms saat
// thread JS sibuk (render, GC) → entry meleset dari detik/batas yang dituju.
// Solusi: tidur KASAR sampai mendekati target, lalu langkah HALUS beberapa ms
// hingga tepat di target. Meleset tinggal ~beberapa ms, tanpa busy-wait
// (langkah minimum tetap tidur, bukan spin CPU).
// ─────────────────────────────────────────────────────────────────────

/** setTimeout terbungkus Promise (ms negatif diamankan ke 0). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Tidur sampai waktu absolut `targetMs` (epoch ms) dengan koreksi drift.
 * @param targetMs waktu target (Date.now() berbasis).
 * @param shouldContinue opsional — bila mengembalikan false, berhenti lebih awal
 *        (mis. saat engine di-stop) supaya tak menahan siklus yang sudah batal.
 */
export async function sleepUntil(
  targetMs: number,
  shouldContinue?: () => boolean,
): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (shouldContinue && !shouldContinue()) return;
    const remaining = targetMs - Date.now();
    if (remaining <= 0) return;
    // Jauh dari target: tidur sampai ~30ms sebelumnya (sisakan ruang koreksi).
    // Dekat target: langkah kecil (maks 6ms) agar mendarat tepat di target.
    await sleep(remaining > 50 ? remaining - 30 : Math.min(remaining, 6));
  }
}
