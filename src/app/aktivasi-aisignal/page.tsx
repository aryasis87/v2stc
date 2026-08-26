'use client';
// Portal publik aktivasi AI Signal — STC AutoTrade. UI dari AktivasiShell.
import { Radio } from 'lucide-react';
import AktivasiShell from '@/components/AktivasiShell';

export default function AktivasiAiSignalPage() {
  return <AktivasiShell cfg={{
    Icon: Radio,
    title: 'AI Signal',
    tagline: 'Nyalakan sinyal AI otomatis di STC AutoTrade. Langganan bulanan.',
    price: 'Rp 50.000',
    billing: '/ bulan',
    benefits: [
      'Arah sinyal dihitung oleh AI',
      'Eksekusi otomatis tiap batas menit',
      'Cukup atur nominal & batas berhenti',
      'Aktif ~10 menit setelah diverifikasi',
    ],
    apiFeature: 'aisignal',
    brand: 'STC AutoTrade',
  }} />;
}
