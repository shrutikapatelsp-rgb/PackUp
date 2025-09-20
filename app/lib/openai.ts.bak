import { env } from 'process';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_KEY) {
  // If missing, error early on server side
  // We'll still allow the file to exist so build works, but functions will throw.
  // This is deliberate to fail fast at runtime if envs are missing.
  // Do not expose OPENAI_KEY to client.
  // eslint-disable-next-line no-console
  console.warn('OPENAI_API_KEY not set - OpenAI calls will fail.');
}

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
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
      'x-operation-id': operationId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err: any = new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    err.code = 'OPENAI_API_ERROR';
    err.details = { status: res.status, statusText: res.statusText, body: txt };
    throw err;
  }

  const data = await res.json();
  // Chat completions -> data.choices[0].message.content
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
  // Try to find first "{" and last "}" to extract JSON block
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

export async function generateItineraryJSON(userPrompt: string, operationId: string) {
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

  // Try JSON.parse directly first
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
