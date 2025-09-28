// app/api/privacy/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAnon, supabaseService } from '../../../lib/supabaseServer';
import crypto from 'crypto';

export async function DELETE(req: NextRequest) {
  const operationId = crypto.randomUUID();
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ code: 'AUTH_INVALID', message: 'Missing Authorization', operationId }, { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const anon = supabaseAnon();
  try {
    const usr = await anon.auth.getUser(token);
    if (!usr?.data?.user) {
      return NextResponse.json({ code: 'AUTH_INVALID', message: 'Invalid token', operationId }, { status: 401 });
    }
    const userId = usr.data.user.id;

    // Do deletions via service role to bypass RLS safely
    const deleted: Record<string, number> = {};
    // delete cart items
    {
      const { count, error } = await supabaseService.from('cart_items').delete().eq('user_id', userId).select('*', { count: 'exact' });
      deleted['cart_items'] = count ?? 0;
    }
    // delete order_items via orders first
    const { data: orders, error: oErr } = await supabaseService.from('orders').select('id').eq('user_id', userId);
    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length) {
      const { count } = await supabaseService.from('order_items').delete().in('order_id', orderIds).select('*', { count: 'exact' });
      deleted['order_items'] = count ?? 0;
      const { count: orderCount } = await supabaseService.from('orders').delete().eq('user_id', userId).select('*', { count: 'exact' });
      deleted['orders'] = orderCount ?? 0;
    } else {
      deleted['order_items'] = 0;
      deleted['orders'] = 0;
    }

    // delete trips
    {
      const { count } = await supabaseService.from('trips').delete().eq('user_id', userId).select('*', { count: 'exact' });
      deleted['trips'] = count ?? 0;
    }

    // anonymize user row rather than delete (DPDP friendly) - remove PII columns but keep agnostic record
    const anonEmail = `deleted_${userId}@deleted.packup`;
    const { error: uErr } = await supabaseService.from('users').update({ email: anonEmail, display_name: 'deleted_user' }).eq('id', userId);

    // write audit event
    try {
      await supabaseService.from('events').insert([{
        type: 'privacy_delete',
        payload: {
          user_id: userId,
          operationId,
          counts: deleted
        }
      }]);
    } catch (e) {
      console.warn('privacy delete event failed', e);
    }

    return NextResponse.json({ ok: true, deleted, operationId }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: String(err?.message ?? err), operationId }, { status: 500 });
  }
}

