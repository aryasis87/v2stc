// lib/engine/scheduleEngine.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — ENGINE MODE SCHEDULE DI PERANGKAT USER (tanpa VPS).
// Port dari botstc/src/schedule/schedule-executor.ts.
//
// Perilaku dijaga IDENTIK dengan engine server (konstanta, urutan
// keputusan, dan penanganan tepi yang sama), karena logika itu sudah
// teruji di produksi:
//   • tick adaptif 50ms/1000ms + jendela eksekusi 4900ms
//   • guard re-entrant executeOrder
//   • pencocokan hasil 3 lapis (dealId → uuid → amount+trend+120s)
//   • guard status terminal (bo:opened TIDAK pernah dianggap kalah)
//   • martingale reguler & Always Signal, deteksi step macet
//   • PnL sesi + Stop Loss / Stop Profit
//   • timeout hasil 120s & pengecekan selesai
//
// Bedanya dengan server: tidak ada Firestore/tracking service — status
// dikirim ke UI lewat callback, dan riwayat disimpan pemanggil.
// ─────────────────────────────────────────────────────────────────────

import { StockityWsClient, type DealResultPayload, type TradeOrderData } from './stockityWs';

export type BotState = 'STOPPED' | 'RUNNING' | 'PAUSED';
export type MultiplierType = 'FIXED' | 'PERCENTAGE';
export type TrendType = 'call' | 'put';

export interface MartingaleSettings {
  isEnabled: boolean;
  maxSteps: number;
  baseAmount: number;
  multiplierValue: number;
  multiplierType: MultiplierType;
  isAlwaysSignal: boolean;
}

export interface AssetConfig {
  ric: string;
  name: string;
  profitRate?: number;
}

export interface ScheduleConfig {
  asset: AssetConfig;
  martingale: MartingaleSettings;
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  duration?: number;
  /** Bot berhenti bila PnL sesi <= -stopLoss (0/undefined = nonaktif) */
  stopLoss?: number;
  /** Bot berhenti bila PnL sesi >= stopProfit (0/undefined = nonaktif) */
  stopProfit?: number;
}

export interface MartingaleState {
  isActive: boolean;
  currentStep: number;
  maxSteps: number;
  isCompleted: boolean;
  finalResult?: string;
  totalLoss: number;
  totalRecovered: number;
  failureReason?: string;
  lastUpdateTime?: number;
}

export interface ScheduledOrder {
  id: string;
  time: string;
  trend: TrendType;
  timeInMillis: number;
  isExecuted: boolean;
  isSkipped: boolean;
  skipReason?: string;
  martingaleState: MartingaleState;
  result?: string;
  activeDealId?: string;
}

export interface ExecutionLog {
  id: string;
  orderId: string;
  time: string;
  trend: TrendType;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: 'WIN' | 'LOSE' | 'DRAW' | 'FAILED';
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  isDemoAccount: boolean;
}

export interface EngineCallbacks {
  onOrdersUpdate: (orders: ScheduledOrder[]) => void;
  onLog: (log: ExecutionLog) => void;
  onAllCompleted: () => void;
  onStatusChange: (status: string) => void;
  onSessionPnL?: (pnl: number) => void;
  /**
   * Dipanggil setiap state sesi berubah (order/PnL/berhenti) agar pemanggil
   * bisa menyimpannya untuk pemulihan. `final=true` menandai perubahan yang
   * harus disimpan segera (jangan di-throttle).
   */
  onPersist?: (snapshot: EngineSnapshot, final?: boolean) => void;
}

export interface EngineSnapshot {
  orders: ScheduledOrder[];
  config: ScheduleConfig;
  sessionPnL: number;
  botState: BotState;
  startedAt?: number;
}

// ── Konstanta — SAMA PERSIS dengan engine server ──────────────────────
const EXECUTION_ADVANCE_MS = 200;
const EXECUTION_WINDOW_MS = 4900;
const MARTINGALE_MAX_DURATION_MS = 600_000;
const STEP_STUCK_THRESHOLD_MS = 150_000;
const MAX_RESULT_WAIT_MS = 120_000;
const FALLBACK_MATCH_WINDOW_MS = 120_000;
const TERMINAL_STATUSES = new Set(['won', 'win', 'lost', 'lose', 'loss', 'stand', 'draw', 'tie']);

