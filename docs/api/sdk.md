# SDK API Reference

This reference documents the public APIs behind Alpha agent payment tools and
direct x402 paid HTTP calls.

All public SDK APIs are exported from `@averyso/alpha`. Do not import from
`packages/sdk/src/...` paths.

```ts
import {
  AlphaClient,
  AlphaError,
  X402Client,
  X402ConfigError,
  X402Error,
  X402Networks,
  X402PaymentError,
  resolveX402Network,
  x402tool,
} from "@averyso/alpha";
```

## `X402Client`

Pays and calls x402-protected HTTP endpoints.

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});
```

Constructor signature:

```ts
new X402Client(privateKey, options);
```

For EVM networks, `privateKey` must be a 32-byte hex string. It can include or
omit the `0x` prefix. For Solana networks, `privateKey` must be a
base58-encoded 64-byte Solana secret key.

### `X402ClientOptions`

```ts
interface X402ClientOptions {
  network: X402NetworkInput;
  logLevel?: LogLevel;
  logger?: Logger;
  fetch?: typeof fetch;
  maxAmount?: bigint;
  rpcUrl?: string;
}
```

- `network`: Required x402 network. Accepts `X402Networks` constants, friendly
  names, primary slugs, or raw CAIP-2 `Network` strings.
- `logLevel`: Minimum level for the default logger. Defaults to `"info"`.
- `logger`: Custom logger with `debug`, `info`, `warn`, and `error` methods.
- `fetch`: Custom fetch implementation. If neither this nor `globalThis.fetch`
  is available, the constructor throws `X402ConfigError`.
- `maxAmount`: Default payment cap. Defaults to `100000n`.
- `rpcUrl`: Optional RPC URL passed to the payment scheme.

The `maxAmount` value is an atomic-unit cap, not a decimal string.

### Network Selection

```ts
new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
});

new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
});

resolveX402Network("base-sepolia"); // "eip155:84532"
```

`client.network` always returns normalized CAIP-2, so
`new X402Client(key, { network: "Base Sepolia" }).network` is
`"eip155:84532"`. Existing raw CAIP-2 inputs such as `"eip155:84532"` continue
to work.

Friendly names, primary slugs, and built-in aliases are matched
case-insensitively after trimming and collapsing whitespace. Raw `eip155:*`
CAIP-2 values pass through for compatibility. Raw Solana CAIP-2 values must be
one of the supported Solana entries in the table below.

```ts
const X402Networks: {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  base: "eip155:8453";
  polygon: "eip155:137";
  xLayer: "eip155:196";
  peaq: "eip155:3338";
  sei: "eip155:1329";
  skaleBase: "eip155:1187947933";
  kiteAI: "eip155:2366";
  arbitrum: "eip155:42161";
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
  baseSepolia: "eip155:84532";
  avalancheFuji: "eip155:43113";
  polygonAmoy: "eip155:80002";
  xLayerTestnet: "eip155:1952";
  seiTestnet: "eip155:713715";
  skaleBaseSepolia: "eip155:324705682";
  arbitrumSepolia: "eip155:421614";
};

type X402NetworkInput = X402NetworkName | X402NetworkSlug | Network | string;

function resolveX402Network(input: X402NetworkInput): Network;
```

Built-in friendly names and primary slugs:

| Friendly Name | Primary Slug | CAIP-2 |
|---|---:|---|
| `Solana Mainnet` | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet` | `base` | `eip155:8453` |
| `Polygon Mainnet` | `polygon` | `eip155:137` |
| `xLayer Mainnet` | `xlayer` | `eip155:196` |
| `Peaq Mainnet` | `peaq` | `eip155:3338` |
| `Sei Mainnet` | `sei` | `eip155:1329` |
| `SKALE Base` | `skale-base` | `eip155:1187947933` |
| `KiteAI Mainnet` | `kiteai` | `eip155:2366` |
| `Arbitrum One` | `arbitrum` | `eip155:42161` |
| `Solana Devnet` | `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia` | `base-sepolia` | `eip155:84532` |
| `Avalanche Fuji` | `avalanche-fuji` | `eip155:43113` |
| `Polygon Amoy` | `polygon-amoy` | `eip155:80002` |
| `xLayer Testnet` | `xlayer-testnet` | `eip155:1952` |
| `Sei Testnet` | `sei-testnet` | `eip155:713715` |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `eip155:324705682` |
| `Arbitrum Sepolia` | `arbitrum-sepolia` | `eip155:421614` |

