import { executeX402EndpointTool } from "./tool.js";
import type {
  X402MastraTool,
  X402MastraToolConfig,
  X402MastraToolExecutionContext,
} from "./mastra-types.js";
import type { EndpointResult } from "./types.js";

const mastraToolMarker = Symbol.for("mastra.core.tool.Tool");

export function x402MastraTool<INPUT, OUTPUT = EndpointResult, ID extends string = string>(
  config: X402MastraToolConfig<INPUT, OUTPUT, ID>,
): X402MastraTool<INPUT, OUTPUT, ID> {
  return createMastraTool(config);
}

function createMastraTool<INPUT, OUTPUT = EndpointResult, ID extends string = string>(
  config: X402MastraToolConfig<INPUT, OUTPUT, ID>,
): X402MastraTool<INPUT, OUTPUT, ID> {
  const { client, endpoint, request, maxAmount, throwOnError, execute, ...toolConfig } = config;

  const tool: X402MastraTool<INPUT, OUTPUT, ID> = {
    ...toolConfig,
    execute(inputData: INPUT, context: X402MastraToolExecutionContext = {}): Promise<OUTPUT> {
      return executeX402EndpointTool(
        {
          client,
          endpoint,
          request,
          maxAmount,
          throwOnError,
          execute,
        },
        inputData,
        context,
        context.abortSignal,
      );
    },
  };

  Object.defineProperty(tool, mastraToolMarker, {
    enumerable: false,
    value: true,
  });

  return tool;
}
