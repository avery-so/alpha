import { handleChatStream } from "@mastra/ai-sdk";
import { createFileRoute } from "@tanstack/react-router";
import { createUIMessageStreamResponse } from "ai";

import mastra from "../../mastra";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
      },
    },
  },
});
