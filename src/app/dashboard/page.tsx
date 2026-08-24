'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PAKAI_MESIN_PERANGKAT } from '@/lib/runtimeMode';
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
import { storage, isSessionValid, SESSION_KEYS } from '@/lib/storage';
import { ui } from '@/lib/uiText';
import { useTradingSettings } from '@/lib/useTradingSettings';
import { computeBestConfig, type BestConfigResult } from '@/lib/bestConfig';
import { isAiSignalUnlocked } from '@/lib/aiSignalAccess';
import { isFastReversalUnlocked, getFastReversalExpiry, getFastReversalEntry, FAST_REVERSAL_CONTACT_EMAIL } from '@/lib/fastReversalAccess';
import { isBlitz5sUnlocked, getBlitz5sExpiry } from '@/lib/blitz5sAccess';
import { getAiSignalEntry } from '@/lib/aiSignalAccess';
import { sessionBeacon } from '@/lib/sessionBeacon';
import { getRealAccessAt } from '@/lib/realAccess';
import { hasRealAccess } from '@/lib/realAccess';
import { getMaintenance, MAINTENANCE_OFF, type MaintenanceInfo } from '@/lib/maintenanceConfig';
import { checkIsSuperAdmin } from '@/lib/supabaseRepository';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { playForResultOnce, primeSounds } from '@/lib/soundFx';
import { isNativeApp } from '@/lib/engine/wsTransport';
import { deviceSession } from '@/lib/engine/deviceSession';
import type { ScheduledOrder as EngineOrder, ScheduleConfig as EngineConfig } from '@/lib/engine/scheduleEngine';
import { useLanguage } from '@/lib';
import { langToIntlLocale } from '@/lib/localeUtils';
import { CurrencyConfig, DEFAULT_CURRENCY_CONFIG, ISO_TO_UNIT } from '@/lib/userProfileApi';
import { applyLanguageFromCountry } from '@/lib/LanguageContext';
import { useDarkMode } from '@/lib/DarkModeContext';
import {
  Activity, AlertCircle, BarChart2, Calendar,
  ChevronDown, ChevronUp, ChevronRight, Info, Plus,
  Settings, Trash2, X, Zap, TrendingUp, TrendingDown,
  PlayCircle, StopCircle, PauseCircle, RefreshCw, Timer, Copy,
  ArrowRight, Radio, BarChart, Waves,
  Wallet, Clock, CreditCard, Eye, EyeOff,
  ClipboardPaste, Check, Lock, Smartphone, Repeat, BadgeCheck } from 'lucide-react';

// Palet dipindah ke ./theme.ts — langkah pertama memecah berkas ini.
import { getColors, type Colors, type TradingMode, type MartingaleConfig,
         type FastTradeTimeframe } from './theme';
import { rt, modeAccent } from './runtime';
import { ControlCard } from './ControlCard';
import { Card, Sk, StatusChip, Toggle, PickerModal, AlwaysSignalBadge,
         type PickerOpt } from './primitives';
import { AISignalPanel } from './AISignalPanel';
import { OrderInputModal } from './OrderInputModal';
import { SettingsCard } from './SettingsCard';
import { resolvePhase, type OrderPhase } from './orderPhase';

// Module-level colors — updated each render by DashboardPage via C = colors
// Must be `let` so sub-components always get the current theme on re-render
let C = getColors(true);
/** Bahasa aktif — dipakai komponen di berkas ini lewat ui() */
let T_LANG = 'id';
let T: (k: string) => string = (k: string) => k;
// Status kunci mode AI Signal — di-set tiap render DashboardPage (pola sama C/T)
let AI_LOCKED = false;
// Fast Reversal juga terkunci per akun, dengan MASA BERLAKU 30 hari.
let FR_LOCKED = false;
// Mode 5st (blitz 5 detik) — berbayar per akun, 30 hari.
let BLITZ5S_LOCKED = false;

// TradingMode kini dari ./theme (dipakai bersama berkas hasil pemecahan).
// FastTradeTimeframe dipindah ke ./theme (dipakai bersama SettingsCard).

// MartingaleConfig dipindah ke ./theme (dipakai bersama ControlCard).

// FT_TF dipindah ke ./theme (hanya dipakai SettingsCard).

// ── Module-level currency config — diupdate oleh DashboardPage setiap render ──
// Pola yang sama dengan C (colors) dan T (t function) di bawah.
// Default IDR agar sub-komponen tidak error sebelum API selesai load.
let FMT: (n: number) => string = (n) => Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
let CURR_UNIT  = 'Rp';
let MIN_AMOUNT = 14_000;
let QUICK_AMOUNTS_DYN: number[] = [14_000, 70_000, 140_000, 280_000, 700_000, 1_400_000, 2_800_000];

// modeAccent dipindah ke ./runtime — ia membaca palet yang SEDANG berlaku.

// ═══════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════
// Sk dipindah ke ./primitives (membaca rt.C — lihat catatan di sana).

// Card dipindah ke ./primitives (dipakai page.tsx dan ControlCard).
const Divider = () => <div style={{height:1,margin:'12px 0',background:C.bdr}}/>;
const SL: React.FC<{children:React.ReactNode;accent?:string}> = ({children,accent}) => (
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,marginTop:4}}>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:accent||C.muted}}>{children}</span>
    <div style={{flex:1,height:1,background:accent?`linear-gradient(to right,${accent}30,transparent)`:C.bdr}}/>
  </div>
);
// FL dipindah ke ./primitives (label kecil, dipakai SettingsCard).

// Toggle dipindah ke ./primitives.
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
  // Untuk melapis tint di atas dasar kartu yang berbeda per tema (lihat <Card> di bawah).
  const { isDarkMode } = useDarkMode();
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
    <Card style={{
      padding: isMobile ? '10px 14px' : '12px 16px', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, minHeight: isMobile ? 62 : 68,
      // Tint sudut mengikuti tanda untung/rugi — kartu profit jadi "hero" seperti
      // k-card--hero koala. Gradasi tint DILAPIS DI ATAS dasar kartu, bukan
      // menggantikannya: di mode gelap .ds-card memakai linear-gradient sebagai
      // background-image, jadi backgroundImage tunggal akan menghapus dasar itu.
      // Nilai dasar mencerminkan .ds-card di berkas ini (bukan token DS).
      background: `radial-gradient(130% 120% at 100% 0%, ${col}22 0%, transparent 58%), ${isDarkMode ? 'linear-gradient(180deg, #17181C 0%, #131418 100%)' : '#ffffff'}`,
    }} flash={flash}>
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
  const { isDarkMode } = useDarkMode();
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
    // Tint sudut senada saldo (cyan REAL / amber DEMO) — sepasang dengan kartu
    // profit agar deret kartu atas terasa satu set "hero" seperti koala.
    // Dilapis di atas dasar .ds-card (lihat catatan di TodayProfitCard).
    <Card style={{ padding: '10px 14px', background: `radial-gradient(130% 120% at 100% 0%, ${balCol}1E 0%, transparent 58%), ${isDarkMode ? 'linear-gradient(180deg, #17181C 0%, #131418 100%)' : '#ffffff'}` }}>
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
// PickerOpt dipindah ke ./primitives (dipakai PickerModal & halaman ini).
// PickerModal dipindah ke ./primitives.
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
// OrderPhase & resolvePhase dipindah ke ./orderPhase.


// OrderInputModal dipindah ke ./OrderInputModal.

// Timer live untuk POSISI TERBUKA (order dieksekusi, hasil belum keluar):
// menghitung waktu berjalan sejak posisi dibuka (MM:SS) + titik berdenyut.
const LivePositionTimer: React.FC<{since:number;col:string;compact?:boolean}> = ({since,col,compact}) => {
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[]);
  const sec = Math.max(0, Math.floor((now - since)/1000));
  const label = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:compact?9:10,fontWeight:700,padding:'1px 6px',borderRadius:99,color:col,background:`${col}12`,border:`1px solid ${col}28`,flexShrink:0,fontVariantNumeric:'tabular-nums'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:col,animation:'pulse 1s ease-in-out infinite'}}/>
      {label}
    </span>
  );
};

// Timer posisi terbuka untuk mode non-jadwal (Fastrade dsb). Menghitung waktu
// berjalan sejak `orderKey` (id order aktif) muncul; reset saat id ganti / hilang.
const OpenPositionTimer: React.FC<{orderKey:string|null|undefined;col:string;compact?:boolean}> = ({orderKey,col,compact}) => {
  const startRef = useRef<{key:string;t:number}|null>(null);
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{
    if(orderKey){ if(!startRef.current||startRef.current.key!==orderKey) startRef.current={key:orderKey,t:Date.now()}; }
    else startRef.current=null;
  },[orderKey]);
  useEffect(()=>{ if(!orderKey) return; const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[orderKey]);
  if(!orderKey||!startRef.current) return null;
  const sec=Math.max(0,Math.floor((now-startRef.current.t)/1000));
  const mm=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  return (
    <span style={{position:'relative',display:'inline-flex',alignItems:'center',gap:4,fontSize:compact?9:10,fontWeight:700,padding:'2px 8px',borderRadius:99,color:col,background:`${col}12`,border:`1px solid ${col}30`,fontVariantNumeric:'tabular-nums',overflow:'hidden'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:col,animation:'pulse 1s ease-in-out infinite'}}/>
      {mm}
      <span style={{position:'absolute',left:0,bottom:0,height:2,width:'100%',overflow:'hidden',pointerEvents:'none'}}>
        <span style={{display:'block',height:'100%',width:'40%',background:`linear-gradient(90deg,transparent,${col},transparent)`,animation:'pos-sweep 1.5s linear infinite'}}/>
      </span>
    </span>
  );
};

