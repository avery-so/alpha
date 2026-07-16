# SDK API Reference

This reference documents the public APIs behind Avery SDK agent payment tools and
direct x402 paid HTTP calls.

All public SDK APIs are exported from `@averyso/alpha`. Do not import from
`packages/sdk/src/...` paths.

Framework-neutral payment runtime types are exported from the same root entry.
Express, Hono, and Next.js adapters use subpath exports documented in the
[Middleware API reference](/api/middleware).

No Avery account is required for payment features. The package is installed and
imported as `@averyso/alpha`, but runtime payment execution uses local x402
signing with your configured wallet/private key, RPC URL, and target x402
endpoint. Provider-side settlement may happen locally or through the provider's
facilitator, but Avery SDK does not configure that path. You do not need an
Avery account, Avery API key, Avery-hosted service, or registration.

```ts
import {
  AlipayAIPayClient,
  AlipayAIPayConfigError,
  X402Client,
  X402ConfigError,
  X402Error,
  X402Networks,
  X402PaymentError,
  WeiXinAIPayClient,
  WeiXinAIPayConfigError,
  buildAlipayAIPayPaymentNeededHeader,
  buildWeiXinAIPayPreorderRequest,
  encodeWeiXinAIPaymentRequired,
  parseAlipayAIPayPaymentProofHeader,
  resolveX402Network,
  signWeiXinAIPayPreorder,
  x402MastraTool,
  x402tool,
} from "@averyso/alpha";
```

## `WeiXinAIPayClient`

Builds and sends WeiXinAI Pay preorder requests from a server runtime.

```ts
const client = new WeiXinAIPayClient({
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
});
```

Constructor signature:

```ts
new WeiXinAIPayClient(options);
```

`privateKey` must be a 32-byte SM2 private key encoded as hex, with or without
the `0x` prefix. Keep this key server-side.

### `WeiXinAIPayClientOptions`

```ts
interface WeiXinAIPayClientOptions {
  developerId: string;
  publicKeyId: string;
  privateKey: string;
  developerPlatform?: string;
  fetch?: typeof fetch;
  endpoint?: string;
  logLevel?: LogLevel;
  logger?: Logger;
  signatureEncoding?: "der" | "raw";
}
```

- `developerId`: WeiXinAI Pay developer identifier. Sent as `developer_id`.
- `publicKeyId`: WeiXinAI Pay public key identifier. Sent as `pub_key_id`.
- `privateKey`: SM2 private key used only for local signing.
- `developerPlatform`: Sent as `developer_platform`. Defaults to `"WXPAY"`.
- `fetch`: Custom fetch implementation. If neither this nor `globalThis.fetch`
  is available, the constructor throws `WeiXinAIPayConfigError`.
- `endpoint`: Preorder endpoint. Defaults to
  `https://payapp.weixin.qq.com/palmpayminiapp/clawagentpay/preorder`.
- `logLevel`: Minimum level for the default logger. Defaults to `"info"`.
- `logger`: Custom diagnostic logger with `debug`, `info`, `warn`, and `error`
  methods.
- `signatureEncoding`: `"der"` by default. Set `"raw"` to send raw `r || s`
  signatures.

### `preorder(paymentRequired, options?)`

```ts
const result = await client.preorder(
  {
    appid: "wx-miniapp",
    mchid: "1900000109",
    out_trade_no: "order-1001",
    description: "AI agent request",
    amount: {
      total: 100,
      currency: "CNY",
    },
  },
  {
    signal: abortController.signal,
  },
);

result.paymentCode;
result.rawResponse.payment_code;
```

```ts
interface WeiXinAIPayPreorderOptions {
  signal?: AbortSignal;
  timestamp?: string;
  nonceStr?: string;
  developerPlatform?: string;
  endpoint?: string;
  signatureEncoding?: "der" | "raw";
}

interface WeiXinAIPayPreorderResult {
  paymentCode: string;
  rawResponse: {
    payment_code: string;
  };
}
```

`timestamp` defaults to Unix seconds as a string. `nonceStr` defaults to a
crypto-secure random hex string. The request is sent as `POST` JSON with
`Content-Type: application/json`.

### Request Builder

Use the lower-level builder when another HTTP layer sends the request:

```ts
const body = buildWeiXinAIPayPreorderRequest(paymentRequired, {
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
  timestamp: "1735689600",
  nonceStr: "abcdef0123456789abcdef0123456789",
});
```

The returned JSON body has this wire shape:

