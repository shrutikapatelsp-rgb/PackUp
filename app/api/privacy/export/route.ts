import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getBearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    // Pull the caller’s data (RLS will enforce user_id = auth.uid())
    const [u, trips, orders] = await Promise.all([
      sb.from('users')
        .select('id,email,display_name,created_at')
        .eq('id', user.id)
        .maybeSingle()
        .then(r => r.data ?? { id: user.id }),
      sb.from('trips').select('*').eq('user_id', user.id).then(r => r.data ?? []),
      sb.from('orders').select('id,total,currency,status,created_at').eq('user_id', user.id).then(r => r.data ?? []),
    ]);

    // order_items need order_ids
    const orderIds = (orders ?? []).map((o: any) => o.id);
    let order_items: any[] = [];
    if (orderIds.length) {
      const { data } = await sb.from('order_items').select('*').in('order_id', orderIds);
      order_items = data ?? [];
    }

    const { data: cart_items } = await sb.from('cart_items').select('*').eq('user_id', user.id);

    // Best-effort audit log (ignore failures under RLS)
    await sb.from('events').insert({
      type: 'privacy_export',
      payload: { user_id: user.id, at: new Date().toISOString() },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      source: 'live',
      user: u,
      exported_at: new Date().toISOString(),
      data: {
        trips: trips ?? [],
        orders: orders ?? [],
        order_items,
        cart_items: cart_items ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, source: 'error', error: e?.message || 'Server error' }, { status: 500 });
  }
}

