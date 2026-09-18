import { complete } from "../claudeClient.js";

const SYSTEM_PROMPT = `You are a performance-marketing copywriter. Given a product, target
audience, and platform, write 3 distinct ad copy variants. Each variant needs a headline
(max 40 chars) and body text (max 120 chars) suited to the platform's conventions.
Return them as a numbered list.`;

export interface AdCopyRequest {
  product: string;
  audience: string;
  platform: "facebook" | "instagram" | "google" | "tiktok" | string;
}

export async function generateAdCopy({ product, audience, platform }: AdCopyRequest): Promise<string> {
  const prompt = `Product: ${product}\nTarget audience: ${audience}\nPlatform: ${platform}`;
  return complete(SYSTEM_PROMPT, prompt);
}
