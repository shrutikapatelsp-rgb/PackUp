import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export const DELETE = async (req: NextRequest) => {
  try {
    const jwt = getBearer(req);
    if (!jwt) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
 // get user
    const { data: authData, error: authErr } = await sb.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const uid = user.id;
    const counts: Record<string, number> = {};

    // 1) Get orders for user to delete order_items first
    const { data: ordersForUser } = await sb.from('orders').select('id').eq('user_id', uid);
    const orderIds = (ordersForUser ?? []).map((o: any) => o.id);

    // 2) Delete order_items (if any)
    if (orderIds.length) {
      const res = await sb
        .from('order_items')
        .delete()
        .in('order_id', orderIds)
        .select('*', { count: 'exact' });
      counts.order_items = (res.count ?? 0) as number;
    } else {
      counts.order_items = 0;
    }

    // 3) Delete cart_items
    {
      const res = await sb
        .from('cart_items')
        .delete()
        .eq('user_id', uid)
        .select('*', { count: 'exact' });
      counts.cart_items = (res.count ?? 0) as number;
    }

    // 4) Delete orders
    {
      const res = await sb
        .from('orders')
        .delete()
        .eq('user_id', uid)
        .select('*', { count: 'exact' });
      counts.orders = (res.count ?? 0) as number;
    }

    // 5) Delete trips
    {
      const res = await sb
        .from('trips')
        .delete()
        .eq('user_id', uid)
        .select('*', { count: 'exact' });
      counts.trips = (res.count ?? 0) as number;
    }

    // 6) Delete user profile row
    {
      const res = await sb
        .from('users')
        .delete()
        .eq('id', uid)
        .select('*', { count: 'exact' });
      counts.users = (res.count ?? 0) as number;
    }

    // Best-effort audit log (do not block on failure)
    await sb.from('events').insert({
      type: 'privacy_delete',
      payload: {
        user_id: uid,
        counts,
        ip: req.headers.get('x-forwarded-for') ?? null,
        at: new Date().toISOString(),
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      source: 'live',
      deleted_at: new Date().toISOString(),
      counts,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err?.message ?? 'Server error' }, { status: 500 });
  }
};

// Accept POST (some clients prefer POST for form submissions)
export const POST = DELETE;
