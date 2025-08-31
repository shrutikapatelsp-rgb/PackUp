import { NextRequest, NextResponse } from "next/server";
import { makeClickId } from "@/src/app/lib/pseudo";

const MARKER = process.env.TRAVELPAYOUTS_MARKER || "";
const TOKEN = process.env.TRAVELPAYOUTS_TOKEN || "";
const USE_MOCK = process.env.TRAVELPAYOUTS_USE_MOCK === "1";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const checkIn = searchParams.get("check_in");
    const checkOut = searchParams.get("check_out");
    const userId = searchParams.get("userId") || "anon";

    if (!city || !checkIn || !checkOut) {
      return NextResponse.json({
        ok: false,
        source: "error",
        offers: [],
        error: "Missing required params: city, check_in, check_out",
      });
    }

    // Mock branch
    if (USE_MOCK) {
      return NextResponse.json({
        ok: true,
        source: "mock",
        offers: [
          {
            provider: "Travelpayouts Hotels",
            city,
            check_in: checkIn,
            check_out: checkOut,
            hotel_name: "Mock Palace",
            price: 4500,
            currency: "INR",
            deep_link: `https://search.hotellook.com/search/${encodeURIComponent(
              city
            )}?marker=${MARKER}&click_id=${makeClickId(userId, {
              city,
              checkIn,
              checkOut,
            })}`,
          },
        ],
      });
    }

    // 🔥 Step 1: start search
    const startUrl = `https://engine.hotellook.com/api/v2/search/start.json?location=${encodeURIComponent(
      city
    )}&checkIn=${checkIn}&checkOut=${checkOut}&adultsCount=1&currency=inr&marker=${MARKER}&token=${TOKEN}`;

    const startRes = await fetch(startUrl);
    if (!startRes.ok) throw new Error(`Hotels start API error: ${startRes.status}`);
    const startJson = await startRes.json();
    const searchId = startJson?.searchId;
    if (!searchId) throw new Error("No searchId returned from hotels API");

    // 🔄 Step 2: poll results (max 3 tries)
    let results: any[] = [];
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const resultUrl = `https://engine.hotellook.com/api/v2/search/getResult.json?searchId=${searchId}&limit=5&token=${TOKEN}`;
      const resultRes = await fetch(resultUrl);
      if (!resultRes.ok) continue;
      const resultJson = await resultRes.json();
      if (Array.isArray(resultJson) && resultJson.length) {
        results = resultJson;
        break;
      }
    }

    const offers = results.map((h: any) => ({
      provider: "Travelpayouts Hotels",
      city,
      check_in: checkIn,
      check_out: checkOut,
      hotel_name: h.hotelName || "Unknown Hotel",
      price: h.priceFrom || h.price || 0,
      currency: "INR",
      deep_link: `https://search.hotellook.com/search/${encodeURIComponent(
        city
      )}?marker=${MARKER}&click_id=${makeClickId(userId, { city, checkIn, checkOut })}`,
    }));

    return NextResponse.json({ ok: true, source: "live", offers });
  } catch (err: any) {
    console.error("Hotels API error:", err);
    return NextResponse.json({ ok: false, source: "error", offers: [], error: err.message });
  }
}

