# Next.js App Router 快速开始

本指南会构建一个最小 Next.js App Router streaming chat，让模型通过 Avery SDK 的
`x402tool()` 调用一个付费 x402 endpoint。这里仅覆盖 buyer/client-side SDK 用法：
你需要自备 x402-protected endpoint、支付凭证、必要时的 RPC URL，以及 Vercel AI
Gateway 配置。

Avery SDK 不配置 provider facilitator 或结算路径。付费 endpoint 的 owner 负责
声明 x402 支付要求，并控制实际结算方式。

## 前置条件

- Node.js `>=20.19.0` 和 pnpm。
- Vercel AI Gateway API key。
- 一个允许聊天模型调用的 x402-protected endpoint。
- `X402_PRIVATE_KEY`、所选网络需要时的 `X402_RPC_URL`，以及匹配 endpoint 支付
  要求的网络、资产与余额。

下面示例使用 `X402Networks.baseSepolia`。请根据你要调用的 endpoint 调整网络、
RPC URL、资产余额和支付上限。

## 创建应用

创建新的 Next.js 应用：

```sh
pnpm create next-app@latest my-avery-x402-chat
```

命令提示时，选择 App Router、TypeScript 和 Tailwind CSS。然后进入应用目录：

```sh
cd my-avery-x402-chat
```

## 安装依赖

安装 AI SDK 包和 Avery SDK：

```sh
pnpm add ai @ai-sdk/react @averyso/alpha
```

本指南使用 `ai` 包提供的 `jsonSchema`，不需要额外引入 schema library。

## 配置环境变量

在应用根目录创建 `.env.local`：

```sh
AI_GATEWAY_API_KEY=...
AI_MODEL=provider/model-name
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://...
X402_PAID_WEATHER_ENDPOINT=https://...
```

示例和仓库中只应使用占位值。`X402_PRIVATE_KEY`、RPC URL 和支付签名流程都必须保留
在服务端。当你传入 Gateway model string 时，AI SDK 会自动使用
`AI_GATEWAY_API_KEY` 访问 Vercel AI Gateway。

## 创建 Route Handler

创建 `app/api/chat/route.ts`：

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

Avery SDK 是 Node-only，因此 route 显式导出 `runtime = "nodejs"`。`execute`
会收到 `X402Client.call()` 返回的 `EndpointResult`。示例只返回 `{ ok, weather }`
或 `{ ok, reason }`，避免把 payment 细节、headers 和完整 HTTP 结果直接暴露给模型。

## 接入 UI

将 `app/page.tsx` 替换为一个小的 client component：

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

AI SDK 的 tool part 名称是 `tool-{toolName}`。由于 Route Handler 中使用
`tools: { paidWeather }`，UI 会把 `tool-paidWeather` 以 JSON 形式渲染出来，方便
开发时查看 tool call 和 tool result。

## 运行应用

启动应用：

```sh
pnpm run dev
```

打开 `http://localhost:3000`，输入：

```text
What is the weather in Lisbon?
```

模型可以自行决定是否调用 `paidWeather`；Avery SDK 会在服务端签名并支付 x402
请求，同时受 client 和 tool 层 `maxAmount` 上限约束。

## 下一步

- 阅读 [核心概念](/zh/guide/concepts)，了解 x402 支付生命周期和
  `EndpointResult.kind`。
- 通过 [钱包与网络](/zh/guide/wallets-and-networks) 配置凭证。
- 使用 [Agent Spend Controls](/guide/agent-spend-controls) 增加服务端预算控制。
- 通过 [错误处理](/zh/guide/error-handling) 设计失败输出。
- 阅读 [构建 Agent 支付工具](/zh/tutorial/x402-ai-tool)，构建更完整的 tool。
