---
name: avery-developer
description: Build and monetize paid HTTP APIs and AI agents with the Avery SDK (@averyso/alpha) across three payment rails — x402 (crypto/stablecoin), Alipay AI Pay (支付宝 AI 按量付费), and WeiXin AI Pay (微信 AI 支付). Use this skill whenever the user works with @averyso/alpha, the Avery SDK, `X402Client`, `x402tool`, `x402MastraTool`, `createAlphaPayment`, `withAlphaNext`, `withAlphaExpress`, `withAlphaHono`, `AlipayAIPayClient`, or `WeiXinAIPayClient`; whenever they want an AI agent (Vercel AI SDK or Mastra) to call a paid, pay-per-request, x402, or "402 Payment Required" endpoint; whenever they want to charge for their own API, add a paywall to a route, verify a payment proof, settle/confirm fulfillment, or handle `Payment-Needed`/`Payment-Proof` headers; and whenever they mention agent payments, machine/autonomous payments, monetized APIs, per-call spend caps, 支付宝/微信 AI 付费接入, RSA2 or SM2/SM3 payment signing, or wiring crypto/stablecoin (e.g. USDC) payments into a model's tool calls — even if they do not name the SDK explicitly. Covers client setup, paid tools, paywall middleware, network/wallet config, spend controls, replay protection, error handling, testing, and Next.js/Express/Hono integration.
---

# Avery SDK Developer

Avery SDK (`@averyso/alpha`) connects HTTP requests to money, in both directions:

- **Outbound (you pay).** An agent or your server calls a paid endpoint, and the SDK settles the payment before returning the response.
- **Inbound (you get paid).** Your own route demands payment, and the SDK issues the challenge, verifies the proof, and only then releases the resource.

It supports three rails: **x402** (on-chain, crypto/stablecoin), **Alipay AI Pay** (支付宝 AI 按量付费), and **WeiXin AI Pay** (微信 AI 支付). Everything runs server-side on Node.js `>=20.19.0`.

## Pick your path

Answer two questions — _who pays_ and _which rail_ — then jump to the matching section.

