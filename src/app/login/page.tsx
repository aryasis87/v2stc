// src/app/login/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { storage, isSessionValid } from '@/lib/storage';
import { isWhitelisted, updateLastLogin, getRegistrationConfig } from '@/lib/supabaseRepository';
import { LanguageProvider, useLanguage, AVAILABLE_LANGUAGES, COUNTRY_ENTRIES, Language, isWindows } from '@/lib';

type SplashPhase = 'hidden' | 'welcome' | 'verified' | 'out';

// URL mulai OAuth Google Stockity (langsung ke authorization → 302 ke Google).
// Dibuka di in-app WebView (mode 'oauth') → token ditangkap dari DOM callback.
const GOOGLE_OAUTH_URL = 'https://api.stockity.id/passport/oauth2/authorization/google-stockity';

function isNativeApp(): boolean {
  return typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

// ── CSS string extracted so it can be used with dangerouslySetInnerHTML ──────
// Konsep: Apple-minimal (iOS) — latar tenang, input grouped-list, aksen hijau STC.
const LOGIN_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #000000;
    --surface:      rgba(28,28,30,0.72);
    --hairline:     rgba(255,255,255,0.08);
    --border:       rgba(255,255,255,0.10);
    --border-focus: rgba(76,175,80,0.55);
    --text-1:       #ffffff;
    --text-2:       rgba(235,235,245,0.60);
    --text-3:       rgba(235,235,245,0.30);
    --accent:       #4caf50;
    --accent-light: #5cc763;
    --error:        #ff453a;
    --error-bg:     rgba(255,69,58,0.10);
    --success:      #30d158;
    --r-sm:         12px;
    --r-md:         16px;
    --r-lg:         22px;
    --font:         -apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  }

  /* ── Scoped override: variabel login di-hardcode langsung ke elemen ──────
     Selector yang dideklarasikan langsung pada element menang atas nilai
     yang diwariskan (inherited) dari body[data-theme="light"] globals.css.
     Ini menjamin tema login tetap gelap meskipun user pakai light mode.  */
  .lr-page, .splash {
    --bg:           #000000;
    --surface:      rgba(28,28,30,0.72);
    --hairline:     rgba(255,255,255,0.08);
    --border:       rgba(255,255,255,0.10);
    --border-focus: rgba(76,175,80,0.55);
    --text-1:       #ffffff;
    --text-2:       rgba(235,235,245,0.60);
    --text-3:       rgba(235,235,245,0.30);
    --accent:       #4caf50;
    --accent-light: #5cc763;
    --error:        #ff453a;
    --error-bg:     rgba(255,69,58,0.10);
    --success:      #30d158;
    --r-sm:         12px;
    --r-md:         16px;
    --r-lg:         22px;
    --font:         -apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  }

  /* ── Page Shell ─────────────────────────────────────────────────────── */
  .lr-page {
    font-family:     var(--font);
    position:        fixed;
    inset:           0;
    background:      var(--bg);
    display:         flex;
    flex-direction:  column;
    align-items:     center;
    justify-content: center;
    padding-top:     max(24px, env(safe-area-inset-top, 0px));
    padding-left:    20px;
    padding-right:   20px;
    padding-bottom:  max(40px, calc(env(safe-area-inset-bottom, 0px) + 28px));
    overflow-y:      auto;
    overflow-x:      hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: none;
    -webkit-font-smoothing: antialiased;
    scroll-padding-bottom: 24px;
  }
  /* Layar pendek: mulai dari atas agar tidak terpotong */
  @media (max-height: 720px) {
    .lr-page { justify-content: flex-start; padding-top: max(32px, env(safe-area-inset-top, 0px)); }
  }

  /* ── Ambient (latar tenang — 2 gradient halus, tanpa sparkle/dot-grid) ─── */
  .ambient {
    position: fixed; border-radius: 50%; pointer-events: none;
    z-index: 0; filter: blur(100px); opacity: 0.55;
  }
  .amb-1 {
    width: clamp(360px, 82vw, 580px); height: clamp(360px, 82vw, 580px);
    top: -24%; left: 50%;
    background: radial-gradient(circle, rgba(76,175,80,0.16) 0%, transparent 68%);
    animation: amb-drift-c 32s ease-in-out infinite alternate;
  }
  .amb-2 {
    width: clamp(300px, 70vw, 480px); height: clamp(300px, 70vw, 480px);
    bottom: -22%; right: -16%;
    background: radial-gradient(circle, rgba(48,209,88,0.07) 0%, transparent 68%);
    animation: amb-drift 34s ease-in-out infinite alternate;
  }
  /* Centered orb: pertahankan translateX(-50%) selama animasi */
  @keyframes amb-drift-c {
    0%   { transform: translateX(-50%) translateY(0)    scale(1);    }
    100% { transform: translateX(-50%) translateY(3%)   scale(1.05); }
  }
  @keyframes amb-drift {
    0%   { transform: translate(0,0)   scale(1);    }
    100% { transform: translate(-2%,2%) scale(1.05); }
  }

  /* ── Card (centered single column) ──────────────────────────────────── */
  .card {
    position:  relative;
    z-index:   2;
    width:     100%;
    max-width: 392px;
    opacity:   0;
    transform: translateY(12px) scale(0.99);
    animation: rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s forwards;
  }
  @keyframes rise { to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (min-width: 1024px) { .card { max-width: 400px; } }

  /* ── Brand / Logo ───────────────────────────────────────────────────── */
  .brand { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 30px; }
  .brand-logo { display: inline-flex; margin-bottom: 20px; }
  .brand-logo img {
    width: clamp(68px, 19vw, 80px); height: auto;
    border-radius: 21px;
    box-shadow: 0 12px 34px rgba(76,175,80,0.22), 0 0 0 0.5px rgba(255,255,255,0.06);
  }
  .brand-title {
    font-size: clamp(26px, 7.5vw, 31px);
    font-weight: 700; letter-spacing: -0.8px; line-height: 1.05;
    color: #fff; margin-bottom: 8px;
  }
  .brand-title span { color: var(--accent-light); }
  .brand-sub {
    font-size: 15px; color: var(--text-2); font-weight: 400;
    letter-spacing: -0.2px; line-height: 1.45; max-width: 300px;
  }

  /* ── Form Fields — Apple grouped list ───────────────────────────────── */
  .field-group {
    background: var(--surface);
    border: 0.5px solid var(--border);
    border-radius: var(--r-md);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    overflow: hidden;
    margin-bottom: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.40), inset 0 0.5px 0 rgba(255,255,255,0.05);
  }
  .field-row {
    display: flex; align-items: center; position: relative;
    transition: background 0.18s;
  }
  .field-row.active { background: rgba(76,175,80,0.07); }
  .field-icon {
    display: flex; align-items: center; justify-content: center;
    width: 52px; flex-shrink: 0;
    color: var(--accent-light); transition: color 0.18s;
  }
  .field-row.active .field-icon { color: var(--accent-light); }
  .field-sep { height: 0.5px; background: var(--hairline); margin-left: 52px; }

  .fi {
    flex: 1; background: transparent; border: none; outline: none;
    /* Minimum 16px on mobile avoids iOS zoom-in */
    padding: 16px 14px 16px 0;
    font-size: 16px; font-weight: 400;
    color: var(--text-1); font-family: var(--font); letter-spacing: -0.2px;
    -webkit-tap-highlight-color: transparent;
    appearance: none; -webkit-appearance: none;
  }
  .fi::placeholder { color: var(--text-3); }
  .fi[type="password"]              { letter-spacing: 2px; }
  .fi[type="password"]::placeholder { letter-spacing: -0.2px; }

  .eye-btn {
    background: none; border: none; padding: 0 16px; cursor: pointer;
    color: var(--accent-light); display: flex; align-items: center;
    transition: color 0.15s; -webkit-tap-highlight-color: transparent;
    min-width: 48px; justify-content: center;
  }
  .eye-btn:hover { color: var(--accent); }

  /* ── Options row (ingat saya kiri · daftar akun kanan) ──────────────── */
  .opts-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 18px;
  }
  .remember-row {
    display: flex; align-items: center; gap: 10px;
    cursor: pointer; padding-left: 2px; min-width: 0;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .cb-box {
    width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0;
    border: 1.5px solid rgba(255,255,255,0.22);
    background: rgba(255,255,255,0.04);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  }
  .cb-box.checked {
    background: var(--accent); border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(76,175,80,0.35);
  }
  .cb-tick {
    opacity: 0; transform: scale(0.5);
    transition: opacity 0.16s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  .cb-box.checked .cb-tick { opacity: 1; transform: scale(1); }
  .cb-label { font-size: 14.5px; color: var(--text-1); font-weight: 400; letter-spacing: -0.2px; }
  .opts-link {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: var(--font); font-size: 14px; font-weight: 600;
    color: var(--accent-light); cursor: pointer; letter-spacing: -0.2px;
    text-decoration: none; transition: opacity 0.14s;
    -webkit-tap-highlight-color: transparent; white-space: nowrap; flex-shrink: 0;
  }
  .opts-link:hover { opacity: 0.72; }

  /* ── Error banner ───────────────────────────────────────────────────── */
  .err {
    display: flex; align-items: flex-start; gap: 9px;
    background: var(--error-bg); border: 0.5px solid rgba(255,69,58,0.25);
    border-radius: 12px; padding: 11px 14px; margin-bottom: 14px;
    animation: shake 0.36s cubic-bezier(0.36,0.07,0.19,0.97);
  }
  @keyframes shake {
    0%,100%{ transform:translateX(0); } 20%{ transform:translateX(-4px); }
    50%    { transform:translateX(4px); } 80%{ transform:translateX(-3px); }
  }
  .err-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--error); flex-shrink: 0; margin-top: 5px; }
  .err-txt  { font-size: 13px; color: var(--error); line-height: 1.45; }
  .err-whitelist { background: rgba(255,69,58,0.07); border-color: rgba(255,69,58,0.28); }
  .err-whitelist .err-txt { font-size: 13px; font-weight: 500; }

  /* ── Submit button — Apple solid ────────────────────────────────────── */
  .btn {
    width: 100%; height: 52px;
    background: var(--accent);
    border: none; border-radius: var(--r-sm); color: #fff;
    font-size: 16px; font-weight: 600; letter-spacing: -0.2px;
    cursor: pointer; font-family: var(--font);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    position: relative; overflow: hidden;
    box-shadow: 0 4px 16px rgba(76,175,80,0.30);
    transition: background 0.18s, opacity 0.15s, transform 0.12s, box-shadow 0.2s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn:hover:not(:disabled)  { background: var(--accent-light); box-shadow: 0 6px 22px rgba(76,175,80,0.42); }
  .btn:active:not(:disabled) { transform: scale(0.98); opacity: 0.92; }
  .btn:disabled              { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
  .spin {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.30); border-top-color: #fff;
    animation: rot 0.7s linear infinite; flex-shrink: 0;
  }
  @keyframes rot { to { transform: rotate(360deg); } }

  /* ── Divider "atau" + tombol Google ─────────────────────────────────── */
  .or-row { display:flex; align-items:center; gap:12px; margin:16px 0; }
  .or-row::before, .or-row::after { content:''; flex:1; height:0.5px; background:rgba(255,255,255,0.10); }
  .or-row span { font-size:12px; color:var(--text-3); font-weight:500; letter-spacing:0.02em; }
  .gbtn {
    width:100%; height:52px; display:flex; align-items:center; justify-content:center; gap:10px;
    background:#ffffff; border:none; border-radius:var(--r-sm); color:#1f1f1f;
    font-family:var(--font); font-size:15.5px; font-weight:600; letter-spacing:-0.2px; cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,0.25); transition:opacity 0.15s, transform 0.12s;
    -webkit-tap-highlight-color:transparent;
  }
  .gbtn:hover:not(:disabled) { opacity:0.92; }
  .gbtn:active:not(:disabled) { transform:scale(0.98); }
  .gbtn:disabled { opacity:0.5; cursor:not-allowed; box-shadow:none; }

  /* ── Footer links ───────────────────────────────────────────────────── */
  .foot { text-align: center; margin-top: 14px; font-size: 11.5px; color: var(--text-3); }
  .foot-lnk {
    color: var(--accent-light); font-weight: 600; cursor: pointer;
    transition: opacity 0.14s; background: none; border: none;
    padding: 0; font-family: var(--font); font-size: 13px;
  }
  .foot-lnk:hover { opacity: 0.70; }

  /* ── Language Selector ──────────────────────────────────────────────── */
  .lang-selector {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: 14px; z-index: 10;
  }
  @media (min-width: 600px) {
    .lang-selector {
      top: calc(16px + env(safe-area-inset-top, 0px));
      right: 20px;
    }
  }
  .lang-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: 99px;
    background: rgba(28,28,30,0.65);
    border: 0.5px solid rgba(255,255,255,0.10);
    cursor: pointer; font-size: 13px; font-weight: 500;
    color: rgba(255,255,255,0.85);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    transition: all 0.15s; max-width: 150px;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    -webkit-tap-highlight-color: transparent;
  }
  .lang-btn:hover { background: rgba(44,44,46,0.75); border-color: rgba(255,255,255,0.18); }
  .lang-btn-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }
  .lang-dropdown {
    position: absolute; top: calc(100% + 8px); right: 0;
    background: rgba(28,28,30,0.92);
    border: 0.5px solid rgba(255,255,255,0.10);
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.55);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    overflow: hidden; min-width: 184px;
    max-height: min(300px, 60vh);
    overflow-y: auto; animation: lang-fade 0.2s ease;
  }
  @keyframes lang-fade { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
  .lang-option {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; background: transparent;
    border: none; border-bottom: 0.5px solid rgba(255,255,255,0.06);
    cursor: pointer; text-align: left; font-size: 14px;
    color: var(--text-1);
    transition: background 0.15s; font-family: var(--font);
  }
  .lang-option:last-child { border-bottom: none; }
  .lang-option:hover { background: rgba(255,255,255,0.06); }
  .lang-option.active { background: rgba(76,175,80,0.12); color: var(--accent-light); font-weight: 600; }

  /* ── Splash ─────────────────────────────────────────────────────────── */
  .splash {
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: var(--font); -webkit-font-smoothing: antialiased;
    transition: background 1.2s ease; overflow: hidden;
  }
  .splash-welcome  { background: radial-gradient(140% 120% at 50% 0%, #0c1e10 0%, #050a07 70%, #000000 100%); }
  .splash-verified { background: radial-gradient(140% 120% at 50% 0%, #0a1d10 0%, #040906 70%, #000000 100%); }
  .splash-out { animation: sp-fade-out 0.8s ease forwards; pointer-events: none; }
  @keyframes sp-fade-out { from { opacity: 1; } to { opacity: 0; } }
  .splash-enter { opacity: 1; }

  /* Latar splash tenang — 2 orb halus saja (minimal) */
  .sp-orb { position: fixed; border-radius: 50%; pointer-events: none; opacity: 0; transition: opacity 0.6s ease; filter: blur(100px); }
  .splash-welcome .sp-orb, .splash-verified .sp-orb, .splash-out .sp-orb { opacity: 1; }
  .sp-orb-1 { width: 460px; height: 460px; background: radial-gradient(circle, rgba(76,175,80,0.16) 0%, transparent 68%); top: -140px; left: 50%; transform: translateX(-50%); animation: orb-drift-1 14s ease-in-out infinite alternate; }
  .sp-orb-2 { width: 360px; height: 360px; background: radial-gradient(circle, rgba(48,209,88,0.10) 0%, transparent 68%); bottom: -120px; right: -100px; animation: orb-drift-2 16s ease-in-out infinite alternate; }
  @keyframes orb-drift-1 { from{transform:translateX(-50%) translateY(0)} to{transform:translateX(-50%) translateY(24px)} }
  @keyframes orb-drift-2 { from{transform:translate(0,0)} to{transform:translate(-22px,-18px)} }
  .splash-out .sp-orb { animation: orb-fade-out 0.8s ease forwards !important; }
  @keyframes orb-fade-out { from{opacity:1} to{opacity:0} }

  .sp-avatar-wrap { position: relative; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; margin-bottom: 28px; }
  .sp-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(76,175,80,0.25); animation: ring-pulse 2s ease-in-out infinite; }
  .sp-ring-2 { inset: -12px; border-color: rgba(76,175,80,0.14); animation-delay: 0.4s; }
  .sp-ring-3 { inset: -24px; border-color: rgba(76,175,80,0.08); animation-delay: 0.8s; }
  @keyframes ring-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: 0.6; } }
  .sp-avatar {
    width: 90px; height: 90px; border-radius: 28px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10,40,20,0.95);
    border: 1px solid rgba(76,175,80,0.25);
    box-shadow: 0 8px 36px rgba(76,175,80,0.20), 0 2px 8px rgba(0,0,0,0.40);
    animation: avatar-in 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; position: relative; z-index: 1;
  }
  @keyframes avatar-in { from{transform:scale(0.7);opacity:0} to{transform:scale(1);opacity:1} }
  .sp-avatar-verified {
    background: linear-gradient(135deg, #30d158 0%, #25a244 100%);
    border-color: rgba(48,209,88,0.30);
    box-shadow: 0 8px 36px rgba(48,209,88,0.35), 0 2px 8px rgba(0,0,0,0.30);
    animation: avatar-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }
  .sp-ring-verified { border-color: rgba(48,209,88,0.28); }
  .sp-ring-2-verified { border-color: rgba(48,209,88,0.16); }
  .sp-ring-3-verified { border-color: rgba(48,209,88,0.08); }
  @keyframes avatar-pop { 0%{transform:scale(0.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }

  .sp-wave { font-size: 38px; line-height: 1; animation: wave-hand 1.2s ease-in-out infinite; display: inline-block; }
  @keyframes wave-hand { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(-12deg); } 40% { transform: rotate(14deg); } 60% { transform: rotate(-8deg); } 80% { transform: rotate(10deg); } }

  .sp-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(76,175,80,0.12); border: 1px solid rgba(76,175,80,0.22);
    border-radius: 99px; padding: 5px 14px;
    font-size: 12px; font-weight: 600; color: var(--accent-light);
    letter-spacing: 0.02em;
    animation: pill-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.2s both;
  }
  @keyframes pill-in { from{opacity:0;transform:translateY(8px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  .sp-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-light); animation: blink 1.2s ease-in-out infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .sp-text-area { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; overflow: visible; }
  .sp-msg { position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 0 28px; }
  .sp-title { font-size: clamp(26px, 8vw, 34px); font-weight: 800; letter-spacing: -1px; line-height: 1.1; color: #ffffff; }
  .sp-title-success { color: var(--accent-light); }
  .sp-sub { font-size: 14.5px; color: var(--text-2); font-weight: 400; line-height: 1.5; letter-spacing: -0.1px; }
  .sp-name { font-weight: 700; color: var(--accent-light); }
  .sp-msg-welcome-in  { animation: msg-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
  .sp-msg-verified-in { animation: msg-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
  @keyframes msg-in { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }

  .sp-dots { display: flex; gap: 6px; margin-top: 36px; }
  .sp-dot { height: 6px; border-radius: 99px; background: rgba(255,255,255,0.15); transition: width 0.45s cubic-bezier(0.34,1.2,0.64,1), background 0.3s ease; width: 6px; }
  .sp-dot.act { width: 24px; background: var(--accent-light); }
  .sp-dot.act-green { width: 24px; background: #30d158; }

  /* Toast */
  .toast-container { position: fixed; top: 0; left: 0; right: 0; z-index: 300; display: flex; justify-content: center; padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 0; pointer-events: none; }
  .toast { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 16px; background: rgba(52, 199, 89, 0.95); color: #fff; font-size: 14px; font-weight: 500; letter-spacing: -0.15px; box-shadow: 0 8px 32px rgba(52,199,89,0.30), 0 0 0 0.5px rgba(255,255,255,0.2); backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%); pointer-events: auto; max-width: 90vw; animation: toast-in 0.45s cubic-bezier(0.22,1,0.36,1) forwards; }
  .toast.hiding { animation: toast-out 0.35s cubic-bezier(0.4,0,1,1) forwards; }
  @keyframes toast-in { from { opacity: 0; transform: translateY(-20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes toast-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-12px) scale(0.96); } }
  .toast-icon { width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .toast-close { background: none; border: none; color: rgba(255,255,255,0.8); cursor: pointer; padding: 2px; display: flex; align-items: center; margin-left: 4px; transition: color 0.15s; }
  .toast-close:hover { color: #fff; }

  /* ── Page footer ────────────────────────────────────────────────────── */
  .page-footer {
    text-align:center; font-size:11.5px; color:var(--text-3); z-index:2;
    position:absolute; left:0; right:0;
    bottom:max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px));
  }
  .page-footer a { color:var(--text-3); font-weight:500; text-decoration:none; transition:color .14s; }
  .page-footer a:hover { color:var(--text-2); }
`;

// ── Loading step labels (shown below the sign-in button while loading) ─────
type LoginStep = 'idle' | 'auth' | 'whitelist' | 'saving';

function LoginPageContent() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>('idle');
  const [error,    setError]    = useState('');
  const [isWhitelistError, setIsWhitelistError] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [focused,  setFocused]  = useState<'email' | 'password' | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [splash,   setSplash]   = useState<SplashPhase>('hidden');
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [useImg, setUseImg] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('https://wa.me/6285959860015');
  const [errorKey, setErrorKey] = useState(0); // increment to re-trigger shake

  const [toast, setToast] = useState<{ visible: boolean; message: string; hiding: boolean }>({
    visible: false, message: '', hiding: false,
  });

  const emailRef = useRef<HTMLInputElement>(null);
  const passRef  = useRef<HTMLInputElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      setMounted(true);

      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        try {
          const { StatusBar, Style } = await import('@capacitor/status-bar');
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#000000' });
        } catch { /* plugin tidak tersedia */ }
      }

      const savedEmail = await storage.get('stc_remember_email');
      const savedPass  = await storage.get('stc_remember_password');
      if (savedEmail) { setEmail(savedEmail); setRemember(true); }
      if (savedPass)  { setPassword(savedPass); }
      const sessionValid = await isSessionValid();
      if (sessionValid) router.push('/dashboard');
      else {
        // Auto-focus email field after a short delay (better UX on mobile)
        setTimeout(() => { if (!savedEmail) emailRef.current?.focus(); }, 500);
      }

      try {
        const config = await getRegistrationConfig();
        if (config.whatsappHelpUrl?.trim()) {
          setWhatsappUrl(config.whatsappHelpUrl.trim());
        }
      } catch { /* gunakan default */ }

      if (typeof window !== 'undefined') {
        const registerSuccess = sessionStorage.getItem('stc_register_success');
        const registerEmail = sessionStorage.getItem('stc_register_email');
        if (registerSuccess === '1') {
          const msg = registerEmail
            ? t('login.registerSuccess').replace('{email}', registerEmail)
            : t('login.registerSuccessNoEmail');
          setToast({ visible: true, message: msg, hiding: false });
          sessionStorage.removeItem('stc_register_success');
          sessionStorage.removeItem('stc_register_email');
          setTimeout(() => {
            setToast(prev => ({ ...prev, hiding: true }));
            setTimeout(() => setToast({ visible: false, message: '', hiding: false }), 400);
          }, 5000);
        }
      }
    };
    init();
  }, [router]);

  useEffect(() => { setUseImg(isWindows()); }, []);

  // Close lang dropdown on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowLangSelector(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setShowLangSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const check = () => {
      if (emailRef.current?.value && emailRef.current.value !== email)
        setEmail(emailRef.current.value);
      if (passRef.current?.value && passRef.current.value !== password)
        setPassword(passRef.current.value);
    };
    const t1 = setTimeout(check, 100);
    const t2 = setTimeout(check, 400);
    const t3 = setTimeout(check, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [mounted]); // eslint-disable-line

  const runSplash = async (res: { accessToken: string; userId: string; email: string; deviceId: string }) => {
    const { saveUserSession } = await import('@/lib/storage');

    // ── Timezone dari browser (bukan hardcode Asia/Bangkok) ──────────────────
    const browserTz = typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'Asia/Bangkok';

    // ── Step 1: Simpan sesi awal dulu agar api.* bisa baca token dari storage ─
    // currency masih default IDR, akan di-update di Step 4 setelah deteksi selesai
    await saveUserSession({
      authtoken:    res.accessToken,
      userId:       res.userId,
      deviceId:     res.deviceId,
      email:        res.email,
      userTimezone: browserTz,
      userAgent:    typeof window !== 'undefined' ? navigator.userAgent : '',
      deviceType:   'web',
      currency:     'IDR',
      currencyIso:  'Rp',
    });

    let detectedCurrency    = 'IDR';
    let detectedCurrencyIso = 'Rp';
    let detectedCountry     = 'ID';

    // ── Step 2: Deteksi country via backend proxy (bebas CORS) ───────────────
    // api.getProfile() → backend /profile → Stockity, token sudah ada di storage (Step 1)
    // PERBAIKAN: tidak lagi fetchUserProfile langsung ke Stockity (kena CORS di browser)
    try {
      const { api } = await import('@/lib/api');
      const profile = await api.getProfile();
      const countryRaw = profile.country ?? profile.registrationCountryIso ?? 'ID';
      detectedCountry  = (countryRaw as string).toUpperCase();
    } catch (err) {
      console.warn('[runSplash] getProfile gagal, pakai fallback ID:', err);
    }

    // ── Step 3: Simpan stc_account_country ──────────────────────────────────
    // PERBAIKAN: key ini tidak pernah disimpan sebelumnya → dashboard selalu null
    // Dashboard (page.tsx) butuh ini untuk locale Stockity & applyLanguageFromCountry
    if (typeof window !== 'undefined') {
      localStorage.setItem('stc_account_country', detectedCountry);
    }

    // ── Step 4: Deteksi currency via backend proxy (bebas CORS) ─────────────────
    // api.currencyConfig() → stcvps /profile/currency-config → Stockity server-side.
    // Tidak ada direct request ke Stockity dari browser → tidak ada CORS error.
    // Returns CurrencyConfig lengkap (minAmount, quickAmounts, dll).
    // Fallback ke api.balance() jika currency-config endpoint gagal.
    try {
      const { api } = await import('@/lib/api');
      const config = await api.currencyConfig();
      detectedCurrency    = config.currencyIso;   // e.g. "COP"
      detectedCurrencyIso = config.currencyUnit;  // e.g. "Col$"
    } catch {
      // Fallback: api.balance() untuk currency basic jika currency-config gagal
      try {
        const { api } = await import('@/lib/api');
        const bal = await api.balance();
        if (bal.currency) {
          detectedCurrency = bal.currency;
          const { ISO_TO_UNIT } = await import('@/lib/userProfileApi');
          detectedCurrencyIso = ISO_TO_UNIT[detectedCurrency] ?? detectedCurrency;
        }
      } catch { /* tetap default IDR / Rp */ }
    }

    // ── Step 5: Deteksi bahasa dari currency (lebih presisi dari country) ────────
    // Currency ISO sudah tersedia dari Step 4 (detectedCurrency, e.g. "IDR", "USD", "COP").
    // Simpan ke localStorage agar LanguageContext bisa sinkronisasi saat app reload/refresh.
    if (typeof window !== 'undefined') {
      localStorage.setItem('stc_account_currency', detectedCurrency);
    }
    const { currencyToAppLang, countryToAppLang } = await import('@/lib/localeUtils');

    // ✅ FIX LANGUAGE BUG COP/ES: Jika detectedCurrency masih default 'IDR' padahal
    // detectedCountry bukan 'ID', berarti deteksi currency gagal (CORS/error).
    // Gunakan countryToAppLang sebagai fallback agar user COP/CO tetap dapat 'es'.
    let detectedLang: Language;
    if (detectedCurrency === 'IDR' && detectedCountry !== 'ID') {
      detectedLang = countryToAppLang(detectedCountry);
      console.log('[runSplash] Currency masih default IDR, pakai bahasa dari country:', detectedCountry, '->', detectedLang);
    } else {
      detectedLang = currencyToAppLang(detectedCurrency);
      console.log('[runSplash] Bahasa dari currency:', detectedCurrency, '->', detectedLang);
    }

    // detectedCountry tetap dikirim sebagai region (untuk region selector di settings)
    setLanguage(detectedLang, detectedCountry);

    // ── Step 6: Update sesi dengan currency yang benar ───────────────────────
    await saveUserSession({
      authtoken:    res.accessToken,
      userId:       res.userId,
      deviceId:     res.deviceId,
      email:        res.email,
      userTimezone: browserTz,
      userAgent:    typeof window !== 'undefined' ? navigator.userAgent : '',
      deviceType:   'web',
      currency:     detectedCurrency,    // e.g. "COP" / "IDR"
      currencyIso:  detectedCurrencyIso, // e.g. "Col$" / "Rp"
    });

    setSplash('welcome');
    setTimeout(() => setSplash('verified'), 3000);
    setTimeout(() => {
      setSplash('out');
      const htmlSplash = document.getElementById('__stc_splash');
      if (htmlSplash) {
        htmlSplash.style.transition = 'none';
        htmlSplash.style.opacity = '1';
        htmlSplash.style.pointerEvents = 'none';
        htmlSplash.classList.remove('hide');
        requestAnimationFrame(() => { htmlSplash.style.transition = ''; });
      }
      sessionStorage.setItem('stc_from_login', '1');
      setTimeout(() => router.push('/dashboard'), 50);
    }, 7000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = emailRef.current?.value || email;
    const passVal  = passRef.current?.value  || password;

    setLoading(true);
    setError('');
    setIsWhitelistError(false);
    setLoginStep('auth');

    try {
      const res = await api.login(emailVal, passVal);

      setLoginStep('whitelist');
      const allowed = await isWhitelisted(res.email || emailVal);
      if (!allowed) {
        setIsWhitelistError(true);
        throw new Error(t('login.notWhitelisted'));
      }

      setLoginStep('saving');
      if (remember) {
        await storage.set('stc_remember_email',    emailVal);
        await storage.set('stc_remember_password', passVal);
      } else {
        await storage.remove('stc_remember_email');
        await storage.remove('stc_remember_password');
      }

      updateLastLogin(res.email || emailVal).catch(() => {});
      await runSplash(res);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.invalidCredentials'));
      setErrorKey(k => k + 1);
      setLoading(false);
      setLoginStep('idle');
    }
  };

  // ── Login via Google ───────────────────────────────────────────────────────
  // Native: buka authorization URL di in-app WebView (mode 'oauth'); plugin
  // menangkap authtoken dari DOM callback → backend tukar jadi sesi+JWT → splash.
  // Web: penangkapan token diblokir kebijakan origin Stockity → arahkan ke app.
  const handleGoogleLogin = async () => {
    if (loading || gLoading) return;
    setError('');
    setIsWhitelistError(false);

    if (!isNativeApp()) {
      setError('Login Google hanya tersedia di aplikasi STC AutoTrade.');
      setErrorKey(k => k + 1);
      return;
    }

    setGLoading(true);
    try {
      const { stcWebView } = await import('@/plugins/StcWebViewPlugin');
      const r = await stcWebView.open({ url: GOOGLE_OAUTH_URL, mode: 'oauth' });

      // User menutup WebView tanpa menyelesaikan consent.
      if (!r.success || !r.authToken) { setGLoading(false); return; }

      const res = await api.sessionFromToken(r.authToken, r.deviceId);
      setGLoading(false);
      await runSplash(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login Google gagal');
      setErrorKey(k => k + 1);
      setGLoading(false);
    }
  };

  const stepHintLabel = (): string => {
    switch (loginStep) {
      case 'auth':      return t('login.verifyingAccount');
      case 'whitelist': return t('login.checkingWhitelist');
      case 'saving':    return t('login.savingSession');
      default:          return '';
    }
  };

  const canSubmit = !!(
    (email || emailRef.current?.value) &&
    (password || passRef.current?.value)
  );

  const getLanguageName = (code: Language): string => {
    return AVAILABLE_LANGUAGES.find(l => l.code === code)?.nativeName ?? code.toUpperCase();
  };

  // Label tombol Google (i18n ringan — fallback ke EN untuk bahasa lain).
  const orLabel       = language === 'id' ? 'atau' : language === 'es' ? 'o' : language === 'ru' ? 'или' : 'or';
  const googleLabel   = language === 'id' ? 'Lanjut dengan Google'
                      : language === 'es' ? 'Continuar con Google'
                      : language === 'ru' ? 'Войти через Google'
                      : 'Continue with Google';
  const connectingLbl = language === 'id' ? 'Menghubungkan…' : language === 'es' ? 'Conectando…' : language === 'ru' ? 'Подключение…' : 'Connecting…';

  const FlagIcon = ({ lang, size = 16 }: { lang: typeof AVAILABLE_LANGUAGES[0]; size?: number }) => {
    if (useImg) {
      return (
        <Image
          src={lang.flagImg}
          alt={lang.name}
          width={size + 2}
          height={Math.round((size + 2) * 0.75)}
          unoptimized
          style={{ objectFit: 'cover', borderRadius: 2, display: 'inline-block', verticalAlign: 'middle' }}
        />
      );
    }
    return <span style={{ fontSize: size }}>{lang.flag}</span>;
  };

  const dismissToast = () => {
    setToast(prev => ({ ...prev, hiding: true }));
    setTimeout(() => setToast({ visible: false, message: '', hiding: false }), 400);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LOGIN_STYLES }} />

      {/* Splash */}
      {splash !== 'hidden' && (
        <div className={[
          'splash',
          splash === 'welcome'  ? 'splash-enter splash-welcome'  : '',
          splash === 'verified' ? 'splash-verified'              : '',
          splash === 'out'      ? 'splash-out'                   : '',
        ].join(' ')}>
          <div className="sp-orb sp-orb-1" />
          <div className="sp-orb sp-orb-2" />

          <div className="sp-avatar-wrap">
            <div className={`sp-ring ${splash !== 'welcome' ? 'sp-ring-verified' : ''}`} />
            <div className={`sp-ring sp-ring-2 ${splash !== 'welcome' ? 'sp-ring-2-verified' : ''}`} />
            <div className={`sp-ring sp-ring-3 ${splash !== 'welcome' ? 'sp-ring-3-verified' : ''}`} />
            {splash === 'welcome' ? (
              <div className="sp-avatar">
                <span className="sp-wave">👋</span>
              </div>
            ) : (
              <div className="sp-avatar" style={{ background: 'linear-gradient(135deg,#30d158 0%,#25a244 100%)', border: '1px solid rgba(48,209,88,0.30)', boxShadow: '0 4px 22px rgba(48,209,88,0.30)', animation: 'avatar-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            )}
          </div>

          {splash === 'welcome' && (
            <div className="sp-pill" style={{ marginBottom: 18 }}>
              <div className="sp-pill-dot" />
              {t('login.welcomePill')}
            </div>
          )}

          <div className="sp-text-area">
            {splash === 'welcome' && (
              <div className="sp-msg sp-msg-welcome-in">
                <span className="sp-title">{t('login.welcome')}</span>
                <span className="sp-sub">{t('login.welcomeBack')}</span>
              </div>
            )}
            {(splash === 'verified' || splash === 'out') && (
              <div className="sp-msg sp-msg-verified-in">
                <span className="sp-title">{t('login.loginSuccess')}</span>
                <span className="sp-sub">{t('login.redirecting')}</span>
              </div>
            )}
          </div>

          <div className="sp-dots">
            <div className={`sp-dot ${splash === 'welcome' ? 'act' : ''}`} />
            <div className={`sp-dot ${splash === 'verified' || splash === 'out' ? 'act' : ''}`} />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.visible && (
        <div className="toast-container">
          <div className={`toast ${toast.hiding ? 'hiding' : ''}`}>
            <div className="toast-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <span style={{ lineHeight: 1.4 }}>{toast.message}</span>
            <button className="toast-close" onClick={dismissToast} aria-label={t('common.close')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {mounted && (
        <div
          className="lr-page"
          style={splash !== 'hidden' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
        >
          {/* Language Selector */}
          <div className="lang-selector" ref={langRef}>
            <button className="lang-btn" onClick={() => setShowLangSelector(!showLangSelector)}>
              {(() => { const l = AVAILABLE_LANGUAGES.find(l => l.code === language); return l ? <FlagIcon lang={l} size={16} /> : '🌐'; })()}
              <span className="lang-btn-text">{getLanguageName(language)}</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showLangSelector && (
              <div className="lang-dropdown">
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`lang-option ${language === lang.code ? 'active' : ''}`}
                    onClick={() => { setLanguage(lang.code as Language); setShowLangSelector(false); }}
                  >
                    <FlagIcon lang={lang} size={16} />
                    <span>{lang.nativeName}</span>
                    {language === lang.code && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Latar tenang — 2 gradient halus (minimal) */}
          <div className="ambient amb-1" />
          <div className="ambient amb-2" />

          <div className="card">
            {/* Brand */}
            <div className="brand">
              <div className="brand-logo">
                <Image src="/logo.png" alt="STC AutoTrade" width={84} height={84} priority style={{ width: 'clamp(72px, 20vw, 84px)', height: 'auto', borderRadius: 22 }} />
              </div>
              <h1 className="brand-title">{t('login.title')}</h1>
              <p className="brand-sub">{t('login.subtitle')}</p>
            </div>

            <form onSubmit={handleLogin} noValidate>

              {/* Grouped fields — Apple list style */}
              <div className="field-group">
                {/* EMAIL */}
                <div className={`field-row ${focused === 'email' ? 'active' : ''}`}>
                  <div className="field-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <input
                    ref={emailRef}
                    id="email" type="email" className="fi"
                    placeholder={t('login.emailPlaceholder')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused(null)}
                    autoComplete="email" autoCapitalize="none"
                    spellCheck={false} required
                  />
                </div>

                <div className="field-sep" />

                {/* PASSWORD */}
                <div className={`field-row ${focused === 'password' ? 'active' : ''}`}>
                  <div className="field-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <input
                    ref={passRef}
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    className="fi"
                    placeholder={t('login.passwordPlaceholder')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="eye-btn"
                    onClick={() => setShowPass(p => !p)}
                    tabIndex={-1}
                    aria-label={showPass ? t('common.close') : t('common.show')}
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>{/* /field-group */}

              {/* Options row: ingat saya (kiri) · daftar akun (kanan) */}
              <div className="opts-row">
                <label className="remember-row" onClick={() => setRemember(r => !r)}>
                  <div className={`cb-box ${remember ? 'checked' : ''}`}>
                    <svg className="cb-tick" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="cb-label">{t('login.rememberMe')}</span>
                </label>
                <Link href="/register" className="opts-link">
                  {t('login.register')}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </Link>
              </div>

                {/* Error */}
                {error && (
                  <div key={errorKey} className={`err${isWhitelistError ? ' err-whitelist' : ''}`}>
                    {isWhitelistError ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    ) : (
                      <div className="err-dot" />
                    )}
                    <div>
                      <p className="err-txt">{error}</p>
                      {isWhitelistError && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11.5, color: 'var(--accent-light)', fontWeight: 600, marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Hubungi admin
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button type="submit" className="btn" disabled={loading || !canSubmit}
                  style={!canSubmit && !loading ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                >
                  {loading && <div className="spin" />}
                  {loading ? t('login.signingIn') : t('login.signIn')}
                </button>

                {/* Divider */}
                <div className="or-row"><span>{orLabel}</span></div>

                {/* Login via Google */}
                <button type="button" className="gbtn" onClick={handleGoogleLogin} disabled={loading || gLoading}>
                  {gLoading ? (
                    <div className="spin" style={{ borderColor: 'rgba(0,0,0,0.25)', borderTopColor: '#1f1f1f' }} />
                  ) : (
                    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                  )}
                  <span>{gLoading ? connectingLbl : googleLabel}</span>
                </button>

              </form>
          </div>{/* /card */}

          <div className="page-footer">
            © 2026 STC AutoTrade ·{' '}
            <a href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer">{t('login.terms')}</a>
          </div>

        </div>
      )}

    </>
  );
}

export default function LoginPage() {
  return <LoginPageContent />;
}