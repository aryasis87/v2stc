'use client';
// ═══════════════════════════════════════════
// AISignalPanel.tsx — panel mode AI Signal.
//
// Dipecah dari page.tsx. AIPanelWrap, Dot, dan Row didefinisikan DI DALAM
// komponen ini, jadi ikut pindah dengan sendirinya.
//
// PENTING — C/T/FMT dibaca DI DALAM badan komponen lewat `rt`, bukan
// di-destructure di tingkat modul; lihat catatan di runtime.ts.
// ═══════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import type { AISignalStatus, AISignalOrder } from '@/lib/api';
import { rt } from './runtime';
import { Card, Sk, StatusChip } from './primitives';

export const AISignalPanel: React.FC<{
  status: AISignalStatus | null;
  pendingOrders: AISignalOrder[];
  isLoading: boolean;
  fillHeight?: boolean;
  inModal?: boolean;
}> = ({ status, pendingOrders, isLoading, inModal }) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const isOn   = status?.botState === 'RUNNING' || (!status?.botState && status?.isActive === true);
  const pnl    = status?.sessionPnL ?? status?.stats?.sessionPnL ?? 0;
  const wins   = status?.totalWins  ?? status?.stats?.wins   ?? 0;
  const losses = status?.totalLosses ?? status?.stats?.losses ?? 0;
  const total  = status?.totalTrades ?? status?.stats?.totalTrades ?? 0;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : null;
  const pnlCol = pnl >= 0 ? C.sky : C.coral;
  const alwaysSignal = status?.alwaysSignalStatus;
  const monCount = status?.monitoringStatus?.active_monitoring_count ?? 0;
  const wsOk = status?.wsConnected ?? false;
 
  // v4: fitur Telegram dihapus (VPS ditinggalkan) — status listener kini
  // mengikuti status sesi saja.
  const listenerActive = isOn;
 
  // Live countdown — update setiap detik
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isOn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOn]);
 
  const formatCountdown = (executionTime: number): string => {
    const ms = executionTime - now;
    if (ms <= 0) return T('dashboard.phaseMap.executing');
    const sec = Math.ceil(ms / 1000);
    if (sec < 60) return `${sec}d`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}d`;
  };
 
  const formatExecTime = (executionTime: number): string => {
    return new Date(executionTime).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
  };
 
  const Row: React.FC<{ label: string; right: React.ReactNode; border?: boolean }> = ({
    label, right, border = true,
  }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 12px', borderBottom: border ? `1px solid ${C.bdr}` : 'none', minWidth: 0,
    }}>
      <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600 }}>{right}</span>
    </div>
  );
 
  // ── Status dot indicator ──
  const Dot: React.FC<{ on: boolean; col: string; pulse?: boolean }> = ({ on, col, pulse }) => (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: on ? col : C.muted,
      
      animation: on && pulse ? 'pulse 1.6s ease-in-out infinite' : 'none',
    }} />
  );
 
  const AIPanelWrap: React.FC<{children: React.ReactNode}> = ({children}) =>
    inModal ? <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
            : <Card style={{ display: 'flex', flexDirection: 'column' }}>{children}</Card>;

  return (
    <AIPanelWrap>
 
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 14px', borderBottom: `1px solid ${isOn ? 'rgba(52,211,153,0.20)' : C.bdr}`, flexShrink: 0,
      }}>
        {isOn ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Radio style={{ width: 14, height: 14, color: C.sky }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>AI Signal</span>
            </div>
            <StatusChip col={C.sky} label={T('common.active')} pulse />
          </>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:C.muted,opacity:0.4}}/>
            <span style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.04em'}}>{T('common.standby')}</span>
          </div>
        )}
      </div>
 
      {/* ── Loading skeleton ── */}
      {isLoading ? (
        <div style={{ padding: '8px 0' }}>
          {[70, 50, 60].map((w, i) => (
            <div key={i} style={{ padding: '8px 12px' }}>
              <Sk w={`${w}%`} h={14} />
            </div>
          ))}
        </div>
 
      ) : !isOn ? (
        /* ── Idle state ── */
        <div style={{
          padding: '20px 14px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${C.sky}08`, border: `1px solid ${C.sky}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Radio style={{ width: 22, height: 22, color: C.muted, opacity: 0.4 }} />
          </div>
          <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
            {T('dashboard.aiSignal.notActive')}<br />
            <span style={{ fontSize: 10, color: `${C.muted}88` }}>
              {T('dashboard.aiSignal.startPrompt')}
            </span>
          </p>
        </div>
 
      ) : (
        /* ── Active state ── */
        <div style={{ overflowY: 'auto', flex: inModal ? 1 : undefined, minHeight: 0 }}>
 
          {/* ── Infra Status Row ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px 5px',
            borderBottom: `1px solid ${C.bdr}`,
            background: `${C.sky}04`,
          }}>
            {/* WebSocket */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
              <Dot on={wsOk} col={C.cyan} pulse={wsOk} />
              <span style={{ fontSize: 9, fontWeight: 600, color: wsOk ? C.cyan : C.muted, letterSpacing: '0.06em' }}>WS</span>
            </div>
            {/* Telegram Listener */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' }}>
              <Dot on={listenerActive} col={C.sky} pulse={listenerActive} />
              <span style={{ fontSize: 9, fontWeight: 600, color: listenerActive ? C.sky : C.muted, letterSpacing: '0.06em' }}>Listener</span>
            </div>
            {/* Monitor count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
              <Dot on={monCount > 0} col={C.amber} pulse={monCount > 0} />
              <span style={{ fontSize: 9, fontWeight: 600, color: monCount > 0 ? C.amber : C.muted, letterSpacing: '0.06em' }}>
                Monitor {monCount > 0 ? `(${monCount})` : ''}
              </span>
            </div>
          </div>
 
          {/* ── P&L + W/L + WR ── */}
          <Row
            label={T('dashboard.fastTrade.sessionPnl')}
            right={
              <span style={{ color: pnlCol, fontFamily: 'monospace', fontWeight: 700 }}>
                {pnl >= 0 ? '+' : '-'}{FMT(Math.abs(pnl) / 100)}
              </span>
            }
          />
          <Row
            label={T('dashboard.fastTrade.wlTotal')}
            right={
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                <span style={{ color: C.cyan, fontWeight: 700 }}>{wins}</span>
                <span style={{ color: C.muted }}> / </span>
                <span style={{ color: C.coral, fontWeight: 700 }}>{losses}</span>
                <span style={{ color: C.muted }}> / </span>
                <span style={{ color: C.sub }}>{total}</span>
              </span>
            }
          />
 
          {/* ── Martingale AlwaysSignal Status ── */}
          {alwaysSignal?.isActive && (
            <div style={{
              margin: '0 10px 0',
              padding: '6px 10px',
              borderRadius: 8,
              background: `${C.amber}0a`,
              border: `1px solid ${C.amber}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.amber, animation: 'pulse 1.4s ease-in-out infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.amber }}>Martingale</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Step dots */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {[...Array(alwaysSignal.maxSteps ?? 3)].map((_, i) => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: i < (alwaysSignal.currentStep ?? 0) ? C.amber : `${C.amber}28`,
                      
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>
                  {alwaysSignal.currentStep}/{alwaysSignal.maxSteps}
                </span>
              </div>
            </div>
          )}
 
          {/* ── Current Status / Last Signal ── */}
          <div style={{ padding: '0 10px', marginTop: 6 }}>
            <div style={{
              padding: '7px 10px', borderRadius: 8,
              background: `${C.sky}07`, border: `1px solid ${C.sky}18`,
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: C.sky, flexShrink: 0, marginTop: 4,
                animation: 'pulse 2s ease-in-out infinite',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `${C.sky}80`, display: 'block', marginBottom: 2 }}>
                  {T('dashboard.aiSignal.status')}
                </span>
                <span style={{ fontSize: 10, color: C.sky, lineHeight: 1.4, display: 'block' }}>
                  {alwaysSignal?.isActive
                    ? alwaysSignal.status || `${T('dashboard.aiSignal.martingaleStep')} ${alwaysSignal.currentStep}/${alwaysSignal.maxSteps}`
                    : pendingOrders.length > 0
                    ? `${pendingOrders.length} ${T('dashboard.aiSignal.pendingSignals')}`
                    : T('dashboard.aiSignal.configuring')}
                </span>
              </div>
            </div>
          </div>
 
          {/* ── Pending Orders ── */}
          {pendingOrders.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                padding: '5px 12px 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderTop: `1px solid ${C.bdr}`, borderBottom: `1px solid ${C.bdr}`,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${C.sky}60` }}>
                  {T('dashboard.aiSignal.queue')}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.sky, background: `${C.sky}12`, padding: '1px 6px', borderRadius: 99, border: `1px solid ${C.sky}25` }}>
                  {pendingOrders.length}
                </span>
              </div>
 
              {pendingOrders.slice(0, 5).map((o, i, arr) => {
                const col     = o.trend === 'call' ? C.cyan : C.coral;
                const colBg   = o.trend === 'call' ? `${C.cyan}12` : `${C.coral}12`;
                const secLeft = Math.max(0, Math.ceil((o.executionTime - now) / 1000));
                const urgent  = secLeft < 30 && secLeft > 0;
                const isMart  = o.martingaleStep > 0;
 
                return (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.bdr}` : 'none',
                    background: urgent ? `${col}05` : 'transparent',
                    transition: 'background 0.3s',
                  }}>
                    {/* Trend badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                      color: col, background: colBg, flexShrink: 0, letterSpacing: '0.04em',
                    }}>
                      {o.trend === 'call' ? '↑ CALL' : '↓ PUT'}
                    </span>
 
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, color: C.sub, fontFamily: 'monospace', fontWeight: 600 }}>
                          {formatExecTime(o.executionTime)}
                        </span>
                        {isMart && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 4, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}25` }}>
                            M{o.martingaleStep}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {o.assetRic} · {FMT(o.amount / 100)}
                      </span>
                    </div>
 
                    {/* Countdown */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
                      color: urgent ? col : C.muted,
                      animation: urgent ? 'pulse 0.8s ease-in-out infinite' : 'none',
                    }}>
                      {formatCountdown(o.executionTime)}
                    </span>
                  </div>
                );
              })}
 
              {pendingOrders.length > 5 && (
                <div style={{ padding: '5px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 9, color: C.muted }}>+{pendingOrders.length - 5} {T('dashboard.aiSignal.moreItems')}</span>
                </div>
              )}
            </div>
          )}
 
          {/* ── Empty pending ── */}
          {pendingOrders.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 5, padding: '12px 14px 8px',
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[...Array(3)].map((_, i) => (
                  <span key={i} style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: C.sky, opacity: 0.25 + i * 0.2,
                    animation: `pulse ${1.4 + i * 0.2}s ease-in-out infinite`,
                    animationDelay: `${i * 0.3}s`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
 
    </AIPanelWrap>
  );
};
// ═══════════════════════════════════════════
