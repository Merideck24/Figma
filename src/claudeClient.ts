import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

/**
 * Runs a single-turn completion. Falls back to a deterministic mock when
 * ANTHROPIC_API_KEY is not set, so every skill stays runnable/testable offline.
 */
export async function complete(system: string, prompt: string): Promise<string> {
  if (!client) {
    return `[mock output — set ANTHROPIC_API_KEY for real Claude output]\nSystem: ${system}\nPrompt: ${prompt}`;
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

export const isLiveMode = Boolean(client);
