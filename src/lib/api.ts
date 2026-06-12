// lib/api.ts  — maps to actual NestJS backend routes
import { getAuthToken, sessionLogout, storage } from './storage';

const getBase = () => process.env.NEXT_PUBLIC_API_URL ?? '';

// ✅ FIXED: Gunakan getAuthToken yang sudah validasi session
async function getToken(): Promise<string | null> {
  return getAuthToken();
}

// emit custom event untuk logout — tidak pakai window.location.href
// ✅ FIX: Debounce emitUnauthorized agar tidak fire berkali-kali saat
//         banyak request concurrent semuanya balik 401 sekaligus.
//         Tanpa debounce ini, setiap 401 dari loadAll() Promise.allSettled
//         akan emit event + sessionLogout → cascade clear localStorage →
//         semua request lain ikut gagal karena token sudah hilang.
let _unauthorizedTimer: ReturnType<typeof setTimeout> | null = null;
function emitUnauthorized() {
  if (typeof window === 'undefined') return;
  if (_unauthorizedTimer) return; // sudah dijadwalkan, skip
  _unauthorizedTimer = setTimeout(() => {
    _unauthorizedTimer = null;
    window.dispatchEvent(new CustomEvent('stc:unauthorized'));
  }, 50); // sedikit delay agar semua request selesai dulu
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${getBase()}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401) {
    // ✅ FIX: JANGAN sessionLogout() di sini.
    //    Kalau loadAll() fire 12 request sekaligus dan satu balik 401,
    //    sessionLogout() akan hapus token dari localStorage → semua 11
    //    request lain juga gagal 401 → cascade total. Biarkan ClientLayout
    //    yang handle logout via event 'stc:unauthorized'.
    emitUnauthorized();
    // 401 di sini = JWT/sesi tidak valid atau kedaluwarsa (BUKAN salah password —
    // login lewat jalur berbeda). Pesan disesuaikan agar tidak menyesatkan user.
    throw new Error('Sesi berakhir. Silakan login ulang.');
  }

  let data: unknown;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error((data as any)?.message ?? res.statusText);
  return data as T;
}

// ─────────────────────────────────────────────
// TYPES — Schedule / Fastrade (existing)
// ─────────────────────────────────────────────
export interface StockityAsset {
  ric: string;
  name: string;
  type: number;
  typeName: string;
  profitRate: number;
  iconUrl: string | null;
}

