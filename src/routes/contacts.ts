import { Router } from "express";
import { contactsStore } from "../db.js";

export const contactsRouter = Router();

contactsRouter.get("/", (_req, res) => {
  res.json(contactsStore.list());
});

contactsRouter.get("/:id", (req, res) => {
  const contact = contactsStore.get(req.params.id);
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(contact);
});

contactsRouter.post("/", (req, res) => {
  const { name, phone, email, tags, stage, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const contact = contactsStore.create({ name, phone, email, tags, stage, notes });
  res.status(201).json(contact);
});

contactsRouter.patch("/:id", (req, res) => {
  const contact = contactsStore.update(req.params.id, req.body ?? {});
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(contact);
});

contactsRouter.delete("/:id", (req, res) => {
  const deleted = contactsStore.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Contact not found" });
  res.status(204).end();
});
