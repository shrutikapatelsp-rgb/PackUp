// app/api/itinerary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAnon, supabaseService } from '../../lib/supabaseServer';
import { callOpenAIForItinerary } from '../../lib/openai';
import { fetchImageAndUpload } from '../../lib/imageFetcher';
import crypto from 'crypto';

// helper for JSON schema validation (lightweight)
function validateItineraryObject(obj: any) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not_object' };
  if (!Array.isArray(obj.days)) return { ok: false, reason: 'days_missing' };
  for (const day of obj.days) {
    if (typeof day.day !== 'number') return { ok: false, reason: 'day_number_missing' };
    if (!Array.isArray(day.places)) return { ok: false, reason: 'places_missing' };
    if (!Array.isArray(day.images)) return { ok: false, reason: 'images_missing' };
  }
  return { ok: true };
}

function mdFromItinerary(it: any) {
  const lines: string[] = [];
  lines.push(`# ${it.title}\n`);
  for (const d of it.days) {
    lines.push(`## Day ${d.day}: ${d.theme}`);
    lines.push(`${d.details}\n`);
    if (d.places && d.places.length) {
      lines.push(`**Top places:** ${d.places.join(', ')}`);
    }
    if (d.images && d.images.length) {
      for (const img of d.images) {
        lines.push(`![${img.caption}](${img.publicUrl})`);
        lines.push(`*${img.caption} — ${img.author ?? 'source'}*`);
      }
    }
    lines.push('\n---\n');
  }
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  const operationId = crypto.randomUUID();
  try {
    const body = await req.json();
    const { destination, startDate, endDate, origin, days, travelers, style } = body ?? {};

    // Validate Authorization Bearer token from client
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 'AUTH_INVALID', message: 'Missing Authorization', operationId }, { status: 401 });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // Validate token via anon client (RLS) to get user id
    const anon = supabaseAnon();
    const { data: userResp, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !userResp?.user) {
      return NextResponse.json({ code: 'AUTH_INVALID', message: 'Invalid token', details: userErr?.message, operationId }, { status: 401 });
    }
    const user = userResp.user;
    const userId = user.id;

    // build prompt for OpenAI
    const prompt = `Destination: ${destination}\nStart: ${startDate}\nEnd: ${endDate}\nOrigin: ${origin ?? ''}\nDays: ${days ?? ''}\nTravelers: ${travelers ?? ''}\nStyle: ${style ?? ''}\n\nProduce ONLY the exact strict JSON itinerary schema required.`;

    // call OpenAI (or mock)
    let rawJsonText: string;
    try {
      rawJsonText = await callOpenAIForItinerary({ prompt });
    } catch (err: any) {
      return NextResponse.json({ code: 'OPENAI_INVALID_OUTPUT', message: String(err?.message ?? err), operationId }, { status: 502 });
    }

    // parse JSON
    let itineraryObj: any;
    try {
      itineraryObj = JSON.parse(rawJsonText);
    } catch (err) {
      return NextResponse.json({ code: 'OPENAI_INVALID_OUTPUT', message: 'OpenAI produced invalid JSON', details: rawJsonText, operationId }, { status: 502 });
    }

    const v = validateItineraryObject(itineraryObj);
    if (!v.ok) {
      return NextResponse.json({ code: 'OPENAI_INVALID_OUTPUT', message: `Itinerary validation failed: ${v.reason}`, details: itineraryObj, operationId }, { status: 400 });
    }

    // For each image query across all days, fetch and upload
    for (let i = 0; i < itineraryObj.days.length; i++) {
      const day = itineraryObj.days[i];
      for (let j = 0; j < day.images.length; j++) {
        const imgReq = day.images[j];
        const query = imgReq.query;
        const res = await fetchImageAndUpload(query, operationId);
        if (!res.ok) {
          // If any image fetch fails, return IMAGE_FETCH_FAILED with diagnostics
          return NextResponse.json({
            code: 'IMAGE_FETCH_FAILED',
            message: `Image fetch failed for query: ${query}`,
            operationId,
            details: res,
          }, { status: 502 });
        }
        // attach public url and metadata back into itinerary
        day.images[j] = {
          ...imgReq,
          publicUrl: res.publicUrl,
          provider: res.provider,
          originalUrl: res.originalUrl,
          author: res.author,
          license: res.license,
          storagePath: res.storagePath,
        };
      }
    }

    // create a trip row (server-side) using service role
    try {
      const { data: tripData, error: tripError } = await supabaseService
        .from('trips')
        .insert([{ user_id: userId, title: itineraryObj.title ?? `Trip to ${destination}`, payload: itineraryObj }])
        .select()
        .limit(1)
        .single();
      // ignore error but log
      if (tripError && !tripData) {
        console.warn('trip insert error', tripError);
      }
    } catch (err) {
      // non-fatal
      console.warn('trip insert exception', err);
    }

    // generate markdown summary
    const markdown = mdFromItinerary(itineraryObj);

    // write an event
    try {
      await supabaseService.from('events').insert([{
        type: 'itinerary_generated',
        payload: {
          user_id: userId,
          destination,
          startDate,
          endDate,
          operationId,
        }
      }]);
    } catch (err) {
      console.warn('event write failed', err);
    }

    return NextResponse.json({ itineraryJson: itineraryObj, markdown, operationId }, { status: 200 });

  } catch (err: any) {
    const operationId = crypto.randomUUID();
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: String(err?.message ?? err), operationId }, { status: 500 });
  }
}