export interface ProfileBalance {
  balance?: number;
  real_balance?: number;
  demo_balance?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface AlwaysSignalLossState {
  hasOutstandingLoss: boolean;
  currentMartingaleStep: number;
  originalOrderId: string;
  totalLoss: number;
}

export interface ScheduleStatus {
  botState?: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'IDLE';
  totalOrders?: number;
  pendingOrders?: number;
  awaitingOrders?: number;
  executedOrders?: number;
  skippedOrders?: number;
  activeOrders?: number;
  sessionPnL?: number;
  orders?: ScheduleOrder[];
  // Always Signal
  alwaysSignalActive?: boolean;
  alwaysSignalStep?: number;
  alwaysSignalLossState?: AlwaysSignalLossState;
  // Risk management
  stopLoss?: number;
  stopProfit?: number;
  // Next order
  nextOrderTime?: string | null;
  nextOrderInSeconds?: number | null;
  // Legacy
  activeMartingaleOrderId?: string | null;
  wsConnected?: boolean;
  nextExecutionTime?: string;
  startedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ScheduleConfig {
  asset?: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale?: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount?: boolean;
  currency?: string;
  currencyIso?: string;
  duration?: number;
  stopLoss?: number;
  stopProfit?: number;
  [key: string]: unknown;
}

export interface ScheduleOrder {
  id: string;
  time: string;
  ric?: string;
  trend: 'call' | 'put';
  timeInMillis: number;
  isExecuted: boolean;
  isSkipped: boolean;
  skipReason?: string;
  result?: string;
  martingaleState?: {
    isActive: boolean;
    currentStep: number;
    maxSteps: number;
    isCompleted: boolean;
    totalLoss: number;
    totalRecovered: number;
  };
}

export interface ExecutionLog {
  id: string;
  orderId?: string;
  ric?: string;
  time?: string;
  trend?: string;
  amount?: number;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt?: number;
  note?: string;
  martingaleStep?: number;
  isDemoAccount?: boolean;
}

export interface FastradeStatus {
  mode?: 'FTT' | 'CTC' | null;
  isRunning?: boolean;
  cycleNumber?: number;
  currentTrend?: string | null;
  martingaleStep?: number;
  isMartingaleActive?: boolean;
  martingaleTotalLoss?: number;
  sessionPnL?: number;
  stopLoss?: number;
  stopProfit?: number;
  totalTrades?: number;
  totalWins?: number;
  totalLosses?: number;
  activeOrderId?: string | null;
  wsConnected?: boolean;
  phase?: string;
  activeTrend?: string | null;
  alwaysSignalActive?: boolean;
  alwaysSignalStep?: number;
}

export interface FastradeLog {
  id: string;
  orderId: string;
  ric?: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  cycleNumber: number;
  mode?: 'FTT' | 'CTC';
  isDemoAccount?: boolean;
}

export interface StartFastradePayload {
  mode: 'FTT' | 'CTC';
  asset: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
}

export interface UpdateConfigPayload {
  asset: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  duration?: number;
  stopLoss?: number;
  stopProfit?: number;
}

// ─────────────────────────────────────────────
// TYPES — AI Signal (FIXED)
// ─────────────────────────────────────────────
export interface AISignalConfig {
  asset: { ric: string; name: string } | null;
  baseAmount: number;
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount: boolean;
  currency: string;
}

export interface AlwaysSignalStatus {
  isActive: boolean;
  currentStep?: number;
  maxSteps?: number;
  totalLoss?: number;
  status?: string;
}

export interface AISignalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  sessionPnL: number;
}

export interface AISignalStatus {
  isActive: boolean;
  botState: string;
  totalOrders?: number;
  pendingOrders?: number;
  executedOrders?: number;
  activeMartingaleSequences?: number;
  wsConnected?: boolean;
  alwaysSignalStatus?: AlwaysSignalStatus;
  monitoringStatus?: {
    is_active: boolean;
    active_monitoring_count: number;
  };
  stats?: AISignalStats;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  config?: AISignalConfig;
}

export interface AISignalOrder {
  id: string;
  assetRic: string;
  assetName: string;
  trend: string;
  amount: number;
  executionTime: number;
  receivedAt: number;
  originalMessage: string;
  isExecuted: boolean;
  result?: string;
  status: string;
  martingaleStep: number;
  maxMartingaleSteps: number;
}

export interface UpdateAISignalConfigPayload {
  baseAmount?: number;
  isDemoAccount?: boolean;
  martingaleEnabled?: boolean;
  maxSteps?: number;
  multiplierValue?: number;
  isAlwaysSignal?: boolean;
}

// ─────────────────────────────────────────────
// TYPES — Indicator
// ─────────────────────────────────────────────
export type IndicatorType = 'SMA' | 'EMA' | 'RSI';

export interface IndicatorConfig {
  asset: { ric: string; name: string } | null;
  isDemoAccount: boolean;
  settings: {
    type: IndicatorType;
    period: number;
    rsiOverbought: number;
    rsiOversold: number;
    isEnabled: boolean;
    sensitivity: number;
    amount: number;
  };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
    stopLoss?: number;
    stopProfit?: number;
  };
  [key: string]: unknown;
}

export interface IndicatorStatus {
  isRunning: boolean;
  currentIndicatorValue?: number;
  lastTrend?: string | null;
  lastSignalTime?: number | null;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  lastStatus?: string;
  indicatorType?: IndicatorType;
  [key: string]: unknown;
}

export interface UpdateIndicatorConfigPayload {
  type?: IndicatorType;
  period?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  isEnabled?: boolean;
  sensitivity?: number;
  amount?: number;
  stopLoss?: number;
  stopProfit?: number;
}

// ─────────────────────────────────────────────
// TYPES — Momentum
// ─────────────────────────────────────────────
export type MomentumType = 'CANDLE_SABIT' | 'DOJI_TERJEPIT' | 'DOJI_PEMBATALAN' | 'BB_SAR_BREAK';

export interface MomentumConfig {
  asset: { ric: string; name: string } | null;
  isDemoAccount: boolean;
  enabledMomentums: {
    candleSabit: boolean;
    dojiTerjepit: boolean;
    dojiPembatalan: boolean;
    bbSarBreak: boolean;
  };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  [key: string]: unknown;
}

