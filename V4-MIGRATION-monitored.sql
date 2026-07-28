-- ═══════════════════════════════════════════════════════════════
-- V4 — Tandai sesi yang BOLEH dipantau bot Telegram di VPS
--
-- Latar belakang:
-- Bot Telegram di VPS memeriksa saldo tiap sesi dengan memanggil API
-- Stockity memakai `sessions.stockity_token`. Panggilan itu berasal dari
-- IP VPS. Bila akun hasil pendaftaran afiliasi ikut diperiksa, seluruh
-- akun tersebut terlihat beraktivitas dari satu IP yang sama.
--
-- Kolom ini memisahkan keduanya:
--   monitored = TRUE  → sesi lama, tetap dipantau bot (notifikasi deposit)
--   monitored = FALSE → akun baru v4, TIDAK PERNAH disentuh dari VPS
--
-- Bawaannya TRUE agar seluruh sesi yang sudah ada tidak berubah perilakunya.
-- Jalankan sekali di SQL Editor Supabase. Aman diulang.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS monitored BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN sessions.monitored IS
  'FALSE = akun pendaftaran v4; bot Telegram di VPS dilarang memanggil API Stockity untuk sesi ini agar aktivitas akun tidak berasal dari IP VPS.';

-- Indeks kecil agar penyaringan bot tetap ringan saat jumlah sesi bertambah
CREATE INDEX IF NOT EXISTS idx_sessions_monitored ON sessions (monitored);

-- Catatan: kolom PK (kata sandi) memang tidak pernah diisi oleh alur v4.
-- Perintah di bawah membersihkan sisa kata sandi milik akun yang tidak
-- dipantau, seandainya ada yang tertulis oleh versi lama.
UPDATE sessions SET "PK" = NULL WHERE monitored = FALSE AND "PK" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- Susulan: akun yang sudah terlanjur mendaftar lewat selfregister v4
-- sebelum kolom ini ada. Ditandai mundur berdasarkan cara pendaftarannya
-- dan tanggal, agar tidak ada satu pun akun afiliasi yang terlewat.
-- ═══════════════════════════════════════════════════════════════

UPDATE sessions s
SET    monitored = FALSE
FROM   whitelist_users w
WHERE  w.email = s.email
  AND  w.added_by = 'selfregister'
  AND  w.added_at >= '2026-07-28';

-- Kata sandi milik akun yang tidak dipantau dikosongkan sekalian
UPDATE sessions SET "PK" = NULL WHERE monitored = FALSE AND "PK" IS NOT NULL;

-- Periksa hasilnya: berapa sesi yang dipantau dan berapa yang tidak
SELECT monitored, COUNT(*) AS jumlah FROM sessions GROUP BY monitored;
