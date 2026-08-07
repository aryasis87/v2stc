// lib/engine/indicatorEngine.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — ENGINE INDICATOR (SMA / EMA / RSI) DI PERANGKAT.
// Port dari botstc/src/indicator/indicator.service.ts.
//
// Siklus (urutan dipertahankan dari server — analisis dikerjakan SEBELUM
// batas menit agar entry tepat di pergantian candle):
//   1. Ambil & agregasi candle
//   2. Analisis indikator → trend + strength
//   3. Susun prediksi harga, urut confidence menurun
//   4. Tunggu batas menit
//   5. Eksekusi memakai prediksi dengan confidence tertinggi
//
// Arah order:
//   SMA/EMA → trend-following: BULLISH (harga > MA) = call, BEARISH = put
//             (satu prediksi saja — versi lama membuat dua prediksi dengan
//              confidence sama sehingga urutannya non-deterministik dan arah
//              jadi acak; bug itu TIDAK dibawa ke sini)
//   RSI     → overbought = put, oversold = call, netral = pantulan rentang
// ─────────────────────────────────────────────────────────────────────

import { StockityWsClient, type DealResultPayload, type TradeOrderData } from './stockityWs';
import { fetchCandles5s, aggregateToMinutes, type StockityRestOptions, type Candle } from './stockityRest';
import { sleepUntil } from './preciseTiming';
import type { TrendType, MartingaleSettings, AssetConfig } from './scheduleEngine';

export type IndicatorType = 'SMA' | 'EMA' | 'RSI';

export interface IndicatorSettings {
  type: IndicatorType;
  period: number;
  sensitivity: number;
  rsiOverbought: number;
  rsiOversold: number;
}

export interface IndicatorConfig {
  asset: AssetConfig;
  settings: IndicatorSettings;
  martingale: MartingaleSettings;
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
}

export interface IndicatorLog {
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
  mode: 'INDICATOR';
  indicatorType?: IndicatorType;
  indicatorValue?: number;
}

export interface IndicatorCallbacks {
  onLog: (log: IndicatorLog) => void;
  onStatusChange: (status: string) => void;
  onStopped: () => void;
  onSessionPnL?: (pnl: number) => void;
}

interface AnalysisResult {
  indicatorType: IndicatorType;
  finalIndicatorValue: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
}

interface Prediction { recommendedTrend: TrendType; confidence: number }

const CYCLE_RESTART_DELAY_MS = 2_000;
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

// ── Perhitungan indikator (port apa adanya dari server) ───────────────

export function calculateSMA(candles: Candle[], period: number): AnalysisResult {
  const values: number[] = [];
  let windowSum = 0;
  for (let i = 0; i < period; i++) windowSum += candles[i].close;
  values.push(windowSum / period);
  for (let i = period; i < candles.length; i++) {
    windowSum += candles[i].close - candles[i - period].close;
    values.push(windowSum / period);
  }
  const finalValue = values[values.length - 1];
  const currentPrice = candles[candles.length - 1].close;
  return {
    indicatorType: 'SMA',
    finalIndicatorValue: finalValue,
    trend: currentPrice > finalValue ? 'BULLISH' : 'BEARISH',
    strength: trendStrength(values),
  };
}

export function calculateEMA(candles: Candle[], period: number): AnalysisResult {
  if (candles.length < period) return calculateSMA(candles, period);
  const values: number[] = [];
  const multiplier = 2 / (period + 1);
  // Seed = SMA periode awal (bukan candle pertama) agar konvergen cepat
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  values.push(ema);
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * multiplier + ema * (1 - multiplier);
    values.push(ema);
  }
  const finalValue = values[values.length - 1];
  const currentPrice = candles[candles.length - 1].close;
  return {
    indicatorType: 'EMA',
    finalIndicatorValue: finalValue,
    trend: currentPrice > finalValue ? 'BULLISH' : 'BEARISH',
    strength: trendStrength(values),
  };
}

export function calculateRSI(
  candles: Candle[], period: number, overbought: number, oversold: number,
): AnalysisResult {
  const values: number[] = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change; else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const initRs = avgLoss > 0 ? avgGain / avgLoss : 100;
  values.push(100 - 100 / (1 + initRs));

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    values.push(100 - 100 / (1 + rs));
  }

  const finalValue = values[values.length - 1];
  const trend: AnalysisResult['trend'] =
    finalValue > overbought ? 'BEARISH' : finalValue < oversold ? 'BULLISH' : 'NEUTRAL';
  const strength: AnalysisResult['strength'] =
    (finalValue > overbought || finalValue < oversold) ? 'STRONG'
      : (finalValue > 60 || finalValue < 40) ? 'MODERATE' : 'WEAK';

  return { indicatorType: 'RSI', finalIndicatorValue: finalValue, trend, strength };
}

