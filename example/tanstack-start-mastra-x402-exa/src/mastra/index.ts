import { Mastra } from "@mastra/core/mastra";

import researchAgent from "./agents/research-agent";

const mastra = new Mastra({
  agents: {
    researchAgent,
  },
});

export default mastra;
