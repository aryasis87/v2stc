// lib/engine/momentumEngine.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — ENGINE MOMENTUM DI PERANGKAT.
// Port dari botstc/src/momentum/momentum.service.ts.
//
// Menganalisis candle 1 menit dan mencari 4 pola (bisa dinyalakan
// sendiri-sendiri), persis seperti server:
//   • Candle Sabit    — 3 candle searah dengan badan makin besar
//   • Doji Terjepit   — 3 candle badan >60% lalu doji (<10%) berbalik arah
//   • Doji Pembatalan — doji yang membalik arah candle sebelumnya
//   • BB/SAR Break    — tembus Bollinger Band searah Parabolic SAR
//
// Penyaring sinyal juga dipertahankan: cooldown 3 menit untuk sinyal
// berulang yang sama, ambang pergerakan harga 0,03%, dan maksimum 10
// sinyal per jam.
// ─────────────────────────────────────────────────────────────────────

import { StockityWsClient, type DealResultPayload, type TradeOrderData } from './stockityWs';
import { fetchCandles5s, aggregateToMinutes, type StockityRestOptions, type Candle } from './stockityRest';
import type { TrendType, MartingaleSettings, AssetConfig } from './scheduleEngine';

export interface MomentumPatterns {
  candleSabit: boolean;
  dojiTerjepit: boolean;
  dojiPembatalan: boolean;
  bbSarBreak: boolean;
}

export interface MomentumConfig {
  asset: AssetConfig;
  patterns: MomentumPatterns;
  martingale: MartingaleSettings;
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
}

export interface MomentumLog {
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
  mode: 'MOMENTUM';
  momentumType?: string;
}

export interface MomentumCallbacks {
  onLog: (log: MomentumLog) => void;
  onStatusChange: (status: string) => void;
  onStopped: () => void;
  onSessionPnL?: (pnl: number) => void;
}

// ── Konstanta — sama dengan types.ts server ──────────────────────────
const SIGNAL_COOLDOWN_MS = 3 * 60 * 1000;
const PRICE_MOVE_THRESHOLD = 0.0003;
const MAX_SIGNALS_PER_HOUR = 10;
const SIGNAL_HISTORY_CLEANUP_MS = 60 * 60 * 1000;
const MIN_CANDLES_FOR_BB_SAR = 10;

const ANALYSIS_INTERVAL_MS = 15_000;
const RESULT_TIMEOUT_MS = 150_000;
const MAX_RETRIES = 3;
const TERMINAL_STATUSES = new Set(['won', 'win', 'lost', 'lose', 'loss', 'stand', 'draw', 'tie']);

interface SignalState {
  lastSignal: string | null;
  lastSignalTime: number;
  lastPrice: number | null;
  signalHistory: number[];
}

interface MomentumSignal { momentumType: string; trend: TrendType; confidence: number; details: string }

interface ActiveOrder {
  id: string; dealId?: string; trend: TrendType;
  amount: number; step: number; executedAt: number; momentumType: string;
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── Helper candle ────────────────────────────────────────────────────
const candleTrend = (c: Candle) => (c.close > c.open ? 'buy' : 'sell');
const bodyPercentage = (c: Candle) => {
  const range = Math.abs(c.high - c.low);
  return range === 0 ? 0 : (Math.abs(c.close - c.open) / range) * 100;
};

export function bollingerBands(candles: Candle[], period = 20, mult = 2) {
  if (candles.length < period) return null;
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((acc, v) => acc + Math.pow(v - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return { upper: sma + stdDev * mult, middle: sma, lower: sma - stdDev * mult };
}

/** Parabolic SAR (Wilder): AF mulai 0,02 · langkah 0,02 · maksimum 0,20 */
export function parabolicSAR(candles: Candle[]): number {
  if (candles.length < 5) return candles[candles.length - 1].close;
  const AF_START = 0.02, AF_STEP = 0.02, AF_MAX = 0.20;
  let isUptrend = candles[1].close > candles[0].close;
  let sar = isUptrend ? candles[0].low : candles[0].high;
  let ep  = isUptrend ? candles[0].high : candles[0].low;
  let af  = AF_START;

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], curr = candles[i];
    const twoAgoLow  = i >= 2 ? candles[i - 2].low  : prev.low;
    const twoAgoHigh = i >= 2 ? candles[i - 2].high : prev.high;
    if (isUptrend) {
      const newSar = Math.min(sar + af * (ep - sar), prev.low, twoAgoLow);
      if (curr.low < newSar) { isUptrend = false; sar = ep; ep = curr.low; af = AF_START; }
      else { sar = newSar; if (curr.high > ep) { ep = curr.high; af = Math.min(af + AF_STEP, AF_MAX); } }
    } else {
      const newSar = Math.max(sar + af * (ep - sar), prev.high, twoAgoHigh);
      if (curr.high > newSar) { isUptrend = true; sar = ep; ep = curr.high; af = AF_START; }
      else { sar = newSar; if (curr.low < ep) { ep = curr.low; af = Math.min(af + AF_STEP, AF_MAX); } }
    }
  }
  return sar;
}

export class MomentumEngine {
  private isRunning = false;
  private cycleNumber = 0;
  private activeOrder?: ActiveOrder;
  private candles: Candle[] = [];

