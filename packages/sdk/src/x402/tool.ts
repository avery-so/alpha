import { prepareEndpointRequest } from "./endpoint.js";
import { X402PaymentError } from "./errors.js";
import type {
  EndpointConfig,
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
  X402Tool,
  X402ToolConfig,
  X402ToolExecutionOptions,
  X402ToolResultMapper,
} from "./types.js";

export interface X402EndpointToolRuntimeConfig<INPUT, OUTPUT, OPTIONS> {
  client: X402ToolConfig<INPUT, OUTPUT>["client"];
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput);
  request?:
    | ((
        input: INPUT,
      ) =>
        | EndpointRequestInit
        | EndpointConfig
        | undefined
        | PromiseLike<EndpointRequestInit | EndpointConfig | undefined>)
    | undefined;
  maxAmount?: bigint | undefined;
  throwOnError?: boolean | undefined;
  execute?: X402ToolResultMapper<INPUT, OUTPUT, OPTIONS> | undefined;
}

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
    execute(input: INPUT, options: X402ToolExecutionOptions) {
      return executeX402EndpointTool(
        {
          client,
          endpoint,
          request,
          maxAmount,
          throwOnError,
          execute,
        },
        input,
        options,
        options.abortSignal,
      );
    },
  } as X402Tool<INPUT, OUTPUT>;
}

export async function executeX402EndpointTool<INPUT, OUTPUT, OPTIONS>(
  config: X402EndpointToolRuntimeConfig<INPUT, OUTPUT, OPTIONS>,
  input: INPUT,
  options: OPTIONS,
  signal: AbortSignal | undefined,
): Promise<OUTPUT> {
  const { client, endpoint, request, maxAmount, throwOnError, execute } =
    config;
  const endpointInput = resolveEndpoint(endpoint, input);
  const requestOverride = await request?.(input);
  const prepared = prepareEndpointRequest(endpointInput, {
    request: requestOverride,
    signal,
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
      signal,
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
}

function resolveEndpoint<INPUT>(
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput),
  input: INPUT,
): EndpointInput {
  return typeof endpoint === "function" ? endpoint(input) : endpoint;
}
