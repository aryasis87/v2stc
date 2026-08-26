'use client';
// Portal publik aktivasi Mode 5st (blitz 5 detik) — STC AutoTrade. UI dari AktivasiShell.
import { Timer } from 'lucide-react';
import AktivasiShell from '@/components/AktivasiShell';

export default function AktivasiBlitz5sPage() {
  return <AktivasiShell cfg={{
    Icon: Timer,
    title: 'Mode 5st',
    tagline: 'Order blitz — hasil keluar dalam 5 detik. Langganan bulanan.',
    price: 'Rp 85.000',
    billing: '/ bulan',
    benefits: [
      'Order blitz — hasil keluar 5 detik',
      'Add-on untuk mode Fastrade FTT',
      'Langganan bulanan',
      'Aktif ~10 menit setelah diverifikasi',
    ],
    apiFeature: 'blitz5s',
    brand: 'STC AutoTrade',
  }} />;
}
