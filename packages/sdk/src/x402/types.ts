import type { SettleResponse } from "@x402/core/types";

import type { X402Client } from "./client.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
export type RequestBody = NonNullable<RequestInit["body"]>;
export type HeadersInput =
  | ConstructorParameters<typeof Headers>[0]
  | Record<string, string | undefined>;

export type EndpointMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD";

export interface EndpointConfig {
  url: string | URL;
  method?: EndpointMethod | Lowercase<EndpointMethod> | string | undefined;
  headers?: HeadersInput | undefined;
  query?: URLSearchParams | Record<string, unknown> | undefined;
  body?: RequestBody | JsonValue | undefined;
}

export type EndpointInput = string | URL | EndpointConfig;

export interface EndpointRequestInit
  extends Omit<RequestInit, "body" | "headers" | "method"> {
  method?: EndpointMethod | Lowercase<EndpointMethod> | string | undefined;
  headers?: HeadersInput | undefined;
  query?: URLSearchParams | Record<string, unknown> | undefined;
  body?: RequestBody | JsonValue | undefined;
}

export type EndpointResultKind =
  | "success"
  | "settle_failed"
  | "payment_required"
  | "error"
  | "passthrough";

export interface EndpointResultMetadata {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export type EndpointResult =
  | {
      kind: "success";
      paid: true;
      ok: true;
      status: number;
      body: unknown;
      paymentResponse: SettleResponse;
      metadata: EndpointResultMetadata;
    }
  | {
      kind: "settle_failed";
      paid: false;
      ok: false;
      status: number;
      body: unknown;
      paymentResponse: SettleResponse;
      metadata: EndpointResultMetadata;
    }
  | {
      kind: "payment_required";
      paid: false;
      ok: false;
      status: number;
      body: null;
      paymentResponse: null;
      metadata: EndpointResultMetadata;
    }
  | {
      kind: "error";
      paid: false;
      ok: false;
      status: number;
      body: unknown;
      paymentResponse: null;
      metadata: EndpointResultMetadata;
    }
  | {
      kind: "passthrough";
      paid: false;
      ok: true;
      status: number;
      body: unknown;
      paymentResponse: null;
      metadata: EndpointResultMetadata;
    };

export interface X402ToolExecutionContext<INPUT> {
  endpoint: EndpointResult;
  input: INPUT;
}

export type X402ToolResultMapper<INPUT, OUTPUT, OPTIONS> = (
  context: X402ToolExecutionContext<INPUT>,
  options: OPTIONS,
) => OUTPUT | PromiseLike<OUTPUT>;

export interface X402ToolExecutionOptions {
  toolCallId: string;
  messages: unknown[];
  abortSignal?: AbortSignal | undefined;
  experimental_context?: unknown;
}

export interface X402Tool<INPUT, OUTPUT = EndpointResult> {
  description?: string;
  title?: string;
  providerOptions?: any;
  metadata?: JsonObject;
  inputSchema: any;
  outputSchema?: any;
  needsApproval?:
    | boolean
    | ((
        input: any,
        options: Omit<X402ToolExecutionOptions, "abortSignal">,
      ) => boolean | PromiseLike<boolean>);
  strict?: boolean;
  onInputStart?: (
    options: X402ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  onInputDelta?: (
    options: {
      inputTextDelta: string;
    } & X402ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  onInputAvailable?: (
    options: {
      input: any;
    } & X402ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  toModelOutput?: (options: {
    toolCallId: string;
    input: any;
    output: any;
  }) => any;
  type?: undefined | "function";
  execute: (
    input: INPUT,
    options: X402ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT>;
}

export type X402ToolConfig<INPUT, OUTPUT = EndpointResult> = Omit<
  X402Tool<INPUT, OUTPUT>,
  "execute"
> & {
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
  execute?: X402ToolResultMapper<INPUT, OUTPUT, X402ToolExecutionOptions>;
};
