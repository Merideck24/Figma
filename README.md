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
  - **Product Presentations** (`src/skills/productPresentation.ts`) — builds a product
    slide deck (hook → problem → solution → features → benefits → proof → offer → CTA)
    with speaker notes, as JSON or as a self-contained HTML slideshow (arrow keys to
    navigate, `N` for speaker notes, print to export PDF). Defaults to Spanish; never
    invents prices or metrics, using placeholders like `[precio]` instead.

Skills call Claude through `src/claudeClient.ts`. If `ANTHROPIC_API_KEY` is not set,
that wrapper returns a deterministic mock response instead of calling the API, so the
whole app runs and is testable with no credentials.

## Getting started

```bash
npm install
cp .env.example .env   # optional — set ANTHROPIC_API_KEY for real Claude output
npm run dev            # http://localhost:3000
```

Open `http://localhost:3000` for the test UI, or hit the API directly:

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

curl -X POST 'localhost:3000/api/skills/product-presentation?format=html' \
  -H 'Content-Type: application/json' \
  -d '{"product":"Audífonos Pro","audience":"Distribuidores","goal":"Cerrar pedido piloto"}' \
  > presentacion.html
```

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
| POST | `/api/skills/product-presentation` | `{ product, audience, description?, goal?, tone?, language?, slideCount? }` → `{ deck }`; add `?format=html` for a ready-to-present slideshow |

## Not yet wired up

This is a foundation, not a full integration: the WhatsApp skill drafts replies but
doesn't send/receive over the real WhatsApp Business API, and Claude Ads generates
copy but doesn't push it to an ad platform. Both are natural next steps once you have
the relevant API credentials.
