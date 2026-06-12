// src/app/profile/page.tsx
'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ProfileBalance } from '@/lib/api';
import { resolveAvatarUrl } from '@/lib/userProfileApi';
import { storage, isSessionValid, sessionLogout, getAuthToken, saveCurrencyWithIso } from '@/lib/storage';
import { checkIsAdmin, checkIsSuperAdmin } from '@/lib/supabaseRepository';
import { LanguageProvider, useLanguage, formatCurrency, formatDate, Language } from '@/lib';
import { applyLanguageFromCountry } from '@/lib/LanguageContext';
import { SESSION_KEYS } from '@/lib/storage';
import { LanguageSheet } from '@/components/LanguageSelector';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface UserProfileData {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  gender?: string;
  country?: string;
  birthday?: string;
  registeredAt?: string;
  registrationCountryIso?: string;
  avatar?: string;
  personalDataLocked?: boolean;
  docsVerified?: boolean;
}
interface CurrencyOption { iso: string; name?: string; symbol?: string; }

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const PROFILE_STYLES = `
  .pf-root, .pf-root * { box-sizing: border-box; }
  .pf-root {
    --bg:           #0a0a14;
    --surface:      rgba(14, 14, 26, 0.92);
    --surface-2:    rgba(18, 18, 32, 0.75);
    --border:       rgba(76, 175, 80, 0.18);
    --border-hi:    rgba(76, 175, 80, 0.35);
    --text-1:       #ffffff;
    --text-2:       rgba(255,255,255,0.55);
    --text-3:       rgba(255,255,255,0.28);
    --accent:       #4caf50;
    --accent-dim:   #66bb6a;
    --error:        #ff453a;
    --warn:         #ff9f0a;
    --success:      #30d158;
    --font:         -apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  }

  @keyframes pf-skel  { 0%,100%{opacity:.30} 50%{opacity:.65} }
  @keyframes pf-bd-in { from{opacity:0} to{opacity:1} }
  @keyframes pf-pop   { from{opacity:0;transform:scale(0.93)} to{opacity:1;transform:scale(1)} }
  @keyframes pf-up    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pf-spin  { to{transform:rotate(360deg)} }
  @keyframes pf-num   { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pf-drift { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(3%,4%) scale(1.04)} 100%{transform:translate(-2%,2%) scale(0.97)} }
  @keyframes pf-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }

  @keyframes lo-fade  { from{opacity:0} to{opacity:1} }
  @keyframes lo-icon  { from{opacity:0;transform:scale(0.6)} 70%{transform:scale(1.08)} to{opacity:1;transform:scale(1)} }
  @keyframes lo-msg   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lo-ring  { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.06);opacity:0.35} }
  @keyframes lo-orb-1 { from{transform:translate(0,0)} to{transform:translate(30px,22px)} }
  @keyframes lo-orb-2 { from{transform:translate(0,0)} to{transform:translate(-25px,-18px)} }
  @keyframes lo-bar   { from{width:0%} to{width:100%} }

  .pf-skel {
    border-radius: 6px;
    background: rgba(100,120,100,0.14);
    animation: pf-skel 1.6s ease-in-out infinite;
  }

  /* Ambient orbs */
  .pf-orb { position:fixed; border-radius:50%; pointer-events:none; animation:pf-drift 22s ease-in-out infinite alternate; }
  .pf-orb-1 { width:clamp(260px,65vw,480px); height:clamp(260px,65vw,480px); background:radial-gradient(circle,rgba(20,80,45,0.18) 0%,transparent 65%); bottom:-12%; right:-10%; filter:blur(80px); }
  .pf-orb-2 { width:clamp(200px,50vw,380px); height:clamp(200px,50vw,380px); background:radial-gradient(circle,rgba(10,25,70,0.20) 0%,transparent 65%); top:-15%; left:-8%; filter:blur(70px); animation-delay:-11s; }

  /* Cards */
  .pf-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 1px solid var(--border-hi);
    border-radius: 18px;
    overflow: hidden;
    backdrop-filter: saturate(120%) blur(24px);
    -webkit-backdrop-filter: saturate(120%) blur(24px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.50), 0 0 0 0.5px rgba(76,175,80,0.06), inset 0 1px 0 rgba(76,175,80,0.12);
  }

  /* Hero card */
  .pf-hero {
    background: linear-gradient(160deg, rgba(16,18,30,0.95) 0%, rgba(10,12,22,0.98) 100%);
    border: 1px solid rgba(76,175,80,0.22);
    border-top: 1px solid rgba(76,175,80,0.38);
    border-radius: 22px;
    overflow: hidden;
    backdrop-filter: saturate(120%) blur(28px);
    -webkit-backdrop-filter: saturate(120%) blur(28px);
    box-shadow: 0 12px 48px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(76,175,80,0.08), inset 0 1px 0 rgba(76,175,80,0.15);
    position: relative;
  }
  .pf-hero::before {
    content: '';
    position: absolute;
    top: 0; left: 50%; transform: translateX(-50%);
    width: 60%; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(76,175,80,0.50), transparent);
  }

  /* Section label */
  .pf-section-label {
    font-size: 11px; font-weight: 700;
    color: rgba(102,187,106,0.85);
    text-transform: uppercase; letter-spacing: 0.10em;
    padding: 0 2px 0 10px; margin-bottom: 8px;
    border-left: 2px solid rgba(76,175,80,0.55);
  }

  /* Info rows */
  .pf-info-row { border-bottom: 1px solid rgba(255,255,255,0.06); }
  .pf-info-row:last-child { border-bottom: none; }

  /* Tappable rows */
  .pf-tap-row {
    width:100%; background:transparent; border:none; cursor:pointer;
    display:flex; align-items:center;
    padding: 13px 16px 13px 14px;
    gap:12px; text-align:left;
    -webkit-tap-highlight-color: transparent;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    transition: background 0.12s;
  }
  .pf-tap-row:last-child { border-bottom: none; }
  @media (hover:hover) { .pf-tap-row:hover { background: rgba(76,175,80,0.06) !important; } }
  .pf-tap-row:active { background: rgba(76,175,80,0.10) !important; }

  /* Balance number */
  .pf-balance-num { animation: pf-num 0.4s ease both; }

  /* Copy btn */
  .pf-copy-btn:active { opacity: 0.55; transform: scale(0.95); }

  /* Layout */
  .pf-body { flex:1; overflow:hidden; display:flex; flex-direction:column; }
  .pf-mob-header { display:flex; flex-shrink:0; }
  .pf-desk-header { display:none; }
  .pf-left { display:none; }
  .pf-mob-only { display:block; }
  .pf-right {
    flex:1; overflow-y:auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 20px 16px calc(72px + env(safe-area-inset-bottom,0px) + 20px);
    display:flex; flex-direction:column; gap:22px;
    min-height:0;
  }
  .pf-right::-webkit-scrollbar { width:0; }

  @media (min-width:768px) {
    .pf-body { flex-direction:row; }
    .pf-mob-header { display:none; }
    .pf-desk-header { display:flex !important; align-items:center; justify-content:space-between; padding-bottom:4px; }
    .pf-left {
      display:flex; flex-direction:column; gap:22px;
      width:280px; min-width:280px;
      height:100%; overflow-y:auto;
      padding:28px 22px 100px;
      background:rgba(7,8,16,0.65);
      border-right:0.5px solid rgba(76,175,80,0.16);
    }
    .pf-left::-webkit-scrollbar { width:0; }
    .pf-right { padding:28px 32px 100px; gap:22px; overscroll-behavior-y:auto; }
    .pf-mob-only { display:none; }
    .pf-left > * { animation:pf-up 0.4s cubic-bezier(0.22,1,0.36,1) both; }
    .pf-left > *:nth-child(1){ animation-delay:0.05s; }
    .pf-left > *:nth-child(2){ animation-delay:0.10s; }
    .pf-left > *:nth-child(3){ animation-delay:0.15s; }
    .pf-right > * { animation:pf-up 0.4s cubic-bezier(0.22,1,0.36,1) both; }
    .pf-right > *:nth-child(1){ animation-delay:0.06s; }
    .pf-right > *:nth-child(2){ animation-delay:0.11s; }
    .pf-right > *:nth-child(3){ animation-delay:0.16s; }
    .pf-right > *:nth-child(4){ animation-delay:0.21s; }
    .pf-right > *:nth-child(5){ animation-delay:0.26s; }
  }

  /* Logout splash */
  .lo-splash {
    position:fixed; inset:0; z-index:9999;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    font-family:var(--font); -webkit-font-smoothing:antialiased;
    background:linear-gradient(160deg,#070710 0%,#0b0b1c 60%,#0e0e24 100%);
    overflow:hidden; animation:lo-fade 0.32s cubic-bezier(0.22,1,0.36,1) forwards;
  }
  .lo-orb { position:absolute; border-radius:50%; pointer-events:none; }
  .lo-orb-1 { width:380px;height:380px;background:radial-gradient(circle,rgba(20,80,45,0.18) 0%,transparent 70%);filter:blur(80px);top:-100px;right:-100px;animation:lo-orb-1 7s ease-in-out infinite alternate; }
  .lo-orb-2 { width:340px;height:340px;background:radial-gradient(circle,rgba(15,30,80,0.18) 0%,transparent 70%);filter:blur(75px);bottom:-80px;left:-80px;animation:lo-orb-2 6s ease-in-out infinite alternate; }
  .lo-orb-3 { width:260px;height:260px;background:radial-gradient(circle,rgba(50,50,100,0.12) 0%,transparent 70%);filter:blur(70px);top:40%;left:-60px;animation:lo-orb-1 5s ease-in-out infinite alternate; }
  .lo-icon-wrap { position:relative;width:110px;height:110px;display:flex;align-items:center;justify-content:center;margin-bottom:28px; }
  .lo-ring       { position:absolute;inset:0;border-radius:50%;border:2px solid rgba(76,175,80,0.22);animation:lo-ring 2.2s ease-in-out infinite; }
  .lo-ring-2     { inset:-12px;border-color:rgba(76,175,80,0.13);animation-delay:0.4s; }
  .lo-ring-3     { inset:-24px;border-color:rgba(76,175,80,0.06);animation-delay:0.8s; }
  .lo-icon       { width:90px;height:90px;border-radius:28px;background:rgba(10,10,22,0.97);border:1px solid rgba(76,175,80,0.22);box-shadow:0 8px 36px rgba(76,175,80,0.15),0 2px 8px rgba(0,0,0,0.30);display:flex;align-items:center;justify-content:center;position:relative;z-index:1;animation:lo-icon 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.12s both;font-size:40px;line-height:1; }
  .lo-text       { text-align:center;padding:0 32px;animation:lo-msg 0.5s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
  .lo-title      { font-size:clamp(26px,8vw,32px);font-weight:800;letter-spacing:-1px;line-height:1.1;margin-bottom:8px;color:#fff; }
  .lo-sub        { font-size:14.5px;color:rgba(255,255,255,0.50);font-weight:400;line-height:1.6; }
  .lo-bar-wrap   { margin-top:36px;width:120px;height:3px;background:rgba(76,175,80,0.15);border-radius:99px;overflow:hidden;animation:lo-msg 0.5s cubic-bezier(0.22,1,0.36,1) 0.35s both; }
  .lo-bar        { height:100%;border-radius:99px;background:linear-gradient(90deg,#4caf50,#66bb6a);animation:lo-bar 1.65s cubic-bezier(0.4,0,0.2,1) 0.4s forwards; }

  /* Modals */
  .pf-modal-overlay  { position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;touch-action:none; }
  .pf-modal-backdrop { position:absolute;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:pf-bd-in 0.22s ease; }
  .pf-modal-sheet    { position:relative;z-index:1;background:rgba(10,10,22,0.97);border:1px solid rgba(76,175,80,0.20);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,0.60);overflow:hidden;animation:pf-pop 0.28s cubic-bezier(0.22,1,0.36,1); }
  .pf-modal-close-btn { width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.50);transition:background 0.15s;flex-shrink:0;-webkit-tap-highlight-color:transparent; }
  .pf-modal-close-btn:hover { background:rgba(255,255,255,0.14); }

  .pf-curr-item { width:100%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;padding:13px 20px;border-bottom:1px solid rgba(255,255,255,0.07);gap:14px;-webkit-tap-highlight-color:transparent;transition:background 0.12s; }
  .pf-curr-item:last-child { border-bottom:none; }
  .pf-curr-item:hover { background:rgba(76,175,80,0.06); }

  .pf-search-input { width:100%;padding:10px 10px 10px 36px;border-radius:11px;border:1px solid rgba(76,175,80,0.20);background:rgba(0,0,0,0.35);outline:none;font-size:15px;color:#fff;font-family:var(--font);-webkit-appearance:none;appearance:none;transition:border-color 0.2s; }
  .pf-search-input::placeholder { color:rgba(255,255,255,0.28); }
  .pf-search-input:focus { border-color:rgba(76,175,80,0.50); }
`;

