import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const date = searchParams.get('date');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !date) {
      return NextResponse.json(
        { ok: false, source: 'error', error: 'Missing params: city, date' },
        { status: 400 }
      );
    }

    const clickId = crypto
      .createHash('md5')
      .update(`${userId}-${city}-${date}`)
      .digest('hex');

    const marker = process.env.TRAVELPAYOUTS_MARKER!;

    // 1️⃣ Try Activities API (if available for your account)
    try {
      const apiResp = await fetch(
        `https://api.travelpayouts.com/activities/v1/prices?city=${encodeURIComponent(
          city
        )}&date=${date}&currency=inr&limit=5&partner_id=${marker}`,
        { headers: { 'X-Access-Token': process.env.TRAVELPAYOUTS_API_TOKEN! } }
      );

      // Check if JSON response
      const text = await apiResp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null; // fallback if not JSON
      }

      if (data && Array.isArray(data.results)) {
        const offers = data.results.map((a: any) => ({
          provider: 'Travelpayouts Activities',
          city,
          date,
          activity_name: a.title || 'Activity',
          price: a.price || null,
          currency: 'INR',
          deep_link: `https://travelpayouts.com/activities/search/${encodeURIComponent(
            city
          )}?date=${date}&marker=${marker}&click_id=${clickId}`,
        }));

        return NextResponse.json({ ok: true, source: 'live', offers });
      }
    } catch (err) {
      console.warn('Activities API failed, using fallback', err);
    }

    // 2️⃣ Fallback: always at least 1 deep link
    const fallback = [
      {
        provider: 'Travelpayouts Activities',
        city,
        date,
        activity_name: `Things to do in ${city}`,
        price: null,
        currency: 'INR',
        deep_link: `https://travelpayouts.com/activities/search/${encodeURIComponent(
          city
        )}?date=${date}&marker=${marker}&click_id=${clickId}`,
      },
    ];

    return NextResponse.json({ ok: true, source: 'fallback', offers: fallback });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      source: 'error',
      offers: [],
      error: err.message,
    });
  }
}

