console.log("HOTELS_USE_MOCK =", process.env.HOTELS_USE_MOCK);
console.log("ACTIVITIES_USE_MOCK =", process.env.ACTIVITIES_USE_MOCK);

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const USE_MOCK = process.env.TRAVELPAYOUTS_USE_MOCK === '1';
const MARKER = process.env.TRAVELPAYOUTS_MARKER!;

function makeClickId(userId: string, payload: any) {
  return crypto.createHash('md5').update(userId + JSON.stringify(payload)).digest('hex');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const checkIn = searchParams.get('check_in');
    const checkOut = searchParams.get('check_out');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !checkIn || !checkOut) {
      return NextResponse.json({ ok: false, source: 'error', offers: [], error: 'Missing params' });
    }

if (USE_MOCK) {
  return NextResponse.json({
    ok: true,
    source: "mock",
    offers: [
      {
        provider: "Travelpayouts Hotels",
        city,
        check_in: checkIn,
        check_out: checkOut,
        hotel_name: "Mock Palace",
        price: 4500,
        currency: "INR",
        deep_link: `https://search.hotellook.com/search/${city}?marker=${MARKER}&click_id=${makeClickId(userId, { city, checkIn, checkOut })}`
      }
    ]
  });
}

    // 🔥 Live Hotellook API
    const apiUrl = `https://engine.hotellook.com/api/v2/cache.json?city=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&limit=5&currency=inr&token=${process.env.TRAVELPAYOUTS_TOKEN}`;

    const resp = await fetch(apiUrl);
    const data = await resp.json();

    const offers = (data || []).map((h: any) => {
      const clickId = makeClickId(userId, { city, checkIn, checkOut, hotel: h.hotelName });
      const deepLink = `https://search.hotellook.com/search/${encodeURIComponent(city)}?marker=${MARKER}&click_id=${clickId}`;
      return {
        provider: 'Travelpayouts Hotels',
        city,
        check_in: checkIn,
        check_out: checkOut,
        hotel_name: h.hotelName,
        price: h.priceFrom,
        currency: 'INR',
        deep_link: deepLink
      };
    });

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, source: 'error', offers: [], error: e.message });
  }
}

