// lib/guideText.ts
// ─────────────────────────────────────────────────────────────────────
// Isi halaman Panduan AutoTrade.
//
// Dipisah dari halamannya agar teks dapat diterjemahkan tanpa menyentuh
// tata letak. Bahasa yang belum tersedia jatuh ke Inggris — pola yang sama
// dipakai halaman daftar akun.
// ─────────────────────────────────────────────────────────────────────

export type ButirPanduan = { h: string; p: string };
export type BagianPanduan = {
  id: string;
  ikon: string;
  judul: string;
  ringkas: string;
  isi: ButirPanduan[];
};

export type IsiPanduan = {
  judulHalaman: string;
  lencana: string;
  pengantar: string;
  catatan: string;
  tautan: string;
  risiko: string;
  bagian: BagianPanduan[];
};

const EN: IsiPanduan = {
  judulHalaman: 'Running AutoTrade',
  lencana: 'Guide',
  pengantar:
    'From signing in to the bot running — the steps are short. You sign in with your Stockity account, choose a mode, and the bot runs your rules on our server.',
  catatan:
    'The bot runs your rules faster and more consistently — but it does not fix rules that are wrong. A flawed rule will simply be repeated neatly.',
  tautan: 'Open Stockity in a browser',
  risiko:
    'Trading carries the risk of losing your capital. Use only money you are prepared to lose.',
  bagian: [
    {
      id: 'daftar',
      ikon: 'KeyRound',
      judul: 'Signing in',
      ringkas: 'Sign in with your Stockity account — nothing to register here',
      isi: [
        {
          h: 'Use your Stockity account',
          p: 'On the start screen, enter the email and password of your Stockity account. There is no separate registration here — the app connects to the Stockity account you already have.',
        },
        {
          h: 'Your session is kept safely',
          p: 'After signing in you stay logged in on this device, so you do not have to type your password every time. Use a password kept for this account only — it is tied directly to your money.',
        },
        {
          h: 'Make sure the name matches your ID',
          p: 'The name on your Stockity account is checked during verification and again when withdrawing to your bank account. Even a one-letter difference can hold up a withdrawal later.',
        },
        {
          h: 'You start on DEMO',
          p: 'Every account begins on the DEMO account — start there to test your settings with no risk. REAL trading is a separate one-time activation (see Access & activation).',
        },
      ],
    },
    {
      id: 'mode',
      ikon: 'Layers',
      judul: 'Choosing a mode',
      ringkas: 'Eight modes, each working differently',
      isi: [
        {
          h: 'Signal',
          p: 'You enter a list of times and directions yourself, such as "10:03 b". The bot executes exactly at those times. The Get Signals button fills the list automatically for the next six hours.',
        },
        {
          h: 'Fastrade FTT',
          p: 'The bot takes prices at two consecutive minute boundaries, then enters following the winning direction. The first order appears about two minutes after starting.',
        },
        {
          h: 'Fastrade CTC',
          p: 'It reads the market the same way as FTT, but the order direction is reversed. Used when the market often turns after moving.',
        },
        {
          h: 'Fast Reversal',
          p: 'Reads the market like FTT, but reverses the direction only on the specific candles (K) you pick. Made for markets that tend to snap back at certain points. A paid feature, active for 30 days.',
        },
        {
          h: '5st · Blitz 5 seconds',
          p: 'A blitz order whose result lands in just 5 seconds. It still reads two candles like FTT — only the order duration is 5 seconds. Turned on as an add-on to Fastrade FTT. A paid feature (monthly).',
        },
        {
          h: 'AI Signal',
          p: 'The bot decides the direction itself at each minute boundary and executes immediately. You only set the amount and the stop limits.',
        },
        {
          h: 'Indicator',
          p: 'The bot reads technical indicators such as RSI or moving averages, and enters only when the conditions are met. You choose the indicator and its period.',
        },
        {
          h: 'Momentum',
          p: 'The bot waits for specific candle patterns to appear, such as a doji. It places the fewest orders of all modes, but the most selective ones.',
        },
      ],
    },
    {
      id: 'akses',
      ikon: 'KeyRound',
      judul: 'Access & activation',
      ringkas: 'Premium features and how to unlock them',
      isi: [
        {
          h: 'REAL account — one-time Rp 150,000',
          p: 'By default your account runs on DEMO. To unlock REAL trading, activate it on the Activate REAL page: pay Rp 150,000 once via QRIS and upload the proof. Once approved, REAL mode stays open.',
        },
        {
          h: 'AI Signal — Rp 50,000 / month',
          p: 'The AI Signal mode needs a Rp 50,000 monthly subscription. Activate it on the Activate AI Signal page.',
        },
        {
          h: '5st · Blitz 5 seconds — Rp 85,000 / month',
          p: 'The blitz order whose result lands in 5 seconds. Rp 85,000 per month via the Activate 5st page.',
        },
        {
          h: 'Fast Reversal — paid (30 days)',
          p: 'FTT with a direction flip on the candles you pick. Paid access for 30 days — activate it following the prompt shown in the app.',
        },
        {
          h: 'How to pay',
          p: 'Every activation uses QRIS. Scan or download the QRIS on the activation page, pay the exact amount, upload the proof, then wait for confirmation. Admins already have every feature unlocked.',
        },
      ],
    },
    {
      id: 'martingale',
      ikon: 'TrendingUp',
      judul: 'Setting up martingale',
      ringkas: 'The riskiest feature — understand it before switching it on',
      isi: [
        {
          h: 'Max Step',
          p: 'The limit on how many times an order may be enlarged after a loss. This must be set. Without a limit, a single losing streak can drain your capital within minutes.',
        },
        {
          h: 'Multiplier',
          p: 'How much the amount grows at each step. Remember that the capital required grows multiplicatively while your chance of winning does not change at all.',
        },
        {
          h: 'Always Signal',
          p: 'When active, an unrecovered loss is carried to the next signal instead of continuing straight away. Make sure you understand it before enabling it on a real account.',
        },
        {
          h: 'Count backwards from your capital',
          p: 'Decide how many steps your capital can actually absorb, then use that number — not the number you wish for.',
        },
      ],
    },
    {
      id: 'batas',
      ikon: 'ShieldCheck',
      judul: 'Setting automatic limits',
      ringkas: 'What lets the bot stop without being watched',
      isi: [
        {
          h: 'Stop Loss',
          p: 'The bot stops on its own once the session loss reaches this figure. Fill it in before pressing start — this is your main safeguard.',
        },
        {
          h: 'Stop Profit',
          p: 'The bot stops once profit reaches your target. Just as important, because profit left running is often returned to the market in the same session.',
        },
        {
          h: 'Why it must be automatic',
          p: 'Deciding to stop in the middle of a losing streak is the hardest decision there is. A limit the bot enforces cannot be negotiated when you are under pressure.',
        },
      ],
    },
    {
      id: 'jalan',
      ikon: 'Activity',
      judul: 'Configure and run',
      ringkas: 'A few settings, then press start',
      isi: [
        {
          h: 'Choose Demo or Real',
          p: 'Found in the dashboard settings panel. The demo balance is virtual and unrelated to real funds — always begin there.',
        },
        {
          h: 'Choose an asset and amount per order',
          p: 'Tap the asset card to pick the pair you want to trade, then set the amount. Watch the payout rate — the higher it is, the harder the asset usually is to predict.',
        },
        {
          h: 'Do not leave the page',
          p: 'While a session runs, stay on the dashboard. The app will hold menu changes and remind you if you try to leave.',
        },
        {
          h: 'Reading the status',
          p: 'The status line shows what the bot is doing — waiting for a candle, waiting for a minute boundary, or executing. If it seems idle for too long, check the status first.',
        },
        {
          h: 'Order history',
          p: 'Every completed order is recorded on the History page along with its result and profit. History is also pulled from your Stockity account, so it survives even if the app is closed midway.',
        },
        {
          h: 'Stopping a session',
          p: 'Press stop in the control panel. Orders already running are still carried through until their result arrives.',
        },
      ],
    },
    {
      id: 'masalah',
      ikon: 'LifeBuoy',
      judul: 'If something goes wrong',
      ringkas: 'Quick checks before contacting support',
      isi: [
        {
          h: 'The bot runs but places no orders',
          p: 'Check the status line. Fastrade, Indicator and Momentum wait for their conditions to be met first, so a pause of several minutes is normal.',
        },
        {
          h: 'Orders fail to send',
          p: 'Usually the amount is below the minimum or above the maximum Stockity allows. Adjust the amount, then run again.',
        },
        {
          h: 'REAL mode is locked',
          p: 'REAL trading is a one-time paid activation. Open the Activate REAL page, pay Rp 150,000 via QRIS and upload the proof; once approved, REAL mode opens. Until then the account runs on DEMO.',
        },
        {
          h: 'Still stuck',
          p: 'Open the Profile page and tap the help button at the bottom. Support is available around the clock.',
        },
      ],
    },
  ],
};

