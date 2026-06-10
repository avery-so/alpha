# Getting Started

Avery SDK is the Agent Payment SDK for the AI Agent era. Start with
`x402tool()` when a model should call paid x402 endpoints through a capped,
server-side tool. Use `X402Client.call()` directly when your application, not a
model, controls the request.

If you are new to x402-protected endpoints, read [Concepts](/guide/concepts)
first for the payment lifecycle and `EndpointResult.kind` outcomes.

## Requirements

- Node.js `>=20.19.0`.
- An x402-protected endpoint. See [Concepts](/guide/concepts) for how an
  endpoint advertises payment requirements and how Avery SDK completes a compatible
  payment.
- Credentials for the selected x402 network. See
  [Wallets and Networks](/guide/wallets-and-networks) for test wallet and
  network setup.
- An RPC URL when the selected network requires one. See
  [Production](/guide/production) for deployment guidance.
- Funds on the selected testnet or mainnet network. Use the exact network and
  asset required by the endpoint.

EVM networks require a 32-byte hex private key, with or without a `0x` prefix.
Solana networks require a base58-encoded 64-byte Solana secret key.

## Installation

```sh
pnpm add @averyso/alpha
```

No Avery account is required for payment features. The package is installed
from npm as `@averyso/alpha`, but runtime payment execution uses local x402
signing with your configured wallet/private key, RPC URL, and target x402
endpoint. Provider-side settlement may happen locally or through the provider's
facilitator, but Avery SDK does not configure that path. You do not need an
Avery account, Avery API key, Avery-hosted service, or registration.

## Imports

ESM:

```ts
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";
```

CommonJS:

```js
const { X402Client, x402tool } = require("@averyso/alpha");
```

## Environment

```sh
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://example-rpc.testnet
```

Never expose `X402_PRIVATE_KEY` to browsers or client-side bundles. Keep
private keys, RPC URLs, and payment signing on the server.

## Create a Client

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

You can also use the friendly name `"Base Sepolia"`, the primary slug
`"base-sepolia"`, or the raw CAIP-2 string `"eip155:84532"`. `client.network`
always returns the normalized CAIP-2 value.

`maxAmount` is expressed in the atomic unit required by the endpoint payment
requirements. For example, a USDC-style six-decimal asset uses `100000n` for
`0.1` USDC. The SDK default is `100000n`; you can override it at the client,
call, or tool level. For production budget ledgers and cap precedence, see
[Agent Spend Controls](/guide/agent-spend-controls).

The full built-in network table is in the [SDK API Reference](/api/sdk). Raw
`eip155:*` CAIP-2 values continue to work; raw Solana CAIP-2 values are limited
to the supported Solana Mainnet and Devnet entries.

For wallet creation, faucet selection, atomic-unit conversion, and mainnet
readiness checks, see [Wallets and Networks](/guide/wallets-and-networks).

## Build an Agent Payment Tool

Use `x402tool()` to expose a paid endpoint as a Vercel AI SDK-compatible tool.
The model supplies structured input, Avery SDK prepares the HTTP request, and
`X402Client` handles the x402 payment flow.

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const tools = {
  getWeather: x402tool<{ city: string }>({
    client,
    title: "Paid weather",
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
  }),
};
```

For `GET`, `HEAD`, and `DELETE`, plain object tool input is mapped to query
parameters. For `POST`, `PUT`, and `PATCH`, it is sent as a JSON body. Use the
tool-level `maxAmount` to keep each model-triggered paid call within a known
ceiling. `maxAmount` caps one payment, so production agents should also enforce
loop limits, approval policy, and budget reservations in server code; see
[Agent Spend Controls](/guide/agent-spend-controls).

To pass the tool to the AI SDK:

```ts
import { generateText } from "ai";

const response = await generateText({
  model,
  tools,
  prompt: "What is the weather in Lisbon?",
});
```

The `model` value comes from your AI SDK model provider. See
[Build an x402 AI Tool](/tutorial/x402-ai-tool) for dynamic endpoints, request
overrides, and model-friendly output shaping.

## Call a Paid Endpoint Directly

Use `client.call()` when your application directly controls the request and
wants to branch on `EndpointResult.kind`.

```ts
const result = await client.call(
  {
    url: "https://api.example.com/weather",
    method: "GET",
    query: { city: "San Francisco", units: "metric" },
  },
  undefined,
  { maxAmount: 50_000n },
);

switch (result.kind) {
  case "success":
    console.log("Paid response:", result.body);
    break;
  case "payment_required":
    console.error("The endpoint required payment but no payment was made.");
    break;
  default:
    console.error("Request failed:", result.kind, result.body);
}
```

By default, `client.call()` returns an `EndpointResult` discriminated union. If
you prefer exception flow for failures, pass `throwOnError: true`:

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "London" } },
  { throwOnError: true },
);
```
