// lib/engine/aiSignalEngine.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — MODE AI SIGNAL DI PERANGKAT.
//
// PERUBAHAN v4 (keputusan pemilik produk): arah order dihasilkan ACAK di
// perangkat. Sebelumnya sinyal datang dari listener Telegram di server
// (TelegramSignalService) — Telegram dihapus di v4 dan VPS dimatikan,
// sehingga sumber lama tidak ada lagi. Tidak ada pengambilan data luar.
//
// CATATAN MATEMATIS (penting untuk ekspektasi):
// arah acak = peluang menang ±50%, sedangkan payout ±80% menuntut win
// rate ±56% untuk sekadar impas. Jadi mode ini secara statistik merugi
// dalam jangka panjang; martingale hanya menggeser distribusi kerugian,
// bukan menghilangkannya. Stop Loss harian tetap wajib.
//
// Alur eksekusi mengikuti pola Fastrade (yang sudah teruji):
//   siklus di batas menit → arah acak → eksekusi → tunggu hasil →
//   WIN: siklus baru · DRAW: ulangi arah · LOSE: martingale/Always Signal
// ─────────────────────────────────────────────────────────────────────

import { StockityWsClient, type DealResultPayload, type TradeOrderData } from './stockityWs';
import type { TrendType, MartingaleSettings, AssetConfig } from './scheduleEngine';

export interface AiSignalConfig {
  asset: AssetConfig;
  martingale: MartingaleSettings;
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
}

export interface AiSignalLog {
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
  mode: 'AISIGNAL';
}

export interface AiSignalCallbacks {
  onLog: (log: AiSignalLog) => void;
  onStatusChange: (status: string) => void;
  onStopped: () => void;
  onSessionPnL?: (pnl: number) => void;
}

const CYCLE_RESTART_DELAY_MS = 2_000;
const DIRECT_LOSS_DELAY_MS = 5_000;
const RESULT_TIMEOUT_MS = 150_000;
const MAX_RETRIES = 3;
const TERMINAL_STATUSES = new Set(['won', 'win', 'lost', 'lose', 'loss', 'stand', 'draw', 'tie']);

interface ActiveOrder {
  id: string; dealId?: string; trend: TrendType;
  amount: number; step: number; executedAt: number;
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Arah acak — memakai crypto bila tersedia agar tidak bias */
function randomTrend(): TrendType {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint8Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % 2 === 0 ? 'call' : 'put';
    }
  } catch { /* fallback di bawah */ }
  return Math.random() < 0.5 ? 'call' : 'put';
}

export class AiSignalEngine {
  private isRunning = false;
  private cycleNumber = 0;
  private currentTrend?: TrendType;
  private activeOrder?: ActiveOrder;

  private sessionPnL = 0;
  private totalWins = 0;
  private totalLosses = 0;
  private totalTrades = 0;

  private martingaleStep = 0;
  private alwaysLoss?: { currentMartingaleStep: number; totalLoss: number };

  private cycleTimer?: ReturnType<typeof setTimeout>;
  private resultTimer?: ReturnType<typeof setTimeout>;
  private stopGeneration = 0;
  private phase = 'IDLE';

