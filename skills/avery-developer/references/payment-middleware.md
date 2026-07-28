# Payment Middleware

`createAlphaPayment()` builds an **`AlphaPaymentRuntime`** — one provider, one direction, reusable across requests. Framework adapters bind that runtime to routes.

Use it when your app either protects an HTTP resource behind a payment requirement (**inbound**) or needs a configured payment client inside a handler (**outbound**).

## Capability matrix

| Provider | `inbound`                 | `outbound`                |
| -------- | ------------------------- | ------------------------- |
| `x402`   | Supported                 | Supported                 |
| `alipay` | Supported                 | `AlphaPaymentConfigError` |
| `weixin` | `AlphaPaymentConfigError` | Supported                 |

Unsupported pairs fail at `createAlphaPayment()`, not at request time. `network` is **x402-only** — passing it to an alipay or weixin config is a configuration error.

Alpha delegates x402 verification, settlement, facilitator traffic, and wire headers to the official `@x402/express`, `@x402/hono`, and `@x402/next` packages. It does not implement a second x402 protocol stack.

## Install and import

```sh
pnpm add @averyso/alpha express   # or hono, or next — only the one you use
```

```ts
import { createAlphaPayment } from "@averyso/alpha"; // framework-independent
import { withAlphaExpress } from "@averyso/alpha/express";
import { withAlphaHono } from "@averyso/alpha/hono";
import { withAlphaNext, alphaNextProxy } from "@averyso/alpha/next";
```

Node `>=20.19.0` everywhere. In Next.js, `export const runtime = "nodejs"` on any route that touches a runtime.

## x402 inbound

Requires routes plus **either** `server` **or** (`facilitator` + `schemes`). There is no implicit facilitator URL.

```ts
export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  facilitator: { url: process.env.X402_FACILITATOR_URL! },
  schemes: "auto",
  network: ["base-sepolia"],
  routes: {
    "GET /api/report": {
      accepts: {
        scheme: "exact",
        network: "Base Sepolia",
        price: "$0.01",
        payTo: process.env.X402_PAY_TO!,
      },
      description: "Generate one report",
      mimeType: "application/json",
    },
  },
});
```

| Option                      | Notes                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `routes`                    | A `Record<string, RouteConfig>` or a single route config. Must be non-empty. `accepts` takes one option or an array. |
| `facilitator`               | A URL string or `FacilitatorConfig`. A config object **must** carry an explicit non-empty URL.                       |
| `schemes`                   | `"auto"`, or an explicit array of `{ network, server }` registrations. Required unless `server` is given.            |
| `network`                   | Optional **allowlist**. It never replaces a route's `accepts[].network`; a route outside it is a config error.       |
| `server`                    | A preconfigured `x402ResourceServer`. **Cannot** be combined with `facilitator` or `schemes`.                        |
| `paywallConfig` / `paywall` | Passed through to the official adapters for the browser paywall.                                                     |

`schemes: "auto"` inspects the networks used by your routes and registers the official exact EVM and/or SVM server schemes. A route on a network outside the `eip155`/`solana` families cannot be auto-registered — register it explicitly.

Route network values go through the same registry as `X402Client`, so `"Base Sepolia"`, `"base-sepolia"`, and `"eip155:84532"` are interchangeable.

For custom hooks, multiple facilitators, or custom scheme behavior, build the server yourself:

```ts
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const server = new x402ResourceServer([primaryFacilitator, fallbackFacilitator])
  .register("eip155:84532", new ExactEvmScheme())
  .onAfterSettle(auditSettlement);

export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  routes,
  server,
});
```

## Outbound runtimes

Outbound middleware **injects a configured client**; it never patches global `fetch`.

```ts
const x402Outbound = createAlphaPayment({
  provider: "x402",
  direction: "outbound",
  network: "base-sepolia",
  privateKey: process.env.X402_PRIVATE_KEY!,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 50_000n,
});

const weixinOutbound = createAlphaPayment({
  provider: "weixin",
  direction: "outbound",
  client: {
    developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
    publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
    privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
  },
});
```

For x402 outbound you may pass an existing `client` **instead of** `privateKey` — but its `client.network` must equal the resolved `network`, or construction throws. Without `client`, `privateKey` is required.

Contexts by provider/direction:

| Context         | Shape                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| x402 inbound    | `{ direction: "inbound", provider: "x402" }`                               |
| x402 outbound   | `{ direction: "outbound", provider: "x402", client: X402Client }`          |
| alipay inbound  | `{ direction: "inbound", provider: "alipay", payment: {...} \| null }`     |
| weixin outbound | `{ direction: "outbound", provider: "weixin", client: WeiXinAIPayClient }` |

