import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  try {
    const jwt = req.headers.get('authorization')?.split('Bearer ')[1];
    if (!jwt) return NextResponse.json({ ok:false, source:'live', error:'Unauthorized' }, { status: 401 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok:false, source:'live', error:'Unauthorized' }, { status: 401 });

    const [u, trips, orders, order_items, cart_items] = await Promise.all([
      sb.from('users').select('*').eq('id', user.id).maybeSingle(),
      sb.from('trips').select('*').eq('user_id', user.id),
      sb.from('orders').select('*').eq('user_id', user.id),
      sb.from('order_items').select('*, orders!inner(user_id)').eq('orders.user_id', user.id),
      sb.from('cart_items').select('*').eq('user_id', user.id),
    ]);

    return NextResponse.json({
      ok: true, source: 'live',
      data: {
        user: u.data ?? null,
        trips: trips.data ?? [],
        orders: orders.data ?? [],
        order_items: order_items.data ?? [],
        cart_items: cart_items.data ?? [],
      }
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, source:'live', error:String(e?.message ?? e) }, { status: 500 });
  }
}
