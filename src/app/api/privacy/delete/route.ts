import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE!;

export async function POST(req: NextRequest) {
  try {
    const jwt = req.headers.get('authorization')?.split('Bearer ')[1];
    if (!jwt) return NextResponse.json({ ok:false, source:'live', error:'Unauthorized' }, { status: 401 });

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ ok:false, source:'live', error:'Unauthorized' }, { status: 401 });

    // If accounting laws require retention, replace deletes with soft-delete/anonymize.
    const admin = createClient(url, service);
    await admin.from('cart_items').delete().eq('user_id', user.id);
    await admin.from('trips').delete().eq('user_id', user.id);
    await admin.from('orders').delete().eq('user_id', user.id);
    await admin.from('users').delete().eq('id', user.id);

    return NextResponse.json({ ok: true, source: 'live' });
  } catch (e:any) {
    return NextResponse.json({ ok:false, source:'live', error:String(e?.message ?? e) }, { status: 500 });
  }
}
