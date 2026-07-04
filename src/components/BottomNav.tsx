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

/**
 * BottomNav — redesign kompetisi: floating dock.
 * Bukan bar full-width menempel di tepi, melainkan "dock" mengambang
 * dengan rounded penuh, blur, hairline border, dan shadow lembut —
 * konsisten dengan design system dashboard (hairline + emerald accent).
 * Halaman sudah memberi padding-bottom 88px+safe-area, jadi dock
 * (tinggi ~56 + offset 10) tidak pernah menutupi konten.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { isDarkMode } = useDarkMode();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  // Sembunyikan nav di halaman webview agar konten full-screen
  if (pathname === '/webview') return null;

  const theme = isDarkMode
    ? {
        dockBg:     'rgba(19,20,24,0.88)',
        dockBorder: '1px solid rgba(255,255,255,0.09)',
        dockShadow: '0 12px 32px -8px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.35)',
        itemColor:  'rgba(161,168,179,0.60)',
        activeColor:'#2DD4A7',
        activePill: 'rgba(45,212,167,0.13)',
      }
    : {
        dockBg:     'rgba(255,255,255,0.90)',
        dockBorder: '1px solid rgba(2,6,23,0.08)',
        dockShadow: '0 12px 32px -12px rgba(15,23,42,0.22), 0 2px 8px rgba(15,23,42,0.06)',
        itemColor:  '#94A3B8',
        activeColor:'#059669',
        activePill: 'rgba(5,150,105,0.09)',
      };

  // Dispatch loading event — hanya jika berpindah ke halaman berbeda
  const handleNavClick = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href + '/');
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
          gap: 3px;
          flex: 1;
          min-width: 0;
          padding: 7px 2px 6px;
          border-radius: 18px;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.22s ease, transform 0.18s ease;
          position: relative;
        }
        .bnav-item:active { transform: scale(0.94); }
        .bnav-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.01em;
          line-height: 1;
          white-space: nowrap;
          transition: color 0.2s ease;
        }
      `}</style>

      <div
        suppressHydrationWarning
        style={{
          position: 'fixed',
          bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          left: 12,
          right: 12,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <nav
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            maxWidth: 430,
            height: 56,
            padding: 5,
            gap: 2,
            borderRadius: 999,
            background: theme.dockBg,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: theme.dockBorder,
            boxShadow: theme.dockShadow,
            transition: 'background 0.3s ease',
          }}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            const col = isActive ? theme.activeColor : theme.itemColor;

            return (
              <Link
                key={href}
                href={href}
                className="bnav-item"
                style={{
                  color: col,
                  background: isActive ? theme.activePill : 'transparent',
                }}
                onClick={() => handleNavClick(href)}
              >
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="bnav-label" style={{ color: col }}>
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
