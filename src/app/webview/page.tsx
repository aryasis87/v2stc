'use client';

// Halaman Panduan AutoTrade.
//
// Sebelumnya halaman ini membuka Stockity di peramban bawaan. Isinya diganti
// panduan pemakaian bot karena pengguna lebih membutuhkan penjelasan cara
// menjalankannya daripada pintasan ke platform — tautan ke Stockity tetap
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
    id: 'siap',
    judul: '1 · Sebelum menjalankan bot',
    ringkas: 'Tiga hal yang harus beres lebih dulu',
    isi: [
      {
        h: 'Masuk dengan akun Stockity',
        p: 'Gunakan email dan kata sandi akun Stockity Anda. Bot bekerja pada akun itu langsung — tidak ada akun terpisah yang perlu dibuat.',
      },
      {
        h: 'Pilih akun Demo atau Real',
        p: 'Pemilihan akun ada di panel pengaturan dashboard. Saldo demo bersifat virtual dan tidak berhubungan dengan dana sungguhan. Selalu mulai dari demo.',
      },
      {
        h: 'Pilih aset dan nominal',
        p: 'Tekan kartu aset untuk memilih pasangan yang ingin ditradingkan, lalu isi nominal per order. Perhatikan persentase pembayaran aset — semakin tinggi biasanya semakin sulit ditebak.',
      },
    ],
  },
  {
    id: 'mode',
    judul: '2 · Memilih mode',
    ringkas: 'Enam mode, masing-masing punya cara kerja berbeda',
    isi: [
      {
        h: 'Signal',
        p: 'Anda memasukkan sendiri daftar jam dan arahnya, misal "10:03 b". Bot mengeksekusi tepat pada jam itu. Tombol Ambil Sinyal mengisi daftar otomatis untuk enam jam ke depan.',
      },
      {
        h: 'Fastrade FTT',
        p: 'Bot mengambil harga pada dua pergantian menit berturut-turut, lalu masuk mengikuti arah yang menang. Order pertama baru muncul sekitar dua menit setelah start.',
      },
      {
        h: 'Fastrade CTC',
        p: 'Cara membacanya sama dengan FTT, tetapi arah ordernya dibalik. Dipakai saat pasar sering berbalik setelah bergerak.',
      },
      {
        h: 'AI Signal',
        p: 'Bot menentukan arah sendiri pada tiap pergantian menit lalu langsung mengeksekusi. Anda cukup mengatur nominal dan batas berhenti.',
      },
      {
        h: 'Indicator',
        p: 'Bot membaca indikator teknikal seperti RSI atau moving average, dan hanya masuk ketika syaratnya terpenuhi. Jenis indikator serta periodenya bisa Anda pilih.',
      },
      {
        h: 'Momentum',
        p: 'Bot menunggu pola candle tertentu muncul, seperti doji atau candle sabit. Ordernya paling jarang di antara semua mode, tetapi paling terpilih.',
      },
    ],
  },
  {
    id: 'martingale',
    judul: '3 · Mengatur martingale',
    ringkas: 'Fitur paling berisiko — pahami sebelum menyalakannya',
    isi: [
      {
        h: 'Max Step',
        p: 'Batas berapa kali order boleh diperbesar setelah kalah. Angka ini wajib diisi. Tanpa batas, satu rangkaian kekalahan dapat menghabiskan modal dalam hitungan menit.',
      },
      {
        h: 'Multiplier',
        p: 'Pengali nominal pada tiap langkah. Perlu diingat, kebutuhan modal tumbuh berlipat sementara peluang menang tidak berubah sama sekali.',
      },
      {
        h: 'Always Signal',
        p: 'Bila aktif, kerugian yang belum tertutup dibawa ke sinyal berikutnya alih-alih dilanjutkan langsung. Pastikan Anda paham cara kerjanya sebelum menyalakannya di akun real.',
      },
      {
        h: 'Hitung mundur dari modal',
        p: 'Tentukan berapa langkah yang sanggup ditanggung modal Anda, lalu pakai angka itu — bukan angka yang Anda inginkan.',
      },
    ],
  },
  {
    id: 'batas',
    judul: '4 · Memasang batas otomatis',
    ringkas: 'Bagian yang membuat bot berhenti tanpa perlu diawasi',
    isi: [
      {
        h: 'Stop Loss',
        p: 'Bot berhenti sendiri saat kerugian sesi mencapai angka ini. Isi kolomnya sebelum menekan mulai — inilah pengaman utama Anda.',
      },
      {
        h: 'Stop Profit',
        p: 'Bot berhenti saat keuntungan mencapai target. Sama pentingnya, karena keuntungan yang dibiarkan berjalan sering kembali ke pasar pada sesi yang sama.',
      },
      {
        h: 'Kenapa harus otomatis',
        p: 'Keputusan berhenti di tengah kekalahan beruntun adalah keputusan tersulit yang ada. Batas yang dijalankan bot tidak bisa ditawar saat Anda sedang tertekan.',
      },
    ],
  },
  {
    id: 'jalan',
    judul: '5 · Menjalankan dan memantau',
    ringkas: 'Yang terjadi setelah tombol mulai ditekan',
    isi: [
      {
        h: 'Jangan tinggalkan halaman',
        p: 'Selama sesi berjalan, tetaplah di halaman dashboard. Aplikasi akan menahan perpindahan menu dan mengingatkan Anda bila mencoba pergi.',
      },
      {
        h: 'Membaca status',
        p: 'Tulisan status menunjukkan apa yang sedang dikerjakan bot — menunggu candle, menunggu batas menit, atau mengeksekusi. Bila diam terlalu lama, status itu yang pertama diperiksa.',
      },
      {
        h: 'Riwayat order',
        p: 'Setiap order yang selesai tercatat di halaman Riwayat, lengkap dengan hasil dan keuntungannya. Riwayat juga ditarik dari akun Stockity, jadi tetap ada meski aplikasi ditutup di tengah jalan.',
      },
      {
        h: 'Menghentikan sesi',
        p: 'Tekan tombol berhenti di panel kendali. Order yang sedang berjalan tetap diselesaikan sampai hasilnya keluar.',
      },
    ],
  },
  {
    id: 'masalah',
    judul: '6 · Bila terjadi masalah',
    ringkas: 'Pemeriksaan cepat sebelum menghubungi bantuan',
    isi: [
      {
        h: 'Bot berjalan tapi tidak ada order',
        p: 'Periksa tulisan statusnya. Mode Fastrade, Indicator, dan Momentum menunggu syarat tertentu terpenuhi lebih dulu, sehingga jeda beberapa menit adalah hal wajar.',
      },
      {
        h: 'Order gagal dikirim',
        p: 'Umumnya karena nominal di bawah minimum atau di atas maksimum yang diizinkan Stockity. Sesuaikan nominalnya, lalu jalankan ulang.',
      },
      {
        h: 'Mode REAL terkunci',
        p: 'Mode real hanya terbuka untuk akun yang didaftarkan lewat halaman daftar di aplikasi. Tekan tombol daftar akun pada pesan yang muncul untuk membuatnya.',
      },
      {
        h: 'Masih bermasalah',
        p: 'Buka halaman Profil dan tekan tombol bantuan di bagian bawah. Layanan tersedia sepanjang waktu.',
      },
    ],
  },
];

export default function PanduanPage() {
  const [terbuka, setTerbuka] = useState<string | null>('siap');

  return (
    <div style={S.halaman}>
      <div style={S.wadah}>
        <header style={S.kepala}>
          <h1 style={S.judul}>Panduan AutoTrade</h1>
          <p style={S.sub}>
            Cara memakai bot dari awal sampai berjalan — pengaturan, pilihan mode,
            batas otomatis, dan apa yang harus diperiksa bila ada yang tidak beres.
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
