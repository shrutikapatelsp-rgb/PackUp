import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const ACTIVITIES_USE_MOCK = process.env.ACTIVITIES_USE_MOCK === '0';
const MARKER = process.env.TRAVELPAYOUTS_MARKER!;

function makeClickId(userId: string, payload: any) {
  return crypto.createHash('md5').update(userId + JSON.stringify(payload)).digest('hex');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const date = searchParams.get('date');
    const userId = searchParams.get('userId') ?? 'anon';

    if (!city || !date) {
      return NextResponse.json({ ok: false, source: 'error', offers: [], error: 'Missing params' });
    }

    if (ACTIVITIES_USE_MOCK) {
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
            deep_link: `https://travelpayouts.com/activities/search/${city}?marker=${MARKER}&click_id=${makeClickId(userId, { city, date })}`
          }
        ]
      });
    }

    // 🔥 Live Viator API (via Travelpayouts activities feed)
    const apiUrl = `https://travelpayouts-activities.p.rapidapi.com/activities?location=${encodeURIComponent(city)}&date=${date}`;
    const resp = await fetch(apiUrl, {
      headers: {
        'X-Access-Token': process.env.TRAVELPAYOUTS_TOKEN!,
      },
    });
    const data = await resp.json();

    const offers = (data?.data || []).map((a: any) => {
      const clickId = makeClickId(userId, { city, date, activity: a.title });
      const deepLink = `https://travelpayouts.com/activities/search/${encodeURIComponent(city)}?marker=${MARKER}&click_id=${clickId}`;
      return {
        provider: 'Travelpayouts Activities',
        city,
        date,
        activity_name: a.title,
        price: a.price?.amount ?? 0,
        currency: a.price?.currency ?? 'INR',
        deep_link: deepLink
      };
    });

    return NextResponse.json({ ok: true, source: 'live', offers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, source: 'error', offers: [], error: e.message });
  }
}

