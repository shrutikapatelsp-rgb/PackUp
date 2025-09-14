import { NextResponse } from 'next/server';

const USE_MOCK = process.env.USE_MOCK === '1' || process.env.USE_MOCK === 'true';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = body?.message || '';

  if (USE_MOCK) {
    return NextResponse.json({
      ok: true,
      source: 'mock',
      reply: `Mock itinerary for: ${message}\n\nDay 1: Arrival & rest\nDay 2: City highlights\nDay 3: Activities\n\n(Use OPENAI_API_KEY and set USE_MOCK=0 to enable real GPT.)`,
    });
  }

  // When not mock, call itinerary endpoint (server-side call)
  try {
    const jwt = req.headers.get('authorization') || '';
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/itinerary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: jwt,
      },
      body: JSON.stringify({
        // Simple mapping: use message as destination / prompt
        destination: message,
        startDate: body.startDate || new Date().toISOString().slice(0, 10),
        endDate: body.endDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        origin: body.origin || 'Bangalore',
        travelers: body.travelers || 'couple',
        style: body.style || '',
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, source: 'itinerary', error: j, status: res.status }, { status: 502 });
    }
    // Return itinerary JSON or a friendly text reply
    const reply = `Itinerary created: ${j.itineraryJson?.title || 'Untitled'}`;
    return NextResponse.json({ ok: true, source: 'itinerary', itinerary: j.itineraryJson, markdown: j.markdown, reply });
  } catch (err: any) {
    return NextResponse.json({ ok: false, source: 'error', error: String(err?.message || err) }, { status: 500 });
  }
}
