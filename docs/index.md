# Alpha

`@averyso/alpha` is a Node-only TypeScript SDK for calling Alpha services and
x402-protected paid endpoints from TypeScript.

Use it when your application needs to:

- call paid HTTP endpoints with an EVM private key and x402 payment flow;
- cap payment exposure with `maxAmount`;
- expose paid endpoints as Vercel AI SDK-compatible tools;
- check basic Alpha service status through the lightweight `AlphaClient`.

## Install

```sh
pnpm add @averyso/alpha
```

## Quick Start

```ts
import { X402Client } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "eip155:84532",
  rpcUrl: process.env.X402_RPC_URL,
});

const result = await client.call("https://api.example.com/weather", {
  query: { city: "San Francisco" },
});

if (result.kind === "success") {
  console.log(result.body);
}
```

Real integrations require an x402-protected endpoint, a 32-byte EVM private
key, an RPC URL for the target chain when required, and enough testnet or
mainnet funds for the selected network.

## Next Steps

- [Getting Started](/guide/getting-started)
- [Build an x402 AI Tool](/tutorial/x402-ai-tool)
- [API Reference](/api/sdk)
- [Releases](/releases/)
