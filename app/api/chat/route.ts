// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { callOpenAIForItinerary } from '../../lib/openai';
import { supabaseAnon } from '../../lib/supabaseServer';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const operationId = crypto.randomUUID();
  try {
    const body = await req.json();
    const { prompt } = body ?? {};

    const USE_MOCK = (process.env.USE_MOCK ?? '1') === '1';
    if (USE_MOCK) {
      const mock = {
        message: 'Mock itinerary generated (USE_MOCK=1).',
        itinerary: {
          title: 'Mock Trip',
          days: [
            { day: 1, theme: 'Mock day', places: ['Mock Place'], details: 'This is a mock day.', images: [{ query: 'Pangong Tso', caption: 'Pangong', reason: 'Iconic' }] }
          ]
        }
      };
      return NextResponse.json({ ...mock, operationId });
    }

    // If prompt includes "generate itinerary", call itinerary generator path (server-side)
    const raw = await callOpenAIForItinerary({ prompt });
    // return raw JSON as text (client may parse)
    return NextResponse.json({ raw, operationId });

  } catch (err: any) {
    return NextResponse.json({ code: 'OPENAI_INVALID_OUTPUT', message: String(err?.message ?? err), operationId }, { status: 502 });
  }
}

