import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const mockReply = `✈️ Flights: BLR → GOI roundtrip
🏨 Stay: Beach Resort, 3 nights
🏝️ Activities: Baga Beach, Water Sports, Night Market
🍲 Food: Seafood shacks & cafes`;

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // If USE_MOCK=1, always return mock
    if (process.env.USE_MOCK === "1") {
      return NextResponse.json({ ok: true, reply: mockReply });
    }

    const chat = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful travel planning assistant." },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const reply = chat.choices[0]?.message?.content || mockReply;
    return NextResponse.json({ ok: true, reply });
  } catch (err: any) {
    console.error("OpenAI error:", err.message);

    // fallback to mock
    return NextResponse.json({ ok: true, reply: mockReply });
  }
}

