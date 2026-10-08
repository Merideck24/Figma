import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { contactsRouter } from "./routes/contacts.js";
import { skillsRouter } from "./routes/skills.js";
import { accountingRouter } from "./routes/accounting.js";
import { isLiveMode } from "./claudeClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, claudeMode: isLiveMode ? "live" : "mock" });
});

app.use("/api/contacts", contactsRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/accounting", accountingRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`ClaudeEO server listening on http://localhost:${PORT} (Claude mode: ${isLiveMode ? "live" : "mock"})`);
});
