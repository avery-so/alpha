# Next.js AI SDK x402 Exa Search

This example shows a Next.js App Router chat app that uses the workspace
`@averyso/alpha` SDK to pay for Exa x402 Search from an AI SDK tool.

## Setup

Create `example/nextjs-ai-x402-exa/.env.local`:

```sh
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
X402_PRIVATE_KEY=0xyour_base_wallet_private_key
X402_RPC_URL=https://mainnet.base.org
X402_MAX_AMOUNT=7000
AI_MODEL=anthropic/claude-sonnet-4.5
```

`X402_PRIVATE_KEY` and `X402_RPC_URL` are read only from the server-side chat
route. Do not expose funded wallet keys through `NEXT_PUBLIC_*` variables.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter @averyso/example-nextjs-ai-x402-exa dev
```

Open `http://localhost:3000` and ask a question that needs web search context.

## Scripts

```sh
pnpm --filter @averyso/example-nextjs-ai-x402-exa typecheck
pnpm --filter @averyso/example-nextjs-ai-x402-exa build
```

The root workspace also includes this example in `pnpm typecheck`,
`pnpm build`, and `pnpm verify`.
