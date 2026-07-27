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
import { StockityWsClient } from './stockityWs';
import { ScheduleEngine, type ScheduledOrder, type ScheduleConfig, type EngineCallbacks } from './scheduleEngine';
import { hasNativeWs, unsupportedReason } from './wsTransport';

export interface StartScheduleArgs {
  orders: ScheduledOrder[];
  config: ScheduleConfig;
  callbacks: EngineCallbacks;
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
  async startSchedule({ orders, config, callbacks }: StartScheduleArgs): Promise<void> {
    if (!this.available()) throw new Error(this.unavailableReason() ?? 'Eksekusi di perangkat tidak tersedia');

    // Sesi lama dibersihkan dulu — hanya satu sesi aktif.
    this.stop();

    const authToken = await storage.get(SESSION_KEYS.AUTHTOKEN);
    const deviceId  = await storage.get(SESSION_KEYS.DEVICE_ID);
    if (!authToken || !deviceId) throw new Error('Sesi tidak lengkap — silakan login ulang');

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

    const engine = new ScheduleEngine(ws, callbacks, orders, config);
    this.ws = ws;
    this.engine = engine;
    engine.start();
  }

  /** Hentikan sesi & tutup koneksi (aman dipanggil berkali-kali) */
  stop(): void {
    try { this.engine?.stop(); } catch { /* sudah berhenti */ }
    try { this.ws?.disconnect(); } catch { /* sudah tertutup */ }
    this.engine = null;
    this.ws = null;
  }
}

export const deviceSession = new DeviceSession();
