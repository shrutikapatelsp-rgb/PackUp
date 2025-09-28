import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Force runtime behavior to avoid static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type ReqBody = {
  destination: string;
  startDate: string;
  endDate: string;
  origin?: string;
  days?: number;
  travelers?: string;
  style?: string;
};

function readEnv() {
  return {
    USE_MOCK: process.env.USE_MOCK === '1' ? 1 : 0,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
    SUPABASE_IMAGE_BUCKET: process.env.SUPABASE_IMAGE_BUCKET || 'packup-images',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_CX: process.env.GOOGLE_CX,
  };
}

async function strictJsonItineraryPrompt(_: ReqBody) {
  // Keep prompt construction inside the function
  return {
    title: 'Mock Trip',
    days: [
      {
        day: 1,
        theme: 'Arrival',
        places: ['Main Square'],
        details: 'Welcome!',
        images: [{ query: 'city skyline sunrise', caption: 'Sunrise', reason: 'Arrival vibe' }],
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  const operationId = uuidv4();

  try {
    const env = readEnv();
    const body = (await req.json()) as ReqBody;

    // Basic validation
    if (!body?.destination || !body?.startDate || !body?.endDate) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'destination, startDate, endDate are required', operationId },
        { status: 400 }
      );
    }

    // MOCK path (no external deps)
    if (env.USE_MOCK === 1) {
      const itineraryJson = await strictJsonItineraryPrompt(body);
      const markdown = `# ${itineraryJson.title}\n\n- Day 1: ${itineraryJson.days[0].theme}`;
      return NextResponse.json({ itineraryJson, markdown, operationId }, { status: 200 });
    }

    // Real path: import heavy libs lazily to avoid build-time side-effects
    const [{ getStrictItinerary }, { fetchImagesForItinerary }] = await Promise.all([
      import('@/app/lib/openai'),
      import('@/app/lib/imageFetcher'),
    ]);

    // Generate
    const itineraryJson = await getStrictItinerary(body, {
      model: env.OPENAI_MODEL,
      apiKey: env.OPENAI_API_KEY,
      operationId,
    });

    // Fetch & upload images (throws IMAGE_FETCH_FAILED on total failure)
    const withImages = await fetchImagesForItinerary(itineraryJson, {
      bucket: env.SUPABASE_IMAGE_BUCKET!,
      operationId,
    });

    const markdown = `# ${withImages.title}\n` + withImages.days.map(d => `- Day ${d.day}: ${d.theme}`).join('\n');

    return NextResponse.json({ itineraryJson: withImages, markdown, operationId }, { status: 200 });
  } catch (err: any) {
    // Normalize known codes if thrown upstream
    const message = err?.message || 'Unknown error';
    const code =
      err?.code && typeof err.code === 'string'
        ? err.code
        : message.includes('IMAGE_FETCH_FAILED')
        ? 'IMAGE_FETCH_FAILED'
        : message.includes('OPENAI')
        ? 'OPENAI_INVALID_OUTPUT'
        : 'INTERNAL_ERROR';

    return NextResponse.json({ code, message, operationId }, { status: 500 });
  }
}
