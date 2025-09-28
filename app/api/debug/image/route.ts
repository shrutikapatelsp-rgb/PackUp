import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { validateBearer } from '@/app/lib/supabaseServer';
import { fetchOneImage } from '@/app/lib/imageFetcher';

// Ensure this route always runs on the server (no static rendering)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const operationId = uuidv4();

  try {
    // 1) Auth: require a valid Supabase user access token
    const authHeader = req.headers.get('authorization') || '';
    const user = await validateBearer(authHeader);
    if (!user) {
      return NextResponse.json(
        { code: 'AUTH_INVALID', message: 'Missing or invalid token', operationId },
        { status: 401 }
      );
    }

    // 2) Read query param
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'Query param q is required', operationId },
        { status: 400 }
      );
    }

    // 3) Fetch one image using your composite imageFetcher
    // Hint the provider preference to Google CSE if configured;
    // imageFetcher should fall back automatically to others.
    const img = await fetchOneImage(q, { prefer: ['google'] });

    if (!img) {
      return NextResponse.json(
        { code: 'IMAGE_FETCH_FAILED', message: 'No provider returned image', operationId, details: { q } },
        { status: 502 }
      );
    }

    // 4) Success — image should already be uploaded by imageFetcher and include publicUrl + attribution
    return NextResponse.json({ ok: true, image: img, operationId }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: err?.message || 'Unknown', operationId },
      { status: 500 }
    );
  }
}
