import { Router } from "express";
import {
  projectsStore,
  type IntegrationStatus,
  type PhaseKey,
  type ProjectStatus,
  type ProjectType,
  type TaskStatus,
} from "../db.js";
import { analyzePortfolio, analyzeProject } from "../pmOps/analysis.js";
import { TURNKEY_PHASES, buildDefaultTasks, defaultGoLive, phasesFor, today } from "../pmOps/playbook.js";
import { randomUUID } from "node:crypto";

export const projectsRouter = Router();

const PROJECT_TYPES: ProjectType[] = ["new-client", "new-integration", "expansion"];
const PROJECT_STATUSES: ProjectStatus[] = ["active", "on-hold", "live", "cancelled"];
const TASK_STATUSES: TaskStatus[] = ["todo", "in-progress", "blocked", "done"];
const INTEGRATION_STATUSES: IntegrationStatus[] = ["requested", "in-progress", "testing", "live", "blocked"];
const PHASE_KEYS = TURNKEY_PHASES.map((p) => p.key);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an error message for the first invalid field, or null when the body is valid. */
function validate(body: Record<string, unknown>): string | null {
  const checks: [string, readonly string[]][] = [
    ["type", PROJECT_TYPES],
    ["phase", PHASE_KEYS],
  ];
  for (const [field, allowed] of checks) {
    if (body[field] !== undefined && !allowed.includes(body[field] as string)) {
      return `${field} must be one of: ${allowed.join(", ")}`;
    }
  }
  for (const field of ["kickoffDate", "targetGoLive", "dueDate"]) {
    if (body[field] !== undefined && !(typeof body[field] === "string" && DATE_RE.test(body[field]))) {
      return `${field} must be a YYYY-MM-DD date`;
    }
  }
  return null;
}

function validateStatus(status: unknown, allowed: readonly string[]): string | null {
  return status !== undefined && !allowed.includes(status as string)
    ? `status must be one of: ${allowed.join(", ")}`
    : null;
}

projectsRouter.get("/playbook", (_req, res) => {
  res.json({
    phases: TURNKEY_PHASES,
    byType: Object.fromEntries(PROJECT_TYPES.map((t) => [t, phasesFor(t).map((p) => p.key)])),
  });
});

projectsRouter.get("/dashboard", (_req, res) => {
  res.json(analyzePortfolio(projectsStore.list()));
});

projectsRouter.get("/", (_req, res) => {
  res.json(projectsStore.list().map((p) => ({ ...p, health: analyzeProject(p) })));
});

projectsRouter.get("/:id", (req, res) => {
  const project = projectsStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ ...project, health: analyzeProject(project) });
});

/**
 * Creates a project pre-loaded with the turnkey checklist for its type. Pass
 * `integrations: [{ name, kind }]` to register the integrations to set up.
 */
projectsRouter.post("/", (req, res) => {
  const body = req.body ?? {};
  const { clientName, contactId, owner, notes, integrations = [] } = body;
  const type: ProjectType = body.type ?? "new-client";
  if (!clientName) return res.status(400).json({ error: "clientName is required" });
  const error = validate({ ...body, type });
  if (error) return res.status(400).json({ error });
  if (!Array.isArray(integrations) || integrations.some((i) => !i?.name)) {
    return res.status(400).json({ error: "integrations must be an array of { name, kind? }" });
  }

  const kickoffDate: string = body.kickoffDate ?? today();
  const targetGoLive: string = body.targetGoLive ?? defaultGoLive(type, kickoffDate);
  if (targetGoLive <= kickoffDate) return res.status(400).json({ error: "targetGoLive must be after kickoffDate" });

  const now = new Date().toISOString();
  const project = projectsStore.create({
    clientName,
    type,
    contactId,
    owner,
    notes,
    kickoffDate,
    targetGoLive,
    tasks: buildDefaultTasks(type, kickoffDate, targetGoLive).map((t) => ({
      ...t,
      id: randomUUID(),
      status: "todo",
      owner,
    })),
    integrations: integrations.map((i: { name: string; kind?: string; owner?: string; notes?: string }) => ({
      id: randomUUID(),
      name: i.name,
      kind: i.kind ?? "other",
      owner: i.owner,
      notes: i.notes,
      status: "requested" as const,
      createdAt: now,
      updatedAt: now,
    })),
  });
  res.status(201).json({ ...project, health: analyzeProject(project) });
});

projectsRouter.patch("/:id", (req, res) => {
  const { clientName, status, owner, contactId, targetGoLive, notes } = req.body ?? {};
  const error = validate({ targetGoLive }) ?? validateStatus(status, PROJECT_STATUSES);
  if (error) return res.status(400).json({ error });
  const project = projectsStore.update(req.params.id, { clientName, status, owner, contactId, targetGoLive, notes });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ ...project, health: analyzeProject(project) });
});

projectsRouter.delete("/:id", (req, res) => {
  if (!projectsStore.delete(req.params.id)) return res.status(404).json({ error: "Project not found" });
  res.status(204).end();
});

projectsRouter.post("/:id/tasks", (req, res) => {
  const { title, phase, dueDate, owner } = req.body ?? {};
  if (!title || !phase || !dueDate) return res.status(400).json({ error: "title, phase and dueDate are required" });
  const error = validate({ phase, dueDate });
  if (error) return res.status(400).json({ error });
  const project = projectsStore.addTask(req.params.id, { title, phase: phase as PhaseKey, dueDate, owner });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.status(201).json({ ...project, health: analyzeProject(project) });
});

projectsRouter.patch("/:id/tasks/:taskId", (req, res) => {
  const { title, status, owner, dueDate, blocker } = req.body ?? {};
  const error = validate({ dueDate }) ?? validateStatus(status, TASK_STATUSES);
  if (error) return res.status(400).json({ error });
  const project = projectsStore.updateTask(req.params.id, req.params.taskId, { title, status, owner, dueDate, blocker });
  if (!project) return res.status(404).json({ error: "Project or task not found" });
  res.json({ ...project, health: analyzeProject(project) });
});

projectsRouter.post("/:id/integrations", (req, res) => {
  const { name, kind, owner, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const project = projectsStore.addIntegration(req.params.id, { name, kind: kind ?? "other", owner, notes });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.status(201).json({ ...project, health: analyzeProject(project) });
});

projectsRouter.patch("/:id/integrations/:integrationId", (req, res) => {
  const { name, kind, status, owner, notes } = req.body ?? {};
  const error = validateStatus(status, INTEGRATION_STATUSES);
  if (error) return res.status(400).json({ error });
  const project = projectsStore.updateIntegration(req.params.id, req.params.integrationId, {
    name,
    kind,
    status,
    owner,
    notes,
  });
  if (!project) return res.status(404).json({ error: "Project or integration not found" });
  res.json({ ...project, health: analyzeProject(project) });
});

projectsRouter.post("/:id/log", (req, res) => {
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message is required" });
  const project = projectsStore.addLog(req.params.id, message);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.status(201).json(project);
});
