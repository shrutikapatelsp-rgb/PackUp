import { env } from 'process';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const USE_MOCK = (process.env.USE_MOCK === '1' || process.env.USE_MOCK === 'true');

export type ItinerarySchema = {
  title: string;
  days: Array<{
    day: number;
    theme: string;
    places: string[];
    details: string;
    images: Array<{ query: string; caption?: string; reason?: string }>;
  }>;
};

/** Static mock itinerary for Leh (useful to test image fetching from Google / providers) */
function staticLehItinerary(): ItinerarySchema {
  return {
    title: "Leh & Pangong Tso — 5 Day Photography Escape",
    days: [
      {
        day: 1,
        theme: "Arrival in Leh & Acclimatization",
        places: ["Leh", "Local markets", "Shanti Stupa"],
        details:
          "Arrive in Leh, check into your guesthouse, rest and acclimatize. Short walk to Shanti Stupa for soft evening light and panoramic views over Leh city.",
        images: [
          {
            query: "Leh Shanti Stupa sunset skyline",
            caption: "Shanti Stupa at sunset",
            reason: "Iconic hillside monument with panoramic views"
          }
        ]
      },
      {
        day: 2,
        theme: "Leh Old Town & Thiksey Monastery",
        places: ["Leh Old Town", "Thiksey Monastery"],
        details:
          "Explore Leh's old town lanes and markets in the morning. Afternoon drive to Thiksey Monastery for classic Himalayan monastery vistas and prayer wheel close-ups.",
        images: [
          {
            query: "Thiksey Monastery panoramic Leh Ladakh",
            caption: "Thiksey Monastery view",
            reason: "Monastery complex set on a hill with valley views"
          },
          {
            query: "Leh Old Town narrow lanes market",
            caption: "Leh local market",
            reason: "Local culture and colorful market scenes"
          }
        ]
      },
      {
        day: 3,
        theme: "Sangam & Magnetic Hill — Roadside Wonders",
        places: ["Sangam (Indus-Zanskar confluence)", "Magnetic Hill"],
        details:
          "Drive along scenic roads visiting the river confluence at Sangam and the quirky Magnetic Hill. Great roadside photo stops and portraits with dramatic mountain backdrops.",
        images: [
          {
            query: "Sangam Indus Zanskar confluence Ladakh",
            caption: "Sangam river confluence",
            reason: "Iconic river meeting point in Ladakh"
          },
          {
            query: "Magnetic Hill Ladakh road optical illusion",
            caption: "Magnetic Hill",
            reason: "Famous optical magnet hill attraction"
          }
        ]
      },
      {
        day: 4,
        theme: "Pangong Tso Arrival",
        places: ["Pangong Tso", "Spangmik village"],
        details:
          "Early departure for Pangong Tso with stops en-route. Afternoon at the lake capturing turquoise water and vast salt flats. Stay overnight near the lake for sunrise photography.",
        images: [
          {
            query: "Pangong Tso turquoise lake sunrise",
            caption: "Pangong Tso at sunrise",
            reason: "Famous lake with vivid colors"
          },
          {
            query: "Spangmik Pangong Tso village houses",
            caption: "Spangmik village by Pangong",
            reason: "Lakeside village framing blue waters"
          }
        ]
      },
      {
        day: 5,
        theme: "Back to Leh via Changla Pass",
        places: ["Changla Pass", "Return to Leh"],
        details:
          "Drive back to Leh via Changla Pass with sweeping alpine views. Stop for high-altitude panoramas before returning to Leh for an evening of rest and market exploration.",
        images: [
          {
            query: "Changla Pass high altitude Leh panorama",
            caption: "Changla Pass panorama",
            reason: "High mountain pass views and wide landscapes"
          }
        ]
      }
    ]
  };
}

/** Minimal OpenAI call (unchanged behavior) */
async function callOpenAI(systemPrompt: string, userPrompt: string, operationId: string) {
  if (!OPENAI_KEY) {
    const e: any = new Error('OPENAI_API_KEY missing');
    e.code = 'OPENAI_MISSING_KEY';
    throw e;
  }
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 2000
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
      'x-operation-id': operationId
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err: any = new Error(`OpenAI API error: ${res.status}`);
    err.code = 'OPENAI_API_ERROR';
    err.details = { status: res.status, statusText: res.statusText, body: txt };
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err: any = new Error('OPENAI_INVALID_OUTPUT: no content');
    err.code = 'OPENAI_INVALID_OUTPUT';
    err.details = { raw: data };
    throw err;
  }
  return String(content);
}

function tryExtractJson(text: string) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const sub = text.slice(first, last + 1);
  try {
    return JSON.parse(sub);
  } catch {
    return null;
  }
}

/** Public function used by itinerary route */
export async function generateItineraryJSON(userPrompt: string, operationId: string) {
  // If mock enabled or OpenAI key missing -> return static Leh itinerary for testing
  if (USE_MOCK || !OPENAI_KEY) {
    return staticLehItinerary();
  }

  const system = `You are PackUp itinerary generator. Output STRICT JSON only matching this schema:
{
  "title":"<title>",
  "days":[
    {
      "day": 1,
      "theme":"Day title",
      "places":["Place A","Place B"],
      "details":"2-4 sentence narrative",
      "images":[{"query":"Pangong Tso winter blue lake","caption":"short caption","reason":"why this image"}]
    }
  ]
}
Do not include any commentary. Output only valid JSON. Use localised names and short captions. Ensure number of days matches the user's dates if provided.`;

  const output = await callOpenAI(system, userPrompt, operationId);

  try {
    const parsed = JSON.parse(output);
    return parsed;
  } catch {
    const extracted = tryExtractJson(output);
    if (extracted) return extracted;
    const err: any = new Error('OPENAI_INVALID_OUTPUT: could not parse JSON from model');
    err.code = 'OPENAI_INVALID_OUTPUT';
    err.raw = output;
    throw err;
  }
}
