// lib/engine/fastradeEngine.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — ENGINE FASTRADE (FTT & CTC) DI PERANGKAT USER.
// Port dari botstc: fastrade-base.executor.ts + ftt-executor.ts + ctc-executor.ts
//
// Alur inti (dijaga identik dengan server):
//   1. Tunggu batas menit → ambil candle → harga #1
//   2. Tunggu batas menit berikutnya → ambil candle → harga #2
//   3. Trend = naik→call, turun→put  (FTT: harga sama → cycle ulang;
//      CTC: harga sama → 'put', lalu sinkron ke boundary 5 detik)
//   4. Eksekusi via WS, tunggu hasil:
//      WIN  → lanjut trend sama         LOSE → martingale / Always Signal
//      DRAW → ulangi trend yang sama    martingale habis → REVERSE trend
//
// Data candle diambil lewat HTTP native (CapacitorHttp) — bebas CORS,
// bisa mengirim header autentikasi Stockity seperti di server.
// ─────────────────────────────────────────────────────────────────────

import { StockityWsClient, type DealResultPayload, type TradeOrderData } from './stockityWs';
import { fetchCandles5s, lastCandleError, type StockityRestOptions } from './stockityRest';
import { sleepUntil } from './preciseTiming';
import type { TrendType, MartingaleSettings, AssetConfig } from './scheduleEngine';

export type FastradeMode = 'FTT' | 'CTC';

export interface FastradeConfig {
  mode: FastradeMode;
  asset: AssetConfig;
  martingale: MartingaleSettings;
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
  /**
   * FAST REVERSAL — daftar langkah martingale (K) yang arah sinyalnya DIBALIK.
   * Mis. [3,5,8]: pada step 3/5/8 order dieksekusi kebalikan arah; step lain
   * mengikuti normal. Kompensasi/amount tetap berjalan normal — hanya ARAH
   * yang dibalik.
   * Kosong/undefined → perilaku Fastrade biasa (tanpa reversal).
   */
  reversalSteps?: number[];
}

export interface FastradeLog {
  id: string;
  orderId: string;
  trend: TrendType;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: 'WIN' | 'LOSE' | 'DRAW' | 'FAILED';
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  cycleNumber: number;
  note?: string;
  isDemoAccount: boolean;
  mode: FastradeMode;
}

export interface FastradeCallbacks {
  onLog: (log: FastradeLog) => void;
  onStatusChange: (status: string) => void;
  onStopped: () => void;
  onSessionPnL?: (pnl: number) => void;
}

// ── Konstanta — sama dengan engine server ─────────────────────────────
const FETCH_OFFSET_MS = 500;
// Jeda antar-order (mis. lanjut martingale). Dulu 200ms — diperkecil agar
// eksekusi setelah hasil keluar lebih cepat/responsif.
const NEXT_ORDER_DELAY_MS = 120;
const CYCLE_RESTART_DELAY_MS = 2_000;
const DIRECT_LOSS_DELAY_MS = 5_000;
const RESULT_TIMEOUT_MS = 150_000;
const MAX_RETRIES = 3;
const TERMINAL_STATUSES = new Set(['won', 'win', 'lost', 'lose', 'loss', 'stand', 'draw', 'tie']);

