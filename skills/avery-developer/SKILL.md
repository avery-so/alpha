---
name: avery-developer
description: Build AI agents that pay for x402-protected HTTP APIs with the Avery SDK (@averyso/alpha). Use this skill whenever the user works with @averyso/alpha, the Avery SDK, `x402tool`, or `X402Client`; whenever they want an AI agent or a Vercel AI SDK tool to call a paid, pay-per-request, x402, or "402 Payment Required" endpoint; or whenever they mention agent payments, machine/autonomous payments, monetized APIs, per-call spend caps for agents, or wiring crypto/stablecoin (e.g. USDC) payments into a model's tool calls — even if they do not name the SDK explicitly. Covers client setup, building paid tools, network/wallet config, spend controls, error handling, and Next.js integration.
---

# Avery SDK Developer

Avery SDK (`@averyso/alpha`) lets an AI agent call **x402-protected HTTP endpoints** — APIs that respond `402 Payment Required` and expect an on-chain payment before returning data. The SDK runs the payment on the **server**: it discovers the endpoint's payment requirements, signs payment from a configured wallet, retries the request, and returns a typed result. The model only ever supplies structured tool input; it never sees keys or signs anything.

Use this skill to help developers go from "I have a paid x402 API" to "my agent can call it safely, within a budget."

## The two entry points

Pick based on **who decides to make the request**:

- **`x402tool()`** — the *model* decides. Wraps a paid endpoint as a Vercel AI SDK-compatible tool. Use this for agent payments: the LLM calls the tool with structured input, the SDK pays and returns a result. **This is the primary, most common path.**
- **`X402Client.call()`** — your *application code* decides. A direct paid HTTP call you branch on yourself. Use this when there is no model in the loop, or your server fully controls the request.

Both share one `X402Client` instance that holds the wallet, network, and default spend cap.

## Mental model (read before writing code)

- **Server-only.** The SDK is Node-only and signs payments with a private key. Never construct `X402Client` in the browser, a client component, or a bundled frontend. In Next.js route handlers, set `export const runtime = "nodejs"`.
- **No Avery account, API key, or hosted service is required.** Payment is local x402 signing with the developer's own wallet, RPC URL, and target endpoint. Do not invent an `apiKey`, login, or `facilitator` option — none exist. The resource server (the endpoint owner) controls settlement; the buyer side (this SDK) does not.
- **`maxAmount` is a `bigint` of atomic units, not a decimal.** `100_000n` means `0.1` USDC for a 6-decimal token — never `100_000` USDC and never `0.1`. The endpoint's payment requirement chooses the asset and decimals. Always use the `bigint` literal suffix `n`.
- **The configured network must match what the endpoint advertises.** A mismatch yields a `payment_required` result, not a payment. Let the endpoint's requirements drive the network choice.
- **Import only from `@averyso/alpha`.** Never import from `packages/sdk/src/...` or other internal paths.

## Install

```sh
pnpm add @averyso/alpha
# the agent path also needs the Vercel AI SDK:
pnpm add ai
```

```ts
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";
import { jsonSchema } from "ai";
```

CommonJS (`const { X402Client, x402tool } = require("@averyso/alpha")`) is supported.

## Step 1 — Create the client

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n, // client-default cap; the SDK default is also 100_000n
});
```

- **First argument is the private key.** EVM networks need a 32-byte hex key (`0x`-prefixed or not). Solana networks need a base58-encoded 64-byte secret key. Keep it in an env var, server-side only.
- **`network`** accepts an `X402Networks` constant (preferred), a friendly name (`"Base Sepolia"`), a slug (`"base-sepolia"`), or a raw CAIP-2 string (`"eip155:84532"`). `client.network` always reads back as normalized CAIP-2. For first tests, `Base Sepolia` is the well-supported default. See `references/networks.md` for the full table, wallet setup, funding, and atomic-unit conversion.
- **`rpcUrl`** is optional but should be set explicitly in production.

## Step 2 — Build a paid tool with `x402tool()`

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
    maxAmount: 50_000n, // tool-level cap; overrides the client default for this tool
  }),
};
```

How tool input becomes an HTTP request when you do **not** pass a `request` function:

- `GET`, `HEAD`, `DELETE` → input object becomes **query parameters** (`{ city: "Paris" }` → `?city=Paris`). `GET` is the default method.
- `POST`, `PUT`, `PATCH` → input object becomes a **JSON body**.

