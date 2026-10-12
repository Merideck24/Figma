import { Router } from "express";
import { contactsStore, projectsStore } from "../db.js";
import { draftWhatsappReply } from "../skills/whatsappAgent.js";
import { generateAdCopy } from "../skills/claudeAds.js";
import { generateComboCampaign } from "../skills/comboMarketing.js";
import { analyzeIntake, generatePortfolioDigest, generateStatusReport } from "../skills/pmOpsAgent.js";

export const skillsRouter = Router();

skillsRouter.post("/whatsapp-reply", async (req, res) => {
  const { contactId, message } = req.body ?? {};
  if (!contactId || !message) {
    return res.status(400).json({ error: "contactId and message are required" });
  }
  const contact = contactsStore.get(contactId);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  const reply = await draftWhatsappReply(contact, message);
  res.json({ reply });
});

skillsRouter.post("/ad-copy", async (req, res) => {
  const { product, audience, platform } = req.body ?? {};
  if (!product || !audience || !platform) {
    return res.status(400).json({ error: "product, audience and platform are required" });
  }
  const copy = await generateAdCopy({ product, audience, platform });
  res.json({ copy });
});

skillsRouter.post("/combo-campaign", async (req, res) => {
  const { goal, audience, stageFilter } = req.body ?? {};
  if (!goal || !audience) {
    return res.status(400).json({ error: "goal and audience are required" });
  }
  const result = await generateComboCampaign({ goal, audience, stageFilter });
  res.json(result);
});

skillsRouter.post("/pm-status-report", async (req, res) => {
  const { projectId, audience = "internal", language = "es" } = req.body ?? {};
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!["internal", "client"].includes(audience)) {
    return res.status(400).json({ error: "audience must be internal or client" });
  }
  const project = projectsStore.get(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await generateStatusReport({ project, audience, language }));
});

skillsRouter.post("/pm-portfolio-digest", async (req, res) => {
  const { language = "es" } = req.body ?? {};
  res.json(await generatePortfolioDigest(language));
});

skillsRouter.post("/pm-intake", async (req, res) => {
  const { clientName, notes, language = "es" } = req.body ?? {};
  if (!clientName || !notes) return res.status(400).json({ error: "clientName and notes are required" });
  res.json({ brief: await analyzeIntake({ clientName, notes, language }) });
});
