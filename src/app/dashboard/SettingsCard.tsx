'use client';
// ═══════════════════════════════════════════
// SettingsCard.tsx — kartu pengaturan trading + dua dialognya.
//
// FormulaTradingModal dan MartingaleDialog ikut ke sini, bukan ke
// primitives.tsx: masing-masing hanya dipakai SettingsCard. Toggle dan
// PickerModal justru naik ke primitives karena page.tsx juga memakainya.
//
// PENTING — nilai runtime dibaca DI DALAM badan tiap komponen lewat `rt`;
// lihat catatan di runtime.ts.
// ═══════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, ArrowRight, BarChart, Check, ChevronDown, ChevronUp,
         Clock, Copy, Radio, RefreshCw, Settings, X, BarChart2, Info,
         Zap, Wallet, Waves, TrendingUp, TrendingDown } from 'lucide-react';
import { ui } from '@/lib/uiText';
import { useDarkMode } from '@/lib/DarkModeContext';
import { computeBestConfig, type BestConfigResult } from '@/lib/bestConfig';
import type { StockityAsset, IndicatorType } from '@/lib/api';
import { rt, modeAccent } from './runtime';
import { FT_TF, type TradingMode, type MartingaleConfig, type FastTradeTimeframe } from './theme';
import { Card, Toggle, PickerModal, AlwaysSignalBadge, FL, type PickerOpt } from './primitives';

