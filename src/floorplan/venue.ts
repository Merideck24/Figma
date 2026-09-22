/**
 * Venue model for the SBC Summit 2026 floor plan demo.
 *
 * Two coordinate systems live side by side:
 *  - `Point` (x/y) is a position on the floor plan canvas, in plan units.
 *    `metersPerUnit` converts those to walking distance.
 *  - `LatLng` is a real-world position, used only for venue entrances — the
 *    handover point between outdoor (Google Maps) and indoor (this floor plan)
 *    navigation.
 *
 * Stand positions, hall shapes and corridor waypoints below are illustrative
 * sample data, not the official SBC floor plan. The entrance lat/lng values are
 * approximate and meant to be replaced with surveyed coordinates before use.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Entrance {
  id: string;
  name: string;
  buildingId: string;
  /** Real-world position Google Maps should route to. */
  coords: LatLng;
  /** Postal address, used for the human-readable deep link variant. */
  address: string;
  /** Position of the entrance on the floor plan canvas. */
  plan: Point;
  /** Waypoint the indoor route starts from. */
  waypointId: string;
  notes?: string;
}

export interface Building {
  id: string;
  name: string;
  outline: Rect;
}

export interface Hall {
  id: string;
  name: string;
  buildingId: string;
  /** Entrance to use unless the visitor's position makes another one closer. */
  defaultEntranceId: string;
  /** Waypoint just outside the hall's door; last hop before the stand itself. */
  doorWaypointId: string;
  outline: Rect;
}

export interface Stand {
  code: string;
  /** Alternative codes the same stand is listed under (e.g. SS1 for SSM1). */
  aliases: string[];
  company: string;
  category: string;
  hallId: string;
  outline: Rect;
}

export type WaypointKind = "entrance" | "corridor" | "junction" | "hall-door";

export interface Waypoint {
  id: string;
  label: string;
  kind: WaypointKind;
  plan: Point;
}

/** Undirected corridor segment between two waypoints. */
export interface Corridor {
  from: string;
  to: string;
}

export interface Venue {
  id: string;
  name: string;
  event: string;
  city: string;
  /** Canvas the floor plan is drawn on, in plan units. */
  canvas: { width: number; height: number };
  metersPerUnit: number;
  buildings: Building[];
  entrances: Entrance[];
  halls: Hall[];
  stands: Stand[];
  waypoints: Waypoint[];
  corridors: Corridor[];
  disclaimer: string;
}

const waypoints: Waypoint[] = [
  { id: "wp-north", label: "Entrada Norte", kind: "entrance", plan: { x: 340, y: 30 } },
  { id: "wp-south", label: "Entrada Sul", kind: "entrance", plan: { x: 340, y: 610 } },
  { id: "wp-arena-gate", label: "Entrada MEO Arena", kind: "entrance", plan: { x: 860, y: 140 } },

  { id: "wp-axis-n", label: "Eje central norte", kind: "junction", plan: { x: 340, y: 170 } },
  { id: "wp-axis-c", label: "Eje central", kind: "junction", plan: { x: 340, y: 310 } },
  { id: "wp-axis-s", label: "Eje central sur", kind: "junction", plan: { x: 340, y: 450 } },
  { id: "wp-spine-w", label: "Corredor oeste", kind: "corridor", plan: { x: 90, y: 310 } },
  { id: "wp-spine-e", label: "Corredor este", kind: "corridor", plan: { x: 690, y: 310 } },
  { id: "wp-walkway", label: "Pasarela FIL–MEO Arena", kind: "corridor", plan: { x: 780, y: 310 } },

  { id: "wp-door-h1", label: "Puerta Hall 1", kind: "hall-door", plan: { x: 320, y: 170 } },
  { id: "wp-door-h2", label: "Puerta Hall 2", kind: "hall-door", plan: { x: 360, y: 170 } },
  { id: "wp-door-h3", label: "Puerta Hall 3", kind: "hall-door", plan: { x: 320, y: 450 } },
  { id: "wp-door-h4", label: "Puerta Hall 4", kind: "hall-door", plan: { x: 360, y: 450 } },
  { id: "wp-door-arena", label: "Puerta MEO Arena", kind: "hall-door", plan: { x: 860, y: 200 } },
];

