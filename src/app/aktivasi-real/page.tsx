'use client';
// Portal publik aktivasi Mode REAL — STC AutoTrade. UI dari AktivasiShell.
import { ShieldCheck } from 'lucide-react';
import AktivasiShell from '@/components/AktivasiShell';

export default function AktivasiRealPage() {
  return <AktivasiShell cfg={{
    Icon: ShieldCheck,
    title: 'Mode REAL',
    tagline: 'Buka trading akun REAL di STC AutoTrade. Sekali bayar, akses seterusnya.',
    price: 'Rp 150.000',
    billing: 'sekali bayar',
    benefits: [
      'Trading akun REAL — pakai uang sungguhan',
      'Berlaku di versi web maupun aplikasi',
      'Sekali bayar, tanpa langganan',
      'Diverifikasi admin, aktif ~10 menit',
    ],
    brand: 'STC AutoTrade',
  }} />;
}
