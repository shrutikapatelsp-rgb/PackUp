import { NextResponse } from "next/server";

export const runtime = "edge"; // or "nodejs" if you prefer Node runtime

type ReqBody = {
  origin?: string;
  destination: string;
  start_date?: string;
  end_date?: string;
  preferences?: string;
};

export async function POST(req: Request) {
  try {
    const { origin, destination, start_date, end_date, preferences } = (await req.json()) as ReqBody;

    if (!destination) {
      return NextResponse.json({ error: "destination is required" }, { status: 400 });
    }

    // Mock toggle
    if (process.env.USE_MOCK === "1") {
      return NextResponse.json({
        source: "mock",
        itinerary: [
          { day: 1, plan: `Arrive in ${destination}, check in, evening walk around old town.` },
          { day: 2, plan: "City highlights in the morning, museum after lunch, local dinner." },
          { day: 3, plan: "Day trip to nearby attraction, sunset viewpoint on return." },
        ],
      });
    }

    // Build compact prompt
    const prompt = `
Generate a concise day-by-day itinerary as JSON only.

Origin: ${origin || "Not specified"}
Destination: ${destination}
Dates: ${start_date || "unspecified"} to ${end_date || "unspecified"}
Preferences: ${preferences || "General traveler"}

Return strictly this JSON shape:
{
  "itinerary": [
    { "day": <number>, "plan": "<1-2 sentences of activities>" }
  ]
}
`;

    // Call OpenAI
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert travel planner. Keep outputs compact and useful." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenAI ${resp.status}: ${text}`);
    }

    const data = await resp.json();

    // Try to parse JSON from the model
    let parsed: { itinerary: Array<{ day: number; plan: string }> } = { itinerary: [] };
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    try {
      parsed = JSON.parse(content);
      if (!Array.isArray(parsed.itinerary)) throw new Error("Bad itinerary format");
    } catch {
      parsed = { itinerary: [{ day: 1, plan: content || "Itinerary generated, but content was empty." }] };
    }

    return NextResponse.json({ source: "openai", itinerary: parsed.itinerary });
  } catch (err: any) {
    console.error("Itinerary error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to generate itinerary", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
