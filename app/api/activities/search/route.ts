import { NextRequest, NextResponse } from "next/server";
import { makeClickId } from "@/src/app/lib/pseudo";

const MARKER = process.env.TRAVELPAYOUTS_MARKER || "";
const TOKEN = process.env.TRAVELPAYOUTS_TOKEN || "";
const USE_MOCK = process.env.TRAVELPAYOUTS_USE_MOCK === "1";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const date = searchParams.get("date");
    const userId = searchParams.get("userId") || "anon";

    if (!city || !date) {
      return NextResponse.json({
        ok: false,
        source: "error",
        offers: [],
        error: "Missing required params: city, date",
      });
    }

    // Mock branch
    if (USE_MOCK) {
      return NextResponse.json({
        ok: true,
        source: "mock",
        offers: [
          {
            provider: "Travelpayouts Activities",
            city,
            date,
            activity_name: "Mock City Tour",
            price: 1200,
            currency: "INR",
            deep_link: `https://travelpayouts.com/activities/search/${encodeURIComponent(
              city
            )}?marker=${MARKER}&click_id=${makeClickId(userId, { city, date })}`,
          },
        ],
      });
    }

    // 🔥 Live Activities API (Viator via Travelpayouts)
    const url = `https://activities-api.travelpayouts.com/v2/prices.json?city=${encodeURIComponent(
      city
    )}&date=${date}&currency=inr&marker=${MARKER}&token=${TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Activities API error: ${res.status}`);
    const json = await res.json();

    const results = Array.isArray(json?.data) ? json.data : [];

    const offers = results.slice(0, 5).map((a: any) => ({
      provider: "Travelpayouts Activities",
      city,
      date,
      activity_name: a.title || a.activity_name || "Unknown Activity",
      price: a.price?.amount || 0,
      currency: a.price?.currency || "INR",
      deep_link: `${a.url}?marker=${MARKER}&click_id=${makeClickId(userId, { city, date })}`,
    }));

    return NextResponse.json({ ok: true, source: "live", offers });
  } catch (err: any) {
    console.error("Activities API error:", err);
    return NextResponse.json({ ok: false, source: "error", offers: [], error: err.message });
  }
}

