# Payment Middleware

Use Alpha payment middleware when your application either protects an HTTP
resource with a payment requirement or needs a provider client inside a route.
One `createAlphaPayment()` runtime owns one provider and one direction and can
be reused across requests.

The initial capability matrix is intentionally explicit:

| Provider | `inbound`           | `outbound`          |
| -------- | ------------------- | ------------------- |
| `x402`   | Supported           | Supported           |
| `alipay` | Supported           | Configuration error |
| `weixin` | Configuration error | Supported           |

Alpha delegates x402 verification, settlement, facilitator communication, and
wire headers to the official `@x402/express`, `@x402/hono`, and `@x402/next`
packages. It does not implement a second x402 protocol stack.

## Runtime Requirements

All middleware runs on Node.js `>=20.19.0`. Keep private keys, facilitator
credentials, Alipay gateway credentials, and WeiXin signing credentials on the
server. For Next.js, explicitly select the Node runtime:

```ts
export const runtime = "nodejs";
```

Install only the framework peer used by the application:

```sh
pnpm add @averyso/alpha express
pnpm add @averyso/alpha hono
pnpm add @averyso/alpha next
```

The root `@averyso/alpha` entry is framework-independent. Framework code is
available from `@averyso/alpha/express`, `@averyso/alpha/hono`, and
`@averyso/alpha/next`.

## Create an x402 Inbound Runtime

An inbound x402 runtime needs protected routes and either a preconfigured
`x402ResourceServer` or an explicit facilitator plus scheme registration.
There is no implicit facilitator URL.

```ts
import { createAlphaPayment } from "@averyso/alpha";

export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  facilitator: {
    url: process.env.X402_FACILITATOR_URL!,
  },
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

`schemes: "auto"` registers the official EVM and Solana exact server schemes
needed by the route networks. Route network aliases are normalized through the
same registry as `X402Client`. The optional top-level `network` is only an
allowlist; it never replaces a route's `accepts[].network`.

For custom hooks, multiple facilitators, or custom scheme behavior, construct
the official server yourself:

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

Do not combine `server` with `facilitator` or `schemes`. The factory rejects the
conflict before serving traffic. `payment.initialize()` returns one cached
promise, so applications may call it eagerly during startup while adapters can
safely call it again.

## Express

Use `alphaExpressMiddleware()` with ordinary Express handlers for x402 inbound
or outbound contexts:

```ts
import express from "express";
import { alphaExpressMiddleware, getAlphaPaymentContext } from "@averyso/alpha/express";
import { payment } from "./payment.js";

const app = express();

app.use(alphaExpressMiddleware(payment));

app.get("/api/report", (req, res) => {
  const context = getAlphaPaymentContext(req);
  res.json({ provider: context.provider, report: buildReport() });
});
```

Use `withAlphaExpress()` when the handler should receive a Web `Request` and
return a Web `Response`. This wrapper is mandatory for Alipay inbound because
it buffers the response until fulfillment is confirmed:

```ts
import { withAlphaExpress } from "@averyso/alpha/express";

app.get(
  "/api/report",
  withAlphaExpress(payment, async (request, context) => {
    return Response.json({
      paid: context.provider === "alipay" && context.payment !== null,
      report: await buildReport(request.signal),
    });
  }),
);
```

Call body parsers such as `express.json()` before the wrapper when handlers
expect parsed request bodies. If no parser consumed the body, Alpha bridges the
Node request stream to the Web `Request`.

## Hono

`alphaHonoMiddleware()` stores the initialized outbound client or inbound
context in Hono's context and delegates x402 protection to the official Hono
adapter:

```ts
import { Hono } from "hono";
import { alphaHonoMiddleware, getAlphaPaymentContext } from "@averyso/alpha/hono";
import { payment } from "./payment.js";

const app = new Hono();

app.use(alphaHonoMiddleware(payment));
app.get("/api/report", (c) => {
  const context = getAlphaPaymentContext(c);
  return c.json({ provider: context.provider, report: buildReport() });
});
```

Use `withAlphaHono()` for Alipay inbound or a uniform Web handler:

```ts
import { withAlphaHono } from "@averyso/alpha/hono";

app.get(
  "/api/report",
  withAlphaHono(payment, async (_request, context) =>
    Response.json({ provider: context.provider, report: await buildReport() }),
  ),
);
```

## Next.js App Router

`withAlphaNext()` wraps App Router route handlers. Alpha passes payment context
as the second callback argument rather than modifying `NextRequest`. The normal
Next route context is available as the third argument.

```ts
// app/api/report/route.ts
import { withAlphaNext } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const runtime = "nodejs";

export const GET = withAlphaNext(payment, async (_request, context) => {
  return Response.json({ provider: context.provider, report: await buildReport() });
});
```

Protect pages or wildcard paths from `proxy.ts` with `alphaNextProxy()`. This API
accepts only an x402 inbound runtime:

```ts
// proxy.ts
import { alphaNextProxy } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const proxy = alphaNextProxy(payment);

export const config = {
  matcher: ["/reports/:path*"],
};
```

Do not put Alipay or WeiXin logic in an Edge-only proxy. Pages Router adapters
are not part of the initial release.

## Outbound Contexts

Outbound middleware injects a configured client; it never patches global
`fetch`.

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

An x402 outbound context exposes `context.client.call()`. A WeiXin outbound
context exposes `context.client.preorder()`. Context objects do not expose raw
private keys, generated signatures, payment headers, or raw gateway responses.

## Alipay Inbound and Replay Protection

Configure a static bill or an async bill factory per `METHOD path` route:

```ts
const alipayInbound = createAlphaPayment({
  provider: "alipay",
  direction: "inbound",
  client: {
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  },
  replayStore,
  routes: {
    "GET /api/report": {
      bill: async ({ request }) => ({
        outTradeNo: await reserveOrder(request),
        amount: "0.01",
        resourceId: "/api/report",
        payBefore: new Date(Date.now() + 5 * 60_000).toISOString(),
        sellerId: process.env.ALIPAY_SELLER_ID!,
        sellerName: "Example Seller",
        goodsName: "AI report",
        serviceId: "report-v1",
      }),
      maxResponseBytes: 1024 * 1024,
    },
  },
});
```

The flow is ordered as follows:

1. Missing or invalid `Payment-Proof` receives a new signed 402 challenge.
2. Verification must match the current bill's amount, order, and resource.
3. The replay store atomically claims `tradeNo + route`.
4. The application handler returns a complete Web `Response`.
5. Alpha buffers and size-checks the response.
6. Alipay fulfillment is confirmed.
7. The replay claim is completed, then the response is released.

The default response limit is 1 MiB. Streaming, SSE, and already-consumed
responses are rejected. If the handler fails before confirmation, Alpha calls
`replayStore.abandon()`. If confirmation fails or enters an uncertain state,
Alpha does not release the claim automatically and does not send the resource
body.

Alpha permits an Alipay runtime without a replay store for development and
logs one warning. Production deployments should use Redis, a database, or
another durable store with an atomic claim operation. An in-process map is not
provided because it is unsafe across workers and restarts.

## Operational Boundaries

- Scope each runtime to one provider and direction.
- Use separate route scopes when an application accepts multiple payment rails.
- Keep `Payment-Proof`, `Payment-Needed`, `PAYMENT-*`, private keys, signatures,
  and raw gateway responses out of logs.
- Alpha middleware logs only provider, direction, route, status, latency,
  error type, and redacted network family.
- Treat fulfillment timeouts as uncertain payment state and reconcile them
  before retrying.

See the [Middleware API reference](/api/middleware) for the complete public
types and validation rules.
