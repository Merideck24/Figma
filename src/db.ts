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

interface DbShape {
  contacts: Contact[];
}

const DB_PATH = process.env.DB_PATH ?? "data/db.json";

function ensureDbFile(): void {
  if (!existsSync(DB_PATH)) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify({ contacts: [] } satisfies DbShape, null, 2));
  }
}

function readDb(): DbShape {
  ensureDbFile();
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as DbShape;
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
