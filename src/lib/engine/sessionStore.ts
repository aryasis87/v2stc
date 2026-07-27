// lib/engine/sessionStore.ts
// ─────────────────────────────────────────────────────────────────────
// v4 — Klien penyimpanan sesi perangkat (opsi 2: perangkat + pemulihan).
//
// Menulis lewat Edge Function `session-state` karena RLS mengunci tabel
// backend dari anon key (terverifikasi: READ 200 / WRITE 401) dan aplikasi
// tidak boleh memegang service_role. Fungsi itu memvalidasi authtoken ke
// Stockity, jadi user hanya bisa menulis state miliknya sendiri.
//
// Sifat: BEST-EFFORT. Kegagalan menyimpan TIDAK boleh menghentikan trading —
// state hanya untuk memulihkan sesi bila aplikasi ditutup di tengah jalan.
// ─────────────────────────────────────────────────────────────────────

import { storage, SESSION_KEYS } from '../storage';
import type { ScheduledOrder, ScheduleConfig } from './scheduleEngine';

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/session-state`;
const ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Jeda minimum antar penyimpanan — hindari badai tulis saat tick cepat */
const SAVE_THROTTLE_MS = 4000;

export interface PersistedSession {
  config: ScheduleConfig;
  orders: ScheduledOrder[];
  sessionPnL: number;
  botState: 'RUNNING' | 'PAUSED' | 'STOPPED';
  startedAt?: number;
}

async function call(action: 'save' | 'load' | 'clear' | 'log', state?: unknown, logs?: unknown[]): Promise<any | null> {
  try {
    const authToken = await storage.get(SESSION_KEYS.AUTHTOKEN);
    const deviceId  = await storage.get(SESSION_KEYS.DEVICE_ID);
    if (!authToken || !FN_URL.startsWith('http')) return null;

    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // apikey diperlukan gateway Supabase walau fungsi memakai --no-verify-jwt
        ...(ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {}),
      },
      body: JSON.stringify({ authToken, deviceId, action, state, logs }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // best-effort
  }
}

let lastSaveAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PersistedSession | null = null;

/** Simpan state sesi (di-throttle; panggilan beruntun digabung) */
export function saveSession(state: PersistedSession, immediate = false): void {
  pendingState = state;
  const flush = () => {
    pendingTimer = null;
    lastSaveAt = Date.now();
    const s = pendingState;
    if (!s) return;
    void call('save', {
      asset:         s.config.asset,
      martingale:    s.config.martingale,
      isDemoAccount: s.config.isDemoAccount,
      currency:      s.config.currency,
      currencyIso:   s.config.currencyIso,
      stopLoss:      s.config.stopLoss,
      stopProfit:    s.config.stopProfit,
      orders:        s.orders,
      sessionPnL:    s.sessionPnL,
      botState:      s.botState,
      startedAt:     s.startedAt,
    });
  };

  if (immediate) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    flush();
    return;
  }
  if (pendingTimer) return;
  const wait = Math.max(0, SAVE_THROTTLE_MS - (Date.now() - lastSaveAt));
  pendingTimer = setTimeout(flush, wait);
}

/** Ambil sesi tersimpan; null bila tidak ada yang bisa dilanjutkan */
export async function loadSession(): Promise<PersistedSession | null> {
  const res = await call('load');
  const cfg = res?.config, st = res?.status;
  if (!cfg || !st) return null;
  if (st.bot_state !== 'RUNNING' && st.bot_state !== 'PAUSED') return null;

  const orders: ScheduledOrder[] = Array.isArray(cfg.orders) ? cfg.orders : [];
  // Hanya layak dilanjutkan bila masih ada order yang belum tuntas
  const resumable = orders.filter(o => !o.isSkipped);
  if (resumable.length === 0) return null;

  return {
    config: {
      asset:         cfg.asset,
      martingale:    cfg.martingale,
      isDemoAccount: cfg.is_demo_account ?? true,
      currency:      cfg.currency ?? '',
      currencyIso:   cfg.currency_iso ?? '',
      stopLoss:      cfg.stop_loss ?? 0,
      stopProfit:    cfg.stop_profit ?? 0,
    },
    orders,
    sessionPnL: Number(st.session_pnl ?? 0),
    botState:   st.bot_state,
    startedAt:  st.started_at ? new Date(st.started_at).getTime() : undefined,
  };
}

// ── Riwayat eksekusi ─────────────────────────────────────────────────
// Ditulis ke tabel `mode_logs` (sama dengan engine server) lewat Edge
// Function. Dikumpulkan sebentar lalu dikirim sekaligus: satu order bisa
// menghasilkan beberapa log (eksekusi → hasil) dalam waktu berdekatan.
let logQueue: any[] = [];
let logTimer: ReturnType<typeof setTimeout> | null = null;

export function appendLog(log: unknown): void {
  logQueue = [...logQueue.filter((l: any) => l.id !== (log as any).id), log];
  if (logTimer) return;
  logTimer = setTimeout(() => {
    logTimer = null;
    const batch = logQueue;
    logQueue = [];
    if (batch.length) void call('log', undefined, batch);
  }, 1500);
}

/** Kirim sisa antrean log segera (dipakai saat sesi berakhir) */
export function flushLogs(): void {
  if (logTimer) { clearTimeout(logTimer); logTimer = null; }
  const batch = logQueue;
  logQueue = [];
  if (batch.length) void call('log', undefined, batch);
}

/** Tandai sesi selesai agar tidak ditawarkan untuk dilanjutkan lagi */
export function clearSession(): void {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  pendingState = null;
  void call('clear');
}
