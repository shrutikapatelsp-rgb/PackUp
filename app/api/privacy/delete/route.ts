import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function DELETE(req: NextRequest) {
  try {
    const jwt = req.headers.get('authorization')?.split('Bearer ')[1];
    if (!jwt) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    // Delete user-related data
    await sb.from('trips').delete().eq('user_id', user.id);
    await sb.from('orders').delete().eq('user_id', user.id);
    await sb.from('order_items').delete().eq('user_id', user.id);
    await sb.from('cart_items').delete().eq('user_id', user.id);
    await sb.from('users').delete().eq('id', user.id);

    return NextResponse.json({ ok: true, source: 'live', message: 'User and related data deleted' });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err.message }, { status: 500 });
  }
}

