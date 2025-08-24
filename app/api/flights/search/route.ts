import { NextRequest, NextResponse } from 'next/server';

const API_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get('origin') || 'BLR';
  const destination = searchParams.get('destination') || 'DEL';
  const depart_date = searchParams.get('depart_date') || '2025-09-01';
  const return_date = searchParams.get('return_date') || '2025-09-11';

  // 🔹 If no token, fall back to mock data
  if (!process.env.TRAVELPAYOUTS_TOKEN) {
    return NextResponse.json({
      ok: true,
      source: 'mock',
      offers: [
        {
          provider: 'Travelpayouts',
          from: origin,
          to: destination,
          depart_at: depart_date,
          return_at: return_date,
          price: 5999,
          currency: 'INR',
          airline: 'MockAir',
          deep_link: 'https://aviasales.com/redirect/mock',
        },
      ],
    });
  }

  try {
    const url = `${API_URL}?origin=${origin}&destination=${destination}&depart_date=${depart_date}&return_date=${return_date}&unique=false&sorting=price&token=${process.env.TRAVELPAYOUTS_TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Travelpayouts API error: ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json({
      ok: true,
      source: 'travelpayouts',
      offers: data.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Unknown error',
    });
  }
}

