'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ExecutionLog, type FastradeLog, type IndicatorLog, type MomentumLog } from '@/lib/api';
import { storage } from '@/lib/storage';
import { LanguageProvider, useLanguage, formatDate, formatTime, Language } from '@/lib';
import { useDarkMode } from '@/lib/DarkModeContext';
import {
  TrendingUp, TrendingDown, Filter, History, RotateCcw,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  CheckCircle, XCircle, MinusCircle, X,
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
// THEME PALETTE — selaras palet dashboard (getColors, emerald minimalis-modern).
// Full sinkron dark/light via useDarkMode.
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
        // Accent — emerald, selaras dashboard & bottom nav
        accent: '#2DD4A7',
        green:  '#2DD4A7', red: '#FB7185', amber: '#FBBF24',
        blue:   '#60A5FA', purple: '#C084FC', pink: '#F472B6', grey: '#98989F',
      }
    : {
        bg:     '#F6F7F9',
        header: 'rgba(246,247,249,0.90)',
        card:   '#FFFFFF',
        card2:  '#F1F3F5',
        hair:   'rgba(2,6,23,0.06)',
        bdr:    '#E6E8EB',
        text:   '#0F172A',
        sub:    '#334155',
        muted:  '#64748B',
        faint:  '#94A3B8',
        press:  'rgba(2,6,23,0.045)',
        skel:   'rgba(2,6,23,0.06)',
        shadow: '0 1px 0 rgba(2,6,23,0.03), 0 2px 12px rgba(2,6,23,0.04)',
        accent: '#059669',
        green:  '#059669', red: '#E11D48', amber: '#B45309',
        blue:   '#2563EB', purple: '#7C3AED', pink: '#BE185D', grey: '#8E8E93',
      };
}
type Palette = ReturnType<typeof getP>;

