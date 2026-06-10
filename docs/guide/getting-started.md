# Getting Started

Alpha is a Node-only SDK. The main runtime path is `X402Client`, which signs
and pays x402 requests for endpoints that advertise compatible payment
requirements.

## Requirements

- Node.js `>=20.19.0`.
- An x402-protected endpoint.
- Credentials for the selected x402 network.
- An RPC URL when the selected network requires one.
- Funds on the selected testnet or mainnet network.

EVM networks require a 32-byte hex private key, with or without a `0x` prefix.
Solana networks require a base58-encoded 64-byte Solana secret key.

## Installation

```sh
pnpm add @averyso/alpha
```

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

Never expose `X402_PRIVATE_KEY` to browsers or client-side bundles.

## Create a Client

```ts
import { X402Client } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

You can also use `X402Networks.baseSepolia`, the primary slug
`"base-sepolia"`, or the raw CAIP-2 string `"eip155:84532"`. `client.network`
always returns the normalized CAIP-2 value.

`maxAmount` is expressed in the atomic unit required by the endpoint payment
requirements. For example, a USDC-style six-decimal asset uses `100000n` for
`0.1` USDC. The SDK default is `100000n`; you can override it at the client,
call, or tool level.

## Call a Paid Endpoint

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

## Direct Calls or AI Tools

Use `client.call()` when your application directly controls the request and
wants to branch on `EndpointResult.kind`.

Use `x402tool()` when a model should decide when to call the endpoint through a
Vercel AI SDK-compatible tool:

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

export const tools = {
  getWeather: x402tool({
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
  }),
};
```
