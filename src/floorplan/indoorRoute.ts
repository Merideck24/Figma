/**
 * Stage 2 of the hybrid navigation: the walk from a venue entrance, through the
 * corridor graph, to the stand itself. Google Maps stops at the entrance; this
 * takes over from there.
 */

import {
  venue,
  getHall,
  getWaypoint,
  standCenter,
  type Entrance,
  type Point,
  type Stand,
  type Waypoint,
} from "./venue.js";

export interface RouteStep {
  kind: "enter-venue" | "walk" | "enter-hall" | "arrive";
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
}

export interface IndoorRoute {
  /** Polyline to draw on the floor plan, in plan units. */
  points: Point[];
  steps: RouteStep[];
  distanceMeters: number;
}

function distanceUnits(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toMeters(units: number): number {
  return Math.round(units * venue.metersPerUnit);
}

function buildAdjacency(): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const waypoint of venue.waypoints) adjacency.set(waypoint.id, []);
  for (const corridor of venue.corridors) {
    adjacency.get(corridor.from)?.push(corridor.to);
    adjacency.get(corridor.to)?.push(corridor.from);
  }
  return adjacency;
}

/**
 * Dijkstra over the corridor graph. The graph is tiny (tens of nodes), so a
 * linear scan for the next node is cheaper than maintaining a heap.
 */
function shortestPath(fromId: string, toId: string): Waypoint[] | undefined {
  const adjacency = buildAdjacency();
  if (!adjacency.has(fromId) || !adjacency.has(toId)) return undefined;

  const cost = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  while (visited.size < venue.waypoints.length) {
    let currentId: string | undefined;
    let currentCost = Infinity;
    for (const [id, value] of cost) {
      if (!visited.has(id) && value < currentCost) {
        currentId = id;
        currentCost = value;
      }
    }
    if (!currentId) break;
    if (currentId === toId) break;
    visited.add(currentId);

    const current = getWaypoint(currentId);
    if (!current) continue;
    for (const neighbourId of adjacency.get(currentId) ?? []) {
      if (visited.has(neighbourId)) continue;
      const neighbour = getWaypoint(neighbourId);
      if (!neighbour) continue;
      const candidate = currentCost + distanceUnits(current.plan, neighbour.plan);
      if (candidate < (cost.get(neighbourId) ?? Infinity)) {
        cost.set(neighbourId, candidate);
        previous.set(neighbourId, currentId);
      }
    }
  }

  if (!cost.has(toId)) return undefined;

  const path: Waypoint[] = [];
  for (let id: string | undefined = toId; id; id = previous.get(id)) {
    const waypoint = getWaypoint(id);
    if (!waypoint) return undefined;
    path.unshift(waypoint);
    if (id === fromId) break;
  }
  return path[0]?.id === fromId ? path : undefined;
}

/**
 * Routes from `entrance` to `stand`: entrance → corridors → hall door → stand.
 * Returns undefined when the hall or entrance is not connected to the graph.
 */
export function routeToStand(entrance: Entrance, stand: Stand): IndoorRoute | undefined {
  const hall = getHall(stand.hallId);
  if (!hall) return undefined;

  const path = shortestPath(entrance.waypointId, hall.doorWaypointId);
  if (!path || path.length === 0) return undefined;

  const target = standCenter(stand);
  const steps: RouteStep[] = [];
  let totalUnits = 0;

  steps.push({
    kind: "enter-venue",
    fromLabel: entrance.name,
    toLabel: path[0].label,
    distanceMeters: 0,
  });

  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    const units = distanceUnits(from.plan, to.plan);
    totalUnits += units;
    steps.push({
      kind: to.kind === "hall-door" ? "enter-hall" : "walk",
      fromLabel: from.label,
      toLabel: to.kind === "hall-door" ? hall.name : to.label,
      distanceMeters: toMeters(units),
    });
  }

  const lastLeg = distanceUnits(path[path.length - 1].plan, target);
  totalUnits += lastLeg;
  steps.push({
    kind: "arrive",
    fromLabel: hall.name,
    toLabel: `${stand.code} — ${stand.company}`,
    distanceMeters: toMeters(lastLeg),
  });

  return {
    points: [...path.map((w) => w.plan), target],
    steps,
    distanceMeters: toMeters(totalUnits),
  };
}
