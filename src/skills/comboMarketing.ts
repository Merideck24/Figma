import { complete } from "../claudeClient.js";
import { contactsStore } from "../db.js";

const SYSTEM_PROMPT = `You are a marketing ops strategist. Given a campaign goal, an audience
description, and a summary of the current CRM segment, produce a combo campaign plan that
coordinates WhatsApp outreach, paid ads, and email into one sequence. Structure the answer as:
1) Segment summary, 2) WhatsApp step, 3) Ads step, 4) Email step, 5) Suggested timing/order.
Keep each step to 2-3 sentences.`;

export interface ComboCampaignRequest {
  goal: string;
  audience: string;
  stageFilter?: string;
}

export async function generateComboCampaign({ goal, audience, stageFilter }: ComboCampaignRequest): Promise<{
  plan: string;
  segmentSize: number;
}> {
  const contacts = contactsStore.list();
  const segment = stageFilter ? contacts.filter((c) => c.stage === stageFilter) : contacts;

  const segmentSummary = `${segment.length} contact(s) in segment${
    stageFilter ? ` (stage="${stageFilter}")` : ""
  }. Stages breakdown: ${JSON.stringify(
    contacts.reduce<Record<string, number>>((acc, c) => {
      acc[c.stage] = (acc[c.stage] ?? 0) + 1;
      return acc;
    }, {})
  )}`;

  const prompt = `Goal: ${goal}\nAudience: ${audience}\nCRM segment: ${segmentSummary}`;
  const plan = await complete(SYSTEM_PROMPT, prompt);

  return { plan, segmentSize: segment.length };
}
