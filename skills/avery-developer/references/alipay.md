# Alipay AI Pay (支付宝 AI 按量付费)

The SDK implements two deliberately separate Alipay AI Pay paths:

- **Seller-side inbound**: sign a bill, issue the `Payment-Needed` challenge,
  verify the buyer's `Payment-Proof` against the Alipay gateway, and confirm
  fulfillment after the resource is produced.
- **Buyer-side outbound Machine Pay**: send a normal HTTP request, delegate one
  eligible 402 challenge to an application-provided payer, and retry once with
  the resulting `Payment-Proof`.

The two paths do not share `X402Client`, `EndpointResult`, bill parsing, or
merchant gateway behavior.

Two ways to use it:

- **`createAlphaPayment({ provider: "alipay", direction: "inbound" })`** — the paywall runtime. Handles the whole challenge/verify/claim/confirm sequence for you. **Use this unless you have a reason not to.**
- **`AlipayAIPayClient`** — the raw client, when you drive the sequence yourself (a non-HTTP transport, a custom framework, or an offline reconciliation job).
- **`AlipayAIPayMachinePayClient`** or
  **`createAlphaPayment({ provider: "alipay", direction: "outbound" })`** —
  buyer-side Machine Pay. The host supplies the required payer policy.

## Inbound credentials

| Option                | Required      | What it is                                                        |
| --------------------- | ------------- | ----------------------------------------------------------------- |
| `appId`               | yes           | Alipay open-platform app id                                       |
| `privateKey`          | yes           | **Your app's** RSA private key — signs bills and gateway requests |
| `alipayPublicKey`     | in production | **Alipay's** public key — verifies gateway responses              |
| `appAuthToken`        | no            | Third-party (ISV) authorization token                             |
| `gatewayEndpoint`     | no            | Defaults to `https://openapi.alipay.com/gateway.do`               |
| `fetch`               | no            | Injected `fetch` — see `testing.md`                               |
| `logLevel` / `logger` | no            | Defaults to `info` and the built-in console logger                |

`privateKey` and `alipayPublicKey` accept either a PEM string or a Node `KeyObject`. Signing is **RSA2** (`SHA256withRSA`).

> **Security: `alipayPublicKey` is optional in the type, but omitting it disables gateway response verification entirely.** Without it, `verifyPayment()` trusts whatever the transport returned — a forged `active: true` would be accepted. Always set it outside local development. The client logs a warning when it is missing.

Never commit any of these. Keep them in env vars, server-side.

## Outbound Machine Pay

`AlipayAIPayMachinePayClient` is a raw Fetch API client for a buyer that calls
a remote Alipay AI Pay endpoint. It returns a `Response`, not an x402
`EndpointResult`.

```ts
import { AlipayAIPayMachinePayClient } from "@averyso/alpha";

const client = new AlipayAIPayMachinePayClient({
  payer: {
    createPaymentProof: ({ paymentNeeded, request, signal }) =>
      buyerPaymentPolicy.authorize({ paymentNeeded, request, signal }),
  },
});

const response = await client.fetch("https://merchant.example.test/report", {
  method: "POST",
  body: JSON.stringify({ topic: "payments" }),
});
```

The client always sends the original request first. It returns immediately for
a non-402 response, a 402 with no non-empty `Payment-Needed`, or an original
request that already contains `Payment-Proof`. For one eligible challenge, it
passes the unmodified header value and `{ url, method }` plus the effective
abort signal to `payer.createPaymentProof()`. It requires a non-empty returned
header, attaches it to a replayed request, and sends exactly one retry. The
second response is final, including another 402.

### Outbound credentials and policy

Outbound Machine Pay requires no merchant `appId`, merchant RSA private key,
Alipay public key, gateway endpoint, or default CLI. Do not try to create a
buyer proof from the seller credentials used by `AlipayAIPayClient`.

`AlipayAIPayMachinePayer` is mandatory and is the security boundary. Its
implementation must independently enforce buyer identity, trusted-merchant
allowlists, challenge validation, amount ceilings, user confirmation, and any
wallet or authorized buyer-SDK interaction. The SDK forwards protocol values;
it does not interpret them or provide a permissive fallback.

```ts
interface AlipayAIPayMachinePayer {
  createPaymentProof(input: {
    paymentNeeded: string;
    request: { url: string; method: string };
    signal?: AbortSignal;
  }): Promise<{ paymentProofHeader: string }>;
}
```

