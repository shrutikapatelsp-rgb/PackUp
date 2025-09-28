import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function getEnv() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const missing = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter(Boolean);
    const err: any = new Error(`Missing environment variables: ${missing.join(', ')}`);
    err.code = 'ENV_MISSING';
    throw err;
  }
  return { SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

async function validateBearerUser(authHeader: string | null): Promise<{ id: string } | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.split(' ')[1]?.trim();
  if (!token) return null;

  const { SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();
  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { id: data.user.id };
}

async function writeAuditEvent(client: any, user_id: string, operationId: string, payload: any) {
  try {
    await client.from('events').insert({
      type: 'privacy.export',
      payload: { user_id, operationId, ...payload },
    });
  } catch { /* best-effort only */ }
}

/**
 * Resolve how to fetch cart_items for a user:
 * 1) Try user columns: user_id, userId, owner_id, customer_id
 * 2) Else fall back to trip_id IN (user's trips)
 */
async function resolveCartItems(anon: any, user_id: string, tripIds: string[]) {
  const candidates = ['user_id', 'userId', 'owner_id', 'customer_id'];
  for (const col of candidates) {
    const trial = await anon.from('cart_items').select('id').eq(col as any, user_id).limit(1);
    if (trial.error) {
      if (/does not exist/i.test(String(trial.error.message))) continue;
      // other errors (RLS etc) — assume column exists and use it
      const res = await anon.from('cart_items').select('*').eq(col as any, user_id);
      if (res.error) throw new Error(res.error.message);
      return res.data || [];
    } else {
      const res = await anon.from('cart_items').select('*').eq(col as any, user_id);
      if (res.error) throw new Error(res.error.message);
      return res.data || [];
    }
  }

  // fallback: trip join
  if (tripIds.length > 0) {
    const trial = await anon.from('cart_items').select('id').in('trip_id' as any, tripIds).limit(1);
    if (!trial.error || !/does not exist/i.test(String(trial.error?.message || ''))) {
      const res = await anon.from('cart_items').select('*').in('trip_id', tripIds);
      if (res.error) throw new Error(res.error.message);
      return res.data || [];
    }
  }

  // schema has neither user column nor usable trip_id
  const err: any = new Error('cart_items has neither user column nor usable trip_id');
  err.code = 'DB_SCHEMA_MISSING';
  throw err;
}

export async function GET(req: NextRequest) {
  const operationId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  try {
    const authed = await validateBearerUser(req.headers.get('authorization'));
    if (!authed) {
      return NextResponse.json(
        { code: 'AUTH_INVALID', message: 'Missing or invalid Bearer token', operationId },
        { status: 401 }
      );
    }
    const user_id = authed.id;

    const { SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) User (RLS)
    const userRes = await anon.from('users').select('*').eq('id', user_id).maybeSingle();
    if (userRes.error) {
      return NextResponse.json({ code: 'DB_ERROR', message: userRes.error.message, operationId }, { status: 500 });
    }

    // 2) Trips owned by user (RLS)
    const tripsRes = await anon.from('trips').select('*').eq('user_id', user_id);
    if (tripsRes.error) {
      return NextResponse.json({ code: 'DB_ERROR', message: tripsRes.error.message, operationId }, { status: 500 });
    }
    const trips = tripsRes.data || [];
    const tripIds = trips.map((t: any) => t.id);

    // 3) Orders for those trips (RLS)
    let orders: any[] = [];
    if (tripIds.length > 0) {
      const ordersRes = await anon.from('orders').select('*').in('trip_id', tripIds);
      if (ordersRes.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: ordersRes.error.message, operationId }, { status: 500 });
      }
      orders = ordersRes.data || [];
    }

    // 4) Order items filtered to those orders (RLS)
    let order_items: any[] = [];
    if (orders.length > 0) {
      const orderItemsRes = await anon.from('order_items').select('*');
      if (orderItemsRes.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: orderItemsRes.error.message, operationId }, { status: 500 });
      }
      const allItems = orderItemsRes.data || [];
      const orderIdSet = new Set(orders.map((o: any) => o.id));
      order_items = allItems.filter((oi: any) => orderIdSet.has(oi.order_id));
    }

    // 5) Cart items — adaptive
    let cart_items: any[] = [];
    try {
      cart_items = await resolveCartItems(anon, user_id, tripIds);
    } catch (e: any) {
      if (e?.code === 'DB_SCHEMA_MISSING') {
        return NextResponse.json({ code: 'DB_SCHEMA_MISSING', message: e.message, operationId }, { status: 500 });
      }
      return NextResponse.json({ code: 'DB_ERROR', message: e?.message || 'Cart items fetch failed', operationId }, { status: 500 });
    }

    // Audit (best-effort)
    await writeAuditEvent(anon, user_id, operationId, {
      counts: {
        trips: trips.length,
        orders: orders.length,
        order_items: order_items.length,
        cart_items: cart_items.length,
      },
      source: 'live',
    });

    return NextResponse.json(
      {
        ok: true,
        source: 'live',
        user: userRes.data || null,
        trips,
        orders,
        order_items,
        cart_items,
        operationId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const code = err?.code === 'ENV_MISSING' ? 'ENV_MISSING' : 'INTERNAL_ERROR';
    const message = err?.message || 'Unknown error';
    return NextResponse.json({ code, message, operationId }, { status: 500 });
  }
}
