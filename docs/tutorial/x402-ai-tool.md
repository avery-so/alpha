# Build an x402 AI Tool

This tutorial exposes an x402-protected HTTP endpoint as a Vercel AI
SDK-compatible tool. The model supplies tool input, the SDK prepares the
request, and `X402Client` handles the paid x402 call.

## Prerequisites

- Node.js `>=20.19.0`.
- `@averyso/alpha` installed.
- An x402-protected endpoint.
- `X402_PRIVATE_KEY` set to credentials for the selected network.
- `X402_RPC_URL` set when the selected network requires an RPC URL.
- Enough funds on the selected network.

EVM networks use a 32-byte hex private key. Solana networks use a
base58-encoded 64-byte Solana secret key.

Use `X402Networks` constants or friendly names such as `"Base Sepolia"` when
possible. Raw CAIP-2 strings such as `"eip155:84532"` are supported, but are
best kept for configuration files and compatibility paths.

## Create the Client

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

The client-level `maxAmount` is the default payment cap. You can lower or raise
the cap for a specific tool.

## Define the Tool

```ts
import { jsonSchema } from "ai";
import { X402Client, x402tool } from "@averyso/alpha";

interface WeatherInput {
  city: string;
  units?: "metric" | "imperial";
}

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
  rpcUrl: process.env.X402_RPC_URL,
});

export const tools = {
  getWeather: x402tool<WeatherInput>({
    client,
    description: "Get current weather from a paid x402 endpoint.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
  }),
};
```

When no `request` function is provided, `x402tool()` maps plain object input
automatically:

- `GET`, `HEAD`, and `DELETE` inputs become query parameters.
- `POST`, `PUT`, and `PATCH` inputs become a JSON body.

The example above uses the default `GET` method, so
`{ city: "Paris", units: "metric" }` becomes
`?city=Paris&units=metric`.

## Use Dynamic Endpoints

`endpoint` can also be a function of the tool input:

```ts
const tools = {
  getForecast: x402tool<WeatherInput>({
    client,
    description: "Get a paid forecast for a city.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: (input) => ({
      url: `https://api.example.com/weather/${encodeURIComponent(input.city)}`,
      method: "GET",
      query: { units: input.units ?? "metric" },
    }),
    maxAmount: 50_000n,
  }),
};
```

## Override the Request

Use `request` when the endpoint needs headers, a non-default method, or a body
shape that differs from the model input:

```ts
const tools = {
  summarizeReport: x402tool<{ reportId: string; detail: "short" | "full" }>({
    client,
    description: "Buy and summarize a report.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        reportId: { type: "string" },
        detail: { type: "string", enum: ["short", "full"] },
      },
      required: ["reportId", "detail"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/reports",
    request: (input) => ({
      method: "POST",
      headers: {
        "x-report-id": input.reportId,
      },
      body: {
        detail: input.detail,
      },
    }),
    maxAmount: 250_000n,
    throwOnError: true,
  }),
};
```

Providing `request` disables automatic input mapping. The object returned by
`request` is the request shape sent to the endpoint.

## Return Model-Friendly Output

Without `execute`, the tool returns the raw `EndpointResult`. Add `execute`
when the model should receive a smaller, stable object.

```ts
const tools = {
  getWeather: x402tool<
    WeatherInput,
    { ok: true; weather: unknown } | { ok: false; reason: string }
  >({
    client,
    description: "Get current weather from a paid x402 endpoint.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
    execute: ({ endpoint }) => {
      if (endpoint.kind === "success") {
        return { ok: true, weather: endpoint.body };
      }

      return { ok: false, reason: endpoint.kind };
    },
  }),
};
```

`execute` receives `{ endpoint, input }`, where `endpoint` is the
`EndpointResult` returned by `X402Client.call()` and `input` is the original
tool input.

## Pass Tools to the AI SDK

```ts
import { generateText, jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const tools = {
  getWeather: x402tool<{ city: string }>({
    client,
    description: "Get current weather for a city.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
    throwOnError: true,
  }),
};

const response = await generateText({
  model,
  tools,
  prompt: "What is the weather in Lisbon?",
});
```

The `model` value comes from your AI SDK model provider. Keep private keys,
RPC URLs, and payment credentials on the server.
