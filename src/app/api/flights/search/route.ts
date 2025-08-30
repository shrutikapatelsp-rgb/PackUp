import { NextRequest, NextResponse } from 'next/server';
import { makeClickId } from '@/src/app/lib/pseudo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get('origin') || 'DEL';
  const destination = searchParams.get('destination') || 'BOM';
  const depart = searchParams.get('depart_date') || '2025-09-10';
  const ret = searchParams.get('ret') || '';
  const userId = searchParams.get('userId') || 'anon';

  try {
    if (process.env.TRAVELPAYOUTS_USE_MOCK === '1') {
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
            deep_link: 'https://aviasales.com/redirect/mock'
          }
        ]
      });
    }

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

    const offers = (data?.data || []).map((o: any) => {
  // build full affiliate link
  const clickId = makeClickId(userId, { o: origin, d: destination, depart, ret });
  const separator = o.link.includes('?') ? '&' : '?';
const full_link = `https://search.aviasales.com${o.link}${separator}marker=${process.env.TRAVELPAYOUTS_MARKER!}&click_id=${clickId}`;

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

