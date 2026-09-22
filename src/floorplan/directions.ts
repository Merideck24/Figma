/**
 * Stage 1 of the hybrid navigation: getting the visitor to the right door.
 *
 * Google Maps has no idea where stand SSM1 is, so the outdoor destination is
 * always a physical venue entrance — never the stand. The indoor leg
 * (`indoorRoute.ts`) picks up from that entrance.
 */

import { routeToStand, type IndoorRoute } from "./indoorRoute.js";
import {
  entrancesForHall,
  getEntrance,
  getHall,
  venue,
  type Entrance,
  type LatLng,
  type Stand,
} from "./venue.js";

export type TravelMode = "walking" | "driving" | "transit" | "bicycling";

export interface DirectionsLinks {
  /** Cross-platform Google Maps URL routing to the entrance's exact coordinates. */
  universal: string;
  /** Same route, but with the postal address as destination — friendlier to read and share. */
  byAddress: string;
  /** Google Maps iOS app scheme; callers fall back to `universal` when the app is absent. */
  iosApp: string;
  /** Android geo: intent, handled by whichever maps app is installed. */
  androidApp: string;
  /** Apple Maps, for iOS visitors without Google Maps installed. */
  appleMaps: string;
}

export interface DirectionsOptions {
  /** The visitor's position, when they granted geolocation. Omitting it lets Maps use "current location". */
  origin?: LatLng;
  travelMode?: TravelMode;
  /** Force a specific entrance instead of letting the venue model pick one. */
  entranceId?: string;
}

export interface Directions {
  stand: Stand;
  hallName: string;
  entrance: Entrance;
  /** Why this entrance was chosen — worth surfacing in the UI. */
  entranceReason: "requested" | "nearest-to-visitor" | "hall-default";
  outdoor: {
    provider: "google-maps";
    travelMode: TravelMode;
    destination: LatLng;
    destinationLabel: string;
    links: DirectionsLinks;
  };
  indoor: IndoorRoute;
  disclaimer: string;
}

const APPLE_TRAVEL_FLAGS: Record<TravelMode, string> = {
  walking: "w",
  driving: "d",
  transit: "r",
  bicycling: "w",
};

function coordsParam({ lat, lng }: LatLng): string {
  return `${lat},${lng}`;
}

function buildLinks(entrance: Entrance, travelMode: TravelMode, origin?: LatLng): DirectionsLinks {
  const byCoords = new URLSearchParams({
    api: "1",
    destination: coordsParam(entrance.coords),
    travelmode: travelMode,
  });
  const byAddress = new URLSearchParams({
    api: "1",
    destination: entrance.address,
    travelmode: travelMode,
  });
  const ios = new URLSearchParams({
    daddr: coordsParam(entrance.coords),
    directionsmode: travelMode,
  });
  const apple = new URLSearchParams({
    daddr: coordsParam(entrance.coords),
    dirflg: APPLE_TRAVEL_FLAGS[travelMode],
  });

  if (origin) {
    const from = coordsParam(origin);
    byCoords.set("origin", from);
    byAddress.set("origin", from);
    ios.set("saddr", from);
    apple.set("saddr", from);
  }

  return {
    universal: `https://www.google.com/maps/dir/?${byCoords.toString()}`,
    byAddress: `https://www.google.com/maps/dir/?${byAddress.toString()}`,
    iosApp: `comgooglemaps://?${ios.toString()}`,
    androidApp: `geo:${coordsParam(entrance.coords)}?q=${encodeURIComponent(
      `${coordsParam(entrance.coords)}(${entrance.name})`,
    )}`,
    appleMaps: `https://maps.apple.com/?${apple.toString()}`,
  };
}

/** Great-circle distance in metres — used only to rank entrances by proximity. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pickEntrance(
  hall: NonNullable<ReturnType<typeof getHall>>,
  options: DirectionsOptions,
): { entrance: Entrance; reason: Directions["entranceReason"] } | undefined {
  if (options.entranceId) {
    const requested = getEntrance(options.entranceId);
    if (requested) return { entrance: requested, reason: "requested" };
  }

  if (options.origin) {
    const origin = options.origin;
    const nearest = [...entrancesForHall(hall)].sort(
      (a, b) => haversineMeters(origin, a.coords) - haversineMeters(origin, b.coords),
    )[0];
    if (nearest) return { entrance: nearest, reason: "nearest-to-visitor" };
  }

  const fallback = getEntrance(hall.defaultEntranceId);
  return fallback ? { entrance: fallback, reason: "hall-default" } : undefined;
}

/**
 * Builds the full two-stage route for a stand: a Google Maps walking link to
 * the chosen entrance, plus the indoor path from that entrance to the stand.
 */
export function buildDirections(stand: Stand, options: DirectionsOptions = {}): Directions | undefined {
  const hall = getHall(stand.hallId);
  if (!hall) return undefined;

  const picked = pickEntrance(hall, options);
  if (!picked) return undefined;

  const indoor = routeToStand(picked.entrance, stand);
  if (!indoor) return undefined;

  const travelMode = options.travelMode ?? "walking";
  return {
    stand,
    hallName: hall.name,
    entrance: picked.entrance,
    entranceReason: picked.reason,
    outdoor: {
      provider: "google-maps",
      travelMode,
      destination: picked.entrance.coords,
      destinationLabel: `${picked.entrance.name} · ${venue.name}`,
      links: buildLinks(picked.entrance, travelMode, options.origin),
    },
    indoor,
    disclaimer: venue.disclaimer,
  };
}
