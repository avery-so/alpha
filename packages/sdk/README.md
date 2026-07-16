# @averyso/alpha

Avery SDK is a TypeScript SDK for building capped x402 payment tools, direct
x402 clients, and server-side WeiXinAI Pay and Alipay AI pay-per-use flows for
AI agents.

Use `@averyso/alpha` to turn x402-protected paid HTTP endpoints into safe,
capped, model-callable tools for server-side AI agents. The same SDK also gives
you a direct lower-level `X402Client.call()` path for application-controlled
requests.

Product pillars:

- Agent-native tools for the Vercel AI SDK with `x402tool()`.
- Mastra-compatible tools with `x402MastraTool()`.
- Pay-per-request x402 HTTP access with `X402Client`.
- WeiXinAI Pay preorder request signing with `WeiXinAIPayClient`.
- Alipay AI pay-per-use (AI按量付费) merchant flows with `AlipayAIPayClient`.
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

## WeiXinAI Pay Preorder

Use `WeiXinAIPayClient` to create and send WeiXinAI Pay preorder requests from
your server. The SDK builds the `payment_required` Base64 JSON payload, signs
the WeiXinAI preorder string with SM2 over the SM3 digest, and posts the JSON
body to the WeiXinAI Pay preorder endpoint.

```ts
import { WeiXinAIPayClient } from "@averyso/alpha";

const client = new WeiXinAIPayClient({
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
});

const preorder = await client.preorder({
  appid: "wx-miniapp",
  mchid: "1900000109",
  out_trade_no: "order-1001",
  description: "AI agent request",
  amount: {
    total: 100,
    currency: "CNY",
  },
});

console.log(preorder.paymentCode);
```

`privateKey` must be a 32-byte SM2 private key encoded as hex, with or without
the `0x` prefix. The default endpoint is
`https://payapp.weixin.qq.com/palmpayminiapp/clawagentpay/preorder`, and
`developer_platform` defaults to `"WXPAY"`. Signatures are DER-encoded by
default; set `signatureEncoding: "raw"` to emit raw `r || s` signatures.

## Alipay AI Pay-Per-Use

Use `AlipayAIPayClient` to run the merchant side of Alipay AI pay-per-use
(AI按量付费): build the signed `Payment-Needed` bill for `402 Payment
Required` responses, verify `Payment-Proof` credentials through
`alipay.aipay.agent.payment.verify`, and confirm fulfillment through
`alipay.aipay.agent.fulfillment.confirm`.

```ts
import { AlipayAIPayClient } from "@averyso/alpha";

const alipay = new AlipayAIPayClient({
  appId: process.env.ALIPAY_APP_ID!,
  privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
});

// 402 response bill
const { header } = alipay.buildPaymentNeededHeader({
  outTradeNo: "ORDER_1739836600000_abc123",
  amount: "0.01",
  resourceId: "/market/antgroup/trend",
  payBefore: "2026-03-25T12:00:00+08:00",
  sellerId: "2088123456789012",
  sellerName: "Demo Seller",
  goodsName: "AI content",
  serviceId: "service_ai_content_001",
});

// paid retry
const proof = alipay.parsePaymentProofHeader(paymentProofHeader);
const verification = await alipay.verifyPayment(proof, {
  expect: { amount: "0.01", resourceId: "/market/antgroup/trend" },
});

if (verification.verified) {
  await alipay.confirmFulfillment(verification.tradeNo);
}
```

`privateKey` is the Alipay application RSA private key (PEM or the bare Base64
key body from the Alipay console). Bills and gateway requests are signed with
RSA2 (SHA256withRSA); configure `alipayPublicKey` to also verify gateway
response signatures. `verifyPayment` marks the result `verified` only when the
credential is `active` and every `expect` field matches. Pass `appAuthToken`
to call on behalf of a merchant as a third-party application.

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

## Mastra Tools

Use `x402MastraTool()` when a Mastra agent should call a paid x402 endpoint.
The helper returns a Mastra `createTool()`-compatible object without importing
`@mastra/core` at runtime.

Install Mastra and your schema library in the application that owns the agent
runtime, for example `pnpm add @mastra/core zod`.

```ts
import { z } from "zod";
import { X402Client, X402Networks, x402MastraTool } from "@averyso/alpha";

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const paidWeatherTool = x402MastraTool({
  id: "paid-weather",
  client: x402,
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: z.object({
    city: z.string(),
  }),
  endpoint: "https://api.example.com/weather",
  maxAmount: 50_000n,
  execute: ({ endpoint }) => ({
    ok: endpoint.ok,
    weather: endpoint.ok ? endpoint.body : null,
  }),
});
```

Register it on a Mastra agent with the `tools` property:

```ts
tools: {
  paidWeather: paidWeatherTool,
}
```

Mastra stream `toolName` values come from the object key, not the tool `id`.
`x402MastraTool()` passes Mastra fields such as `requireApproval`,
`toModelOutput`, `transform`, and `mcp` through to Mastra.

## Direct x402 Calls

Use `X402Client.call()` when your application directly controls the request and
wants to branch on `EndpointResult.kind`. `X402Client` wraps the x402 payment
flow for paid HTTP resources. It supports EVM `exact` payments on `eip155:*`
networks and Solana `exact` payments on Solana Mainnet and Devnet.

```ts
import { X402Client, X402Networks, type EndpointResult } from "@averyso/alpha";

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

| Friendly Name        | Primary Slug         | Constant                        | CAIP-2                                    |
| -------------------- | -------------------- | ------------------------------- | ----------------------------------------- |
| `Solana Mainnet`     | `solana`             | `X402Networks.solana`           | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet`       | `base`               | `X402Networks.base`             | `eip155:8453`                             |
| `Polygon Mainnet`    | `polygon`            | `X402Networks.polygon`          | `eip155:137`                              |
| `xLayer Mainnet`     | `xlayer`             | `X402Networks.xLayer`           | `eip155:196`                              |
| `Peaq Mainnet`       | `peaq`               | `X402Networks.peaq`             | `eip155:3338`                             |
| `Sei Mainnet`        | `sei`                | `X402Networks.sei`              | `eip155:1329`                             |
| `SKALE Base`         | `skale-base`         | `X402Networks.skaleBase`        | `eip155:1187947933`                       |
| `KiteAI Mainnet`     | `kiteai`             | `X402Networks.kiteAI`           | `eip155:2366`                             |
| `Arbitrum One`       | `arbitrum`           | `X402Networks.arbitrum`         | `eip155:42161`                            |
| `Solana Devnet`      | `solana-devnet`      | `X402Networks.solanaDevnet`     | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia`       | `base-sepolia`       | `X402Networks.baseSepolia`      | `eip155:84532`                            |
| `Avalanche Fuji`     | `avalanche-fuji`     | `X402Networks.avalancheFuji`    | `eip155:43113`                            |
| `Polygon Amoy`       | `polygon-amoy`       | `X402Networks.polygonAmoy`      | `eip155:80002`                            |
| `xLayer Testnet`     | `xlayer-testnet`     | `X402Networks.xLayerTestnet`    | `eip155:1952`                             |
| `Sei Testnet`        | `sei-testnet`        | `X402Networks.seiTestnet`       | `eip155:713715`                           |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `X402Networks.skaleBaseSepolia` | `eip155:324705682`                        |
| `Arbitrum Sepolia`   | `arbitrum-sepolia`   | `X402Networks.arbitrumSepolia`  | `eip155:421614`                           |

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
const {
  AlipayAIPayClient,
  WeiXinAIPayClient,
  X402Client,
  x402MastraTool,
  x402tool,
} = require("@averyso/alpha");
```