| Goal                                      | Rail   | API                               | Section                                            |
| ----------------------------------------- | ------ | --------------------------------- | -------------------------------------------------- |
| Let an LLM call a paid API and pay for it | x402   | `x402tool()` / `x402MastraTool()` | [Path A](#path-a--an-agent-pays-for-an-x402-api)   |
| Your own server code calls a paid API     | x402   | `X402Client.call()`               | [Path A](#path-a--an-agent-pays-for-an-x402-api)   |
| Charge crypto for your own route          | x402   | `createAlphaPayment` inbound      | [Path B](#path-b--charge-for-your-own-api-inbound) |
| Charge CNY for your own route, 支付宝     | Alipay | `createAlphaPayment` inbound      | [Path B](#path-b--charge-for-your-own-api-inbound) |
| Pay a WeiXin AI Pay bill as a developer   | WeiXin | `WeiXinAIPayClient.preorder()`    | [Path C](#path-c--weixin-ai-pay-preorder-outbound) |

### Capability matrix — check this before designing

One runtime owns **one provider and one direction**. Unsupported combinations throw `AlphaPaymentConfigError` at construction, not at request time:

| Provider | `inbound` (you get paid) | `outbound` (you pay)    |
| -------- | ------------------------ | ----------------------- |
| `x402`   | Supported                | Supported               |
| `alipay` | Supported                | **Configuration error** |
| `weixin` | **Configuration error**  | Supported               |

This is a deliberate reflection of each rail's role, not a gap to work around. Alipay AI Pay positions the SDK as the _seller_ (sign the bill, verify the proof, confirm fulfillment). WeiXin AI Pay positions it as the _developer_ paying a bill (sign a preorder). If a user asks for "收款用微信" or "用支付宝去付费", say plainly that the SDK does not cover that direction yet rather than inventing an API.

## Rules that apply to every path

- **Server-only, always.** Every client signs with a private key. Never construct one in the browser, a client component, or bundled frontend code. In Next.js, set `export const runtime = "nodejs"` on the route.
- **No Avery account, API key, or hosted service exists.** Credentials belong to the rail: your own wallet + RPC for x402, your Alipay app private key + Alipay public key, your WeiXin developer ID + SM2 key. Never invent an `apiKey` or Avery login.
- **Import only from `@averyso/alpha`** (or its `/next`, `/express`, `/hono` subpaths). Never from `packages/sdk/src/...`.
- **Money is never a plain number.** x402 uses `bigint` atomic units (`100_000n`); Alipay uses a decimal **string** (`"0.01"` CNY); WeiXin amounts are integers in fen inside the upstream payload. Mixing these up is the single most common bug.
- **Keep payment material out of logs and out of model context** — private keys, signatures, `Payment-Proof`/`Payment-Needed` headers, `PAYMENT-*` headers, raw gateway responses.

## Path A — an agent pays for an x402 API

Two entry points share one `X402Client` (wallet, network, default cap). Pick based on **who decides to make the request**:

- **`x402tool()`** — the _model_ decides. Wraps a paid endpoint as a Vercel AI SDK tool. The primary agent path. For Mastra, use `x402MastraTool()` (see `references/mastra.md`).
- **`X402Client.call()`** — your _application code_ decides.

### Install

```sh
pnpm add @averyso/alpha
pnpm add ai          # only for the Vercel AI SDK tool path
```

### Step 1 — create the client

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n, // client-default cap; the SDK default is also 100_000n
});
```

- **First argument is the private key.** EVM networks need a 32-byte hex key (`0x`-prefixed or not); Solana networks need a base58-encoded 64-byte secret key. Env var, server-side only.
- **`network`** accepts an `X402Networks` constant (preferred), a friendly name (`"Base Sepolia"`), a slug (`"base-sepolia"`), or raw CAIP-2 (`"eip155:84532"`). `client.network` reads back as normalized CAIP-2. See `references/networks.md`.
- **`maxAmount` is a `bigint` of atomic units.** `100_000n` is `0.1` USDC at 6 decimals — never `100_000` USDC, never `0.1`.
- **The configured network must match what the endpoint advertises.** A mismatch yields a `payment_required` result, not a payment.

### Step 2 — build a paid tool

```ts
import { jsonSchema } from "ai";
import { x402tool } from "@averyso/alpha";

export const tools = {
  getWeather: x402tool<{ city: string }>({
    client,
    title: "Paid weather",
    description: "Get current weather for a city from a paid x402 endpoint.",
    inputSchema: jsonSchema({
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n, // tool-level cap; overrides the client default
  }),
};
```

Without a `request` function, tool input maps automatically: `GET`/`HEAD`/`DELETE` → **query params**; `POST`/`PUT`/`PATCH` → **JSON body**. `GET` is the default. Always give a strict `inputSchema` (`additionalProperties: false`, explicit `required`) — it is the first line of defense against malformed or injected input.

Dynamic endpoints and overrides:

```ts
// endpoint as a function of input:
endpoint: (input) => ({
  url: `https://api.example.com/weather/${encodeURIComponent(input.city)}`,
  method: "GET",
  query: { units: input.units ?? "metric" },
}),

// request() for custom method/headers/body — this DISABLES automatic input mapping:
request: (input) => ({
  method: "POST",
  headers: { "x-report-id": input.reportId },
  body: { detail: input.detail },
}),
```

Prefer static endpoint URLs, or build dynamic ones only from allowlisted hosts and paths. Do not forward model-controlled headers unless each one is explicitly allowed.

**Add `execute` to hand the model a small, safe object.** Without it, the tool returns the raw `EndpointResult` — including payment payloads and headers — straight into model context:

```ts
execute: ({ endpoint }) => {
  if (endpoint.kind === "success") {
    return { ok: true, weather: endpoint.body };
  }
  return { ok: false, reason: endpoint.kind };
},
```

### Step 3 — hand the tools to the model

```ts
import { generateText, stepCountIs } from "ai";

const response = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(6), // bound the agent loop — see spend controls
  prompt: "What is the weather in Lisbon?",
});
```

### Step 4 — handle the result

`call()` is non-throwing by default. Branch on `kind` first:

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { maxAmount: 50_000n },
);

switch (result.kind) {
  case "success": // paid and settled; use result.body
  case "payment_required": // no compatible payment — DON'T blindly retry; fix network/cap/asset
  case "settle_failed": // payment may have moved; don't treat as success
  case "passthrough": // endpoint didn't require payment (free / wrong URL / middleware order)
  case "error": // transient (retry with backoff) or config (don't retry)
}
```

Use `throwOnError: true` only when you want a centralized exception path (throws `X402PaymentError`). Full table in `references/error-handling.md`.

## Path B — charge for your own API (inbound)

`createAlphaPayment()` builds one reusable runtime; a framework adapter binds it to routes.

```sh
pnpm add @averyso/alpha express   # or hono, or next
```

```ts
import { createAlphaPayment } from "@averyso/alpha";
import { withAlphaNext } from "@averyso/alpha/next"; // or /express, /hono
```

The root entry is framework-independent; framework code lives in the subpath exports.

### x402 inbound

Needs protected routes plus **either** a preconfigured `x402ResourceServer` **or** a facilitator with scheme registration. There is no implicit facilitator URL, and combining `server` with `facilitator`/`schemes` is rejected.

```ts
export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  facilitator: { url: process.env.X402_FACILITATOR_URL! },
  schemes: "auto",
  network: ["base-sepolia"], // optional allowlist only; never replaces accepts[].network
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

Alpha delegates x402 verification, settlement, and facilitator traffic to the official `@x402/express|hono|next` packages — it does not implement a second protocol stack.

### Alipay inbound (支付宝 AI 按量付费)

```ts
const payment = createAlphaPayment({
  provider: "alipay",
  direction: "inbound",
  client: {
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  },
  replayStore, // required in production
  routes: {
    "GET /api/report": {
      bill: async ({ request }) => ({
        outTradeNo: await reserveOrder(request),
        amount: "0.01", // decimal STRING in CNY
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

Three constraints that break builds if missed:

1. **Alipay requires the `withAlpha*` wrapper, never the plain middleware.** `alphaExpressMiddleware(payment)` throws for an alipay runtime, because the response must be buffered until fulfillment is confirmed.
2. **`amount` is a decimal string**, and the verification step compares it against the bill exactly — a `"0.010"` vs `"0.01"` drift fails verification.
3. **Ship a `replayStore` before production.** Without one the runtime logs a warning and runs unprotected; a paid `tradeNo` could be replayed for a second free response.

Full flow, replay semantics, failure modes, and a store implementation are in `references/alipay.md`.

### Binding to a framework

```ts
// Next.js App Router — app/api/report/route.ts
export const runtime = "nodejs";
export const GET = withAlphaNext(payment, async (_request, context) =>
  Response.json({ report: await buildReport() }),
);
```

```ts
// Express — the wrapper form works for every provider
app.get(
  "/api/report",
  withAlphaExpress(payment, async (request, context) =>
    Response.json({ report: await buildReport(request.signal) }),
  ),
);
```

```ts
// Hono
app.get(
  "/api/report",
  withAlphaHono(payment, async (_request, context) =>
    Response.json({ report: await buildReport() }),
  ),
);
```

Payment context arrives as a **callback argument**, not as a mutated request. With `alphaExpressMiddleware()`/`alphaHonoMiddleware()` (x402 only), read it via `getAlphaPaymentContext(req)` / `getAlphaPaymentContext(c)` instead. Details and outbound contexts: `references/payment-middleware.md`.

## Path C — WeiXin AI Pay preorder (outbound)

The SDK signs a preorder with **SM2-with-SM3** (`WEIXINAIPAY-SM2-WITH-SM3`) and exchanges an upstream `payment_required` payload for a `paymentCode`.

```ts
import { WeiXinAIPayClient } from "@averyso/alpha";

const weixin = new WeiXinAIPayClient({
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!, // 32-byte hex, optional 0x
});

const { paymentCode } = await weixin.preorder(paymentRequired);
```

`paymentRequired` is the payload from the upstream 402 challenge, passed through unchanged — the SDK Base64-encodes and signs it, it does not author it. Unlike x402, this client **throws** (`WeiXinAIPayConfigError` / `WeiXinAIPayRequestError` / `WeiXinAIPayResponseError`) instead of returning a result union, so wrap calls in `try`/`catch`. Key format, sign-string layout, and `signatureEncoding` are in `references/weixin.md`.

## Spend safety — non-negotiable for production

`maxAmount` caps **one** payment. It is not a user budget, daily limit, or approval system. An agent in a loop can call a capped tool many times.

- **Cap precedence** (most specific wins): `x402tool({ maxAmount })` → `client.call(..., { maxAmount })` → client default → SDK default `100_000n`.
- **Bound the loop**: `stopWhen: stepCountIs(n)`, plus per-conversation/user/window paid-call counters.
- **Budget ledger** outside the SDK with reserve/commit/refund so concurrent calls can't race the same budget.
- **Approvals**: `needsApproval` on high-risk or first-time paid tools.
- **Treat paid tools as privileged**: strict schemas, allowlisted endpoints/hosts/headers, no payment payloads in model context.

Code for all of these: `references/spend-controls.md`. Read it before shipping a real payment agent.

## Reference files

Load on demand — don't read them all up front:

| File                               | Read it when                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `references/api.md`                | You need exact option/field names for the x402 client, tool config, or `EndpointResult` |
| `references/networks.md`           | Choosing a network, formatting keys, funding a wallet, converting atomic units          |
| `references/spend-controls.md`     | Shipping to production: budget ledgers, loop limits, approvals, injection defenses      |
| `references/error-handling.md`     | Mapping a result kind or thrown error to a retry decision and user message              |
| `references/payment-middleware.md` | Building inbound paywalls or outbound contexts with any framework adapter               |
| `references/alipay.md`             | Anything Alipay: bill fields, signing, verify/confirm, replay store, failure modes      |
| `references/weixin.md`             | Anything WeiXin: SM2/SM3 signing, key format, preorder wire shape, errors               |
| `references/mastra.md`             | The agent uses Mastra instead of the Vercel AI SDK                                      |
| `references/nextjs.md`             | Building the full Next.js App Router streaming chat                                     |
| `references/testing.md`            | Writing tests, or running any of this without touching a real network                   |

## Common mistakes to avoid

**Cross-rail**

- Constructing any client, or exposing a key, on the client side.
- Inventing an Avery API key, account, login, or `facilitator` option for the buyer side.
- Building a runtime for an unsupported provider/direction pair (alipay outbound, weixin inbound).
- Logging `Payment-Proof`, `Payment-Needed`, `PAYMENT-*`, signatures, or raw gateway responses.
- Reusing one runtime for two providers instead of scoping one runtime per provider and direction.

**x402**

- Passing `maxAmount` as a number or decimal (`50000`, `0.05`) instead of `bigint` atomic units (`50_000n`).
- Configuring a network that doesn't match the endpoint's advertised requirements, then expecting a payment instead of `payment_required`.
- Returning the raw `EndpointResult` to the model instead of narrowing it in `execute`.
- Relying on `maxAmount` alone with no loop or budget controls.

**Alipay**

- Using `alphaExpressMiddleware()`/`alphaHonoMiddleware()` for an alipay runtime instead of `withAlphaExpress()`/`withAlphaHono()`.
- Passing `amount` as a number, or letting the bill drift between the challenge and the verification.
- Going to production without a durable `replayStore`, or writing one backed by an in-process `Map`.
- Streaming (SSE, chunked) an Alipay-protected response — it must be a complete, buffered `Response` under `maxResponseBytes`.
- Treating a fulfillment-confirmation timeout as failure and retrying blindly; it is uncertain payment state and needs reconciliation.

**WeiXin**

- Passing a PEM or base64 key instead of 32-byte hex.
- Expecting a non-throwing result union like x402's — this client throws.
- Hand-building the `payment_required` payload instead of forwarding the upstream challenge.
