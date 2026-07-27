// lib/engine/deviceSession.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — sesi trading di perangkat user (APK).
// Menyatukan: transport WS native → StockityWsClient → ScheduleEngine.
// Satu sesi aktif per proses (mengikuti model server: 1 mode berjalan).
//
// Pemakaian (dari UI, hanya saat isNativeApp()):
//   const s = await deviceSession.startSchedule({ orders, config, callbacks });
//   deviceSession.stop();
// ─────────────────────────────────────────────────────────────────────

import { storage, SESSION_KEYS } from '../storage';
import { api } from '../api';
import { StockityWsClient } from './stockityWs';
import { ScheduleEngine, type ScheduledOrder, type ScheduleConfig, type EngineCallbacks } from './scheduleEngine';
import { FastradeEngine } from './fastradeEngine';
import { AiSignalEngine } from './aiSignalEngine';
import { IndicatorEngine } from './indicatorEngine';
import { MomentumEngine } from './momentumEngine';
import { hasNativeWs, unsupportedReason } from './wsTransport';
import { saveSession, loadSession, clearSession, appendLog, flushLogs, type PersistedSession } from './sessionStore';

/** Kunci cache token Stockity di perangkat (bukan JWT app) */
const STOCKITY_TOKEN_KEY = 'stc_stockity_token';

/**
 * Token Stockity untuk WS di perangkat. Diambil dari backend (sumber
 * kebenaran, tersimpan saat login) lalu di-cache; bila backend tak
 * terjangkau, pakai cache terakhir agar sesi tetap bisa jalan.
 */
async function getStockityToken(): Promise<{ token: string; deviceId: string }> {
  try {
    const res = await api.stockityToken();
    if (res?.token) {
      await storage.set(STOCKITY_TOKEN_KEY, res.token);
      return { token: res.token, deviceId: res.deviceId ?? '' };
    }
  } catch { /* offline / endpoint belum ada → pakai cache */ }
  const cached = await storage.get(STOCKITY_TOKEN_KEY);
  return { token: cached ?? '', deviceId: (await storage.get(SESSION_KEYS.DEVICE_ID)) ?? '' };
}

/** Mode yang dieksekusi di perangkat */
export type DeviceMode = 'schedule' | 'fastrade' | 'ctc' | 'aisignal' | 'indicator' | 'momentum';

export interface StartModeArgs {
  mode: Exclude<DeviceMode, 'schedule'>;
  /** Konfigurasi spesifik mode (bentuknya mengikuti tiap engine) */
  config: any;
  callbacks: {
    onLog: (log: any) => void;
    onStatusChange: (status: string) => void;
    onStopped: () => void;
    onSessionPnL?: (pnl: number) => void;
  };
}

export interface StartScheduleArgs {
  orders: ScheduledOrder[];
  config: ScheduleConfig;
  callbacks: EngineCallbacks;
  /** State sesi yang dilanjutkan (dari loadSession) — PnL & waktu mulai dipertahankan */
  resume?: { sessionPnL: number; startedAt?: number };
}

class DeviceSession {
  private ws: StockityWsClient | null = null;
  private engine: ScheduleEngine | null = null;
  private modeEngine: any = null;          // engine mode non-Schedule
  private activeMode: DeviceMode | null = null;

  /** Apakah eksekusi di perangkat tersedia (APK + plugin native siap) */
  available(): boolean { return hasNativeWs(); }
  /** Alasan bila tidak tersedia — untuk ditampilkan ke user */
  unavailableReason(): string | null { return unsupportedReason(); }

  getEngine(): ScheduleEngine | null { return this.engine; }
  isRunning(): boolean { return !!this.engine && (this.engine.getStatus() as any).isRunning === true; }

  /**
   * Mulai sesi mode Schedule di perangkat.
   * Melempar bila dijalankan di browser (bukan APK) — pemanggil menampilkan
   * unavailableReason() alih-alih gagal diam-diam.
   */
  async startSchedule({ orders, config, callbacks, resume }: StartScheduleArgs): Promise<void> {
    if (!this.available()) throw new Error(this.unavailableReason() ?? 'Eksekusi di perangkat tidak tersedia');

    // Sesi lama dibersihkan dulu — hanya satu sesi aktif.
    this.stop();

    // PENTING: SESSION_KEYS.AUTHTOKEN berisi JWT aplikasi, BUKAN token Stockity.
    // Handshake WS Stockity mewajibkan token Stockity asli (kalau salah → 401),
    // jadi diambil dari backend (tersimpan saat login) lalu di-cache di perangkat.
    const { token: stockityToken, deviceId: srvDeviceId } = await getStockityToken();
    const deviceId = srvDeviceId || (await storage.get(SESSION_KEYS.DEVICE_ID)) || '';
    if (!stockityToken || !deviceId) throw new Error('Sesi tidak lengkap — silakan login ulang');
    const authToken = stockityToken;

    const ws = new StockityWsClient({
      authToken,
      deviceId,
      deviceType: (await storage.get(SESSION_KEYS.DEVICE_TYPE)) ?? 'web',
      onStatusChange: (connected, reason) => {
        if (reason) callbacks.onStatusChange(reason);
        if (!connected) callbacks.onStatusChange('Koneksi realtime terputus — mencoba menyambung ulang');
      },
      onDealResult: (payload) => this.engine?.handleWsDealResult(payload),
    });

    await ws.connect();

    // Bungkus callbacks: simpan snapshot untuk pemulihan, lalu teruskan ke UI.
    const wrapped: EngineCallbacks = {
      ...callbacks,
      onPersist: (snap, final) => {
        saveSession({
          config: snap.config,
          orders: snap.orders,
          sessionPnL: snap.sessionPnL,
          botState: snap.botState,
          startedAt: snap.startedAt,
        }, final);
        callbacks.onPersist?.(snap, final);
      },
      onLog: (log) => {
        // Riwayat ditulis ke DB (tabel mode_logs) agar halaman Riwayat terisi
        // meski eksekusi terjadi di perangkat, bukan di server.
        appendLog({ ...log, mode: 'schedule' });
        callbacks.onLog(log);
      },
      onAllCompleted: () => {
        flushLogs();    // pastikan log terakhir tersimpan
        clearSession(); // sesi tuntas → jangan ditawarkan lagi
        callbacks.onAllCompleted();
      },
    };

    const engine = new ScheduleEngine(ws, wrapped, orders, config);
    this.ws = ws;
    this.engine = engine;
    engine.start(resume);
  }

