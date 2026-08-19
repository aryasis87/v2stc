// lib/api.ts  — maps to actual NestJS backend routes
import { getAuthToken, sessionLogout, storage, SESSION_KEYS } from './storage';
import { PAKAI_MESIN_PERANGKAT } from './runtimeMode';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig';

const getBase = () => process.env.NEXT_PUBLIC_API_URL ?? '';

// ✅ FIXED: Gunakan getAuthToken yang sudah validasi session
async function getToken(): Promise<string | null> {
  return getAuthToken();
}

// ── Self-heal app-JWT ────────────────────────────────────────────────────────
// App-JWT backend berumur 7 hari TANPA mekanisme refresh. Setelah kedaluwarsa,
// SEMUA panggilan backend balik 401 — termasuk polling saat sesi trading jalan,
// sehingga user melihat "401 saat eksekusi" lalu terlempar keluar.
//
// Perbaikannya: perangkat SELALU memegang token Stockity (stc_stockity_token,
// dipakai engine WS). Token itu bisa dipakai mint app-JWT baru via
// /auth/session-from-token. Jadi saat 401, kita coba tukar diam-diam lalu ulangi
// request SEKALI — bukan langsung logout. Bila token Stockity juga sudah mati,
// re-auth gagal → jatuh ke logout normal (perilaku lama). Web tanpa token
// Stockity juga jatuh ke perilaku lama.
let _reauthInFlight: Promise<string | null> | null = null;
async function reauthWithStockityToken(): Promise<string | null> {
  if (_reauthInFlight) return _reauthInFlight;
  _reauthInFlight = (async () => {
    try {
      const stockityToken = (await storage.get('stc_stockity_token')) ?? '';
      const deviceId = (await storage.get(SESSION_KEYS.DEVICE_ID)) ?? '';
      if (!stockityToken) return null;
      const res = await fetch(`${getBase()}/api/v1/auth/session-from-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: stockityToken, deviceId }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const jwt = (data as any)?.accessToken;
      if (typeof jwt === 'string' && jwt) {
        await storage.set(SESSION_KEYS.AUTHTOKEN, jwt);
        return jwt;
      }
      return null;
    } catch {
      return null;
    }
  })();
  const out = await _reauthInFlight;
  _reauthInFlight = null;
  return out;
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

/** Benar bila aplikasi berjalan mandiri di perangkat (APK) — backend VPS mati */
async function deviceOffline(): Promise<boolean> {
  return (await deviceAuth()) !== null;
}

async function req<T>(method: string, path: string, body?: unknown, tokenOverride?: string, _retried?: boolean): Promise<T> {
  // v4: tanpa VPS. Di APK, semua jalur penting sudah dialihkan ke perangkat
  // sebelum sampai ke sini, jadi apa pun yang masih menembak backend adalah
  // sisa lama. Daripada gagal dan memunculkan pesan galat, dijawab aman:
  // konfigurasi mode toh disimpan di layar lalu diserahkan langsung ke engine.
  const dead = await deviceOffline();
  if (dead) {
    if (method !== 'GET') return { ok: true, message: 'ok' } as T;
    return (/logs|orders|assets|currencies|presets|tracking|history/.test(path) ? [] : {}) as T;
  }

  const token = tokenOverride ?? await getToken();
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
    // Login: 401 = kredensial salah, BUKAN sesi kedaluwarsa.
    // Jangan picu logout app-wide; tampilkan pesan kata sandi.
    if (path.startsWith('/auth/login')) {
      throw new Error('Kata sandi salah. Silakan login ulang.');
    }
    // Self-heal SEKALI: app-JWT kedaluwarsa → mint baru dari token Stockity
    // perangkat, lalu ulangi request. Hindari loop: tidak untuk request
    // session-from-token itu sendiri, dan hanya sekali (_retried).
    if (!_retried && !path.startsWith('/auth/session-from-token')) {
      const fresh = await reauthWithStockityToken();
      if (fresh) return req<T>(method, path, body, fresh, true);
    }
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
  /** Fast Reversal berjalan sebagai FTT + reversalSteps — ini satu-satunya
   *  penanda yang membedakannya dari FTT biasa saat memulihkan keadaan. */
  reversalSteps?: number[];
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
  /** Fast Reversal: langkah K yang arahnya dibalik. Kosong/undefined = FTT biasa. */
  reversalSteps?: number[];
  /** Mode 5st: eksekusi order BLITZ 5 detik (mode tetap 'FTT'). */
  blitz?: boolean;
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
  // pending = menunggu super-admin; awaiting_payment = di-ACC, menunggu bayar;
  // paid = lunas + reaktivasi diterapkan; approved = data lama (kompatibilitas); rejected = ditolak
  status: 'pending' | 'awaiting_payment' | 'paid' | 'approved' | 'rejected';
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface AdminStanding {
  expires_at: string | null;
  is_active: boolean;
  isSuperAdmin: boolean;
  userCount: number;
  pendingRequest: ReactivationRequest | null;
}

/** Satu baris pada kartu status sistem. `info` singkat, sudah siap tampil. */
export interface LayananStatus {
  nama: string;
  ok: boolean;
  /** Lama pemeriksaan, dipakai untuk menandai layanan yang hidup tapi lambat. */
  ms: number;
  info: string;
}

export interface SystemStatus {
  waktu: string;
  backend: LayananStatus;
  layanan: LayananStatus[];
}


// ── v4: pemanggil Edge Function stc-admin (pengganti /admin/* di VPS) ───────
// Autentikasi memakai authtoken Stockity dari cache perangkat; Edge Function
// memvalidasi ke Stockity lalu memeriksa admin_users/super_admins.
const ADMIN_FN = SUPABASE_URL + "/functions/v1/stc-admin";
const SB_ANON  = SUPABASE_ANON_KEY;

async function adminEdge(action: string, payload?: unknown): Promise<any> {
  // WEB: token Stockity TIDAK ada di klien (login web dapat JWT backend, bukan
  // token Stockity yang disimpan server-side). Jadi panel admin di web memakai
  // backend /admin/* (terautentikasi JWT). APK: token Stockity ada → Edge Function.
  const isNative =
    typeof window !== "undefined" &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true;
  if (!isNative) return adminViaBackend(action, payload);

  const mod = await import("./storage");
  const authToken = (await mod.storage.get("stc_stockity_token")) ?? "";
  const deviceId  = (await mod.storage.get(mod.SESSION_KEYS.DEVICE_ID)) ?? "";
  if (!authToken) throw new Error("Sesi Stockity tidak ditemukan — silakan login ulang");
  const { edgeCall } = await import("./engine/edgeCall");
  const res = await edgeCall("stc-admin", { authToken, deviceId, action, payload });
  if (!res.ok) throw new Error(res.error ?? ("Gagal: " + action));
  return res.data;
}

// Router admin untuk WEB → backend NestJS /admin/* (JWT). Memetakan aksi Edge
// Function ke endpoint REST yang setara. Bentuk respons dijaga sama.
async function adminViaBackend(action: string, payload?: any): Promise<any> {
  const p = payload ?? {};
  switch (action) {
    case "me":              return req("GET",  "/admin/me");
    case "listWhitelist":   return req("GET",  "/admin/whitelist");
    case "stats":           return req("GET",  "/admin/stats");
    case "addWhitelist":    return req("POST", "/admin/whitelist", p);
    case "updateWhitelist": return req("PATCH","/admin/whitelist", p);
    case "toggleWhitelist": return req("PATCH","/admin/whitelist", { oldEmail: p.email, isActive: p.isActive });
    case "importWhitelist": return req("POST", "/admin/whitelist/import", p);
    case "listAdmins":      return req("GET",  "/admin/admins");
    case "addAdmin":        return req("POST", "/admin/admins", p);
    case "updateAdmin":     return req("PATCH", `/admin/admins/${p.id}`, p);
    case "removeAdmin":     return req("DELETE","/admin/admins", p);
    case "listSuperAdmins": return req("GET",  "/admin/super-admins");
    case "addSuperAdmin":   return req("POST", "/admin/super-admins", p);
    case "deleteSuperAdmin":return req("DELETE","/admin/super-admins", p);
    case "upsertConfig":    return req("PUT",  "/admin/config", p);
    default:
      throw new Error("Aksi admin tidak didukung di web — gunakan aplikasi: " + action);
  }
}


// ── v4: data akun langsung dari perangkat (pengganti /profile/* di VPS) ─────
// Disambung di sini agar seluruh pemanggil lama tetap bekerja tanpa diubah.
async function deviceAuth(): Promise<{ authToken: string; deviceId: string } | null> {
  // Gerbang tunggal untuk SELURUH jalur mesin perangkat: status bot, daftar
  // order, riwayat, keuntungan hari ini, jeda/lanjut. Saat eksekusi berjalan
  // di server, semuanya HARUS ikut ke server — kalau tidak, dashboard membaca
  // mesin yang tidak pernah hidup dan selalu melaporkan "STOPPED".
  if (!PAKAI_MESIN_PERANGKAT) return null;
  try {
    const cap = (window as any)?.Capacitor;
    if (cap?.isNativePlatform?.() !== true) return null;
    const mod = await import("./storage");
    const authToken = (await mod.storage.get("stc_stockity_token")) ?? "";
    const deviceId  = (await mod.storage.get(mod.SESSION_KEYS.DEVICE_ID)) ?? "";
    return authToken ? { authToken, deviceId } : null;
  } catch { return null; }
}


// ── v4: sumber status & riwayat saat VPS tidak ada ─────────────────────────
// Engine berjalan di perangkat, jadi status diambil dari sesi lokal dan
// riwayat dari tabel mode_logs. Endpoint VPS hanya dipakai bila bukan APK.
async function deviceModeStatus(mode: string): Promise<any> {
  try {
    const { deviceSession } = await import("./engine/deviceSession");
    const eng: any = mode === "schedule" ? deviceSession.getEngine() : deviceSession.getModeEngine();
    if (eng?.getStatus) return eng.getStatus();
  } catch { /* belum ada sesi */ }
  return { isRunning: false, botState: "STOPPED", sessionPnL: 0 };
}

async function deviceModeLogs(mode: string, limit: number): Promise<any[]> {
  try {
    // Riwayat akun di server Stockity adalah sumber kebenaran: ditarik dan
    // disimpan dulu, agar eksekusi tetap tercatat walau catatan engine hilang.
    const { syncStockityHistory } = await import("./engine/stockityHistory");
    await syncStockityHistory().catch(() => []);
    const { fetchDeviceLogs } = await import("./engine/deviceLogs");
    return await fetchDeviceLogs(mode, limit);
  } catch { return []; }
}

/**
 * Keuntungan hari ini.
 *
 * UTAMA: dihitung dari SERVER STOCKITY (semua transaksi akun) dengan batas hari
 * memakai zona waktu akun — supaya angkanya SAMA dengan halaman Riwayat.
 * CADANGAN: bila riwayat Stockity tak bisa diambil (sesi/jaringan), baru pakai
 * catatan mode di Supabase seperti sebelumnya.
 *
 * Dulu hanya memakai catatan mode + tengah malam waktu perangkat, sehingga
 * transaksi non-bot tidak terhitung dan batas harinya bisa berbeda dari Stockity.
 */
async function deviceTodayProfit(accountType: 'demo' | 'real' | 'both' = 'real'): Promise<any> {
  try {
    const tp = await import("./todayProfit");
    const server = await tp.fetchTodayProfitFromStockity(accountType);
    if (server) {
      return {
        date: server.date,
        totalPnL: server.totalPnL,
        totalTrades: server.totalTrades,
        totalWins: server.totalWins,
        totalLosses: server.totalLosses,
        totalDraws: server.totalDraws,
        // nama lama dipertahankan agar tampilan yang membacanya tetap jalan
        wins: server.totalWins,
        losses: server.totalLosses,
        winRate: server.winRate,
        source: 'stockity',
        timezone: server.timezone,
      };
    }
  } catch { /* jatuh ke cadangan */ }

  const modes = ["schedule", "FTT", "CTC", "AISIGNAL", "INDICATOR", "MOMENTUM"];
  const all: any[] = [];
  for (const m of modes) all.push(...(await deviceModeLogs(m, 200)));
  // Batas hari tetap memakai zona akun agar konsisten dgn jalur utama
  let startMs: number;
  try {
    const tp = await import("./todayProfit");
    startMs = tp.startOfDayInTz(await tp.getAccountTimezone());
  } catch {
    const d = new Date(); d.setHours(0, 0, 0, 0); startMs = d.getTime();
  }
  const today = all.filter(l => (l?.executedAt ?? 0) >= startMs && l?.result);
  const wins   = today.filter(l => l.result === "WIN").length;
  const losses = today.filter(l => l.result === "LOSE").length;
  const totalPnL = today.reduce((sum, l) => sum + (Number(l.profit) || 0), 0);
  return {
    totalPnL, totalTrades: today.length,
    totalWins: wins, totalLosses: losses, wins, losses,
    winRate: today.length ? Math.round((wins / today.length) * 100) : 0,
    source: 'modelogs',
  };
}


// ── v4: daftar order mode Signal disimpan di perangkat ─────────────────────
// Dulu dikelola VPS. Kini engine berjalan lokal, jadi daftar order pending
// ikut disimpan di perangkat agar tetap ada saat aplikasi dibuka lagi.
const ORDERS_KEY = "stc_pending_orders";

async function localOrdersGet(): Promise<ScheduleOrder[]> {
  try {
    const mod = await import("./storage");
    const raw = await mod.storage.get(ORDERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

async function localOrdersSet(list: ScheduleOrder[]): Promise<void> {
  try {
    const mod = await import("./storage");
    await mod.storage.set(ORDERS_KEY, JSON.stringify(list));
  } catch { /* abaikan */ }
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
   * v4: ambil authtoken Stockity milik user (tersimpan server-side saat login).
   * Dibutuhkan engine di PERANGKAT untuk membuka WebSocket Stockity sendiri —
   * aplikasi hanya menyimpan JWT app, sedangkan handshake WS Stockity
   * mewajibkan header `authorization-token` berisi token Stockity asli.
   */
  stockityToken: () => req<{ token: string; deviceId: string }>('GET', '/auth/stockity-token'),
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
  balance: async (): Promise<ProfileBalance> => {
    const a = await deviceAuth();
    if (a) {
      const m = await import("./engine/stockityAccount");
      const b = await m.getBalance(a);
      if (b) return { demo_balance: b.demoBalance, real_balance: b.realBalance, currency: b.currency };
    }
    return req<ProfileBalance>('GET', '/profile/balance');
  },
  getProfile: async (): Promise<any> => {
    const a = await deviceAuth();
    if (a) {
      const m = await import("./engine/stockityAccount");
      const p = await m.getProfile(a);
      if (p) return {
        id: p.id, email: p.email, firstName: p.first_name, lastName: p.last_name,
        nickname: p.nickname, phone: p.phone, country: p.country,
        registrationCountryIso: p.registration_country_iso ?? p.country,
        currency: p.currency, registeredAt: p.created_at,
      };
    }
    return req<{
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
    }>('GET', '/profile');
  },

  /**
   * GET /profile/currency-config
   * Backend proxy — bebas CORS — untuk fetchPlatformCurrencies.
   * Returns CurrencyConfig: currencyIso, currencyUnit, minAmount, maxAmount, quickAmounts.
   * Gunakan ini sebagai pengganti fetchPlatformCurrencies di loginpage/dashboard
   * agar tidak ada direct hit ke Stockity dari browser.
   */
  currencyConfig: async (): Promise<{
    currencyIso: string; currencyUnit: string;
    minAmount: number; maxAmount: number; quickAmounts: number[];
  }> => {
    const a = await deviceAuth();
    if (a) {
      const [m, u] = await Promise.all([
        import("./engine/stockityAccount"),
        import("./userProfileApi"),
      ]);

      // Utama: ambil konfigurasi LENGKAP dari endpoint mata uang platform
      // (ISO + simbol + batas min/maks + nominal cepat) sesuai mata uang akun.
      // Sebelumnya jalur perangkat hanya membaca ISO dari saldo lalu memakai
      // angka bawaan IDR, sehingga akun USD/EUR/dll tetap tampil "Rp" dengan
      // minimum 14.000 — salah untuk akun luar negeri.
      try {
        const cfg = await m.getCurrencyConfig(a);
        if (cfg?.currencyIso) {
          const iso = cfg.currencyIso;
          const isIdr = iso === u.DEFAULT_CURRENCY_CONFIG.currencyIso;
          return {
            currencyIso:  iso,
            currencyUnit: cfg.currencyUnit || (u.ISO_TO_UNIT as any)?.[iso] || iso,
            // Bila Stockity tidak mengirim batas/nominal, pakai bawaan HANYA
            // untuk IDR; mata uang lain jangan diberi angka rupiah.
            minAmount:    cfg.minAmount > 0 ? cfg.minAmount : (isIdr ? u.DEFAULT_CURRENCY_CONFIG.minAmount : 1),
            maxAmount:    cfg.maxAmount > 0 ? cfg.maxAmount : (isIdr ? u.DEFAULT_CURRENCY_CONFIG.maxAmount : 0),
            quickAmounts: cfg.quickAmounts.length ? cfg.quickAmounts : (isIdr ? u.DEFAULT_CURRENCY_CONFIG.quickAmounts : []),
          };
        }
      } catch { /* jatuh ke cadangan di bawah */ }

      // Cadangan: mata uang dari saldo, nominal memakai bawaan platform.
      const bal = await m.getBalance(a);
      const iso = bal?.currency ?? u.DEFAULT_CURRENCY_CONFIG.currencyIso;
      return {
        ...u.DEFAULT_CURRENCY_CONFIG,
        currencyIso:  iso,
        currencyUnit: (u.ISO_TO_UNIT as any)?.[iso] ?? u.DEFAULT_CURRENCY_CONFIG.currencyUnit,
      };
    }
    return req<{
      currencyIso: string; currencyUnit: string;
      minAmount: number; maxAmount: number; quickAmounts: number[];
    }>('GET', '/profile/currency-config');
  },

  /** GET /profile/currencies — daftar semua mata uang yang tersedia */
  getCurrencies: async (): Promise<StockityCurrency[]> => {
    const dev = await deviceAuth();
    if (dev) {
      const m = await import('./engine/stockityAccount');
      return (await m.getCurrencies(dev)) as StockityCurrency[];
    }
    return req<StockityCurrency[]>('GET', '/profile/currencies');
  },

  /** PUT /profile/currency — ubah mata uang aktif user */
  updateCurrency: (currencyIso: string) =>
    req<void>('PUT', '/profile/currency', { currencyIso }),

  // ── Assets ───────────────────────────────
  getAssets: async (): Promise<StockityAsset[]> => {
    const a = await deviceAuth();
    if (a) {
      const m = await import("./engine/stockityAccount");
      const list = await m.getAssets(a);
      if (list.length) return list as StockityAsset[];
    }
    return req<StockityAsset[]>('GET', '/schedule/assets');
  },

  // ── Schedule Config ───────────────────────
  getConfig:    () => req<ScheduleConfig>('GET', '/schedule/config'),
  updateConfig: (data: UpdateConfigPayload) =>
    req<ScheduleConfig>('PUT', '/schedule/config', data),

  // ── Schedule Orders ───────────────────────
  getOrders:   async (): Promise<ScheduleOrder[]> => (await deviceAuth()) ? localOrdersGet() : req<ScheduleOrder[]>('GET', '/schedule/orders'),
  addOrders: async (input: string): Promise<any> => {
    if (await deviceAuth()) {
      // Dulu baris sinyal diurai di VPS. Kini diurai di perangkat: tiap baris
      // sudah dinormalkan layar jadi "HH:MM call|put".
      const base = new Date();
      const parsed: ScheduleOrder[] = String(input).split('\n').map(line => {
        const m = line.trim().match(/^(\d{1,2}):(\d{2})\s+(call|put)$/i);
        if (!m) return null;
        const at = new Date(base);
        at.setHours(Number(m[1]), Number(m[2]), 0, 0);
        return {
          id: `${at.getTime()}-${m[3].toLowerCase()}`,
          time: `${m[1].padStart(2, '0')}:${m[2]}`,
          trend: m[3].toLowerCase() as 'call' | 'put',
          timeInMillis: at.getTime(),
          isExecuted: false,
          isSkipped: false,
        } as ScheduleOrder;
      }).filter(Boolean) as ScheduleOrder[];
      const cur = await localOrdersGet();
      const merged = [...cur, ...parsed.filter(o => !cur.some(c => c.id === o.id))]
        .sort((a, b) => a.timeInMillis - b.timeInMillis);
      await localOrdersSet(merged);
      return { added: parsed.length, total: merged.length };
    }
    return req<any>('POST', '/schedule/orders', { input })
  },
  deleteOrder: async (id: string): Promise<any> => {
    if (await deviceAuth()) {
      const cur = await localOrdersGet();
      await localOrdersSet(cur.filter(o => o.id !== id));
      return { ok: true };
    }
    return req<any>('DELETE', `/schedule/orders/${encodeURIComponent(id)}`);
  },
  clearOrders: async (): Promise<any> => {
    if (await deviceAuth()) { await localOrdersSet([]); return { ok: true }; }
    return req<any>('DELETE', '/schedule/orders');
  },
  parseOrders: (input: string) =>
    req<{ orders: ScheduleOrder[]; errors: string[] }>('POST', '/schedule/parse', { input }),

  // ── Schedule Control ──────────────────────
  scheduleStatus: async (): Promise<ScheduleStatus> => (await deviceAuth()) ? deviceModeStatus('schedule') : req<ScheduleStatus>('GET', '/schedule/status'),
  scheduleStart:  () => req<{ message: string }>('POST', '/schedule/start'),
  scheduleStop:   () => req<{ message: string }>('POST', '/schedule/stop'),
  schedulePause: async (): Promise<any> => {
    if (await deviceAuth()) {
      const { deviceSession } = await import("./engine/deviceSession");
      deviceSession.getEngine()?.pause();
      return { ok: true };
    }
    return req<any>('POST', '/schedule/pause');
  },
  scheduleResume: async (): Promise<any> => {
    if (await deviceAuth()) {
      const { deviceSession } = await import("./engine/deviceSession");
      deviceSession.getEngine()?.resume();
      return { ok: true };
    }
    return req<any>('POST', '/schedule/resume');
  },
  scheduleLogs:   async (limit = 100): Promise<ExecutionLog[]> =>
    (await deviceAuth()) ? deviceModeLogs('schedule', limit) : req<ExecutionLog[]>('GET', `/schedule/logs?limit=${limit}`),

  /**
   * GET /schedule/tracking
   * Source of truth untuk history order — menyimpan SEMUA order beserta
   * trackingStatus (WIN/LOSE/SKIPPED/MONITORING/PENDING/FAILED) meski order
   * sudah dihapus dari active list oleh backend.
   */
  scheduleTracking: async (): Promise<TrackingResponse> => (await deviceAuth()) ? ({ orders: [] } as unknown as TrackingResponse) : req<TrackingResponse>('GET', '/schedule/tracking'),

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
  fastradeStatus: async (): Promise<FastradeStatus> => (await deviceAuth()) ? deviceModeStatus('fastrade') : req<FastradeStatus>('GET', '/fastrade/status'),
  fastradeLogs:   async (limit = 100): Promise<FastradeLog[]> => {
    if (!(await deviceAuth())) return req<FastradeLog[]>('GET', `/fastrade/logs?limit=${limit}`);
    const [ftt, ctc] = await Promise.all([deviceModeLogs('FTT', limit), deviceModeLogs('CTC', limit)]);
    return [...ftt, ...ctc] as FastradeLog[];
  },

  // ── AI Signal ────────────────────────────
  aiSignalGetConfig:    () => req<AISignalConfig>('GET', '/aisignal/config'),
  aiSignalUpdateConfig: (data: UpdateAISignalConfigPayload) =>
    req<AISignalConfig>('PUT', '/aisignal/config', data),
  aiSignalSetAsset:     (ric: string, name: string) =>
    req<AISignalConfig>('PUT', '/aisignal/config/asset', { ric, name }),
  aiSignalStart:        () => req<{ message: string }>('POST', '/aisignal/start'),
  aiSignalStop:         () => req<{ message: string }>('POST', '/aisignal/stop'),
  aiSignalStatus:       async (): Promise<AISignalStatus> => (await deviceAuth()) ? deviceModeStatus('aisignal') : req<AISignalStatus>('GET', '/aisignal/status'),
  aiSignalPendingOrders: async (): Promise<AISignalOrder[]> => (await deviceAuth()) ? [] : req<AISignalOrder[]>('GET', '/aisignal/orders/pending'),
  aiSignalExecutedOrders: () => req<AISignalOrder[]>('GET', '/aisignal/orders/executed'),
  aiSignalReceive:      (trend: string, executionTime: number, originalMessage?: string) =>
    req<{ message: string }>('POST', '/aisignal/signal', { trend, executionTime, originalMessage: originalMessage ?? '' }),

  /** GET /aisignal/logs — riwayat eksekusi AI Signal.
   * v4: mode AI Signal dieksekusi di perangkat → lognya di `mode_logs` (mode 'AISIGNAL'),
   * sama pola dgn indicator/momentum. Akun terpantau-VPS tetap baca dari backend. */
  aiSignalLogs: async (limit = 100): Promise<AISignalLog[]> =>
    (await deviceAuth()) ? deviceModeLogs('AISIGNAL', limit) : req<AISignalLog[]>('GET', `/aisignal/logs?limit=${limit}`),

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
  indicatorStatus:       async (): Promise<IndicatorStatus> => (await deviceAuth()) ? deviceModeStatus('indicator') : req<IndicatorStatus>('GET', '/indicator/status'),
  indicatorLogs:         async (limit = 100): Promise<IndicatorLog[]> => (await deviceAuth()) ? deviceModeLogs('INDICATOR', limit) : req<IndicatorLog[]>('GET', `/indicator/logs?limit=${limit}`),

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
  momentumStatus:       async (): Promise<MomentumStatus> => (await deviceAuth()) ? deviceModeStatus('momentum') : req<MomentumStatus>('GET', '/momentum/status'),
  momentumLogs:         async (limit = 100): Promise<MomentumLog[]> => (await deviceAuth()) ? deviceModeLogs('MOMENTUM', limit) : req<MomentumLog[]>('GET', `/momentum/logs?limit=${limit}`),

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
  realtimeProfit: async (accountType: 'real' | 'demo' | 'both' = 'real'): Promise<TodayProfitSummary> => {
    if (await deviceAuth()) return deviceTodayProfit(accountType);
    const r = await req<{ success: boolean; data: TodayProfitSummary }>(
      'GET', `/today-profit/realtime?accountType=${accountType}`);
    return r.data;
  },

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
  // v4: chat admin, masa aktif, dan reaktivasi DIHAPUS — layanannya hidup di
  // VPS yang dimatikan. Metodenya disisakan sebagai penolak agar UI lama
  // menampilkan pesan yang jelas, bukan menggantung.
  admin: {
    me:              (_token?: string) => adminEdge('me'),
    listWhitelist:   () => adminEdge('listWhitelist'),
    stats:           () => adminEdge('stats'),
    addWhitelist:    (b) => adminEdge('addWhitelist', b),
    updateWhitelist: (b) => adminEdge('updateWhitelist', b),
    toggleWhitelist: (email, isActive) => adminEdge('toggleWhitelist', { email, isActive }),
    deleteWhitelist: (id) => adminEdge('deleteWhitelist', { emailOrId: id }),
    importWhitelist: (rows, addedBy) => adminEdge('importWhitelist', { rows, addedBy }),
    listAdmins:      () => adminEdge('listAdmins'),
    addAdmin:        (email, name, role) => adminEdge('addAdmin', { email, name, role }),
    updateAdmin:     (id, updates) => adminEdge('updateAdmin', { id, ...updates }),
    removeAdmin:     (id) => adminEdge('removeAdmin', { emailOrId: id }),
    listSuperAdmins: () => adminEdge('listSuperAdmins'),
    addSuperAdmin:   (email) => adminEdge('addSuperAdmin', { email }),
    deleteSuperAdmin:(email) => adminEdge('deleteSuperAdmin', { email }),
    upsertConfig:    (key, value) => adminEdge('upsertConfig', { key, value }),
    // Aktivasi Mode REAL per akun (super admin) → backend NestJS (service_role).
    setRealAccess:   (stockityId: string, enabled: boolean) =>
      req<{ matched: number }>('POST', '/admin/real-access', { stockityId, enabled }),
    /**
     * Status hidup/mati layanan penopang (super admin).
     *
     * Sengaja memakai `req` langsung, BUKAN `adminEdge`: yang ditanyakan di
     * sini justru keadaan VPS — backend, basis data, API Stockity, dan proxy
     * login. Edge Function tidak bisa menjawabnya, dan di APK pun jawaban
     * yang berguna hanya datang dari server.
     */
    systemStatus:    () => req<SystemStatus>('GET', '/admin/system-status'),
    // v4: broadcast email DIHAPUS — layanan email hidup di VPS yang dimatikan.
    sendEmail:       (_b?: unknown): Promise<{ sent: number; failed: number; total: number; errors: string[] }> => Promise.reject(new Error('Fitur kirim email sudah dihapus.')),
    // ── Chat DM antar admin/super-admin ──
    chatContacts:    (): Promise<ChatContact[]> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    chatConversation:(_w?: string, _a?: number): Promise<ChatMessage[]> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    chatSend:        (_t?: string, _c?: string): Promise<ChatMessage> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    chatDelete:      (_id?: number): Promise<void> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    // ── Masa aktif (super-admin) ──
    setPeriod:       (_e?: string, _d?: number): Promise<{ email: string; expires_at: string | null }> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    // ── Standing & reaktivasi ──
    standing:        (): Promise<AdminStanding> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    reactivationRequest: (_d?: number): Promise<ReactivationRequest> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    reactivationList:    (): Promise<ReactivationRequest[]> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    reactivationApprove: (_i?: number, _a?: number): Promise<{ admin_email: string; days: number; amount_usd: number }> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    reactivationConfirmPayment: (_i?: number): Promise<{ admin_email: string; days: number }> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
    reactivationReject:  (_i?: number): Promise<void> => Promise.reject(new Error('Fitur ini sudah dihapus pada versi 4.')),
  },
};