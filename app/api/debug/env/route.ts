import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mask(v?: string | null) {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export async function GET() {
  // Read exactly what our code uses
  const out = {
    SUPABASE_URL: process.env.SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : null,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE ? 'present' : null,
    // Helpful debug
    NODE_ENV: process.env.NODE_ENV ?? null,
    VER: {
      VERCEL: process.env.VERCEL ? 'yes' : 'no',
      ENV: process.env.VERCEL_ENV ?? null,
      URL: process.env.VERCEL_URL ?? null,
    },
    // show the project ref we think we’re using (from URL)
    inferred_ref: (() => {
      const u = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const m = u.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
      return m?.[1] || null;
    })(),
    masked: {
      SUPABASE_URL: mask(process.env.SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
    }
  };
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
