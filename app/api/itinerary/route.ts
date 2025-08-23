export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// ---- Types ----
type ItinIntent = {
  origin?: string;
  destination?: string;
  date_from?: string;
  date_to?: string;
  pax?: number;
  budget?: number;
  vibe?: string;
};

type Flight = { provider: string; from: string; to: string; price: number; currency: string; depart?: string; return?: string; };
type Hotel  = { provider: string; name: string; nights: number; price: number; currency: string; };
type Activity = { provider: string; name: string; price: number; currency: string; };

type Itinerary = {
  flights: Flight[];
  hotels: Hotel[];
  activities: Activity[];
  notes?: string;
};

type ChatMessage = { role: 'system' | 'user'; content: string };

// ---- Mock Data ----
const MOCK: Itinerary = {
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

function mockResponse(intent: ItinIntent, note: string): Itinerary {
  return { ...MOCK, notes: `${note} | intent=${JSON.stringify(intent)}` };
}

export async function POST(req: NextRequest) {
  const intent = (await safeJson(req)) as ItinIntent;

  // Force mock via env
  if (process.env.USE_MOCK === '1') {
    return NextResponse.json<Itinerary>(mockResponse(intent, 'Mock mode enabled via USE_MOCK=1'), { status: 200 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json<Itinerary>(mockResponse(intent, 'OPENAI_API_KEY missing; returning mock'), { status: 200 });
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const sys =
      "You are Packup's itinerary planner. Return compact JSON with keys: flights, hotels, activities, notes. " +
      "Use realistic but concise results. If input is vague, assume sensible defaults. Output pure JSON only.";

    const messages: ChatMessage[] = [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ intent, candidate_offers: MOCK }) }
    ];

    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
    });

    const text = r.choices?.[0]?.message?.content ?? '{}';

    try {
      const json = JSON.parse(text) as Partial<Itinerary>;
      const result: Itinerary = {
        flights: Array.isArray(json.flights) ? (json.flights as Flight[]) : MOCK.flights,
        hotels: Array.isArray(json.hotels) ? (json.hotels as Hotel[]) : MOCK.hotels,
        activities: Array.isArray(json.activities) ? (json.activities as Activity[]) : MOCK.activities,
        notes: typeof json.notes === 'string' ? json.notes : 'AI response parsed; some fields defaulted',
      };
      return NextResponse.json<Itinerary>(result, { status: 200 });
    } catch {
      return NextResponse.json<Itinerary>(mockResponse(intent, 'Model returned non-JSON; using mock'), { status: 200 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json<Itinerary>(mockResponse(intent, `OpenAI error: ${msg}; returning mock`), { status: 200 });
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

