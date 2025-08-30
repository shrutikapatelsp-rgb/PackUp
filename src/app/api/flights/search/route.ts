import { NextRequest, NextResponse } from 'next/server';
import { buildAviasalesDeepLink } from '@/src/app/lib/deeplinks';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get('origin') || 'DEL';
  const destination = searchParams.get('destination') || 'BOM';
  const depart = searchParams.get('depart_date') || '2025-09-10';
  const ret = searchParams.get('ret') || '';
  const userId = searchParams.get('userId') || 'anon';

  try {
    const deep_link = buildAviasalesDeepLink({
      base: 'https://aviasales.tpm.lv/8D5ZUDEn', // your Travelpayouts deeplink
      marker: process.env.TRAVELPAYOUTS_MARKER!,
      origin,
      destination,
      depart,
      ret,
      adults: 1,
      userId
    });

    return NextResponse.json({
      ok: true,
      source: 'live',
      offers: [
        {
          provider: 'aviasales',
          price: 5000,          // placeholder, replace with API call later
          currency: 'INR',
          deep_link
        }
      ]
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, source: 'live', error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