The type parameter `x402tool<Input>` types the model's input. Always give a strict `inputSchema` (`additionalProperties: false`, explicit `required`) — it is your first line of defense against malformed or injected input.

### Dynamic endpoints and request overrides

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

Prefer static endpoint URLs, or build dynamic URLs only from allowlisted hosts/paths. Do not forward user/model-controlled headers unless each one is explicitly allowed.

### Return model-friendly output with `execute`

Without `execute`, the tool returns the full raw `EndpointResult` to the model — including payment payloads and headers. **Add `execute` to hand the model a small, safe object** and keep secrets out of its context:

```ts
execute: ({ endpoint }) => {
  if (endpoint.kind === "success") {
    return { ok: true, weather: endpoint.body };
  }
  return { ok: false, reason: endpoint.kind };
},
```

`execute` receives `{ endpoint, input }` where `endpoint` is the `EndpointResult`.

## Step 3 — Hand the tools to the model

```ts
import { generateText, stepCountIs } from "ai";

const response = await generateText({
  model, // from your AI SDK provider / Vercel AI Gateway
  tools,
  stopWhen: stepCountIs(6), // bound the agent loop — see spend controls
  prompt: "What is the weather in Lisbon?",
});
```

For a complete streaming chat route + UI, see `references/nextjs.md`.

## Step 4 — Handle the result

When you call `X402Client.call()` directly (or read `endpoint` inside `execute`), branch on `kind` first:

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { maxAmount: 50_000n },
);

switch (result.kind) {
  case "success":      // paid and settled; use result.body
  case "payment_required": // no compatible payment — DON'T blindly retry; fix network/cap/asset
  case "settle_failed":    // payment may have moved; don't treat as success
  case "passthrough":      // endpoint didn't require payment (free / wrong URL / middleware order)
  case "error":            // transient (retry with backoff) or config (don't retry)
}
```

Prefer this default result flow for agent tools. Use `throwOnError: true` only when you want a centralized exception path in a route handler (it throws `X402PaymentError`). Full kind-by-kind table, retry rules, and error classes are in `references/error-handling.md`.

## Spend safety — non-negotiable for production

`maxAmount` caps **one** payment. It is **not** a user budget, daily limit, or approval system. An agent in a loop can call a capped tool many times. For anything beyond a demo, layer server-side controls:

- **Cap precedence** (most specific wins): `x402tool({ maxAmount })` → `client.call(..., { maxAmount })` → client default → SDK default `100_000n`.
- **Bound the loop**: AI SDK `stopWhen: stepCountIs(n)`, plus per-conversation/user/window paid-call counters.
- **Budget ledger** outside the SDK with reserve/commit/refund so concurrent calls can't race the same budget.
- **Approvals**: set `needsApproval` on high-risk or first-time paid tools to pause for human/app authorization.
- **Treat paid tools as privileged**: validate input with strict schemas, allowlist endpoints/hosts/headers, keep keys and payment payloads out of model context.

These patterns, with code, are in `references/spend-controls.md`. Read it before shipping a real payment agent.

## Reference files

Load these as needed — don't read them all up front:

- `references/api.md` — full API surface: `X402ClientOptions`, `X402CallOptions`, the complete `X402ToolConfig`, `EndpointResult` union and fields, endpoint types, error classes, logging.
- `references/networks.md` — built-in network table, wallet/key formats, funding/faucets, `maxAmount` atomic-unit conversion, RPC and mainnet checklist.
- `references/spend-controls.md` — cap precedence, budget ledger, loop controls, approvals, human confirmation, prompt-injection defenses.
- `references/error-handling.md` — `EndpointResult.kind` table with user message + developer action + retry guidance, `throwOnError`, retry strategy.
- `references/nextjs.md` — full Next.js App Router streaming chat example (route handler + client UI).

## Common mistakes to avoid

- Passing `maxAmount` as a number or decimal (`50000`, `0.05`) instead of a `bigint` atomic value (`50_000n`).
- Constructing `X402Client` or exposing the private key on the client side.
- Inventing an Avery API key, account, login, or `facilitator` option.
- Configuring a network that doesn't match the endpoint's advertised requirements, then expecting a payment instead of `payment_required`.
- Returning the raw `EndpointResult` to the model when the response can carry payment details — use `execute`.
- Relying on `maxAmount` alone for spend safety with no loop/budget controls.
- Importing from internal `packages/sdk/src/...` paths instead of `@averyso/alpha`.
