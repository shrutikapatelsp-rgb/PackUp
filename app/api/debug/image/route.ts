import { NextRequest, NextResponse } from 'next/server';
import { validateBearer } from '@/app/lib/supabaseServer';
import { fetchOneImage } from '@/app/lib/imageFetcher';
import { v4 as uuidv4 } from 'uuid';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const operationId = uuidv4();
  try {
    const auth = req.headers.get('authorization') || '';
    const user = await validateBearer(auth);
    if (!user) {
      return NextResponse.json({ code: 'AUTH_INVALID', message: 'Missing or invalid token', operationId }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    if (!q) {
      return NextResponse.json({ code: 'BAD_REQUEST', message: 'Query param q is required', operationId }, { status: 400 });
    }
    // Prefer Google if configured; imageFetcher will fall back to others.
    const img = await fetchOneImage(q, { prefer: ['google'] });
    if (!img) {
      return NextResponse.json({ code: 'IMAGE_FETCH_FAILED', message: 'No provider returned image', operationId, details: { q } }, { status: 502 });
    }
    return NextResponse.json({ ok: true, image: img, operationId });
  } catch (e: any) {
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: e?.message || 'Unknown', operationId }, { status: 500 });
  }
}
