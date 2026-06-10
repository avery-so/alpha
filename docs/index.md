# Alpha

`@averyso/alpha` is a Node-only TypeScript SDK for calling Alpha services and
x402-protected paid endpoints from TypeScript.

Use it when your application needs to:

- call paid HTTP endpoints with EVM or Solana credentials and x402 payment flow;
- cap payment exposure with `maxAmount`;
- expose paid endpoints as Vercel AI SDK-compatible tools;
- check basic Alpha service status through the lightweight `AlphaClient`.

## Install

```sh
pnpm add @averyso/alpha
```

## Quick Start

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const result = await client.call("https://api.example.com/weather", {
  query: { city: "San Francisco" },
});

if (result.kind === "success") {
  console.log(result.body);
}
```

Real integrations require an x402-protected endpoint, credentials for the
selected network, an RPC URL when required, and enough testnet or mainnet funds
for that network. EVM networks use a 32-byte hex private key; Solana networks
use a base58-encoded 64-byte Solana secret key.

## Next Steps

- [Getting Started](/guide/getting-started)
- [Build an x402 AI Tool](/tutorial/x402-ai-tool)
- [API Reference](/api/sdk)
- [Releases](/releases/)
