export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type ItinIntent = {
  origin?: string;
  destination?: string;
  date_from?: string;
  date_to?: string;
  pax?: number;
  budget?: number;
  vibe?: string;
};

const MOCK = {
  flights: [
    { provider: 'MockAir', from: 'BLR', to: 'IXL', price: 14500, currency: 'INR', depart: '2025-09-01', return: '2025-09-11' }
  ],
  hotels: [
    { provider: 'MockStay', name: 'Leh View Inn', nights: 10, price: 32000, currency: 'INR' }
  ],
  activities: [
    { provider: 'MockTours', name: 'Khardung La Day Trip', price: 2500, currency: 'INR' }
  ],
};

function mockResponse(intent: ItinIntent, note: string) {
  return {
    flights: MOCK.flights,
    hotels: MOCK.hotels,
    activities: MOCK.activities,
    notes: `${note} | intent=${JSON.stringify(intent)}`,
  };
}

export async function POST(req: NextRequest) {
  const intent = (await safeJson(req)) as ItinIntent;

  // Force mock via env
  if (process.env.USE_MOCK === '1') {
    return NextResponse.json(
      mockResponse(intent, 'Mock mode enabled via USE_MOCK=1'),
      { status: 200 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      mockResponse(intent, 'OPENAI_API_KEY missing; returning mock'),
      { status: 200 }
    );
  }

  // Try real OpenAI; fallback to mock on any error (incl. 429)
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const sys =
      "You are Packup's itinerary planner. Return compact JSON with keys: flights, hotels, activities, notes. " +
      "Use realistic but concise results. If input is vague, assume sensible defaults. Output pure JSON only.";

    const messages: any[] = [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ intent, candidate_offers: MOCK }) },
    ];

    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
    });

    const text = r.choices?.[0]?.message?.content ?? '{}';
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: 200 });
    } catch {
      return NextResponse.json(
        mockResponse(intent, 'Model returned non-JSON; using mock'),
        { status: 200 }
      );
    }
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : String(e);
    return NextResponse.json(
      mockResponse(intent, `OpenAI error: ${msg}; returning mock`),
      { status: 200 }
    );
  }
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
