// src/app/register/page.tsx
// Registrasi inline (tanpa webview) — desain Apple-minimal, konsisten dengan /login.
'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { storage, isSessionValid, saveUserSession } from '@/lib/storage';
import { useLanguage, Language } from '@/lib';

// ── Microcopy khusus register (fallback ke EN bila bahasa tak tersedia) ──────
type RegTxt = {
  title: string; sub: string; confirm: string; confirmPh: string; agree: string;
  submit: string; submitting: string; have: string; signinLink: string;
  mismatch: string; mustAgree: string; shortPass: string;
  successTitle: string; successSub: string;
};
const REG_TEXT: Record<string, RegTxt> = {
  id: {
    title: 'Buat akun baru',
    sub: 'Daftar untuk mulai pakai STC AutoTrade',
    confirm: 'Konfirmasi Password', confirmPh: 'Ulangi password',
    agree: 'Saya setuju dengan Ketentuan & Kebijakan Privasi',
    submit: 'Daftar', submitting: 'Mendaftar…',
    have: 'Sudah punya akun?', signinLink: 'Masuk',
    mismatch: 'Konfirmasi password tidak cocok',
    mustAgree: 'Anda harus menyetujui ketentuan terlebih dahulu',
    shortPass: 'Password minimal 6 karakter',
    successTitle: 'Akun dibuat!', successSub: 'Menyiapkan dashboard…',
  },
  en: {
    title: 'Create your account',
    sub: 'Sign up to start using STC AutoTrade',
    confirm: 'Confirm Password', confirmPh: 'Repeat password',
    agree: 'I agree to the Terms & Privacy Policy',
    submit: 'Sign Up', submitting: 'Signing up…',
    have: 'Already have an account?', signinLink: 'Sign In',
    mismatch: 'Password confirmation does not match',
    mustAgree: 'You must agree to the terms first',
    shortPass: 'Password must be at least 6 characters',
    successTitle: 'Account created!', successSub: 'Preparing dashboard…',
  },
};
const regText = (lang: string): RegTxt => REG_TEXT[lang] ?? REG_TEXT.en;