```ts
interface WeiXinAIPayPreorderRequest {
  signature_type: "WEIXINAIPAY-SM2-WITH-SM3";
  developer_platform: string;
  developer_id: string;
  pub_key_id: string;
  nonce_str: string;
  timestamp: string;
  signature: string;
  payment_required: string;
}
```

`encodeWeiXinAIPaymentRequired(value)` runs `JSON.stringify(value)` and
Base64-encodes the UTF-8 JSON bytes. `signWeiXinAIPayPreorder(input, options)`
uses the WeiXinAI signing rule exactly:

```ts
const signString = `${timestamp}\n${nonceStr}\n${paymentRequired}\n`;
```

The SDK computes the SM3 digest of that string, signs the digest with SM2, and
Base64-encodes the signature bytes.

## `AlipayAIPayClient`

Implements the merchant side of Alipay AI pay-per-use (AI按量付费), the
402-based A2M flow of Alipay Agent Payment: build the signed `Payment-Needed`
bill for `402 Payment Required` responses, verify `Payment-Proof` credentials
through the Alipay OpenAPI gateway, and confirm fulfillment after delivering
the resource.

```ts
const client = new AlipayAIPayClient({
  appId: process.env.ALIPAY_APP_ID!,
  privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
});
```

`privateKey` is the Alipay application RSA private key, as a PEM string or the
bare Base64 PKCS#8/PKCS#1 body copied from the Alipay console (a Node
`KeyObject` is also accepted). Keep it server-side.

### `AlipayAIPayClientOptions`

```ts
interface AlipayAIPayClientOptions {
  appId: string;
  privateKey: string | KeyObject;
  alipayPublicKey?: string | KeyObject;
  appAuthToken?: string;
  gatewayEndpoint?: string;
  fetch?: typeof fetch;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

- `appId`: Alipay application ID. Sent as `app_id` and used as the default
  `seller_app_id` in `Payment-Needed` bills.
- `privateKey`: Application RSA private key used for RSA2 (SHA256withRSA)
  signing of bills and gateway requests.
- `alipayPublicKey`: Alipay public key. When provided, gateway response
  signatures are verified and a failed verification throws
  `AlipayAIPayResponseError`.
- `appAuthToken`: Third-party agent authorization token. Sent as
  `app_auth_token` when calling on behalf of a merchant.
- `gatewayEndpoint`: Alipay OpenAPI gateway. Defaults to
  `https://openapi.alipay.com/gateway.do`.
- `fetch`, `logLevel`, `logger`: Same semantics as the other clients.

### `buildPaymentNeededHeader(input)`

Builds the Base64URL-encoded (unpadded) `Payment-Needed` header for a
`402 Payment Required` response. The bill's `seller_signature` is an RSA2
signature over the sorted `key=value&...` string of `amount`, `currency`,
`goods_name`, `out_trade_no`, `pay_before`, `resource_id`, `seller_id`, and
`service_id`. Signing happens locally; no gateway call is made.

```ts
const { header, paymentNeeded } = client.buildPaymentNeededHeader({
  outTradeNo: "ORDER_1739836600000_abc123",
  amount: "0.01",
  resourceId: "/market/antgroup/trend",
  payBefore: "2026-03-25T12:00:00+08:00",
  sellerId: "2088123456789012",
  sellerName: "Demo Seller",
  goodsName: "AI content",
  serviceId: "service_ai_content_001",
});

// respond with HTTP 402 and `Payment-Needed: ${header}`
```

`currency` defaults to `"CNY"`, `seller_unique_id_key` is always
`"seller_id"`, and `sellerAppId` defaults to the client `appId` (set it
explicitly when calling as a third-party application).

### `parsePaymentProofHeader(header)`

Decodes the `Payment-Proof` request header (standard Base64 or Base64URL,
padded or not) and validates the layered payload.

```ts
const proof = client.parsePaymentProofHeader(request.headers["payment-proof"]);

proof.paymentProof; // protocol.payment_proof
proof.tradeNo; // protocol.trade_no
proof.clientSession; // method.client_session, optional
```

Malformed headers throw `AlipayAIPayRequestError`.

### `verifyPayment(input, options?)`

Calls `alipay.aipay.agent.payment.verify` with a signed gateway request. The
parsed `Payment-Proof` object can be passed directly.

```ts
const result = await client.verifyPayment(proof, {
  expect: {
    amount: "0.01",
    outTradeNo: order.outTradeNo,
    resourceId: "/market/antgroup/trend",
  },
});

if (!result.verified) {
  // respond with a fresh 402 Payment-Needed bill
}
```

