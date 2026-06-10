# Alpha

Alpha is the best Agent Payment SDK for the AI Agent era, published as
`@averyso/alpha`.

Use it to:

- turn paid x402 endpoints into Vercel AI SDK-compatible tools with
  `x402tool()`;
- call pay-per-request x402 HTTP resources directly with `X402Client.call()`;
- cap payment exposure per client, call, or tool with `maxAmount`;
- keep EVM and Solana credentials, RPC URLs, and payment signing on the server;
- check Alpha service status with the lightweight `AlphaClient`.

## Install

```sh
pnpm add @averyso/alpha
```

## Agent Payment Quick Start

Create a capped tool that an AI agent can call through the Vercel AI SDK:

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

For the default `GET` method, `x402tool()` maps plain object input to query
parameters. The example above turns `{ city: "San Francisco" }` into a paid
x402 request capped at `50_000n` atomic units.

## Direct x402 Calls

Use `X402Client.call()` when your application controls the request directly and
wants to branch on the returned `EndpointResult`.

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "San Francisco" } },
  { maxAmount: 50_000n },
);

if (result.kind === "success") {
  console.log(result.body);
}
```

`network` accepts `X402Networks` constants, friendly names such as
`"Base Sepolia"`, primary slugs such as `"base-sepolia"`, and raw CAIP-2
strings such as `"eip155:84532"`. `client.network` always returns normalized
CAIP-2.

EVM networks require a 32-byte hex private key, with or without a `0x` prefix.
Solana networks require a base58-encoded 64-byte Solana secret key. Keep
private keys and RPC URLs on the server.

See the [Getting Started guide](./docs/guide/getting-started.md), the
[x402 AI Tool tutorial](./docs/tutorial/x402-ai-tool.md), and the
[SDK API reference](./docs/api/sdk.md) for the full network table and API
details.

## Alpha Status

```ts
import { AlphaClient } from "@averyso/alpha";

const client = new AlphaClient({ apiKey: process.env.ALPHA_API_KEY });
const status = await client.getStatus();

console.log(status.ok);
```

## CommonJS

```js
const { AlphaClient, X402Client, x402tool } = require("@averyso/alpha");
```

## Development

```sh
pnpm install
pnpm verify
pnpm docs:build
```

`pnpm verify` is the local and CI quality gate. It runs linting, formatting
checks, type checking, SDK coverage tests with 90% thresholds, package builds,
and the SDK package dry run.

Development uses Node 24 (see `.nvmrc`); the minimum supported runtime is Node
20.19.0 (see the `engines` field). CI runs the quality gate against both.

Commit messages follow
[Conventional Commits](https://www.conventionalcommits.org) and are enforced by
a `commit-msg` hook (commitlint).

## Deployment

Cloudflare Pages uses `docs` as the root directory. The build command is
`npx vitepress build`, and the build output directory is `.vitepress/dist`.
The Pages build Node version is pinned by `docs/.nvmrc`.

## Packages

- `packages/sdk`: Node-only TypeScript SDK.
- `docs`: VitePress documentation site.
