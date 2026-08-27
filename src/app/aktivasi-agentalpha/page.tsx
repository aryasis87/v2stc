'use client';
// Portal publik aktivasi Mode Agent Alpha (agentic reversal-chase) — STC AutoTrade.
import AktivasiShell from '@/components/AktivasiShell';

export default function AktivasiAgentAlphaPage() {
  return <AktivasiShell cfg={{
    iconKey: 'blitz',
    title: 'Agent Alpha',
    tagline: 'Mode agentic eksklusif — dijalankan penuh di server dengan peluang WR hingga 90%.',
    price: 'Rp 850.000',
    billing: '/ bulan',
    benefits: [
      'Peluang WR hingga 90%',
      'Sistem agentic — eksekusi & pembacaan di server',
      'Kejar-balik otomatis tanpa martingale manual',
      'Langganan bulanan (aktif 30 hari)',
      'Aktif ~10 menit setelah diverifikasi',
    ],
    apiFeature: 'agentalpha',
    brand: 'STC AutoTrade',
  }} />;
}
