/**
 * app/api/privacy/export/route.ts
 * Exports PII-scoped rows for the authenticated user.
 *
 * Returns:
 * {
 *   ok: true,
 *   source: 'live',
 *   user: {...} | null,
 *   trips: [...],
 *   orders: [...],
 *   order_items: [...],
 *   cart_items: [...]
 * }
 */
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/app/lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token' }, { status: 401 });
    }
    const token = auth.slice('Bearer '.length);

    const sb = getSupabaseServerClient();

    // Validate token -> user
    const { data: authData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'Invalid token or user not found' }, { status: 401 });
    }
    const user = authData.user;
    const uid = user.id;

    // Fetch user-scoped data in parallel
    const [
      uRes,
      tripsRes,
      ordersRes,
      orderItemsRes,
      cartItemsRes
    ] = await Promise.all([
      sb.from('users').select('id,email,display_name,created_at').eq('id', uid).maybeSingle(),
      sb.from('trips').select('*').eq('user_id', uid),
      sb.from('orders').select('id,total,currency,status,created_at').eq('user_id', uid),
      sb.from('order_items').select('*').eq('user_id', uid),
      sb.from('cart_items').select('*').eq('user_id', uid),
    ]);

    const userRow = uRes?.data ?? null;
    const trips = tripsRes?.data ?? [];
    const orders = ordersRes?.data ?? [];
    const order_items = orderItemsRes?.data ?? [];
    const cart_items = cartItemsRes?.data ?? [];

    return NextResponse.json({
      ok: true,
      source: 'live',
      user: userRow,
      trips,
      orders,
      order_items,
      cart_items,
    });
  } catch (err) {
    console.error('[privacy/export] error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
