# Base Sepolia Payment Test with Next.js

This tutorial builds a fresh Next.js App Router chat app that uses Vercel AI
Gateway, a MetaMask test wallet, Base Sepolia testnet ETH and USDC, and Avery
SDK's `X402Client.call()` to run one end-to-end x402 payment test.

The test endpoint is:

```text
https://x402.payai.network/api/base-sepolia/paid-content
```

As of this tutorial, its `402 Payment Required` response requires:

- Network: Base Sepolia, `eip155:84532`.
- Asset: Base Sepolia USDC, `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Amount: `10000` atomic units, which is `0.01` testnet USDC.

The test service refunds completed payments after the request succeeds. The
endpoint can change its payment requirements later, so if a payment fails,
inspect the current `402` response before changing application code.

## Prerequisites

- Node.js and pnpm. Use the current Node version required by your Next.js
  project.
- MetaMask browser extension.
- A brand-new MetaMask test wallet. Do not use your main wallet.
- A Vercel AI Gateway API key.
- A Base Sepolia RPC URL. This tutorial uses the public RPC URL
  `https://sepolia.base.org` for local testing.
- Base Sepolia ETH for gas and Base Sepolia USDC for the paid endpoint.

## Create a Next.js App

Create a new app outside this repository:

```sh
pnpm create next-app@latest my-avery-x402-payment-test
```

When prompted, choose TypeScript, App Router, and Tailwind CSS. Then move into
the app directory:

```sh
cd my-avery-x402-payment-test
```

This tutorial intentionally creates an independent app instead of reusing the
workspace examples, so the setup matches a first-time end-to-end integration.

## Install Dependencies

Install the AI SDK packages, Avery SDK, and Zod:

```sh
pnpm add ai @ai-sdk/react @averyso/alpha zod
```

`ai` provides `streamText()`, `tool()`, and model message conversion.
`@ai-sdk/react` provides `useChat()`. `@averyso/alpha` signs and pays the x402
request. `zod` defines the tool input schema.

## Configure Vercel AI Gateway

In the Vercel Dashboard, create an AI Gateway API key and copy it into your
local `.env.local` as `AI_GATEWAY_API_KEY`. With AI SDK v5/v6, Vercel AI
Gateway can be called by passing a Gateway model id string such as
`anthropic/claude-sonnet-4.5` to `streamText()`.

If your project or team does not have access to that model id, choose another
available Gateway model id from the Vercel AI Gateway model list and use it as
`AI_MODEL`.

## Create and Configure a MetaMask Test Wallet

Create a new MetaMask wallet or a new account dedicated only to this tutorial.
Do not use a wallet that holds mainnet funds.

Add Base Sepolia manually in MetaMask with the official Base parameters:

| Field           | Value                               |
| --------------- | ----------------------------------- |
| Network name    | `Base Sepolia`                      |
| RPC URL         | `https://sepolia.base.org`          |
| Chain ID        | `84532`                             |
| Currency symbol | `ETH`                               |
| Block explorer  | `https://sepolia-explorer.base.org` |

After saving the network, switch MetaMask to Base Sepolia and copy the account
address. You will use this address for faucets.

## Fund Test Tokens

You need two balances on the same Base Sepolia address:

- Base Sepolia ETH for gas.
- Base Sepolia USDC for the x402 payment.

Start with the Coinbase Developer Platform Faucet. The CDP Faucet supports Base
Sepolia testnet assets, including ETH and USDC, subject to the current faucet
limits. If the CDP Faucet is unavailable or rate-limited, Circle Faucet can be a
backup source for test stablecoins. Faucet availability, limits, supported
networks, and account requirements can change, so follow the current official
faucet pages.

The paid endpoint currently charges `0.01` testnet USDC, but request more than
one payment worth so you can retry failed local tests.

## Export the Private Key

MetaMask Extension flow:

1. Open MetaMask and select the tutorial test account.
2. Open the account selector.
3. Click the three-dot menu next to the account.
4. Select `Account details`.
5. Select `Private key`, enter your MetaMask password, and reveal the key.
6. Copy the private key for `.env.local`.

Only export the private key for the new test wallet. Do not screenshot it. Do
not commit it. Do not paste it into a model prompt, browser console, analytics
event, or error reporting service.

The private key must only live in `.env.local` and in server-side code paths
such as a Next.js Route Handler. Never use a `NEXT_PUBLIC_*` prefix for
`X402_PRIVATE_KEY`, and never send it to the browser.

## Configure `.env.local`

Create `.env.local` in the app root:

```sh
AI_GATEWAY_API_KEY=...
AI_MODEL=anthropic/claude-sonnet-4.5
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://sepolia.base.org
X402_PAID_CONTENT_ENDPOINT=https://x402.payai.network/api/base-sepolia/paid-content
X402_MAX_AMOUNT=10000
```

