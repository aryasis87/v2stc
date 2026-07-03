'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ExecutionLog, type FastradeLog, type IndicatorLog, type MomentumLog } from '@/lib/api';
import { storage } from '@/lib/storage';
import { LanguageProvider, useLanguage, formatDate, formatTime, Language } from '@/lib';
import { useDarkMode } from '@/lib/DarkModeContext';
import {
  TrendingUp, TrendingDown, Filter, History, RotateCcw,
  ArrowUpRight, ArrowDownRight, BarChart3, ChevronRight,
  CheckCircle, XCircle, MinusCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type LogType      = 'all' | 'schedule' | 'fastrade' | 'ctc' | 'indicator' | 'momentum';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';
type DateFilter   = 'all' | 'today' | 'week' | 'month';

interface CombinedLog {
  id: string;
  type: 'schedule' | 'fastrade' | 'ctc' | 'indicator' | 'momentum';
  time: string;
  trend: 'call' | 'put';
  amount: number;
  result?: 'WIN' | 'LOSE' | 'DRAW' | 'LOSS';
  profit?: number;
  martingaleStep?: number;
  executedAt: number;
  note?: string;
}

// ─────────────────────────────────────────────
// THEME PALETTE — selaras dashboard (dark) & iOS (light)
// History dulunya hardcode light-only; kini ikut dark mode aplikasi.
// ─────────────────────────────────────────────
function getP(dark: boolean) {
  return dark
    ? {
        bg:     '#0B0C0E',
        header: 'rgba(11,12,14,0.88)',
        card:   '#141518',
        card2:  '#1B1D21',
        hair:   'rgba(255,255,255,0.06)',
        bdr:    'rgba(255,255,255,0.10)',
        text:   '#F4F5F7',
        sub:    '#C6CBD3',
        muted:  '#A1A8B3',
        faint:  'rgba(161,168,179,0.55)',
        press:  'rgba(255,255,255,0.06)',
        skel:   'rgba(255,255,255,0.07)',
        shadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px -16px rgba(0,0,0,0.6)',
        green:  '#30D158', red: '#FF453A', amber: '#FF9F0A',
        blue:   '#0A84FF', purple: '#BF5AF2', pink: '#FF375F', grey: '#98989F',
      }
    : {
        bg:     '#F2F2F7',
        header: 'rgba(242,242,247,0.92)',
        card:   '#FFFFFF',
        card2:  '#F2F2F7',
        hair:   'rgba(60,60,67,0.07)',
        bdr:    'rgba(60,60,67,0.12)',
        text:   '#1C1C1E',
        sub:    '#3C3C43',
        muted:  '#6E6E73',
        faint:  '#AEAEB2',
        press:  'rgba(0,0,0,0.05)',
        skel:   'rgba(60,60,67,0.08)',
        shadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)',
        green:  '#34C759', red: '#FF3B30', amber: '#FF9500',
        blue:   '#007AFF', purple: '#AF52DE', pink: '#FF2D55', grey: '#8E8E93',
      };
}
type Palette = ReturnType<typeof getP>;

