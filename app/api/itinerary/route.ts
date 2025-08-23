import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const mockFlights = [
  { provider: 'MockAir', from: 'BLR', to: 'IXL', price: 14500, currency: 'INR', depart: '2025-09-01', return: '2025-09-11' }
];
const mockHotels = [
  { provider: 'MockStay', name: 'Leh View Inn', nights: 10, price: 32000, currency: 'INR' }
];
const mockActivities = [
  { provider: 'MockTours', name: 'Khardung La Day Trip', price: 2500, currency: 'INR' }
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sys = `You are Packup's itinerary planner.
Return compact JSON with keys: flights, hotels, activities, notes.
Do not return markdown or code fences.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ intent: body, candidate_offers: { flights: mockFlights, hotels: mockHotels, activities: mockActivities } }) }
    ];

    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2
    });

    const text = r.choices[0]?.message?.content ?? '{}';
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
