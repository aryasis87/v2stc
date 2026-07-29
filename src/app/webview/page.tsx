'use client';

// Halaman Panduan AutoTrade.
//
// Sebelumnya halaman ini membuka Stockity di peramban bawaan. Isinya diganti
// panduan pemakaian bot karena pengguna lebih membutuhkan penjelasan cara
// menjalankannya daripada pintasan ke platform — tautan ke Stockity tetap
// disediakan di bagian bawah.

import { useState } from 'react';
import { BookOpen, Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity, LifeBuoy, ChevronDown, Info, ExternalLink } from 'lucide-react';

/** Peta ikon per bagian — dipisah agar data panduan tetap berupa teks biasa */
const IKON: Record<string, typeof BookOpen> = {
  Rocket, UserPlus, Layers, TrendingUp, ShieldCheck, Activity, LifeBuoy,
};

const TRADE_URL = 'https://stockity.id';

type Bagian = {
  id: string;
  judul: string;
  ringkas: string;
  ikon: string;
  isi: { h: string; p: string }[];
};

const BAGIAN: Bagian[] = [
  {
    id: 'siap',
    judul: 'Sebelum menjalankan bot',
    ringkas: 'Tiga hal yang harus beres lebih dulu',
    ikon: 'Rocket',
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
    id: 'daftar',
    judul: 'Mendaftar akun baru',
    ringkas: 'Wajib lewat aplikasi — tidak bisa dari peramban',
    ikon: 'UserPlus',
    isi: [
      {
        h: 'Buka halaman daftar',
        p: 'Dari layar masuk, tekan tautan daftar di bagian bawah. Bila Anda sedang melihat pesan mode REAL terkunci, tekan tombol Daftar Akun pada pesan itu — Anda akan keluar dari akun lama lalu diarahkan ke halaman daftar.',
      },
      {
        h: 'Isi email dan kata sandi',
        p: 'Gunakan email yang bisa Anda buka saat itu juga. Kata sandi sebaiknya khusus untuk akun ini, jangan yang dipakai di layanan lain — akun ini berkaitan langsung dengan uang.',
      },
      {
        h: 'Tulis nama sesuai dokumen identitas',
        p: 'Nama akan dicocokkan saat verifikasi dan saat menarik dana ke rekening. Perbedaan satu huruf pun bisa membuat penarikan tertahan di kemudian hari.',
      },
      {
        h: 'Akun langsung siap dipakai',
        p: 'Setelah pendaftaran berhasil, Anda otomatis masuk dan mode REAL terbuka. Mulailah tetap dari akun demo untuk menguji pengaturan Anda lebih dulu.',
      },
      {
        h: 'Kenapa harus lewat aplikasi',
        p: 'Pendaftaran dari peramban tidak diizinkan agar akun Anda terhubung langsung dari perangkat sendiri sejak awal. Bila membuka halaman daftar di peramban, yang muncul hanya tautan unduh aplikasi.',
      },
    ],
  },
  {
    id: 'mode',
    judul: 'Memilih mode',
    ringkas: 'Enam mode, masing-masing punya cara kerja berbeda',
    ikon: 'Layers',
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
    judul: 'Mengatur martingale',
    ringkas: 'Fitur paling berisiko — pahami sebelum menyalakannya',
    ikon: 'TrendingUp',
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
    judul: 'Memasang batas otomatis',
    ringkas: 'Bagian yang membuat bot berhenti tanpa perlu diawasi',
    ikon: 'ShieldCheck',
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
    judul: 'Menjalankan dan memantau',
    ringkas: 'Yang terjadi setelah tombol mulai ditekan',
    ikon: 'Activity',
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
    judul: 'Bila terjadi masalah',
    ringkas: 'Pemeriksaan cepat sebelum menghubungi bantuan',
    ikon: 'LifeBuoy',
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
      {/* Sorotan lembut di belakang kepala halaman — memberi kedalaman
          tanpa mengganggu keterbacaan. */}
      <div style={S.cahaya} aria-hidden="true" />

      <div style={S.wadah}>
        <header style={S.kepala}>
          <span style={S.lencana}>
            <BookOpen size={13} strokeWidth={2.2} />
            Panduan
          </span>
          <h1 style={S.judul}>Menjalankan AutoTrade</h1>
          <p style={S.sub}>
            Dari mendaftar sampai bot berjalan — beserta apa yang perlu diperiksa
            bila ada yang tidak beres.
          </p>
        </header>

        <div style={S.daftar}>
          {BAGIAN.map((b, idx) => {
            const buka = terbuka === b.id;
            const Ikon = IKON[b.ikon] ?? BookOpen;
            return (
              <section key={b.id} style={{ ...S.kartu, ...(buka ? S.kartuAktif : null) }}>
                <button
                  type="button"
                  onClick={() => setTerbuka(buka ? null : b.id)}
                  style={S.tombol}
                  aria-expanded={buka}
                >
                  <span style={{ ...S.ikonKotak, ...(buka ? S.ikonKotakAktif : null) }}>
                    <Ikon size={17} strokeWidth={2} />
                  </span>

                  <span style={S.tengah}>
                    <span style={S.barisJudul}>
                      <span style={S.nomor}>{String(idx + 1).padStart(2, '0')}</span>
                      <span style={S.judulBagian}>{b.judul}</span>
                    </span>
                    <span style={S.ringkasBagian}>{b.ringkas}</span>
                  </span>

                  <ChevronDown
                    size={17}
                    strokeWidth={2.2}
                    style={{
                      flexShrink: 0,
                      opacity: 0.45,
                      transform: buka ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.25s ease',
                    }}
                  />
                </button>

                {buka && (
                  <div style={S.isi}>
                    {b.isi.map((it, n) => (
                      <div key={it.h} style={{ ...S.butir, ...(n === b.isi.length - 1 ? S.butirAkhir : null) }}>
                        <span style={S.titik} aria-hidden="true" />
                        <div>
                          <p style={S.butirJudul}>{it.h}</p>
                          <p style={S.butirTeks}>{it.p}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div style={S.catatan}>
          <Info size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1, opacity: 0.7 }} />
          <p style={S.catatanTeks}>
            Bot menjalankan aturan Anda lebih cepat dan lebih konsisten — tetapi ia tidak
            memperbaiki aturan yang keliru. Aturan yang salah akan diulang dengan rapi.
          </p>
        </div>

        <a href={TRADE_URL} target="_blank" rel="noopener noreferrer" style={S.tautan}>
          Buka Stockity di peramban
          <ExternalLink size={15} strokeWidth={2} />
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
    position: 'relative',
    minHeight: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as never,
  },
  cahaya: {
    position: 'absolute',
    top: -140,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 420,
    height: 300,
    borderRadius: '50%',
    background: 'var(--blue)',
    opacity: 0.09,
    filter: 'blur(90px)',
    pointerEvents: 'none',
  },
  wadah: { position: 'relative', maxWidth: 640, margin: '0 auto', padding: '26px 16px 44px' },

  kepala: { marginBottom: 26, textAlign: 'center' },
  lencana: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'var(--blue)',
    background: 'var(--blue-dim)',
    border: '1px solid var(--blue-bdr)',
    marginBottom: 14,
  },
  judul: { fontSize: 27, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 9 },
  sub: { fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)', maxWidth: 420, margin: '0 auto' },

  daftar: { display: 'flex', flexDirection: 'column', gap: 10 },
  kartu: {
    background: 'var(--s1)',
    border: '1px solid var(--bdr)',
    borderRadius: 18,
    overflow: 'hidden',
    transition: 'border-color 0.22s ease, box-shadow 0.22s ease',
  },
  kartuAktif: {
    borderColor: 'var(--blue-bdr)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 14px 34px -22px rgba(0,0,0,0.45)',
  },

  tombol: {
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    width: '100%',
    padding: '15px 16px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text)',
    textAlign: 'left',
  },
  ikonKotak: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 12,
    flexShrink: 0,
    background: 'var(--s2)',
    color: 'var(--text-2)',
    transition: 'background 0.22s ease, color 0.22s ease',
  },
  ikonKotakAktif: { background: 'var(--blue-dim)', color: 'var(--blue)' },

  tengah: { flex: 1, minWidth: 0 },
  barisJudul: { display: 'flex', alignItems: 'baseline', gap: 8 },
  nomor: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--text-3)',
    flexShrink: 0,
  },
  judulBagian: { fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em' },
  ringkasBagian: {
    display: 'block',
    fontSize: 12.5,
    lineHeight: 1.5,
    color: 'var(--text-3)',
    marginTop: 3,
    paddingLeft: 26,
  },

  isi: { padding: '2px 16px 4px 67px' },
  butir: {
    display: 'flex',
    gap: 10,
    paddingBottom: 15,
    marginBottom: 15,
    borderBottom: '1px solid var(--bdr)',
  },
  butirAkhir: { borderBottom: 'none', marginBottom: 4 },
  titik: {
    width: 5,
    height: 5,
    borderRadius: 99,
    background: 'var(--blue)',
    opacity: 0.55,
    flexShrink: 0,
    marginTop: 7,
  },
  butirJudul: { fontSize: 13.5, fontWeight: 650, marginBottom: 4, letterSpacing: '-0.005em' },
  butirTeks: { fontSize: 13, lineHeight: 1.75, color: 'var(--text-2)' },

  catatan: {
    display: 'flex',
    gap: 10,
    marginTop: 18,
    padding: '14px 15px',
    borderRadius: 15,
    background: 'var(--s2)',
    border: '1px solid var(--bdr)',
    color: 'var(--text-2)',
  },
  catatanTeks: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' },

  tautan: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    padding: '14px 18px',
    borderRadius: 15,
    fontSize: 14.5,
    fontWeight: 600,
    color: 'var(--text)',
    background: 'var(--s1)',
    border: '1px solid var(--bdr)',
    textDecoration: 'none',
  },
  risiko: {
    marginTop: 16,
    fontSize: 11.5,
    lineHeight: 1.65,
    color: 'var(--text-3)',
    textAlign: 'center',
  },
};
