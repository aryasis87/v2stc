// lib/supabase.ts
// Supabase browser client — menggantikan Firebase di frontend
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig';

// DB STC kini SELF-HOST di db.stcautotrade.id (pindah dari Supabase cloud
// njnrrwuh, 2026-08-20). URL + anon dari sumber tunggal supabaseConfig.ts.
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

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
