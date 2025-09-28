// app/lib/travelpayouts.ts
import { attachAffiliateParams } from './deeplinks';

const TP_MARKER = process.env.TRAVELPAYOUTS_MARKER ?? '<TRAVELPAYOUTS_MARKER>';

export function travelpayoutsFlightLink(baseUrl: string, clickId?: string) {
  // Travelpayouts expects marker param; also append pseudonymized click_id
  return attachAffiliateParams(baseUrl, clickId, TP_MARKER);
}

export function travelpayoutsHotelLink(baseUrl: string, clickId?: string) {
  return attachAffiliateParams(baseUrl, clickId, TP_MARKER);
}

