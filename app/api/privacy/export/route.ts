// app/api/privacy/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAnon, supabaseService } from '../../../lib/supabaseServer';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const operationId = crypto.randomUUID();

  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ code: 'AUTH_INVALID', message: 'Missing Authorization', operationId }, { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  // use anon client to respect RLS
  const anon = supabaseAnon();
  try {
    const usr = await anon.auth.getUser(token);
    if (!usr?.data?.user) {
      return NextResponse.json({ code: 'AUTH_INVALID', message: 'Invalid token', operationId }, { status: 401 });
    }
    const userId = usr.data.user.id;

    // gather user row
    const { data: userRows } = await anon.from('users').select('*').eq('id', userId).limit(1);
    const { data: trips } = await anon.from('trips').select('*').eq('user_id', userId);
    const { data: cart_items } = await anon.from('cart_items').select('*').eq('user_id', userId);
    const { data: orders } = await anon.from('orders').select('*').eq('user_id', userId);
    let order_items = [];
    if (orders?.length) {
      const orderIds = orders.map((o: any) => o.id);
      const { data } = await anon.from('order_items').select('*').in('order_id', orderIds);
      order_items = data ?? [];
    }

    // log event using service role
    try {
      await supabaseService.from('events').insert([{
        type: 'privacy_export',
        payload: { user_id: userId, operationId, counts: { user: userRows?.length ?? 0, trips: trips?.length ?? 0, orders: orders?.length ?? 0, cart_items: cart_items?.length ?? 0 } }
      }]);
    } catch (e) {
      console.warn('privacy export event failed', e);
    }

    return NextResponse.json({
      ok: true,
      source: 'live',
      user: userRows?.[0] ?? null,
      trips,
      orders,
      order_items,
      cart_items,
      operationId
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: String(err?.message ?? err), operationId }, { status: 500 });
  }
}

