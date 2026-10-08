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

- **PM Ops agent** (`src/pmOps/`, `src/skills/pmOpsAgent.ts`, `/api/projects`) — tracks
  every client project through the SS1 turnkey process (kickoff & onboarding →
  requirements → design → setup → integrations → QA/UAT → go-live → hypercare), plus new
  and in-progress integrations. Each project is created with the playbook checklist,
  due dates spread across a 14-day kickoff → go-live target (scaled if you set your own
  `targetGoLive`). Health (`on-track` / `at-risk` / `off-track`) is computed
  deterministically from overdue and blocked tasks, blocked integrations, and days to
  go-live; Claude writes status reports, the portfolio digest, and intake briefs on top
  of those facts. Also available as a Claude Code subagent: `.claude/agents/pm-ops.md`.
  **Tracking panel** at `http://localhost:3000/pm.html` (Spanish UI): KPI tiles, a board by
  phase, a kickoff → go-live timeline, the integrations pipeline, the priority action list,
  and a per-project drawer to tick off the checklist, block/unblock tasks, change
  integration status, log notes and generate AI status reports. Run `npm run seed:pm` to
  load demo projects.

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
```

PM Ops:

```bash
curl -X POST localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"clientName":"Acme Dental","type":"new-client","owner":"Erick",
       "integrations":[{"name":"WhatsApp Business","kind":"messaging"},{"name":"Stripe","kind":"payments"}]}'

curl localhost:3000/api/projects/dashboard

curl -X PATCH localhost:3000/api/projects/<id>/integrations/<integrationId> \
  -H 'Content-Type: application/json' -d '{"status":"blocked","notes":"waiting on API keys"}'

curl -X POST localhost:3000/api/skills/pm-status-report \
  -H 'Content-Type: application/json' -d '{"projectId":"<id>","audience":"client","language":"es"}'
```

## Scripts

- `npm run dev` — run the server with hot reload (tsx)
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled server
- `npm run typecheck` — type-check without emitting
- `npm run seed:pm` — load demo PM Ops projects (respects `DB_PATH`)

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
| GET | `/api/projects/playbook` | Turnkey phases, default tasks, and which phases each project type runs |
| GET | `/api/projects/dashboard` | Portfolio health: counts by health/type/integration status, projects ranked by urgency, time-to-live |
| GET | `/api/projects` | List projects (each with computed `health`) |
| POST | `/api/projects` | `{ clientName, type?, owner?, kickoffDate?, targetGoLive?, contactId?, notes?, integrations?: [{ name, kind? }] }` |
| GET / PATCH / DELETE | `/api/projects/:id` | Get / update (`status`, `targetGoLive`, `owner`, `notes`, …) / delete a project |
| POST | `/api/projects/:id/tasks` | `{ title, phase, dueDate, owner? }` |
| PATCH | `/api/projects/:id/tasks/:taskId` | `{ status?, blocker?, owner?, dueDate?, title? }` |
| POST | `/api/projects/:id/integrations` | `{ name, kind?, owner?, notes? }` |
| PATCH | `/api/projects/:id/integrations/:integrationId` | `{ status?, notes?, owner?, … }` |
| POST | `/api/projects/:id/log` | `{ message }` — append a note to the project log |
| POST | `/api/skills/pm-status-report` | `{ projectId, audience?: internal\|client, language?: es\|en }` |
| POST | `/api/skills/pm-portfolio-digest` | `{ language? }` → digest of fires, watch list, integrations, upcoming go-lives |
| POST | `/api/skills/pm-intake` | `{ clientName, notes, language? }` → requirements brief, missing info, risks |

## Not yet wired up

This is a foundation, not a full integration: the WhatsApp skill drafts replies but
doesn't send/receive over the real WhatsApp Business API, and Claude Ads generates
copy but doesn't push it to an ad platform. Both are natural next steps once you have
the relevant API credentials.