// Banner GLOBAL "entry aktif" untuk dashboard utama (di bawah Today Profit).
// Saat posisi TERBUKA: bar progres mengisi kiri→kanan (0→100%) + timer berjalan.
// Saat posisi CLOSED: kilat MENANG/KALAH sesaat (`flash`) sebelum hilang.
const ActiveEntryBanner: React.FC<{active:boolean;orderKey:string|null;flash:'win'|'lose'|null;durationSec:number;expiryMs:number|null;trend:string|null;accent:string;label:string;sub:string}> = ({active,orderKey,flash,durationSec,expiryMs,trend,accent,label,sub}) => {
  const startRef = useRef<{key:string;t:number}|null>(null);
  const fillRef = useRef<{k:string;d:number}>({k:'',d:0}); // delay animasi bar (stabil per entry)
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{
    if(orderKey){ if(!startRef.current||startRef.current.key!==orderKey) startRef.current={key:orderKey,t:Date.now()}; }
    else startRef.current=null;
  },[orderKey]);
  useEffect(()=>{ if(!active) return; const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[active]);

  if(flash){
    const win = flash==='win'; const col = win?C.cyan:C.coral;
    return (
      <div style={{position:'relative',overflow:'hidden',display:'flex',alignItems:'center',gap:12,padding:'12px 15px',borderRadius:16,background:`${col}16`,border:`1px solid ${col}45`,animation:'res-inout 3s ease both'}}>
        <span style={{display:'inline-flex',width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',background:`${col}22`,color:col,fontSize:18,fontWeight:900,flexShrink:0}}>{win?'✓':'✕'}</span>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:col,letterSpacing:'-0.01em'}}>{win?'POSISI MENANG':'POSISI KALAH'}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</div>
        </div>
      </div>
    );
  }

  if(!active||!orderKey||!startRef.current) return null;
  // Sumber waktu: expiryMs (NYATA dari order) bila ada, jika tidak deteksi klien.
  const startMs = expiryMs!=null ? (expiryMs - durationSec*1000) : startRef.current.t;
  const remaining = expiryMs!=null ? Math.max(0, Math.round((expiryMs-now)/1000)) : Math.max(0, durationSec-Math.floor((now-startMs)/1000));
  const mm=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
  const hasTrend = trend!=null && trend!=='';
  const isBuy = hasTrend && /call|buy|up/i.test(trend!);
  // Delay animasi bar dihitung SEKALI per entry (stabil) → bar mengisi 0→100%
  // mulus selama durationSec, sinkron dengan hitung mundur; tak restart tiap detik.
  if(fillRef.current.k !== startRef.current.key){ fillRef.current = { k: startRef.current.key, d: Math.max(0,(Date.now()-startMs)/1000) }; }
  return (
    <div style={{position:'relative',overflow:'hidden',display:'flex',alignItems:'center',gap:12,padding:'12px 15px',borderRadius:16,background:`${accent}0e`,border:`1px solid ${accent}30`}}>
      <span style={{position:'relative',display:'inline-flex',width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',background:`${accent}18`,color:accent,flexShrink:0}}>
        <Zap style={{width:17,height:17}}/>
        <span style={{position:'absolute',inset:-1,borderRadius:12,border:`2px solid ${accent}`,opacity:0.5,animation:'ping 1.6s ease-in-out infinite'}}/>
      </span>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:12.5,fontWeight:700,color:C.text,display:'flex',alignItems:'center',gap:7,minWidth:0}}>
          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
          <span style={{width:6,height:6,borderRadius:'50%',background:accent,flexShrink:0,animation:'pulse 1s ease-in-out infinite'}}/>
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</div>
      </div>
      {hasTrend && (
        <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:7,flexShrink:0,color:isBuy?C.cyan:C.coral,background:isBuy?`${C.cyan}16`:`${C.coral}16`,border:`1px solid ${isBuy?C.cyan:C.coral}38`,letterSpacing:'0.02em'}}>{isBuy?'BUY ▲':'SELL ▼'}</span>
      )}
      <div style={{fontSize:21,fontWeight:800,color:accent,fontVariantNumeric:'tabular-nums',flexShrink:0,letterSpacing:'-0.02em',minWidth:52,textAlign:'right'}}>{mm}</div>
      {/* bar progres 0→100% — animasi penuh selama durationSec, sinkron hitung mundur */}
      <span style={{position:'absolute',left:0,bottom:0,height:3,width:'100%',background:`${accent}22`,overflow:'hidden',pointerEvents:'none'}}>
        <span key={fillRef.current.k} style={{display:'block',height:'100%',width:'0%',background:accent,animation:`pos-fill-run ${Math.max(1,durationSec)}s linear forwards`,animationDelay:`-${fillRef.current.d}s`}}/>
      </span>
    </div>
  );
};

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
            // Waktu posisi dibuka: pakai executedAt dari log bila ada, jika tidak jatuh ke jadwal.
            const execAt = logs.find(l => l.orderId === o.id)?.executedAt ?? o.timeInMillis;
            return (
              <div key={o.id} className="schedule-item" style={{
                display:'flex',alignItems:'center',gap:itemGap,padding:itemPad,
                borderBottom:`1px solid ${C.bdr}`,
                background: isMartingale ? `${C.amber}08` : `${C.sky}08`,
                minWidth:0,overflow:'hidden',position:'relative',
              }}>
                <span style={{fontSize:compact?9:10,fontWeight:700,color:col,width:18,textAlign:'center',flexShrink:0,animation:'pulse 1.2s ease-in-out infinite'}}>{label}</span>
                <span style={{fontSize:timeFz,fontFamily:'inherit',fontVariantNumeric:'tabular-nums',color:C.text,fontWeight:600,flexShrink:0}}>{o.time}</span>
                <span style={{fontSize:compact?8:9,fontWeight:700,padding:'1px 5px',borderRadius:4,color:isCall?C.cyan:C.coral,background:isCall?`${C.cyan}12`:`${C.coral}12`,flexShrink:0}}>{isCall?'B':'S'}</span>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,marginLeft:'auto',flexShrink:0}}>
                  {isMartingale && (
                    <span style={{fontSize:compact?8:9,fontWeight:700,padding:'1px 6px',borderRadius:99,color:col,background:`${col}12`,border:`1px solid ${col}28`}}>K{ms!.currentStep}</span>
                  )}
                  <LivePositionTimer since={execAt} col={col} compact={compact} />
                </span>
                {/* garis sapuan animasi: menandakan posisi masih berjalan */}
                <span style={{position:'absolute',left:0,bottom:0,height:2,width:'100%',overflow:'hidden',pointerEvents:'none'}}>
                  <span style={{display:'block',height:'100%',width:'38%',background:`linear-gradient(90deg,transparent,${col},transparent)`,animation:'pos-sweep 1.5s linear infinite'}}/>
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
            <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
              <OpenPositionTimer orderKey={isOn ? (status?.activeOrderId ?? null) : null} col={accent}/>
              <StatusChip col={accent} label={T('common.active')} pulse/>
            </div>
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
// AISignalPanel dipindah ke ./AISignalPanel.
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
    fastreversal:'Fast Reversal', blitz5s:'5st · Blitz 5 Detik',
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
        boxShadow:`0 32px 80px rgba(0,0,0,${C.dark?'0.70':'0.18'}), 0 8px 24px rgba(0,0,0,${C.dark?'0.50':'0.10'})`,
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
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <p style={{fontSize:20,fontWeight:600,color:C.text,letterSpacing:'-0.02em',margin:0,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{modeLabel[mode]}</p>
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
          {(mode==='fastrade'||mode==='ctc'||mode==='blitz5s')&&(
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
    { v: 'blitz5s'   as TradingMode, label: '5st · Blitz 5 Detik',  icon: <Clock     style={{ width: 16, height: 16 }} />, accent: C.sky,    desc: BLITZ5S_LOCKED ? 'Premium · Rp 85rb — aktivasi' : 'Hasil keluar 5 detik (FTT)' },
    { v: 'ctc'       as TradingMode, label: 'Fastrade CTC',         icon: <Copy      style={{ width: 16, height: 16 }} />, accent: C.violet, desc: 'Ultra-Fast Execution' },
    { v: 'fastreversal' as TradingMode, label: 'Fast Reversal',    icon: <Repeat    style={{ width: 16, height: 16 }} />, accent: C.coral,  desc: 'FTT + Balik Arah di K Terpilih' },
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
        boxShadow:`0 20px 60px rgba(0,0,0,${C.dark?'0.60':'0.14'})`,
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
            const isAiLockedRow = v === 'aisignal' && AI_LOCKED; // fitur terkunci per akun
            const isFrLockedRow = v === 'fastreversal' && FR_LOCKED; // berbayar, 30 hari
            const isBlitz5sLockedRow = v === 'blitz5s' && BLITZ5S_LOCKED; // berbayar, 30 hari
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onModeChange(v);
                  onClose();
                }}
                style={{
                  width:'100%',display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                  borderRadius:14,cursor:'pointer',
                  background:isAct?`${accent}14`:C.card2,
                  border:`1px solid ${isAct?`${accent}45`:C.bdr}`,
                  opacity:(isOtherRunning||isAiLockedRow||isFrLockedRow||isBlitz5sLockedRow)?0.55:1,
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
                <div style={{flex:1,minWidth:0,textAlign:'left'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}>
                    <span style={{fontSize:14,fontWeight:600,color:isAct?accent:C.sub,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>{label}</span>
                    {/* Badge hanya untuk mode yang SEDANG BERJALAN */}
                    {isAct && locked && (
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6,color:accent,background:`${accent}15`,border:`1px solid ${accent}35`,letterSpacing:'0.04em',flexShrink:0,display:'flex',alignItems:'center',gap:3}}>
                        <span style={{width:4,height:4,borderRadius:'50%',background:accent,animation:'ping 1.4s ease-in-out infinite',display:'inline-block'}}/>
                        {T('dashboard.modePicker.running')}
                      </span>
                    )}
                  </div>
                  <span style={{display:'block',fontSize:11,color:C.muted,marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{desc}</span>
                </div>
                {(isAiLockedRow||isFrLockedRow||isBlitz5sLockedRow) ? (
                  <Lock style={{width:15,height:15,color:C.amber,flexShrink:0}}/>
                ) : isAct ? (
                  <Check style={{width:17,height:17,color:accent,flexShrink:0}}/>
                ) : (
                  <ChevronRight style={{width:15,height:15,color:C.muted,flexShrink:0,opacity:0.55}}/>
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
// AI SIGNAL LOCKED MODAL — fitur terkunci per akun
// ═══════════════════════════════════════════
/**
 * Tautan mailto untuk permintaan aktivasi fitur — isi pesannya SUDAH terisi
 * (User ID Stockity + email akun). Sebelumnya hanya subjek yang terisi sehingga
 * admin harus menanyakan identitas dulu sebelum bisa memproses aktivasi.
 */
function buildActivationMailto(to: string, feature: string, userId?: string, email?: string): string {
  const body =
    `Halo Admin,\n\n` +
    `Saya ingin mengaktifkan fitur: ${feature}\n\n` +
    `User ID Stockity : ${userId || '(tidak terbaca)'}\n` +
    `Email akun       : ${email || '(tidak terbaca)'}\n` +
    `Aplikasi         : STC AutoTrade\n\n` +
    `Mohon dibantu proses aktivasinya. Terima kasih.`;
  return `mailto:${to}?subject=${encodeURIComponent(`Aktivasi ${feature}`)}&body=${encodeURIComponent(body)}`;
}

const AI_LOCK_STR: Record<string, { title: string; body: string; hint: string; mail: string; close: string }> = {
  id: { title: 'Mode AI Signal Terkunci',  body: 'Fitur AI Signal belum aktif di akun Anda.', hint: 'Aktifkan dengan langganan Rp 50.000 / bulan. Verifikasi rata-rata ~10 menit, admin online 24 jam.', mail: 'Aktivasi Mode AI Signal', close: 'Tutup' },
  en: { title: 'AI Signal Mode Locked',    body: 'The AI Signal feature is not active on your account yet.', hint: 'Activate with a Rp 50,000 / month subscription. Verification ~10 minutes on average, admin online 24 hours.', mail: 'Activate AI Signal', close: 'Close' },
  ru: { title: 'Режим AI Signal заблокирован', body: 'Функция AI Signal ещё не активна на вашем аккаунте.', hint: 'Активируйте по подписке Rp 50.000 / месяц. Проверка в среднем ~10 минут.', mail: 'Активировать AI Signal', close: 'Закрыть' },
  es: { title: 'Modo AI Signal bloqueado', body: 'La función AI Signal aún no está activa en tu cuenta.', hint: 'Actívalo con una suscripción de Rp 50.000 / mes. Verificación ~10 minutos en promedio.', mail: 'Activar AI Signal', close: 'Cerrar' },
  ms: { title: 'Mod AI Signal Dikunci',    body: 'Ciri AI Signal belum aktif pada akaun anda.', hint: 'Aktifkan dengan langganan Rp 50.000 / bulan. Pengesahan purata ~10 minit.', mail: 'Aktifkan AI Signal', close: 'Tutup' },
};

const FR_LOCK_STR: Record<string,{title:string;body:string;hint:string;cta:string;close:string;mail:string}> = {
  id: { title:'Fast Reversal terkunci',
        body:'Mode ini berbayar dan berlaku 30 hari sejak diaktifkan. Hubungi admin untuk mengaktifkannya di akun Anda.',
        hint:'Setelah aktif, mode REAL ikut terbuka otomatis.',
        cta:'Hubungi Admin', close:'Nanti saja', mail:FAST_REVERSAL_CONTACT_EMAIL },
  en: { title:'Fast Reversal is locked',
        body:'This mode is paid and stays active for 30 days from activation. Contact an admin to enable it on your account.',
        hint:'Once active, REAL mode is unlocked automatically.',
        cta:'Contact Admin', close:'Later', mail:FAST_REVERSAL_CONTACT_EMAIL },
};

const FrLockedModal: React.FC<{ open: boolean; onClose: () => void; lang: string; onActivate: () => void }> = ({ open, onClose, lang, onActivate }) => {
  if (!open) return null;
  const S = FR_LOCK_STR[lang] ?? FR_LOCK_STR.en;
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',textAlign:'center'}}>
        <div style={{width:52,height:52,margin:'0 auto 14px',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.amber}14`,border:`1px solid ${C.amber}30`}}>
          <Lock style={{width:22,height:22,color:C.coral}}/>
        </div>
        <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>{S.title}</p>
        <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:4}}>{S.body}</p>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:16}}>{S.hint}</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'11px 0',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub}}>{S.close}</button>
          <button onClick={onActivate}
             style={{flex:1.4,padding:'11px 0',borderRadius:12,background:C.amber,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:C.onAmber,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {S.mail}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// REAL LOCKED MODAL — v4: mode REAL hanya utk akun baru via selfregister
// ═══════════════════════════════════════════


const AiLockedModal: React.FC<{ open: boolean; onClose: () => void; lang: string; onActivate: () => void }> = ({ open, onClose, lang, onActivate }) => {
  if (!open) return null;
  const S = AI_LOCK_STR[lang] ?? AI_LOCK_STR.en;
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',textAlign:'center'}}>
        <div style={{width:52,height:52,margin:'0 auto 14px',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.amber}14`,border:`1px solid ${C.amber}30`}}>
          <Lock style={{width:22,height:22,color:C.amber}}/>
        </div>
        <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>{S.title}</p>
        <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:4}}>{S.body}</p>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:16}}>{S.hint}</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'11px 0',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub}}>{S.close}</button>
          <button onClick={onActivate}
             style={{flex:1.4,padding:'11px 0',borderRadius:12,background:C.amber,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:C.onAmber,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {S.mail}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// 5st (BLITZ) LOCKED MODAL — berbayar, popup dulu sebelum ke portal pembayaran
// ═══════════════════════════════════════════
const BLITZ5S_LOCK_STR: Record<string, { title: string; body: string; hint: string; go: string; close: string }> = {
  id: { title: 'Mode 5st (Blitz) Terkunci', body: 'Order kilat 5 detik — fitur berbayar Rp 85.000 / 30 hari.', hint: 'Lanjut ke portal pembayaran untuk mengaktifkan. Pembayaran via QRIS, aktif setelah diverifikasi admin.', go: 'Lanjut ke Pembayaran', close: 'Tutup' },
  en: { title: '5st (Blitz) Mode Locked', body: '5-second blitz orders — a paid feature, Rp 85,000 / 30 days.', hint: 'Continue to the payment portal to activate. Payment via QRIS, active after admin verification.', go: 'Continue to Payment', close: 'Close' },
  ru: { title: 'Режим 5st (Blitz) заблокирован', body: 'Блиц-ордера 5 секунд — платная функция, Rp 85.000 / 30 дней.', hint: 'Перейдите к оплате, чтобы активировать. Оплата через QRIS, активация после проверки.', go: 'Перейти к оплате', close: 'Закрыть' },
  es: { title: 'Modo 5st (Blitz) bloqueado', body: 'Órdenes blitz de 5 segundos — función de pago, Rp 85.000 / 30 días.', hint: 'Continúa al portal de pago para activar. Pago vía QRIS, activo tras verificación.', go: 'Ir al pago', close: 'Cerrar' },
  ms: { title: 'Mod 5st (Blitz) Dikunci', body: 'Order kilat 5 saat — ciri berbayar Rp 85,000 / 30 hari.', hint: 'Teruskan ke portal pembayaran untuk mengaktifkan. Bayaran via QRIS, aktif selepas disahkan.', go: 'Teruskan ke Pembayaran', close: 'Tutup' },
};

const Blitz5sLockedModal: React.FC<{ open: boolean; onClose: () => void; lang: string; onActivate: () => void }> = ({ open, onClose, lang, onActivate }) => {
  if (!open) return null;
  const S = BLITZ5S_LOCK_STR[lang] ?? BLITZ5S_LOCK_STR.en;
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',textAlign:'center'}}>
        <div style={{width:52,height:52,margin:'0 auto 14px',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.sky}14`,border:`1px solid ${C.sky}30`}}>
          <Clock style={{width:22,height:22,color:C.sky}}/>
        </div>
        <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>{S.title}</p>
        <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:4}}>{S.body}</p>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:16}}>{S.hint}</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'11px 0',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub}}>{S.close}</button>
          <button onClick={onActivate}
             style={{flex:1.4,padding:'11px 0',borderRadius:12,background:C.sky,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:'#ffffff',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {S.go}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// REAL LOCKED MODAL — v4: mode REAL hanya utk akun baru via selfregister
// ═══════════════════════════════════════════
const REAL_LOCK_STR: Record<string, { title: string; body: string; hint: string; cta: string; close: string }> = {
  id: { title: 'Mode REAL Terkunci',   body: 'Akun Anda saat ini hanya dapat menggunakan mode DEMO.', hint: 'Buka mode REAL dengan aktivasi sekali bayar Rp 150.000. Isi data & bukti pembayaran di portal, admin akan mengaktifkannya.', cta: 'Aktivasi Mode REAL', close: 'Tutup' },
  en: { title: 'REAL Mode Locked',     body: 'Your account can currently use DEMO mode only.', hint: 'Unlock REAL mode with a one-time Rp 150,000 activation. Fill in your details & payment proof on the portal and an admin will activate it.', cta: 'Activate REAL Mode', close: 'Close' },
  ru: { title: 'Режим REAL заблокирован', body: 'Ваш аккаунт сейчас может использовать только режим ДЕМО.', hint: 'Откройте режим REAL разовой активацией за Rp 150 000. Заполните данные и чек оплаты на портале — админ активирует.', cta: 'Активировать REAL', close: 'Закрыть' },
  es: { title: 'Modo REAL bloqueado',  body: 'Tu cuenta actualmente solo puede usar el modo DEMO.', hint: 'Desbloquea el modo REAL con una activación única de Rp 150.000. Completa tus datos y comprobante en el portal y un admin lo activará.', cta: 'Activar Modo REAL', close: 'Cerrar' },
  ms: { title: 'Mod REAL Dikunci',     body: 'Akaun anda buat masa ini hanya boleh menggunakan mod DEMO.', hint: 'Buka mod REAL dengan pengaktifan sekali bayar Rp 150,000. Isi maklumat & bukti pembayaran di portal, admin akan mengaktifkannya.', cta: 'Aktifkan Mod REAL', close: 'Tutup' },
};

// v4: alasan REAL terkunci — 'account' (belum daftar afiliasi) atau 'platform'
// (dibuka di browser; eksekusi order hanya bisa lewat APK karena server Stockity
// mewajibkan header autentikasi yang tak bisa dikirim browser).
type RealLockReason = 'account' | 'platform';

const APK_LOCK_STR: Record<string, { title: string; body: string; hint: string; cta: string; close: string }> = {
  id: { title: 'Aktifkan Mode REAL', body: 'Akun Anda saat ini masih DEMO. Buka mode REAL dengan aktivasi sekali bayar Rp 150.000.', hint: 'Aktivasi bisa dilakukan langsung di sini — TANPA perlu mengunduh atau memakai aplikasi Android. Setelah aktif, mode REAL bisa dipakai di versi web maupun aplikasi.', cta: 'Download Aplikasi', close: 'Tutup' },
  en: { title: 'Activate REAL Mode', body: 'Your account is currently on DEMO. Unlock REAL mode with a one-time Rp 150,000 activation.', hint: 'You can activate right here — with NO need to download or use the Android app. Once active, REAL mode works on both the web and the app.', cta: 'Download App', close: 'Close' },
  ru: { title: 'Откройте в приложении Android', body: 'Режим REAL работает только в приложении STC AutoTrade для Android.', hint: 'В приложении сделки исполняются напрямую с вашего устройства — безопаснее и соответствует правилам платформы. Веб-версия остаётся для режима ДЕМО и мониторинга.', cta: 'Скачать приложение', close: 'Закрыть' },
  es: { title: 'Ábrelo en la app de Android', body: 'El modo REAL solo funciona en la app STC AutoTrade para Android.', hint: 'En la app, las órdenes se ejecutan desde la conexión de tu propio dispositivo: más seguro y conforme a las reglas de la plataforma. La versión web sigue disponible para el modo DEMO y seguimiento.', cta: 'Descargar app', close: 'Cerrar' },
  ms: { title: 'Buka dalam Aplikasi Android', body: 'Mod REAL hanya berjalan dalam aplikasi STC AutoTrade untuk Android.', hint: 'Dalam aplikasi, pesanan dilaksanakan terus dari sambungan peranti anda sendiri — lebih selamat dan mematuhi peraturan platform. Versi web kekal untuk mod DEMO dan pemantauan.', cta: 'Muat Turun Aplikasi', close: 'Tutup' },
};

const REAL_ACT_LABEL: Record<string, string> = { id: 'Aktivasi Mode REAL', en: 'Activate REAL Mode', ru: 'Активировать REAL', es: 'Activar Modo REAL', ms: 'Aktifkan Mod REAL' };
// Jalur GRATIS mode REAL: unduh aplikasi + daftar akun baru (self-register) → REAL terbuka otomatis.
const REAL_FREE_STR: Record<string, string> = {
  id: 'Gratis tanpa bayar: unduh aplikasi lalu daftar akun baru — mode REAL otomatis terbuka.',
  en: 'Free option: download the app then register a new account — REAL mode unlocks automatically.',
  ru: 'Бесплатно: скачайте приложение и зарегистрируйте новый аккаунт — режим REAL откроется автоматически.',
  es: 'Gratis: descarga la app y registra una cuenta nueva — el modo REAL se abre automáticamente.',
  ms: 'Percuma: muat turun aplikasi lalu daftar akaun baharu — mod REAL terbuka automatik.',
};
const RealLockedModal: React.FC<{ open: boolean; onClose: () => void; onRegister: () => void; onActivate: () => void; lang: string; reason?: RealLockReason }> = ({ open, onClose, onRegister, onActivate, lang, reason = 'account' }) => {
  if (!open) return null;
  const S = reason === 'platform'
    ? (APK_LOCK_STR[lang] ?? APK_LOCK_STR.en)
    : (REAL_LOCK_STR[lang] ?? REAL_LOCK_STR.en);
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',textAlign:'center'}}>
        <div style={{width:52,height:52,margin:'0 auto 14px',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.cyan}14`,border:`1px solid ${C.cyan}30`}}>
          {reason === 'platform'
            ? <Smartphone style={{width:22,height:22,color:C.cyan}}/>
            : <Lock style={{width:22,height:22,color:C.cyan}}/>}
        </div>
        <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>{S.title}</p>
        <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:4}}>{S.body}</p>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:12}}>{S.hint}</p>
        <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'10px 12px',borderRadius:12,background:`${C.cyan}12`,border:`1px solid ${C.cyan}30`,marginBottom:16,textAlign:'left'}}>
          <span style={{fontSize:14,flexShrink:0,marginTop:1}}>🎁</span>
          <span style={{fontSize:12,fontWeight:600,color:C.cyan,lineHeight:1.45}}>{REAL_FREE_STR[lang] ?? REAL_FREE_STR.en}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          {reason === 'platform' && (
            <button onClick={onRegister} style={{flex:1,padding:'11px 0',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub}}>{S.cta}</button>
          )}
          <button onClick={onActivate} style={{flex:reason==='platform'?1.2:1,padding:'11px 0',borderRadius:12,background:C.cyan,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:'#06251b'}}>{REAL_ACT_LABEL[lang] ?? REAL_ACT_LABEL.en}</button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// SARAN MODAL TRADING — muncul sekali tiap login segar