Never log or persist `paymentNeeded` or `paymentProofHeader`. The client logs
only method, URL, status, and error type. Request construction, payer, and
retry failures become a sanitized `AlipayAIPayRequestError`.

## The runtime path (recommended)

```ts
import { createAlphaPayment } from "@averyso/alpha";
import { withAlphaNext } from "@averyso/alpha/next";

export const payment = createAlphaPayment({
  provider: "alipay",
  direction: "inbound",
  client: {
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
  },
  replayStore,
  routes: {
    "GET /api/report": {
      bill: async ({ request, route }) => ({
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

`client` also accepts an already-constructed `AlipayAIPayClient` instance if you want to share one across runtimes.

### Route keys

Keys are `"METHOD /path"`. Both halves accept `*` as a wildcard:

| Key                  | Matches                                 |
| -------------------- | --------------------------------------- |
| `"GET /api/report"`  | exactly `GET /api/report`               |
| `"POST /api/jobs/*"` | any `POST` under `/api/jobs/`           |
| `"* /api/paid/*"`    | any method, any path under `/api/paid/` |
| `"* *"`              | everything                              |

Non-wildcard paths **must start with `/`**, and the method must be letters or `*`; anything else throws `AlphaPaymentConfigError` at construction. Routes are matched in declaration order, first match wins — put specific keys before wildcards. A request matching **no** route passes through unpaid.

### Bill fields

`bill` is either a static object or a function of `{ direction, provider, request, route }` (sync or async). Every field is a **string**:

| Field         | Meaning                   | Notes                                                            |
| ------------- | ------------------------- | ---------------------------------------------------------------- |
| `outTradeNo`  | Your order number         | Must be unique per charge. Reserve it before returning the bill. |
| `amount`      | Price                     | Decimal string in yuan: `"0.01"`, not `0.01` and not `1` (fen).  |
| `currency`    | Currency                  | Optional, defaults to `"CNY"`.                                   |
| `resourceId`  | What is being bought      | Commonly the route path.                                         |
| `payBefore`   | Challenge expiry          | ISO 8601. Keep it short (minutes).                               |
| `sellerId`    | Alipay seller (PID)       |                                                                  |
| `sellerName`  | Display name              | Shown to the payer.                                              |
| `sellerAppId` | Seller app id             | Optional — defaults to the client's `appId`.                     |
| `goodsName`   | Display name of the goods | Shown to the payer.                                              |
| `serviceId`   | Your service identifier   |                                                                  |

**The bill is recomputed on the proof request and compared against the gateway's answer.** `verifyPayment` is called with `expect: { amount, outTradeNo, resourceId }`, and any mismatch marks the result unverified → 402. So a bill factory must be **deterministic for the same request**: don't put `Date.now()` in `amount`, don't generate a fresh `outTradeNo` on every call for the same logical purchase. Derive `outTradeNo` from something stable on the request (an order id, an idempotency key) rather than a random value.

### Signing (what the SDK does for you)

The seller signature covers a sorted, `&`-joined, `=`-paired string of the non-empty bill fields:

```
amount=0.01&currency=CNY&goods_name=AI report&out_trade_no=...&pay_before=...&resource_id=...&seller_id=...&service_id=...
```

That string is signed RSA2, embedded as `protocol.seller_signature`, and the whole `{ protocol, method }` object is JSON-serialized and **Base64URL-encoded without padding** into the `Payment-Needed` header. The incoming `Payment-Proof` header is decoded leniently (standard Base64 _or_ Base64URL, padding optional).

You only need these details when debugging a signature mismatch or reimplementing a client. The exported helpers — `alipayAIPayBillSignContent`, `signAlipayAIPayBill`, `buildAlipayAIPayPaymentNeeded`, `encodeAlipayAIPayPaymentNeededHeader`, `parseAlipayAIPayPaymentProofHeader` — let you inspect each step.

## The request sequence

For a matched route, in strict order:

0. **The bill is resolved and validated.** A missing or blank required field throws `AlipayAIPayConfigError` immediately, whether or not a proof was sent. The RSA signature behind the challenge is _not_ computed here — it is deferred to the branches below that actually return 402, so a paid request never pays for a signature it discards.
1. **No/blank `Payment-Proof`** → sign the bill, return **402** with the `Payment-Needed` header.
2. **Unparseable proof** → same 402 challenge (logged at `warn`).
3. **`verifyPayment` fails or `verified === false`** → same 402 challenge. `verified` requires both `active === true` **and** zero expectation mismatches.
4. **Replay claim.** `replayStore.claim({ provider, tradeNo, route })` must return `"claimed"` to proceed. `"in_progress"` and `"completed"` short-circuit — the caller does not get a second response for one payment.
5. **Your handler runs** and must return a complete Web `Response`.
6. **Response is buffered** and size-checked against `maxResponseBytes` (default 1 MiB).
7. **`confirmFulfillment(tradeNo)`** is called against the gateway.
8. **`replayStore.complete()`**, then the buffered response is released to the caller.

The ordering is the point: the buyer's bytes are never delivered before fulfillment is confirmed, and fulfillment is never confirmed before the resource actually exists.

### Failure behavior

| What fails                                        | Status                    | Claim       | Notes                                                                   |
| ------------------------------------------------- | ------------------------- | ----------- | ----------------------------------------------------------------------- |
| Handler throws                                    | —                         | `abandon()` | The error propagates to your framework.                                 |
| Handler returns `>= 400`                          | that status, generic body | `abandon()` | Reported as `resource_handler_failed`.                                  |
| Response too large / streaming / already consumed | 500                       | `abandon()` | `resource_response_failed`.                                             |
| `confirmFulfillment` fails                        | 502                       | **kept**    | `fulfillment_confirmation_failed`. Uncertain payment state — see below. |
| `replayStore.complete()` fails                    | 502                       | **kept**    | `fulfillment_state_failed`.                                             |

**Do not retry a `fulfillment_confirmation_failed` blindly.** The claim is deliberately _not_ released, because the payment may well have been confirmed on Alipay's side. Reconcile the `tradeNo` out of band before deciding whether to refund, redeliver, or complete the claim.

Alpha never puts the resource body in an error response, and error bodies carry only a stable machine code.

## Replay protection

`AlphaReplayStore` is an interface you implement — the SDK ships no default, on purpose. An in-process `Map` is unsafe across workers and restarts, so it is not provided.

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

`claim()` must be **atomic** — a compare-and-set, not read-then-write. Two concurrent requests carrying the same `tradeNo` must not both receive `"claimed"`.

A Redis implementation:

```ts
import type { AlphaReplayStore } from "@averyso/alpha";

