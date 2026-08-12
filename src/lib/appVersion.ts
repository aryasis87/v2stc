// lib/appVersion.ts
// ✅ Update nilai ini SETIAP KALI build APK baru.
//    versionCode  : integer, selalu naik (dipakai untuk perbandingan)
//    versionName  : string display (ditampilkan ke user)
//
// Cara kerja update:
//   1. Naikkan versionCode dan versionName di sini sebelum build
//   2. Bangun APK, lalu salin ke public/ repo landing (StcAutoTrade.apk /
//      KoalaSPro.apk) — di situlah pengguna mengunduhnya.
//
// TIDAK ADA pembaruan dalam aplikasi. Fitur itu (AppUpdateCard + appUpdateApi)
// DIHAPUS 2026-08-12 atas keputusan pemilik: komponennya tidak pernah dirender
// dan bucket Supabase-nya tidak pernah dibuat, jadi ia hanya kode mati.

export const APP_VERSION_CODE = 14;  // integer — naikan setiap rilis
export const APP_VERSION_NAME = '4.4'; // string display

// 1. Build APK baru
// 2. Naikkan APP_VERSION_CODE di appVersion.ts → 2, APP_VERSION_NAME → "2.0"  
// 3. Build & deploy app
// 4. Upload ke bucket: app-v2.0-code2.apk