// ═══════════════════════════════════════════
const ADVICE_STR: Record<string, { title: string; body1: string; body2: string; tip: string; ok: string }> = {
  id: { title: 'Manajemen Modal', body1: 'Modal awal yang kami sarankan minimal', body2: ', Modal di bawah angka ini berisiko habis sebelum strategi martingale Anda sempat bekerja.', tip: '', ok: 'Saya mengerti' },
  en: { title: 'Capital Management', body1: 'We recommend a starting capital of at least', body2: '. Below this amount, your balance risks being depleted before your martingale strategy has a chance to work.', tip: '', ok: 'Understood' },
  ru: { title: 'Управление капиталом', body1: 'Рекомендуемый стартовый капитал — не менее', body2: '. При меньшей сумме депозит рискует обнулиться раньше, чем стратегия мартингейла успеет сработать.', tip: '', ok: 'Понятно' },
  es: { title: 'Gestión de capital', body1: 'Recomendamos un capital inicial de al menos', body2: '. Por debajo de esta cifra, el saldo corre el riesgo de agotarse antes de que tu estrategia de martingala funcione.', tip: '', ok: 'Entendido' },
  ms: { title: 'Pengurusan Modal', body1: 'Modal permulaan yang kami sarankan sekurang-kurangnya', body2: '. Di bawah angka ini, modal berisiko habis sebelum strategi martingale anda sempat berhasil.', tip: '', ok: 'Saya faham' },
};

