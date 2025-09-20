import { makeClickId } from "./pseudo";

export function buildAviasalesDeepLink(opts: { userId?: string; origin: string; destination: string; depart: string; ret?: string; adults?: number }) {
  const marker = process.env.TRAVELPAYOUTS_MARKER || "";
  const click = makeClickId(opts.userId ?? "anon", { o: opts.origin, d: opts.destination }, process.env.CLICK_ID_SECRET);
  const base = process.env.TP_DEEPLINK_BASE || "https://search.aviasales.com/flights";
  const q = new URL(base);
  q.searchParams.set("origin", opts.origin);
  q.searchParams.set("destination", opts.destination);
  q.searchParams.set("depart_date", opts.depart);
  if (opts.ret) q.searchParams.set("return_date", opts.ret);
  q.searchParams.set("adults", String(opts.adults ?? 1));
  if (marker) q.searchParams.set("marker", marker);
  q.searchParams.set("click_id", click);
  return q.toString();
}
