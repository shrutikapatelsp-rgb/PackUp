/**
 * app/api/chat/route.ts
 * POST /api/chat
 * Accepts a trip request payload, calls OpenAI Chat Completions, and returns a structured itinerary.
 *
 * Security: server-only uses OPENAI_API_KEY from env.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Simple in-memory rate limiter (per-instance). For production use Upstash/Redis.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60s window
const RATE_LIMIT_MAX = 10; // 10 requests per IP per window
const ipCounters = new Map<string, { tsWindowStart: number; count: number }>();

const RequestSchema = z.object({
  request: z.object({
    origin: z.string().min(2),
    destination: z.string().min(2),
    depart: z.string().min(8), // YYYY-MM-DD
    ret: z.string().optional(),
    adults: z.number().int().min(1).optional().default(1),
    notes: z.string().optional(),
  }),
  context: z.object({ userId: z.string().optional() }).optional(),
});

type RequestBody = z.infer<typeof RequestSchema>;

function rateLimitExceeded(ip: string) {
  const now = Date.now();
  const entry = ipCounters.get(ip);
  if (!entry) {
    ipCounters.set(ip, { tsWindowStart: now, count: 1 });
    return false;
  }
  if (now - entry.tsWindowStart > RATE_LIMIT_WINDOW_MS) {
    // reset window
    ipCounters.set(ip, { tsWindowStart: now, count: 1 });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }
  entry.count += 1;
  return false;
}

function mkMockItinerary(body: RequestBody['request']) {
  return {
    title: `Quick trip: ${body.origin} → ${body.destination}`,
    summary: `A short sample itinerary from ${body.origin} to ${body.destination} departing ${body.depart}.`,
    items: [
      {
        type: 'flight',
        provider: 'MockAir',
        from: body.origin,
        to: body.destination,
        depart_at: `${body.depart}T06:30:00+05:30`,
        return_at: body.ret ? `${body.ret}T18:00:00+05:30` : null,
        price: 4999,
        currency: 'INR',
        deep_link: `https://search.mockair.example/flights?origin=${body.origin}&destination=${body.destination}`,
      },
      {
        type: 'hotel',
        provider: 'MockHotel',
        city: body.destination,
        check_in: body.depart,
        check_out: body.ret || body.depart,
        hotel_name: 'Mock Palace',
        price: 7999,
        currency: 'INR',
        deep_link: `https://mockhotels.example/search?city=${body.destination}`,
      },
    ],
  };
}

export async function POST(req: Request) {
  try {
    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (rateLimitExceeded(ip)) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
    }

    const json = await req.json().catch(() => null);
    const parse = RequestSchema.safeParse(json);
    if (!parse.success) {
      return NextResponse.json({ ok: false, error: 'invalid_payload', details: parse.error.format() }, { status: 400 });
    }
    const body = parse.data;

    // If USE_MOCK=1, return a deterministic mock itinerary
    if (process.env.USE_MOCK === '1') {
      const itinerary = mkMockItinerary(body.request);
      return NextResponse.json({ ok: true, source: 'mock', itinerary });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!OPENAI_KEY) {
      // fallback to mock if key missing
      const itinerary = mkMockItinerary(body.request);
      return NextResponse.json({ ok: true, source: 'mock', itinerary, warning: 'OPENAI_API_KEY missing on server' });
    }

    // Build system + user messages to request strict JSON output
    const systemPrompt = `
You are PackUp Itinerary Assistant. When asked to create an itinerary, you MUST return only valid JSON (no additional commentary).
The JSON must have this schema:

{
  "title": string,
  "summary": string,
  "items": [
    {
      "type": "flight" | "hotel" | "activity",
      "provider": string,
      // for flight:
      "from"?: string, "to"?: string, "depart_at"?: string, "return_at"?: string,
      // for hotel:
      "city"?: string, "check_in"?: string, "check_out"?: string, "hotel_name"?: string,
      // for activity:
      "activity_name"?: string, "date"?: string,
      "price": number,
      "currency": string,
      "deep_link": string
    }
  ]
}

Use ISO dates where possible. If you cannot produce a field, use null. Keep numbers as numbers. The outermost JSON only — do not print markdown or commentary. Keep output parsable.
`;

    const userPrompt = `Create an itinerary for this request:
Origin: ${body.request.origin}
Destination: ${body.request.destination}
Depart: ${body.request.depart}
Return: ${body.request.ret || 'N/A'}
Adults: ${body.request.adults}
Notes: ${body.request.notes || 'none'}

Produce the JSON strictly following the schema.`;

    // Call OpenAI Chat Completions
    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
      n: 1,
      // stop not required because we enforce JSON; but model may include extra text
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('OpenAI error', resp.status, text);
      // fallback mock
      const itinerary = mkMockItinerary(body.request);
      return NextResponse.json({ ok: true, source: 'mock', itinerary, error: `openai_error_${resp.status}` }, { status: 200 });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';

    // Attempt to extract JSON object from raw text (in case model included backticks or text)
    let jsonStr = raw.trim();
    // Remove leading/trailing backticks or code fences if present
    if (jsonStr.startsWith('```')) {
      const fenceIndex = jsonStr.indexOf('\n');
      if (fenceIndex > -1) {
        jsonStr = jsonStr.slice(fenceIndex + 1);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
    }
    // Try to find first "{" and last "}" to substring
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    try {
      const itinerary = JSON.parse(jsonStr);
      return NextResponse.json({ ok: true, source: 'openai', itinerary, raw });
    } catch (parseErr) {
      console.warn('Failed to parse JSON from model output', parseErr);
      // Return raw output so frontend can display and we can debug
      return NextResponse.json({ ok: false, source: 'openai', error: 'parse_failed', raw });
    }
  } catch (err) {
    console.error('chat route error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
