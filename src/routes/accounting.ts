import { Router } from "express";
import { contactsStore, invoicesStore, type InvoiceKind, type InvoiceStatus } from "../db.js";
import {
  askAccountingAgent,
  balanceOf,
  draftCollectionReminder,
  planSupplierPayments,
  processInvoice,
  receivablesAging,
  today,
  validateInvoice,
} from "../skills/accountingAgent.js";

export const accountingRouter = Router();

const KINDS: InvoiceKind[] = ["payable", "receivable"];
const STATUSES: InvoiceStatus[] = ["open", "partial", "paid", "void"];
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

accountingRouter.get("/invoices", (req, res) => {
  const kind = req.query.kind as InvoiceKind | undefined;
  const status = req.query.status as InvoiceStatus | undefined;
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(", ")}` });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  res.json(invoicesStore.list({ kind, status }));
});

accountingRouter.get("/invoices/:id", (req, res) => {
  const invoice = invoicesStore.get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json(invoice);
});

/** Agent path: raw invoice text (pasted, OCR'd, email body) → extracted, validated, booked. */
accountingRouter.post("/invoices/process", async (req, res) => {
  const { text, kind } = req.body ?? {};
  if (!text || !KINDS.includes(kind)) {
    return res.status(400).json({ error: `text and kind (${KINDS.join(" | ")}) are required` });
  }
  const result = await processInvoice(text, kind);
  res.status(result.saved ? 201 : 422).json(result);
});

/** Manual path: already-structured invoice, still run through the same validation. */
accountingRouter.post("/invoices", (req, res) => {
  const { kind, number, counterparty, contactId, issueDate, dueDate, currency, lineItems, subtotal, tax, total, notes } =
    req.body ?? {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(", ")}` });
  if (contactId && !contactsStore.get(contactId)) return res.status(404).json({ error: "Contact not found" });

  const { input, issues } = validateInvoice(kind, {
    number,
    counterparty,
    issueDate: isDate(issueDate) ? issueDate : undefined,
    dueDate: isDate(dueDate) ? dueDate : undefined,
    currency,
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    subtotal: typeof subtotal === "number" ? subtotal : undefined,
    tax: typeof tax === "number" ? tax : undefined,
    total: typeof total === "number" ? total : undefined,
    notes,
  });
  if (!input) return res.status(422).json({ saved: false, issues });
  const invoice = invoicesStore.create({ ...input, contactId });
  res.status(201).json({ saved: true, invoice, issues });
});

/** Records a payment: money sent to a supplier (payable) or received from a customer (receivable). */
accountingRouter.post("/invoices/:id/payments", (req, res) => {
  const invoice = invoicesStore.get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "void" || invoice.status === "paid") {
    return res.status(409).json({ error: `Invoice is already ${invoice.status}` });
  }

  const { amount, date, method, reference } = req.body ?? {};
  if (typeof amount !== "number" || !(amount > 0)) return res.status(400).json({ error: "amount must be a positive number" });
  const balance = balanceOf(invoice);
  if (amount - balance > 0.005) {
    return res.status(422).json({ error: `amount ${amount} exceeds the outstanding balance ${balance}` });
  }

  const updated = invoicesStore.addPayment(invoice.id, { amount, date: isDate(date) ? date : today(), method, reference });
  res.status(201).json(updated);
});

accountingRouter.post("/invoices/:id/void", (req, res) => {
  const invoice = invoicesStore.get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.amountPaid > 0) return res.status(409).json({ error: "Cannot void an invoice that has payments" });
  res.json(invoicesStore.void(invoice.id));
});

accountingRouter.post("/payables/payment-plan", async (req, res) => {
  const { cashAvailable, asOf, currency } = req.body ?? {};
  if (typeof cashAvailable !== "number" || cashAvailable < 0) {
    return res.status(400).json({ error: "cashAvailable must be a non-negative number" });
  }
  if (asOf !== undefined && !isDate(asOf)) return res.status(400).json({ error: "asOf must be YYYY-MM-DD" });
  res.json(await planSupplierPayments({ cashAvailable, asOf, currency }));
});

accountingRouter.get("/receivables/aging", (req, res) => {
  const asOf = req.query.asOf;
  if (asOf !== undefined && !isDate(asOf)) return res.status(400).json({ error: "asOf must be YYYY-MM-DD" });
  res.json(receivablesAging(asOf));
});

accountingRouter.post("/receivables/:id/reminder", async (req, res) => {
  const invoice = invoicesStore.get(req.params.id);
  if (!invoice || invoice.kind !== "receivable") return res.status(404).json({ error: "Receivable invoice not found" });
  if (invoice.status === "paid" || invoice.status === "void") {
    return res.status(409).json({ error: `Invoice is ${invoice.status}; nothing to collect` });
  }
  const { language } = req.body ?? {};
  res.json(await draftCollectionReminder(invoice, { language }));
});

accountingRouter.post("/ask", async (req, res) => {
  const { question } = req.body ?? {};
  if (!question) return res.status(400).json({ error: "question is required" });
  res.json({ answer: await askAccountingAgent(question) });
});
