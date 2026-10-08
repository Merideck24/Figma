import { complete, isLiveMode } from "../claudeClient.js";
import {
  contactsStore,
  invoicesStore,
  round2,
  type Invoice,
  type InvoiceInput,
  type InvoiceKind,
  type LineItem,
} from "../db.js";

// ---------- shared helpers ----------

const DAY_MS = 24 * 60 * 60 * 1000;

export const today = (): string => new Date().toISOString().slice(0, 10);

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export const balanceOf = (i: Invoice): number => round2(i.total - i.amountPaid);

const isOutstanding = (i: Invoice): boolean => i.status === "open" || i.status === "partial";

/** Parses "1,234.56", "1.234,56", "$ 1234" etc. into a number. */
function parseAmount(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  let s = raw.replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // Whichever separator comes last is the decimal one.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    // "1234,56" → decimal comma; "1,234" → thousands separator.
    s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

// ---------- 1) Invoice processing (extraction + validation + booking) ----------

const EXTRACT_SYSTEM_PROMPT = `You are an accounts clerk. Extract the invoice in the user's text into JSON
with exactly these keys:
{"number": string, "counterparty": string, "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" | null,
 "currency": ISO 4217 code, "lineItems": [{"description": string, "quantity": number, "unitPrice": number}],
 "subtotal": number, "tax": number, "total": number, "notes": string | null}
"counterparty" is the supplier for a payable invoice, or the customer being billed for a receivable one.
Use plain numbers (no thousands separators or currency symbols). Use null when a value is not present.
Reply with the JSON object only, no prose and no code fences.`;

export interface ExtractedInvoice {
  number?: string;
  counterparty?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lineItems: LineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  notes?: string;
}

function normalizeExtraction(raw: Record<string, unknown>): ExtractedInvoice {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const lineItems = Array.isArray(raw.lineItems)
    ? raw.lineItems
        .map((li: Record<string, unknown>) => ({
          description: str(li?.description) ?? "",
          quantity: parseAmount(li?.quantity) ?? 1,
          unitPrice: parseAmount(li?.unitPrice) ?? 0,
        }))
        .filter((li) => li.description || li.unitPrice)
    : [];
  return {
    number: str(raw.number),
    counterparty: str(raw.counterparty),
    issueDate: isIsoDate(raw.issueDate) ? raw.issueDate : undefined,
    dueDate: isIsoDate(raw.dueDate) ? raw.dueDate : undefined,
    currency: str(raw.currency)?.toUpperCase(),
    lineItems,
    subtotal: parseAmount(raw.subtotal),
    tax: parseAmount(raw.tax),
    total: parseAmount(raw.total),
    notes: str(raw.notes),
  };
}

/**
 * Regex-based fallback used in mock mode (or if Claude's reply isn't valid JSON),
 * so invoice processing stays usable offline. Handles simple English/Spanish layouts.
 */
function heuristicExtract(text: string, kind: InvoiceKind): ExtractedInvoice {
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim();
  const amountAfter = (label: string) =>
    parseAmount(grab(new RegExp(`(?:^|\\n)\\s*(?:${label})\\b[^\\d\\n]*([\\d.,]+)`, "i")));

  const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const currency =
    grab(/\b(USD|MXN|EUR|COP|ARS|CLP|PEN|GBP|CAD)\b/i)?.toUpperCase() ?? (text.includes("€") ? "EUR" : "USD");
  const supplier = grab(/(?:^|\n)\s*(?:from|supplier|vendor|proveedor|emisor)\s*:\s*(.+)/i);
  const customer = grab(/(?:^|\n)\s*(?:bill to|billed to|customer|client|cliente|receptor|para)\s*:\s*(.+)/i);
  const counterparty =
    (kind === "payable" ? supplier ?? customer : customer ?? supplier) ??
    text.split("\n").map((l) => l.trim()).find(Boolean);

  return {
    number: grab(/(?:invoice|factura|folio|inv)\s*(?:no\.?|number|n[º°o]\.?|número|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-/]*\d[A-Z0-9-/]*)/i),
    counterparty,
    issueDate: grab(/(?:^|\n)\s*(?:issue date|invoice date|date|fecha(?: de emisi[oó]n)?)\s*:\s*(\d{4}-\d{2}-\d{2})/i) ?? dates[0],
    dueDate: grab(/(?:due(?: date)?|vencimiento|fecha de pago)\s*:\s*(\d{4}-\d{2}-\d{2})/i) ?? dates[1],
    currency,
    lineItems: [],
    subtotal: amountAfter("subtotal|sub-total"),
    tax: amountAfter("tax|vat|iva|impuestos?"),
    total: amountAfter("total(?!\\s*paid)|amount due|importe total|total a pagar"),
  };
}

