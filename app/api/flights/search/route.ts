import { NextRequest, NextResponse } from 'next/server';
import { normalizeDeepLink } from '@/src/app/lib/deeplinks';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get('origin') || 'DEL';
  const destination = searchParams.get('destination') || 'BOM';
  const depart = searchParams.get('depart_date') || '2025-09-10';
  const ret = searchParams.get('ret') || '';
  const userId = searchParams.get('userId') || 'anon';

  try {
    // 🔹 Mock mode toggle
    if (process.env.TRAVELPAYOUTS_USE_MOCK === '1') {
      const mockLink = normalizeDeepLink(
        '/search/DEL1009BOM1?t=mock',
        userId,
        'flights',
        { o: origin, d: destination, depart, ret }
      );

      return NextResponse.json({
        ok: true,
        source: 'mock',
        offers: [
          {
            provider: 'Travelpayouts',
            from: origin,
            to: destination,
            depart_at: '2025-09-01T09:00:00Z',
            return_at: '2025-09-11T18:00:00Z',
            price: 5999,
            currency: 'INR',
            airline: 'MockAir',
            deep_link: mockLink
          }
        ]
      });
    }

    // 🔹 Live API call
    const apiRes = await fetch(
      `https://api.travelpayouts.com/v2/prices/latest?origin=${origin}&destination=${destination}&depart_date=${depart}&currency=INR&limit=5`,
      {
        headers: {
          'X-Access-Token': process.env.TRAVELPAYOUTS_TOKEN!,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!apiRes.ok) {
      throw new Error(`TP API error ${apiRes.status}`);
    }

    const data = await apiRes.json();

    // 🔹 Map into offers (ignore o.link, always normalize)
    const offers = (data?.data || []).map((o: any) => {
      const full_link = normalizeDeepLink(
        o.link,
        userId,
        'flights',
        { o: o.origin, d: o.destination, depart: o.depart_date, ret: o.return_date }
      );

      return {
        provider: 'Travelpayouts',
        from: o.origin,
        to: o.destination,
        depart_at: o.depart_date,
        return_at: o.return_date,
        price: o.value,
        currency: o.currency,
        airline: o.airline,
        deep_link: full_link
      };
    });

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, source: 'error', offers: [], error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