interface ExecutionInfo {
  orderId: string;
  amount: number;
  trend: TrendType;
  executedAt: number;
  estimatedCompletionTime: number;
}

interface AlwaysSignalLossState {
  hasOutstandingLoss: boolean;
  currentMartingaleStep: number;
  originalOrderId: string;
  totalLoss: number;
  currentTrend: TrendType;
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class ScheduleEngine {
  private botState: BotState = 'STOPPED';
  private orders: ScheduledOrder[];
  private config: ScheduleConfig;

  private activeMartingaleOrderId?: string;
  private martingaleStartTime?: number;
  private alwaysSignalLossState?: AlwaysSignalLossState;

  private monitoringTimer?: ReturnType<typeof setInterval>;
  private completionTimer?: ReturnType<typeof setInterval>;
  private lastCompletionCheck = 0;

  private readonly FAST_TICK_MS = 50;
  private readonly IDLE_TICK_MS = 1000;
  private currentTickInterval = 0;

  private executingOrderIds = new Set<string>();
  private executionInfoMap = new Map<string, ExecutionInfo>();
  private hasCompleted = false;
  private sessionPnL = 0;
  private startedAt?: number;

  constructor(
    private readonly ws: StockityWsClient,
    private readonly callbacks: EngineCallbacks,
    initialOrders: ScheduledOrder[],
    initialConfig: ScheduleConfig,
  ) {
    this.orders = initialOrders.map(o => ({ ...o }));
    this.config = { ...initialConfig };
  }

  // ── Kontrol ────────────────────────────────────

  /**
   * Mulai sesi. `resumeState` dipakai saat melanjutkan sesi yang tertunda
   * (aplikasi sempat ditutup) agar PnL & waktu mulai tidak ter-reset.
   */
  start(resumeState?: { sessionPnL?: number; startedAt?: number }) {
    if (this.botState === 'RUNNING') return;
    this.botState = 'RUNNING';
    this.hasCompleted = false;
    this.sessionPnL = resumeState?.sessionPnL ?? 0;
    this.startedAt  = resumeState?.startedAt ?? Date.now();
    this.callbacks.onStatusChange(resumeState ? 'Sesi dilanjutkan' : 'Bot berjalan');
    this.startMonitoringLoop(this.IDLE_TICK_MS);
    this.startCompletionCheck();
    this.persist(true);
  }

  /** Kirim snapshot ke pemanggil untuk disimpan (pemulihan sesi) */
  private persist(final = false) {
    this.callbacks.onPersist?.({
      orders: this.orders,
      config: this.config,
      sessionPnL: this.sessionPnL,
      botState: this.botState,
      startedAt: this.startedAt,
    }, final);
  }

  pause() {
    if (this.botState !== 'RUNNING') return;
    this.botState = 'PAUSED';
    this.stopMonitoringLoop();
    this.callbacks.onStatusChange('Bot dijeda');
    this.persist(true);
  }

  resume() {
    if (this.botState !== 'PAUSED') return;
    this.botState = 'RUNNING';
    this.startMonitoringLoop(this.IDLE_TICK_MS);
    this.callbacks.onStatusChange('Bot dilanjutkan');
    this.persist(true);
  }

  stop() {
    this.botState = 'STOPPED';
    this.stopMonitoringLoop();
    this.stopCompletionCheck();
    this.activeMartingaleOrderId = undefined;
    this.martingaleStartTime = undefined;
    this.executingOrderIds.clear();
    this.callbacks.onStatusChange('Bot dihentikan');
    this.persist(true);
  }

  setOrders(orders: ScheduledOrder[]) {
    this.orders = orders.map(o => ({ ...o }));
    this.callbacks.onOrdersUpdate(this.orders);
  }

  updateConfig(patch: Partial<ScheduleConfig>) {
    this.config = { ...this.config, ...patch };
  }

  /** Sambungkan hasil deal dari WS ke engine (dipanggil pemilik instance) */
  handleWsDealResult = (payload: DealResultPayload) => this.handleDealResult(payload);

  // ── Loop monitoring ────────────────────────────

  private startMonitoringLoop(intervalMs = this.IDLE_TICK_MS) {
    this.stopMonitoringLoop();
    this.currentTickInterval = intervalMs;
    this.monitoringTimer = setInterval(() => this.tick(), intervalMs);
  }

  private stopMonitoringLoop() {
    if (this.monitoringTimer) { clearInterval(this.monitoringTimer); this.monitoringTimer = undefined; }
    this.currentTickInterval = 0;
  }

  /** Tick cepat (50ms) saat order berikutnya <10s atau ada yang menunggu hasil */
  private adjustTickInterval(now: number) {
    if (this.botState !== 'RUNNING') return;

    const nextPending = this.orders
      .filter(o => !o.isExecuted && !o.isSkipped)
      .reduce<ScheduledOrder | null>((min, o) => (!min || o.timeInMillis < min.timeInMillis ? o : min), null);

    const timeUntilNext = nextPending ? nextPending.timeInMillis - EXECUTION_ADVANCE_MS - now : Infinity;
    const hasAwaitingResult = this.orders.some(o => o.isExecuted && !o.isSkipped);

    const target = (timeUntilNext < 10_000 || hasAwaitingResult) ? this.FAST_TICK_MS : this.IDLE_TICK_MS;
    if (this.currentTickInterval !== target) this.startMonitoringLoop(target);
  }

  private tick() {
    if (this.botState !== 'RUNNING') return;
    const now = Date.now();
    let changed = false;

    this.checkStuckMartingale(now);

    for (let i = 0; i < this.orders.length; i++) {
      const order = this.orders[i];
      if (order.isExecuted || order.isSkipped) continue;

      const timeUntil = order.timeInMillis - EXECUTION_ADVANCE_MS - now;

      if (timeUntil < -EXECUTION_WINDOW_MS) {
        this.orders[i] = { ...order, isSkipped: true, skipReason: 'Expired' };
        changed = true;
        continue;
      }

      if (timeUntil <= 0) {
        if (this.activeMartingaleOrderId && this.activeMartingaleOrderId !== order.id) {
          this.orders[i] = { ...order, isSkipped: true, skipReason: 'Martingale conflict' };
          changed = true;
          continue;
        }
        this.orders[i] = { ...order, isExecuted: true };
        changed = true;
        void this.executeOrder(this.orders[i]);
      }
    }

    if (changed) { this.callbacks.onOrdersUpdate(this.orders); this.persist(); }
    this.adjustTickInterval(now);
  }

  // ── Eksekusi ───────────────────────────────────

  private async executeOrder(order: ScheduledOrder) {
    if (this.executingOrderIds.has(order.id)) return; // guard re-entrant
    this.executingOrderIds.add(order.id);
    try {
      const isAlways = this.config.martingale.isEnabled && this.config.martingale.isAlwaysSignal;
      const lossState = this.alwaysSignalLossState;
      const hasLoss = isAlways && lossState?.hasOutstandingLoss;
      const step = hasLoss ? lossState!.currentMartingaleStep : 0;
      const amount = this.calcAmount(step);

      let tradeData: TradeOrderData;
      try {
        tradeData = this.buildTradeOrder(order.trend, amount, true, order.timeInMillis);
      } catch (err: any) {
        this.callbacks.onLog({
          id: uid(), orderId: order.id, time: order.time, trend: order.trend,
          amount, martingaleStep: step, result: 'FAILED', executedAt: Date.now(),
          note: `Timing error: ${err?.message}`, isDemoAccount: this.config.isDemoAccount,
        });
        return;
      }

      const estimatedCompletionTime = tradeData.expireAt * 1000;
      const result = await this.ws.placeTrade(tradeData);
      const dealId = result.dealId;

      this.executionInfoMap.set(order.id, {
        orderId: order.id, amount, trend: order.trend,
        executedAt: Date.now(), estimatedCompletionTime,
      });

      // amount_min → percuma retry, hentikan bot
      if (result.error === 'amount_min') {
        this.callbacks.onStatusChange('Trade gagal: amount di bawah minimum Stockity. Cek konfigurasi.');
        this.executionInfoMap.delete(order.id);
        this.callbacks.onLog({
          id: uid(), orderId: order.id, time: order.time, trend: order.trend,
          amount, martingaleStep: step, result: 'FAILED', executedAt: Date.now(),
          note: 'Amount di bawah minimum Stockity', isDemoAccount: this.config.isDemoAccount,
        });
        setTimeout(() => { this.stop(); this.fireAllCompleted(); }, 300);
        return;
      }

      if (dealId) {
        const idx = this.orders.findIndex(o => o.id === order.id);
        if (idx !== -1) {
          this.orders[idx] = { ...this.orders[idx], activeDealId: dealId };
          this.callbacks.onOrdersUpdate(this.orders);
        }
      } else if (result.error !== 'duplicate') {
        this.executionInfoMap.delete(order.id);
        if (isAlways) this.advanceAlwaysSignalLoss(order, step, amount);
      }

      this.callbacks.onLog({
        id: `${order.id}_s${step}`,
        orderId: order.id, time: order.time, trend: order.trend,
        amount, martingaleStep: step, dealId: dealId ?? undefined,
        result: (result.error && result.error !== 'duplicate') ? 'FAILED' : undefined,
        executedAt: Date.now(),
        note: result.error === 'duplicate' ? 'Duplicate deal — menunggu hasil via WS' : undefined,
        isDemoAccount: this.config.isDemoAccount,
      });
    } finally {
      this.executingOrderIds.delete(order.id);
    }
  }

  // ── Hasil deal ─────────────────────────────────

  private handleDealResult(payload: DealResultPayload) {
    const dealId = String(payload.id ?? '');
    if (!dealId) return;

    const s = (payload.status || payload.result || '').toLowerCase();
    // GUARD KRITIS: bo:opened tak punya status terminal — tanpa ini,
    // fallback matching akan salah menganggapnya kalah.
    if (!TERMINAL_STATUSES.has(s)) return;

    const isWin  = s === 'won' || s === 'win';
    const isDraw = s === 'stand' || s === 'draw' || s === 'tie';

    // Lapis 1: activeDealId persis
    let orderIdx = this.orders.findIndex(o => o.activeDealId === dealId);

    // Lapis 2: cross-ref uuid
    if (orderIdx === -1 && payload.uuid && payload.uuid !== dealId) {
      orderIdx = this.orders.findIndex(o => o.activeDealId === payload.uuid);
    }

    // Lapis 3: fallback amount + trend + jendela 120s
    if (orderIdx === -1) {
      orderIdx = this.findOrderByExecutionInfo(payload);
      if (orderIdx !== -1) this.orders[orderIdx] = { ...this.orders[orderIdx], activeDealId: dealId };
    }

    if (orderIdx === -1) {
      if (this.activeMartingaleOrderId) {
        const mIdx = this.orders.findIndex(o => o.id === this.activeMartingaleOrderId);
        if (mIdx !== -1) this.processMartingaleResult(mIdx, isWin, isDraw, dealId);
      }
      return;
    }

    const order = this.orders[orderIdx];
    this.executionInfoMap.delete(order.id);

    const isAlways  = this.config.martingale.isEnabled && this.config.martingale.isAlwaysSignal;
    const isRegular = this.config.martingale.isEnabled && !isAlways && this.config.martingale.maxSteps > 1;

    if (isDraw) { this.completeOrder(orderIdx, 'DRAW', dealId); return; }

    if (isWin) {
      if (isAlways) this.alwaysSignalLossState = undefined;
      if (this.activeMartingaleOrderId === order.id) {
        this.activeMartingaleOrderId = undefined;
        this.martingaleStartTime = undefined;
      }
      this.completeOrder(orderIdx, 'WIN', dealId);
      return;
    }

    if (isAlways) {
      const step = this.alwaysSignalLossState?.currentMartingaleStep ?? 0;
      this.advanceAlwaysSignalLoss(order, step, this.calcAmount(step));
      this.completeOrder(orderIdx, 'LOSE', dealId);
    } else if (isRegular) {
      if (order.martingaleState.isActive && order.martingaleState.currentStep > 0) {
        this.processMartingaleResult(orderIdx, false, false, dealId);
      } else {
        // Langkah dasar (step 0) KALAH lalu dilanjutkan martingale — hasilnya
        // wajib dicatat lebih dulu, kalau tidak ia menggantung "Menunggu" dan
        // modalnya tidak ikut dihitung di P/L sesi.
        this.recordStepLoss(order, 0, dealId);
        this.startMartingale(order, orderIdx);
      }
    } else {
      this.completeOrder(orderIdx, 'LOSE', dealId);
    }
  }

  private findOrderByExecutionInfo(payload: DealResultPayload): number {
    const payloadAmount = payload.amount;
    const payloadTrend  = payload.trend;
    const now = Date.now();

    return this.orders.findIndex(o => {
      if (!o.isExecuted || o.isSkipped) return false;
      if (o.martingaleState.isCompleted) return false;

      const info = this.executionInfoMap.get(o.id);
      if (!info) return false;
      if (now - info.executedAt > FALLBACK_MATCH_WINDOW_MS) return false;
      if (payloadAmount !== undefined && info.amount !== payloadAmount) return false;
      if (payloadTrend && info.trend !== payloadTrend) return false;
      return true;
    });
  }

  // ── Martingale ─────────────────────────────────

  private processMartingaleResult(orderIdx: number, isWin: boolean, isDraw: boolean, dealId: string) {
    const order = this.orders[orderIdx];
    const step = order.martingaleState.currentStep;
    const max  = this.config.martingale.maxSteps;

    const clearActive = () => {
      this.activeMartingaleOrderId = undefined;
      this.martingaleStartTime = undefined;
      this.executionInfoMap.delete(order.id);
    };

    if (isDraw) { clearActive(); this.completeOrder(orderIdx, 'DRAW', dealId); return; }
    if (isWin)  { clearActive(); this.completeOrder(orderIdx, 'WIN', dealId);  return; }

    if (step >= max) {
      clearActive();
      this.completeOrder(orderIdx, 'LOSE', dealId);
    } else {
      // Langkah ini kalah tetapi perjalanannya belum selesai. Catat dulu
      // hasilnya sebelum naik ke langkah berikutnya.
      this.recordStepLoss(order, step, dealId);
      const next = step + 1;
      this.updateMartingaleStep(orderIdx, next);
      void this.placeMartingaleTrade(order, next, this.calcAmount(next));
    }
  }

  private async placeMartingaleTrade(order: ScheduledOrder, step: number, amount: number) {
    this.executionInfoMap.set(order.id, {
      orderId: order.id, amount, trend: order.trend,
      executedAt: Date.now(), estimatedCompletionTime: Date.now() + 60_000,
    });

    let tradeData: TradeOrderData;
    try {
      tradeData = this.buildTradeOrder(order.trend, amount, false);
    } catch (err: any) {
      this.executionInfoMap.delete(order.id);
      this.callbacks.onLog({
        id: uid(), orderId: order.id, time: order.time, trend: order.trend,
        amount, martingaleStep: step, result: 'FAILED', executedAt: Date.now(),
        note: `Martingale timing error step ${step}: ${err?.message}`,
        isDemoAccount: this.config.isDemoAccount,
      });
      return;
    }

    const result = await this.ws.placeTrade(tradeData);
    const dealId = result.dealId;

    if (result.error === 'amount_min') {
      this.callbacks.onStatusChange('Martingale gagal: amount di bawah minimum Stockity. Cek konfigurasi.');
      this.executionInfoMap.delete(order.id);
      this.activeMartingaleOrderId = undefined;
      this.martingaleStartTime = undefined;
      this.callbacks.onLog({
        id: uid(), orderId: order.id, time: order.time, trend: order.trend,
        amount, martingaleStep: step, result: 'FAILED', executedAt: Date.now(),
        note: `Martingale step ${step}: amount di bawah minimum Stockity`,
        isDemoAccount: this.config.isDemoAccount,
      });
      setTimeout(() => { this.stop(); this.fireAllCompleted(); }, 300);
      return;
    }

    if (dealId) {
      const idx = this.orders.findIndex(o => o.id === order.id);
      if (idx !== -1) {
        this.orders[idx] = { ...this.orders[idx], activeDealId: dealId };
        this.callbacks.onOrdersUpdate(this.orders);
      }
    } else if (result.error !== 'duplicate') {
      this.executionInfoMap.delete(order.id);
    }

    this.callbacks.onLog({
      id: `${order.id}_s${step}`,
      orderId: order.id, time: order.time, trend: order.trend,
      amount, martingaleStep: step, dealId: dealId ?? undefined,
      result: (result.error && result.error !== 'duplicate') ? 'FAILED' : undefined,
      executedAt: Date.now(),
      note: result.error === 'duplicate'
        ? `Martingale step ${step}: duplicate deal — menunggu hasil via WS`
        : `Martingale step ${step}`,
      isDemoAccount: this.config.isDemoAccount,
    });
  }

  private startMartingale(order: ScheduledOrder, orderIdx: number) {
    this.activeMartingaleOrderId = order.id;
    this.martingaleStartTime = Date.now();
    this.updateMartingaleStep(orderIdx, 1);
    void this.placeMartingaleTrade(order, 1, this.calcAmount(1));
  }

  private updateMartingaleStep(orderIdx: number, step: number) {
    this.orders[orderIdx] = {
      ...this.orders[orderIdx],
      martingaleState: {
        ...this.orders[orderIdx].martingaleState,
        isActive: true, currentStep: step,
        lastUpdateTime: Date.now(), isCompleted: false,
      },
    };
    this.callbacks.onOrdersUpdate(this.orders);
  }

  private advanceAlwaysSignalLoss(order: ScheduledOrder, step: number, lossAmount: number) {
    const nextStep = step + 1;
    if (nextStep > this.config.martingale.maxSteps) {
      this.alwaysSignalLossState = undefined;
      return;
    }
    const prev = this.alwaysSignalLossState?.totalLoss ?? 0;
    this.alwaysSignalLossState = {
      hasOutstandingLoss: true,
      currentMartingaleStep: nextStep,
      originalOrderId: order.id,
      totalLoss: prev + lossAmount,
      currentTrend: order.trend,
    };
  }

  private checkStuckMartingale(now: number) {
    if (!this.activeMartingaleOrderId) return;
    const idx = this.orders.findIndex(o => o.id === this.activeMartingaleOrderId);
    if (idx === -1) {
      this.activeMartingaleOrderId = undefined;
      this.martingaleStartTime = undefined;
      return;
    }
    const o = this.orders[idx];
    const dur     = this.martingaleStartTime ? now - this.martingaleStartTime : 0;
    const stepDur = o.martingaleState.lastUpdateTime ? now - o.martingaleState.lastUpdateTime : 0;

    if (dur > MARTINGALE_MAX_DURATION_MS || stepDur > STEP_STUCK_THRESHOLD_MS || o.martingaleState.isCompleted) {
      this.orders[idx] = {
        ...o,
        martingaleState: {
          ...o.martingaleState,
          isActive: false, isCompleted: true, finalResult: 'FAILED',
          failureReason: dur > MARTINGALE_MAX_DURATION_MS
            ? `Timeout: ${Math.round(dur / 1000)}s`
            : stepDur > STEP_STUCK_THRESHOLD_MS
              ? `Step stuck: ${Math.round(stepDur / 1000)}s at step ${o.martingaleState.currentStep}`
              : 'Inconsistent state',
        },
      };
      this.activeMartingaleOrderId = undefined;
      this.martingaleStartTime = undefined;
      this.executionInfoMap.delete(o.id);
      this.callbacks.onOrdersUpdate(this.orders);
    }
  }

  // ── Penyelesaian order ─────────────────────────

  /**
   * Catat KEKALAHAN satu langkah martingale yang perjalanannya belum selesai.
   *
   * Sebelum ini, langkah yang kalah lalu dilanjutkan ke langkah berikutnya tidak
   * pernah dicatat hasilnya: log penempatannya (id `<order>_s<step>`) tetap tanpa
   * `result`, sehingga di halaman Riwayat selamanya tertulis "Menunggu". Lebih
   * jauh lagi, `sessionPnL` hanya diperbarui di completeOrder — jadi modal yang
   * hangus di langkah itu TIDAK PERNAH dikurangi dan P/L sesi tampak lebih besar
   * daripada kenyataannya.
   *
   * id-nya sengaja sama dengan log penempatan supaya entri lama ditimpa, bukan
   * menambah baris baru.
   */
  private recordStepLoss(order: ScheduledOrder, step: number, dealId?: string) {
    const info   = this.executionInfoMap.get(order.id);
    const amount = info?.amount ?? this.calcAmount(step);
    const pnl    = -amount;

    this.sessionPnL += pnl;
    this.callbacks.onSessionPnL?.(this.sessionPnL);

    this.callbacks.onLog({
      id: `${order.id}_s${step}`,
      orderId: order.id, time: order.time, trend: order.trend,
      amount, martingaleStep: step, dealId,
      result: 'LOSE', profit: pnl, sessionPnL: this.sessionPnL,
      executedAt: Date.now(),
      note: `Result: LOSE | PnL: ${pnl}`,
      isDemoAccount: this.config.isDemoAccount,
    });
  }

  private completeOrder(orderIdx: number, result: 'WIN' | 'LOSE' | 'DRAW', dealId?: string) {
    const order = this.orders[orderIdx];

    if (this.activeMartingaleOrderId === order.id) {
      this.activeMartingaleOrderId = undefined;
      this.martingaleStartTime = undefined;
    }

    const info = this.executionInfoMap.get(order.id);
    const actualStep   = order.martingaleState.isActive ? order.martingaleState.currentStep : 0;
    const actualAmount = info?.amount ?? this.calcAmount(actualStep);

    const profitRate = (this.config.asset.profitRate ?? 85) / 100;
    let tradePnL = 0;
    if (result === 'WIN') tradePnL = Math.floor(actualAmount * profitRate);
    else if (result === 'LOSE') tradePnL = -actualAmount;

    this.sessionPnL += tradePnL;
    this.callbacks.onSessionPnL?.(this.sessionPnL);

    this.callbacks.onLog({
      id: `${order.id}_s${actualStep}`,
      orderId: order.id, time: order.time, trend: order.trend,
      amount: actualAmount, martingaleStep: actualStep, dealId,
      result, profit: tradePnL, sessionPnL: this.sessionPnL,
      executedAt: Date.now(),
      note: `Result: ${result} | PnL: ${tradePnL > 0 ? '+' : ''}${tradePnL}`,
      isDemoAccount: this.config.isDemoAccount,
    });

    this.orders.splice(orderIdx, 1);
    this.callbacks.onOrdersUpdate(this.orders);
    this.persist(true);

    this.checkStopConditions();
  }

  private checkStopConditions() {
    const { stopLoss, stopProfit } = this.config;
    const pnl = this.sessionPnL;

    if (stopLoss && stopLoss > 0 && pnl <= -stopLoss) {
      this.callbacks.onStatusChange(`Stop Loss tercapai (PnL: ${pnl})`);
      setTimeout(() => { this.stop(); this.fireAllCompleted(); }, 1000);
      return;
    }
    if (stopProfit && stopProfit > 0 && pnl >= stopProfit) {
      this.callbacks.onStatusChange(`Stop Profit tercapai (PnL: +${pnl})`);
      setTimeout(() => { this.stop(); this.fireAllCompleted(); }, 1000);
    }
  }

  // ── Pengecekan selesai ─────────────────────────

  private startCompletionCheck() {
    this.stopCompletionCheck();
    this.completionTimer = setInterval(() => this.checkCompletion(), 2000);
  }

  private stopCompletionCheck() {
    if (this.completionTimer) { clearInterval(this.completionTimer); this.completionTimer = undefined; }
  }

  private checkCompletion() {
    if (this.botState !== 'RUNNING') return;
    const now = Date.now();
    if (now - this.lastCompletionCheck < 2000) return;
    this.lastCompletionCheck = now;

    const hasPending = this.orders.some(o => !o.isExecuted && !o.isSkipped);

    const timedOut: string[] = [];
    let hasAwaiting = false;
    for (const o of this.orders) {
      if (!o.isExecuted) continue;
      const info = this.executionInfoMap.get(o.id);
      const waitedMs = now - (info?.executedAt ?? o.timeInMillis);
      if (waitedMs > MAX_RESULT_WAIT_MS) {
        this.executionInfoMap.delete(o.id);
        timedOut.push(o.id);
      } else {
        hasAwaiting = true;
      }
    }
    if (timedOut.length > 0) {
      this.orders = this.orders.filter(o => !timedOut.includes(o.id));
      this.callbacks.onOrdersUpdate(this.orders);
    }

    if (!hasPending && !hasAwaiting && !this.activeMartingaleOrderId && this.orders.length === 0) {
      setTimeout(() => { this.stop(); this.fireAllCompleted(); }, 3000);
    }
  }

  private fireAllCompleted() {
    if (this.hasCompleted) return;
    this.hasCompleted = true;
    this.callbacks.onAllCompleted();
  }

  // ── Builder & helper ───────────────────────────

  private buildTradeOrder(
    trend: TrendType, amount: number, isScheduledOrder: boolean, scheduledTimeMs?: number,
  ): TradeOrderData {
    const baseMs = isScheduledOrder && scheduledTimeMs ? scheduledTimeMs : Date.now();
    const nowFloorSeconds  = Math.floor(baseMs / 1000);
    const createdAtSeconds = isScheduledOrder ? nowFloorSeconds : nowFloorSeconds + 1;
    const secondsInMinute  = createdAtSeconds % 60;

    let finalExpireAt: number;

    if (isScheduledOrder) {
      const expireAtSeconds = secondsInMinute <= 10
        ? createdAtSeconds + (60 - secondsInMinute)
        : createdAtSeconds + (120 - secondsInMinute);
      const duration = expireAtSeconds - createdAtSeconds;
      finalExpireAt = (duration < 55 || duration > 120) ? createdAtSeconds + 60 : expireAtSeconds;
    } else {
      // Martingale/instan: boundary menit terdekat, minimal 45s
      const remainingInMinute = 60 - secondsInMinute;
      finalExpireAt = remainingInMinute >= 45
        ? createdAtSeconds + remainingInMinute
        : createdAtSeconds + remainingInMinute + 60;
    }

    const finalDuration = finalExpireAt - createdAtSeconds;
    if (finalDuration < 45)  throw new Error(`Duration terlalu pendek: ${finalDuration}s (min 45s)`);
    if (finalDuration > 125) throw new Error(`Duration terlalu panjang: ${finalDuration}s (max 125s)`);
    if (finalExpireAt <= createdAtSeconds) throw new Error(`expire_at tidak valid: ${finalExpireAt} <= ${createdAtSeconds}`);

    return {
      amount,
      createdAt: createdAtSeconds * 1000,
      dealType: this.config.isDemoAccount ? 'demo' : 'real',
      expireAt: finalExpireAt,
      iso: this.config.currencyIso,
      optionType: 'turbo',
      ric: this.config.asset.ric,
      trend,
    };
  }

  private calcAmount(step: number): number {
    const m = this.config.martingale;
    if (!m.isEnabled || step === 0) return m.baseAmount;
    if (m.multiplierType === 'FIXED') return Math.floor(m.baseAmount * Math.pow(m.multiplierValue, step));
    const mult = 1 + m.multiplierValue / 100;
    return Math.floor(m.baseAmount * Math.pow(mult, step));
  }

  getStatus() {
    const pending  = this.orders.filter(o => !o.isExecuted && !o.isSkipped);
    const skipped  = this.orders.filter(o => o.isSkipped);
    const awaiting = this.orders.filter(o => o.isExecuted && !o.isSkipped);
    const next     = [...pending].sort((a, b) => a.timeInMillis - b.timeInMillis)[0];
    const now      = Date.now();

    return {
      botState: this.botState,
      totalOrders: this.orders.length,
      pendingOrders: pending.length,
      awaitingOrders: awaiting.length,
      skippedOrders: skipped.length,
      activeMartingaleOrderId: this.activeMartingaleOrderId ?? null,
      alwaysSignalActive: !!this.alwaysSignalLossState?.hasOutstandingLoss,
      alwaysSignalStep: this.alwaysSignalLossState?.currentMartingaleStep ?? 0,
      nextOrderTime: next?.time ?? null,
      nextOrderInSeconds: next
        ? Math.max(0, Math.floor((next.timeInMillis - EXECUTION_ADVANCE_MS - now) / 1000))
        : null,
      wsConnected: this.ws.isConnected(),
      sessionPnL: this.sessionPnL,
      isRunning: this.botState === 'RUNNING',
    };
  }
}
