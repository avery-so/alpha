# Middleware API Reference

The root package exports the framework-neutral runtime, configuration types,
contexts, replay-store contract, and errors:

```ts
import {
  AlphaPaymentConfigError,
  AlphaPaymentRuntime,
  createAlphaPayment,
  type AlphaPaymentConfig,
  type AlphaPaymentContext,
  type AlphaPaymentDirection,
  type AlphaPaymentProvider,
  type AlphaReplayStore,
  type AlphaRequestContext,
} from "@averyso/alpha";
```

Framework adapters use separate entry points so importing `@averyso/alpha`
does not load Express, Hono, or Next.js.

## `createAlphaPayment(config)`

Creates a reusable runtime and validates the provider capability immediately.
The supported pairs are:

```ts
type AlphaPaymentProvider = "x402" | "alipay" | "weixin";
type AlphaPaymentDirection = "inbound" | "outbound";
```

| Configuration         | Result                    |
| --------------------- | ------------------------- |
| `x402` + `inbound`    | Valid                     |
| `x402` + `outbound`   | Valid                     |
| `alipay` + `inbound`  | Valid                     |
| `weixin` + `outbound` | Valid                     |
| `alipay` + `outbound` | `AlphaPaymentConfigError` |
| `weixin` + `inbound`  | `AlphaPaymentConfigError` |

Runtime validation also applies to JavaScript callers and TypeScript callers
that bypass the public union.

## `AlphaPaymentRuntime`

```ts
class AlphaPaymentRuntime {
  readonly provider: AlphaPaymentProvider;
  readonly direction: AlphaPaymentDirection;
  initialize(): Promise<void>;
}
```

`initialize()` returns the same cached promise on every call. For x402 inbound,
it initializes the official HTTP resource server, synchronizes facilitator
capabilities, and validates route scheme support. Framework adapters call it
before processing a request, but applications may call it eagerly at startup.

## x402 Inbound Configuration

```ts
interface AlphaX402InboundConfig {
  provider: "x402";
  direction: "inbound";
  routes: AlphaX402RoutesConfig;
  network?: X402NetworkInput | readonly X402NetworkInput[];
  server?: x402ResourceServer;
  facilitator?: string | FacilitatorConfig;
  schemes?: "auto" | readonly AlphaX402SchemeRegistration[];
  paywallConfig?: PaywallConfig;
  paywall?: PaywallProvider;
  logLevel?: LogLevel;
  logger?: Logger;
}

interface AlphaX402SchemeRegistration {
  network: X402NetworkInput;
  server: SchemeNetworkServer;
}
```

Rules:

- `routes` preserves the official x402 `RoutesConfig` fields while allowing
  Avery network aliases in each payment option.
- A top-level `network` is an allowlist. Every route network must appear in it.
- `server` preserves custom facilitators, schemes, extensions, and hooks.
- `server` cannot be combined with `facilitator` or `schemes`.
- Without `server`, both `facilitator` and `schemes` are required.
- A facilitator string becomes `new HTTPFacilitatorClient({ url })`.
- A facilitator config must contain an explicit non-empty `url`.
- `schemes: "auto"` registers official exact EVM/Solana server schemes for the
  normalized route networks.
- No default facilitator address is used.

## x402 Outbound Configuration

```ts
interface AlphaX402OutboundConfig {
  provider: "x402";
  direction: "outbound";
  network: X402NetworkInput;
  privateKey?: string;
  client?: X402Client;
  fetch?: typeof fetch;
  maxAmount?: bigint;
  rpcUrl?: string;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

Provide either an existing `X402Client` or `privateKey`. When `client` is used,
its normalized network must match the top-level `network`. The injected context
contains the same reusable client. Alpha does not replace or wrap global
`fetch`.

## Alipay Inbound Configuration

```ts
interface AlphaAlipayInboundConfig {
  provider: "alipay";
  direction: "inbound";
  client: AlipayAIPayClient | AlipayAIPayClientOptions;
  routes: Record<string, AlipayRouteConfig>;
  replayStore?: AlphaReplayStore;
  logLevel?: LogLevel;
  logger?: Logger;
}

interface AlipayRouteConfig {
  bill:
    | AlipayAIPayClientBillInput
    | ((
        context: AlphaRequestContext,
      ) => AlipayAIPayClientBillInput | Promise<AlipayAIPayClientBillInput>);
  maxResponseBytes?: number;
}