export const FormulaTradingModal: React.FC<{
  open: boolean; onClose: () => void; minAmount: number; currUnit: string;
  onApply: (r: BestConfigResult) => void;
}> = ({ open, onClose, minAmount, currUnit, onApply }) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  const QUICK_AMOUNTS_DYN = rt.QUICK_AMOUNTS;
  const [balStr, setBalStr] = useState('');
  const [applied, setApplied] = useState(false);
  useEffect(() => { if (open) { setApplied(false); } }, [open]);
  if (!open) return null;

  const balance = Number(String(balStr).replace(/[^\d]/g, '')) || 0;
  const min = Math.max(minAmount || 0, 1);
  const valid = balance >= min;
  const cfg = valid ? computeBestConfig({ balance, minAmount: min }) : null;
  const fmt = (n: number) => `${currUnit} ${Math.round(n).toLocaleString('id-ID')}`;
  const riskColor = !cfg ? C.muted : cfg.riskLevel === 'aman' ? C.cyan : cfg.riskLevel === 'sedang' ? C.amber : C.coral;
  const riskLabel = !cfg ? '' : cfg.riskLevel === 'aman' ? 'AMAN' : cfg.riskLevel === 'sedang' ? 'SEDANG' : 'AGRESIF';
  const riskIdx = !cfg ? -1 : cfg.riskLevel === 'aman' ? 2 : cfg.riskLevel === 'sedang' ? 1 : 0;
  const mono: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };

  // baris rincian bergaris (struk)
  const specRow = (label: string, value: string, accent?: string, last?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderBottom: last ? 'none' : `1px dashed ${C.bdr}` }}>
      <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${C.bdr}`, transform: 'translateY(-3px)', opacity: 0.5 }} />
      <span style={{ fontSize: 14, fontWeight: 800, color: accent ?? C.text, whiteSpace: 'nowrap', ...mono }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fade-in 0.15s ease' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', background: C.bg, borderRadius: 16, border: `1px solid ${C.bdr}`, overflowX: 'hidden', animation: 'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)' }}>
        {/* pita aksen atas */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${C.cyan}, ${C.sky}, ${C.cyan})` }} />
        <div style={{ padding: '18px 20px 22px' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: C.cyan }}>FORMULA · TRADING</span>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}><X style={{ width: 17, height: 17, color: C.muted }} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <BarChart2 style={{ width: 20, height: 20, color: C.cyan }} />
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.3px' }}>Best Config Otomatis</p>
          </div>

          {/* input saldo — gaya garis bawah */}
          <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4, letterSpacing: '0.04em' }}>SALDO KAMU</label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `2px solid ${valid ? C.cyan : C.bdr}`, paddingBottom: 6, transition: 'border-color 0.2s' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.sub }}>{currUnit}</span>
            <input
              inputMode="numeric" autoFocus placeholder="0"
              value={balance ? balance.toLocaleString('id-ID') : ''}
              onChange={(e) => setBalStr(e.target.value.replace(/[^\d]/g, ''))}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 26, fontWeight: 800, color: C.text, width: '100%', ...mono }}
            />
          </div>

          {!valid && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 14, lineHeight: 1.6, display: 'flex', gap: 8 }}>
              <Info style={{ width: 14, height: 14, color: C.muted, flexShrink: 0, marginTop: 2 }} />
              Masukkan saldo — sistem menghitung nominal, martingale, dan batas risiko terbaik.
            </p>
          )}

          {cfg && (
            <>
              {/* meter risiko tersegmen */}
              <div style={{ marginTop: 18, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>TINGKAT RISIKO</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: riskColor, letterSpacing: '0.08em' }}>{riskLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {['agresif', 'sedang', 'aman'].map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= riskIdx ? riskColor : C.bdr, opacity: i <= riskIdx ? 1 : 0.5, transition: 'background 0.3s' }} />
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: C.sub, marginTop: 9 }}>Saldo tahan <b style={{ color: riskColor, ...mono }}>{cfg.survivableCycles}×</b> kekalahan beruntun satu siklus penuh.</p>

              {cfg.belowRecommended && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: `${C.coral}12`, border: `1px solid ${C.coral}30` }}>
                  <AlertCircle style={{ width: 14, height: 14, color: C.coral, flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>Di bawah saldo saran (min <b style={{ color: C.text }}>{fmt(cfg.recommendedMinBalance)}</b>). Setting dibuat lebih defensif.</p>
                </div>
              )}

              {/* struk rincian */}
              <div style={{ marginTop: 16, padding: '2px 14px', borderRadius: 12, background: C.card, border: `1px solid ${C.bdr}` }}>
                {specRow('Nominal Awal', fmt(cfg.baseAmount), C.cyan)}
                {specRow('Martingale', `${cfg.maxStep} step`)}
                {specRow('Multiplier', `${cfg.multiplier}×`)}
                {specRow('Stop Loss', fmt(cfg.stopLoss), C.coral)}
                {specRow('Stop Profit', fmt(cfg.stopProfit), C.cyan)}
                {specRow('Durasi', '1 menit', undefined, true)}
              </div>

              {/* tangga step vertikal */}
              <p style={{ fontSize: 10.5, color: C.muted, letterSpacing: '0.04em', margin: '16px 0 8px' }}>TANGGA MARTINGALE</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cfg.perStep.map((v, i) => {
                  const w = Math.min((v / cfg.perStep[cfg.perStep.length - 1]) * 100, 100);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, width: 26, ...mono }}>#{i + 1}</span>
                      <div style={{ flex: 1, height: 22, borderRadius: 6, background: C.card, border: `1px solid ${C.bdr}`, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, width: `${w}%`, background: `${C.cyan}22`, borderRight: `2px solid ${C.cyan}` }} />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: C.text, ...mono }}>{fmt(v)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 10, ...mono }}>Σ 1 siklus penuh: <b style={{ color: C.sub }}>{fmt(cfg.cycleRisk)}</b> · {Math.round(cfg.cycleRisk / balance * 100)}% saldo</p>

              {/* apply */}
              <button
                onClick={() => { onApply(cfg); setApplied(true); setTimeout(onClose, 550); }}
                style={{ width: '100%', marginTop: 18, padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14.5, fontWeight: 800, letterSpacing: '0.02em', color: '#04210b', background: applied ? C.cyan : `linear-gradient(135deg, ${C.cyan}, ${C.sky})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {applied ? <><Check style={{ width: 18, height: 18 }} />DITERAPKAN</> : <>TERAPKAN KE PENGATURAN<ArrowRight style={{ width: 16, height: 16 }} /></>}
              </button>
              <p style={{ fontSize: 10.5, color: C.muted, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>Kalkulasi risiko otomatis — bukan jaminan profit. Trading tetap berisiko.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const MartingaleDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  martingale: MartingaleConfig;
  onMartingaleChange: (c: MartingaleConfig) => void;
  mode: TradingMode;
}> = ({ open, onClose, martingale, onMartingaleChange, mode }) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  const QUICK_AMOUNTS_DYN = rt.QUICK_AMOUNTS;
  const [customInput, setCustomInput] = useState('');
  const [multInput, setMultInput] = useState(String(martingale.multiplier));
  const [multType, setMultType] = useState<'fixed'|'pct'>('fixed');
  const set = (k: keyof MartingaleConfig, v: any) => onMartingaleChange({ ...martingale, [k]: v });

  const fixedPresets = [1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
  const pctPresets   = [50, 100, 150, 200, 300, 500];
  const currentPresets = multType === 'fixed' ? fixedPresets : pctPresets;
  const multVal = parseFloat(multInput) || martingale.multiplier;
  const multErr = multType === 'fixed'
    ? (multVal < 1 ? 'Min 1.0×' : multVal > 50 ? 'Maks 50×' : null)
    : (multVal < 1 ? 'Min 1%'   : multVal > 5000 ? 'Maks 5000%' : null);

  if (!open) return null;
  return (
    <div style={{ position:'fixed',inset:0,zIndex:110,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 16px',animation:'fade-in 0.15s ease' }}>
      <div onClick={onClose} style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.60)',backdropFilter:'blur(14px)' }}/>
      <div style={{
        position:'relative',width:'100%',maxWidth:420,maxHeight:'88dvh',
        background:C.card, borderRadius:20,border:`1px solid ${C.bdr}`,
        boxShadow:`0 20px 60px rgba(0,0,0,${C.dark?'0.55':'0.12'})`,
        overflow:'hidden',display:'flex',flexDirection:'column',
        animation:'slide-up 0.22s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.bdr}` }}>
          <div>
            <p style={{ fontSize:17,fontWeight:700,color:C.text,letterSpacing:'-0.02em',margin:0 }}>{T('dashboard.martingale.title')}</p>
            <p style={{ fontSize:12,color:C.muted,margin:'2px 0 0' }}>{T('dashboard.martingale.subtitle')}</p>
          </div>
          <button onClick={onClose} style={{ width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer' }}>
            <X style={{ width:15,height:15,color:C.sub }}/>
          </button>
        </div>
        {/* Scrollable body */}
        <div style={{ overflowY:'auto',padding:'0 20px 24px',flex:1 }}>
          {/* Maks. Kompensasi */}
          <div style={{ paddingTop:18 }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
              <p style={{ fontSize:13,fontWeight:600,color:C.text,margin:0 }}>{T('dashboard.martingale.maxCompensation')}</p>
              {martingale.alwaysSignal && (
                <span style={{ fontSize:10,fontWeight:600,color:C.amber,background:`${C.amber}14`,borderRadius:6,padding:'2px 8px',border:`1px solid ${C.amber}28` }}>∞ override</span>
              )}
            </div>
            <div style={{ display:'flex',gap:6 }}>
              {[1,2,3,4,5].map(k => {
                const sel = martingale.maxStep === k;
                return (
                  <button key={k} onClick={() => set('maxStep', k)} style={{
                    flex:1,height:38,borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:sel?700:400,
                    background:sel?`${C.cyan}20`:C.card2,border:`1px solid ${sel?`${C.cyan}70`:C.bdr}`,
                    color:sel?C.cyan:C.muted,transition:'all 0.15s',
                  }}>K{k}</button>
                );
              })}
            </div>
            <div style={{ display:'flex',gap:8,marginTop:8,alignItems:'center' }}>
              <input className="ds-input" type="number" placeholder={martingale.maxStep>5?`K${martingale.maxStep} terpilih`:'Custom steps (1-10)'}
                value={customInput} onChange={e=>{ if(e.target.value.length<=2) setCustomInput(e.target.value.replace(/\D/g,'')); }}
                style={{ flex:1,borderColor:customInput&&(parseInt(customInput)<1||parseInt(customInput)>10)?C.coral:undefined }}/>
              <button onClick={()=>{ const v=parseInt(customInput); if(v>=1&&v<=10){set('maxStep',v);setCustomInput('');} }}
                disabled={!customInput||parseInt(customInput)<1||parseInt(customInput)>10}
                style={{ height:44,padding:'0 18px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,background:C.cyan,color:'#fff',border:'none',opacity:(!customInput||parseInt(customInput)<1||parseInt(customInput)>10)?0.4:1 }}>Set</button>
            </div>
            {customInput&&(parseInt(customInput)<1||parseInt(customInput)>10)&&(
              <p style={{ fontSize:10,color:C.coral,marginTop:4 }}>{T('dashboard.martingale.rangeHint')}</p>
            )}
          </div>
          <div style={{ height:1,background:C.bdr,margin:'18px 0' }}/>
          {/* Perkalian Kompensasi */}
          <div>
            <p style={{ fontSize:13,fontWeight:600,color:C.text,margin:'0 0 10px' }}>{T('dashboard.martingale.compensationMultiplier')}</p>
            <div style={{ display:'flex',gap:3,padding:3,borderRadius:10,background:C.card2,marginBottom:10 }}>
              {(['fixed','pct'] as const).map(t => {
                const sel = multType === t;
                return (
                  <button key={t} onClick={() => setMultType(t)} style={{
                    flex:1,height:34,borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:sel?700:400,
                    background:sel?`${C.cyan}20`:'transparent',border:sel?`1px solid ${C.cyan}60`:'1px solid transparent',
                    color:sel?C.cyan:C.muted,transition:'all 0.15s',
                  }}>{t==='fixed'?'Fixed (×)':'Persen (%)'}</button>
                );
              })}
            </div>
            <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:10 }}>
              {currentPresets.map(v => {
                const sel = Math.abs(martingale.multiplier - v) < 0.001;
                return (
                  <button key={v} onClick={() => { set('multiplier',v); setMultInput(String(v)); }} style={{
                    height:32,padding:'0 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:sel?700:400,
                    background:sel?`${C.cyan}20`:C.card2,border:`1px solid ${sel?`${C.cyan}60`:C.bdr}`,
                    color:sel?C.cyan:C.muted,
                  }}>{multType==='fixed'?`${v}×`:`${v}%`}</button>
                );
              })}
            </div>
            <div style={{ position:'relative' }}>
              <input className="ds-input" type="number" value={multInput}
                onChange={e=>{ setMultInput(e.target.value); const v=parseFloat(e.target.value); if(v>=1&&v<=(multType==='fixed'?50:5000)) set('multiplier',v); }}
                style={{ paddingRight:36,borderColor:multErr?C.coral:undefined }}/>
              <span style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:C.sub,pointerEvents:'none' }}>{multType==='fixed'?'×':'%'}</span>
            </div>
            {multErr&&<p style={{ fontSize:10,color:C.coral,marginTop:4 }}>{multErr}</p>}
          </div>
          {/* Always Signal */}
          {mode !== 'ctc' && (
            <>
              <div style={{ height:1,background:C.bdr,margin:'18px 0' }}/>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <div>
                  <p style={{ fontSize:13,fontWeight:600,color:C.text,margin:'0 0 2px' }}>{T('dashboard.martingale.alwaysSignal')}</p>
                  <p style={{ fontSize:11,color:C.muted,margin:0 }}>{martingale.alwaysSignal?T('dashboard.martingale.alwaysSignalOn'):T('dashboard.martingale.alwaysSignalOff')}</p>
                </div>
                <Toggle checked={martingale.alwaysSignal??false} onChange={v=>set('alwaysSignal',v)} accent={C.amber}/>
              </div>
              {martingale.alwaysSignal&&(
                <div style={{ marginTop:10,padding:'10px 12px',borderRadius:10,background:`${C.amber}09`,border:`1px solid ${C.amber}28` }}>
                  <p style={{ fontSize:11,color:C.amber,margin:0,lineHeight:1.5 }}>⚠ Martingale terus jalan di sinyal berikutnya hingga WIN. Max step diabaikan.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// SETTINGS CARD
// ═══════════════════════════════════════════

export const SettingsCard: React.FC<{
  mode:TradingMode; assets:StockityAsset[];
  assetRic:string; onAssetChange:(a:StockityAsset)=>void;
  isDemo:boolean; onDemoChange:(v:boolean)=>void;
  duration:number; onDurationChange:(v:number)=>void;
  amount:number; onAmountChange:(v:number)=>void;
  martingale:MartingaleConfig; onMartingaleChange:(c:MartingaleConfig)=>void;
  ftTf:FastTradeTimeframe; onFtTfChange:(v:FastTradeTimeframe)=>void;
  blitz5s:boolean; onBlitz5sChange:(v:boolean)=>void;
  reversalSteps:number[]; onReversalStepsChange:(v:number[])=>void; frExpiry?:number|null;
  stopLoss:number; onSlChange:(v:number)=>void;
  stopProfit:number; onSpChange:(v:number)=>void;
  indicatorType:IndicatorType; onIndicatorTypeChange:(v:IndicatorType)=>void;
  indicatorPeriod:number; onIndicatorPeriodChange:(v:number)=>void;
  indicatorSensitivity:number; onSensitivityChange:(v:number)=>void;
  rsiOverbought:number; onOverboughtChange:(v:number)=>void;
  rsiOversold:number; onOversoldChange:(v:number)=>void;
  momentumPatterns:{candleSabit:boolean;dojiTerjepit:boolean;dojiPembatalan:boolean;bbSarBreak:boolean};
  onMomentumPatternsChange:(p:any)=>void;
  disabled?:boolean;
}> = ({mode,assets,assetRic,onAssetChange,isDemo,onDemoChange,duration,onDurationChange,amount,onAmountChange,martingale,onMartingaleChange,ftTf,onFtTfChange,blitz5s,onBlitz5sChange,reversalSteps,onReversalStepsChange,frExpiry,stopLoss,onSlChange,stopProfit,onSpChange,indicatorType,onIndicatorTypeChange,indicatorPeriod,onIndicatorPeriodChange,indicatorSensitivity,onSensitivityChange,rsiOverbought,onOverboughtChange,rsiOversold,onOversoldChange,momentumPatterns,onMomentumPatternsChange,disabled}) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  const QUICK_AMOUNTS_DYN = rt.QUICK_AMOUNTS;
  const { isDarkMode } = useDarkMode();
  const [open,setOpen] = useState(!disabled);
  const [pickerOpen,setPickerOpen] = useState<string|null>(null);
  const [amtDrop,setAmtDrop] = useState(false);
  const [showMartingaleDialog, setShowMartingaleDialog] = useState(false);
  // Stop Loss / Stop Profit toggle state — mirrors Kotlin StopLossProfitCard
  const [slEnabled, setSlEnabled] = useState(() => stopLoss > 0);
  const [spEnabled, setSpEnabled] = useState(() => stopProfit > 0);
  const [showSlInput, setShowSlInput] = useState(false);
  const [showSpInput, setShowSpInput] = useState(false);
  const [slInputValue, setSlInputValue] = useState(() => stopLoss > 0 ? String(stopLoss) : '');
  const [spInputValue, setSpInputValue] = useState(() => stopProfit > 0 ? String(stopProfit) : '');
  // Sync when external stopLoss/stopProfit changes (e.g. reset)
  useEffect(() => {
    setSlEnabled(stopLoss > 0);
    setSlInputValue(stopLoss > 0 ? String(stopLoss) : '');
  }, [stopLoss]);
  useEffect(() => {
    setSpEnabled(stopProfit > 0);
    setSpInputValue(stopProfit > 0 ? String(stopProfit) : '');
  }, [stopProfit]);
  // Parse flexible input: "100K" → 100000, "1.5M" → 1500000, "500000" → 500000
  const parseFlexibleInput = (input: string): number | null => {
    const s = input.trim().toUpperCase();
    if (!s) return null;
    try {
      if (s.endsWith('B')) return (parseFloat(s.slice(0,-1)) * 1_000_000_000) || null;
      if (s.endsWith('M')) return (parseFloat(s.slice(0,-1)) * 1_000_000) || null;
      if (s.endsWith('K')) return (parseFloat(s.slice(0,-1)) * 1_000) || null;
      const n = parseFloat(s.replace(/[^0-9.]/g,''));
      return isNaN(n) ? null : n;
    } catch { return null; }
  };
  // Local string state for amount input — avoids iOS number-input editing issues
  const [amtStr, setAmtStr] = useState(amount > 0 ? String(amount) : '');
  const [amtFocused, setAmtFocused] = useState(false);
  // Sync amtStr when amount changes externally (e.g. quick-pick)
  useEffect(()=>{ setAmtStr(amount > 0 ? String(amount) : ''); },[amount]);
  // Local string state for period input — avoids number-input editing issues on mobile
  const [periodStr, setPeriodStr] = useState(String(indicatorPeriod));
  const [periodFocused, setPeriodFocused] = useState(false);
  // Sync periodStr when indicatorPeriod changes externally
  useEffect(()=>{ setPeriodStr(String(indicatorPeriod)); },[indicatorPeriod]);
  // Local string state for RSI overbought / oversold
  const [obStr, setObStr] = useState(String(rsiOverbought));
  const [obFocused, setObFocused] = useState(false);
  const [osStr, setOsStr] = useState(String(rsiOversold));
  const [osFocused, setOsFocused] = useState(false);
  useEffect(()=>{ setObStr(String(rsiOverbought)); },[rsiOverbought]);
  useEffect(()=>{ setOsStr(String(rsiOversold)); },[rsiOversold]);
  // SELALU formatted dengan titik ribuan — live saat mengetik, nilai internal tetap integer
  const amtDisplay = amtStr && parseInt(amtStr,10) > 0
    ? FMT(parseInt(amtStr,10))
    : '';
  useEffect(()=>{ if(disabled) setOpen(false); },[disabled]);
  const set = (k:keyof MartingaleConfig,v:any) => onMartingaleChange({...martingale,[k]:v});
  const assetOpts: PickerOpt[] = assets.map(a=>({value:a.ric,label:a.name,sub:`${a.ric} · ${a.profitRate}%`,icon:a.iconUrl}));
  const durationOpts = [{value:'60',label:'1 Menit'},{value:'120',label:'2 Menit'},{value:'300',label:'5 Menit'},{value:'600',label:'10 Menit'},{value:'900',label:'15 Menit'},{value:'1800',label:'30 Menit'}];
  const acOpts: PickerOpt[] = [{value:'demo',label:'Demo',sub:'Virtual · tidak pakai dana nyata'},{value:'real',label:'Real',sub:'Menggunakan saldo sesungguhnya'}];
  const ac = modeAccent(mode);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const isBelowMin = amount > 0 && amount < MIN_AMOUNT;
  const isNewMode = mode==='aisignal'||mode==='indicator'||mode==='momentum';
  // Nama mode dibuat RINGKAS agar muat satu baris pada label pengaturan
  // (dulu mis. "Fastrade FTT Mode" terlalu panjang & terpotong tak rapi).
  const modeLabel = mode==='aisignal'?'AI Signal':mode==='indicator'?'Indicator':mode==='momentum'?'Momentum':mode==='ctc'?'Fastrade CTC':mode==='fastrade'?'Fastrade FTT':'Signal';
  const acctCol = isDemo ? C.amber : C.cyan;

  return (
    <>
      <MartingaleDialog open={showMartingaleDialog} onClose={()=>setShowMartingaleDialog(false)} martingale={martingale} onMartingaleChange={onMartingaleChange} mode={mode}/>
      <PickerModal open={pickerOpen==='actype'} onClose={()=>setPickerOpen(null)} title={T('dashboard.settings.accountType')} options={acOpts} value={isDemo?'demo':'real'} onSelect={v=>onDemoChange(v==='demo')} isDark={isDarkMode}/>
      <FormulaTradingModal
        open={formulaOpen} onClose={()=>setFormulaOpen(false)}
        minAmount={MIN_AMOUNT} currUnit={CURR_UNIT}
        onApply={(r)=>{
          onAmountChange(r.baseAmount);
          onMartingaleChange({ enabled:true, maxStep:r.maxStep, multiplier:r.multiplier, alwaysSignal: martingale.alwaysSignal ?? false });
          onSlChange(r.stopLoss);
          onSpChange(r.stopProfit);
          onDurationChange(r.duration);
        }}
      />
      <PickerModal open={pickerOpen==='duration'} onClose={()=>setPickerOpen(null)} title={T('dashboard.settings.orderDuration')} options={durationOpts} value={String(duration)} onSelect={v=>onDurationChange(+v)} isDark={isDarkMode}/>
      <PickerModal open={pickerOpen==='ftTf'} onClose={()=>setPickerOpen(null)} title={T('dashboard.settings.fastradeTimeframe')} options={FT_TF.map(t=>({value:t.value,label:t.label}))} value={ftTf} onSelect={v=>onFtTfChange(v as FastTradeTimeframe)} isDark={isDarkMode}/>

      <Card style={{ opacity:disabled?0.65:1, overflow: 'visible' }}>
        {/* Header */}
        <button onClick={()=>setOpen(!open)} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',background:'transparent',border:'none',borderBottom:open?`1px solid ${C.bdr}`:'none',cursor:'pointer',textAlign:'left' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <Settings style={{ width:14,height:14,color:C.muted,opacity:0.6,flexShrink:0 }}/>
            <div>
              <span style={{ fontSize:14,fontWeight:600,color:C.text,display:'block',lineHeight:1.2 }}>{T('dashboard.settings.title')}</span>
              {disabled
                ? <span style={{ fontSize:11,color:C.amber,fontWeight:600,display:'flex',alignItems:'center',gap:4 }}><Zap style={{width:10,height:10}}/>{T('dashboard.settings.botActive')}</span>
                : <span style={{ fontSize:11,color:C.muted,display:'block' }}>{T('dashboard.settings.subtitle')}</span>
              }
            </div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <span style={{ fontSize:10,padding:'2px 8px',borderRadius:99,background:isDarkMode?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)',color:C.muted,border:`1px solid ${C.bdr}`,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:150,display:'inline-block',verticalAlign:'middle' }}>{modeLabel}</span>
            {open?<ChevronUp style={{ width:14,height:14,color:C.muted }}/>:<ChevronDown style={{ width:14,height:14,color:C.muted }}/>}
          </div>
        </button>

        {open&&(
          <div style={{ padding:'18px 18px 20px',pointerEvents:disabled?'none':undefined,display:'flex',flexDirection:'column',gap:18 }}>

            {/* Formula Trading — pintasan saran setting terbaik (gaya STC: garis + label mono) */}
            <button
              disabled={disabled} onClick={()=>setFormulaOpen(true)}
              style={{ width:'100%',display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:12,cursor:disabled?'not-allowed':'pointer',textAlign:'left',
                background:C.card, border:`1px solid ${C.cyan}40`, position:'relative', overflow:'hidden' }}
            >
              <span style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:`linear-gradient(180deg, ${C.cyan}, ${C.sky})` }}/>
              <BarChart2 style={{ width:19,height:19,color:C.cyan,flexShrink:0,marginLeft:4 }}/>
              <span style={{ flex:1 }}>
                <span style={{ display:'block',fontSize:9.5,fontWeight:800,letterSpacing:'0.16em',color:C.cyan }}>FORMULA · TRADING</span>
                <span style={{ display:'block',fontSize:13,fontWeight:700,color:C.text,marginTop:1 }}>Best Config dari saldomu</span>
              </span>
              <ArrowRight style={{ width:16,height:16,color:C.cyan,flexShrink:0 }}/>
            </button>

            {/* Konfigurasi Akun */}
            <div>
              <p style={{ fontSize:12,fontWeight:600,color:C.text,margin:'0 0 10px' }}>{T('dashboard.settings.accountConfig')}</p>
              <div style={{ display:'flex',gap:8 }}>
                {/* Akun Real/Demo */}
                <button disabled={disabled} onClick={()=>setPickerOpen('actype')} style={{
                  flex:'0 0 auto',height:44,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:'0 10px',
                  background:`${acctCol}14`,border:`1px solid ${acctCol}45`,transition:'all 0.15s',minWidth:0,
                }}>
                  <Wallet style={{ width:14,height:14,color:acctCol,flexShrink:0 }}/>
                  <span style={{ fontSize:11,fontWeight:700,color:C.text,whiteSpace:'nowrap' }}>{isDemo?T('common.demo'):T('common.real')}</span>
                  <ChevronDown style={{ width:12,height:12,color:C.muted,flexShrink:0 }}/>
                </button>
                {/* Durasi / Timeframe */}
                <div style={{ flex:'0 0 auto',minWidth:0 }}>
                  {!isNewMode&&(mode==='fastrade'
                    ?<button disabled={disabled} onClick={()=>setPickerOpen('ftTf')} style={{ width:'100%',height:44,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:'0 10px',background:C.card2,border:`1px solid ${C.bdr}`,minWidth:0 }}>
                       <Clock style={{ width:13,height:13,color:C.muted,flexShrink:0 }}/><span style={{ fontSize:11,fontWeight:600,color:C.text,flex:1,textAlign:'left',whiteSpace:'nowrap' }}>{FT_TF.find(t=>t.value===ftTf)?.label||''}</span><ChevronDown style={{ width:12,height:12,color:C.muted,flexShrink:0 }}/>
                     </button>
                    :mode==='ctc'
                    ?<div style={{ height:44,borderRadius:12,display:'flex',alignItems:'center',gap:6,padding:'0 10px',background:C.faint,border:`1px solid ${C.bdr}`,minWidth:0 }}>
                       <Copy style={{ width:13,height:13,color:C.violet }}/><span style={{ fontSize:11,color:C.violet,whiteSpace:'nowrap' }}>1 Menit</span>
                     </div>
                    :<button disabled={disabled} onClick={()=>setPickerOpen('duration')} style={{ width:'100%',height:44,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:'0 10px',background:C.card2,border:`1px solid ${C.bdr}`,minWidth:0 }}>
                       <Clock style={{ width:13,height:13,color:C.muted,flexShrink:0 }}/><span style={{ fontSize:11,fontWeight:600,color:C.text,flex:1,textAlign:'left',whiteSpace:'nowrap' }}>{durationOpts.find(d=>d.value===String(duration))?.label||''}</span><ChevronDown style={{ width:12,height:12,color:C.muted,flexShrink:0 }}/>
                     </button>
                  )}
                  {isNewMode&&<div style={{ height:44,borderRadius:12,display:'flex',alignItems:'center',padding:'0 10px',background:C.card2,border:`1px solid ${C.bdr}` }}><span style={{ fontSize:11,color:C.muted }}>{T('dashboard.settings.automatic')}</span></div>}
                </div>

                {/* Mata Uang */}
                <div style={{ flex:1,height:44,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,padding:'0 10px',background:C.card2,border:`1px solid ${C.bdr}`,minWidth:0 }}>
                  <span style={{ fontSize:11,fontWeight:600,color:C.sub,flexShrink:0 }}>{CURR_UNIT}</span>
                  <span style={{ fontSize:9,fontWeight:600,color:C.cyan,background:`${C.cyan}12`,borderRadius:4,padding:'1px 5px',flexShrink:0,whiteSpace:'nowrap' }}>AUTO</span>
                </div>
              </div>
              {mode==='ctc'&&<div style={{ marginTop:8,padding:'9px 12px',borderRadius:10,background:'rgba(191,90,242,0.07)',border:'1px solid rgba(191,90,242,0.2)',display:'flex',gap:8 }}><Copy style={{ width:13,height:13,color:C.violet,flexShrink:0,marginTop:1 }}/><p style={{ fontSize:10,color:C.muted,lineHeight:1.5 }}>{T('dashboard.settings.ctcInfo')}</p></div>}
              {/* 5st — eksekusi order BLITZ 5 detik (khusus FTT) */}
              {mode==='fastrade'&&(
                <button disabled={disabled} onClick={()=>onBlitz5sChange(!blitz5s)} style={{ marginTop:8,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',borderRadius:10,background:C.card2,border:`1px solid ${blitz5s?C.cyan:C.bdr}`,cursor:disabled?'not-allowed':'pointer' }}>
                  <span style={{ display:'flex',flexDirection:'column',gap:2,textAlign:'left',minWidth:0 }}>
                    <span style={{ fontSize:12,fontWeight:600,color:C.text }}>5st · Eksekusi 5 detik</span>
                    <span style={{ fontSize:10,color:C.muted,lineHeight:1.4 }}>Order blitz keluar hasil dalam 5 detik. Sinyal tetap baca 2 candle (FTT).</span>
                  </span>
                  <div style={{ width:38,height:22,borderRadius:99,flexShrink:0,background:blitz5s?C.cyan:C.bdr,position:'relative',transition:'background 0.15s' }}>
                    <div style={{ position:'absolute',top:2,left:blitz5s?18:2,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left 0.15s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                  </div>
                </button>
              )}
            </div>

            {/* Jumlah Trade */}
            {mode!=='indicator'&&(
              <div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                  <p style={{ fontSize:12,fontWeight:600,color:C.text,margin:0 }}>{T('dashboard.settings.tradeAmount')}</p>
                  <span style={{ fontSize:10,color:C.muted }}>{T('dashboard.settings.minAmount')}: {CURR_UNIT} {FMT(MIN_AMOUNT)}</span>
                </div>
                <div style={{ display:'flex',gap:8 }}>
                  <div style={{ flex:1,position:'relative' }}>
                    <span style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      className="ds-input"
                      value={amtDisplay}
                      onChange={e=>{
                        // Strip titik ribuan + non-digit agar nilai internal tetap angka murni
                        const raw = e.target.value.replace(/\./g,'').replace(/[^0-9]/g,'');
                        setAmtStr(raw);
                        onAmountChange(raw ? parseInt(raw, 10) : 0);
                      }}
                      onFocus={e=>{ setAmtFocused(true); setTimeout(()=>e.target.select(),0); }}
                      onBlur={()=>{ setAmtFocused(false); if(!amtStr||amtStr==='0') setAmtStr(''); }}
                      onKeyDown={e=>{ if(e.key==='Enter'||(e as any).keyCode===13) e.currentTarget.blur(); }}
                      disabled={disabled}
                      placeholder={FMT(MIN_AMOUNT)}
                      style={{ paddingLeft:30, paddingRight:44, borderColor:isBelowMin?C.coral:undefined, fontSize:16 }}
                    />
                    {/* Tombol Enter — tutup keyboard */}
                    <button
                      type="button"
                      onMouseDown={e=>{ e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement|null)?.blur(); }}
                      disabled={disabled}
                      style={{
                        position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
                        width:30,height:26,borderRadius:7,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        background:amtFocused?`${C.cyan}22`:C.card2,
                        border:`1px solid ${amtFocused?`${C.cyan}55`:C.bdr}`,
                        color:amtFocused?C.cyan:C.muted,
                        cursor:'pointer',transition:'all 0.15s',flexShrink:0,
                        fontSize:18,fontWeight:700,lineHeight:1,
                      }}
                      title="Konfirmasi"
                    >↵</button>
                  </div>
                  <div style={{ position:'relative',flexShrink:0 }}>
                    <button type="button" disabled={disabled} onClick={()=>setAmtDrop(v=>!v)} style={{ height:'100%',padding:'0 12px',display:'flex',alignItems:'center',gap:5,borderRadius:12,fontSize:12,fontWeight:700,background:amtDrop?`${C.cyan}14`:C.card2,border:`1px solid ${amtDrop?`${C.cyan}45`:C.bdr}`,color:amtDrop?C.cyan:C.text,cursor:disabled?'not-allowed':'pointer' }}>
                      <Zap style={{ width:13,height:13 }}/> Quick
                    </button>
                    {amtDrop&&!disabled&&(
                      <>
                        <div style={{ position:'fixed',inset:0,zIndex:55 }} onClick={()=>setAmtDrop(false)}/>
                        {/* Dropdown look baru: kartu melayang berpadding, baris rounded, check icon */}
                        <div style={{ position:'absolute',right:0,marginTop:6,zIndex:60,minWidth:176,borderRadius:14,overflow:'hidden',padding:5,background:isDarkMode?'#24262B':'#fff',border:`1px solid ${C.bdr}`,boxShadow:isDarkMode?'0 16px 48px -12px rgba(0,0,0,0.65)':'0 16px 48px -16px rgba(15,23,42,0.30)',animation:'slide-up 0.15s ease' }}>
                          {QUICK_AMOUNTS_DYN.map(a=>{
                            const isAct=amount===a;
                            return (
                              <button key={a} type="button" className={isAct?undefined:'dsh-row'} onClick={()=>{onAmountChange(a);setAmtDrop(false);}} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'9px 11px',fontSize:12.5,background:isAct?`${C.cyan}12`:'transparent',border:'none',borderRadius:9,color:isAct?C.cyan:C.sub,fontWeight:isAct?650:450,cursor:'pointer' }}>
                                <span className="dsh-num">{a>=1000000?`${CURR_UNIT} ${a/1000000}M`:`${CURR_UNIT} ${(a/1000).toFixed(a%1000===0?0:1)}K`}</span>
                                {isAct&&<Check style={{ width:14,height:14,color:C.cyan,flexShrink:0 }}/>}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {isBelowMin&&<p style={{ fontSize:10.5,color:C.coral,marginTop:4,display:'flex',alignItems:'center',gap:4 }}><AlertCircle style={{width:11,height:11,flexShrink:0}}/>{T('dashboard.settings.amountBelowMin')}</p>}
              </div>
            )}

            {/* Indicator specific */}
            {mode==='indicator'&&(
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                <div><FL>{T('dashboard.indicator.indicatorType')}</FL>
                  <div style={{ display:'flex',gap:6 }}>
                    {(['EMA','RSI','MACD','BBANDS','STOCH'] as IndicatorType[]).map(t=>(
                      <button key={t} disabled={disabled} onClick={()=>onIndicatorTypeChange(t)} style={{ flex:1,padding:'6px 0',borderRadius:8,fontSize:10,fontWeight:700,cursor:'pointer',background:indicatorType===t?`${C.orange}18`:C.card2,border:`1px solid ${indicatorType===t?`${C.orange}50`:C.bdr}`,color:indicatorType===t?C.orange:C.muted }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                  <div><FL>Period</FL>
                    <div style={{ position:'relative' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className="ds-input"
                        value={periodFocused ? periodStr : indicatorPeriod}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setPeriodStr(raw);
                          const n = parseInt(raw, 10);
                          if (!isNaN(n) && n >= 2 && n <= 200) onIndicatorPeriodChange(n);
                        }}
                        onFocus={e => { setPeriodFocused(true); setPeriodStr(String(indicatorPeriod)); setTimeout(()=>e.target.select(),0); }}
                        onBlur={() => {
                          setPeriodFocused(false);
                          const n = parseInt(periodStr, 10);
                          if (isNaN(n) || n < 2) { onIndicatorPeriodChange(2); setPeriodStr('2'); }
                          else if (n > 200) { onIndicatorPeriodChange(200); setPeriodStr('200'); }
                          else { onIndicatorPeriodChange(n); }
                        }}
                        onKeyDown={e => { if(e.key==='Enter'||(e as any).keyCode===13) e.currentTarget.blur(); }}
                        disabled={disabled}
                        placeholder="14"
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement|null)?.blur(); }}
                        disabled={disabled}
                        style={{
                          position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
                          width:28, height:24, borderRadius:6,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          background: periodFocused ? `${C.orange}22` : C.card2,
                          border: `1px solid ${periodFocused ? `${C.orange}55` : C.bdr}`,
                          color: periodFocused ? C.orange : C.muted,
                          cursor:'pointer', transition:'all 0.15s', flexShrink:0,
                          fontSize:16, fontWeight:700, lineHeight:1,
                        }}
                        title="Konfirmasi"
                      >↵</button>
                    </div>
                  </div>
                  <div><FL>{T('dashboard.indicator.sensitivity')}</FL>
                    <div style={{ display:'flex',gap:4 }}>
                      {[0.1,0.5,1,5,10].map(s=>(<button key={s} disabled={disabled} onClick={()=>onSensitivityChange(s)} style={{ flex:1,padding:'6px 0',borderRadius:6,fontSize:10,fontWeight:700,cursor:'pointer',background:indicatorSensitivity===s?`${C.orange}18`:C.card2,border:`1px solid ${indicatorSensitivity===s?`${C.orange}55`:C.bdr}`,color:indicatorSensitivity===s?C.orange:C.muted }}>{s}</button>))}
                    </div>
                  </div>
                </div>
                {indicatorType==='RSI'&&(
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                    <div><FL>Overbought</FL>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                        className="ds-input"
                        value={obFocused ? obStr : rsiOverbought}
                        onChange={e => { const raw=e.target.value.replace(/[^0-9]/g,''); setObStr(raw); const n=parseInt(raw,10); if(!isNaN(n)&&n>=50&&n<=100) onOverboughtChange(n); }}
                        onFocus={e => { setObFocused(true); setObStr(String(rsiOverbought)); setTimeout(()=>e.target.select(),0); }}
                        onBlur={() => { setObFocused(false); const n=parseInt(obStr,10); if(isNaN(n)||n<50){onOverboughtChange(50);setObStr('50');}else if(n>100){onOverboughtChange(100);setObStr('100');}else onOverboughtChange(n); }}
                        onKeyDown={e=>{ if(e.key==='Enter') e.currentTarget.blur(); }}
                        disabled={disabled} placeholder="70"
                      />
                    </div>
                    <div><FL>Oversold</FL>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                        className="ds-input"
                        value={osFocused ? osStr : rsiOversold}
                        onChange={e => { const raw=e.target.value.replace(/[^0-9]/g,''); setOsStr(raw); const n=parseInt(raw,10); if(!isNaN(n)&&n>=0&&n<=50) onOversoldChange(n); }}
                        onFocus={e => { setOsFocused(true); setOsStr(String(rsiOversold)); setTimeout(()=>e.target.select(),0); }}
                        onBlur={() => { setOsFocused(false); const n=parseInt(osStr,10); if(isNaN(n)||n<0){onOversoldChange(0);setOsStr('0');}else if(n>50){onOversoldChange(50);setOsStr('50');}else onOversoldChange(n); }}
                        onKeyDown={e=>{ if(e.key==='Enter') e.currentTarget.blur(); }}
                        disabled={disabled} placeholder="30"
                      />
                    </div>
                  </div>
                )}
                <div><FL>{T('dashboard.indicator.amountPerOrder')}</FL>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      className="ds-input"
                      value={amtDisplay}
                      onChange={e=>{
                        // Strip titik ribuan + non-digit agar nilai internal tetap angka murni
                        const raw = e.target.value.replace(/\./g,'').replace(/[^0-9]/g,'');
                        setAmtStr(raw);
                        onAmountChange(raw ? parseInt(raw, 10) : 0);
                      }}
                      onFocus={e=>{ setAmtFocused(true); setTimeout(()=>e.target.select(),0); }}
                      onBlur={()=>{ setAmtFocused(false); if(!amtStr||amtStr==='0') setAmtStr(''); }}
                      onKeyDown={e=>{ if(e.key==='Enter'||(e as any).keyCode===13) e.currentTarget.blur(); }}
                      disabled={disabled}
                      placeholder={FMT(MIN_AMOUNT)}
                      style={{ paddingLeft:30, paddingRight:44, fontSize:16 }}
                    />
                    {/* Tombol Enter — tutup keyboard */}
                    <button
                      type="button"
                      onMouseDown={e=>{ e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement|null)?.blur(); }}
                      disabled={disabled}
                      style={{
                        position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
                        width:30,height:26,borderRadius:7,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        background:amtFocused?`${C.cyan}22`:C.card2,
                        border:`1px solid ${amtFocused?`${C.cyan}55`:C.bdr}`,
                        color:amtFocused?C.cyan:C.muted,
                        cursor:'pointer',transition:'all 0.15s',flexShrink:0,
                        fontSize:18,fontWeight:700,lineHeight:1,
                      }}
                      title="Konfirmasi"
                    >↵</button>
                  </div>
                </div>
              </div>
            )}

            {/* Momentum patterns — all auto-enabled, settings hidden */}
            {mode==='momentum'&&(
              <div style={{ padding:'10px 12px',borderRadius:10,background:`${C.pink}07`,border:`1px solid ${C.pink}20`,display:'flex',gap:8 }}>
                <Waves style={{ width:14,height:14,color:C.pink,flexShrink:0,marginTop:2 }}/>
                <div>
                  <p style={{ fontSize:11,fontWeight:600,color:C.pink,marginBottom:4 }}>Active pola candle</p>
                  <p style={{ fontSize:10,color:C.muted,lineHeight:1.5 }}>All candlestick patterns are systematically enabled — Hammer, Squeezed Doji, Reversal Doji, Bollinger Band + Parabolic SAR Breakout.</p>
                </div>
              </div>
            )}

            {/* AI Signal info */}
            {mode==='aisignal'&&(
              <div style={{ padding:'10px 12px',borderRadius:10,background:`${C.sky}07`,border:`1px solid ${C.sky}20`,display:'flex',gap:8 }}>
                <Radio style={{ width:14,height:14,color:C.sky,flexShrink:0,marginTop:2 }}/>
                <div>
                  <p style={{ fontSize:11,fontWeight:600,color:C.sky,marginBottom:4 }}>Mode AI Signal</p>
                  <p style={{ fontSize:10,color:C.muted,lineHeight:1.5 }}>System sedang mengkonfigurasi sinyal AI</p>
                </div>
              </div>
            )}

            {/* ── FAST REVERSAL: langkah K yang arahnya dibalik ── */}
            {mode==='fastreversal'&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',margin:'0 4px 7px' }}>
                  <p style={{ fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:C.muted,margin:0 }}>Langkah Pembalikan</p>
                  {frExpiry&&(()=>{ const d=Math.max(0,Math.ceil((frExpiry-Date.now())/86_400_000)); return (
                    <span style={{ fontSize:10,fontWeight:700,color:C.coral,background:`${C.coral}14`,border:`1px solid ${C.coral}33`,borderRadius:99,padding:'3px 9px' }}>
                      Aktif · {d} hari lagi
                    </span>
                  ); })()}
                </div>
                <div style={{ borderRadius:14,background:C.card2,border:`1px solid ${C.bdr}`,padding:'14px 16px' }}>
                  <p style={{ fontSize:11.5,color:C.muted,lineHeight:1.55,margin:'0 0 12px' }}>
                    Isi hingga 3 langkah martingale (K) yang arah sinyalnya <b style={{color:C.coral}}>dibalik</b>. Kosongkan untuk berjalan seperti Fastrade biasa.
                  </p>
                  <div style={{ display:'flex',gap:8 }}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{ flex:1,position:'relative' }}>
                        <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:13,fontWeight:700,color:C.muted,pointerEvents:'none' }}>K</span>
                        <input className="ds-input" type="number" inputMode="numeric" placeholder="—"
                          disabled={disabled}
                          value={reversalSteps[i]??''}
                          onChange={e=>{
                            const raw=e.target.value.replace(/\D/g,'').slice(0,2);
                            const slots:(number|undefined)[]=[reversalSteps[0],reversalSteps[1],reversalSteps[2]];
                            slots[i]=raw?parseInt(raw,10):undefined;
                            // Dibersihkan: buang duplikat & di luar 1..10, lalu urutkan —
                            // mesin memakai daftar ini apa adanya untuk mencocokkan step.
                            const clean=Array.from(new Set(
                              slots.filter((n):n is number=>typeof n==='number'&&n>=1&&n<=10)
                            )).sort((a,b)=>a-b);
                            onReversalStepsChange(clean);
                          }}
                          style={{ textAlign:'center',paddingLeft:24 }}/>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize:11,color:reversalSteps.length?C.coral:C.muted,marginTop:9 }}>
                    {reversalSteps.length?`Sinyal dibalik pada: ${reversalSteps.map(k=>`K${k}`).join(' · ')}`:'Belum ada K yang dibalik (jalan seperti Fastrade biasa).'}
                  </p>
                </div>
              </div>
            )}

            {/* Kompensasi / Martingale — dua kartu mirip Kotlin */}
            <div>
              <div style={{ height:1,background:C.bdr,marginBottom:16 }}/>
              <p style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:10 }}>{T('dashboard.martingale.compensation')}</p>
              <div style={{ display:'flex',gap:8 }}>
                {/* Toggle card */}
                <button disabled={disabled} onClick={()=>set('enabled',!martingale.enabled)} style={{
                  flex:1,height:44,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:8,padding:'0 12px',
                  background:martingale.enabled?`${C.cyan}18`:C.card2,border:`1px solid ${martingale.enabled?`${C.cyan}60`:C.bdr}`,transition:'all 0.15s',
                }}>
                  <div style={{ width:16,height:16,borderRadius:'50%',flexShrink:0,background:martingale.enabled?C.cyan:'transparent',border:`1.5px solid ${martingale.enabled?C.cyan:C.muted}`,display:'flex',alignItems:'center',justifyContent:'center' }}>
                    {martingale.enabled&&<span style={{ width:6,height:6,borderRadius:'50%',background:'#fff' }}/>}
                  </div>
                  <span style={{ fontSize:11,fontWeight:700,color:C.text,letterSpacing:'0.02em' }}>Martingale</span>
                </button>
                {/* Max Steps card — opens dialog */}
                <button disabled={disabled||!martingale.enabled} onClick={()=>{ if(martingale.enabled) setShowMartingaleDialog(true); }} style={{
                  flex:1,height:44,borderRadius:12,cursor:martingale.enabled?'pointer':'not-allowed',
                  display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',
                  background:C.card2,border:`1px solid ${martingale.enabled&&!martingale.alwaysSignal?`${C.amber}45`:C.bdr}`,
                  opacity:martingale.enabled?1:0.45,transition:'all 0.15s',
                }}>
                  <span style={{ fontSize:11,fontWeight:500,color:C.text }}>{T('dashboard.martingale.maxStepLabel')}</span>
                  <div style={{ display:'flex',alignItems:'center',gap:4 }}>
                    {martingale.alwaysSignal
                      ?<span style={{ fontSize:18,fontWeight:700,color:C.amber }}>∞</span>
                      :<span style={{ fontSize:14,fontWeight:700,color:C.text }}>{martingale.maxStep}</span>
                    }
                    {martingale.enabled&&<RefreshCw style={{ width:11,height:11,color:C.amber }}/>}
                  </div>
                </button>
              </div>
              {martingale.enabled&&(
                <div style={{ marginTop:8,display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:10,background:`${C.cyan}07`,border:`1px solid ${C.cyan}18` }}>
                  <TrendingUp style={{ width:12,height:12,color:C.cyan,flexShrink:0 }}/>
                  <span style={{ fontSize:11,color:C.sub }}>Multiplier: <strong style={{ color:C.cyan }}>{martingale.multiplier}×</strong></span>
                  {martingale.alwaysSignal&&<span style={{ marginLeft:6,fontSize:10,fontWeight:700,color:C.amber,background:`${C.amber}14`,borderRadius:4,padding:'1px 6px' }}>Always Signal ON</span>}
                  <button onClick={()=>setShowMartingaleDialog(true)} style={{ marginLeft:'auto',fontSize:10,color:C.cyan,background:'transparent',border:'none',cursor:'pointer',padding:0,fontWeight:600 }}>Edit →</button>
                </div>
              )}
            </div>

            {/* Risk Management — redesign: settings-group (selaras strip jam) */}
            {(mode!=='aisignal')&&(
              <div>
                <div style={{ height:1,background:C.bdr,marginBottom:16 }}/>
                <p style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:10 }}>Risk Management</p>

                {/* Group container — bg faint, baris ber-divider, toggle switch */}
                <div style={{ background:C.faint,borderRadius:12,overflow:'hidden' }}>

                  {/* ── Baris Stop Loss ── */}
                  <div style={{ display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderBottom:`1px solid ${C.bdr}` }}>
                    <div style={{ width:28,height:28,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.coral}14` }}>
                      <TrendingDown style={{ width:14,height:14,color:C.coral }}/>
                    </div>
                    <button
                      onClick={()=>{ if(!disabled&&slEnabled) setShowSlInput(v=>!v); }}
                      disabled={disabled||!slEnabled}
                      style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2,background:'transparent',border:'none',padding:0,textAlign:'left',cursor:slEnabled&&!disabled?'pointer':'default' }}
                    >
                      <span style={{ fontSize:12.5,fontWeight:600,color:C.text,lineHeight:1 }}>Stop Loss</span>
                      {slEnabled&&stopLoss>0
                        ? <span className="dsh-num" style={{ fontSize:11,fontWeight:600,color:C.coral }}>{CURR_UNIT} {FMT(stopLoss)}</span>
                        : <span style={{ fontSize:10.5,color:C.muted }}>Batas kerugian harian</span>
                      }
                    </button>
                    <Toggle
                      checked={slEnabled}
                      disabled={disabled}
                      accent={C.coral}
                      onChange={next=>{
                        setSlEnabled(next);
                        if(next){ setShowSlInput(true); }
                        else{ onSlChange(0); setShowSlInput(false); setSlInputValue(''); }
                      }}
                    />
                  </div>

                  {/* Input inline Stop Loss */}
                  {slEnabled&&showSlInput&&(
                    <div style={{ padding:'10px 12px',borderBottom:`1px solid ${C.bdr}`,display:'flex',flexDirection:'column',gap:6 }}>
                      <div style={{ position:'relative' }}>
                        <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                        <input
                          className="ds-input"
                          value={slInputValue}
                          autoFocus
                          onChange={e=>setSlInputValue(e.target.value)}
                          onKeyDown={e=>{
                            if(e.key==='Enter'){
                              const v=parseFlexibleInput(slInputValue);
                              if(v&&v>0){ onSlChange(v); setShowSlInput(false); }
                            }
                          }}
                          onBlur={()=>{
                            const v=parseFlexibleInput(slInputValue);
                            if(v&&v>0){ onSlChange(v); }
                          }}
                          placeholder="100K, 1M, 500000"
                          style={{ paddingLeft:30,background:C.card }}
                        />
                      </div>
                      <span style={{ color:C.muted,fontSize:10,lineHeight:1.4 }}>Format: angka biasa, K (ribu), M (juta), B (miliar) · Enter untuk simpan</span>
                    </div>
                  )}

                  {/* ── Baris Target Profit ── */}
                  <div style={{ display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderBottom:spEnabled&&showSpInput?`1px solid ${C.bdr}`:'none' }}>
                    <div style={{ width:28,height:28,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.cyan}14` }}>
                      <TrendingUp style={{ width:14,height:14,color:C.cyan }}/>
                    </div>
                    <button
                      onClick={()=>{ if(!disabled&&spEnabled) setShowSpInput(v=>!v); }}
                      disabled={disabled||!spEnabled}
                      style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2,background:'transparent',border:'none',padding:0,textAlign:'left',cursor:spEnabled&&!disabled?'pointer':'default' }}
                    >
                      <span style={{ fontSize:12.5,fontWeight:600,color:C.text,lineHeight:1 }}>Target Profit</span>
                      {spEnabled&&stopProfit>0
                        ? <span className="dsh-num" style={{ fontSize:11,fontWeight:600,color:C.cyan }}>{CURR_UNIT} {FMT(stopProfit)}</span>
                        : <span style={{ fontSize:10.5,color:C.muted }}>Amankan target keuntungan</span>
                      }
                    </button>
                    <Toggle
                      checked={spEnabled}
                      disabled={disabled}
                      accent={C.cyan}
                      onChange={next=>{
                        setSpEnabled(next);
                        if(next){ setShowSpInput(true); }
                        else{ onSpChange(0); setShowSpInput(false); setSpInputValue(''); }
                      }}
                    />
                  </div>

                  {/* Input inline Target Profit */}
                  {spEnabled&&showSpInput&&(
                    <div style={{ padding:'10px 12px',display:'flex',flexDirection:'column',gap:6 }}>
                      <div style={{ position:'relative' }}>
                        <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                        <input
                          className="ds-input"
                          value={spInputValue}
                          autoFocus
                          onChange={e=>setSpInputValue(e.target.value)}
                          onKeyDown={e=>{
                            if(e.key==='Enter'){
                              const v=parseFlexibleInput(spInputValue);
                              if(v&&v>0){ onSpChange(v); setShowSpInput(false); }
                            }
                          }}
                          onBlur={()=>{
                            const v=parseFlexibleInput(spInputValue);
                            if(v&&v>0){ onSpChange(v); }
                          }}
                          placeholder="100K, 1M, 500000"
                          style={{ paddingLeft:30,background:C.card }}
                        />
                      </div>
                      <span style={{ color:C.muted,fontSize:10,lineHeight:1.4 }}>Format: angka biasa, K (ribu), M (juta), B (miliar) · Enter untuk simpan</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
};
// ═══════════════════════════════════════════
// CONTROL CARD
// ═══════════════════════════════════════════
// ControlCard + AlwaysSignalBadge dipindah ke ./ControlCard.
