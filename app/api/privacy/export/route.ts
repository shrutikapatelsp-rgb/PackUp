import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });

    const sb = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

    const { data: authData, error: authErr } = await sb.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const [uRes, tripsRes, ordersRes, cartRes] = await Promise.all([
      sb.from('users').select('id,email,display_name,created_at').eq('id', user.id).maybeSingle(),
      sb.from('trips').select('*').eq('user_id', user.id),
      sb.from('orders').select('id,total,currency,status,created_at').eq('user_id', user.id),
      sb.from('cart_items').select('*').eq('user_id', user.id)
    ]);

    const u = uRes.data ?? { id: user.id };
    const trips = tripsRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const cart_items = cartRes.data ?? [];

    // fetch order_items for order ids
    let order_items: any[] = [];
    const orderIds = orders.map((o: any) => o.id);
    if (orderIds.length) {
      const { data } = await sb.from('order_items').select('*').in('order_id', orderIds);
      order_items = data ?? [];
    }

    await sb.from('events').insert({ type: 'privacy_export', payload: { user_id: user.id, at: new Date().toISOString() } }).catch(()=>{});

    return NextResponse.json({
      ok: true,
      source: 'live',
      user: u,
      exported_at: new Date().toISOString(),
      data: { trips, orders, order_items, cart_items }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