function trendStrength(values: number[]): AnalysisResult['strength'] {
  if (values.length < 5) return 'WEAK';
  const recent = values.slice(-5);
  const up   = recent.every((v, i) => i === 0 || v >= recent[i - 1]);
  const down = recent.every((v, i) => i === 0 || v <= recent[i - 1]);
  if (up || down) return 'STRONG';
  if (recent[0] !== recent[recent.length - 1]) return 'MODERATE';
  return 'WEAK';
}

/** Prediksi harga → arah order; diurutkan confidence menurun (sama dgn server) */
export function generatePredictions(
  analysis: AnalysisResult, settings: IndicatorSettings, candles: Candle[],
): Prediction[] {
  const preds: Prediction[] = [];
  let baseConfidence = 0.6;
  if (analysis.strength === 'STRONG') baseConfidence = 0.8;
  else if (analysis.strength === 'MODERATE') baseConfidence = 0.7;

  let sensitivityBonus = 0;
  if (settings.sensitivity <= 0.1) sensitivityBonus = -0.05;
  else if (settings.sensitivity >= 5) sensitivityBonus = 0.05;
  const finalConfidence = Math.min(1, baseConfidence + sensitivityBonus);

  if (analysis.indicatorType === 'RSI') {
    const rsi = analysis.finalIndicatorValue;
    if (rsi >= settings.rsiOverbought) {
      preds.push({ recommendedTrend: 'put', confidence: finalConfidence * 0.9 });
      preds.push({ recommendedTrend: 'put', confidence: finalConfidence });
    } else if (rsi <= settings.rsiOversold) {
      preds.push({ recommendedTrend: 'call', confidence: finalConfidence });
      preds.push({ recommendedTrend: 'call', confidence: finalConfidence * 0.9 });
    } else {
      // Netral: main pantulan rentang
      preds.push({ recommendedTrend: 'put',  confidence: finalConfidence * 0.8 });
      preds.push({ recommendedTrend: 'call', confidence: finalConfidence * 0.8 });
    }
  } else {
    // SMA/EMA: satu prediksi searah analisis (hindari arah non-deterministik)
    preds.push({
      recommendedTrend: analysis.trend === 'BULLISH' ? 'call' : 'put',
      confidence: finalConfidence,
    });
  }

  return preds.sort((a, b) => b.confidence - a.confidence);
}

