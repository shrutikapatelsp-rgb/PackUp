// app/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
  // We don't throw here - many dev flows will use mocks. But for production ensure these exist.
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE missing. Some server operations will fail.');
}

export const supabaseService = createClient(
  process.env.SUPABASE_URL ?? 'https://<your-supabase-project>.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE ?? '<YOUR_SUPABASE_SERVICE_ROLE>',
  {
    auth: {
      // service role keys are privileged: keep server-only
      persistSession: false,
    },
    // set global fetch if needed - Next.js has global fetch
  }
);

export function supabaseAnon() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('NEXT_PUBLIC_SUPABASE envs not set; anon client will be limited for RLS checks.');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://<your-supabase-project>.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '<YOUR_SUPABASE_ANON_KEY>',
    { auth: { persistSession: false } }
  );
}

