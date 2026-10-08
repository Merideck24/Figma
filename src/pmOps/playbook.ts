import type { PhaseKey, ProjectTask, ProjectType } from "../db.js";

export interface PhaseDefinition {
  key: PhaseKey;
  label: string;
  /** Day offsets from kickoff for this phase's window (phases overlap to compress the timeline). */
  startDay: number;
  endDay: number;
  defaultTasks: string[];
}

/**
 * The turnkey playbook: every step needed to get a new client online, sized for a
 * 14-day kickoff-to-go-live target with a one-week hypercare tail.
 */
export const TURNKEY_PHASES: PhaseDefinition[] = [
  {
    key: "kickoff",
    label: "Kickoff & onboarding",
    startDay: 0,
    endDay: 1,
    defaultTasks: [
      "Signed contract / SOW received",
      "Kickoff call held and project owner assigned",
      "Client stakeholders and decision-maker identified",
      "Shared communication channel created (WhatsApp/Slack/email)",
      "Access & credentials checklist sent to client",
    ],
  },
  {
    key: "requirements",
    label: "Requirements",
    startDay: 1,
    endDay: 3,
    defaultTasks: [
      "Business requirements questionnaire completed",
      "Integrations list confirmed with client",
      "Data migration needs identified",
      "Success criteria and go-live definition signed off",
    ],
  },
  {
    key: "design",
    label: "Design",
    startDay: 2,
    endDay: 5,
    defaultTasks: [
      "Brand assets received (logo, colors, fonts)",
      "Design mockups delivered (Figma)",
      "Client design approval",
    ],
  },
  {
    key: "setup",
    label: "Setup & configuration",
    startDay: 3,
    endDay: 7,
    defaultTasks: [
      "Account / tenant provisioned",
      "Domain and DNS configured",
      "Users and roles created",
      "Client data imported and validated",
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    startDay: 5,
    endDay: 10,
    defaultTasks: [
      "API keys / credentials received for every integration",
      "Webhooks and data flows configured",
      "End-to-end integration test passed",
    ],
  },
  {
    key: "qa",
    label: "QA & UAT",
    startDay: 9,
    endDay: 12,
    defaultTasks: ["Internal QA pass completed", "Client UAT sign-off"],
  },
  {
    key: "go-live",
    label: "Go-live",
    startDay: 12,
    endDay: 14,
    defaultTasks: ["Go-live checklist reviewed", "Client training session delivered", "Launch — client is online"],
  },
  {
    key: "hypercare",
    label: "Hypercare",
    startDay: 14,
    endDay: 21,
    defaultTasks: ["Day-7 post-launch check-in", "Handoff to customer success / support"],
  },
];

/** Phases each project type runs through. Integration-only projects skip onboarding/design work. */
const PHASES_BY_TYPE: Record<ProjectType, PhaseKey[]> = {
  "new-client": TURNKEY_PHASES.map((p) => p.key),
  expansion: ["kickoff", "requirements", "setup", "integrations", "qa", "go-live", "hypercare"],
  "new-integration": ["requirements", "integrations", "qa", "go-live"],
};

export function phasesFor(type: ProjectType): PhaseDefinition[] {
  const keys = PHASES_BY_TYPE[type];
  return TURNKEY_PHASES.filter((p) => keys.includes(p.key));
}

export function phaseLabel(key: PhaseKey): string {
  return TURNKEY_PHASES.find((p) => p.key === key)?.label ?? key;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Default go-live date for a project type: the end of its go-live phase, with the
 * phase windows compressed for types that skip early phases.
 */
export function defaultGoLive(type: ProjectType, kickoffDate: string): string {
  const phases = phasesFor(type);
  const offset = phases[0].startDay;
  const goLive = phases.find((p) => p.key === "go-live")!;
  return addDays(kickoffDate, goLive.endDay - offset);
}

/**
 * Builds the default task list for a project, spreading each phase's due date
 * proportionally across the kickoff → go-live window so a custom target date
 * stretches or compresses the whole plan.
 */
export function buildDefaultTasks(
  type: ProjectType,
  kickoffDate: string,
  targetGoLive: string
): Omit<ProjectTask, "id" | "status" | "completedAt">[] {
  const phases = phasesFor(type);
  const offset = phases[0].startDay;
  const plannedSpan = phases.find((p) => p.key === "go-live")!.endDay - offset;
  const actualSpan = Math.max(1, daysBetween(kickoffDate, targetGoLive));
  const scale = actualSpan / plannedSpan;

  return phases.flatMap((phase) => {
    const dueDate = addDays(kickoffDate, Math.round((phase.endDay - offset) * scale));
    return phase.defaultTasks.map((title) => ({ phase: phase.key, title, dueDate }));
  });
}
