'use client';

// Halaman Panduan Trading.
//
// Sebelumnya halaman ini membuka Stockity di peramban bawaan. Isinya diganti
// panduan singkat karena pengguna lebih membutuhkan pegangan sebelum
// menjalankan bot daripada pintasan ke platform — tautan ke Stockity tetap
// disediakan di bagian bawah.

import { useState } from 'react';

const TRADE_URL = 'https://stockity.id';

type Bagian = {
  id: string;
  judul: string;
  ringkas: string;
  isi: { h: string; p: string }[];
};

const BAGIAN: Bagian[] = [
  {
    id: 'dasar',
    judul: 'Yang perlu dipahami lebih dulu',
    ringkas: 'Dua angka yang menentukan hasil jangka panjang Anda',
    isi: [
      {
        h: 'Menang 50% tetap rugi',
        p: 'Saat kalah, seluruh nominal order hilang. Saat menang, yang kembali hanya sebagian — umumnya sekitar 80%. Karena itu menang sama seringnya dengan kalah bukanlah keadaan seimbang, melainkan merugi.',
      },
      {
        h: 'Ambang impasnya sekitar 56%',
        p: 'Pada pembayaran 80%, Anda perlu menang sekitar 56% dari seluruh order sekadar untuk kembali modal. Setiap target keuntungan yang tidak memperhitungkan angka ini sedang melewatkan bagian terpenting.',
      },
      {
        h: 'Deret kalah pasti datang',
        p: 'Kalah lima kali berturut-turut muncul kira-kira sekali dalam 32 rangkaian. Dalam ratusan order, itu bukan kemungkinan — hanya soal kapan. Modal Anda harus sanggup melewatinya.',
      },
    ],
  },
  {
    id: 'modal',
    judul: 'Mengatur modal',
    ringkas: 'Yang menentukan bukan besarnya, tapi daya tahannya',
    isi: [
      {
        h: 'Tetapkan ukuran order sebagai persentase',
        p: 'Umumnya 1–5% dari modal untuk satu order. Persentase menyesuaikan diri saat modal naik atau turun, sehingga daya tahan Anda tetap sama. Nominal tetap justru diam-diam membesar risikonya ketika modal menyusut.',
      },
      {
        h: 'Hitung daya tahannya',
        p: 'Order 2% dari modal berarti Anda sanggup salah 50 kali. Order 25% hanya sanggup 4 kali — dan deret kalah empat beruntun adalah kejadian yang wajar dalam sepekan.',
      },
      {
        h: 'Jangan perbesar order setelah kalah',
        p: 'Cara itu menukar banyak kemenangan kecil dengan satu kekalahan besar. Terasa berhasil di awal justru karena deret panjang memang jarang — dan rasa berhasil itu terbentuk tepat sebelum kejadian yang menghapusnya.',
      },
    ],
  },
  {
    id: 'mode',
    judul: 'Memilih mode',
    ringkas: 'Enam cara menjalankan aturan Anda',
    isi: [
      {
        h: 'Signal',
        p: 'Anda menuliskan sendiri jam dan arahnya, bot mengeksekusi tepat pada jam tersebut. Cocok bila Anda sudah punya daftar sinyal.',
      },
      {
        h: 'Fastrade FTT & CTC',
        p: 'Bot membandingkan harga dua menit berturut-turut lalu mengikuti arah yang menang. CTC memakai arah kebalikannya, untuk pasar yang sering berbalik.',
      },
      {
        h: 'AI Signal',
        p: 'Bot menentukan arah sendiri lalu langsung mengeksekusi. Anda cukup mengatur nominal dan batas berhenti.',
      },
      {
        h: 'Indicator & Momentum',
        p: 'Indicator membaca indikator teknikal seperti RSI. Momentum menunggu pola candle tertentu — ordernya lebih jarang tetapi lebih terpilih.',
      },
    ],
  },
  {
    id: 'batas',
    judul: 'Memasang batas',
    ringkas: 'Bagian yang paling sering diabaikan, dan paling menentukan',
    isi: [
      {
        h: 'Batas kerugian harian',
        p: 'Angka pasti yang menghentikan sesi hari itu. Batas ini yang memastikan hari buruk tetap menjadi hari buruk, bukan bencana.',
      },
      {
        h: 'Batas keuntungan harian',
        p: 'Sama pentingnya dan lebih sering dilupakan. Tanpa titik berhenti di atas, keuntungan cenderung dikembalikan ke pasar pada sesi yang sama.',
      },
      {
        h: 'Tetapkan sebelum sesi dimulai',
        p: 'Aturan yang dibuat saat tenang jauh lebih masuk akal daripada yang disusun saat sedang menanggung rugi. Biarkan bot yang menjalankannya, supaya tidak bisa ditawar saat Anda tertekan.',
      },
    ],
  },
  {
    id: 'demo',
    judul: 'Mulai dari mode demo',
    ringkas: 'Ukurannya bukan saldo naik, melainkan aturan yang ditaati',
    isi: [
      {
        h: 'Samakan dengan rencana nyata',
        p: 'Setel saldo demo sebesar modal yang benar-benar akan dipakai, dan jalankan ukuran order yang sama. Kerugian yang tidak terasa tidak melatih apa pun.',
      },
      {
        h: 'Kumpulkan cukup banyak order',
        p: 'Sepuluh order tidak membuktikan apa pun. Pindah ke dana nyata setelah Anda bisa menjalankan aturan yang sama sepanjang rangkaian panjang, termasuk saat deret kalah datang.',
      },
      {
        h: 'Catat alasan, bukan hanya hasil',
        p: 'Satu kalimat cukup: kenapa Anda mengambil order itu. Catatan inilah yang mengubah pengalaman menjadi keterampilan.',
      },
    ],
  },
];

