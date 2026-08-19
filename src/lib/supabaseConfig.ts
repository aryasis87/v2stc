// lib/supabaseConfig.ts
// ─────────────────────────────────────────────────────────────────────
// Konfigurasi DB STC — PINDAH dari Supabase cloud (njnrrwuh) ke self-host
// di VPS `db.stcautotrade.id` (2026-08-20): Postgres 17 + PostgREST + Deno
// functions di belakang nginx. Bentuk API identik dengan Supabase
// (/rest/v1, /functions/v1) sehingga @supabase/supabase-js & pemanggilan
// edge function tetap jalan tanpa perubahan alur.
//
// Anon key bersifat PUBLIK (memang ikut ter-bundle ke klien) → aman ditulis
// di sini. Sumber tunggal supaya `.from()` (REST) dan edge function memakai
// URL + anon yang sama; tidak lagi bergantung env NEXT_PUBLIC_SUPABASE_* di
// Vercel (yang menunjuk Supabase lama).
// ─────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://db.stcautotrade.id';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3MTc3Nzg1LCJleHAiOjIxMDI1Mzc3ODV9.uVW3Yu6foiQCjqYQ2-zFH0GD3Ca1hAomW7uO8Z5twXE';