export interface MomentumStatus {
  isRunning: boolean;
  lastDetectedPattern?: string | null;
  lastSignalTime?: number | null;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  lastStatus?: string;
  [key: string]: unknown;
}

export interface UpdateMomentumConfigPayload {
  candleSabitEnabled?: boolean;
  dojiTerjepitEnabled?: boolean;
  dojiPembatalanEnabled?: boolean;
  bbSarBreakEnabled?: boolean;
  maxSteps?: number;
  multiplierValue?: number;
  baseAmount?: number;
  isAlwaysSignal?: boolean;
  stopLoss?: number;
  stopProfit?: number;
}

export interface MomentumLog {
  id: string;
  orderId: string;
  momentumType: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  isDemoAccount?: boolean;
}

export interface IndicatorLog {
  id: string;
  orderId: string;
  indicatorType?: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  cycleNumber?: number;
  isDemoAccount?: boolean;
}

// ─────────────────────────────────────────────
// TYPES — Today Profit
// ─────────────────────────────────────────────
export interface ModeProfitSummary {
  mode: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface AssetProfitSummary {
  ric: string;
  name: string;
  pnl: number;
  trades: number;
}

export interface DataSourceMeta {
  supabaseTrades: number;
  stockityOnlyTrades: number;
  stockityApiError: boolean;
  stockityCredentialsFound: boolean;
}

export interface TodayProfitSummary {
  date: string;          // YYYY-MM-DD
  totalPnL: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  totalDraws?: number;
  winRate: number;
  byMode: Record<string, ModeProfitSummary>;
  byAsset: Record<string, AssetProfitSummary>;
  dataSources?: DataSourceMeta;
}

// ─────────────────────────────────────────────
// TYPES — Profile Currencies
// ─────────────────────────────────────────────
export interface StockityCurrency {
  iso: string;
  name?: string;
  symbol?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// TYPES — Schedule Tracking
// ─────────────────────────────────────────────
export interface TrackingOrder {
  id: string;
  time: string;
  trend: 'call' | 'put';
  timeInMillis: number;
  isExecuted: boolean;
  isSkipped: boolean;
  skipReason?: string;
  result?: string;
  trackingStatus: string;
  profit?: number;
  amount?: number;
  executedAt?: number;
  completedAt?: number;
  currentMartingaleStep: number;
  martingaleState?: {
    isActive: boolean;
    currentStep: number;
    maxSteps: number;
    isCompleted: boolean;
    totalLoss: number;
    totalRecovered: number;
  };
}

export interface TrackingSummary {
  total: number;
  pending: number;
  monitoring: number;
  martingaleActive: number;
  completed: number;
  win: number;
  lose: number;
  draw: number;
  failed: number;
  skipped: number;
}

export interface TrackingResponse {
  userId?: string;
  botState: string;
  orders: TrackingOrder[];
  summary: TrackingSummary;
  activeMartingale: unknown | null;
  sessionPnL: number;
  timestamp: number;
}

// ─────────────────────────────────────────────
// TYPES — AI Signal Log
// ─────────────────────────────────────────────
export interface AISignalLog {
  id: string;
  orderId: string;
  assetRic?: string;
  assetName?: string;
  trend: string;
  amount: number;
  executionTime?: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  isDemoAccount?: boolean;
}

// ─────────────────────────────────────────────
// TYPES — Indicator Presets
// ─────────────────────────────────────────────
export interface IndicatorPresets {
  indicatorTypes: string[];
  defaultSettings: {
    sma: { type: string; period: number; sensitivity: number };
    ema: { type: string; period: number; sensitivity: number };
    rsi: { type: string; period: number; rsiOverbought: number; rsiOversold: number; sensitivity: number };
  };
  sensitivityLevels: Record<string, number>;
}

// ─────────────────────────────────────────────
// TYPES — Momentum Info
// ─────────────────────────────────────────────
export interface MomentumInfo {
  momentumTypes: string[];
  descriptions: Record<string, string>;
  antiOverTrading: {
    signalCooldownMs: number;
    priceMoveThreshold: number;
    maxSignalsPerHour: number;
  };
}

// ─────────────────────────────────────────────
// API OBJECT
// ─────────────────────────────────────────────
export interface ChatMessage {
  id: number;
  sender_email: string;
  sender_name: string | null;
  recipient_email?: string | null;
  content: string;
  created_at: string;
}

export interface ChatContact {
  email: string;
  name: string | null;
  role: 'admin' | 'super_admin';
  is_active: boolean;
}

export interface ReactivationRequest {
  id: number;
  admin_email: string;
  admin_name: string | null;
  days: number;
  user_count: number;
  amount_usd: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface AdminStanding {
  expires_at: string | null;
  is_active: boolean;
  isSuperAdmin: boolean;
  userCount: number;
  pricePerUser: number;
  amountUsd: number;
  pendingRequest: ReactivationRequest | null;
}

export const api = {
  // ── Auth ──────────────────────────────────
  login: (email: string, password: string) =>
    req<{ accessToken: string; userId: string; email: string; deviceId: string }>(
      'POST', '/auth/login', { email, password }
    ),
  /**
   * Registrasi akun Stockity langsung (inline, tanpa webview).
   * Backend memproksi ke Stockity sign_up lalu mengembalikan sesi seperti login.
   */
  register: (email: string, password: string, currency = 'IDR') =>
    req<{ accessToken: string; userId: string; email: string; deviceId: string }>(
      'POST', '/auth/register', { email, password, currency }
    ),
  /**
   * Login Google: tukar authtoken Stockity (dari in-app WebView OAuth) → sesi+JWT.
   */
  sessionFromToken: (authToken: string, deviceId?: string) =>
    req<{ accessToken: string; userId: string; email: string; deviceId: string }>(
      'POST', '/auth/session-from-token', { authToken, deviceId }
    ),
  logout: () => req<void>('POST', '/auth/logout'),
  me: () => req<{ userId: string; email: string; deviceId: string; currency: string; currencyIso: string }>('GET', '/auth/me'),

  // ── Profile ───────────────────────────────
  balance: () => req<ProfileBalance>('GET', '/profile/balance'),
  getProfile: () => req<{
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    gender?: string;
    country?: string;
    birthday?: string;
    registeredAt?: string;
    registrationCountryIso?: string;
    avatar?: string;
    personalDataLocked?: boolean;
    docsVerified?: boolean;
  }>('GET', '/profile'),

  /**
   * GET /profile/currency-config
   * Backend proxy — bebas CORS — untuk fetchPlatformCurrencies.
   * Returns CurrencyConfig: currencyIso, currencyUnit, minAmount, maxAmount, quickAmounts.
   * Gunakan ini sebagai pengganti fetchPlatformCurrencies di loginpage/dashboard
   * agar tidak ada direct hit ke Stockity dari browser.
   */
  currencyConfig: () => req<{
    currencyIso:  string;
    currencyUnit: string;
    minAmount:    number;
    maxAmount:    number;
    quickAmounts: number[];
  }>('GET', '/profile/currency-config'),

  /** GET /profile/currencies — daftar semua mata uang yang tersedia */
  getCurrencies: () => req<StockityCurrency[]>('GET', '/profile/currencies'),

  /** PUT /profile/currency — ubah mata uang aktif user */
  updateCurrency: (currencyIso: string) =>
    req<void>('PUT', '/profile/currency', { currencyIso }),

  // ── Assets ───────────────────────────────
  getAssets: () => req<StockityAsset[]>('GET', '/schedule/assets'),

  // ── Schedule Config ───────────────────────
  getConfig:    () => req<ScheduleConfig>('GET', '/schedule/config'),
  updateConfig: (data: UpdateConfigPayload) =>
    req<ScheduleConfig>('PUT', '/schedule/config', data),

  // ── Schedule Orders ───────────────────────
  getOrders:   () => req<ScheduleOrder[]>('GET', '/schedule/orders'),
  addOrders:   (input: string) =>
    req<{ added: number; errors: string[] }>('POST', '/schedule/orders', { input }),
  deleteOrder: (id: string) => req<void>('DELETE', `/schedule/orders/${id}`),
  clearOrders: () => req<void>('DELETE', '/schedule/orders'),
  parseOrders: (input: string) =>
    req<{ orders: ScheduleOrder[]; errors: string[] }>('POST', '/schedule/parse', { input }),

  // ── Schedule Control ──────────────────────
  scheduleStatus: () => req<ScheduleStatus>('GET', '/schedule/status'),
  scheduleStart:  () => req<{ message: string }>('POST', '/schedule/start'),
  scheduleStop:   () => req<{ message: string }>('POST', '/schedule/stop'),
  schedulePause:  () => req<{ message: string }>('POST', '/schedule/pause'),
  scheduleResume: () => req<{ message: string }>('POST', '/schedule/resume'),
  scheduleLogs:   (limit = 100) =>
    req<ExecutionLog[]>('GET', `/schedule/logs?limit=${limit}`),

  /**
   * GET /schedule/tracking
   * Source of truth untuk history order — menyimpan SEMUA order beserta
   * trackingStatus (WIN/LOSE/SKIPPED/MONITORING/PENDING/FAILED) meski order
   * sudah dihapus dari active list oleh backend.
   */
  scheduleTracking: () => req<TrackingResponse>('GET', '/schedule/tracking'),

  /** GET /schedule/tracking/today — tracking hari ini (waktu Jakarta) */
  scheduleTrackingToday: () => req<TrackingResponse>('GET', '/schedule/tracking/today'),

  /** GET /schedule/tracking/active — hanya order yang masih aktif (PENDING/MONITORING/MARTINGALE) */
  scheduleTrackingActive: () =>
    req<{ userId?: string; orders: TrackingOrder[]; count: number; timestamp: number }>(
      'GET', '/schedule/tracking/active'
    ),

  /** GET /schedule/tracking/summary — ringkasan tracking tanpa detail order */
  scheduleTrackingSummary: () =>
    req<{
      userId?: string;
      botState: string;
      summary: TrackingSummary;
      activeMartingale: unknown | null;
      sessionPnL: number;
      timestamp: number;
    }>('GET', '/schedule/tracking/summary'),

  /** GET /schedule/tracking/order/:id — detail tracking satu order */
  scheduleTrackingOrder: (orderId: string) =>
    req<{ userId?: string; order: TrackingOrder; timestamp: number } | { error: string }>(
      'GET', `/schedule/tracking/order/${orderId}`
    ),

  // ── Fastrade (FTT + CTC) ──────────────────
  fastradeStart:  (data: StartFastradePayload) =>
    req<{ message: string; mode: string; status: FastradeStatus }>('POST', '/fastrade/start', data),
  fastradeStop:   () => req<{ message: string }>('POST', '/fastrade/stop'),
  fastradeStatus: () => req<FastradeStatus>('GET', '/fastrade/status'),
  fastradeLogs:   (limit = 100) =>
    req<FastradeLog[]>('GET', `/fastrade/logs?limit=${limit}`),

  // ── AI Signal ────────────────────────────
  aiSignalGetConfig:    () => req<AISignalConfig>('GET', '/aisignal/config'),
  aiSignalUpdateConfig: (data: UpdateAISignalConfigPayload) =>
    req<AISignalConfig>('PUT', '/aisignal/config', data),
  aiSignalSetAsset:     (ric: string, name: string) =>
    req<AISignalConfig>('PUT', '/aisignal/config/asset', { ric, name }),
  aiSignalStart:        () => req<{ message: string }>('POST', '/aisignal/start'),
  aiSignalStop:         () => req<{ message: string }>('POST', '/aisignal/stop'),
  aiSignalStatus:       () => req<AISignalStatus>('GET', '/aisignal/status'),
  aiSignalPendingOrders: () => req<AISignalOrder[]>('GET', '/aisignal/orders/pending'),
  aiSignalExecutedOrders: () => req<AISignalOrder[]>('GET', '/aisignal/orders/executed'),
  aiSignalReceive:      (trend: string, executionTime: number, originalMessage?: string) =>
    req<{ message: string }>('POST', '/aisignal/signal', { trend, executionTime, originalMessage: originalMessage ?? '' }),

  /** GET /aisignal/logs — riwayat eksekusi AI Signal */
  aiSignalLogs: (limit = 100) => req<AISignalLog[]>('GET', `/aisignal/logs?limit=${limit}`),

  /** GET /aisignal/info — deskripsi fitur dan endpoint AI Signal */
  aiSignalInfo: () => req<{
    description: string;
    features: string[];
    martingaleModes: Record<string, string>;
    endpoints: Record<string, string>;
  }>('GET', '/aisignal/info'),

  /** POST /aisignal/test-signal — inject sinyal test (untuk testing/debugging) */
  aiSignalTestSignal: (trend: string, delayMs?: number) =>
    req<{ message: string }>('POST', '/aisignal/test-signal', { trend, delayMs }),

  // ── Indicator ────────────────────────────
  indicatorGetConfig:    () => req<IndicatorConfig>('GET', '/indicator/config'),
  indicatorUpdateConfig: (data: UpdateIndicatorConfigPayload) =>
    req<IndicatorConfig>('PUT', '/indicator/config', data),
  indicatorSetAsset:     (ric: string, name: string) =>
    req<IndicatorConfig>('PUT', '/indicator/config/asset', { ric, name }),
  indicatorSetMartingale: (data: Partial<IndicatorConfig['martingale']>) =>
    req<IndicatorConfig>('PUT', '/indicator/config/martingale', data),
  indicatorSetAccount:   (isDemoAccount: boolean) =>
    req<IndicatorConfig>('PUT', '/indicator/config/account', { isDemoAccount }),
  indicatorStart:        () => req<{ message: string }>('POST', '/indicator/start'),
  indicatorStop:         () => req<{ message: string }>('POST', '/indicator/stop'),
  indicatorStatus:       () => req<IndicatorStatus>('GET', '/indicator/status'),
  indicatorLogs:         (limit = 100) => req<IndicatorLog[]>('GET', `/indicator/logs?limit=${limit}`),

  /** GET /indicator/presets — tipe indikator dan default settings yang tersedia */
  indicatorPresets: () => req<IndicatorPresets>('GET', '/indicator/presets'),

  // ── Momentum ─────────────────────────────
  momentumGetConfig:    () => req<MomentumConfig>('GET', '/momentum/config'),
  momentumUpdateConfig: (data: UpdateMomentumConfigPayload) =>
    req<MomentumConfig>('PUT', '/momentum/config', data),
  momentumSetAsset:     (ric: string, name: string) =>
    req<MomentumConfig>('PUT', '/momentum/config/asset', { ric, name }),
  momentumSetMartingale: (data: {
    isEnabled?: boolean;
    maxSteps?: number;
    baseAmount?: number;
    multiplierValue?: number;
    multiplierType?: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal?: boolean;
    stopLoss?: number;
    stopProfit?: number;
  }) => req<MomentumConfig>('PUT', '/momentum/config/martingale', data),

  momentumSetAccount:   (isDemoAccount: boolean) =>
    req<MomentumConfig>('PUT', '/momentum/config/account', { isDemoAccount }),
  momentumStart:        () => req<{ message: string }>('POST', '/momentum/start'),
  momentumStop:         () => req<{ message: string }>('POST', '/momentum/stop'),
  momentumStatus:       () => req<MomentumStatus>('GET', '/momentum/status'),
  momentumLogs:         (limit = 100) => req<MomentumLog[]>('GET', `/momentum/logs?limit=${limit}`),

  /** GET /momentum/info — deskripsi pola momentum dan anti-overtrading config */
  momentumInfo: () => req<MomentumInfo>('GET', '/momentum/info'),

  // ── Today Profit ─────────────────────────
  /** GET /today-profit?date=YYYY-MM-DD&accountType=real|demo|both */
  todayProfit: (date?: string, accountType: 'real' | 'demo' | 'both' = 'real') => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    params.set('accountType', accountType);
    return req<{ success: boolean; data: TodayProfitSummary }>(
      'GET', `/today-profit?${params.toString()}`
    ).then(r => r.data);
  },

