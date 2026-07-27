// lib/engine/stockityWs.ts
// ─────────────────────────────────────────────────────────────────────
// v4 FASE B — FONDASI ENGINE CLIENT-SIDE
// Port browser dari botstc/src/schedule/websocket-client.ts (Node 'ws').
// Eksekusi order Stockity via WebSocket Phoenix (wss://ws.stockity1.id)
// LANGSUNG dari device user — WebSocket bebas CORS.
//
// PERBEDAAN PENTING vs versi server:
//   Browser TIDAK BISA menyetel custom header (authorization-token,
//   device-id, Cookie, Origin) pada handshake WebSocket. Autentikasi
//   harus lewat jalur lain — modul ini menyediakan 2 strategi yang
//   HARUS diverifikasi dengan token nyata saat pengujian Fase B:
//     • 'query' : token & device dikirim sebagai query param URL
//     • 'join'  : token dikirim di payload phx_join tiap channel
//   (APK native/Kotlin bebas masalah ini — bisa set header seperti server.)
//
// Perilaku yang DIPERTAHANKAN identik dengan server:
//   join channel + retry, heartbeat 25s, reconnect backoff, dual-ID
//   (bo:opened numeric → resolve pending FIFO; bo:closed uuid → emit),
//   close_deal_batch, mapping error deal_amount_min/max/duplicate.
// ─────────────────────────────────────────────────────────────────────

export interface TradeOrderData {
  amount: number;
  createdAt: number;
  dealType: string;
  expireAt: number;
  iso: string;
  optionType: string;
  ric: string;
  trend: 'call' | 'put' | string;
}

export interface PlaceTradeResult {
  dealId: string | null;
  error?: 'amount_min' | 'amount_max' | 'duplicate' | 'unknown';
}

export interface DealResultPayload {
  id: string;          // primary id: uuid untuk closed/deal_result
  numericId?: string;  // numeric id dari payload.id (bo:opened)
  uuid?: string;       // uuid dari payload.uuid (bo:closed)
  status?: string;
  result?: string;
  trend?: string;
  amount?: number;
  [key: string]: any;
}

export type WsAuthStrategy = 'query' | 'join';

export interface StockityWsOptions {
  authToken: string;
  deviceId: string;
  deviceType?: string;
  /** Strategi autentikasi handshake — default 'query'; fallback uji: 'join' */
  authStrategy?: WsAuthStrategy;
  wsUrl?: string;
  onDealResult?: (payload: DealResultPayload) => void;
  onStatusChange?: (connected: boolean, reason?: string) => void;
}

const DEFAULT_WS_URL = 'wss://ws.stockity1.id/?v=2&vsn=2.0.0';

export class StockityWsBrowser {
  private ws: WebSocket | null = null;
  private refCounter = 1;
  private joinedChannels = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private readonly HEARTBEAT_INTERVAL_MS = 25_000;
  private readonly CHANNEL_JOIN_DELAY_MS = 400;
  private isDestroyed = false;

  private pendingTrades = new Map<number, { resolve: (r: PlaceTradeResult) => void; timer: ReturnType<typeof setTimeout> }>();

  private readonly CHANNELS = ['connection', 'tournament', 'user', 'cfd_zero_spread', 'bo', 'asset', 'account'];
  private readonly REQUIRED_CHANNELS = new Set(['bo', 'account', 'asset']);

  constructor(private readonly opts: StockityWsOptions) {}

  private getRef(): number { return this.refCounter++; }

  private buildUrl(): string {
    const base = this.opts.wsUrl ?? DEFAULT_WS_URL;
    if ((this.opts.authStrategy ?? 'query') !== 'query') return base;
    const u = new URL(base);
    // Kandidat nama param — server Phoenix umum menerima token via params;
    // nama persisnya diverifikasi saat uji dengan token nyata.
    u.searchParams.set('authtoken', this.opts.authToken);
    u.searchParams.set('authorization-token', this.opts.authToken);
    u.searchParams.set('device_id', this.opts.deviceId);
    u.searchParams.set('device_type', this.opts.deviceType ?? 'web');
    return u.toString();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isDestroyed) return reject(new Error('Client sudah di-destroy'));

