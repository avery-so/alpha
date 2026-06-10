# @averyso/alpha

Avery SDK is the best Agent Payment SDK for the AI Agent era.

Use `@averyso/alpha` to turn x402-protected paid HTTP endpoints into safe,
capped, model-callable tools for server-side AI agents. The same SDK also gives
you a direct lower-level `X402Client.call()` path for application-controlled
requests.

Product pillars:

- Agent-native tools for the Vercel AI SDK with `x402tool()`.
- Pay-per-request x402 HTTP access with `X402Client`.
- Payment exposure control with `maxAmount`.
- Server-side private key, RPC URL, and signing boundaries.
- EVM and Solana network support.

## Install

```sh
pnpm add @averyso/alpha
```

No Avery account is required for payment features. The package is installed
from npm as `@averyso/alpha`, but runtime payment execution uses local x402
signing with your configured wallet/private key, RPC URL, and target x402
endpoint. Provider-side settlement may happen locally or through the provider's
facilitator, but Avery SDK does not configure that path. You do not need an
Avery account, Avery API key, Avery-hosted service, or registration.

## Agent Payment Tools

`x402tool()` exposes an x402 endpoint as a Vercel AI SDK-compatible tool. The
model supplies tool input, the SDK prepares the request, pays the endpoint, and
returns an `EndpointResult` or your custom `execute` output.

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const tools = {
  paidWeather: x402tool<{ city: string }>({
    client: x402,
    title: "Paid weather",
    description: "Fetch a paid weather report.",
    endpoint: {
      url: "https://api.example.com/weather",
      method: "GET",
    },
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: {
          type: "string",
        },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    maxAmount: 50_000n,
  }),
};
```

For `GET`, `HEAD`, and `DELETE` endpoints, plain object input is mapped to the
query string. For `POST`, `PUT`, and `PATCH` endpoints, it is sent as a JSON
body. Use `request` when the paid endpoint needs custom headers, a custom
method, or a body shape that differs from model input.

`maxAmount` is denominated in atomic token units and defaults to `100_000n`.
Keep this ceiling low for agent workflows, and override it per tool only when
that specific endpoint needs a higher limit:

```ts
x402tool({
  client: x402,
  endpoint: "https://api.example.com/premium-report",
  maxAmount: 250_000n,
  inputSchema: jsonSchema({ type: "object" }),
});
```

## Direct x402 Calls

Use `X402Client.call()` when your application directly controls the request and
wants to branch on `EndpointResult.kind`. `X402Client` wraps the x402 payment
flow for paid HTTP resources. It supports EVM `exact` payments on `eip155:*`
networks and Solana `exact` payments on Solana Mainnet and Devnet.

```ts
import {
  X402Client,
  X402Networks,
  type EndpointResult,
} from "@averyso/alpha";

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

const result: EndpointResult = await x402.call(
  {
    url: "https://api.example.com/weather",
    method: "POST",
    body: {
      city: "Taipei",
    },
  },
  undefined,
  { maxAmount: 50_000n },
);

if (result.kind === "success") {
  console.log(result.body);
}
```

By default, payment and HTTP failures are returned as `EndpointResult` objects
with `kind: "error"`, `kind: "payment_required"`, or `kind: "settle_failed"`.
Set `throwOnError: true` on a direct call or tool to throw `X402PaymentError`
instead.

## Network Selection and Credentials

`network` accepts friendly names, primary slugs, `X402Networks` constants, or
raw CAIP-2 strings:

```ts
new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
});

new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "base-sepolia",
});

new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
});

new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "eip155:84532",
});
```

`client.network` always returns normalized CAIP-2. For example,
`new X402Client(key, { network: "Base Sepolia" }).network` is
`"eip155:84532"`.

EVM networks require a 32-byte hex private key with an optional `0x` prefix.
Solana networks require a base58-encoded 64-byte Solana secret key. Unknown
friendly names and unsupported raw Solana CAIP-2 values throw
`X402ConfigError`.

Built-in friendly names, primary slugs, constants, and CAIP-2 values:

| Friendly Name | Primary Slug | Constant | CAIP-2 |
|---|---|---|---|
| `Solana Mainnet` | `solana` | `X402Networks.solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet` | `base` | `X402Networks.base` | `eip155:8453` |
| `Polygon Mainnet` | `polygon` | `X402Networks.polygon` | `eip155:137` |
| `xLayer Mainnet` | `xlayer` | `X402Networks.xLayer` | `eip155:196` |
| `Peaq Mainnet` | `peaq` | `X402Networks.peaq` | `eip155:3338` |
| `Sei Mainnet` | `sei` | `X402Networks.sei` | `eip155:1329` |
| `SKALE Base` | `skale-base` | `X402Networks.skaleBase` | `eip155:1187947933` |
| `KiteAI Mainnet` | `kiteai` | `X402Networks.kiteAI` | `eip155:2366` |
| `Arbitrum One` | `arbitrum` | `X402Networks.arbitrum` | `eip155:42161` |
| `Solana Devnet` | `solana-devnet` | `X402Networks.solanaDevnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia` | `base-sepolia` | `X402Networks.baseSepolia` | `eip155:84532` |
| `Avalanche Fuji` | `avalanche-fuji` | `X402Networks.avalancheFuji` | `eip155:43113` |
| `Polygon Amoy` | `polygon-amoy` | `X402Networks.polygonAmoy` | `eip155:80002` |
| `xLayer Testnet` | `xlayer-testnet` | `X402Networks.xLayerTestnet` | `eip155:1952` |
| `Sei Testnet` | `sei-testnet` | `X402Networks.seiTestnet` | `eip155:713715` |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `X402Networks.skaleBaseSepolia` | `eip155:324705682` |
| `Arbitrum Sepolia` | `arbitrum-sepolia` | `X402Networks.arbitrumSepolia` | `eip155:421614` |

## Manual Integration Check

CI tests do not spend real funds. To verify an end-to-end x402 payment on Base
Sepolia, fund the private key with testnet USDC, provide a Base Sepolia RPC URL,
and call a real x402-protected endpoint with
`network: X402Networks.baseSepolia`. The SDK will read the endpoint's
`PAYMENT-REQUIRED` response, sign an EIP-3009 payment payload, retry the
request, and expose the settlement response in
`EndpointResult.paymentResponse`.

## CommonJS

```js
const { X402Client, x402tool } = require("@averyso/alpha");
```