export async function extractInvoice(
  text: string,
  kind: InvoiceKind
): Promise<{ data: ExtractedInvoice; extractedBy: "claude" | "heuristic" }> {
  if (isLiveMode) {
    const direction = kind === "payable" ? "payable (a bill from a supplier)" : "receivable (an invoice we issued to a customer)";
    const reply = await complete(EXTRACT_SYSTEM_PROMPT, `This invoice is ${direction}.\n\n${text}`);
    const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
    try {
      return { data: normalizeExtraction(JSON.parse(json)), extractedBy: "claude" };
    } catch {
      // Fall through to the heuristic parser below.
    }
  }
  return { data: heuristicExtract(text, kind), extractedBy: "heuristic" };
}

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

/**
 * Checks an extracted invoice before booking it: required fields, arithmetic,
 * dates and duplicates. Fills sensible defaults (due date, subtotal/tax) where it can.
 */
export function validateInvoice(kind: InvoiceKind, data: ExtractedInvoice): { input?: InvoiceInput; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  if (!data.number) error("Invoice number not found");
  if (!data.counterparty) error(kind === "payable" ? "Supplier not found" : "Customer not found");
  if (data.total === undefined || data.total <= 0) error("Invoice total not found or not positive");

  const issueDate = data.issueDate ?? today();
  if (!data.issueDate) warn("Issue date not found; using today");
  let dueDate = data.dueDate;
  if (!dueDate) {
    dueDate = addDays(issueDate, 30);
    warn(`Due date not found; defaulting to net 30 (${dueDate})`);
  } else if (dueDate < issueDate) {
    error(`Due date ${dueDate} is before issue date ${issueDate}`);
  }

  const total = data.total ?? 0;
  const tax = data.tax ?? 0;
  const subtotal = data.subtotal ?? round2(total - tax);
  if (Math.abs(subtotal + tax - total) > 0.01) {
    warn(`Subtotal (${subtotal}) + tax (${tax}) does not equal total (${total})`);
  }
  if (data.lineItems.length) {
    const linesSum = round2(data.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0));
    if (Math.abs(linesSum - subtotal) > 0.01) warn(`Line items add up to ${linesSum}, but subtotal is ${subtotal}`);
  }

  if (data.number && data.counterparty) {
    const dup = invoicesStore.findDuplicate(kind, data.number, data.counterparty);
    if (dup) error(`Duplicate: invoice ${dup.number} from/to ${dup.counterparty} is already booked (id ${dup.id})`);
  }

  if (issues.some((i) => i.level === "error")) return { issues };

  return {
    issues,
    input: {
      kind,
      number: data.number!,
      counterparty: data.counterparty!,
      issueDate,
      dueDate,
      currency: data.currency ?? "USD",
      lineItems: data.lineItems,
      subtotal,
      tax,
      total,
      notes: data.notes,
    },
  };
}

/** Links a receivable to the CRM contact with the same name, if there is one. */
function matchContactId(counterparty: string): string | undefined {
  const name = counterparty.trim().toLowerCase();
  return contactsStore.list().find((c) => c.name.trim().toLowerCase() === name)?.id;
}

export interface ProcessInvoiceResult {
  saved: boolean;
  invoice?: Invoice;
  extracted: ExtractedInvoice;
  extractedBy: "claude" | "heuristic";
  issues: ValidationIssue[];
}

/** Reads a raw invoice (pasted/OCR text), validates it and books it as payable or receivable. */
export async function processInvoice(text: string, kind: InvoiceKind): Promise<ProcessInvoiceResult> {
  const { data, extractedBy } = await extractInvoice(text, kind);
  const { input, issues } = validateInvoice(kind, data);
  if (!input) return { saved: false, extracted: data, extractedBy, issues };

  if (kind === "receivable") input.contactId = matchContactId(input.counterparty);
  const invoice = invoicesStore.create(input);
  return { saved: true, invoice, extracted: data, extractedBy, issues };
}

