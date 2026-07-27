// lib/engine/stockityWs.ts
// ─────────────────────────────────────────────────────────────────────
// v4 FASE B — ENGINE CLIENT-SIDE (eksekusi di perangkat user, tanpa VPS)
// Port dari botstc/src/schedule/websocket-client.ts (Node 'ws').
//
// HASIL UJI (2026-07-27, token nyata): handshake wss://ws.stockity1.id
// MEWAJIBKAN header "authorization-token". Ditolak 401: query param
// (authtoken/token/auth_token/authorization_token/api_token),
// Sec-WebSocket-Protocol, cookie tanpa header, dan kredensial di payload
// phx_join. Karena WebSocket API browser tidak bisa menyetel header,
// koneksi dibuka lewat lapisan transport (./wsTransport) yang memakai
// plugin native Android StockityWs. Browser murni TIDAK didukung —
// pemanggil harus menampilkan unsupportedReason() ke user.
//
// Perilaku DIPERTAHANKAN identik dengan engine server:
//   join channel + retry, heartbeat 25s, reconnect backoff, dual-ID
//   (bo:opened numeric → resolve pending FIFO; bo:closed uuid → emit),
//   close_deal_batch, mapping error deal_amount_min/max/duplicate.
// ─────────────────────────────────────────────────────────────────────

import { createTransport, type WsTransport } from './wsTransport';

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

export interface StockityWsOptions {
  authToken: string;
  deviceId: string;
  deviceType?: string;
  userAgent?: string;
  wsUrl?: string;
  onDealResult?: (payload: DealResultPayload) => void;
  onStatusChange?: (connected: boolean, reason?: string) => void;
}

export class StockityWsClient {
  private transport: WsTransport | null = null;
  private refCounter = 1;
  private joinedChannels = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private isDestroyed = false;

  private readonly MAX_RECONNECT = 10;
  private readonly HEARTBEAT_INTERVAL_MS = 25_000;
  private readonly CHANNEL_JOIN_DELAY_MS = 400;

  private pendingTrades = new Map<number, { resolve: (r: PlaceTradeResult) => void; timer: ReturnType<typeof setTimeout> }>();

  private readonly CHANNELS = ['connection', 'tournament', 'user', 'cfd_zero_spread', 'bo', 'asset', 'account'];
  private readonly REQUIRED_CHANNELS = ['bo', 'account', 'asset'];

  constructor(private readonly opts: StockityWsOptions) {}

  private getRef(): number { return this.refCounter++; }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isDestroyed) return reject(new Error('Client sudah di-destroy'));

      let settled = false;
      const doResolve = () => { if (!settled) { settled = true; resolve(); } };
      const doReject  = (err: Error) => { if (!settled) { settled = true; reject(err); } };

      const connectTimeout = setTimeout(() => {
        doReject(new Error('WebSocket connection timeout'));
        this.transport?.close();
      }, 20_000);

      try {
        this.transport = createTransport({
          authToken:  this.opts.authToken,
          deviceId:   this.opts.deviceId,
          deviceType: this.opts.deviceType,
          userAgent:  this.opts.userAgent,
          url:        this.opts.wsUrl,
          onOpen: async () => {
            clearTimeout(connectTimeout);
            this.connected = true;
            this.reconnectAttempts = 0;
            this.opts.onStatusChange?.(true, 'Connected to Stockity WebSocket');
            await this.sleep(300);
            await this.joinChannelsWithRetry();
            this.startHeartbeat();
            doResolve();
          },
          onMessage: (data) => this.handleMessage(data),
          onClose: (code) => {
            this.connected = false;
            this.stopHeartbeat();
            this.opts.onStatusChange?.(false, `Closed: ${code}`);
            if (!this.isDestroyed && settled) this.scheduleReconnect();
          },
          onError: (message) => {
            this.connected = false;
            clearTimeout(connectTimeout);
            this.opts.onStatusChange?.(false, message);
            doReject(new Error(message));
          },
        });

        this.transport.connect().catch((e) => {
          clearTimeout(connectTimeout);
          doReject(e as Error);
        });
      } catch (err) {
        clearTimeout(connectTimeout);
        doReject(err as Error);
      }
    });
  }

  private async joinChannelsWithRetry() {
    this.joinedChannels.clear();
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      for (const channel of this.CHANNELS) {
        if (this.isDestroyed || !this.transport) break;
        if (this.joinedChannels.has(channel)) continue;

        const sent = this.sendMsg({ topic: channel, event: 'phx_join', payload: {}, ref: this.getRef() });
        if (sent) {
          this.joinedChannels.add(channel);
          await this.sleep(this.CHANNEL_JOIN_DELAY_MS);
        }
      }

      if (this.REQUIRED_CHANNELS.every(c => this.joinedChannels.has(c))) {
        this.opts.onStatusChange?.(true, 'Ready for automated trading');
        return;
      }

      retryCount++;
      if (retryCount < maxRetries) await this.sleep(2000);
    }

    const hasEssential = ['bo', 'account'].every(c => this.joinedChannels.has(c));
    this.opts.onStatusChange?.(
      hasEssential,
      hasEssential ? 'Connected with essential channels' : 'Failed to join essential channels',
    );
  }

  private sendMsg(msg: { topic: string; event: string; payload: Record<string, any>; ref: number | null }): boolean {
    if (!this.transport || !this.connected) return false;
    try {
      return this.transport.send(JSON.stringify(msg));
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
    this.reconnectTimer = setTimeout(() => {
      this.joinedChannels.clear();
      this.connect().catch(() => { /* percobaan berikutnya dijadwalkan handler close */ });
    }, delay);
  }

  private handleMessage(raw: string) {
    if (!raw) return;
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

      // Dual-ID Stockity: opened=numeric (hanya resolve pending, FIFO),
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

  isConnected(): boolean { return this.connected && !!this.transport?.isConnected(); }
  isRequiredChannelsReady(): boolean { return this.REQUIRED_CHANNELS.every(c => this.joinedChannels.has(c)); }

  disconnect() {
    this.isDestroyed = true;
    this.connected = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.pendingTrades.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.resolve({ dealId: null, error: 'unknown' });
    });
    this.pendingTrades.clear();
    this.transport?.close();
    this.transport = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