```ts
interface AlipayAIPayVerifyPaymentOptions {
  signal?: AbortSignal;
  timestamp?: string;
  gatewayEndpoint?: string;
  appAuthToken?: string;
  expect?: {
    amount?: string;
    outTradeNo?: string;
    resourceId?: string;
  };
}

interface AlipayAIPayPaymentVerifyResult {
  active: boolean;
  amount: string;
  outTradeNo: string;
  resourceId: string;
  tradeNo: string;
  verified: boolean;
  mismatches: string[];
  rawResponse: AlipayAIPayPaymentVerifyWireResponse;
}
```

`verified` is `true` only when `active` is `true` and every provided `expect`
field matches the gateway response (`expect` values are compared as exact
strings). Business failures such as `PAYMENT_PROOF_NOT_FOUND` throw
`AlipayAIPayResponseError` with `code`, `subCode`, and `subMsg` in `details`.
Deduplicating `trade_no` against replayed fulfillment stays your
responsibility.

### `confirmFulfillment(tradeNo, options?)`

Calls `alipay.aipay.agent.fulfillment.confirm` after the resource has been
delivered. Accepts the trade number directly or as `{ tradeNo }`.

```ts
await client.confirmFulfillment(result.tradeNo);
```

### Request Builders

When another HTTP layer sends the gateway call, use the lower-level helpers:
`buildAlipayAIPayGatewayRequest()` returns the signed form parameters, body,
and sign content for any OpenAPI method; `signAlipayAIPayBill()` and
`alipayAIPayBillSignContent()` expose bill signing;
`parseAlipayAIPayGatewayResponse()` parses and optionally signature-verifies a
gateway `Response`. `alipayAIPayGatewayTimestamp()` renders the UTC+8
`yyyy-MM-dd HH:mm:ss` timestamp the gateway expects.

Errors follow the same family layout as the other clients:
`AlipayAIPayError` is the base class, `AlipayAIPayConfigError` covers invalid
configuration and keys, `AlipayAIPayRequestError` covers request building and
transport failures, and `AlipayAIPayResponseError` carries the HTTP `status`
plus gateway `code`/`sub_code` details.

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
- `logger`: Custom diagnostic logger with `debug`, `info`, `warn`, and `error`
  methods. For adapter examples and audit logging guidance, see
  [Observability and Audit Logging](/guide/observability).
- `fetch`: Custom fetch implementation. If neither this nor `globalThis.fetch`
  is available, the constructor throws `X402ConfigError`.
- `maxAmount`: Default per-payment cap. Defaults to `100000n`. It is the
  fallback cap when a direct call or tool does not provide a more specific cap.
- `rpcUrl`: Optional RPC URL passed to the payment scheme.

There is intentionally no `facilitator` option. `X402ClientOptions` configures
the buyer-side wallet, network, cap, fetch, logging, and RPC behavior. The
resource server controls its accepted assets, payment scheme, pricing, and
provider-side settlement path.

The `maxAmount` value is an atomic-unit cap, not a decimal string or a
user/session/day budget. For budget ledger patterns, see
[Agent Spend Controls](/guide/agent-spend-controls).

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