  /**
   * Jalankan mode selain Schedule (Fastrade/CTC, AI Signal, Indicator,
   * Momentum) di perangkat. Riwayat tiap mode ikut ditulis ke DB memakai
   * jalur yang sama dengan Schedule, sehingga halaman Riwayat terisi.
   */
  async startMode({ mode, config, callbacks }: StartModeArgs): Promise<void> {
    if (!this.available()) throw new Error(this.unavailableReason() ?? 'Eksekusi di perangkat tidak tersedia');
    this.stop();

    const { token: stockityToken, deviceId: srvDeviceId } = await getStockityToken();
    const deviceId = srvDeviceId || (await storage.get(SESSION_KEYS.DEVICE_ID)) || '';
    if (!stockityToken || !deviceId) throw new Error('Sesi tidak lengkap — silakan login ulang');

    const deviceType = (await storage.get(SESSION_KEYS.DEVICE_TYPE)) ?? 'web';
    const rest = { authToken: stockityToken, deviceId, deviceType };

    const ws = new StockityWsClient({
      authToken: stockityToken, deviceId, deviceType,
      onStatusChange: (connected, reason) => {
        if (reason) callbacks.onStatusChange(reason);
        if (!connected) callbacks.onStatusChange('Koneksi realtime terputus — mencoba menyambung ulang');
      },
      onDealResult: (payload) => (this.modeEngine as any)?.handleWsDealResult?.(payload),
    });
    await ws.connect();

    // Bungkus onLog: tulis ke DB (tabel mode_logs) + teruskan ke UI.
    // Penanda mode wajib ikut: tanpa itu log jatuh ke 'schedule' dan tidak
    // pernah muncul di tab modenya sendiri pada halaman Riwayat.
    const LOG_MODE: Record<string, string> = {
      fastrade: 'FTT', ctc: 'CTC', aisignal: 'AISIGNAL',
      indicator: 'INDICATOR', momentum: 'MOMENTUM',
    };
    const logMode = LOG_MODE[mode] ?? String(mode).toUpperCase();

    const cb = {
      ...callbacks,
      onLog: (log: any) => { appendLog({ ...log, mode: log?.mode ?? logMode }); callbacks.onLog(log); },
      onStopped: () => { flushLogs(); callbacks.onStopped(); },
    };

    let engine: any;
    if (mode === 'fastrade' || mode === 'ctc') {
      engine = new FastradeEngine(ws, rest, { ...config, mode: mode === 'ctc' ? 'CTC' : 'FTT' }, cb);
    } else if (mode === 'aisignal') {
      engine = new AiSignalEngine(ws, config, cb);
    } else if (mode === 'indicator') {
      engine = new IndicatorEngine(ws, rest, config, cb);
    } else {
      engine = new MomentumEngine(ws, rest, config, cb);
    }

    this.ws = ws;
    this.modeEngine = engine;
    this.activeMode = mode;
    engine.start();
  }

  /** Engine mode non-Schedule yang sedang berjalan (untuk status di UI) */
  getModeEngine(): any | null { return this.modeEngine; }
  getActiveMode(): DeviceMode | null { return this.activeMode; }

  /**
   * Sesi tertunda yang bisa dilanjutkan (aplikasi sempat ditutup saat bot
   * masih berjalan). null bila tidak ada.
   */
  async findResumable(): Promise<PersistedSession | null> {
    if (!this.available()) return null;
    return loadSession();
  }

  /** Buang sesi tersimpan tanpa menjalankannya (user memilih "mulai baru") */
  discardSaved(): void { clearSession(); }

  /** Hentikan sesi & tutup koneksi (aman dipanggil berkali-kali) */
  stop(): void {
    try { flushLogs(); } catch { /* antrean kosong */ }
    try { this.engine?.stop(); } catch { /* sudah berhenti */ }
    try { this.modeEngine?.stop(); } catch { /* sudah berhenti */ }
    try { this.ws?.disconnect(); } catch { /* sudah tertutup */ }
    this.engine = null;
    this.modeEngine = null;
    this.activeMode = null;
    this.ws = null;
  }
}

export const deviceSession = new DeviceSession();