interface ActiveOrder {
  id: string;
  dealId?: string;
  trend: TrendType;
  amount: number;
  step: number;
  executedAt: number;
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class FastradeEngine {
  private isRunning = false;
  private cycleNumber = 0;
  private currentTrend?: TrendType;
  private activeOrder?: ActiveOrder;

  private sessionPnL = 0;
  private totalWins = 0;
  private totalLosses = 0;
  private totalTrades = 0;

  private martingaleStep = 0;
  private martingaleActive = false;
  private alwaysLoss?: { hasOutstandingLoss: boolean; currentMartingaleStep: number; totalLoss: number };

  // Fast Reversal: nominal terbesar yang DITERIMA Stockity + plafon setelah amount_max.
  private lastAcceptedAmount = 0;
  private amountCeiling = 0;

  private cycleTimer?: ReturnType<typeof setTimeout>;
  private resultTimer?: ReturnType<typeof setTimeout>;
  private stopGeneration = 0; // membatalkan callback tertunda saat stop()

  private phase = 'IDLE';

  constructor(
    private readonly ws: StockityWsClient,
    private readonly rest: StockityRestOptions,
    private readonly config: FastradeConfig,
    private readonly callbacks: FastradeCallbacks,
  ) {}

  /** Fast Reversal = mode FTT dengan daftar langkah reversal terisi. */
  private get isFastReversal(): boolean {
    return this.config.mode === 'FTT' && !!this.config.reversalSteps?.length;
  }

  // Simpan/pulihkan kompensasi Fast Reversal antar restart (mis. app ditutup di
  // tengah martingale). Dipulihkan HANYA bila < 5 menit & aset/akun sama, agar
  // tak membuka nominal besar dari sesi lama yang sudah basi.
  private static readonly RESUME_KEY = 'stc_fastreversal_resume';
  private static readonly RESUME_MAX_AGE_MS = 5 * 60_000;

  private saveResume() {
    if (!this.isFastReversal) return;
    try {
      localStorage.setItem(FastradeEngine.RESUME_KEY, JSON.stringify({
        step: this.martingaleStep, trend: this.currentTrend ?? null,
        pnl: this.sessionPnL, ceiling: this.amountCeiling,
        ric: this.config.asset.ric, demo: this.config.isDemoAccount, ts: Date.now(),
      }));
    } catch { /* storage tak tersedia */ }
  }
  private loadResume() {
    if (!this.isFastReversal) return;
    try {
      const raw = localStorage.getItem(FastradeEngine.RESUME_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || Date.now() - (s.ts ?? 0) > FastradeEngine.RESUME_MAX_AGE_MS) return;
      if (s.ric !== this.config.asset.ric || s.demo !== this.config.isDemoAccount) return;
      if (typeof s.step === 'number' && s.step > 0 && (s.trend === 'call' || s.trend === 'put')) {
        this.martingaleStep = s.step;
        this.martingaleActive = true;
        this.currentTrend = s.trend;
        this.sessionPnL = typeof s.pnl === 'number' ? s.pnl : 0;
        this.amountCeiling = typeof s.ceiling === 'number' ? s.ceiling : 0;
      }
    } catch { /* abaikan */ }
  }
  private clearResume() { try { localStorage.removeItem(FastradeEngine.RESUME_KEY); } catch { /* */ } }

  // ── Kontrol ────────────────────────────────────

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sessionPnL = 0;
    this.totalWins = this.totalLosses = this.totalTrades = 0;
    this.resetMartingale();
    this.amountCeiling = 0;
    this.lastAcceptedAmount = 0;
    this.loadResume(); // Fast Reversal: lanjutkan kompensasi bila ada & masih segar
    this.callbacks.onStatusChange(`${this.config.mode}: bot berjalan`);
    if (this.isFastReversal && this.martingaleStep > 0 && this.currentTrend) {
      this.callbacks.onStatusChange(`${this.config.mode}: melanjutkan kompensasi step ${this.martingaleStep}`);
      this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(this.currentTrend!, this.martingaleStep));
    } else {
      this.startNewCycle();
    }
  }

  stop() {
    this.isRunning = false;
    this.stopGeneration++;
    this.clearCycleTimer();
    this.clearResultTimer();
    this.phase = 'IDLE';
    this.activeOrder = undefined;
    this.callbacks.onStatusChange(`${this.config.mode}: bot dihentikan`);
    this.callbacks.onStopped();
  }

  handleWsDealResult = (payload: DealResultPayload) => this.handleDealResult(payload);

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.config.mode,
      phase: this.phase,
      cycleNumber: this.cycleNumber,
      currentTrend: this.currentTrend ?? null,
      martingaleStep: this.martingaleStep,
      martingaleActive: this.martingaleActive,
      alwaysSignalActive: !!this.alwaysLoss?.hasOutstandingLoss,
      sessionPnL: this.sessionPnL,
      totalWins: this.totalWins,
      totalLosses: this.totalLosses,
      totalTrades: this.totalTrades,
      wsConnected: this.ws.isConnected(),
    };
  }

  // ── Siklus ─────────────────────────────────────

  private startNewCycle() {
    if (!this.isRunning) return;
    this.cycleNumber++;
    this.currentTrend = undefined;
    this.phase = 'IDLE';
    this.clearCycleTimer();

    if (!this.alwaysLoss?.hasOutstandingLoss) this.resetMartingale();

    this.callbacks.onStatusChange(
      `${this.config.mode} CYCLE ${this.cycleNumber}: menunggu batas menit...`,
    );
    this.runCycle().catch(() => {
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
    });
  }

  private async runCycle(): Promise<void> {
    const isCtc = this.config.mode === 'CTC';

    // ── Candle 1 ──
    this.phase = 'WAITING_MINUTE_1';
    const firstBoundary = this.getNextMinuteBoundary();
    // Tunggu presisi (drift-corrected) sampai batas menit + offset.
    await sleepUntil(firstBoundary + FETCH_OFFSET_MS, () => this.isRunning);
    if (!this.isRunning) return;

    this.phase = 'FETCHING_1';
    this.callbacks.onStatusChange(`${this.config.mode} CYCLE ${this.cycleNumber}: mengambil candle pertama...`);
    const price1 = await this.fetchCandleClosePrice();
    if (price1 === null) { if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS); return; }

    // ── Candle 2 ──
    this.phase = 'WAITING_MINUTE_2';
    this.callbacks.onStatusChange(`${this.config.mode} CYCLE ${this.cycleNumber}: menunggu menit kedua...`);
    await sleepUntil(firstBoundary + 60_000 + FETCH_OFFSET_MS, () => this.isRunning);
    if (!this.isRunning) return;

    this.phase = 'FETCHING_2';
    const price2 = await this.fetchCandleClosePrice();
    if (price2 === null) { if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS); return; }

    // ── Analisis ──
    this.phase = 'ANALYZING';
    const detected = this.determineTrend(price1, price2);

    if (!isCtc && detected === null) {
      // FTT: harga sama → tidak ada sinyal, ulangi siklus
      this.callbacks.onStatusChange(`${this.config.mode} CYCLE ${this.cycleNumber}: harga sama — cycle ulang`);
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    // CTC = Counter The Candle → LAWAN arah candle (kebalikan FTT yang mengikuti).
    // Tanpa pembalikan ini, CTC eksekusinya identik FTT (bug). Harga sama → 'put'.
    const trend: TrendType = isCtc
      ? (detected === 'call' ? 'put' : detected === 'put' ? 'call' : 'put')
      : (detected ?? 'put');
    this.currentTrend = trend;

    if (isCtc) {
      // CTC: sinkron ke boundary 5 detik terdekat sebelum eksekusi
      this.phase = 'WAITING_EXEC_SYNC';
      await sleepUntil(this.calculateOptimalExecutionTime(), () => this.isRunning);
      if (!this.isRunning) return;
    }

    this.callbacks.onStatusChange(`${this.config.mode} CYCLE ${this.cycleNumber}: eksekusi ${trend.toUpperCase()}`);
    await this.executeWithTrend(trend, 0);
  }

  /** Boundary 5 detik terdekat; hindari eksekusi terlalu mepet akhir menit */
  private calculateOptimalExecutionTime(): number {
    const now = Date.now();
    const currentSec = Math.floor(now / 1000);
    const secInMinute = currentSec % 60;
    const nextBoundarySec = currentSec + (5 - (secInMinute % 5));
    const msToBoundary = nextBoundarySec * 1000 - now;

    if (msToBoundary < 200) return now;                    // sudah di boundary
    if ((nextBoundarySec % 60) === 0) return now;          // tepat akhir menit → langsung
    if (60 - (nextBoundarySec % 60) < 1) return now + 1000; // terlalu mepet → geser
    return nextBoundarySec * 1000;
  }

  private scheduleNewCycle(delayMs: number) {
    this.clearCycleTimer();
    const gen = this.stopGeneration;
    this.cycleTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      this.startNewCycle();
    }, delayMs);
  }

  private clearCycleTimer() {
    if (this.cycleTimer) { clearTimeout(this.cycleTimer); this.cycleTimer = undefined; }
  }

  // ── Candle ─────────────────────────────────────

  /** Harga close candle terakhir; retry 3× seperti server (kegagalan transient) */
  private async fetchCandleClosePrice(maxAttempts = 3): Promise<number | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this.isRunning) return null;
      const candles = await fetchCandles5s(this.config.asset.ric, this.rest);
      if (candles.length) {
        const last = candles.sort((a, b) => a.timestamp - b.timestamp)[candles.length - 1];
        if (Number.isFinite(last.close)) return last.close;
      }
      // Retry lebih cepat (dulu 1000ms) supaya tak kehilangan jendela entry.
      if (attempt < maxAttempts) await this.sleep(350);
    }
    // Tanpa candle, arah tidak bisa ditentukan dan entry tak pernah terjadi.
    // Sebabnya ditampilkan agar tidak terlihat seperti bot diam saja.
    this.callbacks.onStatusChange(
      `${this.config.mode}: ${lastCandleError ?? 'data candle tidak tersedia'} — entry ditunda`,
    );
    return null;
  }

  private determineTrend(p1: number, p2: number): TrendType | null {
    if (p2 > p1) return 'call';
    if (p2 < p1) return 'put';
    return null;
  }

  private reverseTrend(t: TrendType): TrendType { return t === 'call' ? 'put' : 'call'; }

  // ── Eksekusi ───────────────────────────────────

  private async executeWithTrend(trend: TrendType, step: number, retryCount = 0): Promise<void> {
    if (!this.isRunning) return;

    // CEGAH DOBEL-OPEN: bila sudah ada order aktif atau sedang menempatkan order,
    // jangan buka order kedua (akar "sudah profit tapi masih open kompensasi").
    // Guard hanya untuk pemanggilan baru; jalur retry internal tetap lanjut.
    if (retryCount === 0 && (this.activeOrder || this.phase === 'EXECUTING')) {
      return;
    }

    if (retryCount >= MAX_RETRIES) {
      // Auto-pulih: mulai siklus baru, tidak menghentikan bot.
      this.callbacks.onStatusChange(`${this.config.mode}: trade gagal ${MAX_RETRIES}× — mencoba siklus baru`);
      this.resetMartingale();
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    // Always Signal: step 0 di-override ke step kerugian yang tertunda
    const effectiveStep = (this.alwaysLoss?.hasOutstandingLoss && step === 0)
      ? this.alwaysLoss.currentMartingaleStep
      : step;

    let amount = this.calcAmount(effectiveStep);
    // Fast Reversal: setelah amount_max, tahan nominal di plafon terakhir yang
    // diterima Stockity (kompensasi jalan terus di plafon itu).
    if (this.isFastReversal && this.amountCeiling > 0 && amount > this.amountCeiling) amount = this.amountCeiling;
    this.phase = 'EXECUTING';

    // Fast Reversal: hanya ORDER INI yang dibalik arahnya bila step-nya terdaftar;
    // trend dasar (this.currentTrend) tak diubah, sehingga langkah berikutnya
    // tetap dihitung dari arah semula.
    const isReversalStep = !!this.config.reversalSteps?.includes(effectiveStep);
    const execTrend: TrendType = isReversalStep ? this.reverseTrend(trend) : trend;

    let tradeData: TradeOrderData;
    try {
      tradeData = this.buildInstantTrade(execTrend, amount);
    } catch (err: any) {
      this.emitLog({ orderId: uid(), trend: execTrend, amount, martingaleStep: effectiveStep, result: 'FAILED',
        note: `Build error: ${err?.message}` });
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    const orderId = uid();
    const result = await this.ws.placeTrade(tradeData);

    if (result.error === 'amount_max') {
      if (this.isFastReversal) {
        // Kompensasi tanpa batas: nominal mentok maksimum Stockity → tahan di
        // plafon terbesar yang pernah diterima, lalu LANJUT kompensasi di step
        // yang sama (tanpa reset, tanpa berhenti, tanpa jeda baca candle).
        this.amountCeiling = this.lastAcceptedAmount > 0 ? this.lastAcceptedAmount : this.config.martingale.baseAmount;
        this.emitLog({ orderId, trend: execTrend, amount, martingaleStep: effectiveStep, result: 'FAILED',
          note: `Amount > maks Stockity — tahan di plafon ${this.amountCeiling}` });
        this.callbacks.onStatusChange(`${this.config.mode}: nominal mentok maksimum — tahan plafon, lanjut kompensasi`);
        this.phase = 'IDLE';
        if (this.isRunning) this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(trend, effectiveStep));
        return;
      }
      // Martingale melebihi maksimum → reset & siklus baru, jangan hentikan bot.
      this.emitLog({ orderId, trend: execTrend, amount, martingaleStep: effectiveStep, result: 'FAILED',
        note: 'Amount melebihi maksimum Stockity — siklus baru' });
      this.callbacks.onStatusChange(`${this.config.mode}: amount melebihi maksimum — reset & siklus baru`);
      this.resetMartingale();
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }
    if (result.error === 'amount_min') {
      this.emitLog({ orderId, trend: execTrend, amount, martingaleStep: effectiveStep, result: 'FAILED',
        note: 'Amount di bawah minimum Stockity' });
      this.callbacks.onStatusChange(`${this.config.mode}: amount di bawah minimum Stockity — naikkan nominal`);
      setTimeout(() => this.stop(), 300);
      return;
    }

    if (!result.dealId && result.error !== 'duplicate') {
      // gagal transient → coba lagi (arah asli; reversal dihitung ulang sama)
      await this.sleep(500);
      return this.executeWithTrend(trend, step, retryCount + 1);
    }

    this.totalTrades++;
    this.lastAcceptedAmount = amount; // Fast Reversal: plafon nominal yang diterima Stockity
    this.activeOrder = {
      id: orderId, dealId: result.dealId ?? undefined, trend: execTrend,
      amount, step: effectiveStep, executedAt: Date.now(),
    };
    this.phase = 'WAITING_RESULT';
    this.emitLog({ orderId, trend: execTrend, amount, martingaleStep: effectiveStep, dealId: result.dealId ?? undefined,
      note: isReversalStep ? `Fast Reversal K${effectiveStep} — arah dibalik` : undefined });
    this.startResultTimeout(orderId);
  }

  private buildInstantTrade(trend: TrendType, amount: number): TradeOrderData {
    const createdAtSeconds = Math.floor(Date.now() / 1000) + 1;
    const remainingInMinute = 60 - (createdAtSeconds % 60);
    // Ambang 48s (bukan 45s) — sama dengan perbaikan di engine server
    const expireAt = remainingInMinute >= 48
      ? createdAtSeconds + remainingInMinute
      : createdAtSeconds + remainingInMinute + 60;

    const duration = expireAt - createdAtSeconds;
    if (duration < 45)  throw new Error(`Duration terlalu pendek: ${duration}s`);
    if (duration > 125) throw new Error(`Duration terlalu panjang: ${duration}s`);

    return {
      amount,
      createdAt: createdAtSeconds * 1000,
      dealType: this.config.isDemoAccount ? 'demo' : 'real',
      expireAt,
      iso: this.config.currencyIso,
      optionType: 'turbo',
      ric: this.config.asset.ric,
      trend,
    };
  }

  // ── Hasil ──────────────────────────────────────

  private handleDealResult(payload: DealResultPayload) {
    const s = (payload.status || payload.result || '').toLowerCase();
    if (!TERMINAL_STATUSES.has(s)) return; // bo:opened tak pernah dianggap hasil

    const active = this.activeOrder;
    if (!active) return;

    const dealId = String(payload.id ?? '');
    const isWin  = s === 'won' || s === 'win';
    const isDraw = s === 'stand' || s === 'draw' || s === 'tie';

    // Cocokkan: dealId → uuid → fallback amount+trend dalam jendela waktu
    let isMatch = active.dealId === dealId;
    if (!isMatch && payload.uuid && payload.uuid !== dealId) isMatch = active.dealId === payload.uuid;
    if (!isMatch) {
      const amountOk = payload.amount === undefined || payload.amount === active.amount;
      const trendOk  = !payload.trend || payload.trend === active.trend;
      isMatch = amountOk && trendOk && (Date.now() - active.executedAt < 120_000);
    }
    if (!isMatch) return;

    this.clearResultTimer();
    this.activeOrder = undefined;

    const profitRate = (this.config.asset.profitRate ?? 85) / 100;
    let pnl = 0;
    if (isWin) { pnl = Math.floor(active.amount * profitRate); this.totalWins++; }
    else if (!isDraw) { pnl = -active.amount; this.totalLosses++; }

    this.sessionPnL += pnl;
    this.callbacks.onSessionPnL?.(this.sessionPnL);

    this.emitLog({
      orderId: active.id, trend: active.trend, amount: active.amount,
      martingaleStep: active.step, dealId,
      result: isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSE',
      profit: pnl, note: `Result: ${isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSE'}`,
    });

    if (this.checkStopConditions()) return;

    if (isWin) this.onWin(active);
    else if (isDraw) this.onDraw(active);
    else this.onLose(active);
  }

  private onWin(order: ActiveOrder) {
    const trend = this.currentTrend ?? order.trend;
    this.alwaysLoss = undefined;
    this.resetMartingale();

    // Fast Reversal: menang = siklus selesai. Plafon & sisa kompensasi dibuang,
    // arah siklus lama TIDAK dibawa — kalau dibawa, order berikutnya melawan
    // candle terbaru dan pengguna melihat "sudah profit tapi arahnya masih lama".
    if (this.isFastReversal) {
      this.amountCeiling = 0;
      this.currentTrend = undefined;
      this.clearResume();
      this.callbacks.onStatusChange('Fast Reversal WIN — siklus selesai, baca candle lagi');
      this.scheduleNewCycle(NEXT_ORDER_DELAY_MS);
      return;
    }

    // FTT: satu siklus SELESAI saat hasil akhirnya keluar → bandingkan candle
    // LAGI untuk siklus berikutnya. Dulu langsung order ulang dengan arah yang
    // sama tanpa membaca candle, sehingga arahnya "nyangkut" satu arah terus.
    // CTC: sengaja TETAP mengikuti arah berjalan (hanya membandingkan candle
    // sekali di awal), jadi perilakunya tidak diubah.
    if (this.config.mode === 'FTT') {
      this.callbacks.onStatusChange('FTT WIN — siklus selesai, baca candle lagi');
      this.scheduleNewCycle(NEXT_ORDER_DELAY_MS);
      return;
    }

    this.callbacks.onStatusChange(`${this.config.mode} WIN — lanjut ${trend.toUpperCase()}`);
    this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(trend, 0));
  }

  private onDraw(order: ActiveOrder) {
    const trend = this.currentTrend ?? order.trend;
    this.callbacks.onStatusChange(`${this.config.mode} DRAW — ulangi ${trend.toUpperCase()}`);
    this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(trend, this.martingaleStep));
  }

  private onLose(order: ActiveOrder) {
    const m = this.config.martingale;
    const trend = this.currentTrend ?? order.trend;

    // Always Signal: tunggu sinyal candle berikutnya, bawa kerugian ke step berikut
    if (m.isEnabled && m.isAlwaysSignal) {
      const nextStep = (this.alwaysLoss?.currentMartingaleStep ?? 0) + 1;
      if (nextStep <= m.maxSteps) {
        this.alwaysLoss = {
          hasOutstandingLoss: true,
          currentMartingaleStep: nextStep,
          totalLoss: (this.alwaysLoss?.totalLoss ?? 0) + order.amount,
        };
      } else {
        this.alwaysLoss = undefined;
      }
      this.callbacks.onStatusChange(`${this.config.mode} LOSE — Always Signal step ${nextStep}`);
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    // Fast Reversal: kompensasi SELALU lanjut, tanpa memandang setelan martingale
    // dan tanpa batas step. Langsung ke order berikutnya — bukan lewat siklus
    // baru — supaya tidak muncul "jeda 2 candle setelah loss": kompensasi tak
    // boleh tertunda satu siklus penuh sementara peluang baliknya sudah lewat.
    if (this.isFastReversal) {
      const nextStep = this.martingaleStep + 1;
      this.martingaleStep = nextStep;
      this.martingaleActive = true;
      this.saveResume();
      this.callbacks.onStatusChange(`Fast Reversal LOSE — kompensasi step ${nextStep}`);
      this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(trend, nextStep));
      return;
    }

    // Martingale reguler (Fast Reversal sudah ditangani & return di atas)
    if (m.isEnabled && m.maxSteps > 0) {
      const nextStep = this.martingaleStep + 1;
      if (nextStep <= m.maxSteps) {
        this.martingaleStep = nextStep;
        this.martingaleActive = true;
        this.callbacks.onStatusChange(`${this.config.mode} LOSE — martingale ${nextStep}/${m.maxSteps}`);
        this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(trend, nextStep));
        return;
      }
      // Step habis = siklus martingale DITUTUP.
      // FTT: siklus selesai → baca candle lagi untuk menentukan arah baru
      // (dulu langsung balik arah & order lagi tanpa membaca candle).
      this.resetMartingale();
      if (this.config.mode === 'FTT') {
        this.callbacks.onStatusChange('FTT: martingale maksimum — siklus selesai, baca candle lagi');
        this.scheduleNewCycle(NEXT_ORDER_DELAY_MS);
        return;
      }
      // CTC: tetap seperti semula — balik arah lalu lanjut tanpa siklus baru.
      const reversed = this.reverseTrend(trend);
      this.currentTrend = reversed;
      this.callbacks.onStatusChange(`${this.config.mode}: martingale maksimum — REVERSE → ${reversed.toUpperCase()}`);
      this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(reversed, 0));
      return;
    }

    // Tanpa martingale.
    this.resetMartingale();
    // CTC tanpa martingale: KALAH → tetap COUNTER (balik arah) lanjut segera;
    // MENANG → searah (ditangani onWin). Sesuai sifat "counter the candle".
    if (this.config.mode === 'CTC') {
      const reversed = this.reverseTrend(trend);
      this.currentTrend = reversed;
      this.callbacks.onStatusChange(`CTC LOSE — COUNTER → ${reversed.toUpperCase()} (tanpa martingale)`);
      this.afterDelay(NEXT_ORDER_DELAY_MS, () => this.executeWithTrend(reversed, 0));
      return;
    }
    // FTT & lainnya → jeda lalu siklus baru (baca candle lagi)
    this.callbacks.onStatusChange(`${this.config.mode} LOSE — tunggu ${DIRECT_LOSS_DELAY_MS / 1000}s`);
    this.scheduleNewCycle(DIRECT_LOSS_DELAY_MS);
  }

  private startResultTimeout(orderId: string) {
    this.clearResultTimer();
    const gen = this.stopGeneration;
    this.resultTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      if (this.activeOrder?.id !== orderId) return;
      this.activeOrder = undefined;
      this.callbacks.onStatusChange(`${this.config.mode}: hasil tidak diterima — cycle ulang`);
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
    }, RESULT_TIMEOUT_MS);
  }

  private clearResultTimer() {
    if (this.resultTimer) { clearTimeout(this.resultTimer); this.resultTimer = undefined; }
  }

  private checkStopConditions(): boolean {
    const { stopLoss, stopProfit } = this.config;
    if (stopLoss && stopLoss > 0 && this.sessionPnL <= -stopLoss) {
      this.callbacks.onStatusChange(`Stop Loss tercapai (PnL: ${this.sessionPnL})`);
      setTimeout(() => this.stop(), 300);
      return true;
    }
    if (stopProfit && stopProfit > 0 && this.sessionPnL >= stopProfit) {
      this.callbacks.onStatusChange(`Stop Profit tercapai (PnL: +${this.sessionPnL})`);
      setTimeout(() => this.stop(), 300);
      return true;
    }
    return false;
  }

  // ── Helper ─────────────────────────────────────

  private resetMartingale() {
    this.martingaleStep = 0;
    this.martingaleActive = false;
  }

  private calcAmount(step: number): number {
    const m = this.config.martingale;
    if (!m.isEnabled || step === 0) return m.baseAmount;
    if (m.multiplierType === 'FIXED') return Math.floor(m.baseAmount * Math.pow(m.multiplierValue, step));
    const mult = 1 + m.multiplierValue / 100;
    return Math.floor(m.baseAmount * Math.pow(mult, step));
  }

  private emitLog(p: {
    orderId: string; trend: TrendType; amount: number; martingaleStep: number;
    dealId?: string; result?: FastradeLog['result']; profit?: number; note?: string;
  }) {
    this.callbacks.onLog({
      id: `${p.orderId}_s${p.martingaleStep}${p.result ? '_r' : ''}`,
      orderId: p.orderId, trend: p.trend, amount: p.amount,
      martingaleStep: p.martingaleStep, dealId: p.dealId, result: p.result,
      profit: p.profit, sessionPnL: this.sessionPnL,
      executedAt: Date.now(), cycleNumber: this.cycleNumber, note: p.note,
      isDemoAccount: this.config.isDemoAccount, mode: this.config.mode,
    });
  }

  private getNextMinuteBoundary(): number {
    const now = Date.now();
    return now + (60_000 - (now % 60_000));
  }

  /** setTimeout yang otomatis batal bila stop() dipanggil */
  private afterDelay(ms: number, fn: () => void) {
    const gen = this.stopGeneration;
    setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      fn();
    }, ms);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
