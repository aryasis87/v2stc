'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type StockityAsset, type ProfileBalance, type ScheduleStatus,
  type ScheduleOrder, type ExecutionLog,
  type FastradeStatus, type FastradeLog,
  type AISignalStatus, type AISignalOrder, type AISignalConfig,
  type IndicatorStatus, type IndicatorConfig, type IndicatorType,
  type MomentumStatus, type MomentumConfig,
  type TodayProfitSummary,
  type AlwaysSignalLossState,
} from '@/lib/api';
import { ChartCard } from '@/components/ChartCard';
import AssetIcon from '@/components/common/AssetIcon';
import { storage, isSessionValid } from '@/lib/storage';
import { useTradingSettings } from '@/lib/useTradingSettings';
import { useLanguage } from '@/lib';
import { langToIntlLocale } from '@/lib/localeUtils';
import { CurrencyConfig, DEFAULT_CURRENCY_CONFIG, ISO_TO_UNIT } from '@/lib/userProfileApi';
import { applyLanguageFromCountry } from '@/lib/LanguageContext';
import { useDarkMode } from '@/lib/DarkModeContext';
import {
  Activity, AlertCircle, BarChart2, Calendar,
  ChevronDown, ChevronUp, Info, Plus,
  Settings, Trash2, X, Zap, TrendingUp, TrendingDown,
  PlayCircle, StopCircle, PauseCircle, RefreshCw, Timer, Copy,
  ArrowRight, Radio, BarChart, Waves,
  Wallet, Clock, CreditCard, Eye, EyeOff,
  ClipboardPaste, Check, Lock,
} from 'lucide-react';

// ═══════════════════════════════════════════
// DESIGN TOKENS - Emerald Theme (Dark/Light)
// ═══════════════════════════════════════════
function getColors(isDark: boolean) {
  // ── Dark: matched to Kotlin DarkColors ──────────────────────────────────
  // background=#161616  surface=#1F1F1F  cardBackground=#323232
  // textPrimary=#EBEBEB textSecondary=#BAC1CB textMuted=rgba(126,126,126,.73)
  // successColor=#10B981  errorColor=#EF4444  warningColor=#FBBF24
  // borderColor=#494949   chartLine=Cyan(#00FFFF)
  //
  // ── Light: matched to Kotlin LightColors ────────────────────────────────
  // background=#F8F9FA  surface=#FFFFFF  surface3=#EBEBEB
  // textPrimary=#1F2937  textSecondary=#6B7280  textMuted=#9CA3AF
  // successColor=#059669  errorColor=#DC2626  warningColor=#D97706
  // borderColor=#D6DADF
  // ── Redesign 2026: palet minimalis-modern (Linear/Vercel-style) ───────────
  // Border hairline netral (bukan hijau tebal), surface berlapis halus,
  // aksen emerald yang lebih kalem, hierarki teks lebih jelas.
  return {
    // Surfaces — near-black berlapis (dark) / abu sangat terang (light)
    bg:    isDark ? '#0B0C0E' : '#F6F7F9',
    card:  isDark ? '#141518' : '#FFFFFF',
    card2: isDark ? '#1B1D21' : '#F1F3F5',
    // Borders — hairline netral tipis; aktif = emerald halus
    bdr:   isDark ? 'rgba(255,255,255,0.08)' : '#E6E8EB',
    bdrAct:isDark ? 'rgba(45,212,167,0.55)'  : 'rgba(5,150,105,0.45)',
    // Primary accent — emerald bersih
    cyan:  isDark ? '#2DD4A7' : '#059669',
    cyand: isDark ? 'rgba(45,212,167,0.14)' : 'rgba(5,150,105,0.09)',
    // Error / loss
    coral: isDark ? '#FB7185' : '#E11D48',
    cord:  isDark ? 'rgba(251,113,133,0.14)' : 'rgba(225,29,72,0.08)',
    // Warning / martingale
    amber: isDark ? '#FBBF24' : '#B45309',
    ambd:  isDark ? 'rgba(251,191,36,0.14)'  : 'rgba(180,83,9,0.09)',
    // Misc accent colors
    violet: isDark ? '#C084FC' : '#7C3AED',
    vltd:  isDark ? 'rgba(192,132,252,0.14)' : 'rgba(124,58,237,0.08)',
    sky:   isDark ? '#4ADE80' : '#16A34A',
    skyd:  isDark ? 'rgba(74,222,128,0.14)'  : 'rgba(22,163,74,0.09)',
    orange: isDark ? '#FB923C' : '#EA580C',
    orgd:  isDark ? 'rgba(251,146,60,0.14)'  : 'rgba(234,88,12,0.09)',
    pink:  isDark ? '#F472B6' : '#BE185D',
    pinkd: isDark ? 'rgba(244,114,182,0.14)' : 'rgba(190,24,93,0.08)',
    // Text — hierarki lebih jelas, netral (bukan kebiruan)
    text:  isDark ? '#F4F5F7' : '#0F172A',
    sub:   isDark ? '#A1A8B3' : '#475569',
    muted: isDark ? 'rgba(161,168,179,0.62)' : '#94A3B8',
    faint: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(2,6,23,0.035)',
  };
}

// Module-level colors — updated each render by DashboardPage via C = colors
// Must be `let` so sub-components always get the current theme on re-render
let C = getColors(true);
let T: (k: string) => string = (k: string) => k;

type TradingMode = 'schedule' | 'fastrade' | 'ctc' | 'aisignal' | 'indicator' | 'momentum';
type FastTradeTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';

interface MartingaleConfig { enabled:boolean; maxStep:number; multiplier:number; alwaysSignal?:boolean; }

const FT_TF: {value:FastTradeTimeframe; label:string}[] = [
  {value:'1m',label:'1 Menit'},{value:'5m',label:'5 Menit'},
  {value:'15m',label:'15 Menit'},{value:'30m',label:'30 Menit'},{value:'1h',label:'1 Jam'},
];

// ── Module-level currency config — diupdate oleh DashboardPage setiap render ──
// Pola yang sama dengan C (colors) dan T (t function) di bawah.
// Default IDR agar sub-komponen tidak error sebelum API selesai load.
let FMT: (n: number) => string = (n) => Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
let CURR_UNIT  = 'Rp';
let MIN_AMOUNT = 14_000;
let QUICK_AMOUNTS_DYN: number[] = [14_000, 70_000, 140_000, 280_000, 700_000, 1_400_000, 2_800_000];

function modeAccent(mode: TradingMode): string {
  if (mode === 'ctc') return C.violet;
  if (mode === 'aisignal') return C.sky;
  if (mode === 'indicator') return C.orange;
  if (mode === 'momentum') return C.pink;
  return C.cyan;
}

// ═══════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════
const Sk: React.FC<{w?:string|number;h?:number;style?:React.CSSProperties}> = ({w='100%',h=20,style}) => (
  <div style={{width:w,height:h,background:C.faint,borderRadius:4,...style}}/>
);

const Card: React.FC<{children:React.ReactNode;style?:React.CSSProperties;className?:string;flash?:'win'|'lose'|null;onClick?:()=>void}> =
({children,style,className='',flash,onClick}) => (
  <div className={`ds-card overflow-hidden ${className}`} onClick={onClick} style={{
    // Flash animation hanya berjalan pada .ds-card (box-shadow pulse)
    // Border rotation tetap berjalan pada ::before — tidak terpengaruh
    animation: flash==='win'
      ? 'win-flash 2s ease forwards'
      : flash==='lose'
      ? 'lose-flash 2s ease forwards'
      : undefined,
    // borderRadius & boxShadow TIDAK di-override inline — .ds-card (dashboardStyles)
    // adalah satu-satunya sumber kebenaran bentuk kartu.
    ...style,
  }}>{children}</div>
);

const Divider = () => <div style={{height:1,margin:'12px 0',background:C.bdr}}/>;
const SL: React.FC<{children:React.ReactNode;accent?:string}> = ({children,accent}) => (
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,marginTop:4}}>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:accent||C.muted}}>{children}</span>
    <div style={{flex:1,height:1,background:accent?`linear-gradient(to right,${accent}30,transparent)`:C.bdr}}/>
  </div>
);
const FL: React.FC<{children:React.ReactNode}> = ({children}) => (
  <label style={{display:'block',fontSize:10,fontWeight:600,marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase',color:C.muted}}>{children}</label>
);

const Toggle: React.FC<{checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean;accent?:string}> = ({checked,onChange,disabled,accent=C.cyan}) => (
  <label style={{display:'inline-flex',alignItems:'center',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.4:1}}>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} disabled={disabled} style={{position:'absolute',opacity:0,width:0,height:0}}/>
    <div style={{width:44,height:22,borderRadius:22,position:'relative',transition:'all 0.2s',background:checked?`${accent}28`:C.bdr,border:`1px solid ${checked?`${accent}55`:C.bdr}`}}>
      <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',transition:'left 0.2s',left:checked?23:2,background:checked?accent:C.muted}}/>
    </div>
  </label>
);

const StatusChip: React.FC<{col:string;label:string;pulse?:boolean}> = ({col,label,pulse}) => (
  <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',padding:'4px 10px',borderRadius:99,color:col,background:`${col}10`,border:`1px solid ${col}28`}}>
    <span style={{width:5,height:5,borderRadius:'50%',background:col,animation:pulse?'ping 1.6s ease-in-out infinite':undefined}}/>
    {label}
  </span>
);

/** Tampilkan status Always Signal Martingale yang sedang aktif */
const AlwaysSignalBadge: React.FC<{
  isActive: boolean;
  step: number;
  maxSteps: number;
  totalLoss?: number;
  accent?: string;
}> = ({ isActive, step, maxSteps, totalLoss, accent = C.amber }) => {
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

const CtrlBtn: React.FC<{onClick:()=>void;disabled?:boolean;loading?:boolean;accent:string;label:string;icon?:React.ReactNode;solid?:boolean}> =
({onClick,disabled,loading,accent,label,icon,solid}) => (
  <button onClick={onClick} disabled={disabled||loading} style={{
    flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
    padding:'11px 8px',borderRadius:12,fontSize:12,fontWeight:700,
    letterSpacing:'0.06em',textTransform:'uppercase',cursor:(disabled||loading)?'not-allowed':'pointer',
    background:solid?accent:`${accent}14`,border:`1px solid ${accent}${solid?'':'35'}`,
    color:solid?'#000':accent,opacity:disabled?0.3:1,
    transition:'all 0.15s',
  }}>
    {loading?<RefreshCw style={{width:14,height:14,animation:'spin 0.7s linear infinite'}}/>:icon}
    {loading?T('common.processing'):label}
  </button>
);

// ═══════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════
const RealtimeClockCompact: React.FC<{t:(k:string)=>string;lang:string;isBotRunning?:boolean}> = ({t:tr,lang,isBotRunning=false}) => {
  const [time,setTime] = useState<Date|null>(null);
  useEffect(()=>{setTime(new Date());const id=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(id);},[]);
  const locale = langToIntlLocale(lang);
  const fmtDay  = (d:Date) => d.toLocaleDateString(locale,{weekday:'short'});
  const fmtDate = (d:Date) => d.toLocaleDateString(locale,{day:'2-digit',month:'short',year:'numeric'});
  const tz      = () => {if(!time)return'';const o=-time.getTimezoneOffset()/60;return`UTC${o>=0?'+':''}${o}`;};
  const liveCol = isBotRunning ? C.cyan : C.muted;
  const hhmm = time ? `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}` : '--:--';
  const ss   = time ? String(time.getSeconds()).padStart(2,'0') : '--';
  /*
   * Redesign kompetisi v3 — look baru, bukan jam 7-segment retro lagi:
   * strip lembut (bg faint, tanpa border) berisi
   *   baris 1 — jam tabular besar dengan DETIK LEBIH KECIL (detail
   *             tipografis khas trading terminal modern) + pill LIVE/OFF
   *   baris 2 — hari, tanggal, zona waktu (muted, ellipsis)
   */
  return (
    <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0,background:C.faint,borderRadius:10,padding:'7px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,minWidth:0}}>
        <p suppressHydrationWarning className="dsh-num" style={{
          fontSize:17,fontWeight:700,lineHeight:1,
          color:C.text,margin:0,whiteSpace:'nowrap',overflow:'hidden',minWidth:0,
          display:'flex',alignItems:'baseline',gap:1,
        }}>
          {hhmm}
          <span style={{fontSize:11,fontWeight:600,color:C.muted}}>:{ss}</span>
        </p>
        <span style={{
          display:'inline-flex',alignItems:'center',gap:4,flexShrink:0,
          fontSize:8.5,fontWeight:700,letterSpacing:'0.08em',
          color:liveCol,background:`${liveCol}14`,
          borderRadius:99,padding:'2px 7px',
        }}>
          <span style={{
            width:5,height:5,borderRadius:'50%',background:isBotRunning?C.cyan:C.coral,
            animation:isBotRunning?'ping 1.6s ease-in-out infinite':undefined,
          }}/>
          {isBotRunning?'LIVE':'OFF'}
        </span>
      </div>
      <span suppressHydrationWarning style={{fontSize:9.5,color:C.muted,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>
        {time?`${fmtDay(time)}, ${fmtDate(time)} · ${tz()}`:''}
      </span>
    </div>
  );
};

/** Inline clock for desktop top strip — just time + date, no wrapper card */
const RealtimeClockDesktop: React.FC = () => {
  const [time, setTime] = useState<Date|null>(null);
  useEffect(()=>{setTime(new Date());const id=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(id);},[]);
  const fmtD = (d:Date)=>d.toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short'});
  const tz   = ()=>{if(!time)return'';const o=-time.getTimezoneOffset()/60;return`UTC${o>=0?'+':''}${o}`;};
  const hhmm = time ? `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}` : '--:--';
  const ss   = time ? String(time.getSeconds()).padStart(2,'0') : '--';
  return (
    <div style={{textAlign:'right'}}>
      <p suppressHydrationWarning className="dsh-num" style={{
        fontSize:15,fontWeight:700,lineHeight:1,color:C.text,
        display:'flex',alignItems:'baseline',justifyContent:'flex-end',gap:1,
      }}>
        {hhmm}
        <span style={{fontSize:10.5,fontWeight:600,color:C.muted}}>:{ss}</span>
      </p>
      <div suppressHydrationWarning style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,marginTop:3}}>
        <span style={{fontSize:10,color:C.muted}}>{time?fmtD(time):''}</span>
        <span style={{fontSize:9,fontWeight:600,color:C.cyan,background:`${C.cyan}12`,borderRadius:4,padding:'0px 4px'}}>{tz()}</span>
      </div>
    </div>
  );
};
// ═══════════════════════════════════════════
// TODAY PROFIT CARD — uses /today-profit API
// ═══════════════════════════════════════════
const MODE_LABELS: Record<string, string> = {
  schedule: 'Signal', fastrade: 'FTT', indicator: 'Indikator',
  momentum: 'Momentum', aisignal: 'AI',
};
const MODE_COLORS: Record<string, string> = {
  schedule: '#10B981', fastrade: '#10B981', ctc: '#BF5AF2',
  aisignal: '#34D399', indicator: '#FF6B35', momentum: '#FF375F',
};

const TodayProfitCard: React.FC<{
  data: TodayProfitSummary | null;
  localProfit: number;
  currencyUnit: string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
  flash?: 'win' | 'lose' | null;
  onRefresh?: () => void;
  t: (k: string) => string;
  isMobile?: boolean;
}> = ({ data, localProfit, currencyUnit, isLoading, isRefreshing, lastUpdatedAt, flash, onRefresh, t, isMobile }) => {
  // ✅ FIX FLICKER: lastKnownProfitRef — simpan nilai NON-ZERO terakhir yang valid.
  //    Aturan: ref hanya di-update jika data.totalPnL !== 0.
  //    Jika data.totalPnL === 0 sementara ref sudah non-zero → SKIP (transient 0 dari backend).
  //    Pengecualian: ref masih 0 (belum pernah dapat data) → boleh update ke apapun.
  const lastKnownProfitRef = useRef<number>(localProfit);
  if (data !== null) {
    if (data.totalPnL !== 0 || lastKnownProfitRef.current === 0) {
      // Update ref hanya jika: nilai baru non-zero, ATAU belum ada data (ref=0)
      lastKnownProfitRef.current = data.totalPnL;
    }
    // Jika data.totalPnL === 0 DAN ref sudah non-zero → JANGAN update (flicker protection)
  }
  // Selalu tampilkan dari ref, bukan langsung dari data.totalPnL
  const profit  = lastKnownProfitRef.current;
  const isPos   = profit >= 0;
  const col     = isPos ? C.cyan : C.coral;
  const prevR   = useRef(profit);
  // ✅ FIX flicker: ganti key={animKey} (unmount/remount) dengan ref + class toggle
  // key prop menyebabkan React unmount+remount DOM node 1 frame → flash kosong
  const numRef  = useRef<HTMLParagraphElement>(null);
  const [hidden, setHidden] = useState(false);
  const [secAgo, setSecAgo] = useState<number | null>(null);

  useEffect(() => {
    if (profit === prevR.current) return;
    const dir = profit > prevR.current ? 'up' : 'down';
    prevR.current = profit;
    const el = numRef.current;
    if (!el) return;
    // Hapus class lama, paksa reflow, tambah class baru → animasi tanpa unmount
    el.classList.remove('profit-slide-up', 'profit-slide-down');
    void el.offsetWidth; // force reflow
    el.classList.add(`profit-slide-${dir}`);
    const timer = setTimeout(() => el.classList.remove(`profit-slide-${dir}`), 450);
    return () => clearTimeout(timer);
  }, [profit]);

  // Update "X detik lalu" counter setiap 5 detik
  useEffect(() => {
    if (!lastUpdatedAt) { setSecAgo(null); return; }
    const tick = () => setSecAgo(Math.floor((Date.now() - lastUpdatedAt) / 1000));
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [lastUpdatedAt]);

  const displayValue = FMT(Math.abs(profit / 100));
  const ageLabel = secAgo === null ? null
    : secAgo < 60 ? `${secAgo}d` : `${Math.floor(secAgo/60)}m`;

  return (
    <Card style={{ padding: isMobile ? '10px 14px' : '12px 16px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: isMobile ? 62 : 68 }} flash={flash}>
      {/* Baris 1: Label + age + eye toggle + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: C.muted, whiteSpace: 'nowrap' }}>
          {t('dashboard.profitToday')}
        </span>
        {/* Age badge */}
        {ageLabel && !isRefreshing && (
          <span style={{ fontSize: 9, color: C.muted, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{ageLabel}</span>
        )}
        {/* Refresh spinner / button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh profit"
            style={{ background: 'transparent', border: 'none', cursor: isRefreshing ? 'default' : 'pointer', color: C.muted, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', opacity: isRefreshing ? 0.4 : 0.7 }}
          >
            <RefreshCw style={{ width: 10, height: 10, animation: isRefreshing ? 'stc-spin 0.8s linear infinite' : undefined }} />
          </button>
        )}
        <button
          onClick={() => setHidden(h => !h)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
        >
          {hidden
            ? <Eye style={{ width: 11, height: 11 }} />
            : <EyeOff style={{ width: 11, height: 11 }} />
          }
        </button>
      </div>
      {/* Baris 2: Angka profit atau dots */}
      {isLoading ? (
        <Sk h={28} w="80%" style={{ borderRadius: 6 }} />
      ) : hidden ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {[...Array(6)].map((_, i) => (
            <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: col, opacity: 0.35 + (i % 2) * 0.25 }} />
          ))}
        </div>
      ) : (
        <p ref={numRef} className="dsh-num" style={{
          fontWeight: 700,
          lineHeight: 1,
          color: col,
          fontSize: isMobile ? 'clamp(16px,5vw,24px)' : 'clamp(20px, 6.5vw, 34px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center',
          maxWidth: '100%',
          // ✅ FIX flicker: animasi via CSS class toggle, bukan key prop (yg unmount/remount)
          // opacity TIDAK diturunkan saat isRefreshing — itu yg bikin fade-flicker tiap poll
        }}>
          {isPos ? '+' : '−'}{currencyUnit} {displayValue}
        </p>
      )}
    </Card>
  );
};
// ═══════════════════════════════════════════
// COMBINED ASSET + BALANCE CARD (Mobile — 1 card full width)
// ═══════════════════════════════════════════
const AssetBalanceCombinedCard: React.FC<{
  asset?: StockityAsset | null;
  mode: TradingMode;
  isLoading?: boolean;
  t: (k: string) => string;
  onOpenPicker?: () => void;
  disabled?: boolean;
  balance: ProfileBalance | null;
  accountType: 'demo' | 'real';
}> = ({ asset, mode, isLoading, t, onOpenPicker, disabled, balance, accountType }) => {
  const [hidden, setHidden] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const modeCol = modeAccent(mode);
  const abbr = asset?.ric ? asset.ric.slice(0, 3).toUpperCase() : '+';
  const isDemo = accountType === 'demo';
  const rawAmount = isDemo
    ? (balance?.demo_balance ?? balance?.balance ?? 0)
    : (balance?.real_balance ?? balance?.balance ?? 0);
  const amount = rawAmount / 100;
  const balCol = isDemo ? C.amber : C.cyan;
  const balBg  = isDemo ? 'rgba(255,159,10,0.08)' : 'rgba(16,185,129,0.08)';

  return (
    <Card style={{ padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Sisi Kiri: Aset */}
        <button
          type="button"
          onClick={onOpenPicker && !disabled ? onOpenPicker : undefined}
          disabled={disabled || !onOpenPicker}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', padding: 0,
            cursor: onOpenPicker && !disabled ? 'pointer' : 'default',
            textAlign: 'left',
          }}
        >

          <div style={{
            width: 32, height: 32, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${modeCol}12`, border: `1px solid ${modeCol}28`,
          }}>
            {asset?.iconUrl && !imgErr ? (
              <img src={asset.iconUrl} alt={asset.ric} crossOrigin="anonymous"
                onError={() => setImgErr(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }}
              />
            ) : asset ? (
              <span style={{ fontWeight: 700, fontSize: 11, color: modeCol }}>{abbr}</span>
            ) : (
              <Plus style={{ width: 18, height: 18, color: modeCol }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Label "ASET" + persentasi di sebelah kanannya */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <p style={{ fontSize: 10, fontWeight: 500, color: C.muted, lineHeight: 1, margin: 0 }}>
                {t('dashboard.asset')}
              </p>
              {asset && (
                <span className="dsh-num" style={{ fontSize: 9.5, fontWeight: 600, color: modeCol, lineHeight: 1, flexShrink: 0 }}>{asset.profitRate}%</span>
              )}
            </div>
            {isLoading ? <div style={{ height: 14, width: 60, borderRadius: 4, background: C.faint }} /> : asset ? (
              <p style={{ fontSize: 'clamp(11px,3.2vw,14px)', fontWeight: 650, lineHeight: 1.1, color: C.text, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, margin: 0 }}>
                {asset.name}
              </p>
            ) : (
              <p style={{ fontSize: 11, color: modeCol, fontWeight: 600, margin: 0 }}>{t('dashboard.notSelected')}</p>
            )}
          </div>
          {asset && (
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${modeCol}10`, border: `1px solid ${modeCol}22`,
              alignSelf: 'center',
            }}>
              <ChevronDown style={{ width: 14, height: 14, color: modeCol }} />
            </div>
          )}
        </button>

        {/* Divider Vertikal */}
        <div style={{ width: 1, height: 36, background: C.bdr, flexShrink: 0 }} />

        {/* Sisi Kanan: Saldo — ditengahkan secara vertikal & horizontal */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          {/* Baris 1: label + eye + badge sejajar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.muted, lineHeight: 1, margin: 0 }}>
              {t('dashboard.balance')}
            </p>
            <button
              onClick={() => setHidden(h => !h)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            >
              {hidden
                ? <Eye style={{ width: 10, height: 10 }} />
                : <EyeOff style={{ width: 10, height: 10 }} />
              }
            </button>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, color: balCol, background: balBg, lineHeight: '13px', display: 'inline-block' }}>
              {isDemo ? t('common.demo') : t('common.real')}
            </span>
          </div>

          {/* Baris 2: angka saldo — terpusat */}
          {isLoading ? (
            <div style={{ height: 13, width: 60, borderRadius: 4, background: C.faint }} />
          ) : hidden ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {[...Array(5)].map((_, i) => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: balCol, opacity: 0.4 + (i % 2) * 0.2 }} />
              ))}
            </div>
          ) : (
            <p className="dsh-num" style={{ fontSize: 'clamp(12px,3.5vw,16px)', fontWeight: 700, lineHeight: 1, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, textAlign: 'center' }}>
              {FMT(amount)}
            </p>
          )}
        </div>

      </div>
    </Card>
  );
};

// ═══════════════════════════════════════════
// PICKER MODAL
// ═══════════════════════════════════════════
interface PickerOpt {value:string;label:string;sub?:string;icon?:string|null;}
const PickerModal: React.FC<{open:boolean;onClose:()=>void;title:string;options:PickerOpt[];value:string;onSelect:(v:string)=>void;searchable?:boolean;isDark?:boolean}> =
({open,onClose,title,options,value,onSelect,searchable,isDark=true}) => {
  const [q,setQ] = useState('');
  useEffect(()=>{if(open)setQ('');},[open]);

  if(!open) return null;
  const filtered = q.trim() ? options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())||o.value.toLowerCase().includes(q.toLowerCase())) : options;
  
  // Theme-aware colors
  const modalBg = isDark 
    ? '#1B1D21'
    : '#ffffff';
  const headerBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E6E8EB';
  const closeBtnBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const closeBtnBorder = isDark ? 'rgba(255,255,255,0.14)' : '#E6E8EB';
  const closeBtnColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)';
  const itemBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E6E8EB';
  const iconBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)';
  const iconBorder = isDark ? 'rgba(255,255,255,0.16)' : '#E6E8EB';
  const iconColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)';
  const radioBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',padding:'16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px) 16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:isDark?'rgba(0,0,0,0.8)':'rgba(0,0,0,0.5)',backdropFilter:'blur(12px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:480,maxHeight:'80%',display:'flex',flexDirection:'column',background:modalBg,borderRadius:16,border:`1px solid ${C.bdr}`,boxShadow:isDark?'0 24px 80px rgba(0,0,0,0.7)':'0 24px 80px rgba(0,0,0,0.3)',overflow:'hidden',animation:'slide-up 0.25s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 16px 12px',borderBottom:`1px solid ${headerBorder}`,flexShrink:0}}>
          <span style={{fontSize:14,fontWeight:600,color:C.text}}>{title}</span>
          <button onClick={onClose} style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,border:`1px solid ${closeBtnBorder}`,background:closeBtnBg,color:closeBtnColor,cursor:'pointer'}}>
            <X style={{width:13,height:13}}/>
          </button>
        </div>
        {searchable&&(
          <div style={{padding:'10px 14px',borderBottom:`1px solid ${headerBorder}`,flexShrink:0}}>
            <input className="ds-input" style={{fontSize:13,borderRadius:8}} placeholder={T('dashboard.searchAsset')} value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        )}
        <div style={{overflowY:'auto',flex:1}}>
          {filtered.map((opt,i)=>{
            const isSel = opt.value===value;
            return (
              <button key={opt.value} onClick={()=>{onSelect(opt.value);onClose();}} style={{
                width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'11px 16px',
                background:isSel?`${C.cyan}15`:'transparent',
                borderBottom:i<filtered.length-1?`1px solid ${itemBorder}`:'none',
                borderLeft:isSel?`2px solid ${C.cyan}`:'2px solid transparent',
                borderTop:'none',borderRight:'none',cursor:'pointer',
              }}>
                {opt.icon!==undefined&&(
                  <div style={{width:32,height:32,borderRadius:8,flexShrink:0,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:isSel?`${C.cyan}15`:iconBg,border:`1px solid ${isSel?`${C.cyan}40`:iconBorder}`}}>
                    {opt.icon?(
                      <img src={opt.icon} alt="" style={{width:'100%',height:'100%',objectFit:'contain',padding:4}} onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none'}}/>
                    ):(
                      <span style={{fontSize:10,fontWeight:700,color:isSel?C.cyan:iconColor}}>{opt.value.slice(0,3)}</span>
                    )}
                  </div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <span style={{display:'block',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isSel?C.cyan:C.text,fontWeight:isSel?600:400}}>{opt.label}</span>
                  {opt.sub&&<span style={{display:'block',fontSize:11,marginTop:2,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{opt.sub}</span>}
                </div>
                <div style={{flexShrink:0,width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isSel?`${C.cyan}15`:radioBg,border:`1px solid ${isSel?C.cyan:iconBorder}`}}>
                  {isSel&&<span style={{fontSize:10,color:C.cyan}}>✓</span>}
                </div>
              </button>
            );
          })}
          {filtered.length===0&&<div style={{padding:'40px 20px',textAlign:'center',color:C.muted,fontSize:12}}>{T("common.notFound")}</div>}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// ENHANCED PICKER BUTTON WITH ICON & COLORED BACKGROUND
// ═══════════════════════════════════════════
const PickerBtn: React.FC<{
  label: string;
  placeholder?: string;
  disabled?: boolean;
  onClick: () => void;
  accent?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'demo' | 'real';
}> = ({ label, placeholder, disabled, onClick, accent, icon, variant = 'default' }) => {
  const has = !!label;
  const ac = accent || C.cyan;

  // Background colors based on variant
  const getBgColor = () => {
    if (variant === 'demo') return 'rgba(255, 170, 0, 0.14)';
    if (variant === 'real') return 'rgba(16, 185, 129, 0.14)';
    return has ? C.cyand : C.card2;
  };

  const getBorderColor = () => {
    if (variant === 'demo') return 'rgba(255, 170, 0, 0.40)';
    if (variant === 'real') return 'rgba(16, 185, 129, 0.40)';
    return has ? C.bdrAct : C.bdr;
  };

  const getTextColor = () => {
    if (variant === 'demo') return '#FFAA00';
    if (variant === 'real') return '#10B981';
    return has ? C.text : C.muted;
  };

  return (
    <button 
      type="button" 
      onClick={onClick} 
      disabled={disabled} 
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 12,
        background: getBgColor(),
        border: `1px solid ${getBorderColor()}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {icon && (
        <span style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: getTextColor(),
          flexShrink: 0,
        }}>
          {icon}
        </span>
      )}
      <span style={{ 
        fontSize: 13, 
        fontWeight: 500, 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        whiteSpace: 'nowrap', 
        color: getTextColor(),
        flex: 1,
        textAlign: 'left',
      }}>
        {label || placeholder || '— pilih —'}
      </span>
      <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, color: getTextColor() }} />
    </button>
  );
};

// ═══════════════════════════════════════════
// ORDER INPUT MODAL (Schedule) — Kotlin ScheduleDialog style
// ═══════════════════════════════════════════
// ORDER STATE MACHINE
// Menunggu → Monitoring → K{n} → Win/Lose (5 detik) → hilang
// ═══════════════════════════════════════════
type OrderPhase = 'waiting' | 'monitoring' | 'martingale' | 'win' | 'lose' | 'skipped';

function resolvePhase(o: ScheduleOrder, getLog: (o:ScheduleOrder)=>ExecutionLog|undefined): OrderPhase {
  if (o.isSkipped) return 'skipped';
  if (!o.isExecuted) return 'waiting';
  const raw = o.result ?? getLog(o)?.result ?? '';
  const hasResult = /^win$/i.test(raw) || /^los/i.test(raw);
  const ms = o.martingaleState;
  if (hasResult) return /^win$/i.test(raw) ? 'win' : 'lose';
  if (ms?.isActive && (ms.currentStep ?? 0) > 0) return 'martingale';
  return 'monitoring';
}

const OrderInputModal: React.FC<{open:boolean;onClose:()=>void;orders:ScheduleOrder[];logs:ExecutionLog[];onAdd:(s:string)=>Promise<void>;onDelete:(id:string)=>void;onClear:()=>Promise<void>;loading:boolean;isRunning?:boolean;historyOrders:ScheduleOrder[];historyIdsRef:React.MutableRefObject<Set<string>>;initialView?:'list'|'input'}> =
({open,onClose,orders,logs,onAdd,onDelete,onClear,loading,isRunning,historyOrders,historyIdsRef,initialView='list'}) => {
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
        boxShadow:`0 32px 80px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.70':'0.18'}), 0 8px 24px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.50':'0.10'})`,
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
const SchedulePanel: React.FC<{orders:ScheduleOrder[];logs:ExecutionLog[];onOpenModal:()=>void;isRunning:boolean;isLoading:boolean;fillHeight?:boolean;compact?:boolean;onViewSession?:()=>void;historyIdsRef?:React.MutableRefObject<Set<string>>;inModal?:boolean}> =
({orders,logs,onOpenModal,isRunning,isLoading,fillHeight,compact,onViewSession,historyIdsRef,inModal}) => {
  const listRef  = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement|null)[]>([]);
  const [activeIdx,setActiveIdx] = useState(-1);

  // Exclude orders yang sudah masuk history (sudah WIN/LOSE/SKIPPED)
  const liveOrders = historyIdsRef
    ? orders.filter(o => !historyIdsRef.current.has(o.id))
    : orders;

  const pendingOrders   = liveOrders.filter(o => !o.isExecuted && !o.isSkipped);
  const monitoringOrders = liveOrders.filter(o => o.isExecuted && !o.result && !(o.result === 'WIN' || o.result === 'LOSE' || o.result === 'DRAW'));

  useEffect(()=>{
    const update=()=>{
      if(!pendingOrders.length){setActiveIdx(-1);return;}
      const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes();
      let ci=-1,cd=Infinity;
      pendingOrders.forEach((o,i)=>{const[h,m]=o.time.split(':').map(Number);let d=(h*60+m)-nowMin;if(d<0)d+=24*60;if(d<cd){cd=d;ci=i;}});
      setActiveIdx(ci);
    };
    update(); const t=setInterval(update,10000); return()=>clearInterval(t);
  },[pendingOrders.length]); // eslint-disable-line

  useEffect(()=>{
    if(activeIdx<0)return;
    const el=itemRefs.current[activeIdx],c=listRef.current;
    if(!el||!c)return;
    c.scrollTo({top:el.offsetTop-c.clientHeight/2+el.offsetHeight/2,behavior:'smooth'});
  },[activeIdx]);

  const doneCount = liveOrders.length - pendingOrders.length;

  const PanelWrap: React.FC<{children: React.ReactNode}> = ({children}) =>
    inModal ? <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
            : <Card style={{display:'flex',flexDirection:'column'}}>{children}</Card>;

  return (
    <PanelWrap>
      {!compact&&(
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{T('dashboard.schedule.title')}</span>
          {doneCount>0&&(
            <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,color:C.muted,background:C.card2,border:`1px solid ${C.bdr}`}}>
              {doneCount} {T('dashboard.schedule.completed')}
            </span>
          )}
        </div>
        {pendingOrders.length>0&&activeIdx>=0&&(
          <span style={{fontSize:10,fontWeight:500,color:C.cyan}}></span>
        )}
      </div>
      )}
      {pendingOrders.length===0 && monitoringOrders.length===0?(
        <div style={{height:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,gap:8}}>
          <Calendar style={{width:28,height:28,color:C.muted,opacity:0.5}}/>
          <p style={{fontSize:12,color:C.muted,textAlign:'center'}}>
  {doneCount>0?`${T('common.all')} ${doneCount} ${T('dashboard.schedule.title')} ${T('dashboard.schedule.completed')}`:`${T('dashboard.schedule.noSignals')}`}
          </p>
        </div>
      ):(
        <>
        <div ref={listRef} style={{overflowY:'auto',overflowX:'hidden',maxHeight:inModal?undefined:compact?112:210,flex:inModal?'1':'none',minHeight:0}}>
          {/* Monitoring / active orders */}
          {monitoringOrders.map(o => {
            const isCall = o.trend === 'call';
            const ms = o.martingaleState;
            const isMartingale = ms?.isActive && (ms.currentStep ?? 0) > 0;
            const col = isMartingale ? C.amber : C.sky;
            const label = isMartingale ? `K${ms!.currentStep}` : '●';
            const timeFz = compact ? '10.5px' : '12px';
            const itemPad = compact ? '5px 10px' : '8px 12px';
            const itemGap = compact ? 5 : 8;
            return (
              <div key={o.id} className="schedule-item" style={{
                display:'flex',alignItems:'center',gap:itemGap,padding:itemPad,
                borderBottom:`1px solid ${C.bdr}`,
                background: isMartingale ? `${C.amber}08` : `${C.sky}08`,
                minWidth:0,overflow:'hidden',
              }}>
                <span style={{fontSize:compact?9:10,fontWeight:700,color:col,width:18,textAlign:'center',flexShrink:0,animation:'pulse 1.2s ease-in-out infinite'}}>{label}</span>
                <span style={{fontSize:timeFz,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',color:C.text,fontWeight:600,flexShrink:0}}>{o.time}</span>
                <span style={{fontSize:compact?8:9,fontWeight:700,padding:'1px 5px',borderRadius:4,color:isCall?C.cyan:C.coral,background:isCall?`${C.cyan}12`:`${C.coral}12`,flexShrink:0}}>{isCall?'B':'S'}</span>
                <span style={{fontSize:compact?8:9,fontWeight:700,padding:'1px 6px',borderRadius:99,color:col,background:`${col}12`,border:`1px solid ${col}28`,flexShrink:0,marginLeft:'auto'}}>
                  {isMartingale ? `K${ms!.currentStep}` : 'Monitor'}
                </span>
              </div>
            );
          })}
          {/* Pending orders */}
          {(compact?pendingOrders.slice(0,2):pendingOrders).map((order,i,arr)=>{
            const isA=i===activeIdx, isCall=order.trend==='call', col=isCall?C.cyan:C.coral;
            const iconSz = compact?11:13;
            const timeFz = compact?'10.5px':'12px';
            const badgeFz = compact?'9.5px':'10px';
            const badgePad = compact?'2px 5px':'2px 7px';
            const itemPad = compact?'5px 10px':'8px 12px';
            const itemGap = compact?5:8;
            return (
              <div key={order.id} ref={el=>{itemRefs.current[i]=el;}} className="schedule-item" style={{
                display:'flex',alignItems:'center',gap:itemGap,padding:itemPad,
                borderBottom:i<arr.length-1?`1px solid ${C.bdr}`:'none',
                background:isA?(isCall?`${C.cyan}08`:`${C.coral}08`):'transparent',
                minWidth:0,overflow:'hidden',
              }}>
                {isA
                  ? <PlayCircle style={{width:iconSz,height:iconSz,color:col,flexShrink:0}}/>
                  : <PauseCircle style={{width:iconSz,height:iconSz,color:C.muted,flexShrink:0}}/>
                }
                <span style={{fontSize:timeFz,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',color:isA?C.text:C.sub,fontWeight:isA?600:400,flexShrink:0}}>{order.time}</span>
                <span style={{fontSize:badgeFz,fontWeight:700,padding:badgePad,borderRadius:5,color:col,background:isCall?`${C.cyan}12`:`${C.coral}12`,flexShrink:0,lineHeight:'1.2'}}>{isCall?'B':'S'}</span>
              </div>
            );
          })}
        </div>
        </>
      )}
      <div style={{padding:'8px 10px',marginTop:'auto',borderTop:`1px solid ${C.bdr}`,flexShrink:0}}>
        <button
          onClick={onOpenModal}
          style={{
            width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            padding:'8px 0',borderRadius:8,fontSize:11.5,fontWeight:500,
            background:`${C.cyan}10`,border:`1px solid ${C.cyan}28`,color:C.cyan,
            cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',
          }}
        >
          <Info style={{width:12,height:12,flexShrink:0}}/>
          {isRunning ? T('dashboard.viewSession') : (pendingOrders.length===0 ? T('dashboard.schedule.add') : 'View · '+pendingOrders.length+' order')}
        </button>
      </div>
    </PanelWrap>
  );
};
// ═══════════════════════════════════════════
const FastradePanel: React.FC<{status:FastradeStatus|null;logs:FastradeLog[];isLoading:boolean;fillHeight?:boolean;inModal?:boolean}> =
({status,logs,isLoading,fillHeight,inModal}) => {
  const isOn   = status?.isRunning??false;
  const pnl    = status?.sessionPnL??0;
  const wins   = status?.totalWins??0;
  const losses = status?.totalLosses??0;
  const total  = status?.totalTrades??0;
  const wr     = total>0?Math.round((wins/total)*100):null;
  const accent = status?.mode==='CTC'?C.violet:C.cyan;
  const isCTC  = status?.mode==='CTC';
  const phaseMap: Record<string,string> = {
    WAITING_MINUTE_1:T('dashboard.phaseMap.waitingMinute1'),FETCHING_1:T('dashboard.phaseMap.fetching1'),
    WAITING_MINUTE_2:T('dashboard.phaseMap.waitingMinute2'),FETCHING_2:T('dashboard.phaseMap.fetching2'),
    ANALYZING:T('dashboard.phaseMap.analyzing'),WAITING_EXEC_SYNC:T('dashboard.phaseMap.waitingExecSync'),
    EXECUTING:T('dashboard.phaseMap.executing'),WAITING_RESULT:T('dashboard.phaseMap.waitingResult'),
    WAITING_LOSS_DELAY:T('dashboard.phaseMap.waitingLossDelay'),IDLE:T('dashboard.phaseMap.idle'),
  };
  const phase = status?.phase||(isOn?T('dashboard.botStatus.running'):T('common.standby'));
  const trend = status?.activeTrend??status?.currentTrend;
  const pnlCol = pnl>=0?accent:C.coral;

  const Row: React.FC<{label:string;right:React.ReactNode;border?:boolean}> = ({label,right,border=true}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:border?`1px solid ${C.bdr}`:'none',minWidth:0}}>
      <span style={{fontSize:11,color:C.muted}}>{label}</span>
      <span style={{fontSize:11,fontWeight:600,color:C.text}}>{right}</span>
    </div>
  );

  const FTPanelWrap: React.FC<{children: React.ReactNode}> = ({children}) =>
    inModal ? <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
            : <Card style={{display:'flex',flexDirection:'column'}}>{children}</Card>;

  return (
    <FTPanelWrap>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
        {isOn ? (
          <>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <Zap style={{width:14,height:14,color:accent}}/>
              <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{isCTC?T('dashboard.fastTrade.ctcSession'):T('dashboard.fastTrade.fttSession')}</span>
            </div>
<StatusChip col={accent} label={T('common.active')} pulse/>
          </>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:C.muted,opacity:0.4}}/>
            <span style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.04em'}}>{T('common.standby')}</span>
          </div>
        )}
      </div>

      {isLoading?(
        <div style={{padding:'8px 0'}}>{[1,2,3].map(i=><div key={i} style={{padding:'8px 12px'}}><Sk w={`${i===1?70:i===2?50:60}%`} h={14}/></div>)}</div>
      ):!status||!isOn?(
        <div style={{height:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
          <Zap style={{width:24,height:24,color:C.muted,opacity:0.4}}/>
          <p style={{fontSize:12,color:C.muted,textAlign:'center'}}>{T('dashboard.fastTrade.noActiveSession')}</p>
        </div>
      ):(
        <div style={{overflowY:'auto',maxHeight:inModal?undefined:240,flex:inModal?1:undefined,minHeight:0}}>
          <Row label="P&L" right={<span style={{color:pnlCol,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{pnl>=0?'+':'-'}{FMT(Math.abs(pnl)/100)}</span>}/>
          <Row label="W / L" right={<span style={{fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}><span style={{color:C.cyan}}>{wins}</span><span style={{color:C.muted}}> / </span><span style={{color:C.coral}}>{losses}</span></span>}/>
          <Row label={T('dashboard.fastTrade.phase')} right={<span style={{color:accent,fontSize:10}}>{phaseMap[phase]??phase}</span>}/>
          {trend&&<Row label={T('dashboard.fastTrade.trend')} right={<span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,color:trend==='call'?C.cyan:C.coral,background:trend==='call'?`${C.cyan}12`:`${C.coral}12`}}>{trend==='call'?'↑ CALL':'↓ PUT'}</span>} border={logs.length===0}/>}
          {logs.length>0&&(
            <>
              <div style={{padding:'6px 12px 4px',borderBottom:`1px solid ${C.bdr}`}}>
                <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:C.muted}}>{T('dashboard.fastTrade.history')}</span>
              </div>
              {logs.slice(-4).reverse().map((log,i,arr)=>{
                const rc=log.result==='WIN'?accent:log.result==='LOSS'||log.result==='LOSE'?C.coral:C.amber;
                const col=log.trend==='call'?C.cyan:C.coral;
                return (
                  <div key={log.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderBottom:i<arr.length-1?`1px solid ${C.bdr}`:'none',minWidth:0,overflow:'hidden'}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,color:col,background:log.trend==='call'?`${C.cyan}12`:`${C.coral}12`,flexShrink:0}}>{log.trend==='call'?'CALL':'PUT'}</span>
                    <span style={{fontSize:10,color:C.muted,flex:1,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.amount!=null?FMT(log.amount/100):''}</span>
                    {log.result&&<span style={{fontSize:10,fontWeight:700,color:rc,flexShrink:0}}>{log.result}</span>}
                    {log.profit!=null&&<span style={{fontSize:10,color:rc,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',flexShrink:0}}>{log.profit>=0?'+':'-'}{FMT(Math.abs(log.profit)/100)}</span>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </FTPanelWrap>
  );
};

// ═══════════════════════════════════════════
// AI SIGNAL PANEL
// ═══════════════════════════════════════════
const AISignalPanel: React.FC<{
  status: AISignalStatus | null;
  pendingOrders: AISignalOrder[];
  isLoading: boolean;
  fillHeight?: boolean;
  inModal?: boolean;
}> = ({ status, pendingOrders, isLoading, inModal }) => {
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
 
  // Listening status dari TelegramSignalService
  const telegramStatus = (status as any)?.telegramSignalStatus as {
    isListening?: boolean;
    hasCallback?: boolean;
    globalListenerActive?: boolean;
  } | undefined;
  const listenerActive = telegramStatus?.globalListenerActive ?? telegramStatus?.isListening ?? isOn;
 
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
const IndicatorPanel: React.FC<{status:IndicatorStatus|null;isLoading:boolean;fillHeight?:boolean;inModal?:boolean}> =
({status,isLoading,fillHeight,inModal}) => {
  const isOn   = status?.isRunning??false;
  const pnl    = status?.sessionPnL??0;
  const wins   = status?.totalWins??0;
  const losses = status?.totalLosses??0;
  const total  = status?.totalTrades??0;
  const wr     = total>0?Math.round((wins/total)*100):null;
  const indType = status?.indicatorType??'SMA';
  const pnlCol  = pnl>=0?C.orange:C.coral;
  const lastTrend = status?.lastTrend;

  const Row: React.FC<{label:string;right:React.ReactNode;border?:boolean}> = ({label,right,border=true}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:border?`1px solid ${C.bdr}`:'none',minWidth:0}}>
      <span style={{fontSize:11,color:C.muted}}>{label}</span>
      <span style={{fontSize:11,fontWeight:600}}>{right}</span>
    </div>
  );

  const IndPanelWrap: React.FC<{children: React.ReactNode}> = ({children}) =>
    inModal ? <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
            : <Card style={{display:'flex',flexDirection:'column'}}>{children}</Card>;

  return (
    <IndPanelWrap>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderBottom:`1px solid ${isOn ? 'rgba(255,107,53,0.2)' : C.bdr}`,flexShrink:0}}>
        {isOn ? (
          <>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <BarChart style={{width:14,height:14,color:C.orange}}/>
              <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{T('dashboard.indicator.title')} <span style={{color:C.orange}}>— {indType}</span></span>
            </div>
<StatusChip col={C.orange} label={T('common.active')} pulse/>
          </>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:C.muted,opacity:0.4}}/>
            <span style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.04em'}}>{T('common.standby')}</span>
          </div>
        )}
      </div>
      {isLoading?(
        <div style={{padding:'8px 0'}}>{[1,2,3].map(i=><div key={i} style={{padding:'8px 12px'}}><Sk w={`${i===1?70:i===2?50:60}%`} h={14}/></div>)}</div>
      ):!isOn?(
        <div style={{height:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
          <BarChart style={{width:24,height:24,color:C.muted,opacity:0.4}}/>
          <p style={{fontSize:12,color:C.muted,textAlign:'center'}}>{T('dashboard.indicator.notActive')}</p>
        </div>
      ):(
        <div style={{overflowY:'auto',maxHeight:inModal?undefined:240,flex:inModal?1:undefined,minHeight:0}}>
          <Row label="P&L" right={<span style={{color:pnlCol,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{pnl>=0?'+':'-'}{FMT(Math.abs(pnl)/100)}</span>}/>
          <Row label="W / L" right={<span style={{fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}><span style={{color:C.cyan}}>{wins}</span><span style={{color:C.muted}}> / </span><span style={{color:C.coral}}>{losses}</span></span>}/>
          <Row label={T('dashboard.fastTrade.status')} right={<span style={{color:C.orange,fontSize:10}}>{status?.lastStatus||T('dashboard.indicator.monitoring')}</span>}/>
          <Row label={T('dashboard.indicator.signalLabel')} right={lastTrend?<span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,color:lastTrend==='call'?C.cyan:C.coral,background:lastTrend==='call'?`${C.cyan}12`:`${C.coral}12`}}>{lastTrend==='call'?'↑ CALL':'↓ PUT'}</span>:<span style={{color:C.muted}}>—</span>}/>
          {status?.currentIndicatorValue!=null&&(
            <Row label={`${T('dashboard.indicator.valueLabel')} ${indType}`} right={<span style={{color:C.orange,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{status.currentIndicatorValue.toFixed(4)}</span>} border={false}/>
          )}
        </div>
      )}
    </IndPanelWrap>
  );
};

// ═══════════════════════════════════════════
// MOMENTUM PANEL
// ═══════════════════════════════════════════
const MomentumPanel: React.FC<{status:MomentumStatus|null;isLoading:boolean;fillHeight?:boolean;inModal?:boolean}> =
({status,isLoading,fillHeight,inModal}) => {
  const isOn   = status?.isRunning??false;
  const pnl    = status?.sessionPnL??0;
  const wins   = status?.totalWins??0;
  const losses = status?.totalLosses??0;
  const total  = status?.totalTrades??0;
  const wr     = total>0?Math.round((wins/total)*100):null;
  const pnlCol = pnl>=0?C.pink:C.coral;

  const PATTERN_LABELS: Record<string,string> = {
    CANDLE_SABIT:'Candle Sabit',
    DOJI_TERJEPIT:'Doji Terjepit',
    DOJI_PEMBATALAN:'Doji Pembatalan',
    BB_SAR_BREAK:'BB + SAR Break',
  };

  const Row: React.FC<{label:string;right:React.ReactNode;border?:boolean}> = ({label,right,border=true}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:border?`1px solid ${C.bdr}`:'none',minWidth:0}}>
      <span style={{fontSize:11,color:C.muted}}>{label}</span>
      <span style={{fontSize:11,fontWeight:600}}>{right}</span>
    </div>
  );

  const MomPanelWrap: React.FC<{children: React.ReactNode}> = ({children}) =>
    inModal ? <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>{children}</div>
            : <Card style={{display:'flex',flexDirection:'column'}}>{children}</Card>;

  return (
    <MomPanelWrap>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderBottom:`1px solid ${isOn ? 'rgba(255,55,95,0.2)' : C.bdr}`,flexShrink:0}}>
        {isOn ? (
          <>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <Waves style={{width:14,height:14,color:C.pink}}/>
              <span style={{fontSize:12,fontWeight:600,color:C.sub}}>Momentum</span>
            </div>
<StatusChip col={C.pink} label={T('common.active')} pulse/>
          </>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:C.muted,opacity:0.4}}/>
            <span style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.04em'}}>{T('common.standby')}</span>
          </div>
        )}
      </div>
      {isLoading?(
        <div style={{padding:'8px 0'}}>{[1,2,3].map(i=><div key={i} style={{padding:'8px 12px'}}><Sk w={`${i===1?70:i===2?50:60}%`} h={14}/></div>)}</div>
      ):!isOn?(
        <div style={{height:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
          <Waves style={{width:24,height:24,color:C.muted,opacity:0.4}}/>
          <p style={{fontSize:12,color:C.muted,textAlign:'center'}}>{T('dashboard.momentum.notActive')}</p>
        </div>
      ):(
        <div style={{overflowY:'auto',maxHeight:inModal?undefined:240,flex:inModal?1:undefined,minHeight:0}}>
          <Row label="P&L" right={<span style={{color:pnlCol,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}>{pnl>=0?'+':'-'}{FMT(Math.abs(pnl)/100)}</span>}/>
          <Row label="W / L" right={<span style={{fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}><span style={{color:C.cyan}}>{wins}</span><span style={{color:C.muted}}> / </span><span style={{color:C.coral}}>{losses}</span></span>}/>
          <Row label={T('dashboard.fastTrade.status')} right={<span style={{color:C.pink,fontSize:10}}>{status?.lastStatus||T('dashboard.momentum.scanning')}</span>}/>
          {status?.lastDetectedPattern?(
            <Row
              label={T('dashboard.momentum.pattern')}
              border={!status.lastSignalTime}
              right={<span style={{color:C.pink,fontSize:10,fontWeight:700}}>{PATTERN_LABELS[status.lastDetectedPattern]??status.lastDetectedPattern}</span>}
            />
          ):(
<Row label={T('dashboard.momentum.pattern')} right={<span style={{color:C.muted}}>—</span>} border={false}/>
          )}
          {status?.lastSignalTime&&(
            <Row label={T('dashboard.momentum.signalTime')} right={<span style={{color:C.muted,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',fontSize:10}}>{new Date(status.lastSignalTime).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>} border={false}/>
          )}
        </div>
      )}
    </MomPanelWrap>
  );
};

// ═══════════════════════════════════════════
// MOBILE SESSION SHEET
// ═══════════════════════════════════════════
const MobileSessionSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  mode: TradingMode;
  ftStatus: FastradeStatus | null;
  ftLogs: FastradeLog[];
  aiStatus: AISignalStatus | null;
  aiPending: AISignalOrder[];
  indicatorStatus: IndicatorStatus | null;
  momentumStatus: MomentumStatus | null;
  orders: ScheduleOrder[];
  logs: ExecutionLog[];
  onOpenModal: () => void;
  isRunning: boolean;
}> = ({
  open, onClose, mode,
  ftStatus, ftLogs, aiStatus, aiPending,
  indicatorStatus, momentumStatus, orders, logs, onOpenModal, isRunning,
}) => {
  const ac = modeAccent(mode);
  const modeLabel: Record<TradingMode,string> = {
    schedule:'Signal Mode', fastrade:'Fastrade FTT Mode', ctc:'Fastrade CTC',
    aisignal:'AI Signal Mode', indicator:'Analysis Strategy Mode', momentum:'Momentum Mode',
  };

  if (!open) return null;

  return (
    <div style={{position:'fixed',inset:0,zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px 16px calc(56px + env(safe-area-inset-bottom, 0px) + 8px) 16px',animation:'fade-in 0.15s ease'}}>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)'}}
      />
      {/* modal — sama persis gaya OrderInputModal */}
      <div style={{
        position:'relative',width:'100%',maxWidth:460,height:'88dvh',maxHeight:640,
        display:'flex',flexDirection:'column',
        background:C.bg,
        borderRadius:24,
        border:`1px solid ${C.bdr}`,
        boxShadow:`0 32px 80px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.70':'0.18'}), 0 8px 24px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.50':'0.10'})`,
        overflow:'hidden',
        animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* header — gradient seperti OrderInputModal */}
        <div style={{
          flexShrink:0,
          background:C.card,
          padding:'16px 24px',
          display:'flex',alignItems:'center',justifyContent:'space-between',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:ac,animation:'pulse 1.6s ease-in-out infinite',flexShrink:0}}/>
            <p style={{fontSize:20,fontWeight:600,color:C.text,letterSpacing:'-0.02em',margin:0}}>{modeLabel[mode]}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
              background:C.card2,border:`1px solid ${C.bdr}`,
              color:C.sub,cursor:'pointer',flexShrink:0,
            }}
          >
            <X style={{width:16,height:16}}/>
          </button>
        </div>
        {/* content */}
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',background:C.bg,WebkitOverflowScrolling:'touch' as any,minHeight:0}}>
          {(mode==='fastrade'||mode==='ctc')&&(
            <FastradePanel status={ftStatus} logs={ftLogs} isLoading={false} fillHeight={false} inModal={true}/>
          )}
          {mode==='aisignal'&&(
            <AISignalPanel status={aiStatus} pendingOrders={aiPending} isLoading={false} fillHeight={false} inModal={true}/>
          )}
          {mode==='indicator'&&(
            <IndicatorPanel status={indicatorStatus} isLoading={false} fillHeight={false} inModal={true}/>
          )}
          {mode==='momentum'&&(
            <MomentumPanel status={momentumStatus} isLoading={false} fillHeight={false} inModal={true}/>
          )}
          {mode==='schedule'&&(
            <SchedulePanel orders={orders} logs={logs} onOpenModal={()=>{onOpenModal();onClose();}} isRunning={isRunning} isLoading={false} fillHeight={false} inModal={true}/>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MODE PICKER MODAL
// ═══════════════════════════════════════════
const ModePickerModal: React.FC<{
  open: boolean; onClose: () => void;
  mode: TradingMode; onModeChange: (m: TradingMode) => void;
  locked: boolean; blockedModes: TradingMode[];
}> = ({ open, onClose, mode, onModeChange, locked, blockedModes }) => {
  if (!open) return null;

  const MODES = [
    { v: 'schedule'  as TradingMode, label: 'Signal Mode',           icon: <Calendar  style={{ width: 16, height: 16 }} />, accent: C.cyan,   desc: 'Manual Input Signal' },
    { v: 'fastrade'  as TradingMode, label: 'Fastrade FTT Mode',    icon: <Zap       style={{ width: 16, height: 16 }} />, accent: C.cyan,   desc: 'Fast Trade Execution' },
    { v: 'ctc'       as TradingMode, label: 'Fastrade CTC',         icon: <Copy      style={{ width: 16, height: 16 }} />, accent: C.violet, desc: 'Ultra-Fast Execution' },
    { v: 'aisignal'  as TradingMode, label: 'AI Signal Mode',       icon: <Radio     style={{ width: 16, height: 16 }} />, accent: C.sky,    desc: 'AI Signal Automation' },
    { v: 'indicator' as TradingMode, label: 'Analysis Strategy Mode', icon: <BarChart style={{ width: 16, height: 16 }} />, accent: C.orange, desc: 'Technical Analysis Based' },
    { v: 'momentum'  as TradingMode, label: 'Momentum Mode',        icon: <Waves     style={{ width: 16, height: 16 }} />, accent: C.pink,   desc: 'Parallel Momentum Analysis' },
  ];

  return (
    <div style={{position:'fixed',inset:0,zIndex:70,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      {/* backdrop */}
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      {/* sheet */}
      <div style={{
        position:'relative',width:'100%',maxWidth:420,
        background:C.bg,
        borderRadius:20,
        border:`1px solid ${C.bdr}`,
        animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
        boxShadow:`0 20px 60px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.60':'0.14'})`,
        maxHeight:'85dvh',
        overflowY:'auto',
      }}>
        {/* header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px 12px',borderBottom:`1px solid ${C.bdr}`}}>
          <div>
            <p style={{fontSize:16,fontWeight:700,color:C.text,lineHeight:1}}>Mode Trading</p>
            <p style={{fontSize:12,color:C.muted,marginTop:3}}>{locked ? T('dashboard.modePicker.activeBannerSub') : T('dashboard.modePicker.subtitle')}</p>
          </div>
          <button onClick={onClose} style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:99,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',color:C.muted}}>
            <X style={{width:14,height:14}}/>
          </button>
        </div>
        {/* lock notice banner */}
        {locked && (
          <div style={{margin:'10px 12px 0',display:'flex',alignItems:'center',gap:8,padding:'9px 12px',borderRadius:12,background:`${C.amber}10`,border:`1px solid ${C.amber}30`}}>
            <Lock style={{width:15,height:15,color:C.amber,flexShrink:0}}/>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:C.amber,lineHeight:1,marginBottom:2}}>{T('dashboard.modePicker.activeBanner')}</p>
              <p style={{fontSize:11,color:C.muted,lineHeight:1.4}}>{T('dashboard.modePicker.activeBannerSub')}</p>
            </div>
          </div>
        )}
        {/* mode list */}
        <div style={{padding:'12px',display:'flex',flexDirection:'column',gap:6}}>
          {MODES.map(({ v, label, icon, accent, desc }) => {
            const isAct = mode === v;
            const isOtherRunning = locked && !isAct; // mode lain sedang berjalan
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onModeChange(v);
                  onClose();
                }}
                style={{
                  display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                  borderRadius:14,cursor:'pointer',
                  background:isAct?`${accent}14`:C.card2,
                  border:`1px solid ${isAct?`${accent}45`:C.bdr}`,
                  opacity:isOtherRunning?0.55:1,
                  transition:'background 0.15s,border-color 0.15s',
                }}
              >
                <span style={{
                  width:38,height:38,borderRadius:11,flexShrink:0,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  background:`${accent}18`,border:`1px solid ${accent}25`,color:accent,
                }}>
                  {icon}
                </span>
                <div style={{flex:1,textAlign:'left'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{display:'block',fontSize:14,fontWeight:600,color:isAct?accent:C.sub}}>{label}</span>
                    {/* Badge hanya untuk mode yang SEDANG BERJALAN */}
                    {isAct && locked && (
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6,color:accent,background:`${accent}15`,border:`1px solid ${accent}35`,letterSpacing:'0.04em',flexShrink:0,display:'flex',alignItems:'center',gap:3}}>
                        <span style={{width:4,height:4,borderRadius:'50%',background:accent,animation:'ping 1.4s ease-in-out infinite',display:'inline-block'}}/>
                        {T('dashboard.modePicker.running')}
                      </span>
                    )}
                  </div>
                  <span style={{display:'block',fontSize:11,color:C.muted,marginTop:1}}>{desc}</span>
                </div>
                {isAct && (
                  <span style={{width:20,height:20,borderRadius:'50%',background:`${accent}18`,border:`1px solid ${accent}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:accent,flexShrink:0}}>✓</span>
                )}
              </button>
            );
          })}
          {locked && (
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:10,background:`${C.amber}08`,border:`1px solid ${C.amber}25`,marginTop:2}}>
              <Info style={{width:11,height:11,color:C.amber,flexShrink:0}}/>
              <span style={{fontSize:11,color:C.amber}}>{T('dashboard.modePicker.cannotSwitch')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MODE SESSION PANEL — FIXED
// ═══════════════════════════════════════════
//
// BUG 1 — Dropdown terpotong:
//   Parent wrapper punya `overflow:'hidden'` → dropdown `position:absolute`
//   ikut terpotong sehingga hanya beberapa item terlihat dan tidak bisa discroll.
//   FIX: hapus overflow:'hidden' dari wrapper; ubah dropdown ke position:'fixed'
//        dengan koordinat dihitung dari ref tombol agar lolos dari semua ancestor overflow.
//
// BUG 2 — Halaman hang saat scroll:
//   Backdrop `position:fixed, inset:0` yang aktif saat dropdown terbuka "menelan"
//   semua touch events termasuk scroll halaman. Perlu ditambah overscroll protection.
//   FIX: tambah `pointer-events:'none'` pada backdrop kecuali area dropdown, dan
//        pastikan dropdown wrapper tidak menghalangi scroll saat tertutup.
//
// CARA PAKAI:
//   Ganti seluruh blok komponen ModeSessionPanel di page.tsx dengan kode di bawah.
// ═══════════════════════════════════════════

// Tambahkan useRef ke import React di baris atas page.tsx jika belum ada:
// import React, { useState, useEffect, useCallback, useRef } from 'react';

const ModeSessionPanel: React.FC<{
  mode: TradingMode; onModeChange: (m: TradingMode) => void; locked: boolean;
  blockedModes: TradingMode[];
  orders: ScheduleOrder[]; logs: ExecutionLog[]; onOpenModal: () => void; isRunning: boolean;
  ftStatus: FastradeStatus | null; ftLogs: FastradeLog[]; ftLoading: boolean;
  aiStatus: AISignalStatus | null; aiPending: AISignalOrder[];
  indicatorStatus: IndicatorStatus | null;
  momentumStatus: MomentumStatus | null;
  fillHeight?: boolean;
  compact?: boolean;
  onViewSession?: () => void;
  startStopButton?: React.ReactNode;
  historyIdsRef?: React.MutableRefObject<Set<string>>;
}> = ({
  mode, onModeChange, locked, blockedModes,
  orders, logs, onOpenModal, isRunning,
  ftStatus, ftLogs, ftLoading,
  aiStatus, aiPending,
  indicatorStatus, momentumStatus, fillHeight, compact, onViewSession, startStopButton,
  historyIdsRef,
}) => {
  const { isDarkMode } = useDarkMode();
  const [modePickerOpen, setModePickerOpen] = useState(false);

  // Hitung mode yang BENAR-BENAR sedang berjalan dari semua status props,
  // bukan hanya mode yang sedang dilihat user saat ini
  const runningMode: TradingMode | '' = (()=>{
    const isFtR  = ftStatus?.isRunning ?? false;
    const isAIR  = aiStatus?.botState === 'RUNNING' || (!aiStatus?.botState && aiStatus?.isActive === true);
    const isIndR = indicatorStatus?.isRunning ?? false;
    const isMomR = momentumStatus?.isRunning ?? false;
    if(isRunning)  return 'schedule';
    if(isFtR)      return (ftStatus as any)?.mode === 'CTC' ? 'ctc' : 'fastrade';
    if(isAIR)      return 'aisignal';
    if(isIndR)     return 'indicator';
    if(isMomR)     return 'momentum';
    return '';
  })();
  const isAnyRunning = !!runningMode;

  const MODE_LIST = [
    { v: 'schedule'  as TradingMode, label: 'Signal Mode',           icon: <Calendar  style={{ width: 12, height: 12 }} />, accent: C.cyan,   desc: 'Manual Input Signal' },
    { v: 'fastrade'  as TradingMode, label: 'Fastrade FTT Mode',    icon: <Zap       style={{ width: 12, height: 12 }} />, accent: C.cyan,   desc: 'Fast Trade Execution' },
    { v: 'ctc'       as TradingMode, label: 'Fastrade CTC',         icon: <Copy      style={{ width: 12, height: 12 }} />, accent: C.violet, desc: 'Ultra-Fast Execution' },
    { v: 'aisignal'  as TradingMode, label: 'AI Signal Mode',       icon: <Radio     style={{ width: 12, height: 12 }} />, accent: C.sky,    desc: 'AI Signal Automation' },
    { v: 'indicator' as TradingMode, label: 'Analysis Strategy Mode', icon: <BarChart style={{ width: 12, height: 12 }} />, accent: C.orange, desc: 'Technical Analysis Based' },
    { v: 'momentum'  as TradingMode, label: 'Momentum Mode',        icon: <Waves     style={{ width: 12, height: 12 }} />, accent: C.pink,   desc: 'Parallel Momentum Analysis' },
  ];

  const active = MODE_LIST.find(m => m.v === mode)!;
  const ac = modeAccent(mode);

  return (
    <Card style={{
      display: 'flex', flexDirection: 'column',
      minWidth: 0, width: '100%',
      overflow: 'hidden',
      padding: 0,
    }}>
      {/* Mode picker modal — tampilkan mode yang BERJALAN bukan hanya yang dilihat */}
      <ModePickerModal
        open={modePickerOpen}
        onClose={() => setModePickerOpen(false)}
        mode={(runningMode || mode) as TradingMode}
        onModeChange={onModeChange}
        locked={locked || isAnyRunning}
        blockedModes={blockedModes}
      />

      {/* Mode picker button — di dalam card, sebagai header */}
      <button
        type="button"
        onClick={() => setModePickerOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '14px 16px',
          background: 'transparent', border: 'none',
          borderBottom: `1px solid ${C.bdr}`,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: C.muted, opacity: 0.6, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {active.icon}
          </span>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1 }}>Trading Mode</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '3px 0 0', lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.label}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {locked && (
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99,
              color: ac, background: `${ac}14`, border: `1px solid ${ac}30`, fontWeight: 600 }}>
              {T('common.active')}
            </span>
          )}
          <ChevronDown style={{ width: 14, height: 14, color: C.muted, opacity: 0.6 }}/>
        </div>
      </button>

      {/* Konten panel — di dalam card yang sama, inModal=true mencegah double Card wrapper */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: compact ? '6px 10px 10px' : '0' }}>
        {mode === 'schedule' && (
          <SchedulePanel
            orders={orders} logs={logs} onOpenModal={onOpenModal}
            isRunning={isRunning} isLoading={false} fillHeight={fillHeight}
            compact={compact} onViewSession={onViewSession}
            historyIdsRef={historyIdsRef}
            inModal
          />
        )}
        {(mode === 'fastrade' || mode === 'ctc') && (
          <FastradePanel status={ftStatus} logs={ftLogs} isLoading={ftLoading} fillHeight={fillHeight} inModal />
        )}
        {mode === 'aisignal' && (
          <AISignalPanel
            status={aiStatus} pendingOrders={aiPending}
            isLoading={false} fillHeight={fillHeight}
            inModal
          />
        )}
        {mode === 'indicator' && (
          <IndicatorPanel status={indicatorStatus} isLoading={false} fillHeight={fillHeight} inModal />
        )}
        {mode === 'momentum' && (
          <MomentumPanel status={momentumStatus} isLoading={false} fillHeight={fillHeight} inModal />
        )}
      </div>
      {/* Injected start/stop button (mobile only) */}
      {startStopButton && (
        <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
          {startStopButton}
        </div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════
// MARTINGALE DIALOG — mirip Kotlin MaxStepSelectionDialog
// ═══════════════════════════════════════════
const MartingaleDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  martingale: MartingaleConfig;
  onMartingaleChange: (c: MartingaleConfig) => void;
  mode: TradingMode;
}> = ({ open, onClose, martingale, onMartingaleChange, mode }) => {
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
        boxShadow:`0 20px 60px rgba(0,0,0,${C.bg==='#0B0C0E'?'0.55':'0.12'})`,
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
const SettingsCard: React.FC<{
  mode:TradingMode; assets:StockityAsset[];
  assetRic:string; onAssetChange:(a:StockityAsset)=>void;
  isDemo:boolean; onDemoChange:(v:boolean)=>void;
  duration:number; onDurationChange:(v:number)=>void;
  amount:number; onAmountChange:(v:number)=>void;
  martingale:MartingaleConfig; onMartingaleChange:(c:MartingaleConfig)=>void;
  ftTf:FastTradeTimeframe; onFtTfChange:(v:FastTradeTimeframe)=>void;
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
}> = ({mode,assets,assetRic,onAssetChange,isDemo,onDemoChange,duration,onDurationChange,amount,onAmountChange,martingale,onMartingaleChange,ftTf,onFtTfChange,stopLoss,onSlChange,stopProfit,onSpChange,indicatorType,onIndicatorTypeChange,indicatorPeriod,onIndicatorPeriodChange,indicatorSensitivity,onSensitivityChange,rsiOverbought,onOverboughtChange,rsiOversold,onOversoldChange,momentumPatterns,onMomentumPatternsChange,disabled}) => {
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
  const isBelowMin = amount > 0 && amount < MIN_AMOUNT;
  const isNewMode = mode==='aisignal'||mode==='indicator'||mode==='momentum';
  const modeLabel = mode==='aisignal'?'AI Signal Mode':mode==='indicator'?'Analysis Strategy Mode':mode==='momentum'?'Momentum Mode':mode==='ctc'?'Fastrade CTC':mode==='fastrade'?'Fastrade FTT Mode':'Signal Mode';
  const acctCol = isDemo ? C.amber : C.cyan;

  return (
    <>
      <MartingaleDialog open={showMartingaleDialog} onClose={()=>setShowMartingaleDialog(false)} martingale={martingale} onMartingaleChange={onMartingaleChange} mode={mode}/>
      <PickerModal open={pickerOpen==='actype'} onClose={()=>setPickerOpen(null)} title={T('dashboard.settings.accountType')} options={acOpts} value={isDemo?'demo':'real'} onSelect={v=>onDemoChange(v==='demo')} isDark={isDarkMode}/>
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
            <span style={{ fontSize:10,padding:'2px 8px',borderRadius:99,background:isDarkMode?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)',color:C.muted,border:`1px solid ${C.bdr}`,fontWeight:500 }}>{modeLabel}</span>
            {open?<ChevronUp style={{ width:14,height:14,color:C.muted }}/>:<ChevronDown style={{ width:14,height:14,color:C.muted }}/>}
          </div>
        </button>

        {open&&(
          <div style={{ padding:'18px 18px 20px',pointerEvents:disabled?'none':undefined,display:'flex',flexDirection:'column',gap:18 }}>

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
                        <div style={{ position:'absolute',right:0,marginTop:4,zIndex:60,minWidth:170,borderRadius:12,overflow:'hidden',background:isDarkMode?C.card:'#fff',border:`1px solid ${isDarkMode?C.bdr:'#D1D5DB'}`,boxShadow:'0 8px 32px rgba(0,0,0,0.25)',animation:'slide-up 0.15s ease' }}>
                          {QUICK_AMOUNTS_DYN.map((a,idx)=>{
                            const isAct=amount===a;
                            return (
                              <button key={a} type="button" onClick={()=>{onAmountChange(a);setAmtDrop(false);}} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',fontSize:13,background:isAct?`${C.cyan}12`:'transparent',borderBottom:idx<QUICK_AMOUNTS_DYN.length-1?`1px solid ${isDarkMode?C.bdr:'rgba(60,60,67,0.1)'}`:'none',borderLeft:isAct?`2px solid ${C.cyan}`:'2px solid transparent',borderTop:'none',borderRight:'none',color:isAct?C.cyan:C.sub,fontWeight:isAct?700:400,cursor:'pointer' }}>
                                <span>{a>=1000000?`${CURR_UNIT} ${a/1000000}M`:`${CURR_UNIT} ${(a/1000).toFixed(a%1000===0?0:1)}K`}</span>
                                {isAct&&<span style={{ color:C.cyan }}>✓</span>}
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

            {/* Risk Management — Kotlin StopLossProfitCard style */}
            {(mode!=='aisignal')&&(
              <div>
                <div style={{ height:1,background:C.bdr,marginBottom:16 }}/>
                <SL accent="rgba(255,69,58,0.55)">Risk Management</SL>

                {/* Toggle Buttons Row */}
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:(slEnabled&&showSlInput)||(spEnabled&&showSpInput)?12:0 }}>
                  {/* Stop Loss Button */}
                  <button
                    onClick={()=>{
                      if(disabled) return;
                      const next = !slEnabled;
                      setSlEnabled(next);
                      if(next){ setShowSlInput(true); }
                      else{ onSlChange(0); setShowSlInput(false); setSlInputValue(''); }
                    }}
                    disabled={disabled}
                    style={{
                      height:42,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                      background: slEnabled ? `${C.coral}14` : C.card2,
                      border: `1px solid ${slEnabled ? `${C.coral}50` : C.bdr}`,
                      color: slEnabled ? C.coral : C.sub,
                      fontSize:12,fontWeight:600,
                      cursor:disabled?'not-allowed':'pointer',
                      transition:'all 0.15s',
                    }}
                  >
                    <TrendingDown style={{ width:13,height:13,flexShrink:0 }}/>
                    Stop Loss
                  </button>

                  {/* Target Profit Button */}
                  <button
                    onClick={()=>{
                      if(disabled) return;
                      const next = !spEnabled;
                      setSpEnabled(next);
                      if(next){ setShowSpInput(true); }
                      else{ onSpChange(0); setShowSpInput(false); setSpInputValue(''); }
                    }}
                    disabled={disabled}
                    style={{
                      height:42,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                      background: spEnabled ? `${C.cyan}14` : C.card2,
                      border: `1px solid ${spEnabled ? `${C.cyan}50` : C.bdr}`,
                      color: spEnabled ? C.cyan : C.sub,
                      fontSize:12,fontWeight:600,
                      cursor:disabled?'not-allowed':'pointer',
                      transition:'all 0.15s',
                    }}
                  >
                    <TrendingUp style={{ width:13,height:13,flexShrink:0 }}/>
                    Target Profit
                  </button>
                </div>

                {/* Summary info — tampil di bawah tombol saat panel tertutup, grid 2 kolom sejajar tombol */}
                {((slEnabled&&stopLoss>0&&!showSlInput)||(spEnabled&&stopProfit>0&&!showSpInput))&&(
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                    {/* Kolom kiri: Stop Loss info atau placeholder kosong */}
                    {slEnabled&&stopLoss>0&&!showSlInput ? (
                      <button
                        onClick={()=>!disabled&&setShowSlInput(true)}
                        disabled={disabled}
                        style={{
                          display:'flex',flexDirection:'column',alignItems:'flex-start',
                          gap:3,padding:'9px 12px',borderRadius:12,textAlign:'left',
                          background:`${C.coral}10`,
                          border:`1px solid ${C.coral}45`,
                          borderLeft:`3px solid ${C.coral}`,
                          cursor:disabled?'not-allowed':'pointer',
                        }}
                      >
                        <div style={{ display:'flex',alignItems:'center',gap:5 }}>
                          <TrendingDown style={{ width:11,height:11,color:C.coral,flexShrink:0 }}/>
                          <span style={{ fontSize:9,fontWeight:600,color:C.muted,letterSpacing:'0.06em',textTransform:'uppercase' }}>Stop Loss</span>
                        </div>
                        <span style={{ fontSize:13,fontWeight:700,color:C.coral,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',lineHeight:1 }}>
                          {CURR_UNIT} {FMT(stopLoss)}
                        </span>
                      </button>
                    ) : <div/>}

                    {/* Kolom kanan: Target Profit info atau placeholder kosong */}
                    {spEnabled&&stopProfit>0&&!showSpInput ? (
                      <button
                        onClick={()=>!disabled&&setShowSpInput(true)}
                        disabled={disabled}
                        style={{
                          display:'flex',flexDirection:'column',alignItems:'flex-start',
                          gap:3,padding:'9px 12px',borderRadius:12,textAlign:'left',
                          background:`${C.cyan}10`,
                          border:`1px solid ${C.cyan}45`,
                          borderLeft:`3px solid ${C.cyan}`,
                          cursor:disabled?'not-allowed':'pointer',
                        }}
                      >
                        <div style={{ display:'flex',alignItems:'center',gap:5 }}>
                          <TrendingUp style={{ width:11,height:11,color:C.cyan,flexShrink:0 }}/>
                          <span style={{ fontSize:9,fontWeight:600,color:C.muted,letterSpacing:'0.06em',textTransform:'uppercase' }}>Target Profit</span>
                        </div>
                        <span style={{ fontSize:13,fontWeight:700,color:C.cyan,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',lineHeight:1 }}>
                          {CURR_UNIT} {FMT(stopProfit)}
                        </span>
                      </button>
                    ) : <div/>}
                  </div>
                )}

                {/* Stop Loss Input Panel — Kotlin: AnimatedVisibility */}
                {slEnabled&&showSlInput&&(
                  <div style={{
                    background:C.card2,borderRadius:16,
                    border:`1px solid ${C.coral}80`,
                    padding:16,marginBottom:10,
                    display:'flex',flexDirection:'column',gap:12,
                  }}>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                      <span style={{ color:C.coral,fontSize:14,fontWeight:700 }}>Stop Loss Settings</span>
                      <button onClick={()=>setShowSlInput(false)} style={{ background:'none',border:'none',cursor:'pointer',padding:4,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <X style={{ width:18,height:18,color:C.coral }}/>
                      </button>
                    </div>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                      <input
                        className="ds-input"
                        value={slInputValue}
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
                        style={{ paddingLeft:30,borderColor:`${C.coral}aa` }}
                      />
                    </div>
                    {stopLoss>0&&(
                      <div style={{ background:C.card,borderRadius:10,padding:'10px 12px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                        <span style={{ color:C.sub,fontSize:11,fontWeight:500 }}>Maks. Loss Saat Ini</span>
                        <span style={{ color:C.coral,fontSize:13,fontWeight:700 }}>{CURR_UNIT} {FMT(stopLoss)}</span>
                      </div>
                    )}
                    <span style={{ color:C.muted,fontSize:10,lineHeight:'1.4' }}>Format: angka biasa, K (ribu), M (juta), B (miliar)</span>
                  </div>
                )}

                {/* Target Profit Input Panel */}
                {spEnabled&&showSpInput&&(
                  <div style={{
                    background:C.card2,borderRadius:16,
                    border:`1px solid ${C.cyan}80`,
                    padding:16,
                    display:'flex',flexDirection:'column',gap:12,
                  }}>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                      <span style={{ color:C.cyan,fontSize:14,fontWeight:700 }}>Target Profit Settings</span>
                      <button onClick={()=>setShowSpInput(false)} style={{ background:'none',border:'none',cursor:'pointer',padding:4,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <X style={{ width:18,height:18,color:C.cyan }}/>
                      </button>
                    </div>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:11,color:C.muted,zIndex:1,pointerEvents:'none' }}>{CURR_UNIT}</span>
                      <input
                        className="ds-input"
                        value={spInputValue}
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
                        style={{ paddingLeft:30,borderColor:`${C.cyan}aa` }}
                      />
                    </div>
                    {stopProfit>0&&(
                      <div style={{ background:C.card,borderRadius:10,padding:'10px 12px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                        <span style={{ color:C.sub,fontSize:11,fontWeight:500 }}>Target Profit Saat Ini</span>
                        <span style={{ color:C.cyan,fontSize:13,fontWeight:700 }}>{CURR_UNIT} {FMT(stopProfit)}</span>
                      </div>
                    )}
                    <span style={{ color:C.muted,fontSize:10,lineHeight:'1.4' }}>Format: angka biasa, K (ribu), M (juta), B (miliar)</span>
                  </div>
                )}
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
const ControlCard: React.FC<{
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
  const stateBg: Record<string,string> = {
    [T('dashboard.botStatus.running')]: 'rgba(16,185,129,0.12)',
    [T('dashboard.botStatus.paused')]:  'rgba(255,170,0,0.12)',
    [T('dashboard.botStatus.stopped')]: 'rgba(255,77,77,0.10)',
  };

  return (
    <Card>
      {/* ── Header: LEFT-aligned title + state pill + chevron ── */}
      <button onClick={()=>setOpen(!open)} style={{
        width:'100%',display:'flex',alignItems:'center',gap:10,
        padding:'16px 18px',background:'transparent',border:'none',
        borderBottom:open?`1px solid ${C.bdr}`:'none',cursor:'pointer',
        textAlign:'left',
      }}>
        {/* icon badge */}
        <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:`${ac}14`,border:`1px solid ${ac}30`}}>
          <span style={{color:ac}}>{modeIcon}</span>
        </div>
        {/* title — left-aligned */}
        <div style={{flex:1,minWidth:0,textAlign:'left',overflow:'hidden'}}>
          <span style={{fontSize:'clamp(11px,3.8vw,16px)',fontWeight:700,color:C.text,display:'block',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Bot Control</span>
          <span style={{fontSize:10.5,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}>{modeLabel} · {modeSub}</span>
        </div>
        {/* state pill */}
        <div style={{
          display:'flex',alignItems:'center',gap:5,
          padding:'4px 10px',borderRadius:99,flexShrink:0,
          background:stateBg[stateLabel]??`${C.muted}10`,
        }}>
          <span style={{
            width:7,height:7,borderRadius:'50%',flexShrink:0,
            background:stateCol,
            animation:canStopBot&&!canResumeBot?'ping 1.6s ease-in-out infinite':undefined,
          }}/>
          <span style={{fontSize:11,fontWeight:600,color:stateCol}}>{stateLabel}</span>
        </div>
        <div style={{width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:open?`${ac}18`:C.card2,border:`1px solid ${open?`${ac}45`:C.bdr}`,transition:'all 0.2s',flexShrink:0}}>
          {open?<ChevronUp style={{width:15,height:15,color:ac}}/>:<ChevronDown style={{width:15,height:15,color:ac}}/>}
        </div>
      </button>

      {open&&(
        <div style={{padding:'16px 18px 18px',display:'flex',flexDirection:'column',gap:12}}>

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
const DarkModeToggleStrip: React.FC<{
  isDarkMode: boolean;
  onToggle: () => void;
  C: ReturnType<typeof getColors>;
}> = ({ isDarkMode, onToggle, C }) => (
  <button
    onClick={onToggle}
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 14,
      background: C.card,
      border: `1px solid ${C.bdr}`,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {/* Icon */}
    <div style={{
      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.faint, border: `1px solid ${C.bdr}`,
    }}>
      {isDarkMode
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      }
    </div>

    {/* Label */}
    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'left' }}>
      {isDarkMode ? T('dashboard.darkMode') : T('dashboard.lightMode')}
    </span>

    {/* Toggle switch */}
    <div style={{
      width: 44, height: 26, borderRadius: 26, flexShrink: 0,
      position: 'relative', transition: 'background 0.3s',
      background: isDarkMode ? C.cyan : 'rgba(120,120,128,0.18)',
    }}>
      <div style={{
        position: 'absolute', top: 3,
        width: 20, height: 20, borderRadius: '50%',
        transition: 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        left: isDarkMode ? 21 : 3,
        background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.20)',
      }} />
    </div>
  </button>
);

export default function DashboardPage() {
  const router = useRouter();
  const { t, language, setLanguage: setLanguageHook } = useLanguage();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const colors = useMemo(() => getColors(isDarkMode), [isDarkMode]);
  // ✅ FIX: Update module-level C so all sub-components use the correct theme
  C = colors;
  T = t;

  // ── Currency config dari Stockity API (amounts, unit, min, max per negara) ──
  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig>(DEFAULT_CURRENCY_CONFIG);

  // Update module-level formatters setiap render — pola sama dengan C dan T di atas
  const intlLocale = langToIntlLocale(language);
  FMT         = (n: number) => Math.round(n).toLocaleString(intlLocale, { maximumFractionDigits: 0 });
  CURR_UNIT   = currencyConfig.currencyUnit;
  MIN_AMOUNT  = currencyConfig.minAmount;
  QUICK_AMOUNTS_DYN = currencyConfig.quickAmounts;
  const isMounted = useRef(true);
  useEffect(()=>{isMounted.current=true;return()=>{isMounted.current=false;};},[]);

  // ── Re-sync currency dari session storage saat tab kembali visible ───────
  // Skenario: user ganti currency di halaman Profile, lalu kembali ke Dashboard.
  // Tanpa ini, Dashboard tetap pakai currencyConfig lama yang di-load saat mount.
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { storage: _st, SESSION_KEYS: _sk } = await import('@/lib/storage');
        const sessionIso  = await _st.get(_sk.CURRENCY);
        const sessionUnit = await _st.get(_sk.CURRENCY_ISO);
        if (!sessionIso) return;
        setCurrencyConfig(prev => {
          // Hanya update jika memang berbeda — hindari re-render sia-sia
          if (prev.currencyIso === sessionIso && prev.currencyUnit === (sessionUnit ?? prev.currencyUnit)) return prev;
          return {
            ...prev,
            currencyIso:  sessionIso,
            currencyUnit: sessionUnit ?? prev.currencyUnit,
          };
        });
      } catch { /* silent — jangan crash dashboard */ }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load currency config & sync language dari profil akun ───────────────
  // Urutan prioritas:
  //   1. api.currencyConfig() → stcvps backend proxy → Stockity server-side (bebas CORS)
  //      Returns full CurrencyConfig: minAmount, maxAmount, quickAmounts, currencyIso, currencyUnit
  //   2. Fallback ke session storage (stc_currency + stc_currency_iso) jika backend gagal
  //   3. Bahasa UI: dibaca dari stc_language + stc_account_country (di-set oleh runSplash di login).
  //      Juga di-sync dari profile API response sebagai safety net.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { storage, SESSION_KEYS } = await import('@/lib/storage');
        const authToken = await storage.get(SESSION_KEYS.AUTHTOKEN);
        const deviceId  = await storage.get(SESSION_KEYS.DEVICE_ID);
        const country   = await storage.get('stc_account_country');

        if (!authToken || !deviceId) return;
        if (cancelled) return;

        // Terapkan bahasa UI dari country akun (session storage).
        // Safety net: jika runSplash di login belum sempat set, ini menangkapnya.
        if (country) {
          applyLanguageFromCountry(country, setLanguageHook);
        }

        // ── SYNC LANGUAGE & CURRENCY DARI PROFILE API ───────────────────────
        // Fallback jika session storage tidak punya country/currency data.
        // Profile API mengembalikan country/registrasi country yang akurat.
        let profileCountry = country;
        let profileCurrency = '';
        try {
          const prof = await api.getProfile();
          if (!cancelled && prof) {
            profileCountry = prof.country || prof.registrationCountryIso || country;
            // ✅ FIX: Juga baca currency dari profile jika tersedia
            profileCurrency = (prof as any).currency || '';
            if (profileCountry && !country) {
              applyLanguageFromCountry(profileCountry, setLanguageHook);
            }
          }
        } catch {
          // Profile fetch gagal (misal 401) — biarkan session-based language yang berlaku
        }
        // ─────────────────────────────────────────────────────────────────────

        // ✅ FIX CURRENCY: Coba baca currency dari balance API sebagai safety net
        // Ini menangani kasus di mana session storage masih IDR tapi user sebenarnya COP
        let balanceCurrency = '';
        try {
          const bal = await api.balance();
          if (bal?.currency && bal.currency !== 'IDR') {
            balanceCurrency = bal.currency;
            // Update session storage dengan currency yang benar
            await storage.set(SESSION_KEYS.CURRENCY, bal.currency);
            const unit = ISO_TO_UNIT[bal.currency] ?? bal.currency;
            await storage.set(SESSION_KEYS.CURRENCY_ISO, unit);
            console.log('[Dashboard] Currency synced from balance:', bal.currency, unit);
          }
        } catch {
          // Balance fetch gagal — gunakan session storage
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Fetch full CurrencyConfig via backend proxy (bebas CORS) ───────────
        // api.currencyConfig() → stcvps /profile/currency-config → Stockity server-side.
        // Returns minAmount, maxAmount, quickAmounts, currencyIso, currencyUnit — lengkap.
        // Tidak ada direct request ke Stockity dari browser → tidak ada CORS error.
        try {
          const config = await api.currencyConfig();
          if (!cancelled) {
            setCurrencyConfig(config);
            if (_s.amount === 0) _upd('amount', config.minAmount);
          }
        } catch (fetchErr) {
          // Fallback: pakai currency dari balance/session jika backend juga gagal
          console.warn('[Dashboard] currencyConfig gagal, pakai session fallback:', fetchErr);
          if (!cancelled) {
            const sessionCurrencyIso  = balanceCurrency
              || await storage.get(SESSION_KEYS.CURRENCY)
              || 'IDR';
            const sessionCurrencyUnit = await storage.get(SESSION_KEYS.CURRENCY_ISO);
            const resolvedUnit =
              sessionCurrencyUnit && sessionCurrencyUnit !== 'Rp'
                ? sessionCurrencyUnit
                : (ISO_TO_UNIT[sessionCurrencyIso] ?? sessionCurrencyIso);
            setCurrencyConfig({
              ...DEFAULT_CURRENCY_CONFIG,
              currencyIso:  sessionCurrencyIso,
              currencyUnit: resolvedUnit,
            });
          }
        }
      } catch (e) {
        console.warn('[Dashboard] Failed to load currency config:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // State
  const [assets,setAssets] = useState<StockityAsset[]>([]);
  const [balance,setBalance] = useState<ProfileBalance|null>(null);
  const [scheduleStatus,setScheduleStatus] = useState<ScheduleStatus|null>(null);
  const [scheduleOrders,setScheduleOrders] = useState<ScheduleOrder[]>([]);
  const [scheduleLogs,setScheduleLogs] = useState<ExecutionLog[]>([]);

  // ── Persistent schedule history — survive modal open/close ───────────────
  // PENTING: state ini HARUS di DashboardPage (bukan di modal) karena
  // OrderInputModal unmount setiap kali ditutup (if !open return null).
  // Kalau di modal: history hilang saat modal ditutup → saat dibuka lagi
  // hanya order SKIP saat ini yang tampil, WIN/LOSE yang sudah dihapus server hilang.
  const [scheduleHistoryOrders, setScheduleHistoryOrders] = useState<ScheduleOrder[]>([]);
  const scheduleHistoryIdsRef  = useRef<Set<string>>(new Set());
  const schedulePrevOrdersRef  = useRef<ScheduleOrder[]>([]);
  const [ftStatus,setFtStatus] = useState<FastradeStatus|null>(null);
  const [ftLogs,setFtLogs] = useState<FastradeLog[]>([]);
  const [isLoading,setIsLoading] = useState(true);

  const [aiStatus,setAiStatus] = useState<AISignalStatus|null>(null);
  const [aiPendingOrders,setAiPendingOrders] = useState<AISignalOrder[]>([]);
  const [indicatorStatus,setIndicatorStatus] = useState<IndicatorStatus|null>(null);
  const [momentumStatus,setMomentumStatus] = useState<MomentumStatus|null>(null);
  const [todayProfitData,setTodayProfitData] = useState<TodayProfitSummary|null>(null);
  const [profitRefreshing,setProfitRefreshing] = useState(false);
  const [profitLastUpdated,setProfitLastUpdated] = useState<number|null>(null);
  // ✅ FIX FLICKER: stableProfitRef — menyimpan nilai profit terakhir yang VALID (non-null, dari data yg credible).
  //    Gunakan ref ini sebagai "source of truth" untuk display, sementara todayProfitData state tetap di-update normal.
  //    Ini mencegah flicker ke 0 saat transient data 0 dari backend race condition.
  const stableProfitRef = useRef<number>(0);

  // ── Persistent trading settings (auto-save ke localStorage) ────────────────
  const { settings: _s, loaded: settingsLoaded, update: _upd } = useTradingSettings();

  const tradingMode          = _s.tradingMode;
  const selectedRic          = _s.selectedRic;
  const isDemo               = _s.isDemo;
  // ✅ FIX stale closure: useEffect dengan [] tidak bisa baca isDemo terbaru.
  // isDemoRef selalu up-to-date sehingga aman dipakai di polling intervals.
  const isDemoRef = useRef(isDemo);
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);
  const duration             = _s.duration;
  const amount               = _s.amount;
  const martingale           = _s.martingale;
  const ftTf                 = _s.ftTf;
  const stopLoss             = _s.stopLoss;
  const stopProfit           = _s.stopProfit;
  const indicatorType        = _s.indicatorType;
  const indicatorPeriod      = _s.indicatorPeriod;
  const indicatorSensitivity = _s.indicatorSensitivity;
  const rsiOverbought        = _s.rsiOverbought;
  const rsiOversold          = _s.rsiOversold;
  const momentumPatterns     = _s.momentumPatterns;

  const setTradingMode          = (v: TradingMode)                               => _upd('tradingMode', v);
  const setSelectedRic          = (v: string)                                    => _upd('selectedRic', v);
  const setIsDemo               = (v: boolean)                                   => _upd('isDemo', v);
  const setDuration             = (v: number)                                    => _upd('duration', v);
  const setAmount               = (v: number)                                    => _upd('amount', v);
  const setMartingale           = (v: MartingaleConfig)                          => _upd('martingale', v);
  const setFtTf                 = (v: FastTradeTimeframe)                        => _upd('ftTf', v);
  const setStopLoss             = (v: number)                                    => _upd('stopLoss', v);
  const setStopProfit           = (v: number)                                    => _upd('stopProfit', v);
  const setIndicatorType        = (v: IndicatorType)                              => _upd('indicatorType', v);
  const setIndicatorPeriod      = (v: number)                                    => _upd('indicatorPeriod', v);
  const setIndicatorSensitivity = (v: number)                                    => _upd('indicatorSensitivity', v);
  const setRsiOverbought        = (v: number)                                    => _upd('rsiOverbought', v);
  const setRsiOversold          = (v: number)                                    => _upd('rsiOversold', v);
  const setMomentumPatterns     = (v: typeof _s.momentumPatterns)               => _upd('momentumPatterns', v);
  // ─────────────────────────────────────────────────────────────────────────────

  const [error,setError] = useState<string|null>(null);
  const [actionLoading,setActionLoading] = useState(false);
  const [orderModalOpen,setOrderModalOpen] = useState(false);
  const [orderModalInitialView,setOrderModalInitialView] = useState<'list'|'input'>('list');
  const [addOrderLoading,setAddOrderLoading] = useState(false);
  // ✅ FIX: Deteksi device SEKALI saat mount, tidak pakai resize listener
  // (resize listener → re-render saat keyboard muncul di mobile)
  const [deviceType,setDeviceType] = useState<'mobile'|'tablet'|'desktop'>('mobile');

  const [isModeChosen, setIsModeChosen] = useState(false);
  const [mobileSessionOpen,setMobileSessionOpen] = useState(false);
  const [mobileModePickerOpen,setMobileModePickerOpen] = useState(false);
  const [assetPickerOpen,setAssetPickerOpen] = useState(false);
  const [flash,setFlash] = useState<'win'|'lose'|null>(null);
  const prevWRef = useRef(0), prevLRef = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const flashResult = useCallback((r:'win'|'lose')=>{
    if(flashTimer.current)clearTimeout(flashTimer.current);
    setFlash(r); flashTimer.current=setTimeout(()=>setFlash(null),2500);
  },[]);
  // ✅ FIX delay: Deteksi order selesai dari SEMUA mode → langsung refresh profit
  // Sebelumnya hanya ftStatus yang diwatch, dan tidak ada trigger refresh profit sama sekali.
  // Sekarang: deteksi dari ftStatus + scheduleLogs + aiStatus + indicatorStatus + momentumStatus
  const prevSchLogLen  = useRef(0);
  const prevAiWins     = useRef(0);
  const prevIndWins    = useRef(0);
  const prevMomWins    = useRef(0);
  const profitRefTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Silent profit refresh — dipanggil otomatis saat order selesai (no loading state) ──
  // ✅ FIX delay: Tidak pakai profitRefreshing guard agar bisa jalan paralel dengan manual refresh
  const silentRefreshProfit = useCallback(async () => {
    try {
      const result = await api.realtimeProfit(isDemoRef.current ? 'demo' : 'real');
      if (!isMounted.current) return;

      // ✅ FIX FLICKER: Robust stale-protection
      setTodayProfitData(prev => {
        if (!prev) return result; // pertama kali → trust
        if (prev.totalPnL !== 0 && result.totalPnL === 0 && result.totalTrades <= prev.totalTrades) {
          // Transient 0 dari race condition → pertahankan data lama
          return prev;
        }
        if (result.totalTrades > 0 || result.totalPnL !== 0) {
          // Data baru valid → update stable ref juga
          stableProfitRef.current = result.totalPnL;
        }
        return result;
      });
      setProfitLastUpdated(Date.now());
    } catch (e) {
      console.warn('[Profit] silent refresh error:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: debounce agar tidak spam jika beberapa mode selesai bersamaan
  const triggerProfitRefresh = useCallback((delaySec: number = 2) => {
    if (profitRefTimer.current) clearTimeout(profitRefTimer.current);
    profitRefTimer.current = setTimeout(() => silentRefreshProfit(), delaySec * 1000);
  }, [silentRefreshProfit]);

  useEffect(()=>{
    const w=ftStatus?.totalWins??0, l=ftStatus?.totalLosses??0;
    const prevW = prevWRef.current, prevL = prevLRef.current;
    if(w>prevW&&(prevW+prevL)>0){ flashResult('win');  triggerProfitRefresh(1.5); }
    else if(l>prevL&&(prevW+prevL)>0){ flashResult('lose'); triggerProfitRefresh(1.5); }
    prevWRef.current=w; prevLRef.current=l;
  },[ftStatus?.totalWins,ftStatus?.totalLosses]); // eslint-disable-line

  // Schedule mode: deteksi dari panjang logs (order baru = trade selesai)
  useEffect(()=>{
    const len = scheduleLogs?.length ?? 0;
    if (len > prevSchLogLen.current && prevSchLogLen.current > 0) {
      triggerProfitRefresh(2);
    }
    prevSchLogLen.current = len;
  },[scheduleLogs?.length]); // eslint-disable-line

  // AI Signal mode
  useEffect(()=>{
    const w = aiStatus?.totalWins ?? 0;
    if (w > prevAiWins.current && prevAiWins.current >= 0) { triggerProfitRefresh(2); }
    prevAiWins.current = w;
  },[aiStatus?.totalWins]); // eslint-disable-line

  // Indicator & Momentum mode (totalWins jika ada, fallback ke logs count)
  useEffect(()=>{
    const w = (indicatorStatus as any)?.totalWins ?? 0;
    if (w > prevIndWins.current && prevIndWins.current >= 0) { triggerProfitRefresh(2); }
    prevIndWins.current = w;
  },[( indicatorStatus as any)?.totalWins]); // eslint-disable-line

  useEffect(()=>{
    const w = (momentumStatus as any)?.totalWins ?? 0;
    if (w > prevMomWins.current && prevMomWins.current >= 0) { triggerProfitRefresh(2); }
    prevMomWins.current = w;
  },[(momentumStatus as any)?.totalWins]); // eslint-disable-line

  // ── Akumulasi schedule history di parent ─────────────────────────────────
  //
  // ROOT CAUSE (dari analisis backend):
  //   Backend completeOrder() langsung hapus order via splice() TANPA nulis result
  //   ke ScheduledOrder. result hanya ada di ExecutionLog + OrderTracking.
  //   Akibatnya: order yang selesai hilang dari list dengan state terakhir
  //   {isExecuted:true, isSkipped:false, result:undefined} → resolvePhase='monitoring'.
  //
  // STRATEGI FIX (3 lapis):
  //   Lapis 1 – /schedule/tracking: source of truth, menyimpan SEMUA order +
  //             trackingStatus final (WIN/LOSE/SKIPPED/...). Trigger setiap
  //             scheduleOrders atau scheduleLogs berubah.
  //   Lapis 2 – scheduleLogs (sekarang fresh karena ikut polling): enrich
  //             removedFinished dengan result dari log.
  //   Lapis 3 – justFinished: order yang masih di list dan sudah terminal.

  useEffect(() => {
    let cancelled = false;

    // ── Lapis 1: Fetch /schedule/tracking sebagai source of truth ────────────
    const syncFromTracking = async () => {
      try {
        const tracking = await api.scheduleTracking();
        if (cancelled || !isMounted.current) return;

        const TERMINAL = new Set(['WIN', 'LOSE', 'DRAW', 'FAILED', 'SKIPPED']);

        // Map TrackingOrder → ScheduleOrder dengan result yang benar
        const terminalFromTracking = tracking.orders
          .filter(o => TERMINAL.has(o.trackingStatus))
          .map(o => {
            // Normalkan result dari trackingStatus
            let result: string | undefined = o.result;
            if (!result || result === 'SKIPPED') {
              if (o.trackingStatus === 'WIN')     result = 'WIN';
              else if (o.trackingStatus === 'LOSE')    result = 'LOSE';
              else if (o.trackingStatus === 'DRAW')    result = 'DRAW';
              else if (o.trackingStatus === 'FAILED')  result = 'FAILED';
              else if (o.trackingStatus === 'SKIPPED') result = 'SKIPPED';
            }
            return {
              ...o,
              result,
              isExecuted: o.isExecuted || TERMINAL.has(o.trackingStatus),
              // isSkipped hanya true untuk SKIPPED/FAILED, bukan WIN/LOSE
              isSkipped: o.trackingStatus === 'SKIPPED' || o.trackingStatus === 'FAILED',
            } as unknown as ScheduleOrder;
          });

        // Tambah order baru ke history (yang belum ada)
        const newEntries = terminalFromTracking.filter(
          o => !scheduleHistoryIdsRef.current.has(o.id)
        );
        if (newEntries.length > 0) {
          newEntries.forEach(o => scheduleHistoryIdsRef.current.add(o.id));
          setScheduleHistoryOrders(prev => {
            // Replace entri lama yang mungkin stale (tanpa result)
            const existingIds = new Set(newEntries.map(o => o.id));
            return [...newEntries, ...prev.filter(o => !existingIds.has(o.id))];
          });
        } else {
          // Patch entri yang sudah ada tapi result masih kosong
          setScheduleHistoryOrders(prev => {
            const byId = new Map(terminalFromTracking.map(o => [o.id, o]));
            let changed = false;
            const updated = prev.map(o => {
              if (o.result && !/^SKIPPED$/i.test(o.result)) return o; // sudah punya result valid
              const fresh = byId.get(o.id);
              if (!fresh?.result) return o;
              changed = true;
              return fresh;
            });
            return changed ? updated : prev;
          });
        }
      } catch {
        // tracking endpoint gagal → tetap jalan dengan fallback di bawah
      }
    };

    syncFromTracking();

    // ── Lapis 2 & 3: Fallback legacy (pakai logs + diff list) ────────────────
    const getLogForOrder = (o: ScheduleOrder): ExecutionLog | undefined =>
      scheduleLogs.find(l => l.orderId === o.id) ?? scheduleLogs.find(l => l.time === o.time);

    const prev    = schedulePrevOrdersRef.current;
    const currIds = new Set(scheduleOrders.map(o => o.id));

    // Lapis 2: Order hilang dari list → enrich dengan log (logs kini fresh dari polling)
    const removedRaw = prev.filter(
      o => !currIds.has(o.id) && !scheduleHistoryIdsRef.current.has(o.id)
    );
    const removedFinished = removedRaw.map(o => {
      const log = getLogForOrder(o);
      if (!log?.result) return o;
      const resultUp = log.result.toUpperCase();
      return {
        ...o,
        result:     log.result,
        isExecuted: true,
        isSkipped:  resultUp === 'WIN' || resultUp === 'LOSE' || resultUp === 'DRAW'
          ? false : o.isSkipped,
      } as ScheduleOrder;
    });

    // Lapis 3: Order masih di list, tapi sudah terminal
    const justFinished = scheduleOrders.filter(o => {
      if (scheduleHistoryIdsRef.current.has(o.id)) return false;
      const ph = resolvePhase(o, getLogForOrder);
      return ph === 'win' || ph === 'lose' || ph === 'skipped';
    });

    const toAdd = [...removedFinished, ...justFinished].filter(
      o => !scheduleHistoryIdsRef.current.has(o.id)
    );
    if (toAdd.length > 0) {
      toAdd.forEach(o => scheduleHistoryIdsRef.current.add(o.id));
      setScheduleHistoryOrders(h => [...toAdd, ...h]);
    }

    // Patch entri stale yang result-nya kosong (log baru tiba di poll berikutnya)
    setScheduleHistoryOrders(prev => {
      let changed = false;
      const updated = prev.map(o => {
        if (o.result) return o;
        const log = getLogForOrder(o);
        if (!log?.result) return o;
        changed = true;
        const resultUp = log.result.toUpperCase();
        return {
          ...o,
          result:     log.result,
          isExecuted: true,
          isSkipped:  resultUp === 'WIN' || resultUp === 'LOSE' || resultUp === 'DRAW'
            ? false : o.isSkipped,
        } as ScheduleOrder;
      });
      return changed ? updated : prev;
    });

    schedulePrevOrdersRef.current = scheduleOrders;
    return () => { cancelled = true; };
  }, [scheduleOrders, scheduleLogs]); // eslint-disable-line

  const [modeBlock,setModeBlock] = useState<string|null>(null);
  const mbTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const showBlock=(msg:string)=>{
    if(mbTimer.current)clearTimeout(mbTimer.current);
    setModeBlock(msg); mbTimer.current=setTimeout(()=>setModeBlock(null),3500);
  };

  // ✅ FIX: Device detection sekali saat mount saja
  useEffect(()=>{
    const w = window.innerWidth;
    setDeviceType(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
  },[]);

  const loadAll = useCallback(async(silent=false)=>{
    if(!silent)setIsLoading(true);
    try{
      const [assRes,balRes,schRes,ordRes,logRes,ftRes,ftLogRes,aiRes,aiPendRes,indRes,momRes,tpRes] = await Promise.allSettled([
        api.getAssets(),api.balance(),api.scheduleStatus(),
        api.getOrders(),
        api.scheduleLogs(500),
        api.fastradeStatus(),
        api.fastradeLogs(500),
        api.aiSignalStatus(),api.aiSignalPendingOrders(),
        api.indicatorStatus(),api.momentumStatus(),
        // ✅ FIX FLICKER: gunakan realtimeProfit (bukan todayProfit) agar sesi aktif
        // langsung tercermin sejak load pertama. todayProfit hanya berisi data committed
        // ke DB — selama sesi berjalan nilainya 0/stale → menyebabkan flash ke 0.
        // isDemoRef.current agar tidak stale closure saat loadAll pertama dipanggil.
        api.realtimeProfit(isDemoRef.current ? 'demo' : 'real'),
      ]);
      if(!isMounted.current)return;
      if(assRes.status==='fulfilled')setAssets(assRes.value);
      if(balRes.status==='fulfilled')setBalance(balRes.value);
      if(schRes.status==='fulfilled')setScheduleStatus(schRes.value);
      if(ordRes.status==='fulfilled')setScheduleOrders(ordRes.value);
      if(logRes.status==='fulfilled')setScheduleLogs(logRes.value);
      if(ftRes.status==='fulfilled')setFtStatus(ftRes.value);
      if(ftLogRes.status==='fulfilled')setFtLogs(ftLogRes.value);
      if(aiRes.status==='fulfilled')setAiStatus(aiRes.value);
      if(aiPendRes.status==='fulfilled')setAiPendingOrders(aiPendRes.value);
      if(indRes.status==='fulfilled')setIndicatorStatus(indRes.value);
      if(momRes.status==='fulfilled')setMomentumStatus(momRes.value);
      if(tpRes.status==='fulfilled'){
        const newTp = tpRes.value;
        // ✅ FIX FLICKER: Robust stale-protection dengan stable ref update
        setTodayProfitData(prev => {
          if (!prev) { stableProfitRef.current = newTp.totalPnL; return newTp; }
          if (prev.totalPnL !== 0 && newTp.totalPnL === 0 && newTp.totalTrades <= prev.totalTrades) {
            return prev; // transient 0 → skip
          }
          if (newTp.totalTrades > 0 || newTp.totalPnL !== 0) {
            stableProfitRef.current = newTp.totalPnL; // update stable ref
          }
          return newTp;
        });
        setProfitLastUpdated(Date.now());
      }

      // ✅ FIX: Auto-detect mode aktif hanya saat load pertama (bukan silent)
      if (!silent) {
        const ftData  = ftRes.status  === 'fulfilled' ? ftRes.value  : null;
        const aiData  = aiRes.status  === 'fulfilled' ? aiRes.value  : null;
        const indData = indRes.status === 'fulfilled' ? indRes.value : null;
        const momData = momRes.status === 'fulfilled' ? momRes.value : null;
        const schData = schRes.status === 'fulfilled' ? schRes.value : null;

        if (ftData?.isRunning) {
          setTradingMode(ftData.mode === 'CTC' ? 'ctc' : 'fastrade');
          setIsModeChosen(true);
        } else if (aiData?.botState === 'RUNNING' || (!aiData?.botState && aiData?.isActive)) {
          setTradingMode('aisignal');
          setIsModeChosen(true);
        } else if (indData?.isRunning) {
          setTradingMode('indicator');
          setIsModeChosen(true);
        } else if (momData?.isRunning) {
          setTradingMode('momentum');
          setIsModeChosen(true);
        } else if (schData?.botState === 'RUNNING' || schData?.botState === 'PAUSED') {
          setTradingMode('schedule');
          setIsModeChosen(true);
        }
      }
    }catch(e:any){
      if(e?.status===401){router.push('/login');return;}
      if(!silent&&isMounted.current)setError(T('dashboard.errors.loadFailed'));
    }finally{if(!silent&&isMounted.current)setIsLoading(false);}
  },[router]);

  // ── Reset & refresh profit saat user switch akun (real ↔ demo) ─────────────
  // settingsLoaded guard mencegah false trigger saat settings baru di-hydrate dari storage
  const prevIsDemoRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!settingsLoaded) return;
    if (prevIsDemoRef.current === null) {
      prevIsDemoRef.current = isDemo;
      // ✅ FIX: Tidak skip — loadAll() dijalankan SEBELUM settings hydrate dari storage,
      // sehingga menggunakan isDemo default (true) yang mungkin salah.
      // Re-fetch profit dengan isDemo yang benar segera setelah settings berhasil di-load.
      // ✅ FIX: realtimeProfit agar mencakup PnL sesi aktif (bukan hanya data DB)
      api.realtimeProfit(isDemo ? 'demo' : 'real')
        .then(data => {
          if (isMounted.current) {
            setTodayProfitData(prev => {
              if (!prev) { stableProfitRef.current = data.totalPnL; return data; }
              if (prev.totalPnL !== 0 && data.totalPnL === 0 && data.totalTrades <= prev.totalTrades) {
                return prev; // transient 0 → skip
              }
              stableProfitRef.current = data.totalPnL;
              return data;
            });
            setProfitLastUpdated(Date.now());
          }
        })
        .catch(e => console.warn('[Profit] settings hydration re-fetch error:', e));
      return;
    }
    if (prevIsDemoRef.current === isDemo) return;
    prevIsDemoRef.current = isDemo;

    // ✅ FIX: Tidak di-null dulu — biarkan data lama tampil sampai data baru tiba (stale-while-revalidate)
    // setTodayProfitData(null) menyebabkan flash ke 0 selama jeda fetch (~200-500ms)

    // Fetch ulang dengan accountType yang sesuai
    // ✅ FIX: realtimeProfit agar PnL sesi aktif ikut tercermin
    api.realtimeProfit(isDemo ? 'demo' : 'real')
      .then(data => {
        if (isMounted.current) {
          // Saat switch akun (real↔demo), selalu trust data baru (beda akun = reset wajar)
          stableProfitRef.current = data.totalPnL;
          setTodayProfitData(data);
          setProfitLastUpdated(Date.now());
        }
      })
      .catch(e => console.warn('[Profit] isDemo switch refresh error:', e));
  }, [isDemo, settingsLoaded]); // eslint-disable-line

  // ── Auth check menggunakan isSessionValid (Capacitor-safe) ──────────────────
  useEffect(()=>{
    const init = async () => {
      const sessionValid = await isSessionValid();
      if(!sessionValid){ router.push('/login'); return; }
      loadAll();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Manual profit refresh (dipanggil dari tombol refresh di TodayProfitCard) ──
  const refreshProfit = useCallback(async () => {
    if (profitRefreshing) return;
    setProfitRefreshing(true);
    try {
      const result = await api.realtimeProfit(isDemoRef.current ? 'demo' : 'real');
      if (isMounted.current) {
        // Manual refresh: trust hasil tapi tetap update stable ref
        stableProfitRef.current = result.totalPnL;
        setTodayProfitData(result);
        setProfitLastUpdated(Date.now());
      }
    } catch (e) {
      console.warn('[Profit] manual refresh error:', e);
    } finally {
      if (isMounted.current) setProfitRefreshing(false);
    }
  }, [profitRefreshing]); // eslint-disable-line

  // ── Fast poll 10 detik: trading status + balance (tanpa realtimeProfit — punya poll sendiri) ──
  // ✅ FIX PERF: realtimeProfit dipisah ke interval 5 detik tersendiri.
  //    Sebelumnya bundled di sini bersama scheduleLogs(500)+fastradeLogs(500) yang berat —
  //    Promise.allSettled menunggu request TERLAMBAT, sehingga profit ikut terlambat walau
  //    realtimeProfit sendiri sudah selesai dalam 150-200ms.
  // ✅ FIX PERF: balance() dipindah ke dalam batch (paralel) — sebelumnya sequential setelah
  //    allSettled sehingga menambah +1 RTT (~150ms) ekstra setiap 10 detik.
  useEffect(()=>{
    const iv=setInterval(async()=>{
      const results = await Promise.allSettled([
        api.scheduleStatus(),api.fastradeStatus(),api.getOrders(),
        api.scheduleLogs(500),   // ✅ FIX: Logs harus ikut di-poll — backend hapus order setelah
                                 // selesai tanpa nulis result ke ScheduledOrder, result hanya ada
                                 // di ExecutionLog. Tanpa ini, scheduleLogs selalu stale dan
                                 // history detection tidak bisa detect WIN/LOSE.
        api.fastradeLogs(500),
        api.aiSignalStatus(),api.aiSignalPendingOrders(),
        api.indicatorStatus(),api.momentumStatus(),
        api.balance(),           // ✅ Paralel — tidak lagi sequential setelah allSettled
      ]);
      if(!isMounted.current)return;
      // ✅ FIX SCROLL: startTransition menandai semua update ini sebagai "tidak mendesak".
      //    React akan yield ke scroll/animation frame sebelum memproses update ini,
      //    sehingga polling tidak pernah meng-interrupt smooth scrolling.
      React.startTransition(()=>{
        const [sRes,fRes,oRes,logRes,ftlRes,aiRes,aiPendRes,indRes,momRes,balRes] = results;
        if(sRes.status==='fulfilled')setScheduleStatus(sRes.value);
        if(fRes.status==='fulfilled')setFtStatus(fRes.value);
        if(oRes.status==='fulfilled')setScheduleOrders(oRes.value);
        if(logRes.status==='fulfilled')setScheduleLogs(logRes.value);
        if(ftlRes.status==='fulfilled')setFtLogs(ftlRes.value);
        if(aiRes.status==='fulfilled')setAiStatus(aiRes.value);
        if(aiPendRes.status==='fulfilled')setAiPendingOrders(aiPendRes.value);
        if(indRes.status==='fulfilled')setIndicatorStatus(indRes.value);
        if(momRes.status==='fulfilled')setMomentumStatus(momRes.value);
        if(balRes.status==='fulfilled')setBalance(balRes.value);
      });
    },10000);
    return()=>clearInterval(iv);
  },[]); // eslint-disable-line

  // ── Dedicated profit poll 5 detik — terpisah dari batch status 10 detik ───────
  // ✅ FIX: Sebelumnya realtimeProfit dibundel di batch 10 detik bersama scheduleLogs(500)
  //    dan fastradeLogs(500). Promise.allSettled menunggu request terlama (log fetch ~400ms+)
  //    sehingga profit ikut delayed walau realtimeProfit sendiri selesai 150-200ms.
  //    Sekarang profit punya loop sendiri → tidak diblokir request lain, update setiap 5 detik.
  // ✅ FIX: Menggantikan interval 30 detik yang terlalu jarang.
  // ✅ Gunakan isDemoRef.current agar tidak stale closure (dep []).
  useEffect(()=>{
    const iv = setInterval(async () => {
      if (!isMounted.current) return;
      try {
        const result = await api.realtimeProfit(isDemoRef.current ? 'demo' : 'real');
        if (!isMounted.current) return;
        React.startTransition(() => {
          setTodayProfitData(prev => {
            if (!prev) { stableProfitRef.current = result.totalPnL; return result; }
            if (prev.totalPnL !== 0 && result.totalPnL === 0 && result.totalTrades <= prev.totalTrades) {
              return prev; // transient 0 dari race condition → pertahankan data lama
            }
            if (result.totalTrades > 0 || result.totalPnL !== 0) {
              stableProfitRef.current = result.totalPnL;
            }
            return result;
          });
          setProfitLastUpdated(Date.now());
        });
      } catch (e) {
        console.warn('[Profit] 5s poll error:', e);
      }
    }, 5_000);
    return () => clearInterval(iv);
  },[]); // eslint-disable-line

  const botState = scheduleStatus?.botState??'IDLE';
  const isSchedRunning = botState==='RUNNING', isSchedPaused = botState==='PAUSED';
  const isFtRunning = ftStatus?.isRunning??false;
  const isAIRunning = aiStatus?.botState === 'RUNNING' || (!aiStatus?.botState && aiStatus?.isActive === true);
  const isIndRunning = indicatorStatus?.isRunning??false;
  const isMomRunning = momentumStatus?.isRunning??false;

  const blockedModes: TradingMode[] = (()=>{
    const b: TradingMode[] = [];
    if(isSchedRunning||isSchedPaused){b.push('fastrade','ctc','aisignal','indicator','momentum');}
    if(isFtRunning&&ftStatus?.mode==='FTT'){b.push('schedule','ctc','aisignal','indicator','momentum');}
    if(isFtRunning&&ftStatus?.mode==='CTC'){b.push('schedule','fastrade','aisignal','indicator','momentum');}
    if(isAIRunning){b.push('schedule','fastrade','ctc','indicator','momentum');}
    if(isIndRunning){b.push('schedule','fastrade','ctc','aisignal','momentum');}
    if(isMomRunning){b.push('schedule','fastrade','ctc','aisignal','indicator');}
    return b.filter((v,i,a)=>a.indexOf(v)===i);
  })();

  const isActiveMode = (()=>{
    if(tradingMode==='schedule') return isSchedRunning||isSchedPaused;
    if(tradingMode==='fastrade'||tradingMode==='ctc') return isFtRunning;
    if(tradingMode==='aisignal') return isAIRunning;
    if(tradingMode==='indicator') return isIndRunning;
    if(tradingMode==='momentum') return isMomRunning;
    return false;
  })();

  // True jika ADA mode apapun yang sedang berjalan (bukan hanya mode yang dilihat)
  const isAnyModeRunning = isSchedRunning || isSchedPaused || isFtRunning || isAIRunning || isIndRunning || isMomRunning;

  const selectedAsset = assets.find(a=>a.ric===selectedRic)??null;
  const pendingOrders = scheduleOrders.filter(o=>!o.isExecuted&&!o.isSkipped);
  const canStart = tradingMode==='schedule' ? !!(selectedRic&&pendingOrders.length>0) : !!selectedRic;

  const sessionPnL = (()=>{
    if(tradingMode==='schedule') return (scheduleStatus as any)?.sessionPnL??0;
    if(tradingMode==='fastrade'||tradingMode==='ctc') return ftStatus?.sessionPnL??0;
    if(tradingMode==='aisignal') return aiStatus?.sessionPnL??0;
    if(tradingMode==='indicator') return indicatorStatus?.sessionPnL??0;
    if(tradingMode==='momentum') return momentumStatus?.sessionPnL??0;
    return 0;
  })();

  const profitToday = React.useMemo(()=>{
    // ✅ FIX FLICKER: Gunakan stableProfitRef sebagai source of truth.
    //    todayProfitData state bisa transient 0 saat race condition, tapi ref ini
    //    selalu menyimpan nilai terakhir yang valid.
    //    Hanya update ke nilai baru jika data benar-benar valid (non-null, reasonable).
    if (todayProfitData && todayProfitData.totalTrades > 0) {
      // Data valid dengan trades > 0 → update stable ref dan gunakan nilai ini
      stableProfitRef.current = todayProfitData.totalPnL;
      return todayProfitData.totalPnL;
    }
    if (todayProfitData && todayProfitData.totalTrades === 0 && stableProfitRef.current !== 0) {
      // Data mengatakan 0 trades tapi sebelumnya ada profit → transient 0, jangan trust
      // Pertahankan nilai stable
      return stableProfitRef.current;
    }
    if (todayProfitData) {
      // Data valid tapi memang 0 trades dan belum pernah ada profit → memang 0
      stableProfitRef.current = todayProfitData.totalPnL;
      return todayProfitData.totalPnL;
    }
    // todayProfitData null → gunakan stable ref (tidak reset ke 0)
    return stableProfitRef.current;
  },[todayProfitData]); // ✅ Hanya depend on todayProfitData — stable ref tidak butuh re-render trigger

  const isBelowMin = amount > 0 && amount < MIN_AMOUNT;

  const handleModeChange = (m:TradingMode)=>{
    // Izinkan ganti pilihan mode kapan saja (proteksi start ada di handleStart)
    if(m!==tradingMode) setTradingMode(m);
    setError(null);
    setIsModeChosen(true);
    // ✅ FIX: Buka input popup hanya jika belum ada pending schedule.
    // Jika sudah ada schedule → mode langsung aktif normal tanpa popup input.
    if(m==='schedule' && pendingOrders.length === 0){
      setOrderModalInitialView('input');
      setOrderModalOpen(true);
    }
  };

  const handleStart = async()=>{
    if(!selectedRic)return;
    if(isBelowMin&&tradingMode!=='indicator'){setError(`Amount di bawah minimum ${CURR_UNIT} ${FMT(MIN_AMOUNT)}.`);return;}
    // Cegah start jika ada mode LAIN yang sedang berjalan (hanya 1 mode boleh aktif)
    const otherRunning = (
      (tradingMode!=='schedule'&&(isSchedRunning||isSchedPaused))||
      ((tradingMode!=='fastrade'&&tradingMode!=='ctc')&&isFtRunning)||
      (tradingMode!=='aisignal'&&isAIRunning)||
      (tradingMode!=='indicator'&&isIndRunning)||
      (tradingMode!=='momentum'&&isMomRunning)
    );
    if(otherRunning){showBlock(T('dashboard.modePicker.stopActiveFirst'));return;}
    setActionLoading(true);setError(null);
    try{
      if(tradingMode==='schedule'){
        await api.updateConfig({
          asset:{ric:selectedRic,name:selectedAsset?.name??selectedRic,profitRate:selectedAsset?.profitRate,iconUrl:selectedAsset?.iconUrl},
          martingale:{isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED',isAlwaysSignal:martingale.alwaysSignal??false},
          isDemoAccount:isDemo,currency:CURR_UNIT,currencyIso:CURR_UNIT,duration,
          stopLoss:stopLoss?stopLoss*100:undefined,stopProfit:stopProfit?stopProfit*100:undefined,
        });
        await api.scheduleStart();
      } else if(tradingMode==='fastrade'||tradingMode==='ctc'){
        await api.fastradeStart({
          mode:tradingMode==='ctc'?'CTC':'FTT',
          asset:{ric:selectedRic,name:selectedAsset?.name??selectedRic,profitRate:selectedAsset?.profitRate,iconUrl:selectedAsset?.iconUrl},
          martingale:{isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED',isAlwaysSignal:martingale.alwaysSignal??false},
          isDemoAccount:isDemo,currency:CURR_UNIT,currencyIso:CURR_UNIT,
          stopLoss:stopLoss?stopLoss*100:undefined,stopProfit:stopProfit?stopProfit*100:undefined,
        });
      } else if(tradingMode==='aisignal'){
        await api.aiSignalSetAsset(selectedRic, selectedAsset?.name??selectedRic);
        await api.aiSignalUpdateConfig({
          baseAmount:amount*100,isDemoAccount:isDemo,
          martingaleEnabled:martingale.enabled,maxSteps:martingale.maxStep,
          multiplierValue:martingale.multiplier,isAlwaysSignal:martingale.alwaysSignal??false,
        });
        await api.aiSignalStart();
      } else if(tradingMode==='indicator'){
        await api.indicatorSetAsset(selectedRic, selectedAsset?.name??selectedRic);
        await api.indicatorSetAccount(isDemo);
        await api.indicatorSetMartingale({isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED',isAlwaysSignal:martingale.alwaysSignal??false,stopLoss:stopLoss?stopLoss*100:0,stopProfit:stopProfit?stopProfit*100:0});
        await api.indicatorUpdateConfig({type:indicatorType,period:indicatorPeriod,sensitivity:indicatorSensitivity,rsiOverbought,rsiOversold,amount:amount*100});
        await api.indicatorStart();
      } else if(tradingMode==='momentum'){
        await api.momentumSetAsset(selectedRic, selectedAsset?.name??selectedRic);
        await api.momentumSetAccount(isDemo);
        await api.momentumSetMartingale({
          isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,
          multiplierValue:martingale.multiplier,multiplierType:'FIXED',
          isAlwaysSignal:martingale.alwaysSignal??false,
          stopLoss:stopLoss?stopLoss*100:0,stopProfit:stopProfit?stopProfit*100:0,
        });
        await api.momentumUpdateConfig({
          candleSabitEnabled:true,
          dojiTerjepitEnabled:true,
          dojiPembatalanEnabled:true,
          bbSarBreakEnabled:true,
        });
        await api.momentumStart();
      }
      await loadAll(true);
    }catch(e:any){setError(e?.message??T('dashboard.errors.startFailed'));}
    finally{setActionLoading(false);}
  };

  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const handleStop = async()=>{
    setStopConfirmOpen(true);
  };

  const handleStopConfirmed = async()=>{
    setStopConfirmOpen(false);
    setActionLoading(true);setError(null);
    try{
      // Stop berdasarkan mode yang benar-benar sedang berjalan di server
      if(tradingMode==='schedule'||(isSchedRunning||isSchedPaused)) {
        if(isSchedRunning||isSchedPaused) await api.scheduleStop();
        else if(tradingMode==='schedule') await api.scheduleStop();
      }
      if(tradingMode==='fastrade'||tradingMode==='ctc') await api.fastradeStop();
      else if(isFtRunning) await api.fastradeStop();
      if(tradingMode==='aisignal') await api.aiSignalStop();
      else if(isAIRunning) await api.aiSignalStop();
      if(tradingMode==='indicator') await api.indicatorStop();
      else if(isIndRunning) await api.indicatorStop();
      if(tradingMode==='momentum') await api.momentumStop();
      else if(isMomRunning) await api.momentumStop();
      await loadAll(true);
    }catch(e:any){setError(e?.message??T('dashboard.errors.stopFailed'));}
    finally{setActionLoading(false);}
  };

  const handlePause  = async()=>{setActionLoading(true);try{await api.schedulePause();await loadAll(true);}catch(e:any){setError(e?.message??T('dashboard.errors.pauseFailed'));}finally{setActionLoading(false);}};
  const handleResume = async()=>{setActionLoading(true);try{await api.scheduleResume();await loadAll(true);}catch(e:any){setError(e?.message??T('dashboard.errors.resumeFailed'));}finally{setActionLoading(false);}};

  const handleAddOrders = async(input:string)=>{
    const validLines = input
      .split('\n')
      .map(l => {
        const trimmed = l.trim();
        const match = trimmed.match(/^(\d{1,2}[:.]\d{2})\s+(call|put|buy|sell|b|s|c|p)\b/i);
        if (!match) return null;
        const time = match[1].replace('.', ':').padStart(5, '0');
        const raw = match[2].toLowerCase();
        const trend = (raw === 'call' || raw === 'buy' || raw === 'c' || raw === 'b') ? 'call' : 'put';
        return `${time} ${trend}`;
      })
      .filter(Boolean)
      .join('\n');
    if (!validLines) return;
    setAddOrderLoading(true);
    try{
      await api.addOrders(validLines);
      const newOrders=await api.getOrders();
      setScheduleOrders(newOrders);
    }
    catch(e:any){setError(e?.message??T('dashboard.errors.addOrderFailed'));}
    finally{setAddOrderLoading(false);}
  };

  const g = deviceType==='desktop'?20:deviceType==='tablet'?18:16;
  const px = 16;

  // ✅ FIX SCROLL: useMemo agar <style> tidak di-reinject tiap render.
  // Sebelumnya style block berisi dynamic values (C.card, isDarkMode, dll) yang
  // dievaluasi ulang setiap setState — CSSOM churn menyebabkan paint invalidation
  // yang mengganggu smooth scroll di WebView/Capacitor.
  const dashboardStyles = React.useMemo(() => `
    @keyframes spin        { to { transform: rotate(360deg); } }
    @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.5} }
    @keyframes ping        { 0%{transform:scale(1);opacity:1} 80%,100%{transform:scale(2);opacity:0} }
    @keyframes slide-up    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fade-in     { from{opacity:0} to{opacity:1} }
    @keyframes profit-slide-up   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes profit-slide-down { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .profit-slide-up   { animation: profit-slide-up   0.4s cubic-bezier(0.4,0,0.2,1) both !important; }
    .profit-slide-down { animation: profit-slide-down 0.4s cubic-bezier(0.4,0,0.2,1) both !important; }
    @keyframes win-flash   { 0%{box-shadow:0 0 0 0 rgba(34,211,160,0)} 15%{box-shadow:0 0 0 6px rgba(34,211,160,0.35)} 100%{box-shadow:0 0 0 0 rgba(34,211,160,0)} }
    @keyframes lose-flash  { 0%{box-shadow:0 0 0 0 rgba(255,69,58,0)} 15%{box-shadow:0 0 0 4px rgba(255,69,58,0.35)} 100%{box-shadow:0 0 0 0 rgba(255,69,58,0)} }
    /* ✅ FIX SCROLL: shimmer pakai translateX (GPU-accelerated) bukan background-position (CPU paint) */
    @keyframes header-shimmer {
      0%   { transform: translateX(-100%) translateZ(0); }
      40%  { transform: translateX(100%) translateZ(0); }
      100% { transform: translateX(100%) translateZ(0); }
    }
    /* ═══════════════════════════════════════════════════════════
       DASHBOARD DESIGN SYSTEM — Linear/Vercel-style
       Satu resep permukaan untuk SEMUA kartu: hairline netral 1px,
       radius 16, elevasi lembut berlapis. Aksen emerald hanya untuk
       data/status — TIDAK pernah untuk border dekoratif.
       ═══════════════════════════════════════════════════════════ */
    .ds-card {
      background: ${isDarkMode ? 'linear-gradient(180deg, #17181C 0%, #131418 100%)' : '#ffffff'};
      border: 1px solid ${C.bdr};
      border-radius: 16px !important;
      box-shadow: ${isDarkMode
        ? 'inset 0 1px 0 rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.35), 0 12px 32px -16px rgba(0,0,0,0.55)'
        : '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -16px rgba(15,23,42,0.10)'};
      transition: background 0.3s, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    @media (max-width: 767px) {
      .ds-card, .ds-card:hover { transform: none !important; }
    }
    /* Kartu KPI / stat tile — dipakai desktop, tablet & mobile */
    .dsh-tile { padding: 16px 18px; min-width: 0; }
    .dsh-tile-sm { padding: 13px 15px; min-width: 0; }
    .dsh-tile-tap { cursor: pointer; }
    .dsh-tile-tap:hover { border-color: ${isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(2,6,23,0.16)'}; }
    /* Label meta 11px — SATU gaya label untuk seluruh dashboard */
    .dsh-label {
      font-size: 11px; font-weight: 500; letter-spacing: 0.01em;
      color: ${C.muted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* Angka utama — tabular agar kolom angka tidak "goyang" saat update */
    .dsh-num { font-variant-numeric: tabular-nums lining-nums; letter-spacing: -0.02em; }
    /* Baris tabel trades */
    .dsh-row { transition: background 0.12s ease; }
    .dsh-row:hover { background: ${C.faint}; }
    .ds-input {
      width: 100%;
      padding: 10px 13px;
      border-radius: 10px;
      font-size: 13px;
      background: ${isDarkMode ? 'rgba(255,255,255,0.045)' : '#F8F9FB'};
      border: 1px solid ${C.bdr};
      color: ${C.text};
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s, background 0.3s, color 0.3s, box-shadow 0.2s;
      resize: vertical;
      box-sizing: border-box;
    }
    .ds-input:focus {
      border-color: ${C.bdrAct};
      box-shadow: 0 0 0 3px ${isDarkMode ? 'rgba(45,212,167,0.10)' : 'rgba(5,150,105,0.08)'};
    }
    .ds-input::placeholder { color: ${C.muted} !important; }
    .schedule-item { transition: background 0.15s; border-radius: 10px; }
    .schedule-item:hover { background: ${C.faint} !important; }
    /* ✅ FIX SCROLL: semua elemen animasi promoted ke GPU layer agar tidak
       trigger repaint pada scroll layer utama */
    [style*="animation: ping"], [style*="animation:ping"],
    [style*="animation: pulse"], [style*="animation:pulse"],
    [style*="animation: spin"], [style*="animation:spin"] {
      will-change: transform, opacity;
      transform: translateZ(0);
    }
  `, [isDarkMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const TopCards = <TodayProfitCard data={todayProfitData} localProfit={profitToday} currencyUnit={currencyConfig.currencyUnit} isLoading={isLoading} isRefreshing={profitRefreshing} lastUpdatedAt={profitLastUpdated} flash={flash} onRefresh={refreshProfit} t={t} isMobile={deviceType==='mobile'}/>;

  const ModeSession = (fillH:boolean, compact?:boolean, onViewSession?:()=>void, startStopButton?:React.ReactNode) => (
    <ModeSessionPanel
      mode={tradingMode} onModeChange={handleModeChange} locked={isAnyModeRunning} blockedModes={blockedModes}
      orders={scheduleOrders} logs={scheduleLogs} onOpenModal={()=>{ setOrderModalInitialView('list'); setOrderModalOpen(true); }} isRunning={isSchedRunning}
      ftStatus={ftStatus} ftLogs={ftLogs} ftLoading={false}
      aiStatus={aiStatus} aiPending={aiPendingOrders}
      indicatorStatus={indicatorStatus}
      momentumStatus={momentumStatus}
      fillHeight={fillH}
      compact={compact}
      onViewSession={onViewSession}
      startStopButton={startStopButton}
      historyIdsRef={scheduleHistoryIdsRef}
    />
  );

  const SettingsCardEl = (
    <SettingsCard
      mode={tradingMode} assets={assets} assetRic={selectedRic}
      onAssetChange={a=>setSelectedRic(a.ric)}
      isDemo={isDemo} onDemoChange={setIsDemo}
      duration={duration} onDurationChange={setDuration}
      amount={amount} onAmountChange={setAmount}
      martingale={martingale} onMartingaleChange={setMartingale}
      ftTf={ftTf} onFtTfChange={setFtTf}
      stopLoss={stopLoss} onSlChange={setStopLoss}
      stopProfit={stopProfit} onSpChange={setStopProfit}
      indicatorType={indicatorType} onIndicatorTypeChange={setIndicatorType}
      indicatorPeriod={indicatorPeriod} onIndicatorPeriodChange={setIndicatorPeriod}
      indicatorSensitivity={indicatorSensitivity} onSensitivityChange={setIndicatorSensitivity}
      rsiOverbought={rsiOverbought} onOverboughtChange={setRsiOverbought}
      rsiOversold={rsiOversold} onOversoldChange={setRsiOversold}
      momentumPatterns={momentumPatterns} onMomentumPatternsChange={setMomentumPatterns}
      disabled={isActiveMode}
    />
  );

  const ControlCardEl = (
    <ControlCard
      mode={tradingMode} scheduleStatus={scheduleStatus} orders={scheduleOrders}
      ftStatus={ftStatus} aiStatus={aiStatus} indicatorStatus={indicatorStatus} momentumStatus={momentumStatus}
      canStart={canStart} isLoading={actionLoading} profit={sessionPnL}
      onStart={handleStart} onStop={handleStop} onPause={handlePause} onResume={handleResume}
      error={error} isBelowMin={isBelowMin&&tradingMode!=='indicator'}
      martingale={martingale}
    />
  );

  const ac = modeAccent(tradingMode);
  const mobileStartStopBtn = (
    <button
      onClick={isActiveMode ? handleStop : handleStart}
      disabled={actionLoading || (!isActiveMode && (!canStart || isAnyModeRunning))}
      style={{
        width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
        padding:'9px 0',borderRadius:10,
        background: actionLoading
          ? (isActiveMode ? `${C.coral}20` : `${ac}20`)
          : isActiveMode
            ? `linear-gradient(135deg,${C.coral}d0,${C.coral}90)`
            : `linear-gradient(135deg,${ac}d0,${ac}90)`,
        border:`1px solid ${isActiveMode ? C.coral : ac}55`,
        color:'#fff',
        fontSize:12,fontWeight:700,letterSpacing:'0.05em',
        cursor: actionLoading || (!isActiveMode && (!canStart || isAnyModeRunning)) ? 'not-allowed' : 'pointer',
        opacity: !isActiveMode && (!canStart || isAnyModeRunning) ? 0.45 : 1,
        boxShadow: actionLoading ? 'none' : isActiveMode
          ? `0 3px 12px ${C.coral}40`
          : `0 3px 12px ${ac}40`,
        transition:'all 0.2s ease',
      }}
    >
      {actionLoading && <div style={{width:12,height:12,border:`2px solid rgba(255,255,255,0.3)`,borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>}
      {actionLoading ? T('common.loading') : isActiveMode ? 'Stop' : 'Start'}
    </button>
  );


  // Tunggu settings dari storage sebelum render (cegah flicker default → saved value)
  if (!settingsLoaded) return null;

  return (
    // ✅ FIX SCROLL: touchAction:'pan-y' → browser langsung tau ini scroll vertikal,
    //    tidak perlu tunggu JS confirm sebelum mulai scroll (passive hint ke WebView).
    <div style={{minHeight:'100%',background:colors.bg,paddingBottom:'calc(88px + env(safe-area-inset-bottom, 0px))',color:colors.text,transition:'background 0.3s, color 0.3s',touchAction:'pan-y'}}>
      {/* Asset Picker Modal — top level */}
      <PickerModal
        open={assetPickerOpen}
        onClose={()=>setAssetPickerOpen(false)}
        title={T('dashboard.selectAsset')}
        options={assets.map(a=>({value:a.ric,label:a.name,sub:`${a.ric} · ${a.profitRate}%`,icon:a.iconUrl}))}
        value={selectedRic}
        searchable
        isDark={isDarkMode}
        onSelect={v=>{const a=assets.find(x=>x.ric===v);if(a)setSelectedRic(a.ric);setAssetPickerOpen(false);}}
      />
      {/* Stop Confirmation Modal */}
      {stopConfirmOpen && (
        <div style={{position:'fixed',inset:0,zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',padding:20,animation:'fade-in 0.18s ease'}}>
          <div onClick={()=>setStopConfirmOpen(false)} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)'}}/>
          <div style={{
            position:'relative',width:'100%',maxWidth:320,
            background: isDarkMode ? '#17181C' : '#ffffff',
            borderRadius:18,border: isDarkMode ? '1px solid rgba(255,255,255,0.10)' : `1px solid rgba(0,0,0,0.08)`,
            overflow:'hidden',
            animation:'slide-up 0.24s cubic-bezier(0.32,0.72,0,1)',
            boxShadow:`0 20px 60px rgba(0,0,0,${isDarkMode?'0.60':'0.14'})`,
          }}>
            {/* Icon + Title + Desc */}
            <div style={{padding:'28px 24px 20px',textAlign:'center',borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.07)'}}>
              <div style={{width:52,height:52,borderRadius:16,background:'rgba(255,69,58,0.12)',border:'1px solid rgba(255,69,58,0.25)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <StopCircle style={{width:24,height:24,color:C.coral}}/>
              </div>
              <p style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:6}}>{T('dashboard.stopConfirm.title')}</p>
              <p style={{fontSize:13,color:C.sub,lineHeight:1.5}}>
                {T('dashboard.stopConfirm.message')}
              </p>
            </div>
            {/* Action buttons — Apple-style */}
            <div style={{display:'flex',flexDirection:'column'}}>
              <button
                onClick={handleStopConfirmed}
                style={{
                  padding:'15px 20px',fontSize:16,fontWeight:600,
                  color:C.coral,background:'transparent',border:'none',
                  borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.07)',
                  cursor:'pointer',letterSpacing:'-0.01em',
                }}
              >
                {T('dashboard.stopConfirm.confirm')}
              </button>
              <button
                onClick={()=>setStopConfirmOpen(false)}
                style={{
                  padding:'15px 20px',fontSize:16,fontWeight:400,
                  color:C.text,background:'transparent',border:'none',
                  cursor:'pointer',letterSpacing:'-0.01em',
                }}
              >
                {T('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{dashboardStyles}</style>

      <OrderInputModal
        open={orderModalOpen}
        onClose={()=>setOrderModalOpen(false)}
        orders={scheduleOrders}
        logs={scheduleLogs}
        onAdd={handleAddOrders}
        onDelete={async(id)=>{
          try{await api.deleteOrder(id);setScheduleOrders(p=>p.filter(o=>o.id!==id));}
          catch(e:any){setError(e?.message??T('dashboard.errors.deleteOrderFailed'));}
        }}
        onClear={async()=>{await api.clearOrders();setScheduleOrders([]);}}
        loading={addOrderLoading}
        isRunning={isSchedRunning||isSchedPaused}
        historyOrders={scheduleHistoryOrders}
        historyIdsRef={scheduleHistoryIdsRef}
        initialView={orderModalInitialView}
      />
      {deviceType==='mobile'&&(
        <MobileSessionSheet
          open={mobileSessionOpen}
          onClose={()=>setMobileSessionOpen(false)}
          mode={tradingMode}
          ftStatus={ftStatus} ftLogs={ftLogs}
          aiStatus={aiStatus} aiPending={aiPendingOrders}
          indicatorStatus={indicatorStatus}
          momentumStatus={momentumStatus}
          orders={scheduleOrders} logs={scheduleLogs}
          onOpenModal={()=>setOrderModalOpen(true)}
          isRunning={isSchedRunning}
        />
      )}

      <div style={{maxWidth:1280,margin:'0 auto',padding:`0 ${px}px 0`,
        // ✅ FIX SCROLL: overscrollBehaviorY:'contain' mencegah scroll chain ke parent
        //    saat sudah mentok atas/bawah — menghilangkan rubber-band jank di Android WebView.
        overscrollBehaviorY:'contain',
      }}>
        {error&&(
          <div style={{display:'flex',alignItems:'flex-start',gap:9,padding:'10px 14px',borderRadius:8,marginBottom:g,background:C.cord,border:`1px solid rgba(255,69,58,0.2)`,borderLeft:`2px solid ${C.coral}`}}>
            <AlertCircle style={{width:13,height:13,flexShrink:0,marginTop:2,color:C.coral}}/>
            <span style={{fontSize:12,flex:1,color:C.coral}}>{error}</span>
            <button onClick={()=>setError(null)} style={{background:'transparent',border:'none',cursor:'pointer',opacity:0.5,color:C.coral}}><X style={{width:13,height:13}}/></button>
          </div>
        )}
        {modeBlock&&(
          <div style={{display:'flex',alignItems:'center',gap:9,padding:'10px 14px',borderRadius:8,marginBottom:g,background:C.ambd,border:`1px solid rgba(255,159,10,0.2)`,animation:'slide-up 0.25s ease'}}>
            <Info style={{width:13,height:13,flexShrink:0,color:C.amber}}/>
            <span style={{fontSize:12,flex:1,color:C.amber}}>{modeBlock}</span>
            <button onClick={()=>setModeBlock(null)} style={{background:'transparent',border:'none',cursor:'pointer',opacity:0.5,color:C.amber}}><X style={{width:13,height:13}}/></button>
          </div>
        )}

        {/* ── DESKTOP ── */}
        {deviceType==='desktop'&&(
          <div style={{paddingTop:20,paddingBottom:32,display:'flex',flexDirection:'column',gap:16}}>

            {/* ── PAGE HEADER ── */}
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',paddingBottom:4}}>
              <div>
                <h1 style={{fontSize:26,fontWeight:700,color:C.text,letterSpacing:'-0.02em',lineHeight:1.1,marginBottom:6}}>Dashboard</h1>
                <p style={{fontSize:13,color:C.muted}}>
                  {({schedule:'Signal Mode',fastrade:'Fastrade FTT',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'} as Record<string,string>)[tradingMode]}
                </p>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {isLoading&&<div style={{width:6,height:6,borderRadius:'50%',background:C.cyan,animation:'ping 1.2s ease-in-out infinite'}}/>}
                <StatusChip
                  col={isActiveMode?modeAccent(tradingMode):C.muted}
                  label={isActiveMode?T('dashboard.running'):T('common.standby')}
                  pulse={isActiveMode}
                />
              </div>
            </div>

            {/* ── TOP INFO STRIP ─────────────────────────────────────────── */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'1fr 1fr 1fr 1fr',
              gap:12,
              alignItems:'stretch',
            }}>
              {/* Asset */}
              <div
                className={`ds-card dsh-tile${!isActiveMode?' dsh-tile-tap':''}`}
                onClick={!isActiveMode?()=>setAssetPickerOpen(true):undefined}
              >
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <span className="dsh-label">{T('dashboard.asset')}</span>
                  {selectedAsset?.iconUrl
                    ? <img src={selectedAsset.iconUrl} alt={selectedRic} crossOrigin="anonymous" style={{width:18,height:18,objectFit:'contain',opacity:0.8}}/>
                    : <BarChart2 style={{width:15,height:15,color:C.muted}}/>
                  }
                </div>
                <p style={{fontSize:22,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.02em',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {selectedAsset?.name ?? <span style={{color:C.muted,fontWeight:400,fontSize:14}}>{T('dashboard.notSelected')}</span>}
                </p>
                <p style={{fontSize:12,color:C.muted}}>{selectedAsset?`${selectedAsset.profitRate}% profit rate`:'Click to select'}</p>
              </div>

              {/* Balance */}
              <div className="ds-card dsh-tile">
                {(()=>{
                  const rawAmt = isDemo?(balance?.demo_balance??balance?.balance??0):(balance?.real_balance??balance?.balance??0);
                  const amt = rawAmt/100;
                  const col = isDemo?C.amber:C.cyan;
                  return (
                    <>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span className="dsh-label">{T('dashboard.balance')}</span>
                          <span style={{fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:99,color:col,background:`${col}14`}}>{isDemo?T('common.demo'):T('common.real')}</span>
                        </div>
                        <Wallet style={{width:15,height:15,color:C.muted}}/>
                      </div>
                      {isLoading?<div style={{height:25,width:130,borderRadius:4,background:C.faint,marginBottom:4}}/>
                        :<p className="dsh-num" style={{fontSize:22,fontWeight:650,color:C.text,lineHeight:1.15,marginBottom:4}}>{FMT(amt)}</p>
                      }
                      <p style={{fontSize:12,color:C.muted}}>{balance?.currency??'IDR'}</p>
                    </>
                  );
                })()}
              </div>

              {/* Mode + Status */}
              <div className="ds-card dsh-tile" style={{
                borderColor:isActiveMode?`${modeAccent(tradingMode)}40`:undefined,
                transition:'border-color 0.3s ease',
              }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <span className="dsh-label">{T('dashboard.mode')}</span>
                  <div style={{position:'relative'}}>
                    <span style={{color:isActiveMode?modeAccent(tradingMode):C.muted}}>
                      {{schedule:<Calendar style={{width:15,height:15}}/>,fastrade:<Zap style={{width:15,height:15}}/>,ctc:<Copy style={{width:15,height:15}}/>,aisignal:<Radio style={{width:15,height:15}}/>,indicator:<BarChart style={{width:15,height:15}}/>,momentum:<Waves style={{width:15,height:15}}/>}[tradingMode]}
                    </span>
                    {isActiveMode&&<span style={{position:'absolute',top:-3,right:-3,width:7,height:7,borderRadius:'50%',background:modeAccent(tradingMode),animation:'ping 1.6s ease-in-out infinite'}}/>}
                  </div>
                </div>
                <p style={{fontSize:22,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.02em',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {{schedule:'Signal',fastrade:'Fastrade FTT',ctc:'CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'}[tradingMode]}
                </p>
                <p style={{fontSize:12,display:'flex',alignItems:'center',gap:6,color:isActiveMode?modeAccent(tradingMode):C.muted,fontWeight:isActiveMode?600:400}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:isActiveMode?modeAccent(tradingMode):C.muted,opacity:isActiveMode?1:0.5}}/>
                  {isActiveMode?T('dashboard.running'):T('common.standby')}
                </p>
              </div>

              {/* Today P&L */}
              <div className="ds-card dsh-tile">
                {(()=>{
                  const pnl = todayProfitData?.totalPnL ?? profitToday;
                  const isPos = pnl >= 0;
                  const col = isPos?C.cyan:C.coral;
                  const wr = todayProfitData?.winRate;
                  return (
                    <>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span className="dsh-label">{T('dashboard.profitToday')}</span>
                          {wr!=null&&<span style={{fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:99,color:wr>=50?C.cyan:C.coral,background:`${wr>=50?C.cyan:C.coral}14`}}>{wr.toFixed(0)}% WR</span>}
                        </div>
                        {isPos
                          ? <TrendingUp style={{width:15,height:15,color:C.muted}}/>
                          : <TrendingDown style={{width:15,height:15,color:C.muted}}/>
                        }
                      </div>
                      {isLoading?<div style={{height:25,width:130,borderRadius:4,background:C.faint,marginBottom:4}}/>
                        :<p className="dsh-num" style={{fontSize:22,fontWeight:650,color:col,lineHeight:1.15,marginBottom:4}}>
                          {isPos?'+':'−'}{FMT(Math.abs(pnl/100))}
                        </p>
                      }
                      <p style={{fontSize:12,color:C.muted}}>
                        {todayProfitData?`${todayProfitData.totalTrades} trades · ${todayProfitData.totalWins}W ${todayProfitData.totalLosses}L`:'Today'}
                      </p>
                    </>
                  );
                })()}
              </div>

            </div>

            {/* ── MAIN 2-COLUMN LAYOUT ───────────────────────────────────── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:16,alignItems:'start'}}>

              {/* LEFT: Chart hero + session strip */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {/* Chart */}
                <div className="ds-card" style={{overflow:'hidden'}}>
                  <div style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'14px 18px 12px',
                    borderBottom:`1px solid ${C.bdr}`,
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:13,fontWeight:600,color:C.text}}>Live Chart</span>
                      {selectedRic&&<span style={{fontSize:11,color:C.muted,fontVariantNumeric:'tabular-nums'}}>{selectedRic}</span>}
                      <span style={{width:6,height:6,borderRadius:'50%',background:isActiveMode?modeAccent(tradingMode):C.coral,animation:'ping 1.6s ease-in-out infinite'}}/>
                    </div>
                    <RealtimeClockDesktop/>
                  </div>
                  <ChartCard assetSymbol={selectedRic} height={340}/>
                </div>

                {/* Session stat strip */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {(()=>{
                    const ac = modeAccent(tradingMode);
                    const wins   = ftStatus?.totalWins??aiStatus?.totalWins??indicatorStatus?.totalWins??momentumStatus?.totalWins??0;
                    const losses = ftStatus?.totalLosses??aiStatus?.totalLosses??indicatorStatus?.totalLosses??momentumStatus?.totalLosses??0;
                    const total  = wins+losses;
                    const wr     = total>0?Math.round((wins/total)*100):null;
                    const pnlPos = sessionPnL>=0;
                    const nextT  = (scheduleStatus as any)?.nextOrderTime;
                    const nextS  = (scheduleStatus as any)?.nextOrderInSeconds;
                    const asActive = (scheduleStatus as any)?.alwaysSignalActive
                      ||(ftStatus as any)?.alwaysSignalActive
                      ||aiStatus?.alwaysSignalStatus?.isActive
                      ||(indicatorStatus as any)?.alwaysSignalActive
                      ||(momentumStatus as any)?.alwaysSignalActive;
                    const asStep = (scheduleStatus as any)?.alwaysSignalStep
                      ??(ftStatus as any)?.alwaysSignalStep
                      ??aiStatus?.alwaysSignalStatus?.currentStep
                      ??(indicatorStatus as any)?.alwaysSignalStep
                      ??(momentumStatus as any)?.alwaysSignalStep??0;

                    const statCards = [
                      {
                        label:T('dashboard.sessionPnl'), icon:<TrendingUp style={{width:14,height:14}}/>,
                        value: isLoading?null:(pnlPos?'+':'-')+CURR_UNIT+' '+FMT(Math.abs(sessionPnL/100)),
                        col: pnlPos?ac:C.coral,
                      },
                      {
                        label:T('dashboard.fastTrade.wlTotal').split('/')[0].trim()+' / '+T('dashboard.fastTrade.wlTotal').split('/')[1].trim(), icon:<BarChart2 style={{width:14,height:14}}/>,
                        value: isLoading?null:`${wins} / ${losses}`,
                        col: wins>losses?ac:losses>wins?C.coral:C.muted,
                      },
                      {
                        label:T('history.winRate'), icon:<Activity style={{width:14,height:14}}/>,
                        value: isLoading?null:wr!=null?`${wr}%`:'—',
                        col: wr!=null?(wr>=50?ac:C.coral):C.muted,
                      },
                      asActive&&asStep>0
                        ? {
                            label:T('dashboard.modePicker.running'), icon:<Zap style={{width:14,height:14}}/>,
                            value:`K${asStep}/${martingale.maxStep}`,
                            col:C.amber,
                          }
                        : nextT
                        ? {
                            label:T('dashboard.schedule.nextSignal'), icon:<Timer style={{width:14,height:14}}/>,
                            value:`${nextT}${nextS!=null?' · '+nextS+'s':''}`,
                            col:ac,
                          }
                        : {
                            label:T('dashboard.mode'), icon:<Radio style={{width:14,height:14}}/>,
                            value:({schedule:'Signal Mode',fastrade:'Fastrade FTT Mode',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'} as Record<string,string>)[tradingMode],
                            col:ac,
                          },
                    ];
                    return statCards.map((s,i)=>(
                      <div key={i} className="ds-card dsh-tile">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                          <span className="dsh-label">{s.label}</span>
                          <span style={{color:C.muted}}>{s.icon}</span>
                        </div>
                        {s.value==null
                          ? <div style={{height:20,width:'70%',borderRadius:4,background:C.faint}}/>
                          : <p className="dsh-num" style={{fontSize:19,fontWeight:650,color:s.col,lineHeight:1.1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.value}</p>
                        }
                      </div>
                    ));
                  })()}
                </div>

                {/* ── RECENT TRADES TABLE ── */}
                {scheduleLogs.length>0&&(
                  <div className="ds-card" style={{overflow:'hidden'}}>
                    {/* Header */}
                    <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span style={{fontSize:13,fontWeight:600,color:C.text}}>Recent Trades</span>
                      <span style={{fontSize:12,color:C.muted,fontVariantNumeric:'tabular-nums'}}>{scheduleLogs.length} entries</span>
                    </div>
                    {/* Table header — kolom angka rata kanan, sejajar dengan isinya */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 90px 110px 110px 90px',gap:12,padding:'8px 18px',borderBottom:`1px solid ${C.bdr}`}}>
                      {[['Asset','left'],['Direction','left'],['Amount','right'],['Profit','right'],['Status','right']].map(([h,al])=>(
                        <span key={h} style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.07em',textAlign:al as any}}>{h}</span>
                      ))}
                    </div>
                    {/* Rows */}
                    {scheduleLogs.slice(0,8).map((log,i)=>{
                      const isWin  = log.result==='win';
                      const isLose = log.result==='lose';
                      const profitCol = isWin?C.cyan:isLose?C.coral:C.muted;
                      const dirCol    = log.trend==='UP'?C.cyan:log.trend==='DOWN'?C.coral:C.muted;
                      return (
                        <div key={log.id} className="dsh-row" style={{display:'grid',gridTemplateColumns:'1fr 90px 110px 110px 90px',gap:12,padding:'11px 18px',borderBottom:i<Math.min(scheduleLogs.length,8)-1?`1px solid ${C.bdr}`:undefined,alignItems:'center'}}>
                          <span style={{fontSize:13,fontWeight:500,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.ric??'—'}</span>
                          <span style={{fontSize:12,fontWeight:600,color:dirCol,display:'inline-flex',alignItems:'center',gap:4}}>
                            {log.trend==='UP'?<TrendingUp style={{width:12,height:12}}/>:log.trend==='DOWN'?<TrendingDown style={{width:12,height:12}}/>:null}
                            {log.trend==='UP'?'BUY':log.trend==='DOWN'?'SELL':'—'}
                          </span>
                          <span className="dsh-num" style={{fontSize:12.5,color:C.sub,textAlign:'right'}}>{log.amount!=null?FMT(log.amount/100):'—'}</span>
                          <span className="dsh-num" style={{fontSize:12.5,fontWeight:600,color:profitCol,textAlign:'right'}}>{log.profit!=null?(log.profit>=0?'+':'−')+FMT(Math.abs(log.profit/100)):'—'}</span>
                          <span style={{display:'inline-flex',justifyContent:'flex-end'}}>
                            <span style={{fontSize:10.5,fontWeight:600,letterSpacing:'0.03em',padding:'2px 8px',borderRadius:99,background:isWin?`${C.cyan}14`:isLose?`${C.coral}14`:`${C.muted}14`,color:isWin?C.cyan:isLose?C.coral:C.muted}}>
                              {log.result?log.result.toUpperCase():'PENDING'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT SIDEBAR */}
              <div style={{display:'flex',flexDirection:'column',gap:12,position:'sticky',top:20}}>
                {ModeSession(false)}
                {SettingsCardEl}
                {ControlCardEl}
                {/* ── Dark Mode Toggle ── */}
                <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} />
              </div>
            </div>
          </div>
        )}

        {/* ── TABLET ── */}
        {deviceType==='tablet'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14,paddingTop:14}}>

            {/* ── ROW 1: Top info strip — 4 tiles ── */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>

              {/* Asset */}
              <div className={`ds-card dsh-tile-sm${!isActiveMode?' dsh-tile-tap':''}`} onClick={!isActiveMode?()=>setAssetPickerOpen(true):undefined}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <span className="dsh-label">{T('dashboard.asset')}</span>
                  {selectedAsset?.iconUrl
                    ?<img src={selectedAsset.iconUrl} alt={selectedRic} crossOrigin="anonymous" style={{width:16,height:16,objectFit:'contain',opacity:0.8}}/>
                    :<BarChart2 style={{width:14,height:14,color:C.muted}}/>
                  }
                </div>
                <p style={{fontSize:16,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.01em',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {selectedAsset?.name??<span style={{color:C.muted,fontWeight:400,fontSize:12}}>{T('dashboard.notSelected')}</span>}
                </p>
                <p style={{fontSize:11,color:C.muted}}>{selectedAsset?`${selectedAsset.profitRate}% profit`:''}</p>
              </div>

              {/* Balance */}
              {(()=>{
                const rawAmt=isDemo?(balance?.demo_balance??balance?.balance??0):(balance?.real_balance??balance?.balance??0);
                const amt=rawAmt/100;
                const col=isDemo?C.amber:C.cyan;
                return (
                  <div className="ds-card dsh-tile-sm">
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}>
                        <span className="dsh-label">{T('dashboard.balance')}</span>
                        <span style={{fontSize:9,fontWeight:600,padding:'1px 6px',borderRadius:99,color:col,background:`${col}14`,flexShrink:0}}>{isDemo?T('common.demo'):T('common.real')}</span>
                      </div>
                      <Wallet style={{width:14,height:14,color:C.muted,flexShrink:0}}/>
                    </div>
                    {isLoading?<div style={{height:18,width:90,borderRadius:4,background:C.faint,marginBottom:3}}/>
                      :<p className="dsh-num" style={{fontSize:16,fontWeight:650,color:C.text,lineHeight:1.15,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{FMT(amt)}</p>
                    }
                    <p style={{fontSize:11,color:C.muted}}>{balance?.currency??'IDR'}</p>
                  </div>
                );
              })()}

              {/* Mode + Status */}
              <div className="ds-card dsh-tile-sm" style={{borderColor:isActiveMode?`${modeAccent(tradingMode)}40`:undefined,transition:'border-color 0.3s ease'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <span className="dsh-label">{T('dashboard.mode')}</span>
                  <div style={{position:'relative',flexShrink:0}}>
                    <span style={{color:isActiveMode?modeAccent(tradingMode):C.muted}}>
                      {{schedule:<Calendar style={{width:14,height:14}}/>,fastrade:<Zap style={{width:14,height:14}}/>,ctc:<Copy style={{width:14,height:14}}/>,aisignal:<Radio style={{width:14,height:14}}/>,indicator:<BarChart style={{width:14,height:14}}/>,momentum:<Waves style={{width:14,height:14}}/>}[tradingMode]}
                    </span>
                    {isActiveMode&&<span style={{position:'absolute',top:-3,right:-3,width:6,height:6,borderRadius:'50%',background:modeAccent(tradingMode),animation:'ping 1.6s ease-in-out infinite'}}/>}
                  </div>
                </div>
                <p style={{fontSize:16,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.01em',marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {{schedule:'Signal',fastrade:'Fastrade FTT',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'}[tradingMode]}
                </p>
                <p style={{fontSize:11,display:'flex',alignItems:'center',gap:5,color:isActiveMode?modeAccent(tradingMode):C.muted,fontWeight:isActiveMode?600:400}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:isActiveMode?modeAccent(tradingMode):C.muted,opacity:isActiveMode?1:0.5}}/>
                  {isActiveMode?T('dashboard.running'):T('common.standby')}
                </p>
              </div>

              {/* Today P&L */}
              {(()=>{
                const pnl=todayProfitData?.totalPnL??profitToday;
                const isPos=pnl>=0;
                const col=isPos?C.cyan:C.coral;
                const wr=todayProfitData?.winRate;
                return (
                  <div className="ds-card dsh-tile-sm">
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}>
                        <span className="dsh-label">{T('dashboard.profitToday')}</span>
                        {wr!=null&&<span style={{fontSize:9,fontWeight:600,color:wr>=50?C.cyan:C.coral,background:`${wr>=50?C.cyan:C.coral}14`,padding:'1px 6px',borderRadius:99,flexShrink:0}}>{wr.toFixed(0)}% WR</span>}
                      </div>
                      {isPos?<TrendingUp style={{width:14,height:14,color:C.muted,flexShrink:0}}/>:<TrendingDown style={{width:14,height:14,color:C.muted,flexShrink:0}}/>}
                    </div>
                    {isLoading?<div style={{height:18,width:90,borderRadius:4,background:C.faint,marginBottom:3}}/>
                      :<p className="dsh-num" style={{fontSize:16,fontWeight:650,color:col,lineHeight:1.15,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {isPos?'+':'−'}{FMT(Math.abs(pnl/100))}
                      </p>
                    }
                    <p style={{fontSize:11,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {todayProfitData?`${todayProfitData.totalTrades} trade · ${todayProfitData.totalWins}W ${todayProfitData.totalLosses}L`:T('dashboard.profitToday')}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* ── ROW 2: Main 2-column — Chart + Sidebar ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 288px',gap:12,alignItems:'start'}}>

              {/* LEFT: Chart hero + session stat strip */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>

                {/* Chart card */}
                <div className="ds-card" style={{overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px 10px',borderBottom:`1px solid ${C.bdr}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:7}}>
                      <span style={{fontSize:12,fontWeight:600,color:C.text}}>Live Chart</span>
                      {selectedRic&&<span style={{fontSize:10.5,color:C.muted,fontVariantNumeric:'tabular-nums'}}>{selectedRic}</span>}
                      <span style={{width:5,height:5,borderRadius:'50%',flexShrink:0,background:isActiveMode?modeAccent(tradingMode):C.coral,animation:'ping 1.6s ease-in-out infinite'}}/>
                    </div>
                    <RealtimeClockDesktop/>
                  </div>
                  <ChartCard assetSymbol={selectedRic} height={280}/>
                </div>

                {/* Session stat strip — 4 mini tiles */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {(()=>{
                    const ac=modeAccent(tradingMode);
                    const wins=ftStatus?.totalWins??aiStatus?.totalWins??indicatorStatus?.totalWins??momentumStatus?.totalWins??0;
                    const losses=ftStatus?.totalLosses??aiStatus?.totalLosses??indicatorStatus?.totalLosses??momentumStatus?.totalLosses??0;
                    const total=wins+losses;
                    const wr=total>0?Math.round((wins/total)*100):null;
                    const pnlPos=sessionPnL>=0;
                    const nextT=(scheduleStatus as any)?.nextOrderTime;
                    const nextS=(scheduleStatus as any)?.nextOrderInSeconds;
                    const asActive=(scheduleStatus as any)?.alwaysSignalActive||(ftStatus as any)?.alwaysSignalActive||aiStatus?.alwaysSignalStatus?.isActive||(indicatorStatus as any)?.alwaysSignalActive||(momentumStatus as any)?.alwaysSignalActive;
                    const asStep=(scheduleStatus as any)?.alwaysSignalStep??(ftStatus as any)?.alwaysSignalStep??aiStatus?.alwaysSignalStatus?.currentStep??(indicatorStatus as any)?.alwaysSignalStep??(momentumStatus as any)?.alwaysSignalStep??0;
                    const statCards=[
                      {label:T('dashboard.sessionPnl'),icon:<TrendingUp style={{width:13,height:13}}/>,value:isLoading?null:(pnlPos?'+':'−')+CURR_UNIT+' '+FMT(Math.abs(sessionPnL/100)),col:pnlPos?ac:C.coral},
                      {label:'W / L',icon:<BarChart2 style={{width:13,height:13}}/>,value:isLoading?null:`${wins} / ${losses}`,col:wins>losses?ac:losses>wins?C.coral:C.muted},
                      {label:T('history.winRate'),icon:<Activity style={{width:13,height:13}}/>,value:isLoading?null:wr!=null?`${wr}%`:'—',col:wr!=null?(wr>=50?ac:C.coral):C.muted},
                      asActive&&asStep>0
                        ?{label:T('dashboard.modePicker.running'),icon:<Zap style={{width:13,height:13}}/>,value:`K${asStep}/${martingale.maxStep}`,col:C.amber}
                        :nextT
                        ?{label:T('dashboard.schedule.nextSignal'),icon:<Timer style={{width:13,height:13}}/>,value:`${nextT}${nextS!=null?' · '+nextS+'s':''}`,col:ac}
                        :{label:T('dashboard.mode'),icon:<Radio style={{width:13,height:13}}/>,value:({schedule:'Signal Mode',fastrade:'Fastrade FTT Mode',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'} as Record<string,string>)[tradingMode],col:ac},
                    ];
                    return statCards.map((s,i)=>(
                      <div key={i} className="ds-card dsh-tile-sm">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
                          <span className="dsh-label" style={{fontSize:10.5}}>{s.label}</span>
                          <span style={{color:C.muted,flexShrink:0}}>{s.icon}</span>
                        </div>
                        {s.value==null
                          ?<div style={{height:16,width:'70%',borderRadius:4,background:C.faint}}/>
                          :<p className="dsh-num" style={{fontSize:15,fontWeight:650,color:s.col,lineHeight:1.1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.value}</p>
                        }
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* RIGHT: Sticky sidebar */}
              <div style={{display:'flex',flexDirection:'column',gap:12,position:'sticky',top:16}}>
                {ModeSession(false)}
                {SettingsCardEl}
                {ControlCardEl}
                {/* ── Dark Mode Toggle ── */}
                <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} />
              </div>

            </div>
          </div>
        )}

        {/* ── MOBILE ── */}
        {deviceType==='mobile'&&(
          <div style={{display:'flex',flexDirection:'column',gap:g,paddingTop:8}}>
            {/* Header Image - Full bleed, breaks out of padding */}
            {/* ✅ FIX SCROLL: transform:translateZ(0) + will-change memaksa elemen ini
                   ke GPU compositing layer tersendiri, sehingga video decode + shimmer animation
                   tidak pernah trigger repaint di scroll layer utama (jank prevention). */}
            <div 
  style={{
    marginLeft:`-${px}px`,
    marginRight:`-${px}px`,
    marginTop: -8,
    marginBottom:4,
    position: 'relative',
    overflow: 'hidden',
    transform: 'translateZ(0)',
    willChange: 'transform',
    contain: 'layout paint',
    minHeight: 60,
  }}
>
  <div style={{
    position: 'absolute',
    inset: 0,
    background: colors.bg,
    zIndex: 0,
  }}/>
  <video
    key={isDarkMode ? 'dark' : 'light'}
    src={isDarkMode ? "/darkstc.mp4" : "/lightstc.mp4"}
    autoPlay
    muted
    loop
    playsInline
    style={{
      width:'100%',
      height:'auto',
      display:'block',
      position: 'relative',
      zIndex: 1,
      opacity: 0,
      transition: 'opacity 0.3s ease',
      transform: 'translateZ(0)',
    }}
    onCanPlay={(e) => { (e.target as HTMLVideoElement).style.opacity = '1'; }}
    onError={(e) => { (e.target as HTMLVideoElement).parentElement!.style.display = 'none'; }}
  />
  {/* ✅ FIX SCROLL: shimmer pakai translateX (GPU-accelerated) bukan background-position (CPU paint).
       Wrapper overflow:hidden mengikuti video container. Inner div 300% wide slide melalui viewport. */}
  <div style={{
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    overflow: 'hidden',
    pointerEvents: 'none',
  }}>
    <div style={{
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: '300%',
      background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 58%, transparent 70%)',
      animation: 'header-shimmer 12s ease-in-out infinite',
      willChange: 'transform',
      transform: 'translateX(-100%) translateZ(0)',
    }}/>
  </div>

</div>
            {TopCards}
            <div style={{display:'flex',flexDirection:'row',gap:g,alignItems:'stretch'}}>
              {/* LEFT: chart card — stretches to match right column height */}
              <Card style={{flex:3,padding:12,display:'flex',flexDirection:'column',minWidth:0}}>
                {/* Header: strip jam realtime (look baru — bg faint, tanpa border) */}
                <div style={{marginBottom:8,flexShrink:0}}>
                  <RealtimeClockCompact t={t} lang={language} isBotRunning={isActiveMode}/>
                </div>
                {/* Sub-header: asset + status */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,gap:6,flexShrink:0}}>
                  {selectedRic?(
                    <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:modeAccent(tradingMode),flexShrink:0}}/>
                      <span style={{fontSize:10.5,fontWeight:500,color:C.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{selectedRic}</span>
                    </div>
                  ):(
                    <span style={{fontSize:10.5,color:C.muted}}>—</span>
                  )}
                  <span style={{fontSize:10.5,fontWeight:600,flexShrink:0,color:isActiveMode?modeAccent(tradingMode):C.muted}}>
                    {isActiveMode?t('common.active'):T('dashboard.offStatus')}
                  </span>
                </div>
                {/* Chart bleed sampai tepi kartu — tanpa gutter padding kiri/kanan/bawah */}
                <div style={{flex:1,minHeight:0,position:'relative',margin:'0 -12px -12px'}}>
                  <ChartCard assetSymbol={selectedRic} height={110}/>
                </div>
              </Card>
              {/* RIGHT: Mode panel — flex:2, drives the row height on mode change */}
              {isActiveMode && tradingMode !== 'schedule' ? (
                <div style={{flex:2,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
                  {/* Mode picker modal — tetap bisa dibuka saat aktif, tapi locked */}
                  <ModePickerModal
                    open={mobileModePickerOpen}
                    onClose={() => setMobileModePickerOpen(false)}
                    mode={tradingMode}
                    onModeChange={handleModeChange}
                    locked={isActiveMode}
                    blockedModes={blockedModes}
                  />
                  {/* mode selector button — tetap bisa diklik saat aktif */}
                  <button
                    onClick={() => setMobileModePickerOpen(true)}
                    style={{
                      display:'flex',alignItems:'center',justifyContent:'space-between',
                      padding:'9px 12px',borderRadius:12,cursor:'pointer',
                      background:`${modeAccent(tradingMode)}0e`,
                      border:`1px solid ${modeAccent(tradingMode)}30`,
                      minWidth:0,
                    }}
                  >
                    <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:modeAccent(tradingMode),animation:'pulse 1.6s ease-in-out infinite',flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:modeAccent(tradingMode),whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {{schedule:'Signal Mode',fastrade:'Fastrade FTT',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'}[tradingMode]}
                      </span>
                    </div>
                    <Lock style={{width:11,height:11,color:modeAccent(tradingMode),opacity:0.7,flexShrink:0}}/>
                  </button>
                  {/* P&L + Mini Stats + Lihat Sesi — unified card (non-schedule modes) */}
                  <div className="ds-card" style={{
                    padding:'11px 12px',
                    display:'flex',flexDirection:'column',gap:8,
                    flex:1,minHeight:0,
                  }}>
                    {/* P&L */}
                    <div>
                      <span className="dsh-label" style={{fontSize:10,display:'block',marginBottom:2}}>{T('dashboard.sessionPnl')}</span>
                      <span className="dsh-num" style={{
                        fontSize:16,fontWeight:700,
                        color:sessionPnL>=0?modeAccent(tradingMode):C.coral,
                      }}>
                        {sessionPnL>=0?'+':'−'}{FMT(Math.abs(sessionPnL/100))}
                      </span>
                    </div>
                    <div style={{height:1,background:C.bdr}}/>
                    {/* Mini Stats (non-schedule modes) */}
                    {(()=>{
                      const ac = modeAccent(tradingMode);
                      const wins = ftStatus?.totalWins??aiStatus?.totalWins??indicatorStatus?.totalWins??momentumStatus?.totalWins??0;
                      const losses = ftStatus?.totalLosses??aiStatus?.totalLosses??indicatorStatus?.totalLosses??momentumStatus?.totalLosses??0;
                      const total = wins+losses;
                      const wr = total>0?Math.round((wins/total)*100):null;
                      const asActive = (ftStatus as any)?.alwaysSignalActive
                        || aiStatus?.alwaysSignalStatus?.isActive
                        || (indicatorStatus as any)?.alwaysSignalActive
                        || (momentumStatus as any)?.alwaysSignalActive;
                      const asStep = (ftStatus as any)?.alwaysSignalStep
                        ?? aiStatus?.alwaysSignalStatus?.currentStep
                        ?? (indicatorStatus as any)?.alwaysSignalStep
                        ?? (momentumStatus as any)?.alwaysSignalStep ?? 0;
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {/* Kotak W / L / WR — teks min. 10px agar terbaca */}
                          <div style={{display:'flex',gap:4,minWidth:0}}>
                            {/* Win */}
                            <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 2px',borderRadius:8,background:`${C.cyan}0e`,overflow:'hidden'}}>
                              <span className="dsh-num" style={{fontSize:14,fontWeight:700,color:C.cyan,lineHeight:1,maxWidth:'100%',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wins}</span>
                              <span style={{fontSize:8.5,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Win</span>
                            </div>
                            {/* Loss */}
                            <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 2px',borderRadius:8,background:`${C.coral}0e`,overflow:'hidden'}}>
                              <span className="dsh-num" style={{fontSize:14,fontWeight:700,color:C.coral,lineHeight:1,maxWidth:'100%',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{losses}</span>
                              <span style={{fontSize:8.5,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Loss</span>
                            </div>
                            {/* WR */}
                            {wr!==null&&(
                              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 2px',borderRadius:8,background:wr>=50?`${ac}0e`:`${C.coral}0e`,overflow:'hidden'}}>
                                <span className="dsh-num" style={{fontSize:14,fontWeight:700,color:wr>=50?ac:C.coral,lineHeight:1,maxWidth:'100%',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wr}%</span>
                                <span style={{fontSize:8.5,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>WR</span>
                              </div>
                            )}
                            {/* Always Signal */}
                            {asActive&&asStep>0&&(
                              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 2px',borderRadius:8,background:`${C.amber}0e`,overflow:'hidden'}}>
                                <span className="dsh-num" style={{fontSize:13,fontWeight:700,color:C.amber,lineHeight:1,maxWidth:'100%',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>K{asStep}</span>
                                <span style={{fontSize:8.5,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>AS</span>
                              </div>
                            )}
                          </div>
                          {/* Bar proporsi Win/Loss — DATA NYATA sesi ini (bukan dekorasi) */}
                          {total>0&&(
                            <div style={{display:'flex',height:4,borderRadius:99,overflow:'hidden',gap:2,background:C.faint}}>
                              {wins>0&&<div style={{flex:wins,background:C.cyan,borderRadius:99}}/>}
                              {losses>0&&<div style={{flex:losses,background:C.coral,borderRadius:99}}/>}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{height:1,background:C.bdr}}/>
                    <button
                      onClick={()=>setMobileSessionOpen(true)}
                      style={{
                        display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                        padding:'7px 0',borderRadius:8,
                        background:`${modeAccent(tradingMode)}14`,
                        border:`1px solid ${modeAccent(tradingMode)}35`,
                        color:modeAccent(tradingMode),
                        fontSize:11,fontWeight:600,letterSpacing:'0.02em',
                        cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',
                      }}
>
                      <Info style={{width:12,height:12,flexShrink:0}}/>
                      {T('dashboard.viewSession')}
                    </button>
                    {/* Start / Stop toggle button */}
                    {mobileStartStopBtn}
                  </div>
                </div>
              ) : isActiveMode && tradingMode === 'schedule' ? (
                <div style={{flex:2,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
                  {(() => {
                    // Sort by time chronologically first, so slot +1/+2 always points to the next upcoming signal
                    const pending = scheduleOrders
                      .filter(o => !o.isExecuted && !o.isSkipped)
                      .sort((a, b) => a.time.localeCompare(b.time));
                    const ac = modeAccent('schedule');
                    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                    let activeIdx = 0, minDiff = Infinity;
                    pending.forEach((o, i) => {
                      const [h, m] = o.time.split(':').map(Number);
                      let d = (h * 60 + m) - nowMin;
                      if (d < 0) d += 24 * 60;
                      if (d < minDiff) { minDiff = d; activeIdx = i; }
                    });
                    // No wrap-around — hanya tampilkan signal berikutnya ke depan, bukan putar balik ke sinyal lama
                    const slots = [0, 1, 2].map(offset => {
                      const idx = activeIdx + offset;
                      return idx < pending.length ? { order: pending[idx], offset } : null;
                    }).filter(Boolean) as { order: ScheduleOrder; offset: number }[];

                    const martStep   = (scheduleStatus as any)?.alwaysSignalStep ?? 0;
                    const martActive = (scheduleStatus as any)?.alwaysSignalActive ?? false;

                    return (
                      <>
                        {/* Always Signal badge — di luar card */}
                        {martActive && (
                          <div style={{padding:'4px 8px',borderRadius:8,background:`${C.amber}10`,border:`1px solid ${C.amber}30`,display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                            <span style={{width:4,height:4,borderRadius:'50%',background:C.amber,animation:'ping 1.4s ease-in-out infinite'}}/>
                            <span style={{fontSize:9,fontWeight:700,color:C.amber,letterSpacing:'0.06em'}}>
                              AS · K{martStep}/{martingale.maxStep}
                            </span>
                          </div>
                        )}

                        {/* Card wrapper — sama persis dengan card idle state */}
                        <Card style={{flex:1,padding:0,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
                          {/* Mode picker modal */}
                          <ModePickerModal
                            open={mobileModePickerOpen}
                            onClose={() => setMobileModePickerOpen(false)}
                            mode={tradingMode}
                            onModeChange={handleModeChange}
                            locked={isActiveMode}
                            blockedModes={blockedModes}
                          />
                          {/* Card header — mode picker button, tetap bisa diklik saat aktif */}
                          <div style={{padding:'8px 12px',borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
                            <button
                              onClick={() => setMobileModePickerOpen(true)}
                              style={{
                                width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                                padding:'8px 12px',borderRadius:12,cursor:'pointer',
                                background:`${ac}0a`,
                                border:`1px solid ${ac}30`,
                              }}
                            >
                              <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                                <span style={{
                                  width:6,height:6,borderRadius:'50%',background:ac,
                                  animation:'pulse 1.6s ease-in-out infinite',
                                  flexShrink:0,
                                }}/>
                                <span style={{fontWeight:600,color:ac,fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Signal Mode</span>
                              </div>
                              <Lock style={{width:11,height:11,color:ac,opacity:0.7,flexShrink:0}}/>
                            </button>
                          </div>

                          {/* Card body — 3 schedule items */}
                          <div style={{flex:1,display:'flex',flexDirection:'column',gap:5,padding:'8px 12px',minHeight:0}}>
                            {slots.length === 0 ? (
                              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
                                <Calendar style={{width:22,height:22,color:C.muted,opacity:0.4}}/>
                                <span style={{fontSize:10,color:C.muted,textAlign:'center'}}>{T('dashboard.schedule.allCompleted')}</span>
                              </div>
                            ) : slots.map(({ order, offset }) => {
                              const isRunning = offset === 0;
                              const isCall    = order.trend === 'call';
                              const dirCol    = isCall ? C.cyan : C.coral;
                              const opacity   = isRunning ? 1 : offset === 1 ? 0.72 : 0.50;
                              const orderStep = order.martingaleState?.currentStep ?? 0;
                              const showMart  = isRunning && (orderStep > 0 || (martActive && martStep > 0));
                              const dispStep  = orderStep > 0 ? orderStep : martStep;

                              return (
                                <div key={order.id} style={{
                                  display:'flex',alignItems:'center',gap:5,padding:'6px 8px',
                                  borderRadius:10,opacity,
                                  background: isRunning ? `${ac}0e` : C.card2,
                                  border:`1px solid ${isRunning ? ac+'55' : C.bdr}`,
                                  transition:'all 0.2s',
                                  position:'relative',
                                  overflow:'hidden',
                                }}>
                                  {isRunning && (
                                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:2,background:ac,borderRadius:'99px 0 0 99px'}}/>
                                  )}
                                  <div style={{flex:1,minWidth:0,paddingLeft: isRunning ? 4 : 0}}>
                                    <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'nowrap'}}>
                                      <span className="dsh-num" style={{fontSize:11,fontWeight:700,color:isRunning?C.text:C.sub,lineHeight:1,flexShrink:0}}>{order.time}</span>
                                      <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,color:dirCol,background:`${dirCol}14`,flexShrink:0}}>
                                        {isCall ? 'B' : 'S'}
                                      </span>
                                      {showMart && (
                                        <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,color:C.amber,background:`${C.amber}14`,flexShrink:0,letterSpacing:'0.04em'}}>
                                          K{dispStep}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Status indicator - dot for running, offset for others */}
                                  <span className="dsh-num" style={{fontSize:10,fontWeight:700,color:isRunning?ac:C.muted,flexShrink:0}}>
                                    {isRunning ? '●' : `+${offset}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Card footer — view session button */}
                          <div style={{padding:'0 12px 10px',flexShrink:0,borderTop:`1px solid ${C.bdr}`,paddingTop:8}}>
                            <button
                              onClick={() => { setOrderModalInitialView('list'); setOrderModalOpen(true); }}
                              style={{
                                width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                                padding:'7px 0',borderRadius:8,
                                background:`${ac}10`,border:`1px solid ${ac}25`,
                                color:ac,fontSize:11,fontWeight:600,
                                cursor:'pointer',letterSpacing:'0.02em',
                              }}
                            >
                              <Info style={{width:12,height:12}}/> {T('dashboard.viewSession')}
                            </button>
                          </div>
                        </Card>

                        {/* Start/Stop di luar card, bawah */}
                        {mobileStartStopBtn}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div style={{flex:2,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
                  {!isModeChosen ? (
                    <>
                      {/* Mode picker modal — mode dikosongkan agar tidak ada yang terceklist */}
                      <ModePickerModal
                        open={mobileModePickerOpen}
                        onClose={() => setMobileModePickerOpen(false)}
                        mode={'' as TradingMode}
                        onModeChange={(m) => { handleModeChange(m); }}
                        locked={isActiveMode}
                        blockedModes={blockedModes}
                      />
                      {/* Pilih Mode placeholder card */}
                      <Card style={{flex:1,padding:0,display:'flex',flexDirection:'column',minHeight:140,overflow:'hidden'}}>
                        {/* Header: tombol Pilih Mode */}
                        <div style={{padding:'8px 12px',borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
                          <button
                            onClick={() => setMobileModePickerOpen(true)}
                            style={{
                              width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                              padding:'8px 12px',borderRadius:12,
                              background:`${C.muted}0a`,
                              border:`1px solid ${C.bdr}`,
                              cursor:'pointer',
                            }}
                          >
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{width:6,height:6,borderRadius:'50%',background:C.muted,opacity:0.5}}/>
                              <span style={{fontWeight:600,color:C.sub,fontSize:11,whiteSpace:'nowrap'}}>{T('dashboard.modePicker.title')}</span>                            </div>
                            <ChevronDown style={{width:12,height:12,color:C.muted}}/>
                          </button>
                        </div>
                        {/* Body: deskripsi — diperpanjang dengan minHeight & padding lebih besar */}
                        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,padding:'20px 14px',minHeight:100}}>
                          <Radio style={{width:26,height:26,color:C.muted,opacity:0.35}}/>
                          <span style={{fontSize:11,color:C.muted,textAlign:'center',fontWeight:500,lineHeight:1.6}}>
                            {T('dashboard.chooseModePrompt')}
                          </span>
                        </div>
                      </Card>
                      {mobileStartStopBtn}
                    </>
                  ) : (
                    ModeSession(true, true, ()=>setMobileSessionOpen(true), mobileStartStopBtn)
                  )}
                </div>
              )}
            </div>
            {/* Asset + Balance — 1 card gabungan full width */}
            <AssetBalanceCombinedCard
              asset={selectedAsset} mode={tradingMode} isLoading={isLoading} t={t}
              onOpenPicker={()=>setAssetPickerOpen(true)} disabled={isActiveMode}
              balance={balance} accountType={isDemo?'demo':'real'}
            />
            {SettingsCardEl}
            {ControlCardEl}
            {/* ── Dark Mode Toggle ── */}
            <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} />
          </div>
        )}
      </div>
    </div>
  );
}