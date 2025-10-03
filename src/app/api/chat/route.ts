import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const USE_MOCK = process.env.USE_MOCK === "1";
  const operationId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const { message } = await req.json();

  if (USE_MOCK || !process.env.OPENAI_API_KEY) {
    // Mock path (safe default)
    return NextResponse.json({
      message: "Mock itinerary generated (USE_MOCK=1 or no OPENAI_API_KEY).",
      itinerary: {
        title: "Mock Trip",
        days: [
          {
            day: 1,
            theme: "Mock day",
            places: ["Mock Place"],
            details: "This is a mock day.",
            images: [{ query: "Pangong Tso", caption: "Pangong", reason: "Iconic" }],
          },
        ],
      },
      operationId,
    });
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a travel planner AI. Reply with helpful text, then a line 'JSON:' followed by strict itinerary JSON." },
        { role: "user", content: message ?? "" },
      ],
    });
    const reply = completion.choices[0]?.message?.content ?? "No reply.";
    return NextResponse.json({ reply, operationId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "AI error", operationId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
