import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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
            deep_link: `https://search.hotellook.com/search/${city}?marker=${MARKER}&click_id=${makeClickId(userId, {
              city,
              checkIn,
              checkOut,
            })}`,
          },
        ],
      });
    }

    // 🔥 Live API call to Hotellook
    const url = `https://engine.hotellook.com/api/v2/cache.json?city=${encodeURIComponent(
      city
    )}&checkIn=${checkIn}&checkOut=${checkOut}&currency=inr&limit=5&token=${TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Travelpayouts Hotels API error: ${res.status}`);
    }

    const json = await res.json();

    // Normalize response
    const offers = (json || []).map((h: any) => ({
      provider: "Travelpayouts Hotels",
      city,
      check_in: checkIn,
      check_out: checkOut,
      hotel_name: h.hotelName || h.hotel_name || "Unknown Hotel",
      price: h.priceFrom || h.price || 0,
      currency: "INR",
      deep_link: `https://search.hotellook.com/search/${encodeURIComponent(
        city
      )}?marker=${MARKER}&click_id=${makeClickId(userId, {
        city,
        checkIn,
        checkOut,
      })}`,
    }));

    return NextResponse.json({
      ok: true,
      source: "live",
      offers,
    });
  } catch (err: any) {
    console.error("Hotels API error:", err);
    return NextResponse.json({
      ok: false,
      source: "error",
      offers: [],
      error: err.message,
    });
  }
}

