import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  try {
    const rawAuth = req.headers.get('authorization') || null;
    const token = rawAuth && rawAuth.match(/^Bearer\s+(.+)$/i) ? rawAuth.split(/\s+/)[1] : null;

    const sb = createClient(URL, ANON, { global: { headers: { Authorization: token ? `Bearer ${token}` : '' } } });

    let user = null;
    try {
      const { data } = await sb.auth.getUser();
      user = data?.user ?? null;
    } catch (e) {
      // ignore validation error
    }

    return NextResponse.json({
      ok: true,
      received_authorization_header: rawAuth,
      parsed_token_present: !!token,
      supabase_user: user
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'server error' }, { status: 500 });
  }
}
