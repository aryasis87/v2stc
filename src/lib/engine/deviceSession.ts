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
    try { this.ws?.disconnect(); } catch { /* sudah tertutup */ }
    this.engine = null;
    this.ws = null;
  }
}

export const deviceSession = new DeviceSession();
