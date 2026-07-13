import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// createBrowserClient menyimpan sesi di cookie (bukan localStorage) sehingga
// API routes yang membaca sesi via cookies() ikut mengenali user yang login.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
