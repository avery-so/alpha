import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";

import mastra from "../../../src/mastra";

export const runtime = "nodejs";

export async function POST(request: Request) {
  console.info("Starting Mastra chat request.");

  try {
    const params = await request.json();
    const stream = await handleChatStream({
      mastra,
      agentId: "research-agent",
      params,
      version: "v6",
    });

    console.info("Mastra chat stream started.");

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    console.error("Mastra chat request failed.", {
      message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
