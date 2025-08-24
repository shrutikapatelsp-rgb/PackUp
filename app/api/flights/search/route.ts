export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

type SearchQuery = {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  adults?: number;
};

type FlightOffer = {
  provider: string;
  from: string;
  to: string;
  depart_at: string;
  return_at?: string;
  price: number;
  currency: string;
  airline?: string;
  deep_link?: string;
};

type FlightsResponse = {
  ok: boolean;
  source: 'mock' | 'live' | 'error';
  offers: FlightOffer[];
  error?: string;
};

const MOCK: FlightOffer[] = [
  {
    provider: 'Travelpayouts',
    from: 'BLR',
    to: 'DEL',
    depart_at: '2025-09-01T09:00:00Z',
    return_at: '2025-09-11T18:00:00Z',
    price: 5999,
    currency: 'INR',
    airline: 'MockAir',
    deep_link: 'https://aviasales.com/redirect/mock'
  }
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q: SearchQuery = {
    origin: url.searchParams.get('origin')?.toUpperCase() || '',
    destination: url.searchParams.get('destination')?.toUpperCase() || '',
    depart_date: url.searchParams.get('depart_date') || '',
    return_date: url.searchParams.get('return_date') || undefined,
    adults: Number(url.searchParams.get('adults') || '1')
  };

  if (!q.origin || !q.destination || !q.depart_date) {
    return NextResponse.json<FlightsResponse>({
      ok: false,
      source: 'error',
      offers: [],
      error: 'Missing required params'
    }, { status: 400 });
  }

  // Mock mode for now
  if (process.env.TRAVELPAYOUTS_USE_MOCK !== '0') {
    return NextResponse.json<FlightsResponse>({
      ok: true,
      source: 'mock',
      offers: MOCK
    }, { status: 200 });
  }

  try {
    const token = process.env.TRAVELPAYOUTS_TOKEN!;
    const tpUrl = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${q.origin}&destination=${q.destination}&departure_at=${q.depart_date}&return_at=${q.return_date ?? ''}&currency=inr&token=${token}`;
    const res = await fetch(tpUrl, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`TP HTTP ${res.status}`);
    const data = await res.json();

    const offers: FlightOffer[] = (data?.data || []).map((item: any) => ({
      provider: 'Travelpayouts',
      from: q.origin,
      to: q.destination,
      depart_at: item.departure_at,
      return_at: item.return_at,
      price: item.price,
      currency: item.currency,
      airline: item.airline,
      deep_link: item.link
    }));

    return NextResponse.json<FlightsResponse>({ ok: true, source: 'live', offers }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json<FlightsResponse>({ ok: false, source: 'error', offers: [], error: msg }, { status: 502 });
  }
}

