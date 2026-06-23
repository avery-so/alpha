# Next.js AI SDK DeepSeek x402 Base Sepolia Paid Content

This example shows a Next.js App Router chat app that uses the workspace
`@averyso/alpha` SDK to pay for a Base Sepolia x402 paid-content endpoint from
an AI SDK tool. It calls DeepSeek directly through `@ai-sdk/deepseek`; it does
not use Vercel AI Gateway.

The chat route exposes one tool named `readPaidContent`. The tool uses
`X402Client.call()` against:

```txt
https://x402.payai.network/api/base-sepolia/paid-content
```

The x402 network is fixed to Base Sepolia (`eip155:84532`). The default
`X402_MAX_AMOUNT` is `10000` atomic units, which matches the current tutorial
requirement for a `0.01` Base Sepolia USDC test payment.

## Setup

Create `example/nextjs-ai-x402-base-sepolia-paid-content/.env.local`:

```sh
DEEPSEEK_API_KEY=your_deepseek_api_key
AI_MODEL=deepseek-v4-flash
X402_PRIVATE_KEY=0xyour_base_sepolia_wallet_private_key
X402_RPC_URL=https://sepolia.base.org
X402_PAID_CONTENT_ENDPOINT=https://x402.payai.network/api/base-sepolia/paid-content
X402_MAX_AMOUNT=10000
```

`DEEPSEEK_API_KEY` is required by the server-side AI SDK route.
`X402_PRIVATE_KEY` must be a Base Sepolia EVM wallet private key with ETH for
gas and enough Base Sepolia USDC for the paid endpoint. Keep this key on the
server only. Do not expose it through `NEXT_PUBLIC_*` variables or browser
code.

`X402_RPC_URL` defaults to the public Base Sepolia RPC shown above, but you can
replace it with your own RPC provider. `AI_MODEL` defaults to
`deepseek-v4-flash`.

If the paid endpoint changes its payment requirements, inspect the live `402
Payment Required` response before changing the max amount:

```sh
curl -i https://x402.payai.network/api/base-sepolia/paid-content
```

Then set `X402_MAX_AMOUNT` to a positive integer in atomic units that covers
the current requirement.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter @averyso/example-nextjs-ai-x402-base-sepolia-paid-content dev
```

This example uses pnpm workspace links for the local `@averyso/alpha` SDK. Run
it with `pnpm`, not `npm`; the `dev`, `build`, and `typecheck` scripts build
the workspace SDK before starting Next.js so the package export files exist.

Open `http://localhost:3000` and send:

```txt
Call readPaidContent once and summarize the paid response.
```

Expected result:

- DeepSeek calls the `readPaidContent` tool.
- Server logs show the Base Sepolia endpoint, network, max amount, and status.
- The UI renders a succeeded `readPaidContent` tool result with the returned
  JSON body.
- No private key, payment header, DeepSeek API key, or full payment metadata is
  printed.

## Scripts

```sh
pnpm --filter @averyso/example-nextjs-ai-x402-base-sepolia-paid-content typecheck
pnpm --filter @averyso/example-nextjs-ai-x402-base-sepolia-paid-content build
```

The root workspace also includes this example in `pnpm typecheck`,
`pnpm build`, and `pnpm verify`.
