export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

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
type FlightsResponse =
  | { ok: true; source: 'mock' | 'live'; offers: FlightOffer[]; error?: string }
  | { ok: false; source: 'error'; offers: FlightOffer[]; error: string };

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
    deep_link: 'https://aviasales.com/redirect/mock',
  },
];

const TP_API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = (url.searchParams.get('origin') || '').toUpperCase();
  const destination = (url.searchParams.get('destination') || '').toUpperCase();
  const depart_date = url.searchParams.get('depart_date') || '';
  const return_date = url.searchParams.get('return_date') || '';

  if (!origin || !destination || !depart_date) {
    return NextResponse.json<FlightsResponse>(
      { ok: false, source: 'error', offers: [], error: 'Missing required params: origin, destination, depart_date' },
      { status: 400 }
    );
  }

  // 🔒 Hard toggle: force mock when TRAVELPAYOUTS_USE_MOCK !== '0'
  const forceMock = process.env.TRAVELPAYOUTS_USE_MOCK !== '0';
  const token = process.env.TRAVELPAYOUTS_TOKEN;

  if (forceMock || !token) {
    return NextResponse.json<FlightsResponse>(
      { ok: true, source: 'mock', offers: normalize(MOCK, origin, destination, depart_date, return_date) },
      { status: 200 }
    );
  }

  // Live call to Travelpayouts with safe timeouts + graceful fallback to mock
  try {
    const tpUrl = new URL(TP_API);
    tpUrl.searchParams.set('origin', origin);
    tpUrl.searchParams.set('destination', destination);
    tpUrl.searchParams.set('departure_at', depart_date);
    if (return_date) tpUrl.searchParams.set('return_at', return_date);
    tpUrl.searchParams.set('currency', 'inr');
    tpUrl.searchParams.set('token', token);

    const res = await fetch(tpUrl.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      // graceful fallback to mock if upstream errors
      return NextResponse.json<FlightsResponse>(
        {
          ok: true,
          source: 'mock',
          offers: normalize(MOCK, origin, destination, depart_date, return_date),
          error: `Travelpayouts HTTP ${res.status}`,
        },
        { status: 200 }
      );
    }

    const data = await res.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    const offers: FlightOffer[] = items
      .map((it: any): FlightOffer => ({
        provider: 'Travelpayouts',
        from: origin,
        to: destination,
        depart_at: it?.departure_at ?? `${depart_date}T09:00:00Z`,
        return_at: it?.return_at ?? (return_date ? `${return_date}T18:00:00Z` : undefined),
        price: Number(it?.price ?? 0),
        currency: (it?.currency || 'INR').toUpperCase(),
        airline: it?.airline || undefined,
        deep_link: it?.link || undefined,
      }))
      .filter((o) => o.price > 0);

    return NextResponse.json<FlightsResponse>(
      {
        ok: true,
        source: 'live',
        offers: offers.length ? offers : normalize(MOCK, origin, destination, depart_date, return_date),
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json<FlightsResponse>(
      {
        ok: true,
        source: 'mock',
        offers: normalize(MOCK, origin, destination, depart_date, return_date),
        error: `Travelpayouts error: ${msg}`,
      },
      { status: 200 }
    );
  }
}

function normalize(list: FlightOffer[], from: string, to: string, depart: string, ret: string): FlightOffer[] {
  return list.map((o) => ({
    ...o,
    from,
    to,
    depart_at: o.depart_at || `${depart}T09:00:00Z`,
    return_at: o.return_at || (ret ? `${ret}T18:00:00Z` : undefined),
    currency: (o.currency || 'INR').toUpperCase(),
  }));
}
