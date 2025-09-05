/**
 * app/api/debug/service-export/route.ts
 *
 * Temporary local-only debug route that uses SUPABASE_SERVICE_ROLE to export
 * a user's PII-scoped data by email. Protected by a DEBUG_SECRET header.
 *
 * WARNING: This endpoint returns PII. ONLY use locally and delete after debugging.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? '';

function getDebugSecret(req: NextRequest) {
  return req.headers.get('x-debug-secret') || req.headers.get('debug-secret') || '';
}

export async function GET(req: NextRequest) {
  try {
    const debugSecret = getDebugSecret(req);
    const expected = process.env.DEBUG_SECRET || '';
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'Server misconfiguration: DEBUG_SECRET not set' }, { status: 500 });
    }
    if (!debugSecret || debugSecret !== expected) {
      return NextResponse.json({ ok: false, error: 'Forbidden: invalid debug secret' }, { status: 403 });
    }

    if (!URL || !SERVICE) {
      return NextResponse.json({ ok: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE or URL missing' }, { status: 500 });
    }

    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Missing email query param' }, { status: 400 });
    }

    // create service-role client
    const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

    // find user by email in app users table
    const u = await sb.from('users').select('id,email,display_name,created_at').eq('email', email).maybeSingle();
    if (u.error) {
      console.error('[service-export] fetch user error', u.error);
      return NextResponse.json({ ok: false, error: 'DB error fetching user' }, { status: 500 });
    }
    const user = u.data ?? null;
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    const uid = user.id;

    // fetch related tables
    const [tripsRes, ordersRes, orderItemsRes, cartItemsRes, eventsRes] = await Promise.all([
      sb.from('trips').select('*').eq('user_id', uid),
      sb.from('orders').select('*').eq('user_id', uid),
      sb.from('order_items').select('*').eq('user_id', uid),
      sb.from('cart_items').select('*').eq('user_id', uid),
      sb.from('events').select('*').or(`payload->>user_id.eq.${uid},payload->>actor_id.eq.${uid}`),
    ]);

    const errors: Record<string, any> = {};
    if (tripsRes.error) errors.trips = tripsRes.error;
    if (ordersRes.error) errors.orders = ordersRes.error;
    if (orderItemsRes.error) errors.order_items = orderItemsRes.error;
    if (cartItemsRes.error) errors.cart_items = cartItemsRes.error;
    if (eventsRes.error) errors.events = eventsRes.error;

    return NextResponse.json({
      ok: true,
      source: 'service-role-debug',
      user,
      trips: tripsRes.data ?? [],
      orders: ordersRes.data ?? [],
      order_items: orderItemsRes.data ?? [],
      cart_items: cartItemsRes.data ?? [],
      events: eventsRes.data ?? [],
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[service-export] unexpected', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
