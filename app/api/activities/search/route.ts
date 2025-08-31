import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const date = searchParams.get('date');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !date) {
      return NextResponse.json({ ok: false, source: 'error', offers: [], error: 'Missing params' }, { status: 400 });
    }

    const marker = process.env.TRAVELPAYOUTS_MARKER!;

    // Travelpayouts Activities endpoint (demo implementation, replace with live API once docs available)
    const url = `https://travelpayouts.com/api/activities?city=${encodeURIComponent(city)}&date=${date}&marker=${marker}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Activities API error: ${r.status}`);
    const data = await r.json();

    const offers = (data.activities || []).map((a: any) => {
      return {
        provider: 'Travelpayouts Activities',
        city,
        date,
        activity_name: a.name,
        price: a.price,
        currency: a.currency || 'INR',
        deep_link: `https://travelpayouts.com/activities/search/${encodeURIComponent(city)}?marker=${marker}&click_id=${userId}`,
      };
    });

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', offers: [], error: err.message }, { status: 500 });
  }
}

