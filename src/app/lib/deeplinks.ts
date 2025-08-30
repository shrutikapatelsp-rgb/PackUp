import { makeClickId } from './pseudo';

/**
 * Normalize Travelpayouts deeplinks into full affiliate URLs.
 * Always prepends the correct static domain and appends marker + click_id.
 */
export function normalizeDeepLink(
  oLink: string | undefined,
  userId: string,
  provider: 'flights' | 'hotels' | 'activities',
  ctx: Record<string, any> = {}
) {
  const clickId = makeClickId(userId, ctx);

  let base = '';
  if (provider === 'flights') {
    base = 'https://search.aviasales.com';
  } else if (provider === 'hotels') {
    base = 'https://search.hotellook.com';
  } else if (provider === 'activities') {
    base = 'https://travelpayouts.com/activities';
  }

  // 🔹 If oLink missing, build a default /search path
  const path = oLink || `/search/${ctx.o}${ctx.depart}${ctx.d}1`;

  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}marker=${process.env.TRAVELPAYOUTS_MARKER!}&click_id=${clickId}`;
}
