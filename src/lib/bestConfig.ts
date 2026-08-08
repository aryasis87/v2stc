// lib/bestConfig.ts
// ─────────────────────────────────────────────────────────────────────
// "Best Config" — kalkulasi SARAN pengaturan trading otomatis dari saldo.
// Bukan jaminan profit; ini titik awal yang aman & masuk akal secara
// matematis, lalu bisa di-apply ke pengaturan user.
//
// Konvensi martingale (sama dengan engine): order pada step-k = base × mᵏ,
// satu siklus penuh = step 0..maxStep → (maxStep+1) order. Total risiko satu
// siklus (semua kalah) = base × (m^(maxStep+1) − 1) / (m − 1).
//
// Prinsip perhitungan:
//   • Semakin besar saldo → semakin banyak siklus yang bisa "diserap"
//     (survivable), martingale sedikit lebih panjang & multiplier lebih tinggi.
//   • Nominal awal dipilih agar saldo mampu menahan K siklus kalah beruntun.
//   • Stop loss ≥ satu siklus penuh (agar satu siklus sempat bekerja) & ≤ 25%
//     saldo. Stop profit ≈ 15% saldo (target harian yang realistis).
// ─────────────────────────────────────────────────────────────────────

export interface BestConfigInput {
  /** Saldo dalam unit tampilan (mis. Rupiah), bukan sen */
  balance: number;
  /** Nominal order minimum dari currencyConfig (unit tampilan) */
  minAmount: number;
}

export type RiskLevel = 'aman' | 'sedang' | 'agresif';

export interface BestConfigResult {
  baseAmount: number;       // nominal order awal (unit tampilan)
  maxStep: number;          // jumlah level martingale
  multiplier: number;       // kelipatan tiap step
  stopLoss: number;         // batas rugi harian (unit tampilan)
  stopProfit: number;       // target profit harian (unit tampilan)
  duration: number;         // detik (opsi)
  // ── metrik untuk UI ──
  perStep: number[];        // nominal tiap step (0..maxStep)
  cycleRisk: number;        // total modal satu siklus penuh
  survivableCycles: number; // berapa siklus kalah beruntun yang saldo mampu tahan
  riskLevel: RiskLevel;
  belowRecommended: boolean;// true bila saldo < minimum yang disarankan
  recommendedMinBalance: number;
  winsToTarget: number;     // perkiraan jumlah menang untuk capai stop profit
}

/** Bulatkan ke angka "cantik" sesuai besarannya (ke bawah, demi aman) */
function niceFloor(x: number): number {
  if (x <= 0) return 0;
  let step = 1000;
  if (x >= 5_000_000) step = 100_000;
  else if (x >= 1_000_000) step = 50_000;
  else if (x >= 200_000) step = 10_000;
  else if (x >= 50_000) step = 5_000;
  else step = 1_000;
  return Math.max(step, Math.floor(x / step) * step);
}

function niceRound(x: number): number {
  if (x <= 0) return 0;
  let step = 1000;
  if (x >= 5_000_000) step = 100_000;
  else if (x >= 1_000_000) step = 50_000;
  else if (x >= 200_000) step = 10_000;
  else if (x >= 50_000) step = 5_000;
  else step = 1_000;
  return Math.max(step, Math.round(x / step) * step);
}

/** Jumlah geometrik siklus: (m^(steps+1) − 1)/(m − 1) */
function cycleFactor(m: number, steps: number): number {
  return (Math.pow(m, steps + 1) - 1) / (m - 1);
}

export function computeBestConfig({ balance, minAmount }: BestConfigInput): BestConfigResult {
  const min = Math.max(minAmount || 0, 1);
  // Minimum saldo yang disarankan ≈ baseline platform (mis. Rp 480.000 saat min 14.000)
  const recommendedMinBalance = niceRound(min * 34);
  const ratio = balance / recommendedMinBalance;

  // Tier: multiplier, panjang martingale, dan target daya-tahan siklus (K).
  // Saldo kecil → martingale pendek (agar satu siklus tak melahap saldo).
  let multiplier: number, maxStep: number, K: number, riskLevel: RiskLevel;
  if (ratio < 1)        { multiplier = 2.0; maxStep = 2; K = 2;   riskLevel = 'agresif'; }
  else if (ratio < 2.5) { multiplier = 2.2; maxStep = 2; K = 2.5; riskLevel = 'sedang';  }
  else if (ratio < 8)   { multiplier = 2.3; maxStep = 3; K = 3;   riskLevel = 'aman';    }
  else                  { multiplier = 2.5; maxStep = 4; K = 3.5; riskLevel = 'aman';    }

  const G = cycleFactor(multiplier, maxStep);

  // Nominal awal agar saldo menahan ~K siklus penuh; tak boleh < minimum order.
  let baseAmount = Math.max(min, niceFloor(balance / (K * G)));

  // Jaga agar satu siklus penuh tak melebihi 60% saldo (kalau saldo mepet).
  if (baseAmount * G > balance * 0.6) {
    baseAmount = Math.max(min, niceFloor((balance * 0.6) / G));
  }

  const perStep: number[] = [];
  for (let k = 0; k <= maxStep; k++) perStep.push(Math.floor(baseAmount * Math.pow(multiplier, k)));
  const cycleRisk = perStep.reduce((a, b) => a + b, 0);
  const survivableCycles = cycleRisk > 0 ? balance / cycleRisk : 0;

  // Stop loss harian ≈ 20% saldo, minimal 2× nominal awal (agar tak terlalu ketat).
  const stopLoss = Math.max(baseAmount * 2, niceRound(balance * 0.2));

  // Stop profit: ~15% saldo (target harian realistis), minimal 1 nominal awal.
  const stopProfit = Math.max(baseAmount, niceRound(balance * 0.15));

  // Perkiraan menang untuk capai target (payout ~85%).
  const payout = 0.85;
  const winsToTarget = Math.max(1, Math.ceil(stopProfit / (baseAmount * payout)));

  return {
    baseAmount, maxStep, multiplier,
    stopLoss, stopProfit, duration: 60,
    perStep, cycleRisk,
    survivableCycles: Math.round(survivableCycles * 10) / 10,
    riskLevel,
    belowRecommended: balance < recommendedMinBalance,
    recommendedMinBalance,
    winsToTarget,
  };
}
