import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function handleDelete(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });

    const sb = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

    const { data: authData, error: authErr } = await sb.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const uid = user.id;
    const counts: Record<string, number> = {};

    const { data: ordersForUser } = await sb.from('orders').select('id').eq('user_id', uid);
    const orderIds = (ordersForUser ?? []).map((o: any) => o.id);

    if (orderIds.length) {
      const res = await sb.from('order_items').delete().in('order_id', orderIds).select('*', { count: 'exact' });
      counts.order_items = (res.count ?? 0) as number;
    } else counts.order_items = 0;

    {
      const res = await sb.from('cart_items').delete().eq('user_id', uid).select('*', { count: 'exact' });
      counts.cart_items = (res.count ?? 0) as number;
    }

    {
      const res = await sb.from('orders').delete().eq('user_id', uid).select('*', { count: 'exact' });
      counts.orders = (res.count ?? 0) as number;
    }

    {
      const res = await sb.from('trips').delete().eq('user_id', uid).select('*', { count: 'exact' });
      counts.trips = (res.count ?? 0) as number;
    }

    {
      const res = await sb.from('users').delete().eq('id', uid).select('*', { count: 'exact' });
      counts.users = (res.count ?? 0) as number;
    }

    await sb.from('events').insert({ type: 'privacy_delete', payload: { user_id: uid, counts, at: new Date().toISOString() } }).catch(()=>{});

    return NextResponse.json({ ok: true, source: 'live', deleted_at: new Date().toISOString(), counts });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err?.message ?? 'Server error' }, { status: 500 });
  }
}

export const DELETE = handleDelete;
export const POST = handleDelete;
