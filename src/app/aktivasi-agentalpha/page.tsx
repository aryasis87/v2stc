'use client';
// Portal publik aktivasi Mode Agent Alpha (agentic reversal-chase) — STC AutoTrade.
import AktivasiShell from '@/components/AktivasiShell';

export default function AktivasiAgentAlphaPage() {
  return <AktivasiShell cfg={{
    iconKey: 'blitz',
    title: 'Agent Alpha',
    tagline: 'Mode agentic eksklusif — dijalankan penuh di server dengan peluang WR hingga 85%.',
    price: 'Rp 850.000',
    billing: 'sekali bayar',
    benefits: [
      'Peluang WR hingga 85%',
      'Sistem agentic — eksekusi & pembacaan di server',
      'Kejar-balik otomatis tanpa martingale manual',
      'Aktivasi sekali bayar — akses seterusnya',
      'Aktif ~10 menit setelah diverifikasi',
    ],
    apiFeature: 'agentalpha',
    brand: 'STC AutoTrade',
  }} />;
}
