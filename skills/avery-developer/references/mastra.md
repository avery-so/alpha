# Mastra tools

`x402MastraTool()` wraps a paid x402 endpoint as a native Mastra tool. It shares the whole payment path with `x402tool()` — same `X402Client`, same endpoint normalization, same `EndpointResult`, same cap precedence — and differs only in the tool's shape.

```sh
pnpm add @averyso/alpha @mastra/core zod
```

```ts
import { z } from "zod";
import { X402Client, X402Networks, x402MastraTool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const getWeather = x402MastraTool<{ city: string }>({
  id: "get-weather",
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: z.object({ city: z.string() }),
  client,
  endpoint: "https://api.example.com/weather",
  maxAmount: 50_000n,
  execute: ({ endpoint }) =>
    endpoint.kind === "success"
      ? { ok: true, weather: endpoint.body }
      : { ok: false, reason: endpoint.kind },
});
```

Hand it to an agent like any other Mastra tool:

```ts
import { Agent } from "@mastra/core/agent";

export const weatherAgent = new Agent({
  name: "weather-agent",
  instructions:
    "Answer weather questions. Paid lookups cost money — call the tool at most once per city.",
  model,
  tools: { getWeather },
});
```

The returned object is tagged with `Symbol.for("mastra.core.tool.Tool")`, so Mastra treats it as a first-class tool without extra registration.

## Differences from `x402tool()`

|                     | `x402tool()` (Vercel AI SDK) | `x402MastraTool()` (Mastra)                  |
| ------------------- | ---------------------------- | -------------------------------------------- |
| Identity            | `title`                      | **`id`** (required)                          |
| Schema              | `jsonSchema(...)` from `ai`  | Zod schema (Mastra convention)               |
| `execute` signature | `({ endpoint, input })`      | `({ endpoint, input }, context)`             |
| Approval gate       | `needsApproval`              | **`requireApproval`**                        |
| Output shaping      | —                            | `outputSchema`, `toModelOutput`, `transform` |
| Abort               | AI SDK abort signal          | `context.abortSignal`                        |

Everything payment-related is identical: `client`, `endpoint`, `request`, `maxAmount`, `throwOnError`, and the `EndpointResult` your `execute` receives.

## Payment-specific fields

- **`endpoint`** — a string/URL/`EndpointConfig`, or a function of the input. Without a `request` function, input maps to query params for `GET`/`HEAD`/`DELETE` and to a JSON body for `POST`/`PUT`/`PATCH`.
- **`request`** — full control over method/headers/body. **Disables** automatic input mapping.
- **`maxAmount`** — a `bigint` cap for this tool, overriding the client default.
- **`throwOnError`** — throw `X402PaymentError` instead of returning a non-success result. Leave it off for agents; a thrown error inside a tool is harder for the model to recover from than a `{ ok: false }` object.
- **`execute`** — the result mapper. **Always provide it.** Without it the tool returns the raw `EndpointResult`, putting payment payloads and response headers into model context.

## Approvals

Mastra's `requireApproval` is where a human gate belongs for expensive or first-time paid calls:

```ts
requireApproval: (input) => input.detail === "full",   // expensive tier needs a human
```

It accepts a boolean or a predicate over the input, and can be async. This is a per-call gate, not a budget — pair it with the ledger patterns in `spend-controls.md`.

## Cancellation

`context.abortSignal` is forwarded into the payment-aware fetch, so an aborted agent run stops the in-flight HTTP request. It cannot recall a payment that already settled — an abort mid-settlement leaves the same uncertain state as any other interrupted payment. Treat abort as "stop trying", not "undo".

## What still applies

Everything in the main skill: server-only construction, `bigint` atomic units, matching networks, strict input schemas, allowlisted endpoints, and loop bounds. Mastra changes the tool wrapper, not the money.

See `api.md` for the shared config fields, `spend-controls.md` for budget enforcement, and `error-handling.md` for the result-kind table.
