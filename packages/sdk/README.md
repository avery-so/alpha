# @averyso/alpha

Node-only TypeScript SDK for Alpha.

## Install

```sh
pnpm add @averyso/alpha
```

## Usage

### ESM

```ts
import { AlphaClient } from "@averyso/alpha";

const client = new AlphaClient({ apiKey: process.env.ALPHA_API_KEY });
const status = await client.getStatus();

console.log(status.ok);
```

## x402 AI SDK tools

`X402Client` wraps x402-paid HTTP resources and can expose them as Vercel AI SDK
tools. The client supports EVM `exact` payments on `eip155:*` networks and
Solana `exact` payments on Solana Mainnet and Devnet.

```ts
import { generateText, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
  maxAmount: 100000n, // atomic token units
});

const tools = {
  paidWeather: x402tool({
    client: x402,
    title: "Paid weather",
    description: "Fetch a paid weather report.",
    endpoint: {
      url: "https://api.example.com/weather",
      method: "GET",
    },
    inputSchema: jsonSchema<{ city: string }>({
      type: "object",
      properties: {
        city: {
          type: "string",
        },
      },
      required: ["city"],
      additionalProperties: false,
    }),
  }),
};

const result = await generateText({
  model: openai("gpt-4.1"),
  prompt: "What is the paid weather report for Taipei?",
  tools,
});
```

You can also call paid endpoints directly:

```ts
const endpoint = await x402.call({
  url: "https://api.example.com/weather",
  method: "POST",
  body: {
    city: "Taipei",
  },
});

if (endpoint.kind === "success") {
  console.log(endpoint.body);
}
```

By default, payment and HTTP failures are returned as `EndpointResult` objects
with `kind: "error"`, `kind: "payment_required"`, or `kind: "settle_failed"`.
Set `throwOnError: true` on a tool or direct call to throw `X402PaymentError`
instead.

`maxAmount` is denominated in atomic token units and defaults to `100000n`. Keep
this ceiling low for agent workflows, and override it per tool only when that
specific endpoint needs a higher limit:

```ts
x402tool({
  client: x402,
  endpoint: "https://api.example.com/premium-report",
  maxAmount: 250000n,
  inputSchema: jsonSchema({ type: "object" }),
});
```

`network` accepts friendly names, canonical slugs, `X402Networks` constants, or
raw CAIP-2 strings. EVM networks require a 32-byte hex private key with an
optional `0x` prefix. Solana networks require a base58-encoded 64-byte Solana
secret key.

### Manual integration check

CI tests do not spend real funds. To verify an end-to-end x402 payment on Base
Sepolia, fund the private key with testnet USDC, provide a Base Sepolia RPC URL,
and call a real x402-protected endpoint with
`network: X402Networks.baseSepolia`. The SDK will read the endpoint's
`PAYMENT-REQUIRED` response, sign an EIP-3009 payment payload, retry the
request, and expose the settlement response in
`EndpointResult.paymentResponse`.

### CommonJS

```js
const { AlphaClient } = require("@averyso/alpha");

const client = new AlphaClient({ apiKey: process.env.ALPHA_API_KEY });
const status = await client.getStatus();

console.log(status.ok);
```
