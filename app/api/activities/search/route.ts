import { NextRequest, NextResponse } from 'next/server';
import { normalizeDeepLink } from '@/src/app/lib/deeplinks';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const city = searchParams.get('city') || 'Delhi';
  const date = searchParams.get('date') || '2025-09-10';
  const userId = searchParams.get('userId') || 'anon';

  try {
    if (process.env.ACTIVITIES_USE_MOCK === '1') {
      const mockLink = normalizeDeepLink(
        '/search/Delhi',
        userId,
        'activities',
        { city, date }
      );

      return NextResponse.json({
        ok: true,
        source: 'mock',
        offers: [
          {
            provider: 'Travelpayouts Activities',
            city,
            date,
            activity_name: 'Mock City Tour',
            price: 1200,
            currency: 'INR',
            deep_link: mockLink,
          },
        ],
      });
    }

    // TODO: Replace with real Viator/GetYourGuide API call
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