Contexts never expose private keys, signatures, payment headers, or raw gateway responses. Narrow on `provider`/`direction` before touching `client` or `payment` — the union is discriminated.

## `initialize()`

`payment.initialize()` returns **one cached promise**. Call it eagerly at startup to fail fast on bad config; adapters call it again per request, which is a no-op after the first. For x402 inbound it initializes the underlying HTTP resource server; the other providers only log.

## Two adapter shapes

Each framework offers a plain middleware and a wrapper. They are not interchangeable:

|                | Plain middleware                              | Wrapper                              |
| -------------- | --------------------------------------------- | ------------------------------------ |
| Express        | `alphaExpressMiddleware(payment)`             | `withAlphaExpress(payment, handler)` |
| Hono           | `alphaHonoMiddleware(payment)`                | `withAlphaHono(payment, handler)`    |
| Next           | `alphaNextProxy(payment)` (x402 inbound only) | `withAlphaNext(payment, handler)`    |
| Handler style  | your framework's native handler               | Web `Request` → Web `Response`       |
| Context access | `getAlphaPaymentContext(req \| c)`            | second callback argument             |
| Alipay         | **throws**                                    | **required**                         |

**Alipay must use the wrapper.** `alphaExpressMiddleware()`/`alphaHonoMiddleware()` throw `AlphaPaymentConfigError` for an alipay runtime, because only the wrapper can buffer the response until fulfillment is confirmed.

### Express

```ts
import express from "express";
import { alphaExpressMiddleware, getAlphaPaymentContext } from "@averyso/alpha/express";

const app = express();
app.use(alphaExpressMiddleware(payment));

app.get("/api/report", (req, res) => {
  const context = getAlphaPaymentContext(req);
  res.json({ provider: context.provider, report: buildReport() });
});
```

```ts
import { withAlphaExpress } from "@averyso/alpha/express";

app.get(
  "/api/report",
  withAlphaExpress(payment, async (request, context) =>
    Response.json({ report: await buildReport(request.signal) }),
  ),
);
```

Register body parsers such as `express.json()` **before** the wrapper if handlers expect a parsed body. If no parser consumed it, Alpha bridges the Node request stream into the Web `Request`. Errors are forwarded to `next(error)`, so your normal error middleware still applies.

### Hono

```ts
import { alphaHonoMiddleware, getAlphaPaymentContext } from "@averyso/alpha/hono";

app.use(alphaHonoMiddleware(payment));
app.get("/api/report", (c) => {
  const context = getAlphaPaymentContext(c);
  return c.json({ provider: context.provider, report: buildReport() });
});
```

```ts
import { withAlphaHono } from "@averyso/alpha/hono";

app.get(
  "/api/report",
  withAlphaHono(payment, async (_request, context) =>
    Response.json({ report: await buildReport() }),
  ),
);
```

`getAlphaPaymentContext()` throws if the middleware did not run first — install it before the handler.

### Next.js App Router

Payment context is the **second** callback argument; the normal Next route context is the third. Alpha does not mutate `NextRequest`.

```ts
// app/api/report/route.ts
import { withAlphaNext } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const runtime = "nodejs";

export const GET = withAlphaNext(payment, async (_request, context, { params }) =>
  Response.json({ provider: context.provider, report: await buildReport(params) }),
);
```

Protect pages or wildcard paths from `proxy.ts`:

```ts
// proxy.ts
import { alphaNextProxy } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const proxy = alphaNextProxy(payment);
export const config = { matcher: ["/reports/:path*"] };
```

`alphaNextProxy()` accepts **only an x402 inbound runtime** — anything else throws. Keep Alipay and WeiXin out of Edge-only proxies; they need Node crypto. Pages Router adapters are not part of this release.

## Operational boundaries

- One runtime per provider **and** direction. Use separate route scopes when an app accepts multiple rails.
- Keep `Payment-Proof`, `Payment-Needed`, `PAYMENT-*`, private keys, signatures, and raw gateway responses out of logs.
- Alpha's own middleware logs only provider, direction, route, status, latency, error type, and a redacted network family.
- Treat fulfillment timeouts as **uncertain** payment state and reconcile before retrying.
- `logLevel`/`logger` set on the runtime propagate to a client it constructs, but not to a client instance you pass in — configure that one yourself.

See `alipay.md` for the Alipay inbound sequence and replay store, `weixin.md` for preorder signing, and `api.md` for the x402 client surface.
