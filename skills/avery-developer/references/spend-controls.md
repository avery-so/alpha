# Agent Spend Controls

Production payment agents need server-side spending policy. `maxAmount` is the SDK's per-payment safety cap — it is **not** a user budget, session budget, daily limit, or approval system by itself. Use the SDK cap as the last guardrail around a single x402 request, and enforce broader policy in your application **before** any paid tool executes.

> Spend controls must live in deterministic server-side code that can reject execution. Prompt instructions help model behavior but cannot be the enforcement layer — a model or a retrieved document can request spending, but must not define spending policy.

## Cap precedence

The most specific cap available wins:

1. `x402tool({ maxAmount })` — caps that tool's internal `client.call()`.
2. `client.call(..., { maxAmount })` — caps that direct, app-controlled call.
3. `new X402Client(..., { maxAmount })` — the client default.
4. SDK default `100_000n` when nothing is configured.

`maxAmount` is in atomic units (see `networks.md`). It caps **one** payment — not how many times an agent calls a tool, nor daily/user spend, nor concurrent hot-wallet drain.

## Recommended pattern

Start conservative; make every increase explicit.

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 25_000n, // low fallback default
});

export const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 10_000n, // explicit per-tool cap
  }),
};
```

For direct calls, keep the cap local: `client.call(endpoint, init, { maxAmount: 5_000n })`.

## Budget ledger

Maintain budgets **outside** the SDK. Useful scopes: `user`, `session`, `conversation`, `day` (calendar or rolling window), `tool`. Use reserve / commit / refund states so concurrent agent calls cannot race the same budget.

```ts
const reservation = await budgetLedger.reserve({
  userId,
  sessionId,
  conversationId,
  toolName: "lookupReport",
  amountCap: 10_000n,
  network: client.network,
});

try {
  const result = await tools.lookupReport.execute(input, options);
  await budgetLedger.commit({
    reservationId: reservation.id,
    paid: result.paid,
    resultKind: result.kind,
  });
  return result;
} catch (error) {
  await budgetLedger.refund({ reservationId: reservation.id, reason: "tool_execution_failed" });
  throw error;
}
```

Deny paid execution before calling the SDK when: the budget is exhausted, the reservation can't be created, the requested cap exceeds policy, or the wallet balance is below the minimum for the request plus refill window.

## Loop controls

Agent loops can spend repeatedly even when every single payment is capped. Apply in server code:

- Use AI SDK `stopWhen` (e.g. `stepCountIs(...)`) to bound model steps.
- Count paid tool calls per request, conversation, user, and time window.
- Deny duplicate tool+input combinations unlikely to add value.
- Stop on repeated `payment_required`, `settle_failed`, or `error` results instead of letting the model retry the same config.
- Enforce denial in the tool execution path, not only in prompt instructions.

```ts
import { generateText, stepCountIs } from "ai";

const response = await generateText({
  model,
  tools: paidToolLimiter.wrap(tools), // your wrapper that counts/denies paid calls
  stopWhen: stepCountIs(6),
  messages,
});
```

## Approvals

Use `needsApproval` to pause a paid tool for application or human authorization before execution. Good triggers: first-time use by a user/org/conversation; high `maxAmount` vs. normal spend; endpoints that write data or unlock premium/sensitive content; low model confidence or ambiguous intent; budget exceptions; user-facing purchases; suspicious or injection-like input.

```ts
const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 25_000n,
    needsApproval: true, // or the dynamic function form from your AI SDK version
  }),
};
```

In the current AI SDK approval flow, `generateText()`/`streamText()` returns an approval request instead of executing. Your app records the decision, appends an approval response to messages, and makes a second model call. If approved, the tool executes then; if denied, the model should not retry the same call.

## Human confirmation

When asking a user to approve spend, render **fixed, server-generated** text — don't let the model write the authorization copy. Include: tool name; endpoint host + path; network; atomic-unit cap and converted user-facing amount (when you know decimals); budget impact; authorization scope (one call / conversation / session / tool for a limited time); expiry and revocation path. Store the decision with approving user, request id, tool call id, scope, expiry, cap, network, endpoint host, and immutable confirmation text. Re-check that stored decision inside the server-side execution path.

## Prompt-injection defenses

Treat paid tools as privileged server actions:

- Enforce caps, budgets, approvals, endpoint allowlists, and method allowlists in server code.
- Validate every tool input with a strict schema (`additionalProperties: false`) before building the request.
- Prefer static endpoint URLs; build dynamic URLs only from allowlisted hosts and paths.
- Keep private keys, seed phrases, Solana secret keys, RPC URLs, `X-PAYMENT` headers, and `X-PAYMENT-RESPONSE` values out of model context.
- Return redacted, model-friendly output via `execute` instead of raw endpoint responses when responses can carry payment details or secrets.
- Refuse user/model-controlled headers unless each name and value is explicitly allowed.
