import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type DeletedCounts = { order_items: number; orders: number; cart_items: number; trips: number; users: number };

function getEnv() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const missing = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !SUPABASE_SERVICE_ROLE && 'SUPABASE_SERVICE_ROLE',
      !NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter(Boolean);
    const err: any = new Error(`Missing environment variables: ${missing.join(', ')}`);
    err.code = 'ENV_MISSING';
    throw err;
  }
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE, NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

async function validateBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.split(' ')[1]?.trim();
  if (!token) return null;

  const { SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();
  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function writeAuditEvent(client: any, user_id: string, operationId: string, deleted: DeletedCounts) {
  try {
    await client.from('events').insert({ type: 'privacy.delete', payload: { user_id, operationId, deleted } });
  } catch { /* best-effort only */ }
}

/**
 * Resolve how to delete cart_items for a user:
 *  - Try user columns: user_id, userId, owner_id, customer_id
 *  - Else fall back to trip_id IN (user's trips)
 */
async function deleteCartItemsForUser(srv: any, user_id: string, tripIds: string[]) {
  const candidates = ['user_id', 'userId', 'owner_id', 'customer_id'];

  for (const col of candidates) {
    const trial = await srv.from('cart_items').select('id').eq(col as any, user_id).limit(1);
    if (trial.error) {
      if (/does not exist/i.test(String(trial.error.message))) continue;
      // other errors: assume column exists and try delete using it
    }
    const del = await srv.from('cart_items').delete().eq(col as any, user_id).select('id');
    if (!del.error) return del.data?.length || 0;
    // if we errored, try next candidate
  }

  if (tripIds.length > 0) {
    const trial = await srv.from('cart_items').select('id').in('trip_id' as any, tripIds).limit(1);
    if (!trial.error || !/does not exist/i.test(String(trial.error?.message || ''))) {
      const del = await srv.from('cart_items').delete().in('trip_id', tripIds).select('id');
      if (!del.error) return del.data?.length || 0;
      // fall-through prints error in caller
      throw new Error(del.error?.message || 'cart_items delete via trip_id failed');
    }
  }

  // nothing matched – treat as zero deletions
  return 0;
}

export async function DELETE(req: NextRequest) {
  const operationId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  try {
    const user_id = await validateBearerUserId(req.headers.get('authorization'));
    if (!user_id) {
      return NextResponse.json(
        { code: 'AUTH_INVALID', message: 'Missing or invalid Bearer token', operationId },
        { status: 401 }
      );
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = getEnv();
    const { createClient } = await import('@supabase/supabase-js');
    const srv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const deleted: DeletedCounts = { order_items: 0, orders: 0, cart_items: 0, trips: 0, users: 0 };

    // 1) Trips for this user
    const tripsRes = await srv.from('trips').select('id').eq('user_id', user_id);
    if (tripsRes.error) {
      return NextResponse.json({ code: 'DB_ERROR', message: tripsRes.error.message, operationId }, { status: 500 });
    }
    const tripIds = (tripsRes.data || []).map((t: any) => t.id);

    // 2) Orders for those trips
    let orderIds: string[] = [];
    if (tripIds.length > 0) {
      const ordersRes = await srv.from('orders').select('id').in('trip_id', tripIds);
      if (ordersRes.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: ordersRes.error.message, operationId }, { status: 500 });
      }
      orderIds = (ordersRes.data || []).map((o: any) => o.id);
    }

    // 3) Delete order_items → then orders
    if (orderIds.length > 0) {
      const delOrderItems = await srv.from('order_items').delete().in('order_id', orderIds).select('id');
      if (delOrderItems.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: delOrderItems.error.message, operationId }, { status: 500 });
      }
      deleted.order_items = delOrderItems.data?.length || 0;
    }

    if (tripIds.length > 0) {
      const delOrders = await srv.from('orders').delete().in('trip_id', tripIds).select('id');
      if (delOrders.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: delOrders.error.message, operationId }, { status: 500 });
      }
      deleted.orders = delOrders.data?.length || 0;
    }

    // 4) Delete cart_items – adaptive (user column or trip join)
    try {
      deleted.cart_items = await deleteCartItemsForUser(srv, user_id, tripIds);
    } catch (e: any) {
      return NextResponse.json({ code: 'DB_ERROR', message: e?.message || 'Cart items delete failed', operationId }, { status: 500 });
    }

    // 5) Delete trips
    const delTrips = await srv.from('trips').delete().eq('user_id', user_id).select('id');
    if (delTrips.error) {
      return NextResponse.json({ code: 'DB_ERROR', message: delTrips.error.message, operationId }, { status: 500 });
    }
    deleted.trips = delTrips.data?.length || 0;

    // 6) Delete or anonymize user
    const delUsers = await srv.from('users').delete().eq('id', user_id).select('id');
    if (delUsers.error) {
      await srv.from('users').update({ email: null, display_name: null }).eq('id', user_id);
    } else {
      deleted.users = delUsers.data?.length || 0;
    }

    await writeAuditEvent(srv, user_id, operationId, deleted);
    return NextResponse.json({ ok: true, deleted, operationId }, { status: 200 });
  } catch (err: any) {
    const code = err?.code === 'ENV_MISSING' ? 'ENV_MISSING' : 'INTERNAL_ERROR';
    const message = err?.message || 'Unknown error';
    return NextResponse.json({ code, message, operationId }, { status: 500 });
  }
}