// ─────────────────────────────────────────────
// MAIN CONTENT
// ─────────────────────────────────────────────
function HistoryPageContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isDarkMode } = useDarkMode();
  const P = useMemo(() => getP(isDarkMode), [isDarkMode]);
  const [isLoading, setIsLoading]       = useState(true);
  const [logs, setLogs]                 = useState<CombinedLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CombinedLog[]>([]);
  const [typeFilter, setTypeFilter]     = useState<LogType>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [dateFilter, setDateFilter]     = useState<DateFilter>('all');
  const [showFilters, setShowFilters]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [currencyUnit, setCurrencyUnit] = useState('Rp');
  const [stats, setStats] = useState({
    totalTrades: 0, wins: 0, losses: 0, draws: 0, totalPnL: 0, winRate: 0,
  });

  // Load currency from session storage
  useEffect(() => {
    storage.get('stc_currency_iso').then(unit => { if (unit) setCurrencyUnit(unit); }).catch(() => {});
  }, []);

  // Get localized type labels
  const getTypeLabel = (type: LogType): string => {
    const labels: Record<LogType, string> = {
      all: t('history.all'),
      schedule: t('history.signal'),
      fastrade: t('history.fastTrade'),
      ctc: t('history.ctc'),
      indicator: t('history.indicator'),
      momentum: t('history.momentum'),
    };
    return labels[type];
  };

  const getResultLabel = (result: ResultFilter): string => {
    const labels: Record<ResultFilter, string> = {
      all: t('history.all'),
      win:  t('history.profit'),
      loss: t('history.loss'),
      draw: t('history.draw'),
    };
    return labels[result];
  };

  // Get localized period labels
  const getPeriodLabel = (period: DateFilter): string => {
    const labels: Record<DateFilter, string> = {
      all: t('history.all'),
      today: t('history.today'),
      week: t('history.week'),
      month: t('history.month'),
    };
    return labels[period];
  };

  useEffect(() => {
    const init = async () => {
      const token = await storage.get('stc_token');
      if (!token) { router.push('/login'); return; }
      loadHistory();
    };
    init();
  }, []); // eslint-disable-line

  // Close filter panel on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFilters(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ✅ FIX: Lock body scroll when filter panel is open (mobile UX)
  useEffect(() => {
    if (showFilters) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [showFilters]);

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true); else setRefreshing(true);
    try {
      const [scheduleLogs, fastradeLogs, indicatorLogs, momentumLogs] = await Promise.all([
        api.scheduleLogs(200).catch(() => [] as ExecutionLog[]),
        api.fastradeLogs(200).catch(() => [] as FastradeLog[]),
        api.indicatorLogs(200).catch(() => [] as IndicatorLog[]),
        api.momentumLogs(200).catch(() => [] as MomentumLog[]),
      ]);

      const combined: CombinedLog[] = [
        ...scheduleLogs.map((l): CombinedLog => ({
          id: l.id, type: 'schedule',
          time: l.time || '--:--',
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt || Date.now(),
          note: l.note,
        })),
        ...fastradeLogs.map((l): CombinedLog => ({
          id: l.id, type: l.mode === 'CTC' ? 'ctc' : 'fastrade',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note,
        })),
        ...indicatorLogs.map((l): CombinedLog => ({
          id: l.id, type: 'indicator',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note ?? l.indicatorType,
        })),
        ...momentumLogs.map((l): CombinedLog => ({
          id: l.id, type: 'momentum',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note ?? l.momentumType,
        })),
      ];

      const map = new Map<string, CombinedLog>();
      for (const l of combined) {
        const ex = map.get(l.id);
        if (!ex || (!ex.result && l.result)) map.set(l.id, l);
      }
      const deduped = Array.from(map.values()).sort((a, b) => b.executedAt - a.executedAt);

      setLogs(deduped);

      const done   = deduped.filter(l => l.result);
      const wins   = done.filter(l => l.result === 'WIN').length;
      const losses = done.filter(l => l.result === 'LOSE' || l.result === 'LOSS').length;
      const draws  = done.filter(l => l.result === 'DRAW').length;
      const pnl    = deduped.reduce((s, l) => s + (l.profit || 0), 0);
      setStats({
        totalTrades: done.length, wins, losses, draws, totalPnL: pnl,
        winRate: done.length > 0 ? Math.round((wins / done.length) * 100) : 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false); setRefreshing(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    let f = [...logs];
    if (typeFilter !== 'all') f = f.filter(l => l.type === typeFilter);
    if (resultFilter === 'win')  f = f.filter(l => l.result === 'WIN');
    if (resultFilter === 'loss') f = f.filter(l => l.result === 'LOSE' || l.result === 'LOSS');
    if (resultFilter === 'draw') f = f.filter(l => l.result === 'DRAW');
    const ms = 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (dateFilter === 'today') f = f.filter(l => now - l.executedAt < ms);
    if (dateFilter === 'week')  f = f.filter(l => now - l.executedAt < 7 * ms);
    if (dateFilter === 'month') f = f.filter(l => now - l.executedAt < 30 * ms);
    setFilteredLogs(f);
  }, [logs, typeFilter, resultFilter, dateFilter]);

  const hasActiveFilter = typeFilter !== 'all' || resultFilter !== 'all' || dateFilter !== 'all';
  const pnlPos = stats.totalPnL >= 0;

  // Format helpers
  const fmt = (n?: number) => {
    if (n == null) return '0';
    return Math.abs(n / 100).toLocaleString(language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'id-ID', { maximumFractionDigits: 0 });
  };

  const fmtDate = (ts: number) =>
    formatDate(ts, language, { day: '2-digit', month: 'short' });

  const fmtTime = (ts: number) =>
    formatTime(ts, language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // ─────────────────────────────────────────────
  // SUB-COMPONENTS
  // ─────────────────────────────────────────────
  const Skel: React.FC<{ w?: number | string; h?: number; r?: number }> = ({ w = '100%', h = 14, r = 6 }) => (
    <div style={{ width: w, height: h, borderRadius: r, background: P.skel, animation: 'skel-pulse 1.6s ease-in-out infinite' }} />
  );

  const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
    schedule:  { label: t('history.signal'),    color: P.green,  bg: `${P.green}1A`  },
    fastrade:  { label: t('history.fastTrade'), color: P.blue,   bg: `${P.blue}1A`   },
    ctc:       { label: t('history.ctc'),       color: P.purple, bg: `${P.purple}1A` },
    indicator: { label: t('history.indicator'), color: P.amber,  bg: `${P.amber}1A`  },
    momentum:  { label: t('history.momentum'),  color: P.pink,   bg: `${P.pink}1A`   },
  };

  const RESULT_META = {
    WIN:  { label: t('history.profit'), color: P.green, bg: `${P.green}1A`, icon: <CheckCircle  size={11} /> },
    LOSE: { label: t('history.loss'),   color: P.red,   bg: `${P.red}1A`,   icon: <XCircle      size={11} /> },
    LOSS: { label: t('history.loss'),   color: P.red,   bg: `${P.red}1A`,   icon: <XCircle      size={11} /> },
    DRAW: { label: t('history.draw'),   color: P.amber, bg: `${P.amber}1A`, icon: <MinusCircle  size={11} /> },
  };

  const Chip: React.FC<{ label: string; active: boolean; color?: string; onClick: () => void }> = ({
    label, active, color = P.blue, onClick,
  }) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: active ? 600 : 400,
      background: active ? `${color}17` : 'transparent',
      border: `1px solid ${active ? color : P.bdr}`,
      color: active ? color : P.muted,
      cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent',
      flexShrink: 0,
    }}>
      {label}
    </button>
  );

  const StatTile: React.FC<{
    label: string; value: string | number; sub?: string;
    color: string; icon: React.ReactNode;
  }> = ({ label, value, sub, color, icon }) => (
    <div style={{
      background: P.card, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${P.hair}`,
      boxShadow: P.shadow,
      display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}17`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: P.text, letterSpacing: -0.5, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: P.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </div>
  );

  const LogRow: React.FC<{ log: CombinedLog; last: boolean }> = ({ log, last }) => {
    const type      = TYPE_META[log.type] || TYPE_META.fastrade;
    const res       = log.result ? (RESULT_META[log.result as keyof typeof RESULT_META] || null) : null;
    const isCall    = log.trend === 'call';
    const profitPos = (log.profit ?? 0) >= 0;
    const pending   = !log.result;

    const accentGrad = res
      ? res.color === P.green
        ? `linear-gradient(180deg,${P.green},${P.green}CC)`
        : res.color === P.red
          ? `linear-gradient(180deg,${P.red},${P.red}CC)`
          : `linear-gradient(180deg,${P.amber},${P.amber}CC)`
      : P.bdr;

    return (
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: last ? 'none' : `1px solid ${P.hair}`, position: 'relative' }}>
        {/* Left accent stripe */}
        <div style={{ width: 3, flexShrink: 0, borderRadius: '0 2px 2px 0', background: accentGrad, margin: '8px 0' }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px 11px 12px', minWidth: 0 }}>

          {/* Icon bubble */}
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: isCall ? `${P.green}17` : `${P.red}17`,
            border: `1px solid ${isCall ? `${P.green}2E` : `${P.red}2E`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isCall ? P.green : P.red,
          }}>
            {isCall ? <TrendingUp size={17} strokeWidth={2.2} /> : <TrendingDown size={17} strokeWidth={2.2} />}
          </div>

          {/* Center info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Row 1: badges + direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: type.color, background: type.bg, padding: '2px 7px', borderRadius: 5, border: `1px solid ${type.color}22`, flexShrink: 0 }}>
                {type.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: isCall ? P.green : P.red, flexShrink: 0 }}>
                {isCall ? `↑ ${t('history.buy')}` : `↓ ${t('history.sell')}`}
              </span>
              {log.martingaleStep !== undefined && log.martingaleStep > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: P.amber, background: `${P.amber}1A`, border: `1px solid ${P.amber}33`, padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                  MG ×{log.martingaleStep}
                </span>
              )}
              {pending && (
                <span style={{ fontSize: 9.5, fontWeight: 600, color: P.grey, background: `${P.grey}1A`, border: `1px solid ${P.grey}33`, padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                  {t('history.pending')}
                </span>
              )}
            </div>
            {/* Row 2: time + date + note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: P.sub, fontFamily: "'SF Mono','Fira Mono',monospace", letterSpacing: '0.01em', background: P.press, borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>
                {log.time}
              </span>
              <span style={{ fontSize: 10, color: P.faint, flexShrink: 0 }}>•</span>
              <span style={{ fontSize: 11, color: P.muted, flexShrink: 0 }}>{fmtDate(log.executedAt)}</span>
              {log.note && (
                <>
                  <span style={{ fontSize: 10, color: P.faint, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 10.5, color: P.muted, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(90px, 25vw)' }}>
                    {log.note}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: amount + result + profit */}
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: P.text, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(110px, 28vw)' }}>
              {currencyUnit} {fmt(log.amount)}
            </span>
            {res ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: res.color, background: res.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${res.color}30`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {res.icon} {res.label}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: P.faint, background: P.press, padding: '3px 8px', borderRadius: 99, border: `1px solid ${P.hair}`, flexShrink: 0, whiteSpace: 'nowrap' }}>—</span>
            )}
            {log.profit != null && log.result && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: profitPos ? P.green : P.red, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(100px, 28vw)' }}>
                {profitPos ? '+' : '−'}{currencyUnit} {fmt(log.profit)}
              </span>
            )}
          </div>

        </div>
      </div>
    );
  };

  return (
    // ✅ FIX: Hapus overflow:'hidden', display:'flex', flexDirection:'column' dari root.
    //    Root div TIDAK boleh jadi scroll container — biarkan <main> (globals.css)
    //    yang handle scroll. Root cukup minHeight:'100%' agar background penuh.
    <div style={{
      minHeight: '100%',
      background: P.bg,
      fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
      WebkitFontSmoothing: 'antialiased',
      transition: 'background 0.3s ease',
    }}>
      <style>{`
        @keyframes skel-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes fade-up     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .hist-chip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
        .hist-chip-scroll::-webkit-scrollbar { display: none; }
        .hist-tap { -webkit-tap-highlight-color: transparent; }
        .hist-tap:active { opacity: 0.6; }

        .hist-row { animation: fade-up 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .hist-row:nth-child(1)  { animation-delay: 0.03s; }
        .hist-row:nth-child(2)  { animation-delay: 0.06s; }
        .hist-row:nth-child(3)  { animation-delay: 0.09s; }
        .hist-row:nth-child(4)  { animation-delay: 0.12s; }
        .hist-row:nth-child(5)  { animation-delay: 0.15s; }
        .hist-row:nth-child(n+6){ animation-delay: 0.18s; }

        /* ✅ FIX: Only apply hover on devices that support it (prevents stuck hover on mobile) */
        @media (hover: hover) {
          .hist-sidebar button:hover { background: ${P.press} !important; }
        }

        @media (min-width: 768px) {
          .hist-grid-2 { grid-template-columns: 1fr 1fr !important; }
          .hist-grid-4 { grid-template-columns: repeat(4,1fr) !important; }
          .hist-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; }
          .hist-sidebar { display: flex !important; }
          .hist-main-top { display: none !important; }
        }
      `}</style>

      {/* ── HEADER (normal, ikut scroll) ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        zIndex: 50,
        background: P.header,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: `0.5px solid ${P.bdr}`,
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ flex: 1, fontSize: 17, fontWeight: 600, color: P.text, letterSpacing: -0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('history.title')}</h1>

          <button onClick={() => loadHistory(true)} disabled={refreshing || isLoading} className="hist-tap"
            style={{ width: 32, height: 32, borderRadius: 8, background: P.press, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.blue, cursor: 'pointer', opacity: (refreshing || isLoading) ? 0.4 : 1, flexShrink: 0 }}>
            <RotateCcw size={15} style={{ animation: (refreshing || isLoading) ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setShowFilters(v => !v)} className="hist-tap"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 99, background: showFilters ? `${P.blue}1A` : P.press, border: `1px solid ${showFilters ? `${P.blue}38` : P.bdr}`, color: showFilters ? P.blue : P.sub, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
            <Filter size={13} />
            <span style={{ whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
            {hasActiveFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: P.blue, marginLeft: 1, flexShrink: 0 }} />}
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      {/* ✅ FIX: Hapus wrapper flex+overflow:hidden dan inner overflowY:auto.
           Konten mengalir natural — scroll ditangani <main> di globals.css.
           padding-bottom sudah include tinggi bottom nav + safe area. */}
      <div style={{
        maxWidth: 1120,
        margin: '0 auto',
        width: '100%',
        padding: '20px 16px calc(56px + env(safe-area-inset-bottom, 0px) + 24px)',
      }}>
        <div className="hist-layout" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ══ SIDEBAR (desktop) ══ */}
          <div className="hist-sidebar" style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: P.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${P.hair}` }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('history.summary')}</p>
                {isLoading ? <Skel w={100} h={28} r={6} /> : (
                  <p style={{ fontSize: 26, fontWeight: 700, color: P.text, letterSpacing: -0.6, lineHeight: 1 }}>{stats.totalTrades} <span style={{ fontSize: 13, fontWeight: 400, color: P.muted }}>{t('history.trades')}</span></p>
                )}
              </div>
              {[
                { label: t('history.profit'), value: stats.wins,   color: P.green },
                { label: t('history.loss'),   value: stats.losses, color: P.red   },
                { label: t('history.draw'),   value: stats.draws,  color: P.amber },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none' }}>
                  <span style={{ fontSize: 14, color: P.sub }}>{label}</span>
                  {isLoading ? <Skel w={30} h={13} r={4} /> : <span style={{ fontSize: 14, fontWeight: 600, color }}>{value}</span>}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: P.card, borderRadius: 14, padding: '12px', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{t('history.winRate')}</p>
                {isLoading ? <Skel w="70%" h={22} r={5} /> : <p style={{ fontSize: 20, fontWeight: 700, color: stats.winRate >= 50 ? P.green : P.red, letterSpacing: -0.4 }}>{stats.winRate}%</p>}
              </div>
              <div style={{ background: P.card, borderRadius: 14, padding: '12px', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{t('history.profitLoss')}</p>
                {isLoading ? <Skel w="80%" h={22} r={5} /> : <p style={{ fontSize: 14, fontWeight: 700, color: pnlPos ? P.green : P.red, letterSpacing: -0.3, lineHeight: 1.2 }}>{pnlPos ? '+' : '-'}{currencyUnit} {fmt(stats.totalPnL)}</p>}
              </div>
            </div>

            <div style={{ background: P.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 16px 8px' }}>{t('history.type')}</p>
              {(['all', 'schedule', 'fastrade', 'ctc', 'indicator', 'momentum'] as LogType[]).map((val, i, arr) => {
                const active = typeFilter === val;
                const colors: Record<LogType, string> = {
                  all: P.blue, schedule: P.green, fastrade: P.blue,
                  ctc: P.purple, indicator: P.amber, momentum: P.pink
                };
                return (
                  <button key={val} onClick={() => setTypeFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${colors[val]}0D` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none', borderLeft: active ? `2px solid ${colors[val]}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 14, color: active ? colors[val] : P.text, fontWeight: active ? 600 : 400 }}>{getTypeLabel(val)}</span>
                    {active && <ChevronRight size={13} color={colors[val]} />}
                  </button>
                );
              })}
            </div>

            <div style={{ background: P.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 16px 8px' }}>{t('history.period')}</p>
              {(['all', 'today', 'week', 'month'] as DateFilter[]).map((val, i, arr) => {
                const active = dateFilter === val;
                return (
                  <button key={val} onClick={() => setDateFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${P.blue}0D` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none', borderLeft: active ? `2px solid ${P.blue}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 14, color: active ? P.blue : P.text, fontWeight: active ? 600 : 400 }}>{getPeriodLabel(val)}</span>
                    {active && <ChevronRight size={13} color={P.blue} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ MAIN COLUMN ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <div className="hist-main-top" style={{ display: 'block' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatTile
                  label={t('history.totalTrades')}
                  value={isLoading ? '—' : stats.totalTrades}
                  sub={isLoading ? '' : `${stats.wins}P · ${stats.losses}L${stats.draws > 0 ? ` · ${stats.draws}${t('history.draw')[0]}` : ''}`}
                  color={P.blue}
                  icon={<BarChart3 size={14} />}
                />
                <StatTile
                  label={t('history.winRate')}
                  value={isLoading ? '—' : `${stats.winRate}%`}
                  sub={isLoading ? '' : `${pnlPos ? '+' : '-'}${currencyUnit} ${fmt(stats.totalPnL)}`}
                  color={stats.winRate >= 50 ? P.green : P.red}
                  icon={stats.winRate >= 50 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                />
              </div>
            </div>

            {showFilters && (
              <div style={{ background: P.card, borderRadius: 14, border: `1px solid ${P.hair}`, boxShadow: P.shadow, padding: '14px 16px', animation: 'fade-up 0.22s ease both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
                  {hasActiveFilter && (
                    <button onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                      style={{ fontSize: 13, color: P.red, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>{t('history.resetFilters')}</button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByType')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','schedule','fastrade','ctc','indicator','momentum'] as LogType[]).map((v) => (
                    <Chip key={v} label={getTypeLabel(v)} active={typeFilter===v} color={TYPE_META[v]?.color || P.blue} onClick={() => setTypeFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByResult')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','win','loss','draw'] as ResultFilter[]).map((v) => (
                    <Chip key={v} label={getResultLabel(v)} active={resultFilter===v} color={v==='win'?P.green:v==='loss'?P.red:v==='draw'?P.amber:P.blue} onClick={() => setResultFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByPeriod')}</p>
                <div className="hist-chip-scroll">
                  {(['all','today','week','month'] as DateFilter[]).map((v) => (
                    <Chip key={v} label={getPeriodLabel(v)} active={dateFilter===v} onClick={() => setDateFilter(v)} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                <p style={{ fontSize: 11.5, fontWeight: 500, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.trades')}</p>
                <p style={{ fontSize: 11.5, color: P.faint, whiteSpace: 'nowrap', flexShrink: 0 }}>{filteredLogs.length} {t('history.records')}</p>
              </div>
              <div style={{ background: P.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
                {isLoading ? (
                  <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${P.blue}26`, borderTopColor: P.blue, animation: 'spin 0.8s linear infinite' }} />
                    <p style={{ fontSize: 13, color: P.muted }}>{t('history.loading')}</p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 20, background: P.press, border: `1px solid ${P.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <History size={28} style={{ color: P.faint, display: 'block' }} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500, color: P.sub, marginBottom: 4 }}>{t('history.noTransactions')}</p>
                    <p style={{ fontSize: 13, color: P.faint }}>{logs.length > 0 ? t('history.noTransactionsFilter') : t('history.startTrading')}</p>
                  </div>
                ) : (
                  <div>
                    {filteredLogs.map((log, idx) => (
                      <div key={log.id} className="hist-row">
                        <LogRow log={log} last={idx === filteredLogs.length - 1} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// Export with LanguageProvider
export default function HistoryPage() {
  return (
    <LanguageProvider>
      <HistoryPageContent />
    </LanguageProvider>
  );
}