### Properties

```ts
client.network;
client.maxAmount;
```

- `network`: The configured network as normalized CAIP-2 `Network`.
- `maxAmount`: The client default payment cap.

### `call(endpoint, init?, opts?)`

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { maxAmount: 50_000n },
);
```

By default, `call()` resolves to `EndpointResult`. With
`throwOnError: true`, failed results throw `X402PaymentError`.

```ts
await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { throwOnError: true },
);
```

```ts
interface X402CallOptions {
  signal?: AbortSignal;
  maxAmount?: bigint;
  throwOnError?: boolean;
}
```

`maxAmount` can be set on the client, the individual call, or an `x402tool()`.
The more specific value wins.

## `x402tool(config)`

Creates a Vercel AI SDK `ToolSet`-compatible tool backed by an x402 endpoint.

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const tools = {
  getWeather: x402tool<{ city: string }>({
    client,
    description: "Get current weather for a city.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
  }),
};
```

`endpoint` can be static:

```ts
x402tool({
  client,
  inputSchema,
  endpoint: "https://api.example.com/weather",
});
```

or dynamic:

```ts
x402tool<{ city: string }>({
  client,
  inputSchema,
  endpoint: (input) => ({
    url: "https://api.example.com/weather",
    query: { city: input.city },
  }),
});
```

When `request` is not provided, tool input is mapped automatically:

- `GET`, `HEAD`, and `DELETE` plain object input is added to the query string.
- `POST`, `PUT`, and `PATCH` input is sent as a JSON body.

When `request` is provided, automatic input mapping is disabled:

```ts
x402tool<{ prompt: string }>({
  client,
  inputSchema,
  endpoint: "https://api.example.com/summarize",
  request: (input) => ({
    method: "POST",
    body: { text: input.prompt },
  }),
});
```

Without `execute`, the tool returns `EndpointResult`. With `execute`, the
function receives `{ endpoint, input }` and can return a model-friendly value:

```ts
x402tool<{ city: string }, { forecast: unknown }>({
  client,
  inputSchema,
  endpoint: "https://api.example.com/weather",
  execute: ({ endpoint }) => ({
    forecast: endpoint.kind === "success" ? endpoint.body : null,
  }),
});
```

### `X402ToolConfig`

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

The config also accepts the AI SDK-style tool fields implemented by `X402Tool`,
including `description`, `title`, `inputSchema`, `outputSchema`,
`needsApproval`, `strict`, and streaming input callbacks.

### `X402ToolExecutionOptions`

```ts
interface X402ToolExecutionOptions {
  toolCallId: string;
  messages: unknown[];
  abortSignal?: AbortSignal;
  experimental_context?: unknown;
}
```

These options are passed through from the AI SDK tool execution context.

## Endpoint Types

### `EndpointConfig`

```ts
interface EndpointConfig {
  url: string | URL;
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}
```

Use `EndpointConfig` when you want the endpoint itself to carry method,
headers, query, or body defaults.

### `EndpointInput`

```ts
type EndpointInput = string | URL | EndpointConfig;
```

Accepted by `X402Client.call()` and `x402tool()` endpoint configuration.

### `EndpointRequestInit`

```ts
interface EndpointRequestInit
  extends Omit<RequestInit, "body" | "headers" | "method"> {
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}
```

