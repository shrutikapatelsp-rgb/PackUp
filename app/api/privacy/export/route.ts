import { NextRequest, NextResponse } from 'next/server';

// Avoid static optimization
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
  } catch {
    // best-effort only
  }
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

    const [userRes, tripsRes, ordersRes, orderItemsRes, cartItemsRes] = await Promise.all([
      anon.from('users').select('*').eq('id', user_id).maybeSingle(),
      anon.from('trips').select('*').eq('user_id', user_id),
      anon.from('orders').select('*').eq('user_id', user_id),
      anon.from('order_items').select('*'),
      anon.from('cart_items').select('*').eq('user_id', user_id),
    ]);

    for (const r of [userRes, tripsRes, ordersRes, orderItemsRes, cartItemsRes]) {
      if (r.error) {
        return NextResponse.json({ code: 'DB_ERROR', message: r.error.message, operationId }, { status: 500 });
      }
    }

    const user = userRes.data || null;
    const trips = tripsRes.data || [];
    const orders = ordersRes.data || [];
    const order_items_all = orderItemsRes.data || [];
    const cart_items = cartItemsRes.data || [];

    const orderIds = new Set(orders.map((o: any) => o.id));
    const order_items = order_items_all.filter((oi: any) => orderIds.has(oi.order_id));

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
      { ok: true, source: 'live', user, trips, orders, order_items, cart_items, operationId },
      { status: 200 }
    );
  } catch (err: any) {
    const code = err?.code === 'ENV_MISSING' ? 'ENV_MISSING' : 'INTERNAL_ERROR';
    const message = err?.message || 'Unknown error';
    return NextResponse.json({ code, message, operationId }, { status: 500 });
  }
}

