# Avery SDK API Reference

All public APIs are exported from `@averyso/alpha`. Never import from internal `packages/sdk/src/...` paths. No Avery account, API key, or hosted service is required; payment execution is local x402 signing with the developer's wallet, RPC URL, and target endpoint.

```ts
import {
  X402Client,
  X402ConfigError,
  X402Error,
  X402Networks,
  X402PaymentError,
  resolveX402Network,
  x402tool,
} from "@averyso/alpha";
import type {
  EndpointConfig,
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
  EndpointResultMetadata,
  Logger,
  LogLevel,
  Network,
  SettleResponse,
  X402CallOptions,
  X402ClientOptions,
  X402NetworkInfo,
  X402NetworkInput,
  X402NetworkName,
  X402NetworkSlug,
  X402Tool,
  X402ToolConfig,
  X402ToolExecutionOptions,
} from "@averyso/alpha";
```

## Table of contents

- [`X402Client`](#x402client)
- [`X402ClientOptions`](#x402clientoptions)
- [`call()` and `X402CallOptions`](#call-and-x402calloptions)
- [`x402tool()` and `X402ToolConfig`](#x402tool-and-x402toolconfig)
- [Endpoint types](#endpoint-types)
- [`EndpointResult`](#endpointresult)
- [Errors](#errors)
- [Logging](#logging)
- [Network helpers](#network-helpers)

## `X402Client`

Pays and calls x402-protected HTTP endpoints.

```ts
new X402Client(privateKey, options);
```

- `privateKey` — EVM: 32-byte hex string, with or without `0x`. Solana: base58-encoded 64-byte secret key. Server-side only.
- `options` — `X402ClientOptions` (below).

Properties:

- `client.network` — configured network as normalized CAIP-2 `Network`.
- `client.maxAmount` — the client default payment cap (`bigint`).

## `X402ClientOptions`

```ts
interface X402ClientOptions {
  network: X402NetworkInput; // required
  logLevel?: LogLevel; // default "info"
  logger?: Logger;
  fetch?: typeof fetch; // falls back to globalThis.fetch; throws X402ConfigError if neither exists
  maxAmount?: bigint; // default per-payment cap; defaults to 100000n
  rpcUrl?: string;
}
```

There is **no** `facilitator` option by design. The client configures only the buyer side: wallet, network, cap, fetch, logging, RPC. The resource server controls accepted assets, pricing, scheme, and settlement.

`maxAmount` is an atomic-unit cap, not a decimal and not a user/session/day budget. See `spend-controls.md` and `networks.md`.

## `call()` and `X402CallOptions`

```ts
const result = await client.call(endpoint, init?, opts?);
```

- `endpoint` — `EndpointInput` (string | URL | `EndpointConfig`).
- `init` — `EndpointRequestInit` (method, headers, query, body, plus standard `RequestInit` fields).
- `opts` — `X402CallOptions`.

```ts
interface X402CallOptions {
  signal?: AbortSignal;
  maxAmount?: bigint; // overrides client default for this call
  throwOnError?: boolean; // default false
}
```

By default `call()` resolves to an `EndpointResult`. With `throwOnError: true`, failed results throw `X402PaymentError` instead.

## `x402tool()` and `X402ToolConfig`

Creates a Vercel AI SDK `ToolSet`-compatible tool backed by an x402 endpoint.

```ts
function x402tool<INPUT, OUTPUT = EndpointResult>(config: X402ToolConfig<INPUT, OUTPUT>): X402Tool;
```

```ts
type X402ToolConfig<INPUT, OUTPUT = EndpointResult> = {
  client: X402Client;
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput);
  request?: (
    input: INPUT,
  ) =>
    | EndpointRequestInit
    | EndpointConfig
    | undefined
    | PromiseLike<EndpointRequestInit | EndpointConfig | undefined>;
  maxAmount?: bigint;
  throwOnError?: boolean;
  execute?: (
    context: { endpoint: EndpointResult; input: INPUT },
    options: X402ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT>;
};
```

The config also accepts AI SDK-style tool fields implemented by `X402Tool`: `description`, `title`, `inputSchema`, `outputSchema`, `needsApproval`, `strict`, and streaming input callbacks.

Behavior:

- **Automatic input mapping** (no `request`): `GET`/`HEAD`/`DELETE` input → query string; `POST`/`PUT`/`PATCH` input → JSON body.
- **`request` provided** → automatic mapping is disabled; the returned object is the request shape.
- **No `execute`** → the tool returns the raw `EndpointResult` (default `OUTPUT`).
- **`execute` provided** → returns your model-friendly value; receives `{ endpoint, input }`.

```ts
interface X402ToolExecutionOptions {
  toolCallId: string;
  messages: unknown[];
  abortSignal?: AbortSignal;
  experimental_context?: unknown;
}
```

These are passed through from the AI SDK tool execution context.

## Endpoint types

```ts
interface EndpointConfig {
  url: string | URL;
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}

type EndpointInput = string | URL | EndpointConfig;

interface EndpointRequestInit extends Omit<RequestInit, "body" | "headers" | "method"> {
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}
```

- `EndpointInput` is accepted by `X402Client.call()` and `x402tool()`'s `endpoint`.
- `EndpointRequestInit` is the second arg to `call()` and the return of an `x402tool()` `request` function.

## `EndpointResult`

A discriminated union keyed by `kind`:

- `success` — paid and settled successfully.
- `settle_failed` — settlement failed after the endpoint response.
- `payment_required` — payment was required but no compatible payment completed.
- `error` — the request or x402 flow failed.
- `passthrough` — the response didn't require payment; returned without paying.

Every variant includes metadata:

```ts
interface EndpointResultMetadata {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

The union also exposes `ok`, `paid`, `status`, `body`, `paymentResponse`, and `metadata`. **Narrow on `kind` before reading payment-specific fields** like `paymentResponse` (a `SettleResponse` on `success`/`settle_failed`).

## Errors

- **`X402Error`** — base class. Has `details` (`X402ErrorDetails`).
- **`X402ConfigError`** — invalid private key, unsupported network input, unsupported Solana CAIP-2, or missing `fetch`. Usually not retryable.
- **`X402PaymentError`** — thrown for paid endpoint failures when `throwOnError: true`. Has `status` and optional `details`.

```ts
interface X402ErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}
```

When the SDK normalizes an unexpected failure, `details.cause` holds the original error.

## Logging

```ts
interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
```

Pass `logger` and `logLevel` via `X402ClientOptions`. The SDK logger is diagnostic — it does not carry app context (user id, conversation id, approval decision, budget reservation) needed for a spend audit trail. Wrap it with your own adapter for audit events.

## Network helpers

```ts
function resolveX402Network(input: X402NetworkInput): Network; // e.g. "base-sepolia" -> "eip155:84532"

type X402NetworkInput = X402NetworkName | X402NetworkSlug | Network | string;
```

`X402Networks` constants and the full friendly-name / slug / CAIP-2 table are in `networks.md`.
