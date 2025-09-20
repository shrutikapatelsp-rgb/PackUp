import { buildAviasalesDeepLink } from "./deeplinks";

export type FlightParams = {
  origin: string;
  destination: string;
  depart: string;
  ret?: string;
  adults?: number;
  userId?: string;
};

export function buildTravelpayoutsFlightLink(p: FlightParams) {
  // use buildAviasalesDeepLink as primary
  return buildAviasalesDeepLink({
    userId: p.userId,
    origin: p.origin,
    destination: p.destination,
    depart: p.depart,
    ret: p.ret,
    adults: p.adults ?? 1,
  });
}
