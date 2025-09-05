import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getBearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function handleDelete(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Unauthorized

