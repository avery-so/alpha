# 使用 Next.js 测试 Base Sepolia 支付

本教程会从零创建一个独立的 Next.js App Router Chat 应用，使用 Vercel AI
Gateway、MetaMask 测试钱包、Base Sepolia 测试网 ETH 与 USDC，并通过 Avery SDK
的 `X402Client.call()` 完成一次端到端 x402 支付测试。

测试端点固定为：

```text
https://x402.payai.network/api/base-sepolia/paid-content
```

截至本教程编写时，该端点的 `402 Payment Required` 响应要求：

- 网络：Base Sepolia，`eip155:84532`。
- 资产：Base Sepolia USDC，`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。
- 金额：`10000` atomic units，也就是 `0.01` testnet USDC。

测试服务会在请求成功后退回已完成的支付。端点的支付要求未来可能变化，如果支付
失败，先检查当前 `402` response，再修改应用代码。

## 前置条件

- Node.js 和 pnpm。使用当前 Next.js 项目要求的 Node 版本。
- MetaMask 浏览器扩展。
- 一个全新的 MetaMask 测试钱包。不要使用你的主钱包。
- Vercel AI Gateway API key。
- Base Sepolia RPC URL。本教程本地测试使用公开 RPC
  `https://sepolia.base.org`。
- Base Sepolia ETH 用于 gas，Base Sepolia USDC 用于付费端点。

## 初始化本地项目

在仓库外创建一个新的应用：

```sh
pnpm create next-app@latest my-avery-x402-payment-test
```

根据命令提示选择 TypeScript、App Router 和 Tailwind CSS。然后进入项目目录：

```sh
cd my-avery-x402-payment-test
```

本教程故意不复用仓库里的 example，而是创建独立应用，这样更接近第一次端到端
接入的真实流程。

## 安装依赖

安装 AI SDK 包、Avery SDK 和 Zod：

```sh
pnpm add ai @ai-sdk/react @averyso/alpha zod
```

`ai` 提供 `streamText()`、`tool()` 和 model message 转换。
`@ai-sdk/react` 提供 `useChat()`。`@averyso/alpha` 负责签名并支付 x402 请求。
`zod` 用来定义 tool input schema。

## 配置 Vercel AI Gateway

在 Vercel Dashboard 创建一个 AI Gateway API key，并把它写入本地 `.env.local`
的 `AI_GATEWAY_API_KEY`。在 AI SDK v5/v6 中，可以把 Vercel AI Gateway model id
字符串（例如 `anthropic/claude-sonnet-4.5`）直接传给 `streamText()`。

如果你的项目或团队无法访问该 model id，请在 Vercel AI Gateway model list 中选择
一个可用的 Gateway model id，并把它设置为 `AI_MODEL`。

## 创建测试钱包并配置网络

创建一个新的 MetaMask 钱包，或者创建一个只用于本教程的新账户。不要使用持有
mainnet 资产的钱包。

在 MetaMask 中手动添加 Base Sepolia，使用 Base 官方参数：

| 字段            | 值                                  |
| --------------- | ----------------------------------- |
| Network name    | `Base Sepolia`                      |
| RPC URL         | `https://sepolia.base.org`          |
| Chain ID        | `84532`                             |
| Currency symbol | `ETH`                               |
| Block explorer  | `https://sepolia-explorer.base.org` |

保存网络后，将 MetaMask 切换到 Base Sepolia，并复制账户地址。后续领取测试网
token 会使用这个地址。

## 领取测试网 Token

同一个 Base Sepolia 地址需要两种余额：

- Base Sepolia ETH，用于 gas。
- Base Sepolia USDC，用于 x402 支付。

优先使用 Coinbase Developer Platform Faucet。CDP Faucet 支持 Base Sepolia 测试
网资产，包括 ETH 和 USDC，但会受到当前 faucet 额度限制。如果 CDP Faucet 不可用
或触发限流，可以把 Circle Faucet 作为测试 stablecoin 的备用来源。Faucet 的可用
网络、额度、账号要求和规则可能变化，以官方页面为准。

付费端点当前收费 `0.01` testnet USDC，但建议领取超过一次支付所需的余额，方便
重试本地失败的测试。

## 获取测试钱包私钥

MetaMask Extension 流程：

1. 打开 MetaMask，并选择本教程的测试账户。
2. 打开 account selector。
3. 点击目标账户旁边的三点菜单。
4. 选择 `Account details`。
5. 选择 `Private key`，输入 MetaMask 密码后显示私钥。
6. 复制私钥，用于 `.env.local`。

只导出这个全新测试钱包的私钥。不要截图。不要提交到 Git。不要粘贴到模型 prompt、
浏览器控制台、analytics event 或错误上报服务中。

私钥只能存在 `.env.local` 和服务端代码路径中，例如 Next.js Route Handler。不要给
`X402_PRIVATE_KEY` 使用 `NEXT_PUBLIC_*` 前缀，也不要把它发送给浏览器。

## 配置密钥

在应用根目录创建 `.env.local`：

