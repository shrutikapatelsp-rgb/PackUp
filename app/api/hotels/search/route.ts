import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const checkIn = searchParams.get('check_in');
    const checkOut = searchParams.get('check_out');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !checkIn || !checkOut) {
      return NextResponse.json({ ok: false, source: 'error', offers: [], error: 'Missing params' }, { status: 400 });
    }

    const token = process.env.TRAVELPAYOUTS_TOKEN!;
    const marker = process.env.TRAVELPAYOUTS_MARKER!;

    const url = `https://engine.hotellook.com/api/v2/cache.json?location=${encodeURIComponent(
      city
    )}&currency=in&checkIn=${checkIn}&checkOut=${checkOut}&limit=5&token=${token}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Hotels API error: ${r.status}`);
    const data = await r.json();

    const offers = (data || []).map((o: any) => {
      return {
        provider: 'Travelpayouts Hotels',
        city,
        check_in: checkIn,
        check_out: checkOut,
        hotel_name: o.hotelName,
        price: o.priceFrom,
        currency: 'INR',
        deep_link: `https://search.hotellook.com/search/${encodeURIComponent(city)}?marker=${marker}&click_id=${userId}`,
      };
    });

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', offers: [], error: err.message }, { status: 500 });
  }
}

