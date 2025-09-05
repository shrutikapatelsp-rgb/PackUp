/**
 * app/api/chat/route.ts
 *
 * Server route to generate itineraries using OpenAI (Chat Completions)
 * - Protects PII by scrubbing emails/phone numbers from the user prompt before sending to OpenAI.
 * - If the client sends a Supabase access token as Bearer, we attempt to fetch the user's recent trips
 *   (using the anon key + forwarded JWT so RLS applies) and include them as context.
 * - Respects USE_MOCK=1 to return consistent mock responses for local/dev.
 *
 * Environment variables required:
 * - OPENAI_API_KEY (server-only)
 * - OPENAI_MODEL (optional, default 'gpt-4o-mini')
 * - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL (optional for user context)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY (optional for user context)
 * - USE_MOCK=1 for mock responses
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const USE_MOCK = (process.env.USE_MOCK ?? '1') === '1';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

/** Validate incoming body */
const BodySchema = z.object({
  message: z.string().min(1),
  // optional: client can pass a frontend hint like "tone" or "days", but keep minimal
  options: z
    .object({
      days: z.number().int().positive().optional(),
      tone: z.string().optional(),
    })
    .optional(),
});

/** Basic PII scrub: remove emails and phone-like strings */
function scrubPII(text: string): string {
  if (!text) return text;
  // remove emails
  text = text.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[email_redacted]');
  // remove phone numbers (various formats)
  text = text.replace(/(\+?\d{1,3}[-.\s]?)?(\(?\d{3,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g, '[phone_redacted]');
  return text;
}

function getBearer(req: NextRequest): string | null {
  const raw = req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** Create supabase client that forwards the user's JWT (so RLS applies). */
function createSupabaseWithJwt(jwt: string): SupabaseClient | null {
  if (!SUPA_URL || !SUPA_ANON || !jwt) return null;
  return createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
}

/** Optionally fetch user's recent trips (non-blocking if fails) */
async function fetchUserTripsIfAvailable(req: NextRequest): Promise<any[] | null> {
  try {
    const jwt = getBearer(req);
    if (!jwt || !SUPA_URL || !SUPA_ANON) return null;
    const sb = createSupabaseWithJwt(jwt);
    if (!sb) return null;
    const { data, error } = await sb.from('trips').select('id,title,origin,destination,date_from,date_to,payload').order('created_at', { ascending: false }).limit(5);
    if (error) {
      console.warn('[chat] user trips fetch error', error);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn('[chat] fetchUserTripsIfAvailable error', err);
    return null;
  }
}

/** Call OpenAI Chat Completions endpoint (with retries) */
async function callOpenAI(messages: { role: string; content: string }[]) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 1200,
    n: 1,
  };

  // simple retries for transient network errors
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // keep timeout to platform defaults; Vercel server functions have platform timeouts
      });
      if (!res.ok) {
        const txt = await res.text();
        lastErr = new Error(`OpenAI error: ${res.status} ${txt}`);
        // retry on 5xx, else break
        if (res.status >= 500) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        } else {
          throw lastErr;
        }
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
      return { raw: data, reply: String(reply) };
    } catch (err: any) {
      lastErr = err;
      // small backoff
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      continue;
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    let parsed;
    try {
      parsed = BodySchema.parse(JSON.parse(bodyText));
    } catch (err) {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }

    const userPromptRaw: string = parsed.message;
    const userPrompt = scrubPII(userPromptRaw);

    // Mock fallback (fast dev)
    if (USE_MOCK) {
      // simple deterministic mock for development/testing
      const mockReply = `Mock itinerary for: ${userPrompt}\n\nDay 1: Arrival & rest\nDay 2: City highlights\nDay 3: Activities\n\n(Use OPENAI_API_KEY and set USE_MOCK=0 to enable real GPT.)`;
      return NextResponse.json({ ok: true, source: 'mock', reply: mockReply });
    }

    // Build system prompt: packaged instructions for itinerary generation
    const systemPrompt = [
      "You are PackUp AI — an expert travel planner who writes clear, structured itineraries for users.",
      "Return an itinerary with: title, day-by-day plan with times, suggested flight info placeholders, suggested hotels (one per night), activities, approximate price estimates in INR if local to India, and affiliate deep link placeholders.",
      "Produce output in plain text. Use bullet lists and short sentences. Provide JSON at the end under a 'JSON:' block with a machine-friendly structure: { title, days: [{ date, summary, items: [] }], estimates: { total: number, currency: 'INR' } }.",
      "Do not include any user PII. If the user's prompt includes PII it should be redacted.",
      "If you have user's recent trips context, integrate similar items into suggestions where relevant."
    ].join(' ');

    // Optionally fetch user trips and include as context
    const userTrips = await fetchUserTripsIfAvailable(req);
    const tripsContext = userTrips && userTrips.length > 0 ? `User recent trips: ${JSON.stringify(userTrips)}` : '';

    // Construct messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(tripsContext ? [{ role: 'system', content: `Context: ${tripsContext}` }] : []),
      { role: 'user', content: userPrompt },
    ];

    // Call OpenAI
    const { reply, raw } = await callOpenAI(messages);

    // return reply and light metadata (no PII)
    return NextResponse.json({ ok: true, source: 'openai', reply, meta: { model: OPENAI_MODEL } });
  } catch (err: any) {
    console.error('[api/chat] error', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
