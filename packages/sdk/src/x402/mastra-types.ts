import type { X402Client } from "./client.js";
import type {
  EndpointConfig,
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
  X402ToolResultMapper,
} from "./types.js";

export type X402MastraToolPayloadTransformTarget = "display" | "transcript";

export type X402MastraToolPayloadTransformPhase =
  | "input-delta"
  | "input-available"
  | "output-available"
  | "error"
  | "approval"
  | "suspend"
  | "resume";

export interface X402MastraToolPayloadTransformContext<
  INPUT = unknown,
  OUTPUT = unknown,
  ERROR = unknown,
> {
  target: X402MastraToolPayloadTransformTarget;
  phase: X402MastraToolPayloadTransformPhase;
  toolName: string;
  toolCallId: string;
  input?: INPUT | undefined;
  inputTextDelta?: string | undefined;
  output?: OUTPUT | undefined;
  error?: ERROR | undefined;
  suspendPayload?: unknown;
  resumeData?: unknown;
  providerMetadata?: Record<string, unknown> | undefined;
  context?: Record<string, unknown> | undefined;
}

export type X402MastraToolPayloadTransformFunction<
  INPUT = unknown,
  OUTPUT = unknown,
  ERROR = unknown,
> = (
  context: X402MastraToolPayloadTransformContext<INPUT, OUTPUT, ERROR>,
) => unknown | PromiseLike<unknown>;

export interface X402MastraToolPayloadTransformTargetConfig<
  INPUT = unknown,
  OUTPUT = unknown,
  ERROR = unknown,
> {
  input?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  inputDelta?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  output?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  error?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  approval?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  suspend?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
  resume?: X402MastraToolPayloadTransformFunction<INPUT, OUTPUT, ERROR>;
}

export type X402MastraToolPayloadTransform<
  INPUT = unknown,
  OUTPUT = unknown,
  ERROR = unknown,
> = Partial<
  Record<
    X402MastraToolPayloadTransformTarget,
    X402MastraToolPayloadTransformTargetConfig<INPUT, OUTPUT, ERROR>
  >
>;

export interface X402MastraMcpToolAnnotations {
  title?: string | undefined;
  readOnlyHint?: boolean | undefined;
  destructiveHint?: boolean | undefined;
  idempotentHint?: boolean | undefined;
  openWorldHint?: boolean | undefined;
}

export interface X402MastraMcpToolProperties {
  toolType?: "agent" | "workflow" | undefined;
  annotations?: X402MastraMcpToolAnnotations | undefined;
  _meta?: Record<string, unknown> | undefined;
}

export interface X402MastraToolExecutionContext {
  abortSignal?: AbortSignal | undefined;
  toolCallId?: string | undefined;
  messages?: unknown[] | undefined;
  requestContext?: unknown;
  workspace?: unknown;
  [key: string]: unknown;
}

export interface X402MastraApprovalContext {
  requestContext?: Record<string, unknown> | undefined;
  workspace?: unknown;
}

export interface X402MastraToolCallbackOptions {
  toolCallId?: string | undefined;
  messages?: unknown[] | undefined;
  [key: string]: unknown;
}

export interface X402MastraTool<
  INPUT,
  OUTPUT = EndpointResult,
  ID extends string = string,
> {
  id: ID;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  requestContextSchema?: unknown;
  suspendSchema?: unknown;
  resumeSchema?: unknown;
  execute: (
    inputData: INPUT,
    context?: X402MastraToolExecutionContext,
  ) => Promise<OUTPUT>;
  mastra?: unknown;
  requireApproval?:
    | boolean
    | ((
        input: INPUT,
        context?: X402MastraApprovalContext,
      ) => boolean | PromiseLike<boolean>);
  strict?: boolean | undefined;
  providerOptions?: Record<string, Record<string, unknown>> | undefined;
  toModelOutput?: ((output: OUTPUT) => unknown) | undefined;
  transform?: X402MastraToolPayloadTransform<INPUT, OUTPUT> | undefined;
  inputExamples?: { input: Record<string, unknown> }[] | undefined;
  mcp?: X402MastraMcpToolProperties | undefined;
  mcpMetadata?: Record<string, unknown> | undefined;
  background?: unknown;
  onInputStart?: (
    options: X402MastraToolCallbackOptions,
  ) => void | PromiseLike<void>;
  onInputDelta?: (
    options: {
      inputTextDelta: string;
    } & X402MastraToolCallbackOptions,
  ) => void | PromiseLike<void>;
  onInputAvailable?: (
    options: {
      input: INPUT;
    } & X402MastraToolCallbackOptions,
  ) => void | PromiseLike<void>;
  onOutput?: (
    options: {
      output: OUTPUT;
      toolName: string;
    } & X402MastraToolCallbackOptions,
  ) => void | PromiseLike<void>;
}

export type X402MastraToolConfig<
  INPUT,
  OUTPUT = EndpointResult,
  ID extends string = string,
> = Omit<X402MastraTool<INPUT, OUTPUT, ID>, "execute"> & {
  client: X402Client;
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
  execute?: X402ToolResultMapper<INPUT, OUTPUT, X402MastraToolExecutionContext>;
};
