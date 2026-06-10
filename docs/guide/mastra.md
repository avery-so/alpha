# Mastra Integration

Use `x402MastraTool()` when a Mastra agent should call a paid x402 endpoint.
The helper returns a Mastra `createTool()`-compatible object that keeps x402
payment signing on the server and caps each paid call with `maxAmount`.

This integration covers the buyer side only. You provide the x402-protected
endpoint, wallet private key, RPC URL when needed, and funds for the network and
asset the endpoint requires. The endpoint provider controls the x402 payment
requirements and settlement path; Avery SDK does not configure a facilitator.

## Requirements

- Avery SDK and Mastra installed in your application.
- A server-side Mastra agent runtime. Do not put `X402_PRIVATE_KEY` in browser
  code.
- An x402-protected endpoint the agent is allowed to call.
- `X402_PRIVATE_KEY`, `X402_RPC_URL` when required, and matching network funds.

## Install

```sh
pnpm add @averyso/alpha @mastra/core zod
```

Avery SDK does not import `@mastra/core` at runtime. Your application installs
and runs Mastra; `x402MastraTool()` returns the tool shape Mastra expects.

## Configure Environment

```sh
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://...
X402_PAID_WEATHER_ENDPOINT=https://...
MASTRA_MODEL=provider/model-name
```

Keep these values server-side. The private key signs x402 payment payloads and
the RPC URL may expose provider credentials.

## Create a Paid Tool

```ts
// src/mastra/tools/paid-weather.ts
import { z } from "zod";
import {
  X402Client,
  X402Networks,
  x402MastraTool,
  type EndpointResult,
} from "@averyso/alpha";

const weatherInputSchema = z.object({
  city: z.string(),
});

const weatherOutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    weather: z.unknown(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),
]);

type WeatherInput = z.infer<typeof weatherInputSchema>;
type WeatherOutput = z.infer<typeof weatherOutputSchema>;

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const paidWeatherTool = x402MastraTool<
  WeatherInput,
  WeatherOutput,
  "paid-weather"
>({
  id: "paid-weather",
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: weatherInputSchema,
  outputSchema: weatherOutputSchema,
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  execute: ({ endpoint }) => toWeatherOutput(endpoint),
});

function toWeatherOutput(result: EndpointResult): WeatherOutput {
  if (result.ok) {
    return {
      ok: true,
      weather: result.body,
    };
  }

  return {
    ok: false,
    reason: `${result.kind}:${result.status}`,
  };
}
```

Without `execute`, the tool returns the full `EndpointResult`. For agent tools,
prefer returning a smaller output that hides payment headers, HTTP metadata, and
provider-specific response details from the model.

## Add the Tool to an Agent

```ts
// src/mastra/agents/weather-agent.ts
import { Agent } from "@mastra/core/agent";

import { paidWeatherTool } from "../tools/paid-weather";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    You answer weather questions.
    Use paidWeather when current weather data is needed.
  `,
  model: process.env.MASTRA_MODEL!,
  tools: {
    paidWeather: paidWeatherTool,
  },
});
```

Mastra stream `toolName` values are based on the object key, not the tool `id`.
The example above emits `paidWeather`. To make the stream name match the tool
id, register it with a computed key:

```ts
tools: {
  [paidWeatherTool.id]: paidWeatherTool,
}
```

## Mastra Fields

`x402MastraTool()` passes Mastra tool fields through, including
`requireApproval`, `strict`, `providerOptions`, `toModelOutput`, `transform`,
`inputExamples`, and `mcp`.

Use `requireApproval` for paid calls that need user confirmation:

```ts
x402MastraTool({
  id: "paid-weather",
  client: x402,
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: weatherInputSchema,
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  requireApproval: true,
});
```

Use Mastra `transform` when browser-facing streams or transcripts should see a
safer shape than the raw tool payload. This is separate from Avery's `execute`
mapper: `execute` controls the actual tool result, while `transform` controls
Mastra display and transcript payloads.

## Where Next

- Read [Agent Spend Controls](/guide/agent-spend-controls) for budgets,
  approvals, and loop limits.
- Read [Error Handling](/guide/error-handling) for `EndpointResult.kind`
  handling.
- Read [SDK API Reference](/api/sdk#x402mastratoolconfig) for the full
  `x402MastraTool()` type.
