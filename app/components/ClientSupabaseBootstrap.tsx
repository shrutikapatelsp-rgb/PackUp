'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * Loads a browser Supabase client and exposes it as window.supabase
 * so you can run `supabase.auth.getSession()` in the console.
 * Safe to ship because it uses public NEXT_PUBLIC_* keys.
 */
export default function ClientSupabaseBootstrap() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const expose = process.env.NEXT_PUBLIC_EXPOSE_SUPABASE_IN_WINDOW === '1';

  useEffect(() => {
    // create a fresh browser client
    const client = createClient(url, anon);

    // attach for console debugging when flag is enabled
    if (typeof window !== 'undefined' && expose) {
      (window as any).supabase = client;
    }

    // touch session once (no-op if not logged in)
    client.auth.getSession().catch(() => {});
  }, [url, anon, expose]);

  return null;
}
