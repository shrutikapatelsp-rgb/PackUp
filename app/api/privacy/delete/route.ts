import { NextRequest, NextResponse } from 'next/server';

// Avoid static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type DeletedCounts = {
  order_items: number;
  orders: number;
  cart_items: number;
  trips: number;
  users: number;
};

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

async function writeAuditEvent(eventsClient: any, user_id: string, operationId: string, deleted: DeletedCounts) {
  try {
    await eventsClient.from('events').insert({
      type: 'privacy.delete',
      payload: { user_id, operationId, deleted },
    });
  } catch {
    // best-effort only
  }
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

    // Gather order ids, then delete order_items
    const { data: ordersList, error: ordersListErr } = await srv.from('orders').select('id').eq('user_id', user_id);
    if (ordersListErr) {
      return NextResponse.json({ code: 'DB_ERROR', message: ordersListErr.message, operationId }, { status: 500 });
    }
    const orderIds = (ordersList || []).map((o: any) => o.id);

    if (orderIds.length > 0) {
      const { data: delOrderItems, error: delOrderItemsErr } = await srv
        .from('order_items')
        .delete()
        .in('order_id', orderIds)
        .select('id');
      if (delOrderItemsErr) {
        return NextResponse.json({ code: 'DB_ERROR', message: delOrderItemsErr.message, operationId }, { status: 500 });
      }
      deleted.order_items = delOrderItems?.length || 0;
    }

    const { data: delOrders, error: delOrdersErr } = await srv
      .from('orders')
      .delete()
      .eq('user_id', user_id)
      .select('id');
    if (delOrdersErr) {
      return NextResponse.json({ code: 'DB_ERROR', message: delOrdersErr.message, operationId }, { status: 500 });
    }
    deleted.orders = delOrders?.length || 0;

    const { data: delCart, error: delCartErr } = await srv
      .from('cart_items')
      .delete()
      .eq('user_id', user_id)
      .select('id');
    if (delCartErr) {
      return NextResponse.json({ code: 'DB_ERROR', message: delCartErr.message, operationId }, { status: 500 });
    }
    deleted.cart_items = delCart?.length || 0;

    const { data: delTrips, error: delTripsErr } = await srv
      .from('trips')
      .delete()
      .eq('user_id', user_id)
      .select('id');
    if (delTripsErr) {
      return NextResponse.json({ code: 'DB_ERROR', message: delTripsErr.message, operationId }, { status: 500 });
    }
    deleted.trips = delTrips?.length || 0;

    const { data: delUsers, error: delUsersErr } = await srv.from('users').delete().eq('id', user_id).select('id');
    if (delUsersErr) {
      // anonymize fallback if FK prevents delete
      await srv.from('users').update({ email: null, display_name: null }).eq('id', user_id);
    } else {
      deleted.users = delUsers?.length || 0;
    }

    await writeAuditEvent(srv, user_id, operationId, deleted);
    return NextResponse.json({ ok: true, deleted, operationId }, { status: 200 });
  } catch (err: any) {
    const code = err?.code === 'ENV_MISSING' ? 'ENV_MISSING' : 'INTERNAL_ERROR';
    const message = err?.message || 'Unknown error';
    return NextResponse.json({ code, message, operationId }, { status: 500 });
  }
}