// ─────────────────────────────────────────────
// WIN-RATE RING (SVG donut)
// ─────────────────────────────────────────────
const WinRing: React.FC<{ pct: number; P: Palette; size?: number; stroke?: number; label: string }> = ({
  pct, P, size = 74, stroke = 6.5, label,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const good = pct >= 50;
  const col = good ? P.green : P.red;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.press} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: P.text, letterSpacing: -0.5, lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: P.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
    </div>
  );
};

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

  // Format helpers
  const fmt = (n?: number) => {
    if (n == null) return '0';
    return Math.abs(n / 100).toLocaleString(language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'id-ID', { maximumFractionDigits: 0 });
  };

  const fmtDate = (ts: number) =>
    formatDate(ts, language, { day: '2-digit', month: 'short' });

  const fmtTime = (ts: number) =>
    formatTime(ts, language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

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

  // ✅ Lock body scroll when filter panel is open (mobile UX)
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

  // ── Kelompokkan log per hari (timeline) ─────
  const dayGroups = useMemo(() => {
    const todayKey = new Date().toDateString();
    const groups: { key: string; label: string; items: CombinedLog[]; pnl: number }[] = [];
    for (const log of filteredLogs) {
      const key = new Date(log.executedAt).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(log);
        last.pnl += log.profit || 0;
      } else {
        groups.push({
          key,
          label: key === todayKey
            ? t('history.today')
            : formatDate(log.executedAt, language, { weekday: 'long', day: '2-digit', month: 'short' }),
          items: [log],
          pnl: log.profit || 0,
        });
      }
    }
    return groups;
  }, [filteredLogs, language, t]);

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
    label, active, color = P.accent, onClick,
  }) => (
    <button onClick={onClick} className="hist-tap" style={{
      padding: '7px 15px', borderRadius: 99, fontSize: 12.5, fontWeight: active ? 700 : 500,
      fontFamily: 'inherit',
      background: active ? `${color}1A` : P.card2,
      border: `1px solid ${active ? `${color}66` : 'transparent'}`,
      color: active ? color : P.muted,
      cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent',
      flexShrink: 0,
    }}>
      {label}
    </button>
  );

  // ── HERO SUMMARY — net P&L + win-rate ring + bar W/L/D ──
  const HeroSummary = () => {
    const total = Math.max(1, stats.wins + stats.losses + stats.draws);
    const seg = (n: number) => `${(n / total) * 100}%`;
    return (
      <div style={{
        position: 'relative',
        background: P.card,
        border: `1px solid ${P.hair}`,
        borderRadius: 18,
        boxShadow: P.shadow,
        overflow: 'hidden',
      }}>
        {/* subtle accent wash */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
          background: `radial-gradient(120% 90% at 0% 0%, ${pnlPos ? P.green : P.red}${isDarkMode ? '14' : '0D'} 0%, transparent 55%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', padding: '18px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Left: P&L */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
                {t('history.profitLoss')}
              </p>
              {isLoading ? <Skel w="70%" h={30} r={7} /> : (
                <p style={{
                  fontSize: 'clamp(22px, 6.5vw, 30px)', fontWeight: 800, letterSpacing: -0.8, lineHeight: 1,
                  color: pnlPos ? P.green : P.red,
                  display: 'flex', alignItems: 'center', gap: 6,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {pnlPos ? <ArrowUpRight size={22} strokeWidth={2.6} style={{ flexShrink: 0 }} /> : <ArrowDownRight size={22} strokeWidth={2.6} style={{ flexShrink: 0 }} />}
                  {pnlPos ? '+' : '−'}{currencyUnit} {fmt(stats.totalPnL)}
                </p>
              )}
              <p style={{ fontSize: 12, color: P.faint, marginTop: 7 }}>
                {isLoading ? '' : <>{stats.totalTrades} {t('history.trades')}</>}
              </p>
            </div>
            {/* Right: win-rate ring */}
            {isLoading
              ? <Skel w={74} h={74} r={40} />
              : <WinRing pct={stats.winRate} P={P} label={t('history.winRate')} />}
          </div>

          {/* Segmented W/L/D bar */}
          <div style={{ marginTop: 15 }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', background: P.press, gap: stats.totalTrades > 0 ? 2 : 0 }}>
              {!isLoading && stats.wins   > 0 && <div style={{ width: seg(stats.wins),   background: P.green, borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }} />}
              {!isLoading && stats.losses > 0 && <div style={{ width: seg(stats.losses), background: P.red,   borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }} />}
              {!isLoading && stats.draws  > 0 && <div style={{ width: seg(stats.draws),  background: P.amber, borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }} />}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { label: t('history.profit'), value: stats.wins,   color: P.green },
                { label: t('history.loss'),   value: stats.losses, color: P.red   },
                { label: t('history.draw'),   value: stats.draws,  color: P.amber },
              ].map(({ label, value, color }) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: P.muted }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, color: P.text }}>{isLoading ? '—' : value}</span> {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const LogRow: React.FC<{ log: CombinedLog; last: boolean }> = ({ log, last }) => {
    const type      = TYPE_META[log.type] || TYPE_META.fastrade;
    const res       = log.result ? (RESULT_META[log.result as keyof typeof RESULT_META] || null) : null;
    const isCall    = log.trend === 'call';
    const profitPos = (log.profit ?? 0) >= 0;
    const pending   = !log.result;

    const accentGrad = res
      ? `linear-gradient(180deg,${res.color},${res.color}CC)`
      : P.bdr;

    return (
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: last ? 'none' : `1px solid ${P.hair}`, position: 'relative' }}>
        {/* Left accent stripe */}
        <div style={{ width: 3, flexShrink: 0, borderRadius: '0 2px 2px 0', background: accentGrad, margin: '9px 0' }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px 12px 12px', minWidth: 0 }}>

          {/* Icon bubble */}
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: isCall ? `${P.green}17` : `${P.red}17`,
            border: `1px solid ${isCall ? `${P.green}2E` : `${P.red}2E`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isCall ? P.green : P.red,
          }}>
            {isCall ? <TrendingUp size={18} strokeWidth={2.2} /> : <TrendingDown size={18} strokeWidth={2.2} />}
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
            {/* Row 2: time + note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: P.sub, fontFamily: "'SF Mono','Fira Mono',monospace", letterSpacing: '0.01em', background: P.press, borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>
                {log.time}
              </span>
              {log.note && (
                <>
                  <span style={{ fontSize: 10, color: P.faint, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 10.5, color: P.muted, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(110px, 30vw)' }}>
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
    // Root TIDAK menjadi scroll container — scroll ditangani <main> (globals.css).
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

        .hist-group { animation: fade-up 0.32s cubic-bezier(0.22,1,0.36,1) both; }

        /* Hover hanya di device yang mendukung (hindari stuck hover di mobile) */
        @media (hover: hover) {
          .hist-sidebar button:hover { background: ${P.press} !important; }
        }

        @media (min-width: 768px) {
          .hist-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; }
          .hist-sidebar { display: flex !important; }
        }
      `}</style>

      {/* ── HEADER (ikut scroll) ── */}
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: P.text, letterSpacing: -0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{t('history.title')}</h1>
            {!isLoading && (
              <p style={{ fontSize: 11, color: P.faint, lineHeight: 1.3 }}>{filteredLogs.length} {t('history.records')}</p>
            )}
          </div>

          <button onClick={() => loadHistory(true)} disabled={refreshing || isLoading} className="hist-tap"
            style={{ width: 34, height: 34, borderRadius: 10, background: P.press, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.accent, cursor: 'pointer', opacity: (refreshing || isLoading) ? 0.4 : 1, flexShrink: 0 }}>
            <RotateCcw size={15} style={{ animation: (refreshing || isLoading) ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setShowFilters(v => !v)} className="hist-tap"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 99, background: showFilters || hasActiveFilter ? `${P.accent}1A` : P.press, border: `1px solid ${showFilters || hasActiveFilter ? `${P.accent}44` : 'transparent'}`, color: showFilters || hasActiveFilter ? P.accent : P.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
            <Filter size={13} />
            <span style={{ whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
            {hasActiveFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: P.accent, marginLeft: 1, flexShrink: 0 }} />}
          </button>
        </div>
      </div>

      {/* ── BODY — konten mengalir natural, scroll oleh <main> ── */}
      <div style={{
        maxWidth: 1120,
        margin: '0 auto',
        width: '100%',
        padding: '20px 16px calc(56px + env(safe-area-inset-bottom, 0px) + 24px)',
      }}>
        <div className="hist-layout" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ══ SIDEBAR FILTER (desktop) ══ */}
          <div className="hist-sidebar" style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: P.card, borderRadius: 16, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '13px 16px 8px' }}>{t('history.type')}</p>
              {(['all', 'schedule', 'fastrade', 'ctc', 'indicator', 'momentum'] as LogType[]).map((val, i, arr) => {
                const active = typeFilter === val;
                const colors: Record<LogType, string> = {
                  all: P.accent, schedule: P.green, fastrade: P.blue,
                  ctc: P.purple, indicator: P.amber, momentum: P.pink
                };
                return (
                  <button key={val} onClick={() => setTypeFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${colors[val]}0D` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none', borderLeft: active ? `2px solid ${colors[val]}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 14, color: active ? colors[val] : P.text, fontWeight: active ? 700 : 400 }}>{getTypeLabel(val)}</span>
                    {active && <ChevronRight size={13} color={colors[val]} />}
                  </button>
                );
              })}
            </div>

            <div style={{ background: P.card, borderRadius: 16, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '13px 16px 8px' }}>{t('history.period')}</p>
              {(['all', 'today', 'week', 'month'] as DateFilter[]).map((val, i, arr) => {
                const active = dateFilter === val;
                return (
                  <button key={val} onClick={() => setDateFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${P.accent}0D` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none', borderLeft: active ? `2px solid ${P.accent}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 14, color: active ? P.accent : P.text, fontWeight: active ? 700 : 400 }}>{getPeriodLabel(val)}</span>
                    {active && <ChevronRight size={13} color={P.accent} />}
                  </button>
                );
              })}
            </div>

            <div style={{ background: P.card, borderRadius: 16, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '13px 16px 8px' }}>{t('history.filterByResult')}</p>
              {(['all', 'win', 'loss', 'draw'] as ResultFilter[]).map((val, i, arr) => {
                const active = resultFilter === val;
                const col = val === 'win' ? P.green : val === 'loss' ? P.red : val === 'draw' ? P.amber : P.accent;
                return (
                  <button key={val} onClick={() => setResultFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${col}0D` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none', borderLeft: active ? `2px solid ${col}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 14, color: active ? col : P.text, fontWeight: active ? 700 : 400 }}>{getResultLabel(val)}</span>
                    {active && <ChevronRight size={13} color={col} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ MAIN COLUMN ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Hero summary */}
            <HeroSummary />

            {/* Filter panel (mobile / toggle) */}
            {showFilters && (
              <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.hair}`, boxShadow: P.shadow, padding: '15px 16px', animation: 'fade-up 0.22s ease both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {hasActiveFilter && (
                      <button onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                        style={{ fontSize: 13, fontWeight: 600, color: P.red, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent' }}>{t('history.resetFilters')}</button>
                    )}
                    <button onClick={() => setShowFilters(false)} className="hist-tap"
                      style={{ width: 26, height: 26, borderRadius: '50%', background: P.press, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.muted, cursor: 'pointer' }}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('history.filterByType')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','schedule','fastrade','ctc','indicator','momentum'] as LogType[]).map((v) => (
                    <Chip key={v} label={getTypeLabel(v)} active={typeFilter===v} color={TYPE_META[v]?.color || P.accent} onClick={() => setTypeFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('history.filterByResult')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','win','loss','draw'] as ResultFilter[]).map((v) => (
                    <Chip key={v} label={getResultLabel(v)} active={resultFilter===v} color={v==='win'?P.green:v==='loss'?P.red:v==='draw'?P.amber:P.accent} onClick={() => setResultFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('history.filterByPeriod')}</p>
                <div className="hist-chip-scroll">
                  {(['all','today','week','month'] as DateFilter[]).map((v) => (
                    <Chip key={v} label={getPeriodLabel(v)} active={dateFilter===v} onClick={() => setDateFilter(v)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── TIMELINE per hari ── */}
            {isLoading ? (
              <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.hair}`, boxShadow: P.shadow, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${P.accent}26`, borderTopColor: P.accent, animation: 'spin 0.8s linear infinite' }} />
                <p style={{ fontSize: 13, color: P.muted }}>{t('history.loading')}</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.hair}`, boxShadow: P.shadow, padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: P.press, border: `1px solid ${P.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <History size={28} style={{ color: P.faint, display: 'block' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: P.sub, marginBottom: 4 }}>{t('history.noTransactions')}</p>
                <p style={{ fontSize: 13, color: P.faint }}>{logs.length > 0 ? t('history.noTransactionsFilter') : t('history.startTrading')}</p>
              </div>
            ) : (
              dayGroups.map((group, gi) => {
                const gPos = group.pnl >= 0;
                return (
                  <div key={group.key} className="hist-group" style={{ animationDelay: `${Math.min(gi * 0.06, 0.3)}s` }}>
                    {/* Group header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 4px' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.label}</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: group.pnl === 0 ? P.faint : gPos ? P.green : P.red, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {group.pnl === 0 ? `${group.items.length}×` : `${gPos ? '+' : '−'}${currencyUnit} ${fmt(group.pnl)}`}
                      </p>
                    </div>
                    <div style={{ background: P.card, borderRadius: 16, overflow: 'hidden', border: `1px solid ${P.hair}`, boxShadow: P.shadow }}>
                      {group.items.map((log, idx) => (
                        <div key={log.id} className="hist-row">
                          <LogRow log={log} last={idx === group.items.length - 1} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

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