```sh
AI_GATEWAY_API_KEY=...
AI_MODEL=anthropic/claude-sonnet-4.5
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://sepolia.base.org
X402_PAID_CONTENT_ENDPOINT=https://x402.payai.network/api/base-sepolia/paid-content
X402_MAX_AMOUNT=10000
```

`X402_MAX_AMOUNT` 使用 atomic units。对 USDC 来说，`10000` 代表 `0.01` USDC，
因为 USDC 有 6 位小数。

## 创建服务端 Route Handler

创建 `app/api/chat/route.ts`：

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

关键点：

- `runtime = "nodejs"` 是必须的，因为 Avery SDK 是 Node-only。
- 网络固定为 `X402Networks.baseSepolia`，避免用户因为环境变量拼错而把教程跑到错误
  网络。
- 这里直接使用 `X402Client.call()`，这样 AI SDK tool 可以把 `options.abortSignal`
  传入付费 HTTP 请求。
- Tool 只向模型和 UI 返回 `{ ok, status, body }` 或 `{ ok, reason, status }`。
  它不会暴露私钥、payment headers 或完整 HTTP result。
- 日志包含 endpoint、network、max amount、失败类型和 HTTP status，但不打印任何
  secret。

## 创建页面

替换 `app/page.tsx`：

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

AI SDK 的 tool part 名称是 `tool-{toolName}`。因为服务端 route 使用
`tools: { readPaidContent }`，所以 UI 渲染 `tool-readPaidContent`，并展示 running
和 completed 两种状态。

## 执行交易测试

启动 dev server：

```sh
pnpm run dev
```

打开 `http://localhost:3000`，输入：

```text
Use the paid content tool and summarize the result.
```

预期流程：

1. Chat request 到达 `app/api/chat/route.ts`。
2. AI SDK 使用 `AI_GATEWAY_API_KEY` 和 `AI_MODEL` 调用 Vercel AI Gateway。
3. 模型调用 `readPaidContent` tool。
4. 服务端 route 通过 `X402Client.call()` 调用 Base Sepolia x402 endpoint。
5. Avery SDK 使用 `X402_PRIVATE_KEY` 签名 x402 payment。
6. 付费端点返回内容，页面展示 `ok: true` 的 tool result。

如果 tool 没有触发，可以输入更直接的提示：
`Call readPaidContent now, then summarize the paid response.`

## 检查当前支付要求

如果端点开始失败，先检查当前 `402` response：

```sh
curl -i https://x402.payai.network/api/base-sepolia/paid-content
```

查看 JSON body 和 `payment-required` header。当前要求应匹配 Base Sepolia
`eip155:84532`、USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`，以及
`amount: "10000"`。

## 故障排查

### AI Gateway key 缺失

如果 route 返回 Vercel AI Gateway 认证错误，确认 `.env.local` 包含
`AI_GATEWAY_API_KEY`，然后重启 `pnpm run dev`。已运行的 Next.js dev server 不一定
会自动读取新的环境变量。

### Model id 不可用

如果 `anthropic/claude-sonnet-4.5` 对你的 Vercel team 不可用，请选择当前 AI
Gateway 项目可访问的 model id，并设置 `AI_MODEL`。

### 模型没有触发 tool

使用更明确的提示：`Call readPaidContent exactly once and summarize the result.`
Route 的 system prompt 会鼓励 tool call，但最终是否调用工具仍由模型决定。

### `402` 或 `payment_required`

确认端点仍然接受 Base Sepolia、USDC 和 `10000` atomic units。运行上面的
`curl -i` 命令，把 live payment requirements 与 `X402_MAX_AMOUNT` 和测试钱包余额
进行对比。

### USDC 余额不足

确认导出的 MetaMask 账户在 Base Sepolia 上拥有 USDC，且合约地址为
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。其他链、其他测试网或其他合约地址的
USDC 都无法满足这个端点。

### ETH gas 不足

买方会为 USDC 签名 EIP-3009 authorization，但钱包仍可能需要 Base Sepolia ETH 来
支撑网络操作和重试。请给同一个账户领取 Base Sepolia ETH。

### 私钥格式错误

Base Sepolia 使用 EVM 私钥，也就是 32-byte hex string，可以带或不带 `0x`。不要
粘贴 MetaMask seed phrase。不要在 `.env.local` 里包含空格或引号。

### RPC 配置错误

本地测试使用 `X402_RPC_URL=https://sepolia.base.org`。如果替换成自定义 RPC，确认
它服务的是 Base Sepolia chain id `84532`。

### 支付上限过低

`X402_MAX_AMOUNT` 必须大于等于端点要求的 atomic units。本测试使用 `10000`。更低的
值会导致 client 无法选择该 payment requirement。

## 官方参考

- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Base Sepolia 与 MetaMask 网络设置：
  https://docs.base.org/base-chain/quickstart/connecting-to-base
- MetaMask 导出私钥：
  https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/
- CDP Faucet:
  https://docs.cdp.coinbase.com/faucets/introduction/welcome
- Circle Faucet:
  https://faucet.circle.com/
- Coinbase x402 network support:
  https://docs.cdp.coinbase.com/x402/network-support
