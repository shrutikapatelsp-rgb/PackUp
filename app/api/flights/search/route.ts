export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = (url.searchParams.get('origin') || '').toUpperCase();
  const destination = (url.searchParams.get('destination') || '').toUpperCase();
  const depart = url.searchParams.get('depart_date') || '';
  const ret = url.searchParams.get('return_date') || '';

  if (!origin || !destination || !depart) {
    return NextResponse.json(
      { ok: false, source: 'error', offers: [], error: 'Missing required params' },
      { status: 400 }
    );
  }

  // Mock response for now (works without any external keys)
  return NextResponse.json(
    {
      ok: true,
      source: 'mock',
      offers: [
        {
          provider: 'Travelpayouts',
          from: origin,
          to: destination,
          depart_at: `${depart}T09:00:00Z`,
          return_at: ret ? `${ret}T18:00:00Z` : undefined,
          price: 5999,
          currency: 'INR',
          airline: 'MockAir',
          deep_link: 'https://aviasales.com/redirect/mock'
        }
      ]
    },
    { status: 200 }
  );
}