export default function PanduanPage() {
  const [terbuka, setTerbuka] = useState<string | null>('dasar');

  return (
    <div style={S.halaman}>
      <div style={S.wadah}>
        <header style={S.kepala}>
          <h1 style={S.judul}>Panduan Trading</h1>
          <p style={S.sub}>
            Ringkasan singkat sebelum menjalankan bot. Membaca ini lebih dulu menghemat
            lebih banyak daripada strategi mana pun.
          </p>
        </header>

        {BAGIAN.map((b) => {
          const buka = terbuka === b.id;
          return (
            <section key={b.id} style={S.kartu}>
              <button
                type="button"
                onClick={() => setTerbuka(buka ? null : b.id)}
                style={S.tombolBagian}
                aria-expanded={buka}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span style={S.judulBagian}>{b.judul}</span>
                  <span style={S.ringkasBagian}>{b.ringkas}</span>
                </span>
                <span style={{ ...S.panah, transform: buka ? 'rotate(180deg)' : 'none' }}>⌄</span>
              </button>

              {buka && (
                <div style={S.isi}>
                  {b.isi.map((i) => (
                    <div key={i.h} style={S.butir}>
                      <p style={S.butirJudul}>{i.h}</p>
                      <p style={S.butirTeks}>{i.p}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <div style={S.catatan}>
          <p style={S.catatanTeks}>
            Bot menjalankan aturan Anda lebih cepat dan lebih konsisten — tetapi ia tidak
            memperbaiki aturan yang keliru. Aturan yang salah akan diulang dengan rapi.
          </p>
        </div>

        <a href={TRADE_URL} target="_blank" rel="noopener noreferrer" style={S.tautan}>
          Buka Stockity di peramban
        </a>

        <p style={S.risiko}>
          Trading mengandung risiko kehilangan modal. Gunakan hanya dana yang Anda siap
          kehilangannya.
        </p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  halaman: {
    minHeight: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as never,
  },
  wadah: { maxWidth: 620, margin: '0 auto', padding: '20px 18px 40px' },
  kepala: { marginBottom: 22 },
  judul: { fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)' },
  kartu: {
    background: 'var(--s1)',
    border: '1px solid var(--bdr)',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tombolBagian: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '16px 18px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text)',
    textAlign: 'left',
  },
  judulBagian: { display: 'block', fontSize: 15.5, fontWeight: 650, marginBottom: 3 },
  ringkasBagian: { display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-3)' },
  panah: { fontSize: 18, color: 'var(--text-3)', transition: 'transform 0.2s', flexShrink: 0 },
  isi: { padding: '0 18px 6px' },
  butir: { paddingBottom: 16 },
  butirJudul: { fontSize: 14, fontWeight: 600, marginBottom: 5 },
  butirTeks: { fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-2)' },
  catatan: {
    marginTop: 6,
    padding: '14px 16px',
    borderRadius: 14,
    background: 'var(--s2)',
    border: '1px solid var(--bdr)',
  },
  catatanTeks: { fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' },
  tautan: {
    display: 'block',
    marginTop: 16,
    padding: '14px 18px',
    borderRadius: 14,
    textAlign: 'center',
    fontSize: 14.5,
    fontWeight: 600,
    color: 'var(--text)',
    background: 'var(--s2)',
    border: '1px solid var(--bdr)',
    textDecoration: 'none',
  },
  risiko: { marginTop: 16, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-3)', textAlign: 'center' },
};
