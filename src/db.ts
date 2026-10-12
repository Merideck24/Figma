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

export type ProjectType = "new-client" | "new-integration" | "expansion";
export type ProjectStatus = "active" | "on-hold" | "live" | "cancelled";
export type PhaseKey =
  | "kickoff"
  | "requirements"
  | "design"
  | "setup"
  | "integrations"
  | "qa"
  | "go-live"
  | "hypercare";
export type TaskStatus = "todo" | "in-progress" | "blocked" | "done";
export type IntegrationStatus = "requested" | "in-progress" | "testing" | "live" | "blocked";

export interface ProjectTask {
  id: string;
  phase: PhaseKey;
  title: string;
  status: TaskStatus;
  owner?: string;
  /** YYYY-MM-DD */
  dueDate: string;
  blocker?: string;
  completedAt?: string;
}

export interface Integration {
  id: string;
  name: string;
  kind: string;
  status: IntegrationStatus;
  owner?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLogEntry {
  id: string;
  message: string;
  createdAt: string;
}

export interface Project {
  id: string;
  clientName: string;
  type: ProjectType;
  status: ProjectStatus;
  contactId?: string;
  owner?: string;
  /** YYYY-MM-DD */
  kickoffDate: string;
  /** YYYY-MM-DD */
  targetGoLive: string;
  /** Set when status first moves to "live"; used to measure time-to-online. */
  liveAt?: string;
  notes?: string;
  tasks: ProjectTask[];
  integrations: Integration[];
  log: ProjectLogEntry[];
  createdAt: string;
  updatedAt: string;
}

interface DbShape {
  contacts: Contact[];
  projects: Project[];
}

const DB_PATH = process.env.DB_PATH ?? "data/db.json";

function ensureDbFile(): void {
  if (!existsSync(DB_PATH)) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify({ contacts: [], projects: [] } satisfies DbShape, null, 2));
  }
}

function readDb(): DbShape {
  ensureDbFile();
  // Older db files predate `projects`, so fill in any missing collections.
  return { contacts: [], projects: [], ...(JSON.parse(readFileSync(DB_PATH, "utf-8")) as Partial<DbShape>) };
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

/**
 * Loads a project, applies `mutate` to it and persists the result. Returns the
 * mutated project, or undefined when the id is unknown or `mutate` returns false.
 */
function mutateProject(id: string, mutate: (project: Project) => boolean | void): Project | undefined {
  const db = readDb();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return undefined;
  if (mutate(project) === false) return undefined;
  project.updatedAt = new Date().toISOString();
  writeDb(db);
  return project;
}

/** Drops undefined keys so a partial PATCH body never blanks out existing fields. */
function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function logEntry(message: string): ProjectLogEntry {
  return { id: randomUUID(), message, createdAt: new Date().toISOString() };
}

export const projectsStore = {
  list(): Project[] {
    return readDb().projects;
  },

  get(id: string): Project | undefined {
    return readDb().projects.find((p) => p.id === id);
  },

  create(input: Omit<Project, "id" | "status" | "log" | "createdAt" | "updatedAt">): Project {
    const db = readDb();
    const now = new Date().toISOString();
    const project: Project = {
      ...input,
      id: randomUUID(),
      status: "active",
      log: [logEntry(`Project created (${input.type}), target go-live ${input.targetGoLive}`)],
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);
    writeDb(db);
    return project;
  },

  update(
    id: string,
    patch: Partial<Pick<Project, "clientName" | "status" | "owner" | "contactId" | "targetGoLive" | "notes">>
  ): Project | undefined {
    patch = defined(patch);
    return mutateProject(id, (project) => {
      if (patch.status && patch.status !== project.status) {
        project.log.push(logEntry(`Status: ${project.status} → ${patch.status}`));
        if (patch.status === "live" && !project.liveAt) project.liveAt = new Date().toISOString();
      }
      if (patch.targetGoLive && patch.targetGoLive !== project.targetGoLive) {
        project.log.push(logEntry(`Target go-live moved: ${project.targetGoLive} → ${patch.targetGoLive}`));
      }
      Object.assign(project, patch);
    });
  },

  delete(id: string): boolean {
    const db = readDb();
    const before = db.projects.length;
    db.projects = db.projects.filter((p) => p.id !== id);
    writeDb(db);
    return db.projects.length < before;
  },

  addTask(id: string, input: Omit<ProjectTask, "id" | "status" | "completedAt">): Project | undefined {
    return mutateProject(id, (project) => {
      project.tasks.push({ ...input, id: randomUUID(), status: "todo" });
    });
  },

  updateTask(
    id: string,
    taskId: string,
    patch: Partial<Pick<ProjectTask, "title" | "status" | "owner" | "dueDate" | "blocker">>
  ): Project | undefined {
    patch = defined(patch);
    return mutateProject(id, (project) => {
      const task = project.tasks.find((t) => t.id === taskId);
      if (!task) return false;
      if (patch.status && patch.status !== task.status) {
        project.log.push(
          logEntry(`Task "${task.title}": ${task.status} → ${patch.status}${patch.blocker ? ` (${patch.blocker})` : ""}`)
        );
        task.completedAt = patch.status === "done" ? new Date().toISOString() : undefined;
        if (patch.status !== "blocked" && patch.blocker === undefined) task.blocker = undefined;
      }
      Object.assign(task, patch);
    });
  },

  addIntegration(id: string, input: Pick<Integration, "name" | "kind" | "owner" | "notes">): Project | undefined {
    return mutateProject(id, (project) => {
      const now = new Date().toISOString();
      project.integrations.push({ ...input, id: randomUUID(), status: "requested", createdAt: now, updatedAt: now });
      project.log.push(logEntry(`Integration requested: ${input.name}`));
    });
  },

  updateIntegration(
    id: string,
    integrationId: string,
    patch: Partial<Pick<Integration, "name" | "kind" | "status" | "owner" | "notes">>
  ): Project | undefined {
    patch = defined(patch);
    return mutateProject(id, (project) => {
      const integration = project.integrations.find((i) => i.id === integrationId);
      if (!integration) return false;
      if (patch.status && patch.status !== integration.status) {
        project.log.push(logEntry(`Integration "${integration.name}": ${integration.status} → ${patch.status}`));
      }
      Object.assign(integration, patch, { updatedAt: new Date().toISOString() });
    });
  },

  addLog(id: string, message: string): Project | undefined {
    return mutateProject(id, (project) => {
      project.log.push(logEntry(message));
    });
  },
};
