'use client';

// Halaman DETAIL akun STC — desain "dossier" gelap padat-data (SENGAJA beda
// dari koala yang bergaya iOS Settings terang). Diakses dari Profil → Selengkapnya.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ProfileBalance } from '@/lib/api';
import { getAuthToken } from '@/lib/storage';
import { useLanguage, formatDate } from '@/lib';

const LOCALE: Record<string, string> = { en:'en-US', id:'id-ID', ru:'ru-RU', es:'es-ES', ms:'ms-MY', hi:'hi-IN', th:'th-TH', tr:'tr-TR' };

export default function ProfileDetailPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState<any>(null);
  const [balance, setBalance] = useState<ProfileBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAuthToken();
      if (!token) { router.push('/login'); return; }
      try {
        const [p, b] = await Promise.all([api.getProfile(), api.balance().catch(() => null)]);
        setProfile(p); setBalance(b);
      } catch { /* biarkan kosong */ } finally { setLoading(false); }
    })();
  }, [router]);

  const unit = profile?.currency || balance?.currency || '';
  const money = (n?: number | null) => n == null ? '—' : `${(n / 100).toLocaleString(LOCALE[language] || 'en-US', { maximumFractionDigits: 0 })} ${unit}`.trim();
  const dash = (v?: string | null) => (v && String(v).trim()) ? String(v) : '—';
  const genderTxt = profile?.gender === 'male' ? t('profile.genderMale') : profile?.gender === 'female' ? t('profile.genderFemale') : profile?.gender;
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');

  type Row = { label: string; value: string; mono?: boolean; verified?: boolean };
  const Section = ({ title, rows }: { title: string; rows: Row[] }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
        <span style={{ width: 3, height: 13, borderRadius: 2, background: 'var(--accent, #30d158)' }} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-2, #9aa4b2)' }}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ position: 'relative', padding: '11px 12px 11px 14px', borderRadius: 12, background: 'var(--press, rgba(255,255,255,.04))', border: '1px solid var(--hairline, rgba(255,255,255,.07))', overflow: 'hidden', gridColumn: r.label.length > 16 || r.value.length > 18 ? '1 / -1' : 'auto' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: r.verified === true ? 'var(--success, #30d158)' : r.verified === false ? 'var(--warn, #ffb020)' : 'transparent' }} />
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3, #6b7280)', marginBottom: 4 }}>{r.label}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1, #fff)', fontFamily: r.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {r.value}
              {r.verified != null && (
                <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: r.verified ? 'var(--success, #30d158)' : 'var(--warn, #ffb020)' }}>
                  {r.verified ? '✓ ' + t('profile.verified') : '• ' + t('profile.notVerified')}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #0c0d10)', color: 'var(--text-1, #fff)', paddingBottom: 96 }}>
      {/* Top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface, rgba(18,20,27,.9))', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--hairline, rgba(255,255,255,.07))' }}>
        <button onClick={() => router.back()} aria-label="Kembali" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--press, rgba(255,255,255,.05))', border: '1px solid var(--hairline, rgba(255,255,255,.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-1, #fff)', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.1 }}>{t('profile.accountDetails')}</p>
          {profile?.email && <p style={{ fontSize: 11.5, color: 'var(--text-2, #9aa4b2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</p>}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-3, #6b7280)', padding: '40px 0' }}>…</p>
        ) : (
          <>
            <Section title={t('profile.personalInfo')} rows={[
              { label: t('profile.fullName'), value: dash(fullName) },
              { label: t('profile.nickname'), value: dash(profile?.nickname) },
              { label: t('profile.gender'), value: dash(genderTxt) },
              { label: t('profile.birthday'), value: profile?.birthday ? formatDate(new Date(profile.birthday), language, { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
              { label: t('profile.phone'), value: dash(profile?.phone ? `${profile?.phonePrefix ? '+' + profile.phonePrefix + ' ' : ''}${profile.phone}` : ''), mono: true },
            ]} />
            <Section title={t('profile.accountInfo')} rows={[
              { label: t('profile.id'), value: dash(profile?.id ? String(profile.id) : ''), mono: true },
              { label: t('profile.email'), value: dash(profile?.email) },
              { label: t('profile.country'), value: dash(profile?.countryName || profile?.country || profile?.registrationCountryIso) },
              { label: t('common.currency'), value: dash(unit) },
              { label: t('profile.joined'), value: profile?.registeredAt ? formatDate(new Date(profile.registeredAt), language, { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
            ]} />
            <Section title={t('profile.financialInfo')} rows={[
              { label: t('profile.balanceReal'), value: money(balance?.real_balance), mono: true },
              { label: t('profile.totalDeposit'), value: money(profile?.depositsSum), mono: true },
              { label: t('profile.bonus'), value: money(profile?.bonus), mono: true },
              { label: t('profile.accountTier'), value: profile?.statusGroup ? profile.statusGroup.charAt(0).toUpperCase() + profile.statusGroup.slice(1) : '—' },
            ]} />
            <Section title={t('profile.verificationStatus')} rows={[
              { label: t('profile.emailVerified'), value: dash(profile?.email), verified: !!profile?.emailVerified },
              { label: t('profile.phoneVerified'), value: dash(profile?.phone), verified: !!profile?.phoneVerified },
              { label: t('profile.documentsVerified'), value: t('profile.documentsVerified'), verified: !!profile?.docsVerified },
            ]} />
          </>
        )}
      </div>
    </div>
  );
}
