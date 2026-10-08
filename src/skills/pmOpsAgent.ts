import { complete } from "../claudeClient.js";
import { projectsStore, type Project } from "../db.js";
import { analyzePortfolio, analyzeProject, type ProjectHealth } from "../pmOps/analysis.js";
import { TURNKEY_PHASES } from "../pmOps/playbook.js";

const COMPANY = process.env.PM_COMPANY_NAME ?? "SS1";

const AGENT_ROLE = `You are the ${COMPANY} PM Operations agent. You track client projects through the
${COMPANY} turnkey process (kickoff & onboarding → requirements → design → setup → integrations →
QA/UAT → go-live → hypercare) with one goal: get every client online in record time.
Only use the facts provided; never invent status, dates, or owners. Be concise and action-oriented.`;

function languageRule(language: string): string {
  return language === "en" ? "Write in English." : "Escribe en español.";
}

function healthFacts(h: ProjectHealth, project: Project): string {
  const lines = [
    `Client: ${h.clientName} (${h.type}), owner: ${h.owner ?? "unassigned"}`,
    `Health: ${h.health}${h.reasons.length ? ` — ${h.reasons.join("; ")}` : ""}`,
    `Progress: ${h.percentComplete}% · current phase: ${h.currentPhase?.label ?? "all tasks done"}`,
    `Target go-live: ${h.targetGoLive} (${h.daysToGoLive} day(s) from today)`,
    `Phases: ${h.phases.map((p) => `${p.label} ${p.done}/${p.total}`).join(", ")}`,
  ];
  if (h.blockedTasks.length)
    lines.push(`Blocked tasks: ${h.blockedTasks.map((t) => `"${t.title}"${t.blocker ? ` (${t.blocker})` : ""}`).join("; ")}`);
  if (h.overdueTasks.length)
    lines.push(`Overdue tasks: ${h.overdueTasks.map((t) => `"${t.title}" due ${t.dueDate}`).join("; ")}`);
  if (project.integrations.length)
    lines.push(
      `Integrations: ${project.integrations
        .map((i) => `${i.name} [${i.kind}] ${i.status}${i.notes ? ` — ${i.notes}` : ""}`)
        .join("; ")}`
    );
  if (h.nextActions.length)
    lines.push(
      `Next open tasks: ${h.nextActions
        .map((t) => `"${t.title}" (${t.phase}, due ${t.dueDate}, ${t.owner ?? "no owner"}, ${t.status})`)
        .join("; ")}`
    );
  const recentLog = project.log.slice(-8);
  if (recentLog.length)
    lines.push(`Recent activity:\n${recentLog.map((e) => `- ${e.createdAt.slice(0, 10)} ${e.message}`).join("\n")}`);
  if (project.notes) lines.push(`Notes: ${project.notes}`);
  return lines.join("\n");
}

export interface StatusReportRequest {
  project: Project;
  audience: "internal" | "client";
  language: string;
}

/** A per-project status update — internal (blunt, risks + owners) or client-facing (polished). */
export async function generateStatusReport({ project, audience, language }: StatusReportRequest): Promise<{
  report: string;
  health: ProjectHealth;
}> {
  const health = analyzeProject(project);
  const audienceRule =
    audience === "client"
      ? `Write a client-facing status update: friendly and professional, focused on progress, what we
need from the client (pending credentials, approvals, assets), and the go-live date. Do not expose
internal owners or internal blame.`
      : `Write an internal PM status update with sections: 1) Health & why, 2) Blockers and who must
unblock them, 3) Next 3-5 actions with owner and due date, 4) Integrations status, 5) Recommendation
to protect or pull in the go-live date.`;

  const report = await complete(`${AGENT_ROLE}\n\n${audienceRule}\n${languageRule(language)}`, healthFacts(health, project), 1500);
  return { report, health };
}

/** A daily/weekly digest across every project: what needs attention today. */
export async function generatePortfolioDigest(language: string): Promise<{
  digest: string;
  summary: ReturnType<typeof analyzePortfolio>;
}> {
  const projects = projectsStore.list();
  const summary = analyzePortfolio(projects);
  const active = summary.projects.filter((h) => ["off-track", "at-risk", "on-track"].includes(h.health));

  const facts = [
    `Date: ${summary.asOf}`,
    `Totals: ${JSON.stringify(summary.totals)}`,
    summary.timeToLive.length
      ? `Time-to-live (kickoff → live, days): ${summary.timeToLive.map((t) => `${t.clientName} ${t.days}`).join(", ")}`
      : null,
    ...active.map((h) => {
      const project = projects.find((p) => p.id === h.projectId)!;
      return `\n### ${h.clientName}\n${healthFacts(h, project)}`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  const system = `${AGENT_ROLE}

Write the PM operations digest for the team, with sections:
1) Headline (one line: how many projects, how many need attention),
2) Fires — off-track projects with the exact blocker and who must act today,
3) Watch list — at-risk projects,
4) Integrations pipeline (new / in progress / blocked),
5) Go-lives in the next 7 days,
6) Top 5 actions for today, ordered by impact on getting clients online faster.
${languageRule(language)}`;

  const digest = active.length ? await complete(system, facts, 2000) : "No active projects.";
  return { digest, summary };
}

export interface IntakeRequest {
  clientName: string;
  notes: string;
  language: string;
}

/**
 * Turns raw kickoff/sales notes into a structured requirements brief: scope,
 * integrations to set up, design inputs, missing information, and risks to go-live.
 */
export async function analyzeIntake({ clientName, notes, language }: IntakeRequest): Promise<string> {
  const playbook = TURNKEY_PHASES.map((p) => `- ${p.label}: ${p.defaultTasks.join("; ")}`).join("\n");
  const system = `${AGENT_ROLE}

You are processing a new client intake. From the notes, produce:
1) Client summary & business goal,
2) Requirements (functional, data, design/brand),
3) Integrations to set up (name, purpose, what credentials/access we need from the client),
4) Missing information — a checklist of questions to send the client today,
5) Risks to a fast go-live and how to mitigate them,
6) Recommended go-live target in days from kickoff, with justification.

Our turnkey playbook for reference:
${playbook}

${languageRule(language)}`;

  return complete(system, `Client: ${clientName}\n\nIntake notes:\n${notes}`, 2000);
}
