// ═══════════════════════════════════════════
// orderPhase.ts — menyimpulkan tahap sebuah order terjadwal.
//
// Logika murni, tanpa React dan tanpa warna, jadi berkasnya sendiri —
// bukan di primitives.tsx (yang isinya komponen) maupun theme.ts.
// Dipakai page.tsx dan OrderInputModal.
// ═══════════════════════════════════════════

import type { ScheduleOrder, ExecutionLog } from '@/lib/api';

export type OrderPhase = 'waiting' | 'monitoring' | 'martingale' | 'win' | 'lose' | 'skipped';
export function resolvePhase(o: ScheduleOrder, getLog: (o:ScheduleOrder)=>ExecutionLog|undefined): OrderPhase {
  if (o.isSkipped) return 'skipped';
  if (!o.isExecuted) return 'waiting';
  const raw = o.result ?? getLog(o)?.result ?? '';
  const hasResult = /^win$/i.test(raw) || /^los/i.test(raw);
  const ms = o.martingaleState;
  if (hasResult) return /^win$/i.test(raw) ? 'win' : 'lose';
  if (ms?.isActive && (ms.currentStep ?? 0) > 0) return 'martingale';
  return 'monitoring';
}