  private sessionPnL = 0;
  private totalWins = 0;
  private totalLosses = 0;
  private totalTrades = 0;

  private martingaleStep = 0;
  private alwaysLoss?: { currentMartingaleStep: number; totalLoss: number };

  private states: Record<string, SignalState> = {
    candleSabit:    this.newState(),
    dojiTerjepit:   this.newState(),
    dojiPembatalan: this.newState(),
    bbSarBreak:     this.newState(),
  };

  private loopTimer?: ReturnType<typeof setInterval>;
  private resultTimer?: ReturnType<typeof setTimeout>;
  private stopGeneration = 0;
  private analyzing = false;
  private lastSignalInfo = '';

  constructor(
    private readonly ws: StockityWsClient,
    private readonly rest: StockityRestOptions,
    private readonly config: MomentumConfig,
    private readonly callbacks: MomentumCallbacks,
  ) {}

  private newState(): SignalState {
    return { lastSignal: null, lastSignalTime: 0, lastPrice: null, signalHistory: [] };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sessionPnL = 0;
    this.totalWins = this.totalLosses = this.totalTrades = 0;
    this.martingaleStep = 0;
    this.alwaysLoss = undefined;
    this.callbacks.onStatusChange('Momentum: bot berjalan');
    void this.tick();
    this.loopTimer = setInterval(() => void this.tick(), ANALYSIS_INTERVAL_MS);
  }

  stop() {
    this.isRunning = false;
    this.stopGeneration++;
    if (this.loopTimer) { clearInterval(this.loopTimer); this.loopTimer = undefined; }
    this.clearResultTimer();
    this.activeOrder = undefined;
    this.callbacks.onStatusChange('Momentum: bot dihentikan');
    this.callbacks.onStopped();
  }

  handleWsDealResult = (payload: DealResultPayload) => this.handleDealResult(payload);

  getStatus() {
    return {
      isRunning: this.isRunning,
      cycleNumber: this.cycleNumber,
      candleCount: this.candles.length,
      lastSignal: this.lastSignalInfo || null,
      martingaleStep: this.martingaleStep,
      alwaysSignalActive: !!this.alwaysLoss,
      sessionPnL: this.sessionPnL,
      totalWins: this.totalWins,
      totalLosses: this.totalLosses,
      totalTrades: this.totalTrades,
      wsConnected: this.ws.isConnected(),
    };
  }

  // ── Siklus analisis ────────────────────────────

  private async tick(): Promise<void> {
    if (!this.isRunning || this.analyzing) return;
    // Satu order aktif pada satu waktu — cegah sinyal menumpuk
    if (this.activeOrder) return;

    this.analyzing = true;
    try {
      this.cycleNumber++;
      const candles5s = await fetchCandles5s(this.config.asset.ric, this.rest);
      if (!candles5s.length) return;
      this.candles = aggregateToMinutes(candles5s);
      if (this.candles.length < 4) return;

      const signal = this.detectSignal();
      if (!signal) return;

      this.lastSignalInfo = `${signal.momentumType} → ${signal.trend.toUpperCase()}`;
      this.callbacks.onStatusChange(`Momentum: ${signal.details}`);
      await this.executeWithTrend(signal.trend, 0, signal.momentumType);
    } catch {
      /* siklus berikutnya akan mencoba lagi */
    } finally {
      this.analyzing = false;
    }
  }

  /** Pola dievaluasi berurutan seperti server; sinyal pertama yang lolos dipakai */
  private detectSignal(): MomentumSignal | null {
    const p = this.config.patterns;
    if (p.candleSabit) {
      const s = this.analyzeCandleSabit(); if (s) return s;
    }
    if (p.dojiTerjepit) {
      const s = this.analyzeDojiTerjepit(); if (s) return s;
    }
    if (p.dojiPembatalan) {
      const s = this.analyzeDojiPembatalan(); if (s) return s;
    }
    if (p.bbSarBreak && this.candles.length >= MIN_CANDLES_FOR_BB_SAR) {
      const s = this.analyzeBBSARBreak(); if (s) return s;
    }
    return null;
  }

