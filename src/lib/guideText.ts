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
    'From creating an account to the bot running — nothing needs to be prepared beforehand. Your Stockity account is created automatically when you register.',
  catatan:
    'The bot runs your rules faster and more consistently — but it does not fix rules that are wrong. A flawed rule will simply be repeated neatly.',
  tautan: 'Open Stockity in a browser',
  risiko:
    'Trading carries the risk of losing your capital. Use only money you are prepared to lose.',
  bagian: [
    {
      id: 'daftar',
      ikon: 'UserPlus',
      judul: 'Creating an account',
      ringkas: 'The only thing you need to prepare — register once',
      isi: [
        {
          h: 'One registration is enough',
          p: 'You do not need a Stockity account beforehand. Once registration succeeds, your Stockity account is created automatically and connected to this app.',
        },
        {
          h: 'Open the registration page',
          p: 'From the sign-in screen, tap the register link at the bottom. If you are seeing the REAL mode locked message, tap Register Account there — you will be signed out and taken to the registration page.',
        },
        {
          h: 'Enter your email and password',
          p: 'Use an email you can open right away. Choose a password used only for this account — it is tied directly to your money.',
        },
        {
          h: 'Write your name as it appears on your ID',
          p: 'The name is checked during verification and again when withdrawing to your bank account. Even a one-letter difference can hold up a withdrawal later.',
        },
        {
          h: 'Ready to use immediately',
          p: 'After registering you are signed in automatically and REAL mode is unlocked. Still, begin with the demo account to test your settings first.',
        },
        {
          h: 'Why only through the app',
          p: 'Registering from a browser is not allowed so that your account is connected from your own device from the start. Opening the registration page in a browser shows only a download link.',
        },
      ],
    },
    {
      id: 'mode',
      ikon: 'Layers',
      judul: 'Choosing a mode',
      ringkas: 'Six modes, each working differently',
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
          p: 'REAL mode only opens for accounts registered through the registration page in the app. Tap Register Account on the message that appears to create one.',
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
    'Mulai dari mendaftar akun sampai bot berjalan. Tidak perlu menyiapkan apa pun lebih dulu — akun Stockity dibuat otomatis saat Anda mendaftar.',
  catatan:
    'Bot menjalankan aturan Anda lebih cepat dan lebih konsisten — tetapi ia tidak memperbaiki aturan yang keliru. Aturan yang salah akan diulang dengan rapi.',
  tautan: 'Buka Stockity di peramban',
  risiko:
    'Trading mengandung risiko kehilangan modal. Gunakan hanya dana yang Anda siap kehilangannya.',
  bagian: [
    {
      id: 'daftar',
      ikon: 'UserPlus',
      judul: 'Mendaftar akun',
      ringkas: 'Satu-satunya yang perlu disiapkan — cukup sekali daftar',
      isi: [
        {
          h: 'Cukup daftar sekali di sini',
          p: 'Anda tidak perlu punya akun Stockity lebih dulu. Setelah pendaftaran berhasil, akun Stockity Anda dibuat otomatis dan langsung tersambung ke aplikasi ini.',
        },
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
      ikon: 'Layers',
      judul: 'Memilih mode',
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
          p: 'Mode real hanya terbuka untuk akun yang didaftarkan lewat halaman daftar di aplikasi. Tekan tombol daftar akun pada pesan yang muncul untuk membuatnya.',
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
