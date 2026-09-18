import { complete } from "../claudeClient.js";
import { contactsStore, type Contact } from "../db.js";

const SYSTEM_PROMPT = `You are a WhatsApp sales/support agent. Write a short, friendly,
on-brand WhatsApp reply to the customer's message below. Keep it under 300 characters,
use the contact's known context if helpful, and end with a clear next step or question.`;

export async function draftWhatsappReply(contact: Contact, incomingMessage: string): Promise<string> {
  const context = [
    `Contact: ${contact.name}`,
    `Stage: ${contact.stage}`,
    contact.tags.length ? `Tags: ${contact.tags.join(", ")}` : null,
    contact.notes ? `Notes: ${contact.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const reply = await complete(SYSTEM_PROMPT, `${context}\n\nCustomer's message: "${incomingMessage}"`);

  contactsStore.addConversationEntry(contact.id, {
    direction: "inbound",
    channel: "whatsapp",
    message: incomingMessage,
  });
  contactsStore.addConversationEntry(contact.id, {
    direction: "outbound",
    channel: "whatsapp",
    message: reply,
  });

  return reply;
}