`X402_MAX_AMOUNT` is in atomic units. For USDC, `10000` means `0.01` USDC
because USDC has 6 decimals.

## Build the Server Route

Create `app/api/chat/route.ts`:

```ts
import { X402Client, X402Networks } from "@averyso/alpha";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

type ChatRequest = {
  messages: UIMessage[];
};

type PaidContentOutput =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: string; status: number };

const network = X402Networks.baseSepolia;
const defaultModel = "anthropic/claude-sonnet-4.5";
const defaultEndpointUrl = "https://x402.payai.network/api/base-sepolia/paid-content";
const defaultMaxAmount = 10000n;

const readPaidContentInputSchema = z.object({
  reason: z.string().optional().describe("Why the assistant is reading the paid content."),
});

export async function POST(request: Request) {
  const { messages }: ChatRequest = await request.json();

  const result = streamText({
    model: process.env.AI_MODEL ?? defaultModel,
    system:
      "You are a concise assistant. When the user asks to test x402 paid content, call readPaidContent exactly once and summarize the result. Never ask for or reveal private keys.",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(4),
    tools: {
      readPaidContent: tool({
        description:
          "Read the Base Sepolia x402 paid content test endpoint and return the paid response.",
        inputSchema: readPaidContentInputSchema,
        async execute(_input, options): Promise<PaidContentOutput> {
          const endpointUrl = getEndpointUrl();
          const maxAmount = parseMaxAmount(process.env.X402_MAX_AMOUNT);
          const client = createX402Client(maxAmount);

          console.info("Calling Base Sepolia x402 paid content endpoint.", {
            network,
            endpointUrl,
            maxAmount: maxAmount.toString(),
          });

          const endpoint = await client.call(
            endpointUrl,
            {
              method: "GET",
            },
            {
              signal: options.abortSignal,
              maxAmount,
              throwOnError: false,
            },
          );

          if (endpoint.kind !== "success") {
            console.warn("Base Sepolia x402 paid content request failed.", {
              kind: endpoint.kind,
              status: endpoint.status,
            });

            return {
              ok: false,
              reason: endpoint.kind,
              status: endpoint.status,
            };
          }

          console.info("Base Sepolia x402 paid content request succeeded.", {
            status: endpoint.status,
          });

          return {
            ok: true,
            status: endpoint.status,
            body: endpoint.body,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

function createX402Client(maxAmount: bigint) {
  return new X402Client(getRequiredEnv("X402_PRIVATE_KEY"), {
    network,
    rpcUrl: getOptionalEnv("X402_RPC_URL"),
    maxAmount,
  });
}

function getEndpointUrl() {
  return getOptionalEnv("X402_PAID_CONTENT_ENDPOINT") ?? defaultEndpointUrl;
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value || undefined;
}

function parseMaxAmount(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return defaultMaxAmount;
  }

  try {
    const amount = BigInt(value);

    if (amount <= 0n) {
      throw new Error("Amount must be greater than zero.");
    }

    return amount;
  } catch (cause) {
    throw new Error("X402_MAX_AMOUNT must be a positive integer in atomic units.", {
      cause,
    });
  }
}
```

Important details:

- `runtime = "nodejs"` is required because Avery SDK is Node-only.
- The network is fixed to `X402Networks.baseSepolia`, so a mistyped network env
  var cannot move this tutorial to the wrong chain.
- `X402Client.call()` is used directly so the AI SDK tool can pass
  `options.abortSignal` into the paid HTTP request.
- The tool returns only `{ ok, status, body }` or `{ ok, reason, status }` to
  the model and UI. It does not expose private keys, payment headers, or the
  full HTTP result.
- Logs include the endpoint, network, max amount, failure kind, and HTTP status,
  while avoiding secrets.

## Build the Chat UI

Replace `app/page.tsx`:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { type FormEvent, useState } from "react";

type PaidContentOutput =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: string; status: number };

export default function Home() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (text.length === 0 || isBusy) {
      return;
    }

    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Base Sepolia x402 Payment Test</h1>
        <p className="text-sm text-zinc-600">
          Ask the assistant to call the paid content tool, then inspect the tool result.
        </p>
      </header>

      <section className="flex flex-1 flex-col gap-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
            Try: Use the paid content tool and summarize the result.
          </div>
        ) : (
          messages.map((message) => (
            <article className="rounded border border-zinc-200 p-4" key={message.id}>
              <div className="mb-3 text-xs font-semibold uppercase text-zinc-500">
                {message.role}
              </div>
              <div className="space-y-3 whitespace-pre-wrap">
                {message.parts.map((part, index) => (
                  <MessagePart key={`${message.id}-${index}`} part={part} />
                ))}
              </div>
            </article>
          ))
        )}
      </section>

      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          aria-label="Message"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2"
          disabled={isBusy}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="Use the paid content tool and summarize the result."
          value={input}
        />
        <button
          className="rounded bg-zinc-950 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isBusy || input.trim().length === 0}
          type="submit"
        >
          {isBusy ? "Running" : "Send"}
        </button>
      </form>
    </main>
  );
}