const ID: IsiPanduan = {
  judulHalaman: 'Menjalankan AutoTrade',
  lencana: 'Panduan',
  pengantar:
    'Mulai dari masuk sampai bot berjalan — langkahnya singkat. Anda masuk dengan akun Stockity, pilih mode, lalu bot menjalankan aturan Anda di server kami.',
  catatan:
    'Bot menjalankan aturan Anda lebih cepat dan lebih konsisten — tetapi ia tidak memperbaiki aturan yang keliru. Aturan yang salah akan diulang dengan rapi.',
  tautan: 'Buka Stockity di peramban',
  risiko:
    'Trading mengandung risiko kehilangan modal. Gunakan hanya dana yang Anda siap kehilangannya.',
  bagian: [
    {
      id: 'daftar',
      ikon: 'KeyRound',
      judul: 'Masuk ke akun',
      ringkas: 'Cukup masuk dengan akun Stockity — tak perlu mendaftar di sini',
      isi: [
        {
          h: 'Gunakan akun Stockity Anda',
          p: 'Di layar masuk, isi email dan kata sandi akun Stockity Anda. Tidak ada pendaftaran terpisah di sini — aplikasi tersambung ke akun Stockity yang sudah Anda miliki.',
        },
        {
          h: 'Sesi tersimpan aman',
          p: 'Setelah masuk, Anda tetap login di perangkat ini, jadi tidak perlu mengetik kata sandi setiap kali. Gunakan kata sandi khusus untuk akun ini, jangan yang dipakai di layanan lain — akun ini berkaitan langsung dengan uang.',
        },
        {
          h: 'Pastikan nama sesuai dokumen identitas',
          p: 'Nama pada akun Stockity dicocokkan saat verifikasi dan saat menarik dana ke rekening. Perbedaan satu huruf pun bisa membuat penarikan tertahan di kemudian hari.',
        },
        {
          h: 'Anda mulai di DEMO',
          p: 'Setiap akun dimulai di DEMO — mulailah dari sana untuk menguji pengaturan tanpa risiko. Trading akun REAL adalah aktivasi terpisah sekali bayar (lihat Akses & aktivasi).',
        },
      ],
    },
    {
      id: 'mode',
      ikon: 'Layers',
      judul: 'Memilih mode',
      ringkas: 'Delapan mode, masing-masing punya cara kerja berbeda',
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
          h: 'Fast Reversal',
          p: 'Membaca pasar seperti FTT, tetapi arah order dibalik hanya pada candle (K) tertentu yang Anda pilih. Dibuat untuk pasar yang cenderung berbalik di titik tertentu. Fitur berbayar, aktif 30 hari.',
        },
        {
          h: '5st · Blitz 5 Detik',
          p: 'Order blitz yang hasilnya keluar hanya dalam 5 detik. Sinyalnya tetap membaca dua candle seperti FTT — hanya durasi ordernya yang 5 detik. Diaktifkan sebagai tambahan pada Fastrade FTT. Fitur berbayar (bulanan).',
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
      id: 'akses',
      ikon: 'KeyRound',
      judul: 'Akses & aktivasi',
      ringkas: 'Fitur premium dan cara mengaktifkannya',
      isi: [
        {
          h: 'Akun REAL — sekali bayar Rp 150.000',
          p: 'Secara bawaan akun berjalan di DEMO. Untuk membuka trading akun REAL, aktifkan di halaman Aktivasi REAL: bayar sekali Rp 150.000 lewat QRIS lalu unggah buktinya. Setelah disetujui, mode REAL terbuka.',
        },
        {
          h: 'AI Signal — Rp 50.000 / bulan',
          p: 'Mode AI Signal butuh langganan Rp 50.000 per bulan. Aktifkan di halaman Aktivasi AI Signal.',
        },
        {
          h: '5st · Blitz 5 detik — Rp 85.000 / bulan',
          p: 'Order blitz yang hasilnya keluar dalam 5 detik. Rp 85.000 per bulan lewat halaman Aktivasi 5st.',
        },
        {
          h: 'Fast Reversal — berbayar (30 hari)',
          p: 'FTT dengan pembalikan arah pada candle yang Anda pilih. Akses berbayar untuk 30 hari — aktifkan mengikuti petunjuk yang muncul di aplikasi.',
        },
        {
          h: 'Cara membayar',
          p: 'Semua aktivasi memakai QRIS. Scan atau unduh QRIS di halaman aktivasi, bayar tepat sesuai nominal, unggah bukti, lalu tunggu konfirmasi. Admin sudah otomatis mendapat semua fitur.',
        },
      ],
    },
    {
      id: 'martingale',
      ikon: 'TrendingUp',
      judul: 'Mengatur martingale',
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
      ikon: 'ShieldCheck',
      judul: 'Memasang batas otomatis',
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
      ikon: 'Activity',
      judul: 'Mengatur dan menjalankan',
      ringkas: 'Pengaturan singkat, lalu tekan mulai',
      isi: [
        {
          h: 'Pilih akun Demo atau Real',
          p: 'Ada di panel pengaturan dashboard. Saldo demo bersifat virtual dan tidak berhubungan dengan dana sungguhan — selalu mulai dari sana.',
        },
        {
          h: 'Pilih aset dan nominal per order',
          p: 'Tekan kartu aset untuk memilih pasangan yang ingin ditradingkan, lalu isi nominalnya. Perhatikan persentase pembayaran aset — semakin tinggi biasanya semakin sulit ditebak.',
        },
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
      ikon: 'LifeBuoy',
      judul: 'Bila terjadi masalah',
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
          p: 'Trading REAL adalah aktivasi berbayar sekali. Buka halaman Aktivasi REAL, bayar Rp 150.000 via QRIS lalu unggah bukti; setelah disetujui, mode REAL terbuka. Sebelum itu akun berjalan di DEMO.',
        },
        {
          h: 'Masih bermasalah',
          p: 'Buka halaman Profil dan tekan tombol bantuan di bagian bawah. Layanan tersedia sepanjang waktu.',
        },
      ],
    },
  ],
};

const PANDUAN: Record<string, IsiPanduan> = { en: EN, id: ID };

/** Isi panduan sesuai bahasa; bahasa yang belum tersedia jatuh ke Inggris. */
export function panduan(lang: string | undefined): IsiPanduan {
  return (lang && PANDUAN[lang]) || PANDUAN.en;
}
