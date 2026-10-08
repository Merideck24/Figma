/**
 * Seeds demo PM Ops projects so the tracking panel (/pm.html) has something to show.
 * Usage: npm run seed:pm  (respects DB_PATH)
 */
import { randomUUID } from "node:crypto";
import { projectsStore, type IntegrationStatus, type ProjectType, type TaskStatus } from "./db.js";
import { addDays, buildDefaultTasks, defaultGoLive, today } from "./pmOps/playbook.js";

interface DemoProject {
  clientName: string;
  type: ProjectType;
  owner: string;
  kickoffOffset: number;
  /** Number of leading checklist tasks already completed. */
  done: number;
  blocked?: { index: number; blocker: string };
  integrations: [name: string, kind: string, status: IntegrationStatus, notes?: string][];
  live?: boolean;
}

const DEMO: DemoProject[] = [
  {
    clientName: "Clínica Dental Sonrisa",
    type: "new-client",
    owner: "Erick",
    kickoffOffset: -9,
    done: 12,
    blocked: { index: 14, blocker: "Cliente no ha enviado credenciales de Stripe" },
    integrations: [
      ["WhatsApp Business", "messaging", "testing"],
      ["Stripe", "payments", "blocked", "Esperando API keys del cliente"],
      ["Google Calendar", "scheduling", "in-progress"],
    ],
  },
  {
    clientName: "Ferretería El Tornillo",
    type: "new-client",
    owner: "Ana",
    kickoffOffset: -4,
    done: 9,
    integrations: [
      ["Shopify", "ecommerce", "in-progress"],
      ["WhatsApp Business", "messaging", "requested"],
    ],
  },
  {
    clientName: "Grupo Andes Logística",
    type: "new-integration",
    owner: "Erick",
    kickoffOffset: -6,
    done: 3,
    integrations: [["SAP Business One", "erp", "in-progress", "Mapeo de campos en revisión"]],
  },
  {
    clientName: "Café Altura",
    type: "new-client",
    owner: "Luis",
    kickoffOffset: -1,
    done: 3,
    integrations: [
      ["Square POS", "pos", "requested"],
      ["Mailchimp", "email", "requested"],
    ],
  },
  {
    clientName: "Óptica Visión Clara",
    type: "expansion",
    owner: "Ana",
    kickoffOffset: -11,
    done: 21,
    integrations: [["HubSpot", "crm", "live"]],
  },
  {
    clientName: "Boutique Lúa",
    type: "new-client",
    owner: "Luis",
    kickoffOffset: -20,
    done: 30,
    live: true,
    integrations: [
      ["Shopify", "ecommerce", "live"],
      ["WhatsApp Business", "messaging", "live"],
    ],
  },
];

for (const demo of DEMO) {
  const kickoffDate = addDays(today(), demo.kickoffOffset);
  const targetGoLive = defaultGoLive(demo.type, kickoffDate);
  const now = new Date().toISOString();
  const tasks = buildDefaultTasks(demo.type, kickoffDate, targetGoLive).map((t, i) => {
    let status: TaskStatus = i < demo.done ? "done" : "todo";
    if (demo.blocked?.index === i) status = "blocked";
    return {
      ...t,
      id: randomUUID(),
      status,
      owner: demo.owner,
      blocker: demo.blocked?.index === i ? demo.blocked.blocker : undefined,
      completedAt: status === "done" ? now : undefined,
    };
  });

  const project = projectsStore.create({
    clientName: demo.clientName,
    type: demo.type,
    owner: demo.owner,
    kickoffDate,
    targetGoLive,
    tasks,
    integrations: demo.integrations.map(([name, kind, status, notes]) => ({
      id: randomUUID(),
      name,
      kind,
      status,
      notes,
      createdAt: now,
      updatedAt: now,
    })),
  });
  if (demo.live) projectsStore.update(project.id, { status: "live" });
  console.log(`Seeded ${demo.clientName}`);
}
