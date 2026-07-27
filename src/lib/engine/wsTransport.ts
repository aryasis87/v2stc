// lib/engine/wsTransport.ts
// ─────────────────────────────────────────────────────────────────────
// v4 Fase B — lapisan transport WebSocket Stockity.
//
// TEMUAN UJI (2026-07-27, token nyata, VPS):
//   Handshake wss://ws.stockity1.id MEWAJIBKAN header `authorization-token`.
//   Ditolak 401: query param (authtoken/token/auth_token/authorization_token/
//   api_token), Sec-WebSocket-Protocol, cookie tanpa header, kredensial di
//   payload phx_join. Hanya header yang lolos.
//   → WebSocket API browser (tak bisa set header) TIDAK BISA dipakai.
//
// Maka transport dipilih otomatis:
//   • APK (Capacitor) → plugin native `StockityWs` (OkHttp, header lengkap) ✅
//   • Browser murni    → tidak didukung; unsupportedReason() menjelaskan why,
//     agar UI bisa menampilkan pesan yang jujur alih-alih gagal diam-diam.
// ─────────────────────────────────────────────────────────────────────

export interface TransportOptions {
  authToken: string;
  deviceId: string;
  deviceType?: string;
  userAgent?: string;
  url?: string;
  onOpen?: () => void;
  onMessage?: (data: string) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (message: string) => void;
}

export interface WsTransport {
  connect(): Promise<void>;
  send(data: string): boolean;
  close(): void;
  isConnected(): boolean;
}

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, any>;
  registerPlugin?: <T>(name: string) => T;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as any).Capacitor ?? null;
}

/** true bila aplikasi berjalan sebagai APK Android (Capacitor), bukan browser */
export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** true bila berjalan di APK (Capacitor) dan plugin WS native tersedia */
export function hasNativeWs(): boolean {
  const c = cap();
  if (!c?.isNativePlatform?.()) return false;
  return !!(c.Plugins?.StockityWs ?? c.registerPlugin);
}

/** Alasan transport tidak tersedia (null = tersedia) — untuk pesan UI */
export function unsupportedReason(): string | null {
  if (typeof window === 'undefined') return 'server-side';
  if (hasNativeWs()) return null;
  return 'Eksekusi order memerlukan aplikasi Android STC AutoTrade. '
       + 'Server Stockity mewajibkan header autentikasi pada koneksi realtime, '
       + 'dan browser tidak diizinkan mengirimkannya.';
}

/** Transport native (APK) — satu-satunya jalur yang lolos autentikasi Stockity */
class NativeWsTransport implements WsTransport {
  private plugin: any;
  private listeners: any[] = [];
  private connected = false;

  constructor(private readonly opts: TransportOptions) {
    const c = cap()!;
    this.plugin = c.Plugins?.StockityWs ?? c.registerPlugin!<any>('StockityWs');
  }

  async connect(): Promise<void> {
    this.listeners.push(await this.plugin.addListener('open', () => {
      this.connected = true;
      this.opts.onOpen?.();
    }));
    this.listeners.push(await this.plugin.addListener('message', (ev: { data: string }) => {
      this.opts.onMessage?.(ev?.data ?? '');
    }));
    this.listeners.push(await this.plugin.addListener('closed', (ev: { code: number; reason: string }) => {
      this.connected = false;
      this.opts.onClose?.(ev?.code ?? 1006, ev?.reason ?? '');
    }));
    this.listeners.push(await this.plugin.addListener('failure', (ev: { error: string; status?: number }) => {
      this.connected = false;
      this.opts.onError?.(ev?.status ? `${ev.error} (HTTP ${ev.status})` : (ev?.error ?? 'unknown'));
    }));

    await this.plugin.connect({
      authToken:  this.opts.authToken,
      deviceId:   this.opts.deviceId,
      deviceType: this.opts.deviceType ?? 'web',
      userAgent:  this.opts.userAgent,
      url:        this.opts.url,
    });
  }

  send(data: string): boolean {
    if (!this.connected) return false;
    // Plugin mengembalikan Promise; engine memakai fire-and-forget seperti
    // WebSocket.send() agar alur pemanggil tidak berubah.
    this.plugin.send({ data }).catch(() => { /* diabaikan: kegagalan tampil via event failure */ });
    return true;
  }

  close(): void {
    this.connected = false;
    this.listeners.forEach(l => { try { l.remove(); } catch { /* sudah lepas */ } });
    this.listeners = [];
    this.plugin.close().catch(() => { /* sudah tertutup */ });
  }

  isConnected(): boolean { return this.connected; }
}

/**
 * Buat transport untuk lingkungan saat ini.
 * Melempar bila jalur native tidak tersedia — pemanggil menampilkan
 * unsupportedReason() ke user (jangan gagal diam-diam).
 */
export function createTransport(opts: TransportOptions): WsTransport {
  if (!hasNativeWs()) throw new Error(unsupportedReason() ?? 'WebSocket transport tidak tersedia');
  return new NativeWsTransport(opts);
}
