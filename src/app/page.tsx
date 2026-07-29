'use client';

// Halaman muka — mengarahkan ke dashboard.
//
// Sejak jalur web dihidupkan kembali, browser dan aplikasi sama-sama masuk
// lewat dashboard: penjaga sesi yang menentukan apakah pengguna diarahkan ke
// halaman masuk atau langsung ke dashboard. Halaman unduh aplikasi tetap ada
// di /unduh dan ditautkan dari halaman masuk.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
