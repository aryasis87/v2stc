// lib/runtimeMode.ts
// ─────────────────────────────────────────────────────────────────────
// SATU tetapan yang menentukan di mana bot dieksekusi.
//
// `false` (sejak 2026-08-11) = SEMUA mode dieksekusi di server, baik di versi
// web maupun APK. Program afiliasi dihentikan, jadi alasan utama memindahkan
// eksekusi ke perangkat — menghindari IP VPS bersinggungan dengan trader —
// tidak berlaku lagi. Imbalannya: sesi tetap berjalan walau aplikasi ditutup,
// dan notifikasi Telegram berlaku untuk semua pengguna.
//
// KENAPA HARUS SATU TETAPAN, BUKAN PER-TEMPAT: mesin perangkat bukan cuma soal
// "siapa yang menempatkan order". Ia juga jadi sumber status bot, daftar order
// terjadwal, riwayat, dan keuntungan hari ini. Mematikan jalur START saja
// membuat aplikasi tampak rusak: server menjalankan bot, tetapi dashboard
// membaca mesin perangkat yang tidak pernah hidup, sehingga statusnya selalu
// "STOPPED" dan tombol jeda tidak melakukan apa-apa.
//
// Karena itu gerbangnya dipasang di `deviceAuth()` di lib/api.ts — satu tempat
// yang menjaga SEMUA jalur perangkat sekaligus. Dengan begitu APK memakai
// persis jalur yang sama dengan versi web, yang sudah berjalan di produksi
// sejak lama.
//
// Untuk mengembalikan eksekusi ke perangkat: ubah nilainya jadi `true`.
// Berkas mesin di lib/engine/ sengaja tidak dihapus supaya itu tetap mungkin.
// ─────────────────────────────────────────────────────────────────────

export const PAKAI_MESIN_PERANGKAT = false;