// ─────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────
const Skel: React.FC<{ w?: number | string; h?: number; r?: number }> = ({ w = '100%', h = 16, r = 6 }) => (
  <div className="pf-skel" style={{ width: w, height: h, borderRadius: r }} />
);

// ─────────────────────────────────────────────
// CURRENCY SHEET
// ─────────────────────────────────────────────
const CurrencySheet: React.FC<{
  open: boolean; onClose: () => void;
  currencies: CurrencyOption[]; current: string;
  onSelect: (iso: string) => Promise<void>; loading: boolean;
}> = ({ open, onClose, currencies, current, onSelect, loading }) => {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prevOverflow; };
    }
  }, [open]);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 300); }
  }, [open]);

  if (!open) return null;
  const filtered = q.trim()
    ? currencies.filter(c => c.iso.toLowerCase().includes(q.toLowerCase()) || (c.name || '').toLowerCase().includes(q.toLowerCase()))
    : currencies;

  return (
    <div className="pf-root" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, touchAction: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'pf-bd-in 0.25s ease' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, maxHeight: '72dvh', display: 'flex', flexDirection: 'column', background: 'rgba(10,10,22,0.97)', border: '1px solid rgba(76,175,80,0.22)', borderRadius: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.60)', animation: 'pf-pop 0.28s cubic-bezier(0.32,0.72,0,1)', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(76,175,80,0.12)' }}>
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: -0.4, marginBottom: 2 }}>{t('profile.selectCurrency')}</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{t('common.currency')}: <span style={{ color: '#66bb6a' }}>{current}</span></p>
          </div>
          <button onClick={onClose} className="pf-modal-close-btn" aria-label={t('common.close')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ flexShrink: 0, padding: '12px 16px 8px' }}>
          <div style={{ position: 'relative' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(76,175,80,0.50)" strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')} className="pf-search-input" />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, overscrollBehaviorY: 'contain' }}>
          {filtered.length === 0
            ? <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                {t('common.notFound')}
              </div>
            : filtered.map(c => {
                const sel = c.iso === current;
                return (
                  <button key={c.iso} onClick={() => onSelect(c.iso).then(onClose)} disabled={loading} className="pf-curr-item" style={{ opacity: loading ? 0.6 : 1 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: sel ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${sel ? 'rgba(76,175,80,0.35)' : 'rgba(255,255,255,0.10)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#66bb6a' : 'rgba(255,255,255,0.60)' }}>{c.iso.slice(0,3)}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <p style={{ fontSize: 15, color: sel ? '#66bb6a' : '#fff', fontWeight: sel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.iso}</p>
                      {c.name && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>}
                    </div>
                    {c.symbol && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.32)', flexShrink: 0 }}>{c.symbol}</span>}
                    {sel && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// LOGOUT CONFIRM
// ─────────────────────────────────────────────
const LogoutAlert: React.FC<{ open: boolean; onCancel: () => void; onConfirm: () => void }> = ({ open, onCancel, onConfirm }) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="pf-root" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', touchAction: 'none' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'pf-bd-in 0.2s ease' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 320, animation: 'pf-pop 0.28s cubic-bezier(0.32,0.72,0,1)' }}>
        <div style={{ background: 'rgba(12,12,24,0.98)', border: '1px solid rgba(76,175,80,0.18)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.60)' }}>
          <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,69,58,0.12)', border: '1.5px solid rgba(255,69,58,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: -0.4 }}>{t('profile.logoutConfirm')}</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{t('profile.logoutMessage')}</p>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex' }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '17px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: '#66bb6a', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>{t('common.cancel')}</button>
            <button onClick={onConfirm} style={{ flex: 1, padding: '17px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 400, color: '#ff453a', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>{t('profile.logout')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// EMAIL COMPOSER (super-admin) — kirim email ke user / semua user whitelist
// ─────────────────────────────────────────────
type WLUser = { email: string; name?: string; is_active?: boolean };

const EmailComposer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [target, setTarget]   = useState<'one' | 'custom' | 'all'>('one');
  const [users, setUsers]     = useState<WLUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [query, setQuery]     = useState('');
  const [selected, setSelected] = useState<WLUser | null>(null);
  const [customRaw, setCustomRaw] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [html, setHtml]       = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setLoadingUsers(true);
    api.admin.listWhitelist()
      .then((rows: any[]) => {
        const mapped: WLUser[] = (rows ?? [])
          .map((r: any) => ({ email: String(r.email ?? '').toLowerCase().trim(), name: (r.name ?? '').trim(), is_active: r.is_active ?? r.isActive }))
          .filter((u: WLUser) => u.email.includes('@'));
        setUsers(mapped);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = (q
    ? users.filter(u => u.email.includes(q) || (u.name ?? '').toLowerCase().includes(q))
    : users
  ).slice(0, 8);
  const typedEmailOk = q.includes('@') && !users.some(u => u.email === q);

  const customEmails = Array.from(new Set(
    customRaw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.includes('@')),
  ));

  const recipientEmail = selected?.email ?? '';
  const canSend = !!subject.trim() && !!message.trim() && !sending &&
    (target === 'all' ? users.length > 0
      : target === 'custom' ? customEmails.length > 0
      : recipientEmail.includes('@'));

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const res = await api.admin.sendEmail({
        target,
        email: target === 'one' ? recipientEmail : undefined,
        emails: target === 'custom' ? customEmails : undefined,
        subject: subject.trim(),
        message: message.trim(),
        html,
      });
      setResult({
        ok: res.failed === 0,
        text: `Terkirim ${res.sent}/${res.total}${res.failed ? `, gagal ${res.failed}` : ''}.`,
      });
      if (res.failed === 0) { setSubject(''); setMessage(''); if (target === 'custom') setCustomRaw(''); }
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || 'Gagal mengirim email.' });
    } finally {
      setSending(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '12px 14px',
    fontSize: 14, color: '#fff', fontFamily: 'inherit', outline: 'none', marginTop: 6,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 };
  const initial = (u: WLUser) => (u.name || u.email).charAt(0).toUpperCase();
  const Avatar = ({ u, size = 30 }: { u: WLUser; size?: number }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#2faa4d,#34c759)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 700, color: '#fff' }}>{initial(u)}</div>
  );

  const pickUser = (u: WLUser) => { setSelected(u); setQuery(''); };

  return (
    <div className="pf-root" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div onClick={sending ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'pf-bd-in 0.2s ease' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 430, animation: 'pf-pop 0.28s cubic-bezier(0.32,0.72,0,1)' }}>
        <div style={{ background: 'rgba(12,12,24,0.98)', border: '1px solid rgba(76,175,80,0.18)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.60)' }}>
          <div style={{ padding: '20px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#34c759,#30d158)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>Kirim Email</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{target === 'all' ? `ke ${users.length} user whitelist` : target === 'custom' ? `ke ${customEmails.length} email custom` : selected ? `ke ${selected.name || selected.email}` : 'pilih penerima'}</p>
            </div>
            <button onClick={sending ? undefined : onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', cursor: sending ? 'default' : 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '66vh', overflowY: 'auto' }}>
            {/* Target toggle */}
            <div style={{ display: 'flex', gap: 6 }}>
              {([['one', 'Whitelist'], ['custom', 'Custom'], ['all', `Semua${users.length ? ` (${users.length})` : ''}`]] as const).map(([val, lbl]) => (
                <button key={val} onClick={() => setTarget(val)} style={{
                  flex: 1, padding: '9px 4px', borderRadius: 11, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  border: `1px solid ${target === val ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.10)'}`,
                  background: target === val ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.04)',
                  color: target === val ? '#5cc763' : 'rgba(255,255,255,0.6)',
                }}>{lbl}</button>
              ))}
            </div>

            {/* Recipient picker (one) */}
            {target === 'one' && (
              <div>
                <span style={labelStyle}>Penerima</span>
                {selected ? (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(76,175,80,0.10)', border: '1px solid rgba(76,175,80,0.28)' }}>
                    <Avatar u={selected} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {selected.name && <p style={{ fontSize: 14, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</p>}
                      <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.email}</p>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.10)', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau email…" autoCapitalize="none" style={{ ...inputStyle, marginTop: 0, paddingLeft: 38 }} />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 184, overflowY: 'auto' }}>
                      {loadingUsers && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '8px 4px' }}>Memuat user…</p>}
                      {!loadingUsers && filtered.map(u => (
                        <button key={u.email} onClick={() => pickUser(u)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <Avatar u={u} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {u.name && <p style={{ fontSize: 13.5, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>}
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                          </div>
                          {u.is_active === false && <span style={{ fontSize: 10, color: '#ff9f0a', flexShrink: 0 }}>nonaktif</span>}
                        </button>
                      ))}
                      {!loadingUsers && typedEmailOk && (
                        <button onClick={() => pickUser({ email: q })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, background: 'rgba(76,175,80,0.08)', border: '1px dashed rgba(76,175,80,0.3)', cursor: 'pointer', color: '#5cc763', fontSize: 13, fontFamily: 'inherit', width: '100%' }}>
                          + Kirim ke “{q}”
                        </button>
                      )}
                      {!loadingUsers && filtered.length === 0 && !typedEmailOk && (
                        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', padding: '8px 4px' }}>{q ? 'User tidak ditemukan.' : 'Belum ada user.'}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Custom email (di luar whitelist) */}
            {target === 'custom' && (
              <div>
                <span style={labelStyle}>Email tujuan (boleh lebih dari satu)</span>
                <textarea value={customRaw} onChange={e => setCustomRaw(e.target.value)} placeholder="email1@contoh.com, email2@contoh.com" autoCapitalize="none" rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.5 }} />
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.5 }}>
                  Pisahkan dengan koma, spasi, atau baris baru.{customEmails.length > 0 && <> <span style={{ color: '#5cc763', fontWeight: 600 }}>{customEmails.length} email valid.</span></>}
                </p>
              </div>
            )}

            {target === 'all' && (
              <p style={{ fontSize: 12.5, color: '#ff9f0a', background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.20)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
                Email akan dikirim ke <strong>{users.length} user whitelist</strong>. Pastikan isinya sudah benar.
              </p>
            )}

            <div>
              <span style={labelStyle}>Subjek</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Judul email" style={inputStyle} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={labelStyle}>Pesan</span>
                <button onClick={() => setHtml(h => !h)} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: html ? '#5cc763' : 'rgba(255,255,255,0.45)' }}>
                  HTML
                  <span style={{ width: 34, height: 20, borderRadius: 99, background: html ? 'rgba(76,175,80,0.55)' : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 2, left: html ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </span>
                </button>
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder={html ? '<p>Halo <b>nama</b>, …</p>' : 'Tulis pesan…'}
                rows={6} spellCheck={!html}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 110, lineHeight: 1.5, fontFamily: html ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', fontSize: html ? 13 : 14 }} />
              {html && (
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.5 }}>
                  Mode HTML aktif — tulis tag HTML langsung (mis. <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>&lt;b&gt;, &lt;a href&gt;, &lt;br&gt;</span>).
                </p>
              )}
              {html && message.trim() && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Pratinjau</span>
                  <div style={{ marginTop: 6, background: '#fff', color: '#1c1c1e', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, maxHeight: 180, overflowY: 'auto', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: message }} />
                </div>
              )}
            </div>

            {result && (
              <p style={{ fontSize: 13, fontWeight: 500, padding: '10px 12px', borderRadius: 10, lineHeight: 1.5,
                color: result.ok ? '#30d158' : '#ff453a',
                background: result.ok ? 'rgba(48,209,88,0.10)' : 'rgba(255,69,58,0.10)',
                border: `1px solid ${result.ok ? 'rgba(48,209,88,0.22)' : 'rgba(255,69,58,0.22)'}` }}>
                {result.text}
              </p>
            )}
          </div>

          <div style={{ padding: '14px 22px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={handleSend} disabled={!canSend} style={{
              width: '100%', height: 48, borderRadius: 13, border: 'none', cursor: canSend ? 'pointer' : 'not-allowed',
              fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: '#fff',
              background: canSend ? 'linear-gradient(135deg,#34c759,#2faa4d)' : 'rgba(255,255,255,0.10)',
              opacity: canSend ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {sending ? 'Mengirim…'
                : target === 'all' ? `Kirim ke ${users.length} user`
                : target === 'custom' ? (customEmails.length ? `Kirim ke ${customEmails.length} email` : 'Kirim Email')
                : 'Kirim Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN PAGE CONTENT
// ─────────────────────────────────────────────
function ProfilePageContent() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [isLoading, setIsLoading]             = useState(true);
  const [profile, setProfile]                 = useState<UserProfileData | null>(null);
  const [balance, setBalance]                 = useState<ProfileBalance | null>(null);
  const [currencies, setCurrencies]           = useState<CurrencyOption[]>([]);
  const [sheetOpen, setSheetOpen]             = useState(false);
  const [langSheetOpen, setLangSheetOpen]     = useState(false);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [showLogout, setShowLogout]           = useState(false);
  const [emailOpen, setEmailOpen]             = useState(false);
  const [logoutSplash, setLogoutSplash]       = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [isAdminUser, setIsAdminUser]         = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [profileCurrencyUnit, setProfileCurrencyUnit] = useState<string>('');
  const [refreshing, setRefreshing]           = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSheetOpen(false); setLangSheetOpen(false); setShowLogout(false); setEmailOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const init = async () => {
      const sessionValid = await isSessionValid();
      if (!sessionValid) { router.push('/login'); return; }
      loadProfile();
      try {
        const email = await storage.get('stc_email') ?? '';
        if (email) {
          const [adm, sup] = await Promise.all([checkIsAdmin(email), checkIsSuperAdmin(email)]);
          setIsAdminUser(adm || sup);
          setIsSuperAdminUser(sup);
        }
      } catch { /* ignore */ }
    };
    init();
  }, []); // eslint-disable-line

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) { router.push('/login'); return; }
      const [prof, bal] = await Promise.all([api.getProfile(), api.balance().catch(() => null)]);
      setProfile(prof); setBalance(bal);
      const accountCountry = prof.country || prof.registrationCountryIso;
      if (accountCountry) applyLanguageFromCountry(accountCountry, setLanguage);
      try {
        const sessionCurrencyUnit = await storage.get(SESSION_KEYS.CURRENCY_ISO);
        if (sessionCurrencyUnit) setProfileCurrencyUnit(sessionCurrencyUnit);
      } catch { /* ignore */ }
      api.getCurrencies().then(list => {
        setCurrencies(list.map(c => ({ iso: c.iso ?? '', name: c.name ?? '', symbol: c.symbol ?? '' })));
      }).catch(() => {});
    } catch (err: any) {
      if (err?.status === 401) { router.push('/login'); return; }
      setError(t('profile.loadError'));
    } finally {
      setIsLoading(false); setRefreshing(false);
    }
  }, [router, t]);

  const handleUpdateCurrency = async (iso: string) => {
    setCurrencyLoading(true);
    try {
      await api.updateCurrency(iso);
      const bal = await api.balance().catch(() => null);
      if (bal) setBalance(bal);
      const ISO_TO_UNIT: Record<string, string> = {
        IDR:'Rp', USD:'$', EUR:'€', GBP:'£', BRL:'R$', COP:'Col$', MXN:'MX$',
        ARS:'AR$', PEN:'S/', CLP:'CL$', NGN:'₦', KES:'KSh', GHS:'GH₵', ZAR:'R',
        INR:'₹', PKR:'₨', BDT:'৳', LKR:'Rs', PHP:'₱', VND:'₫', THB:'฿',
        MYR:'RM', SGD:'S$', TRY:'₺', UAH:'₴', KZT:'₸', UZS:"so'm",
        RUB:'₽', AMD:'֏', AZN:'₼', GEL:'₾', EGP:'E£', MAD:'MAD', TND:'DT',
        DZD:'DA', SAR:'﷼', AED:'AED', KWD:'KD', QAR:'QR', OMR:'OMR',
      };
      const unit = ISO_TO_UNIT[iso] ?? iso;
      await saveCurrencyWithIso(iso, unit);
      setProfileCurrencyUnit(unit);
    } finally { setCurrencyLoading(false); }
  };

  const handleLogout = async () => {
    setShowLogout(false);
    window.dispatchEvent(new CustomEvent('stc:hidenav'));
    setLogoutSplash(true);
    await new Promise(res => setTimeout(res, 1800));
    try {
      const { stcWebView } = await import('@/plugins/StcWebViewPlugin');
      await stcWebView.clearSession();
    } catch (e) { console.warn('[Logout] clearSession error:', e); }
    await sessionLogout();
    const rememberEmail = localStorage.getItem('stc_remember_email');
    const rememberPass  = localStorage.getItem('stc_remember_password');
    localStorage.clear();
    if (rememberEmail) localStorage.setItem('stc_remember_email', rememberEmail);
    if (rememberPass)  localStorage.setItem('stc_remember_password', rememberPass);
    sessionStorage.clear();
    try {
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
    } catch { /* ignore */ }
    try {
      const dbs = await indexedDB.databases?.() ?? [];
      await Promise.all(dbs.map(db => db.name ? indexedDB.deleteDatabase(db.name) : Promise.resolve()));
    } catch { /* ignore */ }
    router.push('/login');
  };

  const copyId = () => {
    if (!profile?.id) return;
    navigator.clipboard.writeText(String(profile.id)).catch(() => {
      const el = document.createElement('textarea');
      el.value = String(profile.id);
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const fmtBalance = (n?: number) => {
    if (n == null) return '0';
    const val = n / 100;
    const localeMap: Record<string, string> = { en:'en-US', id:'id-ID', ru:'ru-RU', es:'es-ES', ms:'ms-MY', hi:'hi-IN', th:'th-TH', tr:'tr-TR' };
    return val.toLocaleString(localeMap[language] ?? 'en-US', { maximumFractionDigits: 0 });
  };

  const getInitials = () => {
    const f = profile?.firstName?.[0] || '';
    const l = profile?.lastName?.[0] || '';
    return (f + l).toUpperCase() || profile?.nickname?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    const f = profile?.firstName?.trim() || '';
    const l = profile?.lastName?.trim() || '';
    if (f && l) return `${f} ${l}`;
    return f || l || profile?.nickname?.trim() || profile?.email?.split('@')[0] || 'User';
  };

  const currency = balance?.currency || 'IDR';
  const currencyUnit = profileCurrencyUnit || (currency === 'IDR' ? 'Rp' : currency);

  // ── Sub-components ──────────────────────────────────────

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="pf-section-label">{children}</p>
  );

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div className="pf-card" style={style}>{children}</div>
  );

  // InfoRow with icon
  const InfoRow = ({ icon, label, value, verified, last }: {
    icon?: React.ReactNode; label: string; value?: string | null; verified?: boolean; last?: boolean;
  }) => (
    <div className={last ? '' : 'pf-info-row'} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12 }}>
      {icon && (
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(76,175,80,0.09)', border: '1px solid rgba(76,175,80,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 14, color: value ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.22)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</p>
      </div>
      {verified != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: verified ? '#30d158' : '#ff9f0a', background: verified ? 'rgba(48,209,88,0.12)' : 'rgba(255,159,10,0.12)', padding: '3px 8px', borderRadius: 99, flexShrink: 0, border: `1px solid ${verified ? 'rgba(48,209,88,0.20)' : 'rgba(255,159,10,0.20)'}` }}>
          {verified ? t('profile.verified') : t('profile.notVerified')}
        </span>
      )}
    </div>
  );

  const TappableRow = ({ icon, iconBg, label, value, danger, onClick, last, chevron = true }: {
    icon: React.ReactNode; iconBg: string; label: string; value?: string;
    danger?: boolean; onClick: () => void; last?: boolean; chevron?: boolean;
  }) => (
    <button onClick={onClick} className="pf-tap-row" style={{ borderBottom: last ? 'none' : undefined }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: danger ? '0 2px 8px rgba(255,69,58,0.20)' : '0 2px 8px rgba(0,0,0,0.20)' }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 15, color: danger ? '#ff453a' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{label}</span>
      {value && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', marginRight: 6, flexShrink: 0, maxWidth: '40vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
      {chevron && <svg width="6" height="11" viewBox="0 0 7 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}><path d="M1 1l5 5-5 5" stroke={danger ? '#ff453a' : 'rgba(255,255,255,0.50)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </button>
  );

  // Hero Avatar Card — redesigned
  const AvatarHero = () => (
    <div className="pf-hero" style={{ padding: '24px 20px 22px' }}>
      {/* Subtle green glow at top */}
      <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 80, background: 'radial-gradient(ellipse, rgba(76,175,80,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', marginBottom: 16, animation: 'pf-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.08s both' }}>
          {/* Glow ring */}
          <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(76,175,80,0.50), rgba(102,187,106,0.25), rgba(76,175,80,0.50))', animation: 'pf-spin 8s linear infinite', zIndex: 0 }} />
          <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: 'var(--bg)', zIndex: 1 }} />
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(145deg, #2e7d32, #4caf50, #66bb6a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, color: '#fff', position: 'relative', zIndex: 2, overflow: 'hidden' }}>
            {isLoading ? '' : profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveAvatarUrl(profile.avatar) ?? profile.avatar} alt={getDisplayName()} width={88} height={88} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : getInitials()}
          </div>
        </div>

        {/* Name & Email */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <Skel w="55%" h={20} r={6} /><Skel w="70%" h={13} r={5} />
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5, marginBottom: 5, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 12px' }}>{getDisplayName()}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', marginBottom: 14, wordBreak: 'break-all', maxWidth: 'min(240px,82vw)', lineHeight: 1.4 }}>{profile?.email}</p>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4 }}>
              {profile?.docsVerified && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#30d158', background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.25)', padding: '4px 10px', borderRadius: 99 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  {t('profile.verified')}
                </span>
              )}
              {profile?.id && (
                <button className="pf-copy-btn" onClick={copyId} aria-label={copied ? t('profile.copiedId') : t('profile.copyId')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: copied ? '#30d158' : 'rgba(255,255,255,0.40)', background: copied ? 'rgba(48,209,88,0.10)' : 'rgba(255,255,255,0.07)', border: `1px solid ${copied ? 'rgba(48,209,88,0.25)' : 'rgba(255,255,255,0.12)'}`, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', transition: 'all 0.2s', WebkitTapHighlightColor: 'transparent' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  ID: {String(profile.id).slice(0, 8)}…
                  {copied && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Balance Block — STC2 pattern (label top-left + icon top-right + big value)
  const BalanceBlock = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[
        {
          label: t('profile.balanceReal'),
          color: '#30d158',
          bgColor: 'rgba(48,209,88,0.12)',
          borderColor: 'rgba(48,209,88,0.22)',
          val: balance?.real_balance,
          sub: currencyUnit,
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
          ),
        },
        {
          label: t('profile.balanceDemo'),
          color: '#ff9f0a',
          bgColor: 'rgba(255,159,10,0.12)',
          borderColor: 'rgba(255,159,10,0.22)',
          val: balance?.demo_balance,
          sub: t('common.virtual'),
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          ),
        },
      ].map(({ label, color, bgColor, borderColor, val, sub, icon }) => (
        <div key={label} style={{ background: 'rgba(10,10,22,0.80)', border: `1px solid ${borderColor}`, borderTop: `1px solid ${color}30`, borderRadius: 16, padding: '15px 14px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
          {/* Header: label left, icon right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>{label}</span>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          </div>
          {/* Big value */}
          {isLoading
            ? <Skel w="80%" h={20} r={4} />
            : <p className="pf-balance-num" style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.5, lineHeight: 1, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtBalance(val)}</p>
          }
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="pf-root"
      style={{
        height: '100dvh',
        background: 'var(--bg)',
        fontFamily: 'var(--font)',
        WebkitFontSmoothing: 'antialiased',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PROFILE_STYLES }} />

      {/* Ambient orbs */}
      <div className="pf-orb pf-orb-1" />
      <div className="pf-orb pf-orb-2" />

      {/* LOGOUT SPLASH */}
      {logoutSplash && (
        <div className="lo-splash">
          <div className="lo-orb lo-orb-1" /><div className="lo-orb lo-orb-2" /><div className="lo-orb lo-orb-3" />
          <div className="lo-icon-wrap">
            <div className="lo-ring" /><div className="lo-ring lo-ring-2" /><div className="lo-ring lo-ring-3" />
            <div className="lo-icon">👋</div>
          </div>
          <div className="lo-text">
            <p className="lo-title">{t('profile.logoutTitle')}</p>
            <p className="lo-sub">{t('profile.logoutSuccess')}<br/>{t('profile.logoutSubtitle')}</p>
          </div>
          <div className="lo-bar-wrap"><div className="lo-bar" /></div>
        </div>
      )}

      {/* MOBILE HEADER */}
      <div className="pf-mob-header" style={{ width: '100%', zIndex: 50, background: 'rgba(8,8,18,0.90)', backdropFilter: 'saturate(150%) blur(24px)', WebkitBackdropFilter: 'saturate(150%) blur(24px)', borderBottom: '0.5px solid rgba(76,175,80,0.20)' }}>
        <div style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setLangSheetOpen(true)} title={t('language.title')} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>🌐</button>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: -0.4 }}>{t('profile.title')}</h1>
          <button onClick={() => loadProfile(true)} disabled={refreshing || isLoading} title={t('profile.refreshProfile')} style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66bb6a', opacity: (refreshing || isLoading) ? 0.4 : 1, transition: 'opacity 0.15s', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: (refreshing || isLoading) ? 'pf-spin 0.8s linear infinite' : 'none' }}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="pf-body">

        {/* LEFT SIDEBAR (desktop) */}
        <div className="pf-left">
          <AvatarHero />

          <div style={{ height: '0.5px', background: 'rgba(76,175,80,0.12)', margin: '0 4px' }} />

          <div>
            <SectionLabel>{t('common.balance')}</SectionLabel>
            <BalanceBlock />
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isAdminUser && (
              <Card>
                <TappableRow
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                  iconBg="linear-gradient(135deg,#F59E0B,#D97706)"
                  label={t('profile.adminPanel')}
                  value={isSuperAdminUser ? 'Super Admin' : 'Admin'}
                  onClick={() => router.push('/admin')}
                  last={!isSuperAdminUser}
                />
                {isSuperAdminUser && (
                  <TappableRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>}
                    iconBg="linear-gradient(135deg,#34c759,#30d158)"
                    label="Kirim Email"
                    onClick={() => setEmailOpen(true)}
                    last
                  />
                )}
              </Card>
            )}
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                iconBg="rgba(255,69,58,0.85)" label={t('profile.logout')} danger onClick={() => setShowLogout(true)} last
              />
            </Card>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.20)', marginTop: 6 }}>STC AutoTrade · v2.0.0</p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="pf-right">

          {/* Desktop header */}
          <div className="pf-desk-header">
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.6, marginBottom: 2 }}>{t('profile.title')}</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>STC AutoTrade</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setLangSheetOpen(true)} style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} title={t('language.title')}>🌐</button>
              <button onClick={() => loadProfile(true)} disabled={refreshing || isLoading} style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66bb6a', opacity: (refreshing || isLoading) ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: (refreshing || isLoading) ? 'pf-spin 0.8s linear infinite' : 'none' }}>
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Refreshing indicator */}
          {refreshing && (
            <div style={{ position: 'fixed', top: 56, right: 16, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, background: 'rgba(10,10,22,0.92)', border: '1px solid rgba(76,175,80,0.28)', backdropFilter: 'blur(14px)', animation: 'pf-up 0.2s ease' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2.2" strokeLinecap="round" style={{ animation: 'pf-spin 0.8s linear infinite' }}>
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <span style={{ fontSize: 12, color: '#66bb6a', fontWeight: 500 }}>{t('common.refresh')}</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', borderRadius: 12, background: 'rgba(255,69,58,0.10)', border: '1px solid rgba(255,69,58,0.24)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
              <span style={{ fontSize: 13, color: '#ff453a', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff453a', opacity: 0.6, padding: 4, flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}

          {/* Mobile-only: hero + balance */}
          <div className="pf-mob-only" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <AvatarHero />
            <div>
              <SectionLabel>{t('common.balance')}</SectionLabel>
              <BalanceBlock />
            </div>
          </div>

          {/* Account info */}
          <div>
            <SectionLabel>{t('profile.accountInfo')}</SectionLabel>
            <Card>
              {isLoading ? (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Skel w={32} h={32} r={9} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Skel w="40%" h={11} /><Skel w="65%" h={14} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <InfoRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
                    label={t('profile.email')} value={profile?.email}
                    verified={profile?.emailVerified}
                  />
                  <InfoRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 5.96 5.96l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>}
                    label={t('profile.phone')} value={profile?.phone || null}
                    verified={profile?.phoneVerified}
                  />
                  <InfoRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                    label={t('profile.country')} value={profile?.country || profile?.registrationCountryIso || null}
                  />
                  {profile?.registeredAt && (
                    <InfoRow
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
                      label={t('profile.joined')} value={formatDate(new Date(profile.registeredAt), language, { day: '2-digit', month: 'long', year: 'numeric' })}
                    />
                  )}
                  <InfoRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                    label={t('profile.birthday')} value={profile?.birthday ? formatDate(new Date(profile.birthday), language, { day: '2-digit', month: 'long', year: 'numeric' }) : null}
                    last
                  />
                </>
              )}
            </Card>
          </div>

          {/* Settings */}
          <div>
            <SectionLabel>{t('profile.settings')}</SectionLabel>
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                iconBg="linear-gradient(135deg,#10B981,#34D399)"
                label={t('language.title')}
                value={t(`language.${{ en:'english', id:'indonesian', ru:'russian', es:'spanish', ms:'malay', hi:'hindi', th:'thai', tr:'turkish' }[language] ?? 'english'}`).toLowerCase()}
                onClick={() => setLangSheetOpen(true)}
              />
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>}
                iconBg="linear-gradient(135deg,#4caf50,#66bb6a)"
                label={t('common.currency')}
                value={currencyLoading ? '…' : `${currency} (${currencyUnit})`}
                onClick={() => currencies.length > 0 && setSheetOpen(true)}
                chevron={currencies.length > 0}
                last
              />
            </Card>
          </div>

          {/* Admin (mobile-only, desktop uses sidebar) */}
          {isAdminUser && (
            <div className="pf-mob-only">
              <SectionLabel>{t('profile.adminPanel')}</SectionLabel>
              <Card>
                <TappableRow
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                  iconBg="linear-gradient(135deg,#F59E0B,#D97706)"
                  label={t('profile.adminPanel')}
                  value={isSuperAdminUser ? 'Super Admin' : 'Admin'}
                  onClick={() => router.push('/admin')}
                  last={!isSuperAdminUser}
                />
                {isSuperAdminUser && (
                  <TappableRow
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>}
                    iconBg="linear-gradient(135deg,#34c759,#30d158)"
                    label="Kirim Email"
                    onClick={() => setEmailOpen(true)}
                    last
                  />
                )}
              </Card>
            </div>
          )}

          {/* Help */}
          <div>
            <SectionLabel>{t('profile.help')}</SectionLabel>
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m.08 4h.01"/></svg>}
                iconBg="linear-gradient(135deg,#5ac8fa,#007AFF)"
                label={t('profile.termsOfService')}
                onClick={() => window.open('https://stockity.id/information/agreement', '_blank')}
              />
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                iconBg="linear-gradient(135deg,#34c759,#30d158)"
                label={t('profile.privacyPolicy')}
                onClick={() => window.open('https://stockity.id/information/privacy', '_blank')}
                last
              />
            </Card>
          </div>

          {/* Mobile-only: logout + version */}
          <div className="pf-mob-only" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                iconBg="rgba(255,69,58,0.85)"
                label={t('profile.logout')}
                danger
                onClick={() => setShowLogout(true)}
                last
              />
            </Card>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.22)', paddingBottom: 4 }}>STC AutoTrade · v2.0.0</p>
          </div>

        </div>
      </div>

      <CurrencySheet open={sheetOpen} onClose={() => setSheetOpen(false)} currencies={currencies} current={currency} onSelect={handleUpdateCurrency} loading={currencyLoading} />
      <LanguageSheet open={langSheetOpen} onClose={() => setLangSheetOpen(false)} />
      <LogoutAlert open={showLogout} onCancel={() => setShowLogout(false)} onConfirm={handleLogout} />
      <EmailComposer open={emailOpen} onClose={() => setEmailOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export default function ProfilePage() {
  return <ProfilePageContent />;
}