  /** GET /today-profit/realtime?accountType=real|demo|both — includes active session data */
  realtimeProfit: (accountType: 'real' | 'demo' | 'both' = 'real') =>
    req<{ success: boolean; data: TodayProfitSummary }>(
      'GET', `/today-profit/realtime?accountType=${accountType}`
    ).then(r => r.data),

  /** GET /today-profit/history?startDate=...&endDate=... */
  profitHistory: (startDate: string, endDate: string) =>
    req<{ success: boolean; data: TodayProfitSummary[] }>(
      'GET', `/today-profit/history?startDate=${startDate}&endDate=${endDate}`
    ).then(r => r.data),

  /** GET /today-profit/by-mode/:mode — detail profit untuk mode trading tertentu */
  profitByMode: (mode: string, date?: string, accountType: 'real' | 'demo' | 'both' = 'real') => {
    const params = new URLSearchParams({ accountType });
    if (date) params.set('date', date);
    return req<{ success: boolean; data: { mode: string; date: string } & Partial<TodayProfitSummary> }>(
      'GET', `/today-profit/by-mode/${encodeURIComponent(mode)}?${params.toString()}`
    ).then(r => r.data);
  },

  // ── Registrasi whitelist tervalidasi token Stockity (C2, publik) ────────────
  registerWhitelist: (body: { authToken: string; deviceId?: string; name?: string; isPrimary?: boolean; addedBy?: string }) =>
    req<{ email: string; userId: string; isActive: boolean; exists: boolean }>('POST', '/auth/register-whitelist', body),

