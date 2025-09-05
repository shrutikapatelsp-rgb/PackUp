/* Uses SUPABASE_URL and SUPABASE_ANON_KEY from env (no NEXT_PUBLIC_ prefix) */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getSupabaseWithJwt(jwt: string) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
}

export async function GET(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    if (!URL || !ANON) {
      console.error('missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return NextResponse.json({ ok: false, source: 'live', error: 'Server misconfiguration' }, { status: 500 });
    }
    const sb = getSupabaseWithJwt(jwt);
    const { data: authData, error: authErr } = await sb.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    const uid = authData.user.id;

    const [uRes, tripsRes, ordersRes, orderItemsRes, cartItemsRes] = await Promise.all([
      sb.from('users').select('id,email,display_name,created_at').eq('id', uid).maybeSingle(),
      sb.from('trips').select('*').eq('user_id', uid),
      sb.from('orders').select('id,total,currency,status,created_at').eq('user_id', uid),
      sb.from('order_items').select('*').eq('user_id', uid),
      sb.from('cart_items').select('*').eq('user_id', uid),
    ]);

    return NextResponse.json({
      ok: true,
      source: 'live',
      user: uRes?.data ?? null,
      trips: tripsRes?.data ?? [],
      orders: ordersRes?.data ?? [],
      order_items: orderItemsRes?.data ?? [],
      cart_items: cartItemsRes?.data ?? [],
    });
  } catch (err: any) {
    console.error('privacy/export error', err);
    return NextResponse.json({ ok: false, source: 'error', error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
