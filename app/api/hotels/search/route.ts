import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const checkIn = searchParams.get("check_in");
    const checkOut = searchParams.get("check_out");

    if (!city || !checkIn || !checkOut) {
      return NextResponse.json({ ok: false, error: "Missing params" });
    }

    const token = process.env.HOTELLOOK_TOKEN!;

    // Step 1: Resolve city → locationId
    const lookupUrl = `https://engine.hotellook.com/api/v2/lookup.json?query=${encodeURIComponent(
      city
    )}&lang=en&lookFor=city&limit=1&token=${token}`;

    const lookupRes = await fetch(lookupUrl);
    const lookupData = await lookupRes.json();
    if (!lookupData || !lookupData.results?.locations?.length) {
      throw new Error(`City not found: ${city}`);
    }
    const locationId = lookupData.results.locations[0].id;

    // Step 2: Call Hotels cache API
    const url = `https://engine.hotellook.com/api/v2/cache.json?locationId=${locationId}&currency=in&checkIn=${checkIn}&checkOut=${checkOut}&limit=10&token=${token}`;
    const r = await fetch(url);
    const data = await r.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ ok: false, source: "live", error: "Hotels API error", raw: data });
    }

    const offers = data.map((o: any) => ({
      provider: "Travelpayouts Hotels",
      city,
      check_in: checkIn,
      check_out: checkOut,
      hotel_name: o.hotelName,
      price: o.priceFrom,
      currency: "INR",
      deep_link: `https://search.hotellook.com/search/${encodeURIComponent(
        city
      )}?marker=${process.env.TRAVELPAYOUTS_MARKER}&click_id=test123`,
    }));

    return NextResponse.json({ ok: true, source: "live", offers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, source: "error", error: e.message });
  }
}

