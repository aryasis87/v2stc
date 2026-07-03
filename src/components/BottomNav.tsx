'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, History, Globe, User } from 'lucide-react';
import { useDarkMode } from '@/lib/DarkModeContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/history',   label: 'Riwayat',   icon: History },
  { href: '/webview',   label: 'Trade',     icon: Globe },
  { href: '/profile',   label: 'Profil',    icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isDarkMode } = useDarkMode();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  // Sembunyikan nav di halaman webview agar konten full-screen
  if (pathname === '/webview') return null;

  // Nav mengikuti tema aplikasi di SEMUA halaman (dashboard, history, profile).
  // Profile kini theme-aware penuh di semua breakpoint, jadi tidak ada pengecualian.
  const useDarkNav = isDarkMode;

  // Accent emerald + inactive grey, sinkron dgn palet dashboard (getColors).
  const theme = useDarkNav
    ? {
        navBg:      'rgba(15,16,18,0.92)',
        navBorder:  '0.5px solid rgba(255,255,255,0.08)',
        itemColor:  'rgba(161,168,179,0.55)',
        activeColor:'#2DD4A7',
        activePill: 'rgba(45,212,167,0.14)',
        labelColor: (active: boolean) => active ? '#2DD4A7' : 'rgba(161,168,179,0.55)',
      }
    : {
        navBg:      'rgba(255,255,255,0.92)',
        navBorder:  '0.5px solid #E6E8EB',
        itemColor:  '#94A3B8',
        activeColor:'#059669',
        activePill: 'rgba(5,150,105,0.10)',
        labelColor: (active: boolean) => active ? '#059669' : '#94A3B8',
      };

  // ── Dispatch loading event — hanya jika berpindah ke halaman berbeda ──────
  const handleNavClick = (href: string) => {
    const isActive =
      pathname === href || pathname.startsWith(href + '/');
    if (!isActive) {
      window.dispatchEvent(new CustomEvent('stc:navstart'));
    }
  };

  return (
    <>
      <style>{`
        .bnav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          flex: 1;
          padding: 8px 4px 6px;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.15s ease;
          position: relative;
        }
        .bnav-item:active { opacity: 0.6; }
        .bnav-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 30px;
          padding: 0 18px;
          border-radius: 999px;
          transition: background 0.22s ease, transform 0.22s ease;
        }
        .bnav-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
          transition: color 0.2s ease;
        }
      `}</style>

      <div
        suppressHydrationWarning
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: theme.navBg,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          borderTop: theme.navBorder,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: useDarkNav
            ? '0 -0.5px 0 rgba(255,255,255,0.06)'
            : '0 -0.5px 0 rgba(2,6,23,0.06)',
          transition: 'background 0.3s ease',
        }}
      >
        <nav style={{ display: 'flex', alignItems: 'stretch', height: 56 }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            const col = isActive ? theme.activeColor : theme.itemColor;

            return (
              <Link
                key={href}
                href={href}
                className="bnav-item"
                style={{ color: col }}
                onClick={() => handleNavClick(href)}
              >
                <span
                  className="bnav-icon-wrap"
                  style={{
                    background: isActive ? theme.activePill : 'transparent',
                    transform: isActive ? 'translateY(-1px)' : 'none',
                  }}
                >
                  <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                <span className="bnav-label" style={{ color: theme.labelColor(isActive) }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}