export class IndicatorEngine {
  private isRunning = false;
  private cycleNumber = 0;
  private activeOrder?: ActiveOrder;
  private lastAnalysis?: AnalysisResult;

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
    private readonly rest: StockityRestOptions,
    private readonly config: IndicatorConfig,
    private readonly callbacks: IndicatorCallbacks,
  ) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sessionPnL = 0;
    this.totalWins = this.totalLosses = this.totalTrades = 0;
    this.martingaleStep = 0;
    this.alwaysLoss = undefined;
    this.callbacks.onStatusChange('Indicator: bot berjalan');
    void this.runCycle();
  }

  stop() {
    this.isRunning = false;
    this.stopGeneration++;
    if (this.cycleTimer) { clearTimeout(this.cycleTimer); this.cycleTimer = undefined; }
    this.clearResultTimer();
    this.phase = 'IDLE';
    this.activeOrder = undefined;
    this.callbacks.onStatusChange('Indicator: bot dihentikan');
    this.callbacks.onStopped();
  }

  handleWsDealResult = (payload: DealResultPayload) => this.handleDealResult(payload);

  getStatus() {
    return {
      isRunning: this.isRunning,
      phase: this.phase,
      cycleNumber: this.cycleNumber,
      indicatorType: this.config.settings.type,
      indicatorValue: this.lastAnalysis?.finalIndicatorValue ?? null,
      trend: this.lastAnalysis?.trend ?? null,
      strength: this.lastAnalysis?.strength ?? null,
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

  private async runCycle(): Promise<void> {
    if (!this.isRunning) return;
    this.cycleNumber++;

    try {
      // Fase 1 — kumpulkan candle (agregasi ke 1 menit seperti server)
      this.phase = 'COLLECTING';
      this.callbacks.onStatusChange(`Indicator CYCLE ${this.cycleNumber}: mengambil candle...`);
      const candles5s = await fetchCandles5s(this.config.asset.ric, this.rest);
      const candles = aggregateToMinutes(candles5s);

      const need = Math.max(this.config.settings.period + 2, 6);
      if (candles.length < need) {
        this.callbacks.onStatusChange(`Indicator: data candle kurang (${candles.length}/${need}) — ulangi`);
        this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
        return;
      }
      if (!this.isRunning) return;

      // Fase 2 — analisis
      this.phase = 'ANALYZING';
      const analysis = this.analyze(candles);
      this.lastAnalysis = analysis;

      // Fase 3 — prediksi
      const predictions = generatePredictions(analysis, this.config.settings, candles);
      const best = predictions[0];
      if (!best) { this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS); return; }

      this.callbacks.onStatusChange(
        `Indicator CYCLE ${this.cycleNumber}: ${analysis.indicatorType} ${analysis.trend} ` +
        `(${analysis.strength}) → ${best.recommendedTrend.toUpperCase()}`,
      );

      // Fase 4 — tunggu batas menit (presisi, drift-corrected → entry tepat di
      // pergantian candle)
      this.phase = 'WAITING_BOUNDARY';
      await sleepUntil(this.getNextMinuteBoundary(), () => this.isRunning);
      if (!this.isRunning) return;

      // Fase 5 — eksekusi
      await this.executeWithTrend(best.recommendedTrend, 0);
    } catch {
      if (this.isRunning) this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
    }
  }

  private analyze(candles: Candle[]): AnalysisResult {
    const s = this.config.settings;
    switch (s.type) {
      case 'EMA': return calculateEMA(candles, s.period);
      case 'RSI': return calculateRSI(candles, s.period, s.rsiOverbought, s.rsiOversold);
      default:    return calculateSMA(candles, s.period);
    }
  }

  private scheduleNewCycle(delayMs: number) {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    const gen = this.stopGeneration;
    this.cycleTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      void this.runCycle();
    }, delayMs);
  }

  // ── Eksekusi ───────────────────────────────────

  private async executeWithTrend(trend: TrendType, step: number, retryCount = 0): Promise<void> {
    if (!this.isRunning) return;
    if (retryCount >= MAX_RETRIES) {
      this.callbacks.onStatusChange(`Indicator: trade gagal ${MAX_RETRIES}× — bot dihentikan`);
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
      this.callbacks.onStatusChange(`Indicator: amount ${why} Stockity — bot dihentikan`);
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
      this.afterDelay(200, () => this.executeWithTrend(active.trend, this.martingaleStep));
    } else {
      this.onLose(active);
    }
  }

  private onLose(order: ActiveOrder) {
    const m = this.config.martingale;

    // Always Signal: kerugian dibawa ke sinyal berikutnya (analisis ulang)
    if (m.isEnabled && m.isAlwaysSignal) {
      const nextStep = (this.alwaysLoss?.currentMartingaleStep ?? 0) + 1;
      this.alwaysLoss = nextStep <= m.maxSteps
        ? { currentMartingaleStep: nextStep, totalLoss: (this.alwaysLoss?.totalLoss ?? 0) + order.amount }
        : undefined;
      this.callbacks.onStatusChange(`Indicator LOSE — Always Signal step ${nextStep}`);
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    if (m.isEnabled && m.maxSteps > 0) {
      const nextStep = this.martingaleStep + 1;
      if (nextStep <= m.maxSteps) {
        this.martingaleStep = nextStep;
        this.callbacks.onStatusChange(`Indicator LOSE — martingale ${nextStep}/${m.maxSteps}`);
        // Martingale mempertahankan arah order terakhir
        this.afterDelay(200, () => this.executeWithTrend(order.trend, nextStep));
        return;
      }
      this.martingaleStep = 0;
      this.callbacks.onStatusChange('Indicator: martingale maksimum — analisis ulang');
      this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
      return;
    }

    this.martingaleStep = 0;
    this.scheduleNewCycle(CYCLE_RESTART_DELAY_MS);
  }

  private startResultTimeout(orderId: string) {
    this.clearResultTimer();
    const gen = this.stopGeneration;
    this.resultTimer = setTimeout(() => {
      if (!this.isRunning || gen !== this.stopGeneration) return;
      if (this.activeOrder?.id !== orderId) return;
      this.activeOrder = undefined;
      this.callbacks.onStatusChange('Indicator: hasil tidak diterima — cycle ulang');
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
    dealId?: string; result?: IndicatorLog['result']; profit?: number; note?: string;
  }) {
    this.callbacks.onLog({
      id: `${p.orderId}_s${p.martingaleStep}${p.result ? '_r' : ''}`,
      orderId: p.orderId, trend: p.trend, amount: p.amount,
      martingaleStep: p.martingaleStep, dealId: p.dealId, result: p.result,
      profit: p.profit, sessionPnL: this.sessionPnL,
      executedAt: Date.now(), cycleNumber: this.cycleNumber, note: p.note,
      isDemoAccount: this.config.isDemoAccount, mode: 'INDICATOR',
      indicatorType: this.config.settings.type,
      indicatorValue: this.lastAnalysis?.finalIndicatorValue,
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
