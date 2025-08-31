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
    const url = `https://engine.hotellook.com/api/v2/cache.json?location=${encodeURIComponent(
      city
    )}&currency=in&checkIn=${checkIn}&checkOut=${checkOut}&limit=10&token=${token}`;

    const res = await fetch(url);
    const data = await res.json();

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