  private analyzeCandleSabit(): MomentumSignal | null {
    if (this.candles.length < 4) return null;
    const l = this.candles.slice(-4);
    const t2 = candleTrend(l[1]), t3 = candleTrend(l[2]), t4 = candleTrend(l[3]);
    if (t2 !== t3 || t3 !== t4) return null;

    const b2 = Math.abs(l[1].close - l[1].open);
    const b3 = Math.abs(l[2].close - l[2].open);
    const b4 = Math.abs(l[3].close - l[3].open);
    if (!(b2 < b3 && b3 < b4)) return null;

    const trend: TrendType = t2 === 'buy' ? 'call' : 'put';
    if (!this.allow('candleSabit', trend, l[3].close)) return null;
    this.record('candleSabit', trend, l[3].close);

    const confidence = (b2 === 0 || b3 === 0) ? 0.5 : Math.min(0.9, 0.5 + (b3 / b2 + b4 / b3) * 0.1);
    return { momentumType: 'CANDLE_SABIT', trend, confidence, details: 'Candle Sabit: badan candle membesar berurutan' };
  }

  private analyzeDojiTerjepit(): MomentumSignal | null {
    if (this.candles.length < 4) return null;
    const l = this.candles.slice(-4);
    const t1 = candleTrend(l[0]), t2 = candleTrend(l[1]), t3 = candleTrend(l[2]);
    if (t1 !== t2 || t2 !== t3) return null;

    const b1 = bodyPercentage(l[0]), b2 = bodyPercentage(l[1]);
    const b3 = bodyPercentage(l[2]), b4 = bodyPercentage(l[3]);
    if (!(b1 > 60 && b2 > 60 && b3 > 60 && b4 < 10)) return null;

    const t4 = candleTrend(l[3]);
    let trend: TrendType;
    if (t1 === 'buy' && t4 === 'sell')      trend = 'put';
    else if (t1 === 'sell' && t4 === 'buy') trend = 'call';
    else return null;

    if (!this.allow('dojiTerjepit', trend, l[3].close)) return null;
    this.record('dojiTerjepit', trend, l[3].close);
    return { momentumType: 'DOJI_TERJEPIT', trend, confidence: 0.8, details: 'Doji Terjepit: 3 candle panjang + doji pembalik' };
  }

  private analyzeDojiPembatalan(): MomentumSignal | null {
    if (this.candles.length < 2) return null;
    const [prev, curr] = this.candles.slice(-2);
    if (bodyPercentage(curr) >= 10) return null;

    const pt = candleTrend(prev), dt = candleTrend(curr);
    let trend: TrendType;
    if (pt === 'sell' && dt === 'buy')      trend = 'call';
    else if (pt === 'buy' && dt === 'sell') trend = 'put';
    else return null;

    if (!this.allow('dojiPembatalan', trend, curr.close)) return null;
    this.record('dojiPembatalan', trend, curr.close);
    return { momentumType: 'DOJI_PEMBATALAN', trend, confidence: 0.75, details: 'Doji Pembatalan: pembalikan arah terdeteksi' };
  }

  private analyzeBBSARBreak(): MomentumSignal | null {
    const last = this.candles[this.candles.length - 1];
    const close = last.close;
    const bb = bollingerBands(this.candles, 20, 2);
    if (!bb) return null;
    const sar = parabolicSAR(this.candles);

    let trend: TrendType;
    if (close > bb.upper && close > sar)      trend = 'call';
    else if (close < bb.lower && close < sar) trend = 'put';
    else return null;

    if (!this.allow('bbSarBreak', trend, close)) return null;
    this.record('bbSarBreak', trend, close);
    return { momentumType: 'BB_SAR_BREAK', trend, confidence: 0.85, details: 'BB/SAR Break: tren kuat lolos filter' };
  }

  // ── Penyaring sinyal ───────────────────────────

  private allow(key: string, signal: string, price: number): boolean {
    const st = this.states[key];
    const now = Date.now();
    if (signal === st.lastSignal) {
      if (now - st.lastSignalTime < SIGNAL_COOLDOWN_MS) return false;
      if (st.lastPrice !== null) {
        const change = Math.abs((price - st.lastPrice) / st.lastPrice);
        if (change < PRICE_MOVE_THRESHOLD) return false;
      }
    }
    st.signalHistory = st.signalHistory.filter(t => now - t <= SIGNAL_HISTORY_CLEANUP_MS);
    return st.signalHistory.length < MAX_SIGNALS_PER_HOUR;
  }

  private record(key: string, signal: string, price: number) {
    const st = this.states[key];
    st.lastSignal = signal;
    st.lastSignalTime = Date.now();
    st.lastPrice = price;
    st.signalHistory.push(Date.now());
  }

  // ── Eksekusi ───────────────────────────────────