// ---------- 2) Supplier payments (accounts payable) ----------

const PAYMENT_PLAN_SYSTEM_PROMPT = `You are an accounts-payable controller. Given today's date, the cash
available, and a proposed supplier payment schedule (already prioritised by due date), write a short
recommendation: 1) what to pay today and why, 2) what is deferred and the risk (late fees, supplier
relationship), 3) one cash-management suggestion. Keep it under 150 words. Do not change the numbers.`;

export interface PaymentPlanLine {
  invoiceId: string;
  number: string;
  supplier: string;
  dueDate: string;
  daysUntilDue: number;
  balance: number;
  payNow: number;
  remaining: number;
}

export interface PaymentPlan {
  asOf: string;
  currency?: string;
  cashAvailable: number;
  totalOutstanding: number;
  totalToPay: number;
  cashLeft: number;
  lines: PaymentPlanLine[];
  warnings: string[];
  recommendation: string;
}

/**
 * Builds a supplier payment run: outstanding payables ordered by due date (overdue first),
 * allocating the available cash in that order. The numbers are computed deterministically;
 * Claude only writes the narrative recommendation.
 */
export async function planSupplierPayments({
  cashAvailable,
  asOf = today(),
  currency,
}: {
  cashAvailable: number;
  asOf?: string;
  currency?: string;
}): Promise<PaymentPlan> {
  const warnings: string[] = [];
  let payables = invoicesStore.list({ kind: "payable" }).filter(isOutstanding);
  if (currency) payables = payables.filter((i) => i.currency === currency.toUpperCase());
  const currencies = new Set(payables.map((i) => i.currency));
  if (currencies.size > 1) {
    warnings.push(`Payables span several currencies (${[...currencies].join(", ")}); pass "currency" to plan one at a time`);
  }

  payables.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || balanceOf(b) - balanceOf(a));

  let cash = round2(cashAvailable);
  const lines = payables.map<PaymentPlanLine>((i) => {
    const balance = balanceOf(i);
    const payNow = round2(Math.min(balance, cash));
    cash = round2(cash - payNow);
    return {
      invoiceId: i.id,
      number: i.number,
      supplier: i.counterparty,
      dueDate: i.dueDate,
      daysUntilDue: daysBetween(asOf, i.dueDate),
      balance,
      payNow,
      remaining: round2(balance - payNow),
    };
  });

  const overdueUnpaid = lines.filter((l) => l.daysUntilDue < 0 && l.remaining > 0);
  if (overdueUnpaid.length) {
    warnings.push(`${overdueUnpaid.length} overdue invoice(s) cannot be fully paid with the available cash`);
  }

  const totalOutstanding = round2(lines.reduce((s, l) => s + l.balance, 0));
  const totalToPay = round2(lines.reduce((s, l) => s + l.payNow, 0));

  const recommendation = lines.length
    ? await complete(
        PAYMENT_PLAN_SYSTEM_PROMPT,
        `Today: ${asOf}\nCash available: ${cashAvailable}\nTotal outstanding: ${totalOutstanding}\n` +
          `Schedule:\n${lines
            .map((l) => `- ${l.supplier} #${l.number}: balance ${l.balance}, due ${l.dueDate} (${l.daysUntilDue} days), pay now ${l.payNow}`)
            .join("\n")}`
      )
    : "No outstanding supplier invoices.";

  return {
    asOf,
    currency: currency?.toUpperCase() ?? (currencies.size === 1 ? [...currencies][0] : undefined),
    cashAvailable: round2(cashAvailable),
    totalOutstanding,
    totalToPay,
    cashLeft: cash,
    lines,
    warnings,
    recommendation,
  };
}

// ---------- 3) Customer invoices (accounts receivable) ----------

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export interface AgingLine {
  invoiceId: string;
  number: string;
  customer: string;
  contactId?: string;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  bucket: AgingBucket;
  balance: number;
}

export interface AgingReport {
  asOf: string;
  /** Outstanding balance per currency, per aging bucket. */
  totals: Record<string, Record<AgingBucket, number>>;
  byCustomer: { customer: string; currency: string; balance: number; oldestDaysOverdue: number }[];
  lines: AgingLine[];
}

/** Accounts-receivable aging: what customers owe, grouped by how late it is. */
export function receivablesAging(asOf = today()): AgingReport {
  const lines = invoicesStore
    .list({ kind: "receivable" })
    .filter(isOutstanding)
    .map<AgingLine>((i) => {
      const daysOverdue = daysBetween(i.dueDate, asOf);
      return {
        invoiceId: i.id,
        number: i.number,
        customer: i.counterparty,
        contactId: i.contactId,
        currency: i.currency,
        dueDate: i.dueDate,
        daysOverdue,
        bucket: bucketFor(daysOverdue),
        balance: balanceOf(i),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totals: AgingReport["totals"] = {};
  const customers = new Map<string, AgingReport["byCustomer"][number]>();
  for (const l of lines) {
    totals[l.currency] ??= Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
    totals[l.currency][l.bucket] = round2(totals[l.currency][l.bucket] + l.balance);

    const key = `${l.customer}|${l.currency}`;
    const c = customers.get(key) ?? { customer: l.customer, currency: l.currency, balance: 0, oldestDaysOverdue: 0 };
    c.balance = round2(c.balance + l.balance);
    c.oldestDaysOverdue = Math.max(c.oldestDaysOverdue, l.daysOverdue);
    customers.set(key, c);
  }

  return {
    asOf,
    totals,
    byCustomer: [...customers.values()].sort((a, b) => b.balance - a.balance),
    lines,
  };
}

const REMINDER_SYSTEM_PROMPT = `You are an accounts-receivable specialist. Write a short collection email
(subject line + body, under 120 words) for the unpaid invoice below. Match the tone to how late it is:
friendly heads-up if not yet due or under 15 days late, firm but polite at 15-60 days, and a final notice
that mentions next steps beyond 60 days. Always include the invoice number, balance due and due date,
and ask for a payment date confirmation. Do not invent bank details or penalties.`;

/**
 * Drafts a collection reminder for a customer invoice and, if the invoice is linked to a
 * CRM contact, logs it to that contact's conversation history. It does not send the email.
 */
export async function draftCollectionReminder(
  invoice: Invoice,
  { language = "Spanish", asOf = today() }: { language?: string; asOf?: string } = {}
): Promise<{ reminder: string; daysOverdue: number; loggedToContact: boolean }> {
  const daysOverdue = daysBetween(invoice.dueDate, asOf);
  const prompt = [
    `Language: ${language}`,
    `Customer: ${invoice.counterparty}`,
    `Invoice: ${invoice.number} issued ${invoice.issueDate}, due ${invoice.dueDate}`,
    `Total: ${invoice.total} ${invoice.currency}; paid so far: ${invoice.amountPaid}; balance due: ${balanceOf(invoice)} ${invoice.currency}`,
    daysOverdue > 0 ? `Days overdue: ${daysOverdue}` : `Due in ${-daysOverdue} day(s)`,
  ].join("\n");

  const reminder = await complete(REMINDER_SYSTEM_PROMPT, prompt);

  const loggedToContact = invoice.contactId
    ? Boolean(contactsStore.addConversationEntry(invoice.contactId, { direction: "outbound", channel: "email", message: reminder }))
    : false;

  return { reminder, daysOverdue, loggedToContact };
}

// ---------- Free-form questions over the ledger ----------

const ASK_SYSTEM_PROMPT = `You are the company's accounting assistant. Answer the user's question using
only the ledger snapshot provided (accounts payable and receivable). Be concise, show the figures you
rely on, and say so plainly if the snapshot doesn't contain the answer.`;

export async function askAccountingAgent(question: string, asOf = today()): Promise<string> {
  const describe = (i: Invoice) =>
    `${i.kind} | ${i.counterparty} | #${i.number} | due ${i.dueDate} | total ${i.total} ${i.currency} | balance ${balanceOf(i)} | ${i.status}`;
  const invoices = invoicesStore.list().filter((i) => i.status !== "void");
  const snapshot = `Today: ${asOf}\nInvoices (kind | counterparty | number | due | total | balance | status):\n${
    invoices.map(describe).join("\n") || "(none)"
  }`;
  return complete(ASK_SYSTEM_PROMPT, `${snapshot}\n\nQuestion: ${question}`);
}