// Tune this to your slowest handler + confirmFulfillment round trip.
// Too short: a concurrent replay slips through while the first is still working.
// Too long: a crashed worker's tradeNo stays locked and needs manual clearing.
const IN_PROGRESS_TTL_SECONDS = 120;
const COMPLETED_TTL_SECONDS = 7 * 24 * 60 * 60;

const key = ({ provider, tradeNo, route }: { provider: string; tradeNo: string; route: string }) =>
  `alpha:replay:${provider}:${route}:${tradeNo}`;

export const replayStore: AlphaReplayStore = {
  async claim(input) {
    const k = key(input);
    const ok = await redis.set(k, "in_progress", { NX: true, EX: IN_PROGRESS_TTL_SECONDS });

    if (ok === "OK") {
      return "claimed";
    }

    return (await redis.get(k)) === "completed" ? "completed" : "in_progress";
  },

  async complete(input) {
    await redis.set(key(input), "completed", { EX: COMPLETED_TTL_SECONDS });
  },

  async abandon(input) {
    await redis.del(key(input));
  },
};
```

Keep `COMPLETED_TTL_SECONDS` at least as long as the window in which a `Payment-Proof` could be replayed. A relational store works equally well — a unique index on `(provider, route, trade_no)` with a status column gives you the same atomicity plus an audit trail.

Omitting `replayStore` is allowed for local development: the runtime logs one warning at initialization and runs without replay protection.

## Framework binding

**Alipay inbound requires the wrapper form.** `alphaExpressMiddleware()` and
`alphaHonoMiddleware()` throw `AlphaPaymentConfigError` only for an Alipay
inbound runtime, because the plain-middleware shape cannot buffer the response
until fulfillment is confirmed. Alipay outbound uses ordinary context injection
in Express and Hono, and `withAlphaNext()` receives the outbound client as its
payment context.

```ts
// Next.js — app/api/report/route.ts
export const runtime = "nodejs";

