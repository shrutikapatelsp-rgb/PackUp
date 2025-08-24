export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'ping';

    const db = supabaseServer();

    // Insert one row into public.events (expects columns: id uuid default, created_at timestamptz default, type text, payload jsonb)
    const inserted = await db
      .from('events')
      .insert([{ type, payload: { source: 'vercel', ok: true } }])
      .select()
      .single();

    if (inserted.error) throw inserted.error;

    // Read latest 5 rows
    const latest = await db
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (latest.error) throw latest.error;

    return NextResponse.json({ ok: true, wrote: inserted.data, latest: latest.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
