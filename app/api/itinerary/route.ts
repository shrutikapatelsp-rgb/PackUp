import { NextResponse } from 'next/server';
import supabaseServer from '../../lib/supabaseServer';
import { generateItineraryJSON } from '../../lib/openai';
import { fetchAndStoreImage } from '../../lib/imageFetcher';
import { randomUUID } from 'crypto';

type ReqBody = {
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  origin?: string;
  days?: number;
  travelers?: string;
  style?: string;
};

function badRequest(code: string, message: string, details?: any, operationId?: string) {
  return NextResponse.json({ code, message, details, operationId }, { status: 400 });
}

function serverError(code: string, message: string, details?: any, operationId?: string) {
  return NextResponse.json({ code, message, details, operationId }, { status: 500 });
}

export async function POST(req: Request) {
  const operationId = randomUUID();
  try {
    const auth = req.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return badRequest('AUTH_INVALID', 'Missing Authorization Bearer token', null, operationId);
    const token = m[1];

    // Validate token using Supabase /auth API (RLS enforced)
    const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !userData?.user) {
      return badRequest('AUTH_INVALID', 'Invalid or expired token', userErr?.message ?? null, operationId);
    }
    const userId = userData.user.id;

    // parse body
    const body: ReqBody = await req.json().catch(() => ({}));
    if (!body?.destination || !body?.startDate || !body?.endDate) {
      return badRequest('BAD_INPUT', 'destination, startDate and endDate are required', null, operationId);
    }

    // Build user prompt
    const prompt = `Create an itinerary for destination="${body.destination}", startDate="${body.startDate}", endDate="${body.endDate}", origin="${body.origin ?? 'Bangalore'}", travelers="${body.travelers ?? 'couple'}", style="${body.style ?? 'balanced'}". Output strict JSON as specified. Return ${body.days ?? 'auto-compute based on dates'} days.`;

    // Call OpenAI wrapper to get JSON
    let rawItin;
    try {
      rawItin = await generateItineraryJSON(prompt, operationId);
    } catch (err: any) {
      console.error('OPENAI ERROR', { operationId, err: err?.message ?? err });
      return serverError('OPENAI_INVALID_OUTPUT', 'OpenAI returned invalid output', { raw: err?.raw ?? err?.details ?? String(err) }, operationId);
    }

    // Validate structure
    if (!rawItin?.title || !Array.isArray(rawItin.days)) {
      return serverError('OPENAI_INVALID_OUTPUT', 'Itinerary missing required fields', { sample: rawItin }, operationId);
    }

    // For each day: ensure images[] has queries and fetch each image; fail atomically if any image cannot be obtained
    const days = rawItin.days as any[];
    const enrichedDays = [];

    // Collect provider diagnostics in case of total failure
    const providerDiagnostics: any[] = [];

    for (const day of days) {
      if (!Array.isArray(day.images) || day.images.length === 0) {
        return badRequest('BAD_OUTPUT', `Missing images array for day ${day?.day}`, { day }, operationId);
      }

      const enrichedImages: any[] = [];
      // fetch all images for this day sequentially (you can parallelize but we want a stable failure mode)
      for (const imgSpec of day.images) {
        const query = String(imgSpec.query || `${body.destination} ${day.theme || ''}`).slice(0, 200);
        try {
          const fetched = await fetchAndStoreImage(query, { operationId, timeoutMs: 3000 });
          enrichedImages.push({
            caption: imgSpec.caption || '',
            reason: imgSpec.reason || '',
            source: fetched.source,
            author: fetched.author,
            license: fetched.license,
            originalUrl: fetched.originalUrl,
            url: fetched.url,
            path: fetched.path,
            width: fetched.width,
            height: fetched.height,
          });
        } catch (err: any) {
          // failure - bail out
          console.error('IMAGE_FETCH_FAILED', { operationId, day: day.day, query, err: err?.message ?? err, diag: err?.diag });
          providerDiagnostics.push({ day: day.day, query, error: String(err?.message || err), diag: err?.diag ?? null });
          return serverError('IMAGE_FETCH_FAILED', `Failed to fetch image for day ${day?.day}`, { query, diag: err?.diag ?? null }, operationId);
        }
      } // end images loop

      enrichedDays.push({ ...day, images: enrichedImages });
    } // end days loop

    const itineraryJson = { ...rawItin, days: enrichedDays };
    // build markdown summary
    const mdParts: string[] = [`# ${String(itineraryJson.title || 'Itinerary')}`];
    for (const d of itineraryJson.days) {
      mdParts.push(`\n## Day ${d.day}: ${d.theme}`);
      mdParts.push(`${d.details}\n`);
      if (Array.isArray(d.places) && d.places.length) mdParts.push(`**Places:** ${d.places.join(', ')}`);
      if (Array.isArray(d.images)) {
        for (const im of d.images) {
          mdParts.push(`![${im.caption || d.theme}](${im.url})`);
          if (im.caption) mdParts.push(`*${im.caption}*`);
        }
      }
    }
    const markdown = mdParts.join('\n\n');

    // Optionally store the itinerary record in DB (server-only)
    try {
      const payload = {
        user_id: userId,
        title: itineraryJson.title,
        payload: itineraryJson,
        created_at: new Date().toISOString(),
      };
      // attempt insert; ignore error but log
      const { error: insertErr } = await supabaseServer.from('trips').insert(payload);
      if (insertErr) {
        // log but don't fail the response
        console.warn('trip insert failed', { operationId, error: insertErr });
      }
    } catch (e) {
      console.warn('trip insert exception', { operationId, e: String(e) });
    }

    // Return success
    return NextResponse.json({ itineraryJson, markdown, operationId }, { status: 200 });
  } catch (err: any) {
    console.error('ITINERARY_ERROR', { operationId, err: String(err?.message || err), stack: err?.stack });
    return serverError('INTERNAL_ERROR', 'Server error generating itinerary', { error: String(err?.message || err) }, operationId);
  }
}
