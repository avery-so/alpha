# Agent Spend Controls

Production payment agents need server-side spending policy. `maxAmount` is the
SDK's per-payment safety cap, but it is not a user budget, session budget, daily
limit, or approval system by itself.

Use Alpha's caps as the last payment guardrail around a single x402 request, and
enforce broader spend policy in your application before any paid tool executes.

## Cap Precedence

Alpha applies the most specific cap available for the paid request path:

1. `x402tool({ maxAmount })` caps that tool's internal `client.call()` execution.
2. `client.call(..., { maxAmount })` caps that direct application-controlled
   call.
3. `new X402Client(..., { maxAmount })` is the client default.

If no cap is configured, the SDK default is `100000n`.

`maxAmount` is expressed in the atomic unit from the endpoint payment
requirements. For example, a USDC-style six-decimal asset uses `100000n` for
`0.1` USDC. The endpoint chooses the asset and decimals through its x402 payment
requirements, so do not treat the value as a decimal token amount.

`maxAmount` caps one x402 payment. It does not limit how many times an agent can
call a tool, how much a user can spend in a day, or how much balance the hot
wallet can consume across concurrent requests.

## Recommended Pattern

Start with conservative defaults and make every increase explicit:

- Set a low client default as a fallback.
- Set explicit `maxAmount` values on every paid `x402tool()`.
- Use stricter per-call caps for direct `client.call()` requests that your app
  fully controls.
- Keep a separate budget ledger for users, sessions, conversations, tools, and
  time windows.
- Check wallet balance or provider balance before accepting new paid work, and
  alert before the hot wallet reaches your refill threshold.

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 25_000n,
});

export const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 10_000n,
  }),
};
```

For direct calls, keep the cap local to the operation:

```ts
const result = await client.call(endpoint, init, {
  maxAmount: 5_000n,
});
```

## Budget Ledger

Maintain application budgets outside the SDK. Useful scopes include:

- `user`: total exposure for an account or organization.
- `session`: exposure during one authenticated session.
- `conversation`: exposure for one agent thread.
- `day`: calendar or rolling-window spend limits.
- `tool`: tighter limits for expensive or high-risk tools.

Use reserve, commit, and refund states so concurrent agent calls cannot race the
same budget.

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
  await budgetLedger.refund({
    reservationId: reservation.id,
    reason: "tool_execution_failed",
  });

  throw error;
}
```

Deny paid execution before calling Alpha when the budget is exhausted, the
reservation cannot be created, the requested cap exceeds policy, or the wallet
balance is below the minimum needed for the request and refill window.

## Loop Controls

Agent loops can spend repeatedly even when every individual payment is capped.
Apply loop limits in server code:

- Use AI SDK `stopWhen` conditions, such as `stepCountIs(...)`, to bound model
  steps.
- Count paid tool calls per request, conversation, user, and time window.
- Deny duplicate tool plus input combinations when repeated calls are unlikely
  to add value.
- Stop on repeated `payment_required`, `settle_failed`, or `error` results
  instead of letting the model retry the same configuration.
- Enforce denial in the tool execution path, not only in prompt instructions.

```ts
import { generateText, stepCountIs } from "ai";

const paidToolLimiter = createPaidToolLimiter({
  maxPaidToolCalls: 3,
  duplicateWindowMs: 60_000,
});

const response = await generateText({
  model,
  tools: paidToolLimiter.wrap(tools),
  stopWhen: stepCountIs(6),
  messages,
});
```

Prompt instructions are helpful for model behavior, but spend controls must live
in deterministic server-side code that can reject execution.

## Approvals

Use `needsApproval` when a paid tool should pause for application or human
authorization before execution. Good triggers include:

- First-time use of a paid tool by a user, organization, or conversation.
- High `maxAmount` relative to the user's normal spend.
- Endpoints that write data, unlock premium content, or expose sensitive data.
- Low model confidence or ambiguous user intent.
- Budget exceptions or requests that would consume a large budget percentage.
- User-facing confirmations for visible purchases.
- Suspicious or prompt-injection-like tool input.

`x402tool()` accepts AI SDK-style `needsApproval` fields and passes them through
to the tool object. Use the boolean form for tools that always need approval, or
the dynamic function signature from the AI SDK version installed in your
application. In the current AI SDK approval flow, `generateText()` or
`streamText()` returns an approval request instead of executing the tool. Your
application records the decision, adds an approval response to the messages, and
makes a second model call. If approved, the tool executes during that second
call. If denied, the model receives the denial and should not retry the same
tool call.

```ts
const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 25_000n,
    needsApproval: true,
  }),
};
```

For dynamic approval policy, read the tool input using the callback shape from
your installed AI SDK version and make the decision in application code.

## Human Confirmation

When asking a user to approve spend, render fixed server-generated text. Do not
ask the model to produce the final authorization copy.

Include:

- Tool name.
- Endpoint host and path.
- Network.
- Atomic-unit cap and user-facing converted amount when your app knows the
  asset decimals.
- Budget impact, such as remaining daily or session budget after approval.
- Authorization scope, such as one call, this conversation, this session, or
  this tool for a limited time.
- Expiry time and any revocation path.

Store the authorization decision with the approving user, request id, tool call
id, scope, expiry, cap, network, endpoint host, and immutable confirmation text.
Check that stored decision again inside the server-side tool execution path.

## Prompt-Injection Defenses

Treat paid tools as privileged server actions. A model or retrieved document can
request spending, but it must not define spending policy.

Use these controls:

- Enforce caps, budgets, approvals, endpoint allowlists, and method allowlists
  in server code.
- Validate every tool input with a strict schema before building the endpoint
  request.
- Prefer static endpoint URLs, or build dynamic URLs from allowlisted hosts and
  paths.
- Keep private keys, seed phrases, Solana secret keys, RPC URLs, `X-PAYMENT`
  headers, and `X-PAYMENT-RESPONSE` values out of model context.
- Return redacted, model-friendly tool output through `execute` instead of raw
  endpoint responses when the response can contain payment details or secrets.
- Refuse user-controlled headers unless each header name and value is explicitly
  allowed.

For deployment secret handling, see [Production](/guide/production). For
diagnostic events and audit logging around these decisions, see
[Observability and Audit Logging](/guide/observability).

## References

- [AI SDK tool approvals](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-approval)
- [AI SDK loop control](https://ai-sdk.dev/docs/agents/loop-control)
