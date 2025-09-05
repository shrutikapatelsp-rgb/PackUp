import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon);

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_EXPOSE_SUPABASE_IN_WINDOW === '1') {
  (window as any).supabase = supabase;
}