const CapitalAdviceModal: React.FC<{ open: boolean; onClose: () => void; lang: string; minAmount: number; currUnit: string }> = ({ open, onClose, lang, minAmount, currUnit }) => {
  if (!open) return null;
  const S = ADVICE_STR[lang] ?? ADVICE_STR.en;
  // Rekomendasi modal awal = Rp 1.200.000 (patokan IDR, order minimum 14.000).
  // Mata uang lain ikut menyesuaikan proporsional terhadap order minimumnya.
  // (Sebelumnya ≈34,3× = Rp 480.000; dinaikkan 2026-08-18.)
  const REC_IDR = 1_200_000, MIN_IDR = 14_000;
  const rec = Math.round(Math.max(minAmount, 1) * (REC_IDR / MIN_IDR));
  const recLabel = `${currUnit} ${Math.round(rec).toLocaleString('id-ID')}`;
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:400,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          <div style={{width:44,height:44,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.sky}14`,border:`1px solid ${C.sky}30`,flexShrink:0}}>
            <Wallet style={{width:20,height:20,color:C.sky}}/>
          </div>
          <p style={{fontSize:16,fontWeight:700,color:C.text}}>{S.title}</p>
        </div>
        <p style={{fontSize:13,color:C.sub,lineHeight:1.6}}>
          {S.body1}{' '}
          <span style={{fontWeight:800,color:C.sky}}>{recLabel}</span>{S.body2}
        </p>
        {S.tip ? (
          <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'10px 12px',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,margin:'14px 0 16px'}}>
            <Info style={{width:13,height:13,color:C.sky,flexShrink:0,marginTop:2}}/>
            <p style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{S.tip}</p>
          </div>
        ) : <div style={{height:18}}/>}
        <button onClick={onClose} style={{width:'100%',padding:'12px 0',borderRadius:12,background:C.sky,border:'none',cursor:'pointer',fontSize:14,fontWeight:700,color:'#06251b'}}>{S.ok}</button>
      </div>
    </div>
  );
};

// Modal KODE PROMO dihapus 2026-08-13 — promonya sudah tidak berjalan.

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
    // Engine spesifik didahulukan; FT generik terakhir. Status FT TIDAK membawa
    // penanda 5st (blitz), jadi utk keluarga-FT hormati mode lokal supaya 5st/
    // reversal/ctc tak "berubah" jadi fastrade di tampilan.
    if(isRunning)  return 'schedule';
    if(isIndR)     return 'indicator';
    if(isMomR)     return 'momentum';
    if(isAIR)      return 'aisignal';
    if(isFtR) {
      if((ftStatus as any)?.mode === 'CTC') return 'ctc';
      if(((ftStatus as any)?.reversalSteps?.length ?? 0) > 0) return 'fastreversal';
      if(mode === 'blitz5s' || mode === 'fastreversal' || mode === 'ctc') return mode;
      return 'fastrade';
    }
    return '';
  })();
  const isAnyRunning = !!runningMode;

  const MODE_LIST = [
    { v: 'schedule'  as TradingMode, label: 'Signal Mode',           icon: <Calendar  style={{ width: 12, height: 12 }} />, accent: C.cyan,   desc: 'Manual Input Signal' },
    { v: 'fastrade'  as TradingMode, label: 'Fastrade FTT Mode',    icon: <Zap       style={{ width: 12, height: 12 }} />, accent: C.cyan,   desc: 'Fast Trade Execution' },
    { v: 'blitz5s'   as TradingMode, label: '5st · Blitz 5 Detik',  icon: <Clock     style={{ width: 12, height: 12 }} />, accent: C.sky,    desc: BLITZ5S_LOCKED ? 'Premium · Rp 85rb — aktivasi' : 'Hasil keluar 5 detik (FTT)' },
    { v: 'ctc'       as TradingMode, label: 'Fastrade CTC',         icon: <Copy      style={{ width: 12, height: 12 }} />, accent: C.violet, desc: 'Ultra-Fast Execution' },
    { v: 'fastreversal' as TradingMode, label: 'Fast Reversal',    icon: <Repeat    style={{ width: 16, height: 16 }} />, accent: C.coral,  desc: 'FTT + Balik Arah di K Terpilih' },
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
          {/* Label "Trading Mode" dihapus — mode sudah terpilih, nama mode saja cukup */}
          <p style={{ fontSize: 14, fontWeight: 650, color: C.text, margin: 0, lineHeight: 1.2, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{active.label}</p>
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
        {(mode === 'fastrade' || mode === 'ctc' || mode === 'blitz5s') && (
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
// MartingaleDialog dipindah ke ./SettingsCard.
// SettingsCard dipindah ke ./SettingsCard.
const DarkModeToggleStrip: React.FC<{
  isDarkMode: boolean;
  onToggle: () => void;
  C: Colors;
  disabled?: boolean;
}> = ({ isDarkMode, onToggle, C, disabled }) => (
  <button
    onClick={disabled ? undefined : onToggle}
    disabled={disabled}
    title={disabled ? 'Nonaktif saat mode berjalan' : undefined}
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 14,
      background: C.card,
      border: `1px solid ${C.bdr}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
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



// ═══════════════════════════════════════════
// PEMBERITAHUAN AKTIVASI — muncul SEKALI per kejadian aktivasi.
// Penanda "sudah dilihat" memuat stempel waktu, jadi perpanjangan
// (stempel baru) memunculkannya lagi — yang memang diinginkan.
// ═══════════════════════════════════════════
const ActivationNoticeModal: React.FC<{
  open: boolean; onClose: () => void;
  at: number; expiresAt?: number | null; featureLabel: string;
}> = ({ open, onClose, at, expiresAt, featureLabel }) => {
  if (!open) return null;
  const fmt = (ms: number) => new Date(ms).toLocaleString('id-ID', {
    day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit',
  });
  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:12}}>
          <div style={{width:56,height:56,borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.cyan}18`,border:`1px solid ${C.cyan}35`,color:C.cyan}}>
            <BadgeCheck style={{width:28,height:28}}/>
          </div>
          <p style={{fontSize:17,fontWeight:750,color:C.text}}>{featureLabel} aktif</p>
          <p style={{fontSize:13,color:C.sub,lineHeight:1.6}}>Pembayaranmu sudah kami terima dan akunmu telah diaktifkan.</p>
          <div style={{width:'100%',display:'flex',flexDirection:'column',gap:8,padding:'13px 14px',borderRadius:14,background:C.card2,border:`1px solid ${C.bdr}`}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
              <span style={{fontSize:12,color:C.muted}}>Diaktifkan</span>
              <span style={{fontSize:12.5,fontWeight:700,color:C.text,textAlign:'right'}}>{fmt(at)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
              <span style={{fontSize:12,color:C.muted}}>Berlaku sampai</span>
              <span style={{fontSize:12.5,fontWeight:700,color:expiresAt?C.text:C.cyan,textAlign:'right'}}>{expiresAt?fmt(expiresAt):'Selamanya'}</span>
            </div>
          </div>
          <button onClick={onClose} style={{width:'100%',marginTop:6,padding:'12px',borderRadius:14,border:'none',background:C.cyan,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>Mengerti</button>
        </div>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const { t, language, setLanguage: setLanguageHook } = useLanguage();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const colors = useMemo(() => getColors(isDarkMode), [isDarkMode]);
  // ✅ FIX: Update module-level C so all sub-components use the correct theme
  C = colors;
  T = t;
  // Wadah runtime diisi berbarengan supaya komponen yang sudah dipecah
  // keluar dari berkas ini melihat palet & terjemahan yang sama.
  rt.C = colors;
  rt.T = t;
  T_LANG = language;
  rt.LANG = language;

  // ── Currency config dari Stockity API (amounts, unit, min, max per negara) ──
  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig>(DEFAULT_CURRENCY_CONFIG);

  // ── Kunci mode AI Signal per akun + saran modal sekali-per-login ──────────
  // Identitas akun — dipakai mengisi otomatis email permintaan aktivasi
  const [meId,    setMeId]    = useState('');
  const [meEmail, setMeEmail] = useState('');
  // ── Mode pemeliharaan (dikendalikan super admin) ──────────────────────────
  const [maint, setMaint] = useState<MaintenanceInfo>(MAINTENANCE_OFF);
  const [maintChecked, setMaintChecked] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const checkMaintenance = useCallback(async () => {
    try {
      const [m, sa] = await Promise.all([getMaintenance(), checkIsSuperAdmin()]);
      setMaint(m); setIsSuperAdminUser(sa);
    } catch { setMaint(MAINTENANCE_OFF); }
    finally { setMaintChecked(true); }
  }, []);
  useEffect(() => { void checkMaintenance(); }, [checkMaintenance]);
  const [aiUnlocked,  setAiUnlocked]  = useState(false);
  const [frUnlocked,  setFrUnlocked]  = useState(false);
  const [frExpiry,    setFrExpiry]    = useState<number|null>(null);
  // ── Kunci mode 5st (BLITZ 5 detik) — fitur berbayar (Rp 85rb / 30 hari) ──
  const [blitz5sUnlocked, setBlitz5sUnlocked] = useState(false);
  const [blitz5sCheckDone, setBlitz5sCheckDone] = useState(false);
  const [blitz5sExpiry,   setBlitz5sExpiry]   = useState<number|null>(null);

  // Pemberitahuan aktivasi fitur berbayar — muncul SEKALI per kejadian.
  // Kunci penanda memuat stempel waktu, jadi perpanjangan memunculkannya lagi.
  const [pemberitahuan, setPemberitahuan] = useState<
    { at:number; sampai:number|null; label:string } | null
  >(null);
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const uid = await storage.get(SESSION_KEYS.USER_ID);
        if (!uid) return;
        const kandidat: { at:number; sampai:number|null; label:string }[] = [];
        const realAt = await getRealAccessAt(uid);
        if (realAt) kandidat.push({ at: realAt, sampai: null, label: 'Mode REAL' });
        const ai = await getAiSignalEntry(uid);
        if (ai?.sejak) kandidat.push({ at: ai.sejak, sampai: ai.sampai, label: 'AI Signal' });

        const fr = await getFastReversalEntry(uid);
        if (fr?.sejak) kandidat.push({ at: fr.sejak, sampai: fr.sampai, label: 'Fast Reversal' });
        for (const k of kandidat) {
          if (batal) return;
          const kunci = `stc_notice_${k.label.replace(/\s+/g,'')}_${uid}_${k.at}`;
          if (await storage.get(kunci)) continue;
          setPemberitahuan(k);
          await storage.set(kunci, '1');
          return;
        }
      } catch { /* bukan hal kritis */ }
    })();
    return () => { batal = true; };
  }, []);

  const [aiCheckDone, setAiCheckDone] = useState(false);
  const [frCheckDone, setFrCheckDone] = useState(false);
  const [aiLockOpen,  setAiLockOpen]  = useState(false);
  const [blitz5sLockOpen, setBlitz5sLockOpen] = useState(false);
  const [frLockOpen,  setFrLockOpen]  = useState(false);
  const [adviceOpen,  setAdviceOpen]  = useState(false);
  // ── v4: akses mode REAL (user lama demo-only) ─────────────────────────────
  const [realAccess,    setRealAccess]    = useState(false);
  const [realCheckDone, setRealCheckDone] = useState(false);
  const [realLockOpen,  setRealLockOpen]  = useState(false);
  const [realLockReason, setRealLockReason] = useState<RealLockReason>('account');
  // ── Alihkan ke halaman DAFTAR akun baru (dari mode REAL terkunci / promo) ──────
  // Perbaikan: JANGAN logout di dashboard (balapan dengan penjaga sesi bisa memantul
  // ke /login atau membuat tampilan diam). Cukup pasang penanda; halaman /register
  // yang akan mengakhiri sesi lama dan MELEWATI pantulan ke dashboard.
  const goRegister = useCallback(() => {
    try { localStorage.setItem('stc_force_register', '1'); } catch { /* abaikan */ }
    const target = `${window.location.origin}/register/`;
    try { window.location.replace(target); } catch { /* fallback di bawah */ }
    setTimeout(() => {
      if (!window.location.pathname.startsWith('/register')) window.location.assign(target);
    }, 600);
  }, []);
  // v4: browser tidak bisa mengeksekusi order (server Stockity mewajibkan header
  // auth pada WS; hanya APK yang bisa). Web = DEMO + pemantauan.
  const [isApk, setIsApk] = useState(true); // asumsi APK sampai terbukti sebaliknya → hindari kedip modal
  useEffect(() => { setIsApk(isNativeApp()); }, []);

  // v4 Fase B: di APK, mode Schedule dieksekusi engine di perangkat (bukan VPS).
  // Saat aktif, status/order/log berasal dari engine — polling API tidak boleh menimpanya.
  const [deviceEngineOn, setDeviceEngineOn] = useState(false);
  const deviceEngineOnRef = useRef(false);
  useEffect(() => { deviceEngineOnRef.current = deviceEngineOn; }, [deviceEngineOn]);

  // Engine hidup di luar React: saat pindah halaman lalu kembali, komponen
  // dipasang ulang dan penanda ini kembali false — status sesi yang sedang
  // berjalan lalu tertimpa data 'berhenti', membuat tampilan berkedip dan
  // seolah tersangkut. Karena itu penandanya dipulihkan dari engine.
  useEffect(() => {
    const eng: any = deviceSession.getEngine() ?? deviceSession.getModeEngine();
    const running = deviceSession.isRunning() || eng?.getStatus?.()?.isRunning === true;
    if (running) setDeviceEngineOn(true);
  }, []);
  const [resumePrompt, setResumePrompt] = useState<{ orders: number; pnl: number } | null>(null);
  const resumeDataRef = useRef<any>(null);
  // Badge kunci di pemilih mode baru tampil setelah status terverifikasi,
  // agar user yang punya akses tidak melihat kilatan ikon gembok.
  AI_LOCKED = aiCheckDone && !aiUnlocked;
  FR_LOCKED = frCheckDone && !frUnlocked;
  BLITZ5S_LOCKED = !blitz5sUnlocked;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await storage.get(SESSION_KEYS.USER_ID);
        // Identitas dipakai untuk mengisi otomatis isi email permintaan aktivasi
        try {
          const mail = await storage.get(SESSION_KEYS.EMAIL);
          if (!cancelled) { setMeId(uid ?? ''); setMeEmail(mail ?? ''); }
        } catch { /* identitas opsional */ }
        const [ok, real, frOk, frExp, b5, b5Exp] = await Promise.all([
          isAiSignalUnlocked(uid), hasRealAccess(uid),
          isFastReversalUnlocked(uid), getFastReversalExpiry(uid),
          isBlitz5sUnlocked(uid), getBlitz5sExpiry(uid),
        ]);
        if (!cancelled) {
          setAiUnlocked(ok); setAiCheckDone(true);
          setRealAccess(real); setRealCheckDone(true);
          setFrUnlocked(frOk); setFrExpiry(frExp); setFrCheckDone(true);
          setBlitz5sUnlocked(b5); setBlitz5sExpiry(b5Exp); setBlitz5sCheckDone(true);
        }
      } catch {
        if (!cancelled) { setAiCheckDone(true); setRealCheckDone(true); setFrCheckDone(true); setBlitz5sCheckDone(true); } // gagal cek → terkunci (default aman)
      }
    })();
    // Flag 'stc_from_login' di-set halaman login/register tepat sebelum redirect —
    // dikonsumsi sekali di sini sehingga pesan muncul lagi setiap login berikutnya.
    try {
      if (sessionStorage.getItem('stc_from_login') === '1') {
        sessionStorage.removeItem('stc_from_login');
        setAdviceOpen(true);
      }
    } catch { /* sessionStorage tidak tersedia — abaikan */ }
    return () => { cancelled = true; };
  }, []);

  // Update module-level formatters setiap render — pola sama dengan C dan T di atas
  const intlLocale = langToIntlLocale(language);
  FMT         = (n: number) => Math.round(n).toLocaleString(intlLocale, { maximumFractionDigits: 0 });
  CURR_UNIT   = currencyConfig.currencyUnit;
  MIN_AMOUNT  = currencyConfig.minAmount;
  // Wadah runtime ikut diisi — komponen hasil pemecahan membacanya dari sana.
  rt.FMT        = FMT;
  rt.CURR_UNIT  = CURR_UNIT;
  rt.MIN_AMOUNT = MIN_AMOUNT;
  rt.QUICK_AMOUNTS = QUICK_AMOUNTS_DYN;
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
  // Ref selalu-terkini: loadAll di-memo dgn deps [router], jadi closure-nya
  // menangkap tradingMode render pertama (default, sebelum settings ter-hydrate).
  // Deteksi mode di loadAll HARUS baca nilai terbaru lewat ref — kalau tidak,
  // mode 5st/indicator/dll akan salah dipulihkan jadi 'fastrade'.
  const tradingModeRef = useRef(tradingMode);
  tradingModeRef.current = tradingMode;
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
  const blitz5s              = _s.blitz5s ?? false;
  const reversalSteps        = _s.reversalSteps ?? [];
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
  const setBlitz5s              = (v: boolean)                                    => _upd('blitz5s', v);
  const setReversalSteps        = (v: number[])                                  => _upd('reversalSteps', v);
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
      // Engine perangkat (APK) adalah sumber kebenaran saat aktif — jangan ditimpa polling VPS
      if(!deviceEngineOnRef.current){
        if(schRes.status==='fulfilled')setScheduleStatus(schRes.value);
        if(ordRes.status==='fulfilled')setScheduleOrders(ordRes.value);
        if(logRes.status==='fulfilled')setScheduleLogs(logRes.value);
      }
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

        // Deteksi ini MEMULIHKAN mode saat state lokal belum termuat (mis. halaman
        // dibuka segar di perangkat lain). TAPI ia TIDAK BOLEH menimpa mode lokal
        // yang sudah benar: backend melaporkan semua mode keluarga-FT (fastrade /
        // ctc / fastreversal / 5st) hanya sebagai 'FTT'/'CTC', dan status /fastrade
        // bisa basi (isRunning tertinggal true setelah sesi FT lama). Menimpa
        // membabi buta itulah yang membuat 5st — dan mode lain — tiba-tiba
        // berpindah sendiri ke FTT setiap dashboard di-mount ulang. Maka:
        //  1) hormati mode lokal bila sudah konsisten dgn engine yang berjalan;
        //  2) dahulukan engine spesifik (schedule/ai/indicator/momentum) di atas
        //     FT yang generik & rawan basi.
        const runSchedule  = schData?.botState === 'RUNNING' || schData?.botState === 'PAUSED';
        const runAisignal  = aiData?.botState === 'RUNNING' || (!aiData?.botState && !!aiData?.isActive);
        const runIndicator = !!indData?.isRunning;
        const runMomentum  = !!momData?.isRunning;
        const runFt        = !!ftData?.isRunning;
        const ftFamily: TradingMode[] = ['fastrade', 'ctc', 'fastreversal', 'blitz5s'];

        const localMode = tradingModeRef.current; // nilai TERBARU (bukan closure basi)
        const localConsistent =
          (localMode === 'schedule'  && runSchedule)  ||
          (localMode === 'aisignal'  && runAisignal)  ||
          (localMode === 'indicator' && runIndicator) ||
          (localMode === 'momentum'  && runMomentum)  ||
          (ftFamily.includes(localMode) && runFt);

        if (localConsistent) {
          // Mode lokal sudah benar (termasuk 5st/reversal/ctc yang jalan via FT) — jangan diganggu.
          setIsModeChosen(true);
        } else if (runIndicator) {
          setTradingMode('indicator');
          setIsModeChosen(true);
        } else if (runMomentum) {
          setTradingMode('momentum');
          setIsModeChosen(true);
        } else if (runAisignal) {
          setTradingMode('aisignal');
          setIsModeChosen(true);
        } else if (runSchedule) {
          setTradingMode('schedule');
          setIsModeChosen(true);
        } else if (runFt) {
          // Sub-mode FT: pakai penanda status bila ada (CTC / reversalSteps);
          // kalau tidak, hormati sub-mode FT lokal (mis. 5st) — status /fastrade
          // TIDAK membawa penanda blitz, jadi lokal satu-satunya sumbernya.
          const sub: TradingMode =
            ftData!.mode === 'CTC' ? 'ctc'
            : (ftData!.reversalSteps?.length ?? 0) > 0 ? 'fastreversal'
            : (['ctc', 'fastreversal', 'blitz5s'].includes(localMode) ? localMode : 'fastrade');
          setTradingMode(sub);
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
  // authOk: null = masih diperiksa, false = tidak sah (sedang dialihkan ke /login),
  // true = sah. Dashboard TIDAK dirender sebelum ini true — tanpa gerbang ini
  // tampilan dashboard sempat terlihat sekejap sebelum dilempar ke /login
  // (kelihatan seperti kedip/keselip saat aplikasi baru dibuka).
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  useEffect(()=>{
    const init = async () => {
      const sessionValid = await isSessionValid();
      if(!sessionValid){ setAuthOk(false); router.replace('/login'); return; }
      setAuthOk(true);
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
        if(sRes.status==='fulfilled'&&!deviceEngineOnRef.current)setScheduleStatus(sRes.value);
        if(fRes.status==='fulfilled')setFtStatus(fRes.value);
        if(oRes.status==='fulfilled'&&!deviceEngineOnRef.current)setScheduleOrders(oRes.value);
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
    if(isSchedRunning||isSchedPaused){b.push('fastrade','blitz5s','ctc','aisignal','indicator','momentum');}
    if(isFtRunning&&ftStatus?.mode==='FTT'){b.push('schedule','ctc','aisignal','indicator','momentum');}
    if(isFtRunning&&ftStatus?.mode==='CTC'){b.push('schedule','fastrade','blitz5s','aisignal','indicator','momentum');}
    if(isAIRunning){b.push('schedule','fastrade','blitz5s','ctc','indicator','momentum');}
    if(isIndRunning){b.push('schedule','fastrade','blitz5s','ctc','aisignal','momentum');}
    if(isMomRunning){b.push('schedule','fastrade','blitz5s','ctc','aisignal','indicator');}
    return b.filter((v,i,a)=>a.indexOf(v)===i);
  })();

  const isActiveMode = (()=>{
    if(tradingMode==='schedule') return isSchedRunning||isSchedPaused;
    if(tradingMode==='fastrade'||tradingMode==='ctc'||tradingMode==='blitz5s') return isFtRunning;
    if(tradingMode==='aisignal') return isAIRunning;
    if(tradingMode==='indicator') return isIndRunning;
    if(tradingMode==='momentum') return isMomRunning;
    return false;
  })();

  // True jika ADA mode apapun yang sedang berjalan (bukan hanya mode yang dilihat)
  const isAnyModeRunning = isSchedRunning || isSchedPaused || isFtRunning || isAIRunning || isIndRunning || isMomRunning;

  // Deteksi ADA eksekusi entry/posisi TERBUKA (belum ada hasil) lintas SEMUA mode.
  // `key` berubah tiap entry baru agar timer banner reset. Hanya satu mode jalan
  // pada satu waktu, jadi OR lintas mode aman.
  const activeEntry = (():{active:boolean;key:string|null;trend:string|null}=>{
    const mon = scheduleOrders.find(o=>o.isExecuted && !o.result && !o.isSkipped);
    if((isSchedRunning||isSchedPaused) && mon) return { active:true, key:`sch-${mon.id}`, trend:mon.trend };
    if(isFtRunning){
      const tr = ftStatus?.activeTrend ?? ftStatus?.currentTrend ?? null;
      const oid = ftStatus?.activeOrderId; const ph = ftStatus?.phase||'';
      if(oid) return { active:true, key:`ft-${oid}`, trend:tr };
      if(ph==='EXECUTING'||ph==='WAITING_RESULT') return { active:true, key:`ft-${ph}-${ftStatus?.cycleNumber??0}-${ftStatus?.martingaleStep??0}`, trend:tr };
    }
    if(isAIRunning){
      const ao = aiPendingOrders.find(o=>o.isExecuted && !o.result);
      if(ao) return { active:true, key:`ai-${ao.id}`, trend:ao.trend };
      if((aiStatus?.monitoringStatus?.active_monitoring_count??0)>0) return { active:true, key:`ai-mon-${aiStatus?.monitoringStatus?.active_monitoring_count}`, trend:null };
    }
    for(const [run,st,pfx] of [[isIndRunning,indicatorStatus,'ind'],[isMomRunning,momentumStatus,'mom']] as const){
      if(!run||!st) continue;
      const tr=((st as any).activeTrend ?? (st as any).currentTrend ?? (st as any).lastTrend ?? null);
      const oid=(st as any).activeOrderId; const ph=String((st as any).phase||(st as any).lastStatus||'');
      if(oid) return { active:true, key:`${pfx}-${oid}`, trend:tr };
      if(/EXEC|WAIT.*RESULT|MONITOR/i.test(ph)) return { active:true, key:`${pfx}-${ph}`, trend:tr };
    }
    return { active:false, key:null, trend:null };
  })();
  // Durasi order (detik) mode aktif — untuk hitung mundur & bar progres.
  const entryDurationSec = (()=>{
    if(tradingMode==='blitz5s') return 5;
    if(tradingMode==='fastrade'||tradingMode==='ctc'){ const m:Record<string,number>={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600}; return m[String(ftTf)]??60; }
    return duration>0 ? duration : 60;
  })();
  // Waktu kedaluwarsa NYATA posisi (epoch ms) agar hitung mundur sinkron dgn order:
  //  • Signal: waktu eksekusi order (timeInMillis) + durasi.
  //  • FTT/CTC: order tutup di batas timeframe (candle) → batas berikutnya.
  //  • lainnya (blitz/AI/indикator/momentum): null → pakai deteksi klien.
  const entryExpiryMs = (():number|null=>{
    if(!activeEntry.active) return null;
    if(isSchedRunning||isSchedPaused){ const mon = scheduleOrders.find(o=>o.isExecuted && !o.result && !o.isSkipped); if(mon?.timeInMillis) return mon.timeInMillis + entryDurationSec*1000; }
    if((tradingMode==='fastrade'||tradingMode==='ctc') && isFtRunning){ const P=entryDurationSec*1000; return Math.ceil(Date.now()/P)*P; }
    return null;
  })();
  // Menang/kalah mode aktif → memicu kilat saat sebuah posisi CLOSED.
  const entryWL = (():{w:number;l:number}=>{
    if(tradingMode==='fastrade'||tradingMode==='ctc'||tradingMode==='blitz5s') return { w:ftStatus?.totalWins??0, l:ftStatus?.totalLosses??0 };
    if(tradingMode==='aisignal') return { w:aiStatus?.totalWins??0, l:aiStatus?.totalLosses??0 };
    if(tradingMode==='indicator') return { w:indicatorStatus?.totalWins??0, l:indicatorStatus?.totalLosses??0 };
    if(tradingMode==='momentum') return { w:momentumStatus?.totalWins??0, l:momentumStatus?.totalLosses??0 };
    return { w:scheduleOrders.filter(o=>/^win$/i.test(o.result||'')).length, l:scheduleOrders.filter(o=>/^los/i.test(o.result||'')).length };
  })();
  // Deteksi hasil (menang/kalah) SINKRON saat render → tak ada 1 frame countdown
  // order berikutnya yang menyelip sebelum kilat muncul. Kilat bertahan PENUH 3
  // detik & diprioritaskan atas hitung mundur (tak bertabrakan dgn order baru).
  const flashRef = useRef<{w:number;l:number;until:number;kind:'win'|'lose'|null}>({w:entryWL.w,l:entryWL.l,until:0,kind:null});
  if(entryWL.w > flashRef.current.w){ flashRef.current.kind='win'; flashRef.current.until=Date.now()+3000; }
  else if(entryWL.l > flashRef.current.l){ flashRef.current.kind='lose'; flashRef.current.until=Date.now()+3000; }
  flashRef.current.w=entryWL.w; flashRef.current.l=entryWL.l;
  const entryFlash: 'win'|'lose'|null = Date.now() < flashRef.current.until ? flashRef.current.kind : null;
  const [,setFlashTick] = useState(0);
  useEffect(()=>{
    if(!entryFlash) return;
    const id = setTimeout(()=>setFlashTick(t=>t+1), Math.max(0, flashRef.current.until - Date.now()) + 60);
    return ()=>clearTimeout(id);
  },[entryFlash]);
  const showEntryBanner = activeEntry.active || entryFlash!=null;

  const selectedAsset = assets.find(a=>a.ric===selectedRic)??null;
  const pendingOrders = scheduleOrders.filter(o=>!o.isExecuted&&!o.isSkipped);
  const canStart = tradingMode==='schedule' ? !!(selectedRic&&pendingOrders.length>0) : !!selectedRic;

  const sessionPnL = (()=>{
    if(tradingMode==='schedule') return (scheduleStatus as any)?.sessionPnL??0;
    if(tradingMode==='fastrade'||tradingMode==='ctc'||tradingMode==='blitz5s') return ftStatus?.sessionPnL??0;
    if(tradingMode==='aisignal') return aiStatus?.sessionPnL??0;
    if(tradingMode==='indicator') return indicatorStatus?.sessionPnL??0;
    if(tradingMode==='momentum') return momentumStatus?.sessionPnL??0;
    return 0;
  })();

  // ── Siarkan keadaan sesi ke cangkang aplikasi ────────────────────────────
  // Pil sesi di semua tab membaca dari sini. Beranda satu-satunya yang benar
  // tahu mode apa yang jalan dan berapa P/L-nya, jadi ia yang mengumumkan.
  useEffect(() => {
    sessionBeacon.publish({
      running: isAnyModeRunning,
      modeLabel: {schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'}[tradingMode] ?? 'Sesi',
      pnlCents: sessionPnL,
      currencyUnit: currencyConfig.currencyUnit,
    });
  }, [isAnyModeRunning, tradingMode, sessionPnL, currencyConfig.currencyUnit]);

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

  // v4: pengalihan ke mode REAL dijaga terpusat di sini; setting REAL yang
  // tersimpan dari sesi lama juga dipaksa kembali ke DEMO bila tak berhak.
  const handleDemoChange = (v: boolean) => {
    if (!v && !isApk && !realAccess) { setRealLockReason('platform'); setRealLockOpen(true); return; }
    if (!v && !realAccess) { setRealLockReason('account');  setRealLockOpen(true); return; }
    setIsDemo(v);
  };
  useEffect(() => {
    if (!settingsLoaded) return;
    // Paksa DEMO bila akun tak berhak REAL, atau bila dibuka di browser
    // (eksekusi order butuh APK).
    // REAL diizinkan bila akun punya akses (aktivasi berbayar) — di APK MAUPUN
    // web. Tanpa realAccess tetap dipaksa DEMO. Akun afiliasi ditolak backend guard.
    const mayReal = realCheckDone && realAccess;
    if (!mayReal && !_s.isDemo) setIsDemo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, realCheckDone, realAccess, isApk, _s.isDemo]);

  // Mode aisignal yang tersimpan dari sesi lama diturunkan ke schedule bila
  // akun terkunci — kecuali sesi AI memang sedang berjalan (jangan ganggu).
  useEffect(() => {
    if (!settingsLoaded || !aiCheckDone || aiUnlocked) return;
    const aiRunning = aiStatus?.botState === 'RUNNING' || aiStatus?.isActive === true;
    if (tradingMode === 'aisignal' && !aiRunning) setTradingMode('schedule');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, aiCheckDone, aiUnlocked]);

  // Fast Reversal disembunyikan untuk yang belum aktivasi / sudah kedaluwarsa.
  useEffect(()=>{
    if (!settingsLoaded || !frCheckDone || frUnlocked) return;
    if (tradingMode === 'fastreversal' && !isFtRunning) setTradingMode('schedule');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, frCheckDone, frUnlocked]);

  // 5st BERBAYAR: mode tersimpan 'blitz5s' utk user belum aktivasi → balik ke 'schedule'.
  useEffect(() => {
    if (!settingsLoaded || !blitz5sCheckDone || blitz5sUnlocked) return;
    if (tradingMode === 'blitz5s' && !isFtRunning) setTradingMode('schedule');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, blitz5sCheckDone, blitz5sUnlocked]);

  const handleModeChange = (m:TradingMode)=>{
    // Mode AI Signal terkunci per akun — aktivasi via support
    if (m === 'aisignal' && !aiUnlocked) { setAiLockOpen(true); return; }
    if (m === 'fastreversal' && !frUnlocked) { setFrLockOpen(true); return; }
    // 5st = kartu penemuan: belum aktivasi → portal; sudah aktivasi → jalankan
    // sebagai Fastrade FTT dengan toggle 5st menyala (eksekusi blitz 5 detik).
    if (m === 'blitz5s' && !blitz5sUnlocked) { setBlitz5sLockOpen(true); return; }
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

  // ── v4: jembatan engine perangkat (mode Schedule di APK) ─────────────────
  // Callback engine → state UI yang sama dengan yang dipakai jalur VPS,
  // sehingga seluruh tampilan (panel sesi, riwayat, PnL) bekerja tanpa diubah.
  const buildEngineCallbacks = useCallback(() => ({
    onOrdersUpdate: (orders: EngineOrder[]) => setScheduleOrders(orders as unknown as ScheduleOrder[]),
    onLog: (log: any) => {
      playForResultOnce(log?.id, log?.result); // efek suara profit/loss
      setScheduleLogs(prev => {
        const next = prev.filter(l => l.id !== log.id);
        return [log as ExecutionLog, ...next].slice(0, 500);
      });
    },
    onStatusChange: (status: string) => setScheduleStatus(prev => ({ ...(prev ?? {} as any), statusMessage: status })),
    onSessionPnL: (pnl: number) => setScheduleStatus(prev => ({ ...(prev ?? {} as any), sessionPnL: pnl })),
    onAllCompleted: () => {
      setDeviceEngineOn(false);
      setScheduleStatus(prev => ({ ...(prev ?? {} as any), botState: 'STOPPED', isRunning: false }));
    },
  }), []);

  /** Sinkronkan status engine perangkat ke UI setiap detik saat aktif */
  useEffect(() => {
    if (!deviceEngineOn) return;
    const id = setInterval(() => {
      const eng = deviceSession.getEngine();
      if (!eng) return;
      setScheduleStatus(prev => ({ ...(prev ?? {} as any), ...(eng.getStatus() as any) }));
    }, 1000);
    return () => clearInterval(id);
  }, [deviceEngineOn]);

  /** Saat aplikasi dibuka: tawarkan melanjutkan sesi yang tertunda.
   *  Sesi tertunda hanya ada pada mesin perangkat; sejak eksekusi dipindah ke
   *  server, tawaran ini tidak berlaku lagi. */
  useEffect(() => {
    if (!PAKAI_MESIN_PERANGKAT || !isApk) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await deviceSession.findResumable();
        if (cancelled || !saved) return;
        resumeDataRef.current = saved;
        setResumePrompt({
          orders: saved.orders.filter(o => !o.isExecuted && !o.isSkipped).length,
          pnl: saved.sessionPnL,
        });
      } catch { /* tidak ada sesi / offline — abaikan */ }
    })();
    return () => { cancelled = true; };
  }, [isApk]);

  const startDeviceSchedule = useCallback(async (
    orders: EngineOrder[], config: EngineConfig, resume?: { sessionPnL: number; startedAt?: number },
  ) => {
    await deviceSession.startSchedule({ orders, config, callbacks: buildEngineCallbacks(), resume });
    setDeviceEngineOn(true);
  }, [buildEngineCallbacks]);

  /**
   * Jumlah order yang SUDAH dieksekusi tapi hasilnya belum keluar.
   * Log penempatan order tidak punya `result`; ketika hasilnya tiba, engine
   * mengirim log kedua dengan `result` untuk orderId+step yang sama. Order yang
   * lebih tua dari MAX_OPEN_MS dianggap sudah tidak relevan (hasil telat/hilang)
   * supaya start tidak terkunci selamanya.
   */
  const countUnresolvedOrders = useCallback((): number => {
    const MAX_OPEN_MS = 180_000; // batas wajar sebuah order turbo terselesaikan
    const key = (l: any) => `${l?.orderId ?? l?.id}_${l?.martingaleStep ?? 0}`;
    const resolved = new Set<string>();
    for (const l of scheduleLogs as any[]) if (l?.result) resolved.add(key(l));
    let n = 0;
    const now = Date.now();
    for (const l of scheduleLogs as any[]) {
      if (l?.result) continue;
      if (resolved.has(key(l))) continue;
      if (now - (l?.executedAt ?? 0) > MAX_OPEN_MS) continue;
      n++;
    }
    return n;
  }, [scheduleLogs]);

  const handleStart = async()=>{
    if (actionLoading) return; // cegah klik ganda / start berulang
    // Siapkan audio selagi masih di dalam gestur pengguna — pemutaran pertama
    // akan diblokir kebijakan autoplay bila disiapkan di luar interaksi.
    primeSounds();
    if(!selectedRic)return;
    // Order dari sesi sebelumnya masih menggantung (sudah dieksekusi, hasilnya
    // belum keluar). Memulai mode baru saat itu bisa bentrok/menimpa hasil, jadi
    // start ditahan sampai order lama benar-benar selesai.
    const stillOpen = countUnresolvedOrders();
    if (stillOpen > 0) {
      showBlock(`Masih ada ${stillOpen} order berjalan dari sesi sebelumnya. Tunggu sampai hasilnya keluar sebelum memulai mode lagi.`);
      return;
    }
    // Pertahanan lapis dua: mode aisignal tersimpan dari sesi lama tetap tak bisa start
    if(tradingMode==='aisignal' && !aiUnlocked){ setAiLockOpen(true); return; }
    // v4: start di akun REAL butuh APK + real_access — selain itu demo-only
    if(!isDemo && !isApk && !realAccess) { setRealLockReason('platform'); setRealLockOpen(true); return; }
    if(!isDemo && !realAccess) { setRealLockReason('account');  setRealLockOpen(true); return; }
    if(isBelowMin&&tradingMode!=='indicator'){setError(`Amount di bawah minimum ${CURR_UNIT} ${FMT(MIN_AMOUNT)}.`);return;}
    // Fast Reversal TANPA satu pun K = Fastrade FTT biasa. Kalau dibiarkan,
    // sesinya berjalan sebagai FTT dan pengguna mengira pembalikan aktif
    // padahal tidak. Ditolak terang-terangan.
    if(tradingMode==='fastreversal' && !frUnlocked){ setFrLockOpen(true); return; }
    // 5st berbayar: toggle aktif tapi akses belum/terkunci → arahkan ke aktivasi
    if((tradingMode==='blitz5s' || (tradingMode==='fastrade' && blitz5s)) && !blitz5sUnlocked){ setBlitz5sLockOpen(true); return; }
    if(tradingMode==='fastreversal' && reversalSteps.filter(k=>k>=1&&k<=10).length===0){
      setError('Fast Reversal butuh minimal satu langkah K yang dibalik. Isi K di pengaturan sebelum memulai.');
      return;
    }
    // Cegah start jika ada mode LAIN yang sedang berjalan (hanya 1 mode boleh aktif)
    const otherRunning = (
      (tradingMode!=='schedule'&&(isSchedRunning||isSchedPaused))||
      ((tradingMode!=='fastrade'&&tradingMode!=='ctc'&&tradingMode!=='fastreversal'&&tradingMode!=='blitz5s')&&isFtRunning)||
      (tradingMode!=='aisignal'&&isAIRunning)||
      (tradingMode!=='indicator'&&isIndRunning)||
      (tradingMode!=='momentum'&&isMomRunning)
    );
    if(otherRunning){showBlock(T('dashboard.modePicker.stopActiveFirst'));return;}
    setActionLoading(true);setError(null);
    try{
      if(tradingMode==='schedule' && PAKAI_MESIN_PERANGKAT && isApk && deviceSession.available()){
        // v4: eksekusi di perangkat user (tanpa VPS)
        const engineConfig: EngineConfig = {
          asset:{ric:selectedRic,name:selectedAsset?.name??selectedRic,profitRate:selectedAsset?.profitRate},
          martingale:{isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED',isAlwaysSignal:martingale.alwaysSignal??false},
          isDemoAccount:isDemo,currency:CURR_UNIT,currencyIso:CURR_UNIT,duration,
          stopLoss:stopLoss?stopLoss*100:undefined,stopProfit:stopProfit?stopProfit*100:undefined,
        };
        const engineOrders = pendingOrders.map(o => ({
          id:o.id, time:o.time, trend:o.trend, timeInMillis:o.timeInMillis,
          isExecuted:false, isSkipped:false,
          martingaleState:{isActive:false,currentStep:0,maxSteps:martingale.maxStep,isCompleted:false,totalLoss:0,totalRecovered:0},
        })) as EngineOrder[];
        if(engineOrders.length===0){ setError(T('dashboard.errors.startFailed')); return; }
        await startDeviceSchedule(engineOrders, engineConfig);
      } else if(tradingMode==='schedule'){
        await api.updateConfig({
          asset:{ric:selectedRic,name:selectedAsset?.name??selectedRic,profitRate:selectedAsset?.profitRate,iconUrl:selectedAsset?.iconUrl},
          martingale:{isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED',isAlwaysSignal:martingale.alwaysSignal??false},
          isDemoAccount:isDemo,currency:CURR_UNIT,currencyIso:CURR_UNIT,duration,
          stopLoss:stopLoss?stopLoss*100:undefined,stopProfit:stopProfit?stopProfit*100:undefined,
        });
        await api.scheduleStart();
      } else if(PAKAI_MESIN_PERANGKAT && isApk && deviceSession.available()){
        // v4: mode lain juga dieksekusi di perangkat (tanpa VPS)
        const baseCfg = {
          asset:{ric:selectedRic,name:selectedAsset?.name??selectedRic,profitRate:selectedAsset?.profitRate},
          martingale:{isEnabled:martingale.enabled,maxSteps:martingale.maxStep,baseAmount:amount*100,multiplierValue:martingale.multiplier,multiplierType:'FIXED' as const,isAlwaysSignal:martingale.alwaysSignal??false},
          isDemoAccount:isDemo,currency:CURR_UNIT,currencyIso:CURR_UNIT,
          stopLoss:stopLoss?stopLoss*100:undefined,stopProfit:stopProfit?stopProfit*100:undefined,
        };
        const cfg =
          tradingMode==='indicator'
            ? { ...baseCfg, settings:{ type:indicatorType, period:indicatorPeriod, sensitivity:indicatorSensitivity, rsiOverbought, rsiOversold } }
          : tradingMode==='momentum'
            ? { ...baseCfg, patterns:{ candleSabit:momentumPatterns.candleSabit, dojiTerjepit:momentumPatterns.dojiTerjepit, dojiPembatalan:momentumPatterns.dojiPembatalan, bbSarBreak:momentumPatterns.bbSarBreak } }
          : tradingMode==='fastreversal'
            // Fast Reversal = FTT + daftar K yang dibalik. Disaring 1..10 di sini
            // juga, bukan hanya di UI: nilai tersimpan bisa berasal dari versi lama.
            ? { ...baseCfg, reversalSteps: reversalSteps.filter(k=>k>=1&&k<=10) }
          : baseCfg;
        await deviceSession.startMode({
          mode: (tradingMode==='blitz5s'?'fastrade':tradingMode) as 'fastrade'|'ctc'|'fastreversal'|'aisignal'|'indicator'|'momentum',
          config: cfg,
          callbacks: {
            onLog: (log:any)=>{
              playForResultOnce(log?.id, log?.result); // efek suara profit/loss
              setScheduleLogs(prev=>[log, ...prev.filter(l=>l.id!==log.id)].slice(0,500));
            },
            onStatusChange: (st:string)=>setScheduleStatus(prev=>({ ...(prev ?? {} as any), statusMessage: st })),
            onSessionPnL: (pnl:number)=>setScheduleStatus(prev=>({ ...(prev ?? {} as any), sessionPnL: pnl })),
            onStopped: ()=>{ setDeviceEngineOn(false); },
          },
        });
        setDeviceEngineOn(true);
      } else if(tradingMode==='fastrade'||tradingMode==='ctc'||tradingMode==='fastreversal'||tradingMode==='blitz5s'){
        // Fast Reversal dieksekusi server-side sebagai FTT + reversalSteps —
        // backend memakai mode 'FTT'; pembedanya HANYA daftar langkah itu.
        await api.fastradeStart({
          mode:tradingMode==='ctc'?'CTC':'FTT',
          reversalSteps: tradingMode==='fastreversal' ? reversalSteps.filter(k=>k>=1&&k<=10) : undefined,
          blitz: (((tradingMode==='fastrade' && blitz5s) || tradingMode==='blitz5s') && blitz5sUnlocked) ? true : undefined,
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
    if (actionLoading) return; // cegah klik ganda saat proses berjalan
    setStopConfirmOpen(false);
    setActionLoading(true);setError(null);
    try{
      // v4: sesi engine perangkat dihentikan lokal (tidak ada sesi di server)
      if(deviceEngineOn){
        deviceSession.stop();
        deviceSession.discardSaved();
        setDeviceEngineOn(false);
        setScheduleStatus(prev => ({ ...(prev ?? {} as any), botState:'STOPPED', isRunning:false }));
        setActionLoading(false);
        return;
      }
      // Stop berdasarkan mode yang benar-benar sedang berjalan di server
      if(tradingMode==='schedule'||(isSchedRunning||isSchedPaused)) {
        if(isSchedRunning||isSchedPaused) await api.scheduleStop();
        else if(tradingMode==='schedule') await api.scheduleStop();
      }
      if(tradingMode==='fastrade'||tradingMode==='ctc'||tradingMode==='blitz5s') await api.fastradeStop();
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
    @keyframes pos-sweep   { 0%{transform:translateX(-130%)} 100%{transform:translateX(330%)} }
    @keyframes pos-fill    { 0%{width:0%;opacity:1} 88%{opacity:1} 100%{width:100%;opacity:0} }
    @keyframes pos-fill-run{ from{width:0%} to{width:100%} }
    @keyframes res-inout  { 0%{opacity:0;transform:scale(.92)} 8%{opacity:1;transform:scale(1)} 90%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(.98)} }
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
        ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.4), 0 10px 30px -16px rgba(0,0,0,0.6)'
        : '0 1px 1px rgba(15,23,42,0.04), 0 2px 4px rgba(15,23,42,0.03), 0 12px 28px -16px rgba(15,23,42,0.12)'};
      transition: background 0.3s, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    @media (max-width: 767px) {
      .ds-card, .ds-card:hover { transform: none !important; }
    }
    /* Kartu KPI / stat tile — dipakai desktop, tablet & mobile */
    .dsh-tile { padding: 16px 18px; min-width: 0; }
    .dsh-tile-sm { padding: 13px 15px; min-width: 0; }
    .dsh-tile-tap { cursor: pointer; transition: border-color 0.18s ease, box-shadow 0.2s ease, transform 0.14s cubic-bezier(0.4,0,0.2,1); }
    /* Hover elevasi halus (desktop) — afordans "bisa ditekan" yang terasa mahal */
    @media (min-width: 768px) {
      .dsh-tile-tap:hover {
        border-color: ${isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(2,6,23,0.18)'};
        box-shadow: ${isDarkMode
          ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px rgba(0,0,0,0.42), 0 18px 44px -20px rgba(0,0,0,0.62)'
          : '0 1px 2px rgba(15,23,42,0.05), 0 16px 36px -20px rgba(15,23,42,0.18)'};
        transform: translateY(-1px);
      }
    }
    /* Umpan-balik tekan + fokus keyboard yang jelas & aksesibel */
    .dsh-tile-tap:active { transform: scale(0.994); }
    .dsh-tile-tap:focus-visible, .ds-card button:focus-visible, .ds-card [role="button"]:focus-visible {
      outline: 2px solid ${C.cyan}; outline-offset: 2px;
    }
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
      isDemo={isDemo} onDemoChange={handleDemoChange}
      duration={duration} onDurationChange={setDuration}
      amount={amount} onAmountChange={setAmount}
      martingale={martingale} onMartingaleChange={setMartingale}
      ftTf={ftTf} onFtTfChange={setFtTf}
      blitz5s={blitz5s} onBlitz5sChange={setBlitz5s}
      blitz5sLocked={!blitz5sUnlocked} blitz5sExpiry={blitz5sExpiry} onActivate5st={()=>router.push('/aktivasi-5st')}
      reversalSteps={reversalSteps} onReversalStepsChange={setReversalSteps} frExpiry={frExpiry}
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
  // Jangan render apa pun sebelum sesi terverifikasi (cegah dashboard "keselip"
  // sekejap saat aplikasi/web pertama dibuka oleh pengguna yang belum masuk).
  if (authOk !== true) return null;

  // Mode pemeliharaan: pengguna biasa dihentikan di sini. Super admin tetap
  // boleh masuk supaya bisa mematikan mode ini dari halaman profil.
  if (maintChecked && maint.enabled && !isSuperAdminUser) {
    return <MaintenanceScreen info={maint} C={C} appName="STC AutoTrade" onRetry={() => { setMaintChecked(false); void checkMaintenance(); }} />;
  }

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
          {/* Look baru: dialog radius 20, ikon lingkaran lembut, tombol
              berdampingan — Batal (ghost) + Stop (solid coral) */}
          <div style={{
            position:'relative',width:'100%',maxWidth:320,
            background: isDarkMode ? '#17181C' : '#ffffff',
            borderRadius:20,border:`1px solid ${C.bdr}`,
            overflow:'hidden',
            animation:'slide-up 0.24s cubic-bezier(0.32,0.72,0,1)',
            boxShadow:isDarkMode?'0 24px 64px -12px rgba(0,0,0,0.65)':'0 24px 64px -20px rgba(15,23,42,0.30)',
            padding:'26px 20px 20px',
          }}>
            <div style={{textAlign:'center',marginBottom:18}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:`${C.coral}14`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <StopCircle style={{width:22,height:22,color:C.coral}}/>
              </div>
              <p style={{fontSize:16,fontWeight:650,letterSpacing:'-0.01em',color:C.text,marginBottom:6}}>{T('dashboard.stopConfirm.title')}</p>
              <p style={{fontSize:12.5,color:C.sub,lineHeight:1.55}}>
                {T('dashboard.stopConfirm.message')}
              </p>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button
                onClick={()=>setStopConfirmOpen(false)}
                style={{
                  flex:1,height:42,borderRadius:11,fontSize:13,fontWeight:600,
                  color:C.text,background:C.faint,border:'none',
                  cursor:'pointer',
                }}
              >
                {T('common.cancel')}
              </button>
              <button
                onClick={handleStopConfirmed}
                style={{
                  flex:1,height:42,borderRadius:11,fontSize:13,fontWeight:600,
                  color:'#fff',background:C.coral,border:'none',
                  boxShadow:`0 2px 10px ${C.coral}35`,
                  cursor:'pointer',
                }}
              >
                {T('dashboard.stopConfirm.confirm')}
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
        {/* v4: sesi perangkat yang tertunda (aplikasi sempat ditutup) */}
        {resumePrompt && (
          <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',animation:'fade-in 0.15s ease'}}>
            <div onClick={()=>{setResumePrompt(null);}} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
            <div style={{position:'relative',width:'100%',maxWidth:380,background:C.bg,borderRadius:20,border:`1px solid ${C.bdr}`,padding:'24px 22px',animation:'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{width:44,height:44,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',background:`${C.cyan}14`,border:`1px solid ${C.cyan}30`,flexShrink:0}}>
                  <RefreshCw style={{width:20,height:20,color:C.cyan}}/>
                </div>
                <p style={{fontSize:16,fontWeight:700,color:C.text}}>{ui(T_LANG, 'resumeTitle')}</p>
              </div>
              <p style={{fontSize:13,color:C.sub,lineHeight:1.55,marginBottom:14}}>
                <strong style={{color:C.text}}>{resumePrompt.orders}</strong> {ui(T_LANG, 'resumeOrdersLeft')},
                {ui(T_LANG, 'resumeRunningPnl')} <strong style={{color:resumePrompt.pnl>=0?C.sky:C.coral}}>{resumePrompt.pnl>=0?'+':''}{FMT(resumePrompt.pnl/100)}</strong>.
                {ui(T_LANG, 'resumeNote')}
              </p>
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={()=>{ deviceSession.discardSaved(); resumeDataRef.current=null; setResumePrompt(null); }}
                  style={{flex:1,padding:'11px 0',borderRadius:12,background:C.card2,border:`1px solid ${C.bdr}`,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub}}>
                  {ui(T_LANG, 'resumeStartNew')}
                </button>
                <button
                  onClick={async()=>{
                    const saved=resumeDataRef.current; setResumePrompt(null);
                    if(!saved) return;
                    try{
                      await startDeviceSchedule(
                        saved.orders.filter((o:EngineOrder)=>!o.isSkipped),
                        saved.config,
                        { sessionPnL: saved.sessionPnL, startedAt: saved.startedAt },
                      );
                    }catch(e:any){ setError(e?.message ?? ui(T_LANG, 'resumeFailed')); }
                  }}
                  style={{flex:1.2,padding:'11px 0',borderRadius:12,background:C.cyan,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:'#06251b'}}>
                  {ui(T_LANG, 'resumeContinue')}
                </button>
              </div>
            </div>
          </div>
        )}
        <ActivationNoticeModal open={pemberitahuan !== null} onClose={()=>setPemberitahuan(null)} at={pemberitahuan?.at ?? 0} expiresAt={pemberitahuan?.sampai ?? null} featureLabel={pemberitahuan?.label ?? ''}/>
        <AiLockedModal open={aiLockOpen} onClose={()=>setAiLockOpen(false)} lang={language} onActivate={()=>{ setAiLockOpen(false); router.push('/aktivasi-aisignal'); }}/>
        <Blitz5sLockedModal open={blitz5sLockOpen} onClose={()=>setBlitz5sLockOpen(false)} lang={language} onActivate={()=>{ setBlitz5sLockOpen(false); router.push('/aktivasi-5st'); }}/>
        <FrLockedModal open={frLockOpen} onClose={()=>setFrLockOpen(false)} lang={language} onActivate={()=>{ setFrLockOpen(false); window.location.href = `mailto:${FAST_REVERSAL_CONTACT_EMAIL}?subject=${encodeURIComponent('Aktivasi Fast Reversal')}&body=${encodeURIComponent('Halo admin, saya ingin mengaktifkan mode Fast Reversal.')}`; }}/>
        <RealLockedModal
          open={realLockOpen}
          reason={realLockReason}
          onClose={()=>setRealLockOpen(false)}
          onRegister={()=>{ setRealLockOpen(false); window.open('https://stcautotrade.id/download', '_blank', 'noopener'); }}
          onActivate={()=>{ setRealLockOpen(false); router.push('/aktivasi-real'); }}
          lang={language}
        />
        <CapitalAdviceModal open={adviceOpen} onClose={()=>setAdviceOpen(false)} lang={language} minAmount={currencyConfig.minAmount} currUnit={currencyConfig.currencyUnit}/>
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
                  {({schedule:'Signal Mode',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'} as Record<string,string>)[tradingMode]}
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
                      {{schedule:<Calendar style={{width:15,height:15}}/>,fastrade:<Zap style={{width:15,height:15}}/>,blitz5s:<Zap style={{width:15,height:15}}/>,ctc:<Copy style={{width:15,height:15}}/>,aisignal:<Radio style={{width:15,height:15}}/>,indicator:<BarChart style={{width:15,height:15}}/>,momentum:<Waves style={{width:15,height:15}}/>}[tradingMode]}
                    </span>
                    {isActiveMode&&<span style={{position:'absolute',top:-3,right:-3,width:7,height:7,borderRadius:'50%',background:modeAccent(tradingMode),animation:'ping 1.6s ease-in-out infinite'}}/>}
                  </div>
                </div>
                <p style={{fontSize:22,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.02em',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {{schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz 5 Detik',ctc:'CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'}[tradingMode]}
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

            {showEntryBanner && (
              <div style={{marginBottom:g}}>
                <ActiveEntryBanner
                  active={activeEntry.active}
                  orderKey={activeEntry.key}
                  flash={entryFlash}
                  durationSec={entryDurationSec}
                  expiryMs={entryExpiryMs}
                  trend={activeEntry.trend}
                  accent={modeAccent(tradingMode)}
                  label={language==='id' ? 'Entry aktif berjalan' : 'Active entry running'}
                  sub={(language==='id' ? 'Posisi terbuka · ' : 'Position open · ') + (({schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'} as Record<string,string>)[tradingMode] ?? 'Sesi')}
                />
              </div>
            )}

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
                            value:({schedule:'Signal Mode',fastrade:'Fastrade FTT Mode',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'} as Record<string,string>)[tradingMode],
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
                <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} disabled={isAnyModeRunning} />
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
                      {{schedule:<Calendar style={{width:14,height:14}}/>,fastrade:<Zap style={{width:14,height:14}}/>,blitz5s:<Zap style={{width:14,height:14}}/>,ctc:<Copy style={{width:14,height:14}}/>,aisignal:<Radio style={{width:14,height:14}}/>,indicator:<BarChart style={{width:14,height:14}}/>,momentum:<Waves style={{width:14,height:14}}/>}[tradingMode]}
                    </span>
                    {isActiveMode&&<span style={{position:'absolute',top:-3,right:-3,width:6,height:6,borderRadius:'50%',background:modeAccent(tradingMode),animation:'ping 1.6s ease-in-out infinite'}}/>}
                  </div>
                </div>
                <p style={{fontSize:16,fontWeight:650,color:C.text,lineHeight:1.15,letterSpacing:'-0.01em',marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {{schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'}[tradingMode]}
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

            {showEntryBanner && (
              <div style={{marginBottom:g}}>
                <ActiveEntryBanner
                  active={activeEntry.active}
                  orderKey={activeEntry.key}
                  flash={entryFlash}
                  durationSec={entryDurationSec}
                  expiryMs={entryExpiryMs}
                  trend={activeEntry.trend}
                  accent={modeAccent(tradingMode)}
                  label={language==='id' ? 'Entry aktif berjalan' : 'Active entry running'}
                  sub={(language==='id' ? 'Posisi terbuka · ' : 'Position open · ') + (({schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'} as Record<string,string>)[tradingMode] ?? 'Sesi')}
                />
              </div>
            )}

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
                        :{label:T('dashboard.mode'),icon:<Radio style={{width:13,height:13}}/>,value:({schedule:'Signal Mode',fastrade:'Fastrade FTT Mode',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'} as Record<string,string>)[tradingMode],col:ac},
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
                <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} disabled={isAnyModeRunning} />
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
            {showEntryBanner && (
              <ActiveEntryBanner
                active={activeEntry.active}
                orderKey={activeEntry.key}
                flash={entryFlash}
                durationSec={entryDurationSec}
                expiryMs={entryExpiryMs}
                trend={activeEntry.trend}
                accent={modeAccent(tradingMode)}
                label={language==='id' ? 'Entry aktif berjalan' : 'Active entry running'}
                sub={(language==='id' ? 'Posisi terbuka · ' : 'Position open · ') + (({schedule:'Signal',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz',ctc:'Fastrade CTC',aisignal:'AI Signal',indicator:'Indicator',momentum:'Momentum'} as Record<string,string>)[tradingMode] ?? 'Sesi')}
              />
            )}
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
                      <span style={{fontSize:11,fontWeight:600,color:modeAccent(tradingMode),whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {{schedule:'Signal Mode',fastrade:'Fastrade FTT',blitz5s:'5st · Blitz 5 Detik',ctc:'Fastrade CTC',aisignal:'AI Signal Mode',indicator:'Analysis Strategy Mode',momentum:'Momentum Mode'}[tradingMode]}
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
                            <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                              <span style={{fontWeight:600,color:C.sub,fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{T('dashboard.modePicker.title')}</span>                            </div>
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
            <DarkModeToggleStrip isDarkMode={isDarkMode} onToggle={toggleDarkMode} C={C} disabled={isAnyModeRunning} />
          </div>
        )}
      </div>
    </div>
  );
}