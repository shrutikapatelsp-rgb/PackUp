import { v4 as uuidv4 } from 'uuid';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const USE_MOCK = (process.env.USE_MOCK ?? '1') === '1';

export type OpenAIItineraryOptions = {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
};

export async function callOpenAIForItinerary(opts: OpenAIItineraryOptions) {
  if (USE_MOCK) {
    // return a mocked strict JSON string for development
    const mock = {
      title: "Mock: 3-day sample trip to Pangong Tso",
      days: [
        {
          day: 1,
          theme: "Arrival & Lakeside Walk",
          places: ["Leh Market", "Pangong Tso Viewpoint"],
          details: "Arrival and light acclimatization. Short lakeside walk in the evening.",
          images: [
            {
              query: "Pangong Tso winter blue lake",
              caption: "Pangong Tso in winter",
              reason: "Iconic blue lake view"
            }
          ]
        }
      ]
    };
    return JSON.stringify(mock);
  }

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const systemPrompt = `You are a strict JSON generator. For inputs describing destination / dates / style, output ONLY a single JSON object (no prose, no markdown) matching this EXACT schema:
{
  "title":"string",
  "days":[
    {
      "day": number,
      "theme":"short title",
      "places":["Place A","Place B"],
      "details":"2-4 sentence narrative",
      "images":[
        { "query":"search terms", "caption":"short caption", "reason":"short reason" }
      ]
    }
  ]
}
Ensure valid JSON. Dates or other fields should NOT appear outside this schema.`;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: opts.prompt }
    ],
    max_tokens: opts.max_tokens ?? 1200,
    temperature: opts.temperature ?? 0.2,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t}`);
  }

  const data = await res.json();

  // attempt to extract JSON from assistant content
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OPENAI_INVALID_OUTPUT');

  // try to find first { ... } JSON block
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('OPENAI_INVALID_OUTPUT');
  }
  const jsonText = raw.slice(firstBrace, lastBrace + 1);
  return jsonText;
}

