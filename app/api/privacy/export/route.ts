/**
 * app/api/privacy/export/route.ts
 * Exports PII-scoped rows for the authenticated user.
 *
 * Uses the Bearer token from the request to validate the user (via supabase auth.getUser).
 * Uses the public anon key to call the DB; RLS policies must enforce user-scoped reads.
 *
 * Returned shape:
 * { ok:true, source:'live', user, trips, orders, order_items, cart_items }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getSupabaseWithJwt(jwt: string): SupabaseClient {
  // create a transient client that forwards the user's JWT so RLS restricts reads
  return createClient(URL, ANON, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    if (!URL || !ANON) {
      console.error('[privacy/export] missing env NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      return NextResponse.json({ ok: false, source: 'live', error: 'Server misconfiguration' }, { status: 500 });
    }

    const sb = getSupabaseWithJwt(jwt);

    // Validate token -> user
    const { data: authData, error: authErr } = await sb.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }
    const user = authData.user;
    const uid = user.id;

    // Fetch user-scoped data in parallel (RLS should ensure only user's rows are returned)
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
  } catch (err: any) {
    console.error('[privacy/export] error', err);
    return NextResponse.json({ ok: false, source: 'error', error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