function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return <div>{part.text}</div>;
  }

  if (part.type === "tool-readPaidContent") {
    return <PaidContentToolPart output={part.output as PaidContentOutput | undefined} />;
  }

  return null;
}

function PaidContentToolPart({ output }: { output: PaidContentOutput | undefined }) {
  if (output === undefined) {
    return (
      <aside className="rounded bg-zinc-100 p-3 text-sm text-zinc-700">
        readPaidContent is running.
      </aside>
    );
  }

  if (!output.ok) {
    return (
      <aside className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        readPaidContent failed with {output.reason} and status {output.status}.
      </aside>
    );
  }

  return (
    <aside className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
      <div className="mb-2 font-medium">readPaidContent succeeded with status {output.status}.</div>
      <pre className="overflow-auto rounded bg-white p-3 text-xs text-zinc-900">
        {JSON.stringify(output.body, null, 2)}
      </pre>
    </aside>
  );
}
```

The AI SDK names tool parts as `tool-{toolName}`. Because the server route uses
`tools: { readPaidContent }`, the UI renders `tool-readPaidContent` parts and
shows both running and completed states.

## Run a Transaction Test

Start the dev server:

```sh
pnpm run dev
```

Open `http://localhost:3000` and send:

```text
Use the paid content tool and summarize the result.
```

Expected flow:

1. The chat request reaches `app/api/chat/route.ts`.
2. AI SDK calls Vercel AI Gateway using `AI_GATEWAY_API_KEY` and `AI_MODEL`.
3. The model calls the `readPaidContent` tool.
4. The server route calls the Base Sepolia x402 endpoint with
   `X402Client.call()`.
5. Avery SDK signs the x402 payment using `X402_PRIVATE_KEY`.
6. The paid endpoint returns content, and the UI shows an `ok: true` tool
   result.

If the tool does not run, ask more directly: `Call readPaidContent now, then
summarize the paid response.`

## Inspect the Current Payment Requirements

If the endpoint starts failing, inspect its current `402` response:

```sh
curl -i https://x402.payai.network/api/base-sepolia/paid-content
```

Look for the JSON body and `payment-required` header. The current requirement
should match Base Sepolia `eip155:84532`, USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, and `amount: "10000"`.

## Troubleshooting

### AI Gateway key is missing

If the route returns an authentication error from Vercel AI Gateway, confirm
that `.env.local` contains `AI_GATEWAY_API_KEY` and restart `pnpm run dev`.
Environment changes are not always picked up by an already-running Next.js dev
server.

### Model id is unavailable

If `anthropic/claude-sonnet-4.5` is unavailable for your Vercel team, choose a
model id that your AI Gateway project can access and set `AI_MODEL` to that
value.

### The model does not call the tool

Use an explicit prompt: `Call readPaidContent exactly once and summarize the
result.` The route's system prompt encourages the tool call, but the model still
decides whether to invoke tools.

### `402` or `payment_required`

Confirm the endpoint still accepts Base Sepolia, USDC, and `10000` atomic units.
Run the `curl -i` command above and compare the live payment requirements with
your `X402_MAX_AMOUNT` and funded token balance.

### Insufficient USDC

Make sure the exported MetaMask account has Base Sepolia USDC at
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`. USDC on another chain, another
testnet, or another contract address will not satisfy this endpoint.

### Insufficient ETH for gas

The buyer signs an EIP-3009 authorization for USDC, but the wallet can still
need Base Sepolia ETH for network activity and retries. Fund the same account
with Base Sepolia ETH.

### Private key format is invalid

For Base Sepolia, use an EVM private key: a 32-byte hex string, with or without
`0x`. Do not paste the MetaMask seed phrase. Do not include whitespace or quotes
in `.env.local`.

### RPC URL is wrong

Use `X402_RPC_URL=https://sepolia.base.org` for this local test. If you replace
it with a custom RPC, make sure it serves Base Sepolia chain id `84532`.

### Payment cap is too low

`X402_MAX_AMOUNT` must be at least the endpoint amount in atomic units. For this
test, use `10000`. A lower value prevents the client from selecting the payment
requirement.

## Official References

- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Base Sepolia and MetaMask network settings:
  https://docs.base.org/base-chain/quickstart/connecting-to-base
- MetaMask private key export:
  https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/
- CDP Faucet:
  https://docs.cdp.coinbase.com/faucets/introduction/welcome
- Circle Faucet:
  https://faucet.circle.com/
- Coinbase x402 network support:
  https://docs.cdp.coinbase.com/x402/network-support
