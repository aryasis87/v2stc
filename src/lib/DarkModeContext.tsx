'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { storage } from './storage';
import ThemeSwitchSplash from '@/components/ThemeSwitchSplash';

const DARK_MODE_KEY = 'stc_dark_mode';

// ── Helper: baca preferensi sistem HP (hanya dipakai sebagai fallback sekunder) ─
function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ✅ App default: selalu dark mode, kecuali user pernah set manual
const APP_DEFAULT_DARK = true;

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  // ✅ Default SELALU dark — tidak ikut preferensi sistem HP.
  //    Jika user belum pernah set manual, app selalu buka dalam dark mode.
  const [isDarkMode, setIsDarkMode] = useState<boolean>(APP_DEFAULT_DARK);

  useEffect(() => {
    // Load saved preference — jika user pernah set manual, pakai itu
    // ✅ FIX: Tidak memanggil syncStatusBar/syncNavBar di sini.
    //    ThemeWrapper di ClientLayout adalah SATU-SATUNYA tempat sync native bars,
    //    sehingga tidak ada race condition antara dua caller yang berebut set StatusBar.
    const loadDarkMode = async () => {
      try {
        const saved = await storage.get(DARK_MODE_KEY);
        // ✅ Jika user belum pernah set manual (null) → pakai APP_DEFAULT_DARK (dark)
        //    Jika sudah pernah set → ikut pilihan user
        const resolved = saved !== null ? saved === 'true' : APP_DEFAULT_DARK;
        setIsDarkMode(resolved);
      } catch {
        // Error storage → tetap dark (default)
        setIsDarkMode(APP_DEFAULT_DARK);
      }
    };
    loadDarkMode();

    // ✅ DIHAPUS: listener sistem HP tidak dipakai lagi.
    //    App punya default sendiri (dark). User bisa ubah manual via toggle settings.
    //    Mengikuti sistem HP menyebabkan konflik saat HP user di light mode.
  }, []);

  // ── Splash transisi ganti tema ────────────────────────────────────────────
  // Hanya muncul saat pengguna MENGGANTI tema (bukan saat preferensi dimuat
  // pertama kali), lalu hilang sendiri setelah animasinya selesai.
  const [splashTo, setSplashTo] = useState<boolean | null>(null);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSplash = (toDark: boolean) => {
    setSplashTo(toDark);
    if (splashTimer.current) clearTimeout(splashTimer.current);
    splashTimer.current = setTimeout(() => setSplashTo(null), 950);
  };
  useEffect(() => () => { if (splashTimer.current) clearTimeout(splashTimer.current); }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      storage.set(DARK_MODE_KEY, String(newValue));
      showSplash(newValue);
      // ✅ FIX: Tidak panggil syncStatusBar di sini.
      //    State update akan trigger useEffect di ThemeWrapper → sync bars sekali.
      return newValue;
    });
  };

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(prev => { if (prev !== value) showSplash(value); return value; });
    storage.set(DARK_MODE_KEY, String(value));
    // ✅ FIX: Tidak panggil syncStatusBar di sini.
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode, setDarkMode }}>
      {children}
      {splashTo !== null && <ThemeSwitchSplash toDark={splashTo} />}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    // ✅ Fallback juga dark (konsisten dengan APP_DEFAULT_DARK)
    return { isDarkMode: APP_DEFAULT_DARK, toggleDarkMode: () => {}, setDarkMode: () => {} };
  }
  return context;
}