| Friendly Name        |         Primary Slug | CAIP-2                                    |
| -------------------- | -------------------: | ----------------------------------------- |
| `Solana Mainnet`     |             `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet`       |               `base` | `eip155:8453`                             |
| `Polygon Mainnet`    |            `polygon` | `eip155:137`                              |
| `xLayer Mainnet`     |             `xlayer` | `eip155:196`                              |
| `Peaq Mainnet`       |               `peaq` | `eip155:3338`                             |
| `Sei Mainnet`        |                `sei` | `eip155:1329`                             |
| `SKALE Base`         |         `skale-base` | `eip155:1187947933`                       |
| `KiteAI Mainnet`     |             `kiteai` | `eip155:2366`                             |
| `Arbitrum One`       |           `arbitrum` | `eip155:42161`                            |
| `Solana Devnet`      |      `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia`       |       `base-sepolia` | `eip155:84532`                            |
| `Avalanche Fuji`     |     `avalanche-fuji` | `eip155:43113`                            |
| `Polygon Amoy`       |       `polygon-amoy` | `eip155:80002`                            |
| `xLayer Testnet`     |     `xlayer-testnet` | `eip155:1952`                             |
| `Sei Testnet`        |        `sei-testnet` | `eip155:713715`                           |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `eip155:324705682`                        |
| `Arbitrum Sepolia`   |   `arbitrum-sepolia` | `eip155:421614`                           |

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
The more specific value wins: direct `client.call()` options override the client
default, and an `x402tool()` `maxAmount` is passed to the tool's internal
`client.call()`. For a production policy model around these caps, see
[Agent Spend Controls](/guide/agent-spend-controls#cap-precedence).

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
`needsApproval`, `strict`, and streaming input callbacks. Use `needsApproval`
to pause high-risk or user-visible paid tool calls for application or human
authorization. See [Agent Spend Controls](/guide/agent-spend-controls#approvals)
for approval and confirmation patterns.

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

## `x402MastraTool(config)`

Creates a Mastra `createTool()`-compatible tool backed by an x402 endpoint.
Use this helper for Mastra agents. Use `x402tool()` for Vercel AI SDK `ToolSet`
integrations.

```ts
import { z } from "zod";
import { X402Client, X402Networks, x402MastraTool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const paidWeather = x402MastraTool({
  id: "paid-weather",
  client,
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: z.object({
    city: z.string(),
  }),
  endpoint: "https://api.example.com/weather",
  maxAmount: 50_000n,
  execute: ({ endpoint }) => ({
    ok: endpoint.ok,
    weather: endpoint.ok ? endpoint.body : null,
  }),
});
```

`x402MastraTool()` does not import `@mastra/core` at runtime and does not add
Mastra as a dependency of Avery SDK. Your application installs and runs Mastra;
the helper returns a structurally compatible Mastra tool object with Mastra's
tool marker.

### `X402MastraToolConfig`

```ts
type X402MastraToolConfig<INPUT, OUTPUT = EndpointResult, ID extends string = string> = {
  id: ID;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
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
    options: X402MastraToolExecutionContext,
  ) => OUTPUT | PromiseLike<OUTPUT>;
};
```

The config also accepts Mastra tool fields including `requireApproval`,
`strict`, `providerOptions`, `toModelOutput`, `transform`, `inputExamples`,
`mcp`, `mcpMetadata`, `requestContextSchema`, `suspendSchema`, and
`resumeSchema`.

The endpoint, request override, automatic input mapping, `maxAmount`, and
`throwOnError` behavior matches `x402tool()`. Without `execute`, the tool
returns `EndpointResult`. With `execute`, return a smaller model-friendly shape
instead of exposing the full payment and HTTP result to the model.

### `X402MastraToolExecutionContext`

```ts
interface X402MastraToolExecutionContext {
  abortSignal?: AbortSignal;
  toolCallId?: string;
  messages?: unknown[];
  requestContext?: unknown;
  workspace?: unknown;
  [key: string]: unknown;
}
```

Mastra passes this context to the tool. Avery SDK uses `abortSignal` for the
underlying x402 HTTP request and passes the whole object to your `execute`
mapper.

When registering tools with a Mastra `Agent`, Mastra stream `toolName` values
come from the object key, not the tool `id`:

```ts
tools: {
  paidWeather, // toolName: "paidWeather"
  [paidWeather.id]: paidWeather, // toolName: "paid-weather"
}
```

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
interface EndpointRequestInit extends Omit<RequestInit, "body" | "headers" | "method"> {
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
For lifecycle-level interpretation of each kind, see
[Concepts](/guide/concepts#endpointresult-kind). For retry and user-facing
handling strategies, see [Error Handling](/guide/error-handling).

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

For production error handling, retry strategy, and safe model-facing tool
outputs, see [Error Handling](/guide/error-handling).

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

The SDK logger is diagnostic. It does not include the application context needed
for a complete spend audit trail, such as user id, conversation id, approval
decision, and budget reservation id. See
[Observability and Audit Logging](/guide/observability) for logger adapters and
audit event patterns.

## x402 Core Types

### `Network`

Re-exported from `@x402/core/types`. Raw CAIP-2 strings remain supported for
backwards compatibility. Unknown friendly names and unsupported raw Solana
CAIP-2 values throw `X402ConfigError` with `details.network` and
`details.supportedNetworks`.

### `SettleResponse`

Re-exported from `@x402/core/types`. Successful and settlement-failed endpoint
results include a `paymentResponse: SettleResponse`.

## CommonJS

The package also supports CommonJS consumers:

```js
const { AlipayAIPayClient, X402Client, x402tool } = require("@averyso/alpha");
```
