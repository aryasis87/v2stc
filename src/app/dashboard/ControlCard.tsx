'use client';
// ═══════════════════════════════════════════
// ControlCard.tsx — kartu kendali bot + lencana Always-Signal.
//
// Dipecah dari page.tsx. Keduanya pindah bersama karena ControlCard satu-
// satunya pemakai AlwaysSignalBadge.
//
// PENTING — nilai runtime (C, T, FMT, CURR_UNIT, MIN_AMOUNT) DIBACA DI DALAM
// BADAN KOMPONEN lewat `rt`, bukan di-destructure di tingkat modul. Kalau
// dibaca di atas, nilainya beku pada saat impor (tema gelap bawaan) dan
// komponen ini salah warna selamanya di mode terang. Lihat runtime.ts.
// ═══════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { AlertCircle, BarChart, Calendar, ChevronDown, Copy,
         PlayCircle, Radio, StopCircle, Waves, Zap } from 'lucide-react';
import { useDarkMode } from '@/lib/DarkModeContext';
import type { ScheduleStatus, ScheduleOrder, FastradeStatus, AISignalStatus,
              IndicatorStatus, MomentumStatus } from '@/lib/api';
import type { TradingMode, MartingaleConfig } from './theme';
import { Card } from './primitives';
import { rt, modeAccent } from './runtime';

export const AlwaysSignalBadge: React.FC<{
  isActive: boolean;
  step: number;
  maxSteps: number;
  totalLoss?: number;
  accent?: string;
}> = ({ isActive, step, maxSteps, totalLoss, accent = rt.C.amber }) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  if (!isActive) return null;
  const lossDisplay = totalLoss ? `  −${FMT(Math.abs(totalLoss) / 100)}` : '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', borderRadius: 99,
      background: `${accent}12`, border: `1px solid ${accent}35`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, animation: 'ping 1.4s ease-in-out infinite' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Always Signal
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: accent }}>
        K{step}/{maxSteps}
      </span>
      {lossDisplay && (
        <span style={{ fontSize: 9, color: C.coral, fontFamily: 'monospace' }}>{lossDisplay}</span>
      )}
    </div>
  );
};