export const GET = withAlphaNext(payment, async (request, context, routeContext) => {
  // context.payment is null on unmatched routes, populated after verification
  return Response.json({ report: await buildReport(request.signal) });
});
```

```ts
// Express — call body parsers before the wrapper
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
  withAlphaHono(payment, async (request, context) =>
    Response.json({ report: await buildReport(request.signal) }),
  ),
);
```

`alphaNextProxy()` is **x402-only** and rejects an alipay runtime — don't try to paywall Alipay routes from `proxy.ts`, and keep Alipay off Edge-only paths (it needs Node crypto).

Inside the handler, `context` is `AlphaAlipayInboundPaymentContext`:

```ts
{
  direction: "inbound",
  provider: "alipay",
  payment: {
    active: boolean,
    amount: string,
    outTradeNo: string,
    resourceId: string,
    tradeNo: string,
  } | null,   // null when the route was not payment-matched
}
```

### Response constraints

The handler must return a **complete, buffered** `Response`:

- No streaming, no SSE, no already-consumed bodies — all rejected with 500.
- Body must fit `maxResponseBytes` (default 1 MiB); raise it per route if needed.
- Long jobs should return a job id and let the client poll a free status route, rather than streaming under the paywall.

## The raw client path

Use `AlipayAIPayClient` directly only when the runtime doesn't fit. You then own steps 1–8 yourself, **including replay protection**.

```ts
import { AlipayAIPayClient, ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER } from "@averyso/alpha";

const client = new AlipayAIPayClient({
  appId: process.env.ALIPAY_APP_ID!,
  privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
});

// 1. challenge — only sign when you are actually going to return 402.
//    assertBill() validates the same fields without the RSA cost.
client.assertBill(bill);
const { header, paymentNeeded } = client.buildPaymentNeededHeader(bill);

// 2. parse the buyer's proof
const proof = client.parsePaymentProofHeader(
  request.headers.get(ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER)!,
);

// 3. verify against the gateway, with expectations
const verification = await client.verifyPayment(proof, {
  expect: { amount: bill.amount, outTradeNo: bill.outTradeNo, resourceId: bill.resourceId },
  signal: request.signal,
});

if (!verification.verified) {
  // verification.mismatches lists which of amount / out_trade_no / resource_id disagreed
}

// 4. …produce the resource…

// 5. confirm fulfillment
await client.confirmFulfillment(verification.tradeNo);
```

Always pass `expect`. Without it, `mismatches` is empty and `verified` collapses to just `active` — meaning you'd accept a valid payment for a _different_ order or amount.

## Errors

All Alipay errors extend `AlipayAIPayError` (which extends `Error`) and carry an optional `details` object:

| Class                      | Meaning                                                                      | Action                                                     |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `AlipayAIPayConfigError`   | Missing/invalid credentials or bill fields                                   | Fix config; never retry.                                   |
| `AlipayAIPayRequestError`  | Transport failure, or a malformed `Payment-Proof`                            | Retry transport errors with backoff; a bad proof is a 402. |
| `AlipayAIPayResponseError` | HTTP error, malformed body, failed signature check, or a business error code | Read `status` and `details.code`/`details.subCode`.        |

Gateway business failures (`code !== "10000"`) surface as `AlipayAIPayResponseError` with `details.code`, `details.subCode`, and `details.subMsg` — `sub_code` is what identifies the actual Alipay problem.

The gateway parser also rejects a response whose signature does not cover the returned node, which defends against spliced envelopes with duplicate keys. If you see _"signature does not cover the returned response node"_, treat it as a tampered or proxy-mangled response, not a config typo.

## Observability

`logLevel` (`"debug" | "info" | "warn" | "error" | "silent"`) and a custom `logger` are accepted by both the client and the runtime; the runtime passes its own down to a client it constructs.

Alpha's middleware logs only provider, direction, route, status, latency, and error type. Hold that line in your own logs:

- **Never log** `Payment-Proof`, `Payment-Needed`, `sign`/`seller_signature`, private keys, or raw gateway responses.
- **Safe to log** `tradeNo`, `outTradeNo`, `resourceId`, `amount`, verification outcome, and mismatch names.

`debug` level logs endpoint, method, and body _length_ — not body content — so it is safe to enable while debugging.

## Checklist before production

- [ ] `alipayPublicKey` is configured, so gateway responses are actually verified.
- [ ] A durable, atomic `replayStore` is wired in (not a `Map`).
- [ ] The bill factory is deterministic per request and reserves `outTradeNo` idempotently.
- [ ] `verifyPayment` is called with `expect` (automatic via the runtime).
- [ ] `maxResponseBytes` is set to a real limit for each route.
- [ ] Handlers return buffered responses — no streaming under the paywall.
- [ ] `fulfillment_confirmation_failed` has a reconciliation path, not a blind retry.
- [ ] Payment headers and signatures are excluded from logs and error reporting.
- [ ] Next.js routes declare `export const runtime = "nodejs"`.