  private async executeWithTrend(
    trend: TrendType, step: number, momentumType: string, retryCount = 0,
  ): Promise<void> {
    if (!this.isRunning) return;
    if (retryCount >= MAX_RETRIES) {
      this.callbacks.onStatusChange(`Momentum: trade gagal ${MAX_RETRIES}× — bot dihentikan`);
      this.stop();
      return;
    }

    const effectiveStep = (this.alwaysLoss && step === 0) ? this.alwaysLoss.currentMartingaleStep : step;
    const amount = this.calcAmount(effectiveStep);

    let tradeData: TradeOrderData;
    try {
      tradeData = this.buildInstantTrade(trend, amount);
    } catch (err: any) {
      this.emitLog({ orderId: uid(), trend, amount, martingaleStep: effectiveStep,
        result: 'FAILED', note: `Build error: ${err?.message}`, momentumType });
      return;
    }

    const orderId = uid();
    const result = await this.ws.placeTrade(tradeData);

    if (result.error === 'amount_min' || result.error === 'amount_max') {
      const why = result.error === 'amount_min' ? 'di bawah minimum' : 'melebihi maksimum';
      this.emitLog({ orderId, trend, amount, martingaleStep: effectiveStep, result: 'FAILED',
        note: `Amount ${why} Stockity`, momentumType });
      this.callbacks.onStatusChange(`Momentum: amount ${why} Stockity — bot dihentikan`);
      setTimeout(() => this.stop(), 300);
      return;
    }

    if (!result.dealId && result.error !== 'duplicate') {
      await this.sleep(500);
      return this.executeWithTrend(trend, step, momentumType, retryCount + 1);
    }

    this.totalTrades++;
    this.activeOrder = {
      id: orderId, dealId: result.dealId ?? undefined, trend,
      amount, step: effectiveStep, executedAt: Date.now(), momentumType,
    };
    this.emitLog({ orderId, trend, amount, martingaleStep: effectiveStep, dealId: result.dealId ?? undefined, momentumType });
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
      martingaleStep: active.step, dealId, momentumType: active.momentumType,
      result: isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSE',
      profit: pnl, note: `Result: ${isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSE'}`,
    });

    if (this.checkStopConditions()) return;

    if (isWin) {
      this.alwaysLoss = undefined;
      this.martingaleStep = 0;
    } else if (isDraw) {
      this.afterDelay(200, () => this.executeWithTrend(active.trend, this.martingaleStep, active.momentumType));
    } else {
      this.onLose(active);
    }
    // Selain kasus di atas, siklus analisis berikutnya jalan otomatis.
  }

  private onLose(order: ActiveOrder) {
    const m = this.config.martingale;

    if (m.isEnabled && m.isAlwaysSignal) {
      const nextStep = (this.alwaysLoss?.currentMartingaleStep ?? 0) + 1;
      this.alwaysLoss = nextStep <= m.maxSteps
        ? { currentMartingaleStep: nextStep, totalLoss: (this.alwaysLoss?.totalLoss ?? 0) + order.amount }
        : undefined;
      this.callbacks.onStatusChange(`Momentum LOSE — Always Signal step ${nextStep} (tunggu sinyal berikutnya)`);
      return;
    }

    if (m.isEnabled && m.maxSteps > 0) {
      const nextStep = this.martingaleStep + 1;
      if (nextStep <= m.maxSteps) {
        this.martingaleStep = nextStep;
        this.callbacks.onStatusChange(`Momentum LOSE — martingale ${nextStep}/${m.maxSteps}`);
        this.afterDelay(200, () => this.executeWithTrend(order.trend, nextStep, order.momentumType));
        return;
      }
      this.martingaleStep = 0;
      this.callbacks.onStatusChange('Momentum: martingale maksimum — tunggu sinyal baru');
      return;
    }

    this.martingaleStep = 0;
  }

  private startResultTimeout(orderId: string) {
    this.clearResultTimer();
    const gen = this.stopGeneration;
    this.resultTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      if (this.activeOrder?.id !== orderId) return;
      this.activeOrder = undefined;
      this.callbacks.onStatusChange('Momentum: hasil tidak diterima — lanjut analisis');
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
    dealId?: string; result?: MomentumLog['result']; profit?: number; note?: string; momentumType?: string;
  }) {
    this.callbacks.onLog({
      id: `${p.orderId}_s${p.martingaleStep}${p.result ? '_r' : ''}`,
      orderId: p.orderId, trend: p.trend, amount: p.amount,
      martingaleStep: p.martingaleStep, dealId: p.dealId, result: p.result,
      profit: p.profit, sessionPnL: this.sessionPnL,
      executedAt: Date.now(), cycleNumber: this.cycleNumber, note: p.note,
      isDemoAccount: this.config.isDemoAccount, mode: 'MOMENTUM',
      momentumType: p.momentumType,
    });
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
