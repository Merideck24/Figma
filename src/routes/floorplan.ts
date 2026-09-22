import { Router } from "express";
import { buildDirections, type TravelMode } from "../floorplan/directions.js";
import { findStand, getHall, searchStands, venue } from "../floorplan/venue.js";

export const floorplanRouter = Router();

const TRAVEL_MODES: TravelMode[] = ["walking", "driving", "transit", "bicycling"];

/** Parses `lat,lng` from a query string; returns undefined for anything malformed. */
function parseOrigin(raw: unknown): { lat: number; lng: number } | undefined {
  if (typeof raw !== "string") return undefined;
  const [lat, lng] = raw.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

/** Full venue geometry, so a client can draw the plan itself. */
floorplanRouter.get("/venue", (_req, res) => {
  res.json(venue);
});

floorplanRouter.get("/stands", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const stands = searchStands(query).map((stand) => ({
    ...stand,
    hallName: getHall(stand.hallId)?.name ?? stand.hallId,
  }));
  res.json(stands);
});

floorplanRouter.get("/stands/:code", (req, res) => {
  const stand = findStand(req.params.code);
  if (!stand) return res.status(404).json({ error: "Stand not found" });
  res.json({ ...stand, hallName: getHall(stand.hallId)?.name ?? stand.hallId });
});

/**
 * Two-stage route to a stand.
 *
 * Query params:
 *   origin=lat,lng   visitor position; omit to let Google Maps use current location
 *   mode=walking     travel mode for the outdoor leg (default: walking)
 *   entrance=<id>    force a specific venue entrance
 */
floorplanRouter.get("/stands/:code/directions", (req, res) => {
  const stand = findStand(req.params.code);
  if (!stand) return res.status(404).json({ error: "Stand not found" });

  const mode = typeof req.query.mode === "string" ? req.query.mode : "walking";
  if (!TRAVEL_MODES.includes(mode as TravelMode)) {
    return res.status(400).json({ error: `mode must be one of ${TRAVEL_MODES.join(", ")}` });
  }

  const entranceId = typeof req.query.entrance === "string" ? req.query.entrance : undefined;
  if (entranceId && !venue.entrances.some((e) => e.id === entranceId)) {
    return res.status(404).json({ error: "Entrance not found" });
  }

  const directions = buildDirections(stand, {
    origin: parseOrigin(req.query.origin),
    travelMode: mode as TravelMode,
    entranceId,
  });
  if (!directions) return res.status(500).json({ error: "No route available for this stand" });

  res.json(directions);
});