const corridors: Corridor[] = [
  { from: "wp-north", to: "wp-axis-n" },
  { from: "wp-axis-n", to: "wp-axis-c" },
  { from: "wp-axis-c", to: "wp-axis-s" },
  { from: "wp-axis-s", to: "wp-south" },
  { from: "wp-axis-c", to: "wp-spine-w" },
  { from: "wp-axis-c", to: "wp-spine-e" },
  { from: "wp-spine-e", to: "wp-walkway" },
  { from: "wp-walkway", to: "wp-door-arena" },
  { from: "wp-arena-gate", to: "wp-door-arena" },
  { from: "wp-axis-n", to: "wp-door-h1" },
  { from: "wp-axis-n", to: "wp-door-h2" },
  { from: "wp-axis-s", to: "wp-door-h3" },
  { from: "wp-axis-s", to: "wp-door-h4" },
];

const stands: Stand[] = [
  { code: "SSM1", aliases: ["SS1"], company: "Silver Sands Media", category: "Affiliate", hallId: "hall-1", outline: { x: 110, y: 110, width: 90, height: 60 } },
  { code: "SSM4", aliases: [], company: "Northline Payments", category: "Payments", hallId: "hall-1", outline: { x: 220, y: 110, width: 70, height: 60 } },
  { code: "A12", aliases: [], company: "Lusitania Gaming", category: "Platform", hallId: "hall-1", outline: { x: 110, y: 200, width: 70, height: 50 } },
  { code: "A18", aliases: [], company: "Bracara Studios", category: "Content", hallId: "hall-1", outline: { x: 210, y: 200, width: 80, height: 50 } },

  { code: "B02", aliases: [], company: "Tagus Data", category: "Data & AI", hallId: "hall-2", outline: { x: 400, y: 110, width: 80, height: 60 } },
  { code: "B07", aliases: [], company: "Meridian KYC", category: "Compliance", hallId: "hall-2", outline: { x: 500, y: 110, width: 80, height: 60 } },
  { code: "B21", aliases: [], company: "Atlantic Odds", category: "Sportsbook", hallId: "hall-2", outline: { x: 400, y: 200, width: 90, height: 50 } },
  { code: "B26", aliases: [], company: "Belem Affiliates", category: "Affiliate", hallId: "hall-2", outline: { x: 510, y: 200, width: 70, height: 50 } },

  { code: "C05", aliases: [], company: "Oriente Live Casino", category: "Live Casino", hallId: "hall-3", outline: { x: 110, y: 390, width: 90, height: 60 } },
  { code: "C11", aliases: [], company: "Setubal Analytics", category: "Data & AI", hallId: "hall-3", outline: { x: 220, y: 390, width: 70, height: 60 } },
  { code: "C19", aliases: [], company: "Cascais Retention", category: "CRM", hallId: "hall-3", outline: { x: 110, y: 480, width: 80, height: 50 } },

  { code: "D03", aliases: [], company: "Porto Pay", category: "Payments", hallId: "hall-4", outline: { x: 400, y: 390, width: 80, height: 60 } },
  { code: "D14", aliases: [], company: "Sintra Sportsbook", category: "Sportsbook", hallId: "hall-4", outline: { x: 500, y: 390, width: 80, height: 60 } },
  { code: "D22", aliases: [], company: "Alfama Media Group", category: "Media", hallId: "hall-4", outline: { x: 400, y: 480, width: 90, height: 50 } },

  { code: "MA2", aliases: ["ARENA2"], company: "SBC Main Stage Lounge", category: "Conference", hallId: "hall-arena", outline: { x: 810, y: 250, width: 100, height: 60 } },
  { code: "MA6", aliases: [], company: "Estoril VIP Suite", category: "Hospitality", hallId: "hall-arena", outline: { x: 810, y: 340, width: 100, height: 55 } },
];

