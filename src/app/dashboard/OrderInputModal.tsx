'use client';
// ═══════════════════════════════════════════
// OrderInputModal.tsx — dialog penyusunan jadwal order.
//
// Dipecah dari page.tsx; 610 baris dan TIDAK bergantung pada satu pun
// komponen lokal halaman itu — hanya ikon dan helper pustaka. Karena itu
// dipilih lebih dulu daripada SettingsCard, yang masih menyeret empat
// komponen lain (FormulaTradingModal, MartingaleDialog, PickerModal, Toggle).
//
// PENTING — C/T/FMT/T_LANG dibaca DI DALAM badan komponen lewat `rt`;
// lihat catatan di runtime.ts.
// ═══════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Check, ChevronDown, ClipboardPaste, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/lib';
import { ui } from '@/lib/uiText';
import type { ScheduleOrder, ExecutionLog } from '@/lib/api';
import { rt } from './runtime';
import { resolvePhase } from './orderPhase';

export const OrderInputModal: React.FC<{open:boolean;onClose:()=>void;orders:ScheduleOrder[];logs:ExecutionLog[];onAdd:(s:string)=>Promise<void>;onDelete:(id:string)=>void;onClear:()=>Promise<void>;loading:boolean;isRunning?:boolean;historyOrders:ScheduleOrder[];historyIdsRef:React.MutableRefObject<Set<string>>;initialView?:'list'|'input'}> =
({open,onClose,orders,logs,onAdd,onDelete,onClear,loading,isRunning,historyOrders,historyIdsRef,initialView='list'}) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const T_LANG = rt.LANG;
  const { t } = useLanguage();
  const [input,setInput]              = useState('');
  const [clearLoading,setClearLoading] = useState(false);
  const [pasteStatus,setPasteStatus]   = useState<'idle'|'ok'|'err'>('idle');
  const [view,setView]                = useState<'list'|'input'>(initialView);
  useEffect(() => { if(open) setView(initialView); }, [open]); // eslint-disable-line
  const [historyCollapsed,setHistoryCollapsed] = useState(false); // default expanded — tampil 3 item terakhir di atas monitoring
  const scrollRef      = useRef<HTMLDivElement>(null);
  const monitoringRef  = useRef<HTMLDivElement>(null);
  const pendingRef     = useRef<HTMLDivElement>(null);

  // Auto-scroll ke Monitoring → Menunggu → atas, tiap kali modal dibuka atau kembali ke list view
  useEffect(() => {
    if (open && view === 'list') {
      const timer = setTimeout(() => {
        const container = scrollRef.current;
        if (!container) return;
        const target = monitoringRef.current ?? pendingRef.current;
        if (target) {
          container.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
        } else {
          container.scrollTop = 0;
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [open, view]);

  // ── Match log untuk order ─────────────────────────────────────────────────
  const getLog = useCallback((o: ScheduleOrder): ExecutionLog | undefined =>
    logs.find(l => l.orderId === o.id) ?? logs.find(l => l.time === o.time),
  [logs]);

  const handleClear = async () => {
    if(!window.confirm('Hapus semua signal pending?')) return;
    setClearLoading(true);
    try { await onClear(); }
    finally { setClearLoading(false); }
  };

  const handleAdd = async () => {
    if(!input.trim()) return;
    await onAdd(input);
    setInput('');
    setView('list');
  };

  // Ambil Sinyal — isi otomatis satu sinyal tiap 3 menit untuk 6 jam ke depan.
  //
  // Sinyalnya SAMA untuk semua pengguna: jamnya dipatok ke kelipatan 3 menit
  // dan arahnya diturunkan dari jam itu sendiri, bukan diacak. Jadi siapa pun
  // yang menekan tombol ini pada rentang waktu yang sama mendapat daftar identik.
  const handleGenerate = () => {
    const SLOT_MS = 3 * 60_000;
    // Mulai dari slot 3 menit berikutnya (+1 menit jeda agar tidak terlewat)
    const first = Math.ceil((Date.now() + 60_000) / SLOT_MS) * SLOT_MS;

    const lines: string[] = [];
    for (let i = 0; i < (6 * 60) / 3; i++) {
      const ms = first + i * SLOT_MS;
      const at = new Date(ms);
      const hh = String(at.getHours()).padStart(2, '0');
      const mm = String(at.getMinutes()).padStart(2, '0');
      // Arah ditentukan dari nomor slot — tetap dan berulang sama
      const slot = Math.floor(ms / SLOT_MS);
      // Math.imul dipakai karena slot × konstanta melampaui batas ketelitian
      // bilangan JavaScript — hasilnya jadi selalu genap, membuat arah 'b' terus.
      let h = slot ^ 0x9e3779b9;
      h ^= h >>> 16; h = Math.imul(h, 2246822507);
      h ^= h >>> 13; h = Math.imul(h, 3266489909);
      h = (h ^ (h >>> 16)) >>> 0;
      // Bit ke-7 dipilih karena sebarannya paling berimbang dan tidak
      // menghasilkan deretan arah sama yang panjang.
      const dir = ((h >>> 7) & 1) === 0 ? 'b' : 's';
      lines.push(`${hh}:${mm} ${dir}`);
    }
    setInput(lines.join('\n'));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setPasteStatus('err'); setTimeout(()=>setPasteStatus('idle'),1500); return; }
      setInput(prev => prev ? prev.trimEnd()+'\n'+text : text);
      setPasteStatus('ok');
      setTimeout(() => setPasteStatus('idle'), 1800);
    } catch {
      // Clipboard API ditolak (permission / browser lama) → coba fallback
      setPasteStatus('err');
      setTimeout(() => setPasteStatus('idle'), 1800);
    }
  };

  const isBusy = loading || clearLoading;

  // ── Live orders: exclude yang sudah masuk history ────────────────────────
  const liveOrders    = orders.filter(o => !historyIdsRef.current.has(o.id));
  const pendingOrders = liveOrders.filter(o => !o.isExecuted && !o.isSkipped);
  const activeOrders  = liveOrders.filter(o =>  o.isExecuted && !historyIdsRef.current.has(o.id));
  // Untuk tombol Clear Pending
  const allLiveCount  = liveOrders.length;

  if (!open) return null;

  return (
    <div style={{position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px 16px calc(56px + env(safe-area-inset-bottom, 0px) + 8px) 16px',animation:'fade-in 0.15s ease'}}>
      {/* Backdrop */}
      <div onClick={isBusy?undefined:onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',cursor:isBusy?'not-allowed':'default'}}/>

      {/* Modal card — Kotlin: fillMaxWidth(0.96f) fillMaxHeight(0.88f) */}
      <div style={{
        position:'relative',width:'100%',maxWidth:460,height:'88dvh',maxHeight:640,
        display:'flex',flexDirection:'column',
        background:C.bg,
        borderRadius:24,
        border:`1px solid ${C.bdr}`,
        boxShadow:`0 32px 80px rgba(0,0,0,${C.dark?'0.70':'0.18'}), 0 8px 24px rgba(0,0,0,${C.dark?'0.50':'0.10'})`,
        overflow:'hidden',
        animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* ── Header — vertical gradient surface→cardBackground ── */}
        <div style={{
          flexShrink:0,
          background:C.card,
          padding:'16px 24px',
          display:'flex',flexDirection:'column',gap:8,
        }}>
          {/* Date label — kecil, di atas judul */}
          <span style={{
            fontSize:10,fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',
            color:C.muted,lineHeight:1,
          }}>
            {new Date().toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}
          </span>
          {/* Row 1: title + close */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <p style={{fontSize:20,fontWeight:600,color:C.text,letterSpacing:'-0.02em',margin:0}}>
              {view==='list'?t('dashboard.schedule.title')+' Orders':t('dashboard.schedule.inputSignal')}
            </p>
            <button
              onClick={view==='input'?()=>setView('list'):onClose}
              disabled={isBusy}
              style={{
                width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background:C.card2,border:`1px solid ${C.bdr}`,
                color:C.sub,cursor:isBusy?'not-allowed':'pointer',opacity:isBusy?0.4:1,
              }}
            >
              <X style={{width:16,height:16}}/>
            </button>
          </div>

          {/* Row 2: subtitle */}
          <p style={{fontSize:13,color:C.sub,margin:0}}>
            {view==='list'
              ? T('dashboard.schedule.managing')
              : T('dashboard.schedule.inputFormat')}
          </p>

          {/* Row 2.5: Win/Loss stats — only in list view, only if there's history */}
          {view==='list' && (() => {
            const completedHistory = historyOrders.filter(o => {
              const ph = resolvePhase(o, getLog);
              return ph === 'win' || ph === 'lose';
            });
            const winCount  = completedHistory.filter(o => resolvePhase(o, getLog) === 'win').length;
            const loseCount = completedHistory.filter(o => resolvePhase(o, getLog) === 'lose').length;
            const total = winCount + loseCount;
            if (total === 0) return null;
            const winPct = Math.round((winCount / total) * 100);
            return (
              <div style={{
                display:'flex',alignItems:'center',gap:6,
                padding:'8px 12px',borderRadius:12,
                background:C.card2,border:`1px solid ${C.bdr}`,
                minWidth:0,overflow:'hidden',
              }}>
                {/* Win */}
                <div style={{display:'flex',alignItems:'center',gap:4,flex:1,minWidth:0,overflow:'hidden'}}>
                  <span style={{
                    width:6,height:6,borderRadius:'50%',flexShrink:0,
                    background:C.cyan,
                  }}/>
                  <span style={{fontSize:9,fontWeight:600,color:C.muted,letterSpacing:'0.05em',textTransform:'uppercase',flexShrink:0}}>Win</span>
                  <span style={{fontSize:'clamp(13px,3.5vw,16px)',fontWeight:700,color:C.cyan,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',lineHeight:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{winCount}</span>
                </div>
                {/* Win % badge center */}
                <div style={{
                  padding:'3px 8px',borderRadius:99,flexShrink:0,
                  background: winPct >= 50 ? `${C.cyan}14` : `${C.coral}14`,
                  border:`1px solid ${winPct >= 50 ? C.cyan : C.coral}35`,
                }}>
                  <span style={{
                    fontSize:10,fontWeight:700,letterSpacing:'0.04em',fontFamily:'inherit',fontVariantNumeric:'tabular-nums',
                    color: winPct >= 50 ? C.cyan : C.coral,
                    whiteSpace:'nowrap',
                  }}>{winPct}%</span>
                </div>
                {/* Loss */}
                <div style={{display:'flex',alignItems:'center',gap:4,flex:1,minWidth:0,justifyContent:'flex-end',overflow:'hidden'}}>
                  <span style={{fontSize:'clamp(13px,3.5vw,16px)',fontWeight:700,color:C.coral,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',lineHeight:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{loseCount}</span>
                  <span style={{fontSize:9,fontWeight:600,color:C.muted,letterSpacing:'0.05em',textTransform:'uppercase',flexShrink:0}}>Loss</span>
                  <span style={{
                    width:6,height:6,borderRadius:'50%',flexShrink:0,
                    background:C.coral,
                  }}/>
                </div>
              </div>
            );
          })()}

          {/* Row 3: action buttons (always visible in list view) */}
          {view==='list' && (
            <div style={{display:'flex',gap:8,marginTop:2}}>
              {/* Input Signal */}
              <button
                onClick={()=>setView('input')}
                disabled={isRunning}
                style={{
                  flex:1,height:36,display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                  borderRadius:12,cursor:isRunning?'not-allowed':'pointer',
                  background:`${C.cyan}1a`,border:`1px solid ${C.cyan}4d`,color:C.cyan,
                  fontSize:12,fontWeight:500,
                  opacity:isRunning?0.35:1,
                }}
              >
                <Plus style={{width:15,height:15}}/>{t('dashboard.schedule.inputSignal')}
              </button>
              {/* Clear Pending */}
              <button
                onClick={handleClear}
                disabled={isBusy||pendingOrders.length===0}
                style={{
                  flex:1,height:36,display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                  borderRadius:12,cursor:(isBusy||pendingOrders.length===0)?'not-allowed':'pointer',
                  background:`${C.coral}1a`,border:`1px solid ${C.coral}33`,color:C.coral,
                  fontSize:12,fontWeight:500,
                  opacity:(isBusy||pendingOrders.length===0)?0.35:1,
                }}
              >
                {clearLoading
                  ? <RefreshCw style={{width:13,height:13,animation:'spin 0.7s linear infinite'}}/>
                  : <Trash2 style={{width:14,height:14}}/>
                }
                {t('dashboard.schedule.clearPending')}
              </button>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div ref={scrollRef} style={{flex:1,overflowY:'auto',background:C.bg,padding:'4px 20px 16px',WebkitOverflowScrolling:'touch' as any}}>

          {/* INPUT VIEW */}
          {view==='input' && (
            <div style={{display:'flex',flexDirection:'column',gap:12,paddingTop:12}}>
              <div style={{padding:'8px 12px',borderRadius:10,background:`${C.cyan}08`,border:`1px solid ${C.cyan}20`}}>
                <p style={{fontSize:11,color:C.muted,margin:0,lineHeight:1.6}}>
                  Contoh: <span style={{color:C.cyan,fontWeight:600}}>09:30 call</span> · <span style={{color:C.coral}}>14:15 put</span> · <span style={{color:C.cyan,fontWeight:600}}>09.30 B</span> · <span style={{color:C.coral}}>14.15 S</span>
                </p>
              </div>
              <div style={{position:'relative'}}>
                <textarea
                  className="ds-input"
                  autoFocus
                  value={input}
                  onChange={e=>setInput(e.target.value)}
                  placeholder={"09:00 B\n09.30 S\n10:00 B\n14:00 S"}
                  rows={9}
                  style={{resize:'vertical', paddingRight: 48}}
                />
                {/* Paste button — pojok kanan atas textarea */}
                <button
                  type="button"
                  onClick={handlePaste}
                  title="Paste dari clipboard"
                  style={{
                    position:'absolute',top:8,right:8,
                    width:32,height:32,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    borderRadius:8,
                    background: pasteStatus==='ok'
                      ? `${C.cyan}22`
                      : pasteStatus==='err'
                      ? `${C.coral}18`
                      : C.card2,
                    border: `1px solid ${
                      pasteStatus==='ok' ? `${C.cyan}55`
                      : pasteStatus==='err' ? `${C.coral}44`
                      : C.bdr
                    }`,
                    color: pasteStatus==='ok'
                      ? C.cyan
                      : pasteStatus==='err'
                      ? C.coral
                      : C.sub,
                    cursor:'pointer',
                    transition:'all 0.2s',
                    flexShrink:0,
                  }}
                >
                  {pasteStatus==='ok'
                    ? <Check style={{width:14,height:14}}/>
                    : pasteStatus==='err'
                    ? <X style={{width:14,height:14}}/>
                    : <ClipboardPaste style={{width:14,height:14}}/>
                  }
                </button>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isBusy}
                style={{
                  height:40,display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                  borderRadius:12,fontSize:12.5,fontWeight:600,
                  background:C.card2,border:`1px dashed ${C.bdr}`,color:C.sub,
                  cursor:isBusy?'not-allowed':'pointer',opacity:isBusy?0.5:1,
                }}
              >
                {ui(T_LANG, 'fetchSignals')}
              </button>
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={handleAdd}
                  disabled={!input.trim()||isBusy}
                  style={{
                    flex:1,height:44,display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                    borderRadius:12,fontSize:13,fontWeight:600,
                    background:input.trim()?`${C.cyan}20`:C.card2,
                    border:`1px solid ${input.trim()?`${C.cyan}50`:C.bdr}`,
                    color:input.trim()?C.cyan:C.muted,
                    cursor:(!input.trim()||isBusy)?'not-allowed':'pointer',
                    opacity:isBusy?0.5:1,
                  }}
                >
                  {loading?<RefreshCw style={{width:13,height:13,animation:'spin 0.7s linear infinite'}}/>:<Plus style={{width:14,height:14}}/>}
                  {loading?T('common.processing'):T('common.add')}
                </button>
                <button
                  onClick={()=>setView('list')}
                  disabled={isBusy}
                  style={{
                    padding:'0 20px',height:44,borderRadius:12,fontSize:13,fontWeight:500,
                    background:C.card2,border:`1px solid ${C.bdr}`,
                    color:C.sub,cursor:isBusy?'not-allowed':'pointer',
                  }}
                >{T('common.cancel')}</button>
              </div>
            </div>
          )}

          {/* LIST VIEW */}
          {view==='list' && (
            <>
              {historyOrders.length === 0 && liveOrders.length === 0 ? (
                /* Empty state */
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:24,paddingTop:40}}>
                  <div style={{
                    width:88,height:88,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                    background:`${C.card2}66`,border:`1px solid ${C.bdr}`,
                  }}>
                    <Calendar style={{width:36,height:36,color:C.muted}}/>
                  </div>
                  <div style={{textAlign:'center',display:'flex',flexDirection:'column',gap:12}}>
                    <p style={{fontSize:20,fontWeight:600,color:C.text,letterSpacing:'-0.01em',margin:0}}>{T('dashboard.schedule.emptyTitle')}</p>
                    <p style={{fontSize:15,color:C.sub,margin:0,lineHeight:1.55}}>
                      {T('dashboard.schedule.emptyDesc')}
                    </p>
                  </div>
                  <button
                    onClick={()=>setView('input')}
                    style={{
                      display:'flex',alignItems:'center',gap:7,padding:'12px 28px',borderRadius:14,
                      background:`${C.cyan}18`,border:`1px solid ${C.cyan}45`,
                      color:C.cyan,fontSize:13,fontWeight:600,cursor:'pointer',
                    }}
                  >
                    <Plus style={{width:15,height:15}}/>{t('dashboard.schedule.inputSignal')}
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,paddingTop:8}}>

                  {/* ── HISTORY SECTION (selesai: WIN/LOSE/SKIP) ── */}
                  {historyOrders.filter(o => resolvePhase(o, getLog) !== 'skipped').length > 0 && (
                    <div style={{marginBottom:4}}>
                      {/* Section header — tappable untuk collapse/expand */}
                      <button
                        onClick={() => setHistoryCollapsed(v => !v)}
                        style={{
                          width:'100%',display:'flex',alignItems:'center',gap:8,marginBottom:historyCollapsed?6:6,
                          background:'transparent',border:'none',cursor:'pointer',padding:'2px 0',
                        }}
                      >
                        <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.muted}}>History</span>
                        <div style={{flex:1,height:1,background:`linear-gradient(to right,${C.bdr},transparent)`}}/>
                        <span style={{fontSize:9,color:C.muted,background:C.card2,border:`1px solid ${C.bdr}`,borderRadius:99,padding:'1px 6px'}}>{historyOrders.filter(o => resolvePhase(o, getLog) !== 'skipped').length}</span>
                        <span style={{
                          display:'flex',alignItems:'center',justifyContent:'center',
                          width:18,height:18,borderRadius:5,
                          background:`${C.muted}14`,border:`1px solid ${C.bdr}`,
                          color:C.muted,flexShrink:0,transition:'transform 0.2s',
                          transform: historyCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}>
                          <ChevronDown style={{width:10,height:10}}/>
                        </span>
                      </button>
                      {(()=>{
                        const allHistory = historyOrders
                          .filter(o => resolvePhase(o, getLog) !== 'skipped')
                          .sort((a, b) => a.time.localeCompare(b.time));
                        // historyCollapsed=false (default) → tampilkan 3 item terbaru
                        // historyCollapsed=true  (diklik)  → tampilkan SEMUA item
                        const SHOW_LAST = 3;
                        const showAll = historyCollapsed;
                        const visibleHistory = showAll ? allHistory : allHistory.slice(-SHOW_LAST);
                        const hiddenCount    = showAll ? 0 : Math.max(0, allHistory.length - SHOW_LAST);
                        return (
                          <>
                            {/* Indikator item tersembunyi — muncul saat compact */}
                            {hiddenCount > 0 && (
                              <button
                                onClick={() => setHistoryCollapsed(true)}
                                style={{
                                  width:'100%',display:'flex',alignItems:'center',gap:6,padding:'4px 10px',marginBottom:4,
                                  borderRadius:8,background:`${C.muted}08`,border:`1px dashed ${C.bdr}`,
                                  cursor:'pointer',
                                }}
                              >
                                <span style={{fontSize:9,color:C.muted,fontStyle:'italic'}}>
                                  {T('dashboard.schedule.hiddenSignals').replace('{n}', String(hiddenCount))}
                                </span>
                              </button>
                            )}
                            {visibleHistory.map((o, idx) => {
                              const ph   = resolvePhase(o, getLog);
                              const log  = getLog(o);
                              const isBuy = o.trend === 'call';
                              const ms   = o.martingaleState;
                              const profit = log?.profit;
                              const phaseColor = ph==='win'?C.cyan : ph==='lose'?C.coral : ph==='skipped'?C.amber : C.muted;
                              const phaseBg   = ph==='win'?`${C.cyan}08` : ph==='lose'?`${C.coral}08` : `${C.amber}06`;
                              const phaseBdr  = ph==='win'?`${C.cyan}25` : ph==='lose'?`${C.coral}25` : `${C.amber}20`;
                              const phaseLabel = ph==='win'?'WIN' : ph==='lose'?'LOSE' : ph==='skipped'?'SKIP' : ph==='martingale'?`K${ms?.currentStep??1}` : 'DONE';
                              const globalIdx  = showAll ? idx + 1 : hiddenCount + idx + 1;
                              return (
                                <div key={`hist-${o.id}`} style={{
                                  display:'flex',alignItems:'center',gap:8,padding:'8px 10px',
                                  borderRadius:10,background:phaseBg,border:`1px solid ${phaseBdr}`,
                                  marginBottom:4,opacity:0.85,
                                }}>
                                  <div style={{width:20,height:20,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:`${phaseColor}12`,border:`1px solid ${phaseColor}28`}}>
                                    <span style={{fontSize:9,fontWeight:700,color:phaseColor}}>{globalIdx}</span>
                                  </div>
                                  <span style={{fontSize:13,fontWeight:600,color:C.sub,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{o.time}</span>
                                  <span style={{fontSize:9.5,fontWeight:700,padding:'1px 5px',borderRadius:4,background:isBuy?`${C.cyan}15`:`${C.coral}15`,color:isBuy?C.cyan:C.coral,border:`1px solid ${isBuy?C.cyan:C.coral}25`,flexShrink:0}}>{isBuy?'BUY':'SELL'}</span>
                                  {ms && (ms.currentStep??0) > 0 && (
                                    <span style={{fontSize:9.5,color:C.amber,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',flexShrink:0}}>K{ms.currentStep}</span>
                                  )}
                                  <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                                    {profit != null && (
                                      <span style={{fontSize:10,fontWeight:700,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',color:profit>=0?C.cyan:C.coral}}>
                                        {profit>=0?'+':''}{FMT(profit/100)}
                                      </span>
                                    )}
                                    <span style={{fontSize:9.5,fontWeight:700,padding:'1px 6px',borderRadius:99,background:`${phaseColor}15`,border:`1px solid ${phaseColor}28`,color:phaseColor}}>{phaseLabel}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── ACTIVE / MONITORING ORDERS ── */}
                  {activeOrders.length > 0 && (
                    <div ref={monitoringRef} style={{marginBottom:4}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                        <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.sky}}>{T('dashboard.aiSignal.status')}</span>
                        <div style={{flex:1,height:1,background:`linear-gradient(to right,${C.sky}40,transparent)`}}/>
                        <span style={{
                          fontSize:9,color:C.sky,background:`${C.sky}12`,border:`1px solid ${C.sky}30`,
                          borderRadius:99,padding:'1px 6px',
                          animation:'ping 1.6s ease-in-out infinite',
                        }}>{activeOrders.length}</span>
                      </div>
                      {activeOrders.map(o => {
                        const phase  = resolvePhase(o, getLog);
                        const isBuy  = o.trend === 'call';
                        const ms     = o.martingaleState;
                        const log    = getLog(o);
                        const profit = log?.profit;
                        const phaseColor = phase==='martingale'?C.amber : C.sky;
                        const phaseBg    = phase==='martingale'?`${C.amber}0c` : `${C.sky}0c`;
                        const phaseBdr   = phase==='martingale'?`${C.amber}30` : `${C.sky}25`;
                        const phaseIcon  = phase==='martingale'?`K${ms?.currentStep??1}` : '◎';
                        const phaseLabel = phase==='martingale'
                          ? `K${ms?.currentStep??1}`
                          : T('dashboard.aiSignal.status');
                        return (
                          <div key={o.id} style={{
                            display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                            borderRadius:12,background:phaseBg,border:`1px solid ${phaseBdr}`,
                            marginBottom:4,
                          }}>
                            <span style={{
                              fontSize:phase==='martingale'?9:14,fontWeight:700,color:phaseColor,
                              width:22,textAlign:'center',lineHeight:1,flexShrink:0,
                              animation:'pulse 1.2s ease-in-out infinite',
                            }}>{phaseIcon}</span>
                            <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{o.time}</span>
                            <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:6,background:isBuy?`${C.cyan}18`:`${C.coral}18`,color:isBuy?C.cyan:C.coral,border:`1px solid ${isBuy?C.cyan:C.coral}35`,flexShrink:0}}>{isBuy?'BUY':'SELL'}</span>
                            <span style={{
                              fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:99,
                              background:`${phaseColor}18`,border:`1px solid ${phaseColor}35`,color:phaseColor,
                              flexShrink:0,animation:'pulse 1.4s ease-in-out infinite',
                            }}>{phaseLabel}</span>
                            {profit != null ? (
                              <span style={{fontSize:10,fontWeight:700,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',marginLeft:'auto',flexShrink:0,color:profit>=0?C.cyan:C.coral}}>
                                {profit>=0?'+':''}{FMT(profit/100)}
                              </span>
                            ) : (
                              <span style={{marginLeft:'auto',display:'flex',gap:3,alignItems:'center'}}>
                                {[0,1,2].map(i=>(
                                  <span key={i} style={{width:4,height:4,borderRadius:'50%',background:phaseColor,opacity:0.4,animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── PENDING ORDERS ── */}
                  {pendingOrders.length > 0 && (
                    <div ref={pendingRef}>
                      {(activeOrders.length > 0 || historyOrders.length > 0) && (
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.muted}}>{T('common.standby')}</span>
                          <div style={{flex:1,height:1,background:`linear-gradient(to right,${C.bdr},transparent)`}}/>
                          <span style={{fontSize:9,color:C.muted,background:C.card2,border:`1px solid ${C.bdr}`,borderRadius:99,padding:'1px 6px'}}>{pendingOrders.length}</span>
                        </div>
                      )}
                      {pendingOrders.map((o,i)=>{
                        const isBuy = o.trend==='call';
                        return (
                          <div key={o.id} style={{
                            display:'flex',alignItems:'center',padding:'10px 12px',gap:10,
                            borderRadius:12,background:C.card2,
                            border:`1px solid ${C.cyan}45`,
                            marginBottom:4,
                          }}>
                            <div style={{
                              width:22,height:22,borderRadius:'50%',flexShrink:0,
                              display:'flex',alignItems:'center',justifyContent:'center',
                              background:`${C.cyan}12`,border:`1px solid ${C.cyan}25`,
                            }}>
                              <span style={{fontSize:10,fontWeight:600,color:C.cyan}}>{i+1}</span>
                            </div>
                            <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{o.time}</span>
                            <span style={{
                              fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:6,
                              background:isBuy?`${C.cyan}22`:`${C.coral}22`,
                              color:isBuy?C.cyan:C.coral,
                              border:`1px solid ${isBuy?C.cyan:C.coral}35`,
                            }}>{isBuy?'BUY':'SELL'}</span>
                            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                              {i === 0 && <span style={{fontSize:10,color:C.muted}}>Menunggu…</span>}
                              <button onClick={()=>onDelete(o.id)} disabled={isBusy} style={{
                                width:28,height:28,borderRadius:'50%',flexShrink:0,
                                display:'flex',alignItems:'center',justifyContent:'center',
                                background:`${C.coral}18`,border:'none',cursor:isBusy?'not-allowed':'pointer',color:C.coral,
                                opacity:isBusy?0.4:1,
                              }}>
                                <Trash2 style={{width:12,height:12}}/>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Semua pending sudah selesai tapi masih ada history */}
                  {pendingOrders.length === 0 && activeOrders.length === 0 && historyOrders.length > 0 && (
                    <div style={{padding:'12px',borderRadius:10,background:`${C.cyan}08`,border:`1px solid ${C.cyan}18`,textAlign:'center'}}>
                      <p style={{fontSize:12,color:C.muted,margin:0}}>{T('dashboard.schedule.allDone')}</p>
                    </div>
                  )}

                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};


// SCHEDULE PANEL
// ═══════════════════════════════════════════