  // ── Admin (C2 — semua operasi privileged via backend service_role) ──────────
  admin: {
    me:              () => req<{ isAdmin: boolean; isSuperAdmin: boolean }>('GET', '/admin/me'),
    listWhitelist:   () => req<any[]>('GET', '/admin/whitelist'),
    stats:           () => req<{ total: number; active: number; inactive: number; recent: number; recentAdded: number }>('GET', '/admin/stats'),
    addWhitelist:    (b: { email: string; name?: string; userId?: string; deviceId?: string; isPrimary?: boolean; addedBy?: string }) => req<void>('POST', '/admin/whitelist', b),
    updateWhitelist: (b: { oldEmail: string; email?: string; name?: string; userId?: string; deviceId?: string; isActive?: boolean; lastLogin?: number | null }) => req<void>('PATCH', '/admin/whitelist', b),
    toggleWhitelist: (email: string, isActive: boolean) => req<void>('POST', '/admin/whitelist/toggle', { email, isActive }),
    deleteWhitelist: (id: string) => req<void>('DELETE', `/admin/whitelist?id=${encodeURIComponent(id)}`),
    importWhitelist: (rows: any[], addedBy?: string) => req<{ success: number; skipped: number }>('POST', '/admin/whitelist/import', { rows, addedBy }),
    listAdmins:      () => req<any[]>('GET', '/admin/admins'),
    addAdmin:        (email: string, name?: string, role?: string) => req<void>('POST', '/admin/admins', { email, name, role }),
    updateAdmin:     (id: string, updates: { name?: string; role?: 'admin' | 'super_admin'; is_active?: boolean }) => req<void>('PATCH', `/admin/admins/${encodeURIComponent(id)}`, updates),
    removeAdmin:     (id: string) => req<void>('DELETE', `/admin/admins?id=${encodeURIComponent(id)}`),
    listSuperAdmins: () => req<any[]>('GET', '/admin/super-admins'),
    addSuperAdmin:   (email: string) => req<void>('POST', '/admin/super-admins', { email }),
    deleteSuperAdmin:(email: string) => req<void>('DELETE', `/admin/super-admins?email=${encodeURIComponent(email)}`),
    upsertConfig:    (key: string, value: unknown) => req<void>('PUT', '/admin/config', { key, value }),
    // ── Broadcast email (super-admin) ──
    sendEmail:       (b: { target: 'one' | 'all' | 'custom'; email?: string; emails?: string[]; subject: string; message: string; html?: boolean }) =>
      req<{ sent: number; failed: number; total: number; errors: string[] }>('POST', '/admin/email/send', b),
    // ── Chat DM antar admin/super-admin ──
    chatContacts:    () => req<ChatContact[]>('GET', '/admin/chat/contacts'),
    chatConversation:(withEmail: string, after?: number) => req<ChatMessage[]>('GET', `/admin/chat?with=${encodeURIComponent(withEmail)}${after ? `&after=${after}` : ''}`),
    chatSend:        (to: string, content: string) => req<ChatMessage>('POST', '/admin/chat', { to, content }),
    chatDelete:      (id: number) => req<void>('DELETE', `/admin/chat/${id}`),
    // ── Masa aktif (super-admin) ──
    setPeriod:       (email: string, days: number) => req<{ email: string; expires_at: string | null }>('POST', '/admin/period', { email, days }),
    // ── Standing & reaktivasi ──
    standing:        () => req<AdminStanding>('GET', '/admin/standing'),
    reactivationRequest: (days: number) => req<ReactivationRequest>('POST', '/admin/reactivation/request', { days }),
    reactivationList:    () => req<ReactivationRequest[]>('GET', '/admin/reactivation/requests'),
    reactivationApprove: (id: number) => req<{ admin_email: string; days: number }>('POST', '/admin/reactivation/approve', { id }),
    reactivationReject:  (id: number) => req<void>('POST', '/admin/reactivation/reject', { id }),
  },
};