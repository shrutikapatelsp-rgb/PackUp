import { NextRequest, NextResponse } from 'next/server';

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

function getEnv() {
  return {
    USE_MOCK: process.env.USE_MOCK === '1' ? 1 : 0,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_IMAGE_BUCKET: process.env.SUPABASE_IMAGE_BUCKET || 'packup-images',
  };
}

async function validateBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.split(' ')[1]?.trim();
  if (!token) return null;

  const { SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();
  if (!SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

// Build a destination-specific mock itinerary with image queries
function buildMockItinerary(body: ReqBody) {
  const dest = body.destination;
  return {
    title: `Your ${dest} Trip`,
    days: [
      {
        day: 1,
        theme: 'Arrival & First Glimpse',
        places: [`${dest} Main Square`, `${dest} Old Town`],
        details: `Arrive in ${dest}, check in, and take an easy walk to get oriented. Try a local cafe and watch the city wake up.`,
        images: [{ query: `${dest} skyline sunrise`, caption: 'Sunrise skyline', reason: 'Arrival vibes' }],
      },
      {
        day: 2,
        theme: 'Highlights & Must-Sees',
        places: ['Iconic Spot A', 'Iconic Spot B'],
        details: `Spend the day at the top highlights. Consider timed entries to avoid queues.`,
        images: [{ query: `${dest} landmarks`, caption: 'Landmarks', reason: 'Core highlights' }],
      },
      {
        day: 3,
        theme: 'Local Life & Chill',
        places: ['Neighborhood market', 'Park by the water'],
        details: `Slow down, explore markets, and enjoy a relaxed lunch. Perfect wrap-up before departure.`,
        images: [{ query: `${dest} street market`, caption: 'Market life', reason: 'Local culture' }],
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  const operationId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  try {
    const env = getEnv();
    const body = (await req.json()) as ReqBody;

    // required inputs
    if (!body?.destination || !body?.startDate || !body?.endDate) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'destination, startDate, endDate are required', operationId },
        { status: 400 }
      );
    }

    // require auth (we upload to Supabase Storage)
    const userId = await validateBearerUserId(req.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json(
        { code: 'AUTH_INVALID', message: 'Missing or invalid Bearer token', operationId },
        { status: 401 }
      );
    }

    // lazy import heavy libs
    const { fetchImagesForItinerary } = await import('@/app/lib/imageFetcher');

    // MOCK path: still run image pipeline so you get Supabase URLs
    if (env.USE_MOCK === 1) {
      const itineraryJson = buildMockItinerary(body);
      const withImages = await fetchImagesForItinerary(itineraryJson, {
        bucket: env.SUPABASE_IMAGE_BUCKET,
        operationId,
      });
      const markdown =
        `# ${withImages.title}\n` + withImages.days.map((d: any) => `- Day ${d.day}: ${d.theme}`).join('\n');
      return NextResponse.json({ itineraryJson: withImages, markdown, operationId }, { status: 200 });
    }

    // REAL path: generate with OpenAI, then add images
    const { getStrictItinerary } = await import('@/app/lib/openai');
    const itineraryJson = await getStrictItinerary(body, {
      model: env.OPENAI_MODEL,
      apiKey: env.OPENAI_API_KEY,
      operationId,
    });
    const withImages = await fetchImagesForItinerary(itineraryJson, {
      bucket: env.SUPABASE_IMAGE_BUCKET,
      operationId,
    });
    const markdown =
      `# ${withImages.title}\n` + withImages.days.map((d: any) => `- Day ${d.day}: ${d.theme}`).join('\n');
    return NextResponse.json({ itineraryJson: withImages, markdown, operationId }, { status: 200 });
  } catch (err: any) {
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
TS
