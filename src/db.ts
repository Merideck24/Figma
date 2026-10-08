import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface ConversationEntry {
  id: string;
  direction: "inbound" | "outbound";
  channel: "whatsapp" | "email" | "ad";
  message: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  tags: string[];
  stage: "lead" | "qualified" | "customer" | "lost";
  notes?: string;
  conversation: ConversationEntry[];
  createdAt: string;
  updatedAt: string;
}

export type InvoiceKind = "payable" | "receivable";
export type InvoiceStatus = "open" | "partial" | "paid" | "void";

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method?: string;
  reference?: string;
  createdAt: string;
}

/**
 * A supplier bill (kind="payable", accounts payable) or a customer invoice
 * (kind="receivable", accounts receivable).
 */
export interface Invoice {
  id: string;
  kind: InvoiceKind;
  number: string;
  counterparty: string;
  contactId?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  notes?: string;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
}

export type InvoiceInput = Pick<
  Invoice,
  "kind" | "number" | "counterparty" | "contactId" | "issueDate" | "dueDate" | "currency" | "lineItems" | "subtotal" | "tax" | "total" | "notes"
>;

interface DbShape {
  contacts: Contact[];
  invoices: Invoice[];
}

const DB_PATH = process.env.DB_PATH ?? "data/db.json";

function ensureDbFile(): void {
  if (!existsSync(DB_PATH)) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify({ contacts: [], invoices: [] } satisfies DbShape, null, 2));
  }
}

function readDb(): DbShape {
  ensureDbFile();
  const data = JSON.parse(readFileSync(DB_PATH, "utf-8")) as Partial<DbShape>;
  // Older db files predate the accounting module and have no invoices array.
  return { contacts: data.contacts ?? [], invoices: data.invoices ?? [] };
}

function writeDb(data: DbShape): void {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export const contactsStore = {
  list(): Contact[] {
    return readDb().contacts;
  },

  get(id: string): Contact | undefined {
    return readDb().contacts.find((c) => c.id === id);
  },

  create(input: Pick<Contact, "name" | "phone" | "email" | "tags" | "stage" | "notes">): Contact {
    const db = readDb();
    const now = new Date().toISOString();
    const contact: Contact = {
      id: randomUUID(),
      name: input.name,
      phone: input.phone,
      email: input.email,
      tags: input.tags ?? [],
      stage: input.stage ?? "lead",
      notes: input.notes,
      conversation: [],
      createdAt: now,
      updatedAt: now,
    };
    db.contacts.push(contact);
    writeDb(db);
    return contact;
  },

  update(id: string, patch: Partial<Omit<Contact, "id" | "createdAt" | "conversation">>): Contact | undefined {
    const db = readDb();
    const contact = db.contacts.find((c) => c.id === id);
    if (!contact) return undefined;
    Object.assign(contact, patch, { updatedAt: new Date().toISOString() });
    writeDb(db);
    return contact;
  },

  delete(id: string): boolean {
    const db = readDb();
    const before = db.contacts.length;
    db.contacts = db.contacts.filter((c) => c.id !== id);
    writeDb(db);
    return db.contacts.length < before;
  },

  addConversationEntry(id: string, entry: Omit<ConversationEntry, "id" | "createdAt">): Contact | undefined {
    const db = readDb();
    const contact = db.contacts.find((c) => c.id === id);
    if (!contact) return undefined;
    contact.conversation.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry,
    });
    contact.updatedAt = new Date().toISOString();
    writeDb(db);
    return contact;
  },
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

function statusFor(invoice: Pick<Invoice, "amountPaid" | "total">): InvoiceStatus {
  if (invoice.amountPaid <= 0) return "open";
  return invoice.amountPaid >= invoice.total ? "paid" : "partial";
}

export const invoicesStore = {
  list(filter: { kind?: InvoiceKind; status?: InvoiceStatus } = {}): Invoice[] {
    return readDb().invoices.filter(
      (i) => (!filter.kind || i.kind === filter.kind) && (!filter.status || i.status === filter.status)
    );
  },

  get(id: string): Invoice | undefined {
    return readDb().invoices.find((i) => i.id === id);
  },

  findDuplicate(kind: InvoiceKind, number: string, counterparty: string): Invoice | undefined {
    const norm = (s: string) => s.trim().toLowerCase();
    return readDb().invoices.find(
      (i) => i.kind === kind && i.status !== "void" && norm(i.number) === norm(number) && norm(i.counterparty) === norm(counterparty)
    );
  },

  create(input: InvoiceInput): Invoice {
    const db = readDb();
    const now = new Date().toISOString();
    const invoice: Invoice = {
      id: randomUUID(),
      ...input,
      lineItems: input.lineItems ?? [],
      subtotal: round2(input.subtotal),
      tax: round2(input.tax),
      total: round2(input.total),
      amountPaid: 0,
      status: "open",
      payments: [],
      createdAt: now,
      updatedAt: now,
    };
    db.invoices.push(invoice);
    writeDb(db);
    return invoice;
  },

  /** Applies a payment (supplier payment made, or customer payment received). */
  addPayment(id: string, payment: Omit<Payment, "id" | "createdAt">): Invoice | undefined {
    const db = readDb();
    const invoice = db.invoices.find((i) => i.id === id);
    if (!invoice) return undefined;
    const now = new Date().toISOString();
    invoice.payments.push({ id: randomUUID(), createdAt: now, ...payment, amount: round2(payment.amount) });
    invoice.amountPaid = round2(invoice.amountPaid + payment.amount);
    invoice.status = statusFor(invoice);
    invoice.updatedAt = now;
    writeDb(db);
    return invoice;
  },

  void(id: string): Invoice | undefined {
    const db = readDb();
    const invoice = db.invoices.find((i) => i.id === id);
    if (!invoice) return undefined;
    invoice.status = "void";
    invoice.updatedAt = new Date().toISOString();
    writeDb(db);
    return invoice;
  },
};
