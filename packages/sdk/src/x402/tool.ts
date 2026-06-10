import { prepareEndpointRequest } from "./endpoint.js";
import { X402PaymentError } from "./errors.js";
import type {
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
  X402Tool,
  X402ToolConfig,
  X402ToolExecutionOptions,
} from "./types.js";

export function x402tool<INPUT, OUTPUT = EndpointResult>(
  config: X402ToolConfig<INPUT, OUTPUT>,
): X402Tool<INPUT, OUTPUT> {
  const {
    client,
    endpoint,
    request,
    maxAmount,
    throwOnError,
    execute,
    ...toolConfig
  } = config;

  return {
    ...toolConfig,
    async execute(input: INPUT, options: X402ToolExecutionOptions) {
      const endpointInput = resolveEndpoint(endpoint, input);
      const requestOverride = await request?.(input);
      const prepared = prepareEndpointRequest(endpointInput, {
        request: requestOverride as EndpointRequestInit | undefined,
        signal: options.abortSignal,
        toolInput: requestOverride === undefined ? input : undefined,
      });

      const result = await client.call(
        prepared.url,
        {
          ...prepared.init,
          method: prepared.method,
        },
        {
          maxAmount,
          throwOnError,
          signal: options.abortSignal,
        },
      );

      if (throwOnError && !result.ok) {
        throw new X402PaymentError(
          `x402 tool endpoint failed with ${result.kind}.`,
          result.status,
          {
            result,
          },
        );
      }

      if (execute === undefined) {
        return result as OUTPUT;
      }

      return execute(
        {
          endpoint: result,
          input,
        },
        options,
      );
    },
  } as X402Tool<INPUT, OUTPUT>;
}

function resolveEndpoint<INPUT>(
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput),
  input: INPUT,
): EndpointInput {
  return typeof endpoint === "function" ? endpoint(input) : endpoint;
}
