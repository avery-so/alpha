# Next.js App Router Quickstart

Build a minimal Next.js App Router streaming chat where the model can call a
paid x402 endpoint through Avery SDK's `x402tool()`. This guide covers the buyer
side only: you bring the x402-protected endpoint, payment credentials, RPC URL
when required, and Vercel AI Gateway configuration.

Avery SDK does not configure the provider facilitator or settlement path. The
paid endpoint owner controls how the endpoint advertises x402 requirements and
settles payment.

## Prerequisites

- Node.js `>=20.19.0` and pnpm.
- A Vercel AI Gateway API key.
- An x402-protected endpoint that the chat model is allowed to call.
- `X402_PRIVATE_KEY`, `X402_RPC_URL` when the selected network requires one,
  and enough balance for the network and asset required by the endpoint.

The example below uses `X402Networks.baseSepolia`. Change the network, RPC URL,
asset funding, and payment caps to match the endpoint you are calling.

## Create Application

Create a new Next.js app:

```sh
pnpm create next-app@latest my-avery-x402-chat
```

When prompted, choose App Router, TypeScript, and Tailwind CSS. Then move into
the app directory:

```sh
cd my-avery-x402-chat
```

## Install Dependencies

Install the AI SDK packages and Avery SDK:

```sh
pnpm add ai @ai-sdk/react @averyso/alpha
```

This guide uses `jsonSchema` from `ai`, so no separate schema library is
required.

## Configure Environment

Create `.env.local` in the app root:

```sh
AI_GATEWAY_API_KEY=...
AI_MODEL=provider/model-name
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://...
X402_PAID_WEATHER_ENDPOINT=https://...
```

Use placeholder values only in examples and repositories. Keep
`X402_PRIVATE_KEY`, RPC URLs, and payment signing on the server. The AI SDK
uses `AI_GATEWAY_API_KEY` automatically for Vercel AI Gateway when you pass a
Gateway model string.

## Create Route Handler

Create `app/api/chat/route.ts`:

```ts
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

export const runtime = "nodejs";

type ChatRequest = {
  messages: UIMessage[];
};

type WeatherInput = {
  city: string;
};

type WeatherOutput =
  | { ok: true; weather: unknown }
  | { ok: false; reason: string };

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

const paidWeather = x402tool<WeatherInput, WeatherOutput>({
  client,
  title: "Paid weather",
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      city: { type: "string" },
    },
    required: ["city"],
    additionalProperties: false,
  }),
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  execute: ({ endpoint }) => {
    if (endpoint.kind === "success") {
      return { ok: true, weather: endpoint.body };
    }

    return { ok: false, reason: endpoint.kind };
  },
});

export async function POST(req: Request) {
  const { messages }: ChatRequest = await req.json();

  const result = streamText({
    model: process.env.AI_MODEL!,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(3),
    tools: {
      paidWeather,
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Avery SDK is Node-only, so the route exports `runtime = "nodejs"`. `execute`
receives the `EndpointResult` from `X402Client.call()`. The example returns only
`{ ok, weather }` or `{ ok, reason }`, which keeps payment details, headers, and
the full HTTP result out of the model-visible tool output.

## Wire Up UI

Replace `app/page.tsx` with a small client component:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-6 py-10">
      <div className="flex flex-1 flex-col gap-4">
        {messages.map((message) => (
          <div key={message.id} className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold uppercase text-zinc-500">
              {message.role}
            </div>

            <div className="space-y-2 whitespace-pre-wrap">
              {message.parts.map((part, index) => {
                switch (part.type) {
                  case "text":
                    return <div key={index}>{part.text}</div>;
                  case "tool-paidWeather":
                    return (
                      <pre
                        key={index}
                        className="overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-50"
                      >
                        {JSON.stringify(part, null, 2)}
                      </pre>
                    );
                  default:
                    return null;
                }
              })}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();

          if (!input.trim()) {
            return;
          }

          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border px-3 py-2"
          value={input}
          placeholder="Ask about paid weather data..."
          onChange={(event) => setInput(event.currentTarget.value)}
        />
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Send
        </button>
      </form>
    </main>
  );
}
```

Tool parts are named `tool-{toolName}` by the AI SDK. Since the route handler
uses `tools: { paidWeather }`, the UI renders `tool-paidWeather` as JSON so you
can inspect the tool call and tool result while developing.

## Run Application

Start the app:

```sh
pnpm run dev
```

Open `http://localhost:3000` and try:

```text
What is the weather in Lisbon?
```

The model can decide to call `paidWeather`; Avery SDK signs and pays the x402
request on the server, subject to the client and tool `maxAmount` caps.

## Where Next

- Read [Concepts](/guide/concepts) for the x402 payment lifecycle and
  `EndpointResult.kind` values.
- Configure credentials with [Wallets and Networks](/guide/wallets-and-networks).
- Add server-side budgets from [Agent Spend Controls](/guide/agent-spend-controls).
- Shape failures with [Error Handling](/guide/error-handling).
- Build a more complete tool with
  [Build an Agent Payment Tool](/tutorial/x402-ai-tool).
