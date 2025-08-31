import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const date = searchParams.get('date');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !date) {
      return NextResponse.json({ ok: false, source: 'error', error: 'Missing required params: city, date' }, { status: 400 });
    }

    // Build click_id
    const clickId = crypto.createHash('md5').update(`${userId}-${city}-${date}`).digest('hex');

    // Example Travelpayouts Activities API (replace with correct endpoint if different)
    const url = `https://api.travelpayouts.com/activities/v1/prices?city=${encodeURIComponent(city)}&date=${date}&partner_id=${process.env.TRAVELPAYOUTS_MARKER}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      return NextResponse.json({ ok: false, source: 'live', error: 'Activities API error', raw: await resp.json() }, { status: resp.status });
    }
    const data = await resp.json();

    const offers = (data?.activities || []).map((a: any) => ({
      provider: 'Travelpayouts Activities',
      city,
      date,
      activity_name: a.title,
      price: a.price,
      currency: 'INR',
      deep_link: `https://travelpayouts.com/activities/search/${encodeURIComponent(city)}?marker=${process.env.TRAVELPAYOUTS_MARKER}&click_id=${clickId}`
    }));

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: err.message });
  }
}