      let settled = false;
      const doResolve = () => { if (!settled) { settled = true; resolve(); } };
      const doReject  = (err: Error) => { if (!settled) { settled = true; reject(err); } };

      try {
        this.ws = new WebSocket(this.buildUrl());

        const connectTimeout = setTimeout(() => {
          doReject(new Error('WebSocket connection timeout'));
          this.ws?.close();
        }, 20_000);

        this.ws.addEventListener('open', async () => {
          clearTimeout(connectTimeout);
          this.reconnectAttempts = 0;
          this.opts.onStatusChange?.(true, 'Connected to Stockity WebSocket');
          await this.sleep(300);
          await this.joinChannelsWithRetry();
          this.startHeartbeat();
          doResolve();
        });

        this.ws.addEventListener('message', (ev) => {
          this.handleMessage(typeof ev.data === 'string' ? ev.data : '');
        });

        this.ws.addEventListener('error', () => {
          this.opts.onStatusChange?.(false, 'WebSocket error');
          clearTimeout(connectTimeout);
          doReject(new Error('WebSocket error'));
        });

        this.ws.addEventListener('close', (ev) => {
          this.stopHeartbeat();
          this.opts.onStatusChange?.(false, `Closed: ${ev.code}`);
          if (!this.isDestroyed && settled) this.scheduleReconnect();
        });
      } catch (err) { doReject(err as Error); }
    });
  }

  private async joinChannelsWithRetry() {
    this.joinedChannels.clear();
    let retryCount = 0;
    const maxRetries = 3;

    // Strategi 'join': sertakan kredensial di payload phx_join
    const joinPayload: Record<string, any> =
      this.opts.authStrategy === 'join'
        ? {
            authtoken:   this.opts.authToken,
            device_id:   this.opts.deviceId,
            device_type: this.opts.deviceType ?? 'web',
          }
        : {};

    while (retryCount < maxRetries) {
      for (const channel of this.CHANNELS) {
        if (this.isDestroyed || !this.ws) break;
        if (this.joinedChannels.has(channel)) continue;

        const sent = this.sendMsg({ topic: channel, event: 'phx_join', payload: joinPayload, ref: this.getRef() });
        if (sent) {
          this.joinedChannels.add(channel);
          await this.sleep(this.CHANNEL_JOIN_DELAY_MS);
        }
      }

      const hasRequired = [...this.REQUIRED_CHANNELS].every(c => this.joinedChannels.has(c));
      if (hasRequired) {
        this.opts.onStatusChange?.(true, 'Ready for automated trading');
        return;
      }

      retryCount++;
      if (retryCount < maxRetries) await this.sleep(2000);
    }

    const hasEssential = ['bo', 'account'].every(c => this.joinedChannels.has(c));
    this.opts.onStatusChange?.(hasEssential, hasEssential ? 'Connected with essential channels' : 'Failed to join essential channels');
  }

  private sendMsg(msg: { topic: string; event: string; payload: Record<string, any>; ref: number | null }): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch { return false; }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMsg({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this.getRef() });
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      this.opts.onStatusChange?.(false, 'Max reconnect attempts reached');
      return;
    }
    const delay = Math.min(1500 * Math.pow(2, Math.min(this.reconnectAttempts, 5)), 45_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      try {
        this.joinedChannels.clear();
        await this.connect();
      } catch { /* reconnect berikutnya dijadwalkan oleh handler close */ }
    }, delay);
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      const event: string = msg.event ?? '';
      const topic: string = msg.topic ?? '';
      const payload: any = msg.payload ?? {};
      const ref: number = msg.ref ?? -1;

      // ── phx_reply ──
      if (event === 'phx_reply') {
        if (topic === 'phoenix') return;
        const status = payload?.status;
        const response = payload?.response;

        if (status === 'ok' && response?.id) {
          const pending = this.pendingTrades.get(ref);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve({ dealId: response.id });
            this.pendingTrades.delete(ref);
          }
        } else if (status === 'error') {
          const pending = this.pendingTrades.get(ref);
          if (pending) {
            clearTimeout(pending.timer);
            const reasons: string[] = (response?.reasons ?? []).map((r: any) => r.validation as string);
            const error: PlaceTradeResult['error'] =
              reasons.includes('deal_amount_min') ? 'amount_min' :
              reasons.includes('deal_amount_max') ? 'amount_max' :
              reasons.includes('duplicate_deal')  ? 'duplicate'  : 'unknown';
            pending.resolve({ dealId: null, error });
            this.pendingTrades.delete(ref);
          }
        }
        return;
      }

      if (topic !== 'bo' || !payload) return;
      if (!['opened', 'closed', 'deal_result', 'close_deal_batch'].includes(event)) return;

      // ── close_deal_batch ──
      if (event === 'close_deal_batch') {
        const deals: any[] = payload.deals || payload.data || [];
        for (const deal of deals) {
          const numericId = deal.id != null ? String(deal.id) : undefined;
          const uuidStr: string | undefined = deal.uuid ?? deal.deal_id ?? deal.dealId;
          const dealId = uuidStr ?? numericId;
          if (dealId) this.opts.onDealResult?.({ ...deal, id: dealId, numericId, uuid: uuidStr });
        }
        return;
      }

      // Dual-ID Stockity: opened=numeric (resolve pending FIFO saja),
      // closed/deal_result=uuid (emit ke executor).
      const numericId = payload.id != null ? String(payload.id) : undefined;
      const uuidStr: string | undefined = payload.uuid ?? payload.deal_id ?? payload.dealId;

      if (event === 'opened') {
        const dealId = numericId ?? uuidStr;
        if (dealId && this.pendingTrades.size > 0) {
          const oldestRef = Array.from(this.pendingTrades.keys()).sort((a, b) => a - b)[0];
          const pending = this.pendingTrades.get(oldestRef);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve({ dealId: String(dealId) });
            this.pendingTrades.delete(oldestRef);
          }
        }
        return; // TIDAK emit ke onDealResult
      }

      const dealId = uuidStr ?? numericId;
      if (dealId) this.opts.onDealResult?.({ ...payload, id: String(dealId), numericId, uuid: uuidStr });
    } catch { /* abaikan non-JSON */ }
  }

  async placeTrade(order: TradeOrderData): Promise<PlaceTradeResult> {
    const ref = this.getRef();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTrades.delete(ref);
        resolve({ dealId: null, error: 'unknown' });
      }, 5000);

      this.pendingTrades.set(ref, { resolve, timer });

      const sent = this.sendMsg({
        topic: 'bo',
        event: 'create',
        payload: {
          amount:      order.amount,
          created_at:  order.createdAt,
          deal_type:   order.dealType,
          expire_at:   order.expireAt,
          iso:         order.iso,
          option_type: order.optionType,
          ric:         order.ric,
          trend:       order.trend,
        },
        ref,
      });

      if (!sent) {
        clearTimeout(timer);
        this.pendingTrades.delete(ref);
        resolve({ dealId: null, error: 'unknown' });
      }
    });
  }

  isConnected(): boolean { return this.ws?.readyState === WebSocket.OPEN; }
  isRequiredChannelsReady(): boolean { return [...this.REQUIRED_CHANNELS].every(c => this.joinedChannels.has(c)); }

  disconnect() {
    this.isDestroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    for (const [, pending] of this.pendingTrades.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({ dealId: null, error: 'unknown' });
    }
    this.pendingTrades.clear();
    this.ws?.close();
    this.ws = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