Use this as the second argument to `client.call()` or as the value returned by
an `x402tool()` `request` function.

## `EndpointResult`

`EndpointResult` is a discriminated union keyed by `kind`.

```ts
const result = await client.call("https://api.example.com/weather");

if (result.kind === "success") {
  console.log(result.paymentResponse, result.body);
}
```

Kinds:

- `success`: The endpoint was paid and returned a successful settled response.
- `settle_failed`: Payment settlement failed after the endpoint response.
- `payment_required`: The endpoint required payment, but no compatible payment
  was completed.
- `error`: The endpoint or x402 payment flow failed.
- `passthrough`: The response did not require payment and was returned without
  a payment response.

Every variant includes:

```ts
interface EndpointResultMetadata {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

The union also exposes `ok`, `paid`, `status`, `body`, `paymentResponse`, and
`metadata`. Narrow on `kind` before reading payment-specific fields.

## Errors

### `X402Error`

Base class for x402 SDK errors.

```ts
try {
  await client.call("https://api.example.com/weather", undefined, {
    throwOnError: true,
  });
} catch (error) {
  if (error instanceof X402Error) {
    console.error(error.details);
  }
}
```

### `X402ConfigError`

Thrown when the SDK cannot be configured, including invalid private keys,
unsupported network inputs, unsupported Solana CAIP-2 networks, or missing
`fetch`.

### `X402PaymentError`

Thrown for paid endpoint failures when `throwOnError: true` is set. It includes
`status` and optional `details`.

```ts
if (error instanceof X402PaymentError) {
  console.error(error.status, error.details);
}
```

### `X402ErrorDetails`

```ts
interface X402ErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}
```

Used by `X402Error`, `X402ConfigError`, and `X402PaymentError`.

## Logging

### `Logger`

```ts
interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
```

### `LogLevel`

```ts
type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
```

Pass `logger` and `logLevel` to `X402ClientOptions`.

## x402 Core Types

### `Network`

Re-exported from `@x402/core/types`. Raw CAIP-2 strings remain supported for
backwards compatibility. Unknown friendly names and unsupported raw Solana
CAIP-2 values throw `X402ConfigError` with `details.network` and
`details.supportedNetworks`.

### `SettleResponse`

Re-exported from `@x402/core/types`. Successful and settlement-failed endpoint
results include a `paymentResponse: SettleResponse`.

## `AlphaClient`

`AlphaClient` is the lightweight Alpha status client. It is still exported from
the package root, but x402 integrations should use `X402Client`.

```ts
import { AlphaClient } from "@averyso/alpha";
```

### Constructor

```ts
const client = new AlphaClient({
  apiKey: process.env.ALPHA_API_KEY,
  baseUrl: "https://api.avery.so/alpha",
});
```

### `AlphaClientOptions`

```ts
interface AlphaClientOptions {
  apiKey?: string;
  baseUrl?: string | URL;
  fetch?: typeof fetch;
}
```

- `apiKey`: Optional bearer token sent with status requests.
- `baseUrl`: Optional API base URL. Defaults to `https://api.avery.so/alpha`.
- `fetch`: Optional fetch implementation.

### `getStatus()`

```ts
const status = await client.getStatus();
```

Returns:

```ts
interface AlphaStatus {
  ok: boolean;
  service: "alpha";
}
```

Throws `AlphaError` when the HTTP response is not successful.

## `AlphaError`

```ts
import { AlphaError } from "@averyso/alpha";
```

`AlphaError` is thrown by `AlphaClient.getStatus()` for unsuccessful status
responses. It includes the HTTP status code.

```ts
try {
  await client.getStatus();
} catch (error) {
  if (error instanceof AlphaError) {
    console.error(error.status);
  }
}
```

## CommonJS

The package also supports CommonJS consumers:

```js
const { AlphaClient, X402Client, x402tool } = require("@averyso/alpha");
```
