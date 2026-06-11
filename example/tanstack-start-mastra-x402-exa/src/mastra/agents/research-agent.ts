import { gateway } from "@ai-sdk/gateway";
import { Agent } from "@mastra/core/agent";

import { searchExaTool } from "../tools/search-exa";

const researchAgent = new Agent({
  id: "research-agent",
  name: "Research Agent",
  instructions:
    "You are a concise research assistant. Use searchExa when current web context would improve the answer, then cite the returned URLs.",
  model: gateway(process.env.AI_MODEL ?? "anthropic/claude-sonnet-4.5"),
  tools: {
    searchExa: searchExaTool,
  },
});

export default researchAgent;
