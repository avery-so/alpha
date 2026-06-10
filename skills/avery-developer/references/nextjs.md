# Next.js App Router Quickstart

A minimal Next.js App Router streaming chat where the model can call a paid x402 endpoint through `x402tool()`. This is the buyer side only: you bring the x402-protected endpoint, payment credentials, RPC URL (when the network needs one), and an AI model/provider config. Avery SDK does not configure the provider's facilitator or settlement path.

## Install

```sh
pnpm create next-app@latest my-avery-x402-chat   # App Router + TypeScript
cd my-avery-x402-chat
pnpm add ai @ai-sdk/react @averyso/alpha
```

## Environment (`.env.local`)

```sh
AI_GATEWAY_API_KEY=...           # if using Vercel AI Gateway
AI_MODEL=provider/model-name
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://...
X402_PAID_WEATHER_ENDPOINT=https://...
```

Keep `X402_PRIVATE_KEY`, RPC URLs, and payment signing on the server. The AI SDK uses `AI_GATEWAY_API_KEY` automatically when you pass a Gateway model string.

## Route handler — `app/api/chat/route.ts`

```ts
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

export const runtime = "nodejs"; // Avery SDK is Node-only; never the edge runtime

type ChatRequest = { messages: UIMessage[] };
type WeatherInput = { city: string };
type WeatherOutput = { ok: true; weather: unknown } | { ok: false; reason: string };

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
    properties: { city: { type: "string" } },
    required: ["city"],
    additionalProperties: false,
  }),
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  execute: ({ endpoint }) => {
    if (endpoint.kind === "success") return { ok: true, weather: endpoint.body };
    return { ok: false, reason: endpoint.kind };
  },
});

export async function POST(req: Request) {
  const { messages }: ChatRequest = await req.json();

  const result = streamText({
    model: process.env.AI_MODEL!,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(3), // bound the agent loop
    tools: { paidWeather },
  });

  return result.toUIMessageStreamResponse();
}
```

`execute` returns only `{ ok, weather }` or `{ ok, reason }`, keeping payment details, headers, and the full HTTP result out of model-visible tool output.

## Client UI — `app/page.tsx`

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
                  case "tool-paidWeather": // tool parts are named tool-{toolName}
                    return (
                      <pre key={index} className="overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-50">
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
          if (!input.trim()) return;
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

Tool result parts are named `tool-{toolName}` by the AI SDK; with `tools: { paidWeather }` the UI renders `tool-paidWeather`.

## Run

```sh
pnpm run dev
```

Open `http://localhost:3000` and try `What is the weather in Lisbon?`. The model may call `paidWeather`; the SDK signs and pays the x402 request on the server, bounded by the client and tool `maxAmount` caps. Add server-side budgets and loop limits before production — see `spend-controls.md`.
