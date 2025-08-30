import { makeClickId } from './pseudo';

export function buildAviasalesDeepLink(opts: {
  base: string; marker: string;
  origin: string; destination: string;
  depart: string; ret?: string;
  adults?: number; userId?: string;
}) {
  const url = new URL(opts.base);
  url.searchParams.set('marker', opts.marker);
  url.searchParams.set('origin', opts.origin);
  url.searchParams.set('destination', opts.destination);
  url.searchParams.set('depart_date', opts.depart);
  if (opts.ret) url.searchParams.set('return_date', opts.ret);
  url.searchParams.set('adults', String(opts.adults ?? 1));
  const clickId = makeClickId(opts.userId ?? 'anon', {
    o: opts.origin, d: opts.destination, depart: opts.depart, ret: opts.ret,
  });
  url.searchParams.set('click_id', clickId);
  return url.toString();
}
