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

- **Accounting Agent** (`src/skills/accountingAgent.ts`, routes in `src/routes/accounting.ts`):
  - **Invoice processing** — paste the text of an invoice (from a PDF, email or OCR) and the
    agent extracts it with Claude into structured data, validates it (required fields,
    subtotal + tax = total, line items, dates, duplicates by number + counterparty) and books
    it as a **payable** (supplier bill) or **receivable** (customer invoice). Receivables are
    linked to the CRM contact with the same name. Without an API key a regex fallback parser
    handles simple English/Spanish layouts.
  - **Supplier payments (AP)** — given the cash available, builds a payment run ordered by due
    date (overdue first), allocating cash in that order; Claude writes the recommendation.
    Payments are recorded per invoice (`open` → `partial` → `paid`).
  - **Customer receivables (AR)** — aging report (current / 1-30 / 31-60 / 61-90 / 90+ days)
    by currency and customer, plus collection reminders whose tone escalates with how late the
    invoice is; reminders are logged to the linked contact's history (drafted, not sent).
  - **Ask** — free-form questions answered from a snapshot of the ledger.

  All amounts and allocations are computed in code; Claude only extracts invoice data and
  writes text, so the numbers never depend on the model.

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

curl -X POST localhost:3000/api/accounting/invoices/process \
  -H 'Content-Type: application/json' \
  -d '{"kind":"payable","text":"Proveedor: Papelería del Norte\nFactura No. A-1043\nFecha: 2026-09-01\nVencimiento: 2026-09-30\nSubtotal: 1,000.00 MXN\nIVA: 160.00\nTotal: 1,160.00"}'

curl -X POST localhost:3000/api/accounting/payables/payment-plan \
  -H 'Content-Type: application/json' \
  -d '{"cashAvailable":5000}'

curl localhost:3000/api/accounting/receivables/aging
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
| GET | `/api/accounting/invoices` | List invoices, optional `?kind=payable\|receivable&status=open\|partial\|paid\|void` |
| GET | `/api/accounting/invoices/:id` | Get one invoice (includes payments) |
| POST | `/api/accounting/invoices/process` | `{ kind, text }` → extract, validate and book a raw invoice (201 booked / 422 with `issues`) |
| POST | `/api/accounting/invoices` | Book a structured invoice `{ kind, number, counterparty, total, issueDate?, dueDate?, currency?, subtotal?, tax?, lineItems?, contactId?, notes? }` |
| POST | `/api/accounting/invoices/:id/payments` | `{ amount, date?, method?, reference? }` → record a supplier payment / customer collection |
| POST | `/api/accounting/invoices/:id/void` | Void an invoice with no payments |
| POST | `/api/accounting/payables/payment-plan` | `{ cashAvailable, asOf?, currency? }` → supplier payment run + recommendation |
| GET | `/api/accounting/receivables/aging` | AR aging report, optional `?asOf=YYYY-MM-DD` |
| POST | `/api/accounting/receivables/:id/reminder` | `{ language? }` (default Spanish) → draft a collection reminder |
| POST | `/api/accounting/ask` | `{ question }` → answer from the AP/AR ledger |

## Not yet wired up

This is a foundation, not a full integration: the WhatsApp skill drafts replies but
doesn't send/receive over the real WhatsApp Business API, and Claude Ads generates
copy but doesn't push it to an ad platform. Likewise, the Accounting Agent records
payments but doesn't move money or sync with a bank/ERP, takes invoice *text* rather than
PDF files, and drafts collection reminders without sending them. These are natural next steps once you have
the relevant API credentials.