interface AlphaRequestContext {
  provider: "alipay";
  direction: "inbound";
  request: Request;
  route: string;
}
```

Route keys use `METHOD /path`. `*` is supported in the method or path. The
default `maxResponseBytes` is `1_048_576` bytes. Values must be positive safe
integers.

Alipay and WeiXin configurations reject a defined `network` field at runtime.

## WeiXin Outbound Configuration

```ts
interface AlphaWeiXinOutboundConfig {
  provider: "weixin";
  direction: "outbound";
  client: WeiXinAIPayClient | WeiXinAIPayClientOptions;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

The runtime constructs the existing `WeiXinAIPayClient` when options are
provided. The injected client retains the full `preorder(paymentRequired,
options?)` contract, including call-level abort signals and endpoint options.

## Payment Context

```ts
type AlphaPaymentContext =
  | {
      provider: "x402";
      direction: "inbound";
    }
  | {
      provider: "x402";
      direction: "outbound";
      client: X402Client;
    }
  | {
      provider: "alipay";
      direction: "inbound";
      payment: AlphaAlipayPaymentVerification | null;
    }
  | {
      provider: "weixin";
      direction: "outbound";
      client: WeiXinAIPayClient;
    };
```

`payment` is `null` when an Alipay wrapper receives a request outside its
configured protected routes. Verified Alipay context includes `active`,
`amount`, `outTradeNo`, `resourceId`, and `tradeNo`; it excludes gateway raw
responses and proof material.

## `AlphaReplayStore`

```ts
interface AlphaReplayStore {
  claim(input: {
    provider: "alipay";
    tradeNo: string;
    route: string;
  }): Promise<"claimed" | "in_progress" | "completed">;

  complete(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;

  abandon(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;
}
```

`claim()` must be atomic across application workers. `complete()` records a
successfully confirmed fulfillment. `abandon()` releases claims only for
failures known to occur before fulfillment confirmation. Alpha intentionally
does not abandon a claim after a confirmation timeout or other uncertain
state.

## Express Exports

```ts
import {
  alphaExpressMiddleware,
  getAlphaPaymentContext,
  withAlphaExpress,
} from "@averyso/alpha/express";
```

### `alphaExpressMiddleware(runtime)`

- Delegates x402 inbound processing to `@x402/express`.
- Injects x402 or WeiXin outbound context on the request.
- Throws for Alipay inbound because ordinary `res.send()`/`res.json()` cannot
  guarantee fulfillment-before-delivery ordering.

### `withAlphaExpress(runtime, handler)`

The handler receives `(request: Request, context: AlphaPaymentContext)` and
must return a complete Web `Response`. Express output is not committed until
the wrapper has buffered and validated the response. For Alipay, fulfillment
and replay completion also finish before output is committed.

### `getAlphaPaymentContext(request)`

Returns the context installed by Alpha or throws `AlphaPaymentConfigError` when
middleware did not run.

## Hono Exports

```ts
import { alphaHonoMiddleware, getAlphaPaymentContext, withAlphaHono } from "@averyso/alpha/hono";
```

The Hono functions have the same provider behavior as their Express
counterparts. Context is stored under Hono's `alphaPayment` variable. The
wrapper handler receives the raw Web `Request` and returns a Web `Response`.

## Next.js Exports

```ts
import { alphaNextProxy, withAlphaNext } from "@averyso/alpha/next";
```

### `withAlphaNext(runtime, handler)`

Wraps an App Router route handler. The callback signature is:

```ts
type AlphaNextHandler<RouteContext = unknown> = (
  request: NextRequest,
  paymentContext: AlphaPaymentContext,
  routeContext: RouteContext,
) => Response | Promise<Response>;
```

x402 inbound uses the official `withX402FromHTTPServer` semantics. Native Web
responses are fully buffered before being returned to the official settlement
wrapper. Alipay uses the same fulfillment-before-delivery contract.

### `alphaNextProxy(runtime)`

Returns a Next.js proxy handler for page or wildcard protection. It accepts
only `provider: "x402", direction: "inbound"`. This API is not an Alipay or
WeiXin Edge adapter.

## Response Contract

Wrapper handlers must return an unused, finite Web `Response`. Alpha rejects:

- non-`Response` values;
- already-consumed bodies;
- bodies over the configured Alipay limit;
- SSE (`text/event-stream`), `Transfer-Encoding`, or explicit no-buffering
  responses.

The resource body is never sent when Alipay fulfillment confirmation or replay
completion fails.

## Errors and Logging

`AlphaPaymentConfigError` covers unsupported provider/direction pairs, invalid
credentials, forbidden `network` fields, conflicting x402 server configuration,
invalid routes, and adapter misuse.

Middleware diagnostics use the existing `Logger`/`LogLevel` contract. They log
provider, direction, route, status, latency, error type, and redacted network
family. They do not log payment proofs, payment challenges, x402 payment
headers, private keys, signatures, or raw gateway responses.
