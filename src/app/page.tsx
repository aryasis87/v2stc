'use client';

// Halaman muka — mengarahkan sesuai keadaan sesi.
//
// DULU: selalu router.replace('/dashboard'). Akibatnya pengguna yang BELUM masuk
// tetap memuat dashboard dulu, lalu dilempar ke /login — tampak seperti dashboard
// "keselip"/berkedip sekejap tepat setelah layar pemuatan. Sekarang sesi diperiksa
// LEBIH DULU, sehingga tujuan pertama langsung benar (tanpa kedip).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isSessionValid } from '@/lib/storage';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ok = false;
      try { ok = await isSessionValid(); } catch { ok = false; }
      if (cancelled) return;
      router.replace(ok ? '/dashboard' : '/login');
    })();
    return () => { cancelled = true; };
  }, [router]);

  return null;
}
