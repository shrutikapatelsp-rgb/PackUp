import { NextRequest, NextResponse } from 'next/server';
import { normalizeDeepLink } from '@/src/app/lib/deeplinks';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const city = searchParams.get('city') || 'Delhi';
  const checkIn = searchParams.get('check_in') || '2025-09-10';
  const checkOut = searchParams.get('check_out') || '2025-09-12';
  const userId = searchParams.get('userId') || 'anon';

  try {
    if (process.env.HOTELS_USE_MOCK === '1') {
      const mockLink = normalizeDeepLink(
        '/search/Delhi',
        userId,
        'hotels',
        { city, checkIn, checkOut }
      );

      return NextResponse.json({
        ok: true,
        source: 'mock',
        offers: [
          {
            provider: 'Travelpayouts Hotels',
            city,
            check_in: checkIn,
            check_out: checkOut,
            hotel_name: 'Mock Palace',
            price: 4500,
            currency: 'INR',
            deep_link: mockLink,
          },
        ],
      });
    }

    // TODO: Replace with real Travelpayouts Hotels API call
    return NextResponse.json({
      ok: true,
      source: 'live',
      offers: [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, source: 'error', offers: [], error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

