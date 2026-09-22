# ClaudeEO

An AI marketing-ops platform tying together a CRM and a set of Claude-powered
marketing skills behind one Express API (plus a minimal test UI).

## Modules

- **Auto CRM** — contact/lead management (`/api/contacts`), JSON-file backed.
- **Marketing skills** (the "superpowers"), each a small module under `src/skills/`:
  - **WhatsApp Agent Kit** (`src/skills/whatsappAgent.ts`) — drafts an AI reply to an
    inbound WhatsApp-style message for a given contact and logs both sides of the
    exchange to that contact's conversation history.
  - **Claude Ads** (`src/skills/claudeAds.ts`) — generates ad copy variants for a
    product/audience/platform.
  - **Combo Marketing** (`src/skills/comboMarketing.ts`) — generates a multi-channel
    (WhatsApp + ads + email) campaign plan, informed by the current CRM segment.
- **Event Floor Plan** (`src/floorplan/`) — hybrid indoor/outdoor navigation for a
  trade show. See below.

Skills call Claude through `src/claudeClient.ts`. If `ANTHROPIC_API_KEY` is not set,
that wrapper returns a deterministic mock response instead of calling the API, so the
whole app runs and is testable with no credentials.

## Getting started

```bash
npm install
cp .env.example .env   # optional — set ANTHROPIC_API_KEY for real Claude output
npm run dev            # http://localhost:3000
```

Open `http://localhost:3000` for the test UI, `http://localhost:3000/floorplan.html`
for the interactive floor plan, or hit the API directly:

```bash
curl -X POST localhost:3000/api/contacts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","phone":"+15550100","stage":"lead"}'

curl -X POST localhost:3000/api/skills/whatsapp-reply \
  -H 'Content-Type: application/json' \
  -d '{"contactId":"<id>","message":"Do you have this in stock?"}'

curl -X POST localhost:3000/api/skills/ad-copy \
  -H 'Content-Type: application/json' \
  -d '{"product":"Wireless earbuds","audience":"Runners 20-35","platform":"instagram"}'

curl -X POST localhost:3000/api/skills/combo-campaign \
  -H 'Content-Type: application/json' \
  -d '{"goal":"Re-engage cold leads","audience":"Leads inactive 30+ days"}'

curl 'localhost:3000/api/floorplan/stands/SSM1/directions?origin=38.7679,-9.0990'
```

## Event Floor Plan — hybrid navigation

Google Maps knows how to get someone to a building; it has no idea where stand
SSM1 sits inside it. So the route is split in two, and the handover point is a
physical venue entrance:

```
Stage 1 — outdoor (Google Maps)      Stage 2 — indoor (this floor plan)
visitor's location ──walking──▶ FIL entrance ──▶ Hall 1 ──▶ SSM1
```

The outdoor destination is **always an entrance, never a stand**. Which entrance
gets picked, in order: an explicit `?entrance=` override, then the one closest to
the visitor's GPS position (when they share it), then the hall's default.

Indoor routing runs Dijkstra over a small corridor graph
(`src/floorplan/venue.ts` defines the waypoints and corridors), returning both a
polyline to draw on the plan and step-by-step directions with distances.

`/floorplan.html` wires this into a UI: search by stand code, alias, company,
category or hall; tap a stand; hit **Cómo llegar** to open Google Maps in walking
mode while the indoor leg is drawn on the plan with an "Estás aquí" marker.

The deep links are generated per platform — a cross-platform `maps/dir/?api=1`
URL, a `comgooglemaps://` scheme for the iOS app, an Android `geo:` intent, and
an Apple Maps fallback.

> **Sample data.** The halls, stands and entrance coordinates in
> `src/floorplan/venue.ts` are an illustrative layout modelled on SBC Summit 2026
> at Feira Internacional de Lisboa & MEO Arena — not the official floor plan.
> Replace them with surveyed positions before using this for a real event.

## Scripts

- `npm run dev` — run the server with hot reload (tsx)
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled server
- `npm run typecheck` — type-check without emitting

## API reference

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Server status + whether Claude is in live or mock mode |
| GET | `/api/contacts` | List contacts |
| POST | `/api/contacts` | Create a contact `{ name, phone?, email?, tags?, stage?, notes? }` |
| GET | `/api/contacts/:id` | Get one contact (includes conversation history) |
| PATCH | `/api/contacts/:id` | Update a contact |
| DELETE | `/api/contacts/:id` | Delete a contact |
| POST | `/api/skills/whatsapp-reply` | `{ contactId, message }` → drafts + logs a WhatsApp reply |
| POST | `/api/skills/ad-copy` | `{ product, audience, platform }` → ad copy variants |
| POST | `/api/skills/combo-campaign` | `{ goal, audience, stageFilter? }` → multi-channel campaign plan |
| GET | `/api/floorplan/venue` | Full venue geometry: buildings, halls, stands, entrances, corridor graph |
| GET | `/api/floorplan/stands?q=` | Search stands by code, alias, company, category or hall |
| GET | `/api/floorplan/stands/:code` | One stand (accepts aliases, e.g. `SS1` → `SSM1`) |
| GET | `/api/floorplan/stands/:code/directions` | Two-stage route. Query: `origin=lat,lng`, `mode=walking\|driving\|transit\|bicycling`, `entrance=<id>` |

## Not yet wired up

This is a foundation, not a full integration: the WhatsApp skill drafts replies but
doesn't send/receive over the real WhatsApp Business API, and Claude Ads generates
copy but doesn't push it to an ad platform. Both are natural next steps once you have
the relevant API credentials. The floor plan ships with a sample venue rather than the
official SBC layout, and the indoor leg is a corridor graph, not live indoor positioning.