  constructor(
    private readonly ws: StockityWsClient,
    private readonly config: AiSignalConfig,
    private readonly callbacks: AiSignalCallbacks,
  ) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sessionPnL = 0;
    this.totalWins = this.totalLosses = this.totalTrades = 0;
    this.martingaleStep = 0;
    this.alwaysLoss = undefined;
    this.callbacks.onStatusChange('AI Signal: bot berjalan');
    this.startNewCycle();
  }

  stop() {
    this.isRunning = false;
    this.stopGeneration++;
    this.clearCycleTimer();
    this.clearResultTimer();
    this.phase = 'IDLE';
    this.activeOrder = undefined;
    this.callbacks.onStatusChange('AI Signal: bot dihentikan');
    this.callbacks.onStopped();
  }

  handleWsDealResult = (payload: DealResultPayload) => this.handleDealResult(payload);

  getStatus() {
    return {
      isRunning: this.isRunning,
      botState: this.isRunning ? 'RUNNING' : 'STOPPED',
      phase: this.phase,
      cycleNumber: this.cycleNumber,
      currentTrend: this.currentTrend ?? null,
      martingaleStep: this.martingaleStep,
      alwaysSignalActive: !!this.alwaysLoss,
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
    this.phase = 'WAITING_MINUTE';
    this.clearCycleTimer();

    // Eksekusi disinkronkan ke batas menit agar durasi order konsisten
    const wait = this.getNextMinuteBoundary() - Date.now();
    this.callbacks.onStatusChange(`AI Signal CYCLE ${this.cycleNumber}: menunggu batas menit...`);

    const gen = this.stopGeneration;
    this.cycleTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      const trend = randomTrend();
      this.currentTrend = trend;
      this.callbacks.onStatusChange(`AI Signal CYCLE ${this.cycleNumber}: sinyal ${trend.toUpperCase()}`);
      void this.executeWithTrend(trend, 0);
    }, Math.max(0, wait) + 200);
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

  // ── Eksekusi ───────────────────────────────────

  private async executeWithTrend(trend: TrendType, step: number, retryCount = 0): Promise<void> {
    if (!this.isRunning) return;
    if (retryCount >= MAX_RETRIES) {
      this.callbacks.onStatusChange(`AI Signal: trade gagal ${MAX_RETRIES}× — bot dihentikan`);
      this.stop();
      return;
    }

    const effectiveStep = (this.alwaysLoss && step === 0) ? this.alwaysLoss.currentMartingaleStep : step;
    const amount = this.calcAmount(effectiveStep);
    this.phase = 'EXECUTING';

    let tradeData: TradeOrderData;
    try {
      tradeData = this.buildInstantTrade(trend, amount);
    } catch (err: any) {
      this.emitLog({ orderId: uid(), trend, amount, martingaleStep: effectiveStep,
        result: 'FAILED', note: `Build error: ${err?.message}` });
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    const orderId = uid();
    const result = await this.ws.placeTrade(tradeData);

    if (result.error === 'amount_min' || result.error === 'amount_max') {
      const why = result.error === 'amount_min' ? 'di bawah minimum' : 'melebihi maksimum';
      this.emitLog({ orderId, trend, amount, martingaleStep: effectiveStep, result: 'FAILED',
        note: `Amount ${why} Stockity` });
      this.callbacks.onStatusChange(`AI Signal: amount ${why} Stockity — bot dihentikan`);
      setTimeout(() => this.stop(), 300);
      return;
    }

    if (!result.dealId && result.error !== 'duplicate') {
      await this.sleep(500);
      return this.executeWithTrend(trend, step, retryCount + 1);
    }

    this.totalTrades++;
    this.activeOrder = { id: orderId, dealId: result.dealId ?? undefined, trend, amount, step: effectiveStep, executedAt: Date.now() };
    this.phase = 'WAITING_RESULT';
    this.emitLog({ orderId, trend, amount, martingaleStep: effectiveStep, dealId: result.dealId ?? undefined });
    this.startResultTimeout(orderId);
  }

  private buildInstantTrade(trend: TrendType, amount: number): TradeOrderData {
    const createdAtSeconds = Math.floor(Date.now() / 1000) + 1;
    const remainingInMinute = 60 - (createdAtSeconds % 60);
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
    if (!TERMINAL_STATUSES.has(s)) return;

    const active = this.activeOrder;
    if (!active) return;

    const dealId = String(payload.id ?? '');
    const isWin  = s === 'won' || s === 'win';
    const isDraw = s === 'stand' || s === 'draw' || s === 'tie';

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

    if (isWin) {
      this.alwaysLoss = undefined;
      this.martingaleStep = 0;
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
    } else if (isDraw) {
      // Seri: ulangi arah yang sama, step tidak berubah
      this.afterDelay(200, () => this.executeWithTrend(active.trend, this.martingaleStep));
    } else {
      this.onLose(active);
    }
  }

  private onLose(order: ActiveOrder) {
    const m = this.config.martingale;
    const trend = this.currentTrend ?? order.trend;

    if (m.isEnabled && m.isAlwaysSignal) {
      const nextStep = (this.alwaysLoss?.currentMartingaleStep ?? 0) + 1;
      this.alwaysLoss = nextStep <= m.maxSteps
        ? { currentMartingaleStep: nextStep, totalLoss: (this.alwaysLoss?.totalLoss ?? 0) + order.amount }
        : undefined;
      this.callbacks.onStatusChange(`AI Signal LOSE — Always Signal step ${nextStep}`);
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    if (m.isEnabled && m.maxSteps > 0) {
      const nextStep = this.martingaleStep + 1;
      if (nextStep <= m.maxSteps) {
        this.martingaleStep = nextStep;
        this.callbacks.onStatusChange(`AI Signal LOSE — martingale ${nextStep}/${m.maxSteps}`);
        this.afterDelay(200, () => this.executeWithTrend(trend, nextStep));
        return;
      }
      // Step habis → siklus baru dengan sinyal acak baru
      this.martingaleStep = 0;
      this.callbacks.onStatusChange('AI Signal: martingale maksimum — sinyal baru');
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    this.martingaleStep = 0;
    this.callbacks.onStatusChange(`AI Signal LOSE — tunggu ${DIRECT_LOSS_DELAY_MS / 1000}s`);
    this.scheduleNewCycle(DIRECT_LOSS_DELAY_MS);
  }

  private startResultTimeout(orderId: string) {
    this.clearResultTimer();
    const gen = this.stopGeneration;
    this.resultTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      if (this.activeOrder?.id !== orderId) return;
      this.activeOrder = undefined;
      this.callbacks.onStatusChange('AI Signal: hasil tidak diterima — cycle ulang');
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

  private calcAmount(step: number): number {
    const m = this.config.martingale;
    if (!m.isEnabled || step === 0) return m.baseAmount;
    if (m.multiplierType === 'FIXED') return Math.floor(m.baseAmount * Math.pow(m.multiplierValue, step));
    const mult = 1 + m.multiplierValue / 100;
    return Math.floor(m.baseAmount * Math.pow(mult, step));
  }

  private emitLog(p: {
    orderId: string; trend: TrendType; amount: number; martingaleStep: number;
    dealId?: string; result?: AiSignalLog['result']; profit?: number; note?: string;
  }) {
    this.callbacks.onLog({
      id: `${p.orderId}_s${p.martingaleStep}${p.result ? '_r' : ''}`,
      orderId: p.orderId, trend: p.trend, amount: p.amount,
      martingaleStep: p.martingaleStep, dealId: p.dealId, result: p.result,
      profit: p.profit, sessionPnL: this.sessionPnL,
      executedAt: Date.now(), cycleNumber: this.cycleNumber, note: p.note,
      isDemoAccount: this.config.isDemoAccount, mode: 'AISIGNAL',
    });
  }

  private getNextMinuteBoundary(): number {
    const now = Date.now();
    return now + (60_000 - (now % 60_000));
  }

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
