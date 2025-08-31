import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const checkIn = searchParams.get('check_in');
    const checkOut = searchParams.get('check_out');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !checkIn || !checkOut) {
      return NextResponse.json({ ok: false, source: 'error', error: 'Missing required params: city, check_in, check_out' }, { status: 400 });
    }

    // Build click_id
    const clickId = crypto.createHash('md5').update(`${userId}-${city}-${checkIn}-${checkOut}`).digest('hex');

    // Call Hotellook API
    const url = `https://engine.hotellook.com/api/v2/cache.json?location=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&currency=inr&limit=5&partner_id=${process.env.TRAVELPAYOUTS_MARKER}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Hotels API error', raw: await resp.json() }, { status: resp.status });
    }
    const data = await resp.json();

    const offers = (data || []).map((o: any) => ({
      provider: 'Travelpayouts Hotels',
      city,
      check_in: checkIn,
      check_out: checkOut,
      hotel_name: o.hotelName,
      price: o.priceFrom,
      currency: 'INR',
      deep_link: `https://search.hotellook.com/hotels?location=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&adults=1&marker=${process.env.TRAVELPAYOUTS_MARKER}&click_id=${clickId}`
    }));

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err.message });
  }
}

