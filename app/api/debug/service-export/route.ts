/**
 * app/api/debug/service-export/route.ts
 * Service-role debug export that uses correct schema relations:
 * user -> trips -> orders -> order_items, and trips -> cart_items.
 *
 * TEMPORARY: local-only, protected by DEBUG_SECRET. Remove after debugging.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? '';

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
    if (!SUPABASE_URL || !SUPABASE_SERVICE) {
      return NextResponse.json({ ok: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE or URL missing' }, { status: 500 });
    }

    const reqUrl = new globalThis.URL(req.url);
    const email = (reqUrl.searchParams.get('email') || '').trim();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Missing email query param' }, { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });

    // find user by email in public.users or auth.users
    let userRes = await sb.from('users').select('id,email,display_name,created_at').eq('email', email).maybeSingle();
    let user = userRes?.data ?? null;
    if (!user) {
      const adminUrl = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
      const authAdmin = await fetch(adminUrl, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE,
          Authorization: `Bearer ${SUPABASE_SERVICE}`,
          'Content-Type': 'application/json',
        },
      });
      if (authAdmin.ok) {
        const authJson = await authAdmin.json();
        let authArray = Array.isArray(authJson) ? authJson : authJson?.users;
        if (Array.isArray(authArray) && authArray.length > 0) {
          const au = authArray[0];
          user = { id: au.id, email: au.email, display_name: au.user_metadata?.full_name ?? null, created_at: au.created_at };
        }
      }
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const uid = user.id;

    // fetch trips for user
    const tripsRes = await sb.from('trips').select('*').eq('user_id', uid);
    const trips = tripsRes.data ?? [];
    const tripIds = trips.map(t => t.id);

    // fetch orders linked to trips
    let orders: any[] = [];
    if (tripIds.length > 0) {
      const ordersRes = await sb.from('orders').select('*').in('trip_id', tripIds);
      orders = ordersRes.data ?? [];
    }

    // fetch order_items linked to orders
    let order_items: any[] = [];
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const oiRes = await sb.from('order_items').select('*').in('order_id', orderIds);
      order_items = oiRes.data ?? [];
    }

    // fetch cart_items linked to trips
    let cart_items: any[] = [];
    if (tripIds.length > 0) {
      const ciRes = await sb.from('cart_items').select('*').in('trip_id', tripIds);
      cart_items = ciRes.data ?? [];
    }

    return NextResponse.json({
      ok: true,
      source: 'service-role-debug',
      user,
      trips,
      orders,
      order_items,
      cart_items,
    });
  } catch (err: any) {
    console.error('[service-export] unexpected', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