const REGISTER_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .rg-page, .rg-splash {
    --bg:#000000; --surface:rgba(28,28,30,0.72); --hairline:rgba(255,255,255,0.08);
    --border:rgba(255,255,255,0.10); --text-1:#ffffff; --text-2:rgba(235,235,245,0.60);
    --text-3:rgba(235,235,245,0.30); --accent:#4caf50; --accent-light:#5cc763;
    --error:#ff453a; --error-bg:rgba(255,69,58,0.10);
    --r-sm:12px; --r-md:16px;
    --font:-apple-system,'SF Pro Display','SF Pro Text',BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  }
  .rg-page {
    font-family:var(--font); position:fixed; inset:0; background:var(--bg);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding-top:max(24px,env(safe-area-inset-top,0px)); padding-left:20px; padding-right:20px;
    padding-bottom:max(40px,calc(env(safe-area-inset-bottom,0px) + 28px));
    overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
    overscroll-behavior-y:none; -webkit-font-smoothing:antialiased;
  }
  @media (max-height:760px){ .rg-page{ justify-content:flex-start; padding-top:max(32px,env(safe-area-inset-top,0px)); } }

  .rg-ambient { position:fixed; border-radius:50%; pointer-events:none; z-index:0; filter:blur(100px); opacity:0.55; }
  .rg-amb-1 { width:clamp(360px,82vw,580px); height:clamp(360px,82vw,580px); top:-24%; left:50%;
    background:radial-gradient(circle,rgba(76,175,80,0.16) 0%,transparent 68%);
    animation:rg-drift-c 32s ease-in-out infinite alternate; }
  .rg-amb-2 { width:clamp(300px,70vw,480px); height:clamp(300px,70vw,480px); bottom:-22%; right:-16%;
    background:radial-gradient(circle,rgba(48,209,88,0.07) 0%,transparent 68%);
    animation:rg-drift 34s ease-in-out infinite alternate; }
  @keyframes rg-drift-c { 0%{transform:translateX(-50%) translateY(0) scale(1)} 100%{transform:translateX(-50%) translateY(3%) scale(1.05)} }
  @keyframes rg-drift { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(-2%,2%) scale(1.05)} }

  .rg-card { position:relative; z-index:2; width:100%; max-width:392px; opacity:0;
    transform:translateY(12px) scale(0.99); animation:rg-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s forwards; }
  @keyframes rg-rise { to { opacity:1; transform:translateY(0) scale(1); } }
  @media (min-width:1024px){ .rg-card{ max-width:400px; } }

  .rg-brand { display:flex; flex-direction:column; align-items:center; text-align:center; margin-bottom:28px; }
  .rg-logo { display:inline-flex; margin-bottom:18px; }
  .rg-logo img { width:clamp(64px,18vw,76px); height:auto; border-radius:20px;
    box-shadow:0 12px 34px rgba(76,175,80,0.22),0 0 0 0.5px rgba(255,255,255,0.06); }
  .rg-title { font-size:clamp(25px,7vw,30px); font-weight:700; letter-spacing:-0.8px; line-height:1.05; color:#fff; margin-bottom:8px; }
  .rg-title span { color:var(--accent-light); }
  .rg-sub { font-size:15px; color:var(--text-2); font-weight:400; letter-spacing:-0.2px; line-height:1.45; max-width:300px; }

  .rg-group { background:var(--surface); border:0.5px solid var(--border); border-radius:var(--r-md);
    backdrop-filter:blur(24px) saturate(160%); -webkit-backdrop-filter:blur(24px) saturate(160%);
    overflow:hidden; margin-bottom:16px; box-shadow:0 8px 32px rgba(0,0,0,0.40),inset 0 0.5px 0 rgba(255,255,255,0.05); }
  .rg-row { display:flex; align-items:center; position:relative; transition:background 0.18s; }
  .rg-row.active { background:rgba(76,175,80,0.07); }
  .rg-icon { display:flex; align-items:center; justify-content:center; width:52px; flex-shrink:0; color:var(--accent-light); transition:color 0.18s; }
  .rg-row.active .rg-icon { color:var(--accent-light); }
  .rg-sep { height:0.5px; background:var(--hairline); margin-left:52px; }
  .rg-fi { flex:1; background:transparent; border:none; outline:none; padding:16px 14px 16px 0;
    font-size:16px; font-weight:400; color:var(--text-1); font-family:var(--font); letter-spacing:-0.2px;
    -webkit-tap-highlight-color:transparent; appearance:none; -webkit-appearance:none; }
  .rg-fi::placeholder { color:var(--text-3); }
  .rg-fi[type="password"] { letter-spacing:2px; }
  .rg-fi[type="password"]::placeholder { letter-spacing:-0.2px; }
  .rg-eye { background:none; border:none; padding:0 16px; cursor:pointer; color:var(--accent-light);
    display:flex; align-items:center; min-width:48px; justify-content:center; transition:color 0.15s; -webkit-tap-highlight-color:transparent; }
  .rg-eye:hover { color:var(--accent-light); }

  .rg-agree { display:flex; align-items:flex-start; gap:10px; margin-bottom:18px; cursor:pointer;
    padding-left:2px; -webkit-tap-highlight-color:transparent; user-select:none; }
  .rg-cb { width:22px; height:22px; border-radius:7px; flex-shrink:0; margin-top:1px;
    border:1.5px solid rgba(255,255,255,0.22); background:rgba(255,255,255,0.04);
    display:flex; align-items:center; justify-content:center; transition:all 0.18s; }
  .rg-cb.on { background:var(--accent); border-color:var(--accent); box-shadow:0 2px 8px rgba(76,175,80,0.35); }
  .rg-tick { opacity:0; transform:scale(0.5); transition:opacity 0.16s,transform 0.2s cubic-bezier(0.34,1.56,0.64,1); }
  .rg-cb.on .rg-tick { opacity:1; transform:scale(1); }
  .rg-agree-txt { font-size:13.5px; color:var(--text-2); font-weight:400; letter-spacing:-0.2px; line-height:1.45; }
  .rg-agree-txt a { color:var(--accent-light); font-weight:600; text-decoration:none; }

  .rg-err { display:flex; align-items:flex-start; gap:9px; background:var(--error-bg);
    border:0.5px solid rgba(255,69,58,0.25); border-radius:12px; padding:11px 14px; margin-bottom:14px;
    animation:rg-shake 0.36s cubic-bezier(0.36,0.07,0.19,0.97); }
  @keyframes rg-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 50%{transform:translateX(4px)} 80%{transform:translateX(-3px)} }
  .rg-err-dot { width:5px; height:5px; border-radius:50%; background:var(--error); flex-shrink:0; margin-top:5px; }
  .rg-err-txt { font-size:13px; color:var(--error); line-height:1.45; }

  .rg-btn { width:100%; height:52px; background:var(--accent); border:none; border-radius:var(--r-sm);
    color:#fff; font-size:16px; font-weight:600; letter-spacing:-0.2px; cursor:pointer; font-family:var(--font);
    display:flex; align-items:center; justify-content:center; gap:8px; position:relative; overflow:hidden;
    box-shadow:0 4px 16px rgba(76,175,80,0.30); transition:background 0.18s,opacity 0.15s,transform 0.12s,box-shadow 0.2s; -webkit-tap-highlight-color:transparent; }
  .rg-btn:hover:not(:disabled) { background:var(--accent-light); box-shadow:0 6px 22px rgba(76,175,80,0.42); }
  .rg-btn:active:not(:disabled) { transform:scale(0.98); opacity:0.92; }
  .rg-btn:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  .rg-spin { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,0.30); border-top-color:#fff; animation:rg-rot 0.7s linear infinite; flex-shrink:0; }
  @keyframes rg-rot { to { transform:rotate(360deg); } }

  .rg-bottom { text-align:center; margin-top:22px; padding-top:20px; border-top:0.5px solid rgba(255,255,255,0.08);
    font-size:14.5px; color:var(--text-2); letter-spacing:-0.2px; }
  .rg-bottom a { color:var(--accent-light); font-weight:600; text-decoration:none; transition:opacity 0.14s; }
  .rg-bottom a:hover { opacity:0.7; }

  /* Copyright pinned ke bawah — sinkron dengan /login */
  .rg-footer {
    position:absolute; left:0; right:0;
    bottom:max(16px, calc(env(safe-area-inset-bottom,0px) + 12px));
    text-align:center; font-size:11.5px; color:var(--text-3); z-index:2;
  }
  .rg-footer a { color:var(--text-3); font-weight:500; text-decoration:none; transition:color .14s; }
  .rg-footer a:hover { color:var(--text-2); }

  /* Success splash */
  .rg-splash { position:fixed; inset:0; z-index:200; display:flex; flex-direction:column;
    align-items:center; justify-content:center; font-family:var(--font);
    background:radial-gradient(140% 120% at 50% 0%,#0c1e10 0%,#050a07 70%,#000000 100%);
    animation:rg-fade 0.4s ease; }
  @keyframes rg-fade { from{opacity:0} to{opacity:1} }
  .rg-check { width:96px; height:96px; border-radius:30px; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg,#30d158 0%,#25a244 100%); border:1px solid rgba(48,209,88,0.30);
    box-shadow:0 14px 40px rgba(48,209,88,0.30); margin-bottom:26px; animation:rg-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  @keyframes rg-pop { 0%{transform:scale(0.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
  .rg-s-title { font-size:clamp(24px,7vw,30px); font-weight:700; letter-spacing:-0.6px; color:#fff; margin-bottom:8px; }
  .rg-s-sub { font-size:14.5px; color:var(--text-2); }
`;

function RegisterContent() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const txt = regText(language);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [agree, setAgree]       = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [focused, setFocused]   = useState<'email' | 'password' | 'confirm' | null>(null);
  const [mounted, setMounted]   = useState(false);
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    setMounted(true);
    (async () => {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        try {
          const { StatusBar, Style } = await import('@capacitor/status-bar');
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#000000' });
        } catch { /* plugin tidak tersedia */ }
      }
      if (await isSessionValid()) router.push('/dashboard');
    })();
  }, [router]);

  const showError = (msg: string) => {
    setError(msg);
    setErrorKey(k => k + 1);
  };

  // Simpan sesi + deteksi currency/bahasa, lalu ke dashboard (mirip alur login).
  const finishRegister = async (res: { accessToken: string; userId: string; email: string; deviceId: string }) => {
    const browserTz = typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Bangkok';
    const ua = typeof window !== 'undefined' ? navigator.userAgent : '';

    const base = {
      authtoken: res.accessToken, userId: res.userId, deviceId: res.deviceId,
      email: res.email, userTimezone: browserTz, userAgent: ua, deviceType: 'web' as const,
    };
    await saveUserSession({ ...base, currency: 'IDR', currencyIso: 'Rp' });

    let cur = 'IDR', iso = 'Rp';
    try {
      const config = await api.currencyConfig();
      cur = config.currencyIso; iso = config.currencyUnit;
    } catch { /* tetap default IDR */ }

    if (typeof window !== 'undefined') {
      localStorage.setItem('stc_account_currency', cur);
    }
    try {
      const { currencyToAppLang } = await import('@/lib/localeUtils');
      setLanguage(currencyToAppLang(cur) as Language);
    } catch { /* abaikan */ }

    await saveUserSession({ ...base, currency: cur, currencyIso: iso });

    if (typeof window !== 'undefined') sessionStorage.setItem('stc_from_login', '1');
    setTimeout(() => router.push('/dashboard'), 1400);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) { showError(txt.shortPass); return; }
    if (password !== confirm) { showError(txt.mismatch); return; }
    if (!agree) { showError(txt.mustAgree); return; }

    setLoading(true);
    try {
      const res = await api.register(email.trim(), password, 'IDR');
      setSuccess(true);
      await finishRegister(res);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Registrasi gagal');
      setLoading(false);
    }
  };

  const canSubmit = !!(email && password && confirm && agree);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REGISTER_STYLES }} />

      {success && (
        <div className="rg-splash">
          <div className="rg-check">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div className="rg-s-title">{txt.successTitle}</div>
          <div className="rg-s-sub">{txt.successSub}</div>
        </div>
      )}

      {mounted && (
        <div className="rg-page" style={success ? { visibility: 'hidden' } : undefined}>
          <div className="rg-ambient rg-amb-1" />
          <div className="rg-ambient rg-amb-2" />

          <div className="rg-card">
            <div className="rg-brand">
              <div className="rg-logo">
                <Image src="/logo.png" alt="STC AutoTrade" width={76} height={76} priority style={{ width: 'clamp(64px, 18vw, 76px)', height: 'auto', borderRadius: 20 }} />
              </div>
              <h1 className="rg-title">{txt.title}</h1>
              <p className="rg-sub">{txt.sub}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="rg-group">
                {/* EMAIL */}
                <div className={`rg-row ${focused === 'email' ? 'active' : ''}`}>
                  <div className="rg-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <input
                    type="email" className="rg-fi" placeholder={t('login.emailPlaceholder')}
                    value={email} onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                    autoComplete="email" autoCapitalize="none" spellCheck={false} required
                  />
                </div>

                <div className="rg-sep" />

                {/* PASSWORD */}
                <div className={`rg-row ${focused === 'password' ? 'active' : ''}`}>
                  <div className="rg-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'} className="rg-fi" placeholder={t('login.passwordPlaceholder')}
                    value={password} onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                    autoComplete="new-password" required
                  />
                  <button type="button" className="rg-eye" tabIndex={-1} onClick={() => setShowPass(p => !p)} aria-label="toggle">
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>

                <div className="rg-sep" />

                {/* CONFIRM */}
                <div className={`rg-row ${focused === 'confirm' ? 'active' : ''}`}>
                  <div className="rg-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M9 16l2 2 4-4"/>
                    </svg>
                  </div>
                  <input
                    type={showConf ? 'text' : 'password'} className="rg-fi" placeholder={txt.confirmPh}
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)}
                    autoComplete="new-password" required
                  />
                  <button type="button" className="rg-eye" tabIndex={-1} onClick={() => setShowConf(p => !p)} aria-label="toggle">
                    {showConf ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Agree */}
              <label className="rg-agree" onClick={() => setAgree(a => !a)}>
                <div className={`rg-cb ${agree ? 'on' : ''}`}>
                  <svg className="rg-tick" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="rg-agree-txt">
                  {txt.agree}{' '}
                  <a href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    {t('login.terms')}
                  </a>
                </span>
              </label>

              {error && (
                <div key={errorKey} className="rg-err">
                  <div className="rg-err-dot" />
                  <p className="rg-err-txt">{error}</p>
                </div>
              )}

              <button type="submit" className="rg-btn" disabled={loading || !canSubmit}>
                {loading && <div className="rg-spin" />}
                {loading ? txt.submitting : txt.submit}
              </button>
            </form>

            <div className="rg-bottom">
              {txt.have} <Link href="/login">{txt.signinLink}</Link>
            </div>
          </div>

          <div className="rg-footer">
            © 2026 STC AutoTrade ·{' '}
            <a href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer">{t('login.terms')}</a>
          </div>
        </div>
      )}
    </>
  );
}

export default function RegisterPage() {
  // LanguageProvider sudah disediakan oleh ClientLayout (route publik), seperti /login.
  return <RegisterContent />;
}