export const venue: Venue = {
  id: "fil-meo-arena-lisboa",
  name: "Feira Internacional de Lisboa & MEO Arena",
  event: "SBC Summit 2026",
  city: "Lisboa, Portugal",
  canvas: { width: 1000, height: 640 },
  metersPerUnit: 0.35,
  buildings: [
    { id: "fil", name: "Feira Internacional de Lisboa (FIL)", outline: { x: 40, y: 40, width: 620, height: 560 } },
    { id: "meo-arena", name: "MEO Arena", outline: { x: 760, y: 170, width: 200, height: 280 } },
  ],
  entrances: [
    {
      id: "fil-north",
      name: "FIL — Entrada Norte",
      buildingId: "fil",
      coords: { lat: 38.7692, lng: -9.0952 },
      address: "Feira Internacional de Lisboa, R. do Bojador, 1998-010 Lisboa, Portugal",
      plan: { x: 340, y: 30 },
      waypointId: "wp-north",
      notes: "Entrada principal de registro; la más cercana viniendo desde la estación Oriente.",
    },
    {
      id: "fil-south",
      name: "FIL — Entrada Sul",
      buildingId: "fil",
      coords: { lat: 38.7661, lng: -9.0935 },
      address: "Feira Internacional de Lisboa, R. do Bojador, 1998-010 Lisboa, Portugal",
      plan: { x: 340, y: 610 },
      waypointId: "wp-south",
      notes: "Acceso directo a los halls 3 y 4.",
    },
    {
      id: "meo-arena",
      name: "MEO Arena — Entrada",
      buildingId: "meo-arena",
      coords: { lat: 38.7683, lng: -9.0948 },
      address: "MEO Arena, Rossio dos Olivais, 1990-231 Lisboa, Portugal",
      plan: { x: 860, y: 140 },
      waypointId: "wp-arena-gate",
      notes: "Acceso a las salas de conferencias del recinto MEO Arena.",
    },
  ],
  halls: [
    { id: "hall-1", name: "Hall 1", buildingId: "fil", defaultEntranceId: "fil-north", doorWaypointId: "wp-door-h1", outline: { x: 70, y: 70, width: 250, height: 200 } },
    { id: "hall-2", name: "Hall 2", buildingId: "fil", defaultEntranceId: "fil-north", doorWaypointId: "wp-door-h2", outline: { x: 360, y: 70, width: 250, height: 200 } },
    { id: "hall-3", name: "Hall 3", buildingId: "fil", defaultEntranceId: "fil-south", doorWaypointId: "wp-door-h3", outline: { x: 70, y: 350, width: 250, height: 200 } },
    { id: "hall-4", name: "Hall 4", buildingId: "fil", defaultEntranceId: "fil-south", doorWaypointId: "wp-door-h4", outline: { x: 360, y: 350, width: 250, height: 200 } },
    { id: "hall-arena", name: "MEO Arena Hall", buildingId: "meo-arena", defaultEntranceId: "meo-arena", doorWaypointId: "wp-door-arena", outline: { x: 780, y: 200, width: 160, height: 220 } },
  ],
  stands,
  waypoints,
  corridors,
  disclaimer:
    "Sample layout. Stand positions and entrance coordinates are illustrative and must be replaced with the official SBC Summit 2026 floor plan before production use.",
};

export function getHall(hallId: string): Hall | undefined {
  return venue.halls.find((h) => h.id === hallId);
}

export function getEntrance(entranceId: string): Entrance | undefined {
  return venue.entrances.find((e) => e.id === entranceId);
}

export function getWaypoint(waypointId: string): Waypoint | undefined {
  return venue.waypoints.find((w) => w.id === waypointId);
}

/**
 * Entrances that can reasonably serve a hall: the ones in the same building,
 * with the hall's default entrance guaranteed to be in the list.
 */
export function entrancesForHall(hall: Hall): Entrance[] {
  const sameBuilding = venue.entrances.filter((e) => e.buildingId === hall.buildingId);
  const fallback = getEntrance(hall.defaultEntranceId);
  if (fallback && !sameBuilding.some((e) => e.id === fallback.id)) {
    return [fallback, ...sameBuilding];
  }
  return sameBuilding.length > 0 ? sameBuilding : venue.entrances;
}

export function standCenter(stand: Stand): Point {
  return {
    x: stand.outline.x + stand.outline.width / 2,
    y: stand.outline.y + stand.outline.height / 2,
  };
}

/** Lowercases and strips accents so "Belém" matches a "belem" query. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Resolves a stand by its code or by any of its aliases, case-insensitively. */
export function findStand(codeOrAlias: string): Stand | undefined {
  const needle = normalize(codeOrAlias).replace(/\s+/g, "");
  return venue.stands.find(
    (s) =>
      normalize(s.code).replace(/\s+/g, "") === needle ||
      s.aliases.some((a) => normalize(a).replace(/\s+/g, "") === needle),
  );
}

/** Free-text search across stand code, aliases, company, category and hall name. */
export function searchStands(query: string): Stand[] {
  const needle = normalize(query.trim());
  if (!needle) return venue.stands;
  return venue.stands.filter((s) => {
    const hall = getHall(s.hallId);
    const haystack = [s.code, ...s.aliases, s.company, s.category, hall?.name ?? ""].map(normalize);
    return haystack.some((h) => h.includes(needle));
  });
}
