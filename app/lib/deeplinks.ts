// app/lib/deeplinks.ts
import { pseudonymizeClickId } from './pseudo';

/**
 * Generic helper to append pseudonymized click id and marker to an affiliate link.
 * This is a minimal safe wrapper; providers may need provider-specific fields.
 */
export function attachAffiliateParams(url: string, clickIdRaw: string | undefined, marker?: string) {
  try {
    const u = new URL(url);
    if (mark = marker) {
      // some providers expect "marker" param
      u.searchParams.set('marker', marker ?? '');
    }
    if (clickIdRaw) {
      u.searchParams.set('click_id', pseudonymizeClickId(clickIdRaw));
    }
    return u.toString();
  } catch (err) {
    // if parsing fails, return original URL
    return url;
  }
}