export const ControlCard: React.FC<{
  mode:TradingMode;
  scheduleStatus:ScheduleStatus|null; orders:ScheduleOrder[];
  ftStatus:FastradeStatus|null;
  aiStatus:AISignalStatus|null;
  indicatorStatus:IndicatorStatus|null;
  momentumStatus:MomentumStatus|null;
  canStart:boolean; isLoading:boolean;
  profit:number;
  onStart:()=>void; onStop:()=>void; onPause:()=>void; onResume:()=>void;
  error:string|null;
  isBelowMin:boolean;
  martingale:MartingaleConfig;
}> = ({mode,scheduleStatus,orders,ftStatus,aiStatus,indicatorStatus,momentumStatus,canStart,isLoading,profit,onStart,onStop,onPause,onResume,error,isBelowMin,martingale}) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  const { isDarkMode } = useDarkMode();
  const [open,setOpen] = useState(true);
  const botState = scheduleStatus?.botState??'IDLE';
  const isSchedRunning = botState==='RUNNING', isSchedPaused = botState==='PAUSED';
  const isFtRunning = ftStatus?.isRunning??false;
  const isAIRunning = aiStatus?.botState === 'RUNNING' || (!aiStatus?.botState && aiStatus?.isActive === true);
  const isIndRunning = indicatorStatus?.isRunning??false;
  const isMomRunning = momentumStatus?.isRunning??false;
  const ac = modeAccent(mode);

  const isActive = (()=>{
    if(mode==='schedule') return isSchedRunning||isSchedPaused;
    if(mode==='fastrade'||mode==='ctc') return isFtRunning;
    if(mode==='aisignal') return isAIRunning;
    if(mode==='indicator') return isIndRunning;
    if(mode==='momentum') return isMomRunning;
    return false;
  })();

  // True jika ada mode LAIN yang berjalan saat mode ini idle — untuk disable tombol Start
  const isAnyOtherRunning = !isActive && (
    isSchedRunning || isSchedPaused || isFtRunning || isAIRunning || isIndRunning || isMomRunning
  );

  // ✅ FIX: Better "other running" label based on which mode is actually running
  const otherRunningLabel = (() => {
    if (!isAnyOtherRunning) return '';
    if (isSchedRunning || isSchedPaused) return 'Signal Mode';
    if (isFtRunning) return 'Fastrade';
    if (isAIRunning) return 'AI Signal';
    if (isIndRunning) return 'Indicator';
    if (isMomRunning) return 'Momentum';
    return '';
  })();

  // Auto-collapse when bot becomes active
  useEffect(()=>{ if(isActive) setOpen(false); },[isActive]);

  const si = isActive ? {label:T('common.active'),col:ac,pulse:true} : {label:T('common.standby'),col:C.muted,pulse:false};

  const modeIcon = {
    schedule:<Calendar style={{width:14,height:14}}/>,
    fastrade:<Zap style={{width:14,height:14}}/>,
    ctc:<Copy style={{width:14,height:14}}/>,
    aisignal:<Radio style={{width:14,height:14}}/>,
    indicator:<BarChart style={{width:14,height:14}}/>,
    momentum:<Waves style={{width:14,height:14}}/>,
  }[mode];

  const modeLabel = {schedule:'Signal Mode',fastrade:'Fastrade FTT Mode',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'}[mode];
  const modeSub = {schedule:'Eksekusi terjadwal',fastrade:'Auto per candle',ctc:'Copy the Candle · 1m',aisignal:'Terima & eksekusi sinyal',indicator:'Analisis teknikal otomatis',momentum:'Deteksi pola candle'}[mode];

  const pnlPos = profit>=0;
  const wins = ftStatus?.totalWins??aiStatus?.totalWins??indicatorStatus?.totalWins??momentumStatus?.totalWins??0;
  const losses = ftStatus?.totalLosses??aiStatus?.totalLosses??indicatorStatus?.totalLosses??momentumStatus?.totalLosses??0;
  const total = ftStatus?.totalTrades??aiStatus?.totalTrades??indicatorStatus?.totalTrades??momentumStatus?.totalTrades??0;
  const wr = total>0?Math.round((wins/total)*100):null;

  // Kotlin BotControlCard: botState = RUNNING / PAUSED / STOPPED
  const isSchedRunning2 = scheduleStatus?.botState==='RUNNING';
  const isSchedPaused2  = scheduleStatus?.botState==='PAUSED';
  const canPauseBot  = mode==='schedule' ? isSchedRunning2 : isActive;
  const canResumeBot = mode==='schedule' ? isSchedPaused2  : false;
  const canStopBot   = isActive;

  // Dynamic colors: green=running, amber=paused, red=stopped
  const stateCol = canResumeBot ? C.amber : canStopBot ? C.cyan : C.coral;
  const stateLabel = canResumeBot ? T('dashboard.botStatus.paused') : canStopBot ? T('dashboard.botStatus.running') : T('dashboard.botStatus.stopped');

  return (
    <Card>
      {/* ── Header look baru: tanpa kotak ikon & kotak chevron — bersih,
             status = dot + teks polos, chevron tunggal berputar ── */}
      <button onClick={()=>setOpen(!open)} style={{
        width:'100%',display:'flex',alignItems:'center',gap:10,
        padding:'15px 18px',background:'transparent',border:'none',
        borderBottom:open?`1px solid ${C.bdr}`:'none',cursor:'pointer',
        textAlign:'left',
      }}>
        <div style={{flex:1,minWidth:0,textAlign:'left',overflow:'hidden'}}>
          <span style={{fontSize:14,fontWeight:600,color:C.text,display:'block',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Bot Control</span>
          <span style={{fontSize:10.5,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',marginTop:2}}>{modeLabel} · {modeSub}</span>
        </div>
        {/* status: dot + teks polos */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <span style={{
            width:7,height:7,borderRadius:'50%',flexShrink:0,
            background:stateCol,
            animation:canStopBot&&!canResumeBot?'ping 1.6s ease-in-out infinite':undefined,
          }}/>
          <span style={{fontSize:11.5,fontWeight:600,color:stateCol}}>{stateLabel}</span>
        </div>
        <ChevronDown style={{
          width:16,height:16,color:C.muted,flexShrink:0,
          transform:open?'rotate(180deg)':'rotate(0deg)',
          transition:'transform 0.22s ease',
        }}/>
      </button>

      {open&&(
        <div style={{padding:'14px 18px 18px',display:'flex',flexDirection:'column',gap:12}}>

          {/* ── Ringkasan mode — strip faint (selaras strip jam & risk group) ── */}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:12,background:C.faint}}>
            <span style={{color:ac,display:'flex',alignItems:'center',flexShrink:0}}>{modeIcon}</span>
            <div style={{flex:1,minWidth:0}}>
              <span style={{fontSize:12,fontWeight:600,color:C.text,display:'block',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{modeLabel}</span>
              <span style={{fontSize:10,color:C.muted,display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{modeSub}</span>
            </div>
          </div>

          {/* ── Always Signal badge ── */}
          {(()=>{
            const schAS = mode==='schedule'&&(scheduleStatus as any)?.alwaysSignalActive;
            const ftAS  = (mode==='fastrade'||mode==='ctc')&&(ftStatus as any)?.alwaysSignalActive;
            const aiAS  = mode==='aisignal'&&aiStatus?.alwaysSignalStatus?.isActive;
            const indAS = mode==='indicator'&&(indicatorStatus as any)?.alwaysSignalActive;
            const momAS = mode==='momentum'&&(momentumStatus as any)?.alwaysSignalActive;
            const anyAS = schAS||ftAS||aiAS||indAS||momAS;
            if(!anyAS||!isActive) return null;
            const step  = (scheduleStatus as any)?.alwaysSignalStep
              ?? (ftStatus as any)?.alwaysSignalStep
              ?? aiStatus?.alwaysSignalStatus?.currentStep
              ?? (indicatorStatus as any)?.alwaysSignalStep
              ?? (momentumStatus as any)?.alwaysSignalStep ?? 1;
            const totalLoss = (scheduleStatus as any)?.alwaysSignalLossState?.totalLoss
              ?? aiStatus?.alwaysSignalStatus?.totalLoss ?? 0;
            return <AlwaysSignalBadge isActive={true} step={step} maxSteps={martingale.maxStep} totalLoss={totalLoss} accent={C.amber}/>;
          })()}

          {/* ── Error ── */}
          {error&&(
            <div style={{display:'flex',gap:8,padding:'10px 12px',borderRadius:12,background:'rgba(255,69,58,0.07)',border:'1px solid rgba(255,69,58,0.18)'}}>
              <AlertCircle style={{width:12,height:12,flexShrink:0,marginTop:1,color:C.coral}}/>
              <p style={{fontSize:11,color:C.coral}}>{error}</p>
            </div>
          )}

          {/* ── Action buttons only, no P&L ── */}
          {isActive ? (
            <div style={{display:'flex',gap:10}}>
              {/* Stop — full width, no Pause */}
              <button onClick={onStop} disabled={!canStopBot||isLoading} style={{
                flex:1,height:48,borderRadius:12,cursor:'pointer',
                border:'none',
                background:C.coral,
                color:'#fff',fontSize:13,fontWeight:600,letterSpacing:'0.01em',
                display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                boxShadow:`0 2px 10px ${C.coral}35`,
                opacity:(!canStopBot||isLoading)?0.45:1,transition:'opacity 0.2s',
              }}>
                <StopCircle style={{width:16,height:16}}/> Stop
              </button>
            </div>
          ) : (
            /* Idle — simple start button */
            <>
              <button onClick={onStart} disabled={isLoading||!canStart||isBelowMin||isAnyOtherRunning} style={{
                width:'100%',height:50,borderRadius:12,cursor:'pointer',
                border:'none',
                background:ac,
                color:'#fff',fontSize:14,fontWeight:600,letterSpacing:'0.01em',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                boxShadow:`0 2px 12px ${ac}40`,
                opacity:(isLoading||!canStart||isBelowMin||isAnyOtherRunning)?0.45:1,transition:'opacity 0.2s',
              }}>
                <PlayCircle style={{width:18,height:18}}/> Start
              </button>
              {!canStart&&!error&&!isBelowMin&&!isAnyOtherRunning&&(
                <p style={{fontSize:10,textAlign:'center',color:C.muted}}>
                  {mode==='schedule'?T('dashboard.control.startPromptSchedule'):T('dashboard.control.startPrompt')}
                </p>
              )}
              {isAnyOtherRunning&&(
                <p style={{fontSize:10.5,textAlign:'center',color:C.amber,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                  <Zap style={{width:10,height:10,flexShrink:0}}/>{otherRunningLabel} sedang berjalan. Stop bot dulu.
                </p>
              )}
              {isBelowMin&&(
                <p style={{fontSize:10,textAlign:'center',color:C.coral}}>
                  ✗ {T('dashboard.control.amountBelowMin')} {CURR_UNIT} {FMT(MIN_AMOUNT)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════
// ─────────────────────────────────────────────
// DARK MODE TOGGLE STRIP
// ─────────────────────────────────────────────
