import type { Integration, PhaseKey, Project, ProjectTask } from "../db.js";
import { daysBetween, phaseLabel, phasesFor, today } from "./playbook.js";

export type Health = "on-track" | "at-risk" | "off-track" | "live" | "on-hold" | "cancelled";

export interface PhaseProgress {
  key: PhaseKey;
  label: string;
  done: number;
  total: number;
}

export interface ProjectHealth {
  projectId: string;
  clientName: string;
  type: Project["type"];
  owner?: string;
  health: Health;
  reasons: string[];
  currentPhase: { key: PhaseKey; label: string } | null;
  percentComplete: number;
  daysToGoLive: number;
  targetGoLive: string;
  phases: PhaseProgress[];
  overdueTasks: ProjectTask[];
  blockedTasks: ProjectTask[];
  blockedIntegrations: Integration[];
  pendingIntegrations: Integration[];
  nextActions: ProjectTask[];
}

/**
 * Deterministic project health check — the facts every status report and the
 * dashboard are built on, so Claude only narrates and never invents status.
 */
export function analyzeProject(project: Project, asOf: string = today()): ProjectHealth {
  const phaseDefs = phasesFor(project.type);
  const phaseKeys = [...phaseDefs.map((p) => p.key), ...project.tasks.map((t) => t.phase)];
  const orderedKeys = [...new Set(phaseKeys)];

  const phases: PhaseProgress[] = orderedKeys.map((key) => {
    const tasks = project.tasks.filter((t) => t.phase === key);
    return { key, label: phaseLabel(key), done: tasks.filter((t) => t.status === "done").length, total: tasks.length };
  });

  const open = project.tasks.filter((t) => t.status !== "done");
  const overdueTasks = open.filter((t) => t.dueDate < asOf);
  const blockedTasks = open.filter((t) => t.status === "blocked");
  const blockedIntegrations = project.integrations.filter((i) => i.status === "blocked");
  const pendingIntegrations = project.integrations.filter((i) => i.status !== "live");

  const current = phases.find((p) => p.done < p.total);
  const percentComplete = project.tasks.length
    ? Math.round((100 * (project.tasks.length - open.length)) / project.tasks.length)
    : 0;
  const daysToGoLive = daysBetween(asOf, project.targetGoLive);

  const nextActions = [...open]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || orderedKeys.indexOf(a.phase) - orderedKeys.indexOf(b.phase))
    .slice(0, 5);

  const reasons: string[] = [];
  let health: Health;
  if (project.status !== "active") {
    health = project.status;
  } else {
    const maxOverdueDays = Math.max(0, ...overdueTasks.map((t) => daysBetween(t.dueDate, asOf)));
    const preGoLiveOpen = open.filter((t) => t.phase !== "hypercare");

    if (blockedTasks.length) reasons.push(`${blockedTasks.length} blocked task(s)`);
    if (blockedIntegrations.length) reasons.push(`${blockedIntegrations.length} blocked integration(s)`);
    if (overdueTasks.length) reasons.push(`${overdueTasks.length} overdue task(s), oldest ${maxOverdueDays} day(s) late`);
    if (daysToGoLive < 0 && preGoLiveOpen.length) reasons.push(`go-live date passed ${-daysToGoLive} day(s) ago`);
    else if (daysToGoLive <= 3 && pendingIntegrations.length)
      reasons.push(`${pendingIntegrations.length} integration(s) not live with ${daysToGoLive} day(s) to go-live`);

    if (blockedTasks.length || blockedIntegrations.length || maxOverdueDays > 2 || (daysToGoLive < 0 && preGoLiveOpen.length)) {
      health = "off-track";
    } else if (reasons.length) {
      health = "at-risk";
    } else {
      health = "on-track";
    }
  }

  return {
    projectId: project.id,
    clientName: project.clientName,
    type: project.type,
    owner: project.owner,
    health,
    reasons,
    currentPhase: current ? { key: current.key, label: current.label } : null,
    percentComplete,
    daysToGoLive,
    targetGoLive: project.targetGoLive,
    phases,
    overdueTasks,
    blockedTasks,
    blockedIntegrations,
    pendingIntegrations,
    nextActions,
  };
}

export interface PortfolioSummary {
  asOf: string;
  totals: {
    projects: number;
    byHealth: Record<string, number>;
    byType: Record<string, number>;
    integrationsByStatus: Record<string, number>;
  };
  /** Active projects needing attention first (off-track, then at-risk, then soonest go-live). */
  projects: ProjectHealth[];
  /** Kickoff → go-live days for projects that reached "live", to track time-to-online. */
  timeToLive: { clientName: string; days: number }[];
}

const HEALTH_ORDER: Health[] = ["off-track", "at-risk", "on-track", "on-hold", "live", "cancelled"];

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[key(item)] = (acc[key(item)] ?? 0) + 1;
    return acc;
  }, {});
}

export function analyzePortfolio(projects: Project[], asOf: string = today()): PortfolioSummary {
  const healths = projects
    .map((p) => analyzeProject(p, asOf))
    .sort(
      (a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.daysToGoLive - b.daysToGoLive
    );

  const timeToLive = projects
    .filter((p) => p.liveAt)
    .map((p) => ({ clientName: p.clientName, days: daysBetween(p.kickoffDate, p.liveAt!.slice(0, 10)) }));

  return {
    asOf,
    totals: {
      projects: projects.length,
      byHealth: countBy(healths, (h) => h.health),
      byType: countBy(projects, (p) => p.type),
      integrationsByStatus: countBy(
        projects.flatMap((p) => p.integrations),
        (i) => i.status
      ),
    },
    projects: healths,
    timeToLive,
  };
}
