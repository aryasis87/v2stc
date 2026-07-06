// lib/supabase.ts
// Supabase browser client — menggantikan Firebase di frontend
import { createClient } from '@supabase/supabase-js';

// DB Supabase di-pin ke njnrrwuh (2026-07): akun Supabase lama (rnvzkcva) tidak
// bisa diakses lagi, sehingga seluruh sistem dikonsolidasikan ke njnrrwuh. Anon
// key bersifat PUBLIK (memang ikut ter-bundle ke klien) → aman ditulis di sini.
// Env var NEXT_PUBLIC_SUPABASE_* lama di Vercel tidak lagi dipakai (boleh dihapus).
const NJNRRWUH_URL = 'https://njnrrwuhflnwumxjivca.supabase.co';
const NJNRRWUH_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qbnJyd3VoZmxud3VteGppdmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTg3ODcsImV4cCI6MjA5NTQ5NDc4N30.XZcSQB9wM4i1qn9wdDS9cLcVlnQAJUzRYiVxRU56aio';

const supabaseUrl = NJNRRWUH_URL;
const supabaseAnonKey = NJNRRWUH_ANON;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
});

export default supabase;
