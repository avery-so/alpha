# Mastra 集成

当 Mastra agent 需要调用付费 x402 endpoint 时，使用 `x402MastraTool()`。这个
helper 会返回兼容 Mastra `createTool()` 的对象，并把 x402 支付签名保留在服务端，
同时用 `maxAmount` 限制每次付费调用。

这个集成只覆盖 buyer side。你需要提供 x402-protected endpoint、钱包私钥、必要
时的 RPC URL，以及端点要求的网络和资产余额。Endpoint provider 控制 x402 支付要求
和结算路径；Avery SDK 不配置 facilitator。

## 环境要求

- 应用中已安装 Avery SDK 和 Mastra。
- 服务端 Mastra agent runtime。不要把 `X402_PRIVATE_KEY` 放进浏览器代码。
- 一个允许 agent 调用的 x402-protected endpoint。
- `X402_PRIVATE_KEY`、需要时的 `X402_RPC_URL`，以及匹配网络的资金。

## 安装

```sh
pnpm add @averyso/alpha @mastra/core zod
```

Avery SDK 不会在运行时 import `@mastra/core`。你的应用负责安装和运行 Mastra；
`x402MastraTool()` 返回 Mastra 期望的 tool shape。

## 配置环境变量

```sh
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://...
X402_PAID_WEATHER_ENDPOINT=https://...
MASTRA_MODEL=provider/model-name
```

这些值都应保留在服务端。私钥会签名 x402 payment payload，RPC URL 也可能包含
provider 凭证。

## 创建付费工具

```ts
// src/mastra/tools/paid-weather.ts
import { z } from "zod";
import {
  X402Client,
  X402Networks,
  x402MastraTool,
  type EndpointResult,
} from "@averyso/alpha";

const weatherInputSchema = z.object({
  city: z.string(),
});

const weatherOutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    weather: z.unknown(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),
]);

type WeatherInput = z.infer<typeof weatherInputSchema>;
type WeatherOutput = z.infer<typeof weatherOutputSchema>;

const x402 = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const paidWeatherTool = x402MastraTool<
  WeatherInput,
  WeatherOutput,
  "paid-weather"
>({
  id: "paid-weather",
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: weatherInputSchema,
  outputSchema: weatherOutputSchema,
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  execute: ({ endpoint }) => toWeatherOutput(endpoint),
});

function toWeatherOutput(result: EndpointResult): WeatherOutput {
  if (result.ok) {
    return {
      ok: true,
      weather: result.body,
    };
  }

  return {
    ok: false,
    reason: `${result.kind}:${result.status}`,
  };
}
```

如果不提供 `execute`，tool 会返回完整 `EndpointResult`。Agent tool 中建议返回更小、
更适合模型消费的结构，避免把 payment headers、HTTP metadata 和 provider-specific
细节直接暴露给模型。

## 加入 Agent

```ts
// src/mastra/agents/weather-agent.ts
import { Agent } from "@mastra/core/agent";

import { paidWeatherTool } from "../tools/paid-weather";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    You answer weather questions.
    Use paidWeather when current weather data is needed.
  `,
  model: process.env.MASTRA_MODEL!,
  tools: {
    paidWeather: paidWeatherTool,
  },
});
```

Mastra stream 中的 `toolName` 来自 object key，而不是 tool 的 `id`。上面的示例会
输出 `paidWeather`。如果希望 stream 名称和 tool id 一致，可以使用 computed key：

```ts
tools: {
  [paidWeatherTool.id]: paidWeatherTool,
}
```

## Mastra 字段

`x402MastraTool()` 会透传 Mastra tool 字段，包括 `requireApproval`、`strict`、
`providerOptions`、`toModelOutput`、`transform`、`inputExamples` 和 `mcp`。

需要用户确认的付费调用可以使用 `requireApproval`：

```ts
x402MastraTool({
  id: "paid-weather",
  client: x402,
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: weatherInputSchema,
  endpoint: process.env.X402_PAID_WEATHER_ENDPOINT!,
  maxAmount: 50_000n,
  requireApproval: true,
});
```

当浏览器 stream 或 transcript 应该看到比原始 tool payload 更安全的结构时，使用
Mastra `transform`。它和 Avery 的 `execute` mapper 是分开的：`execute` 控制真实
tool result，`transform` 控制 Mastra display 和 transcript payload。

## 下一步

- 阅读 [Agent Spend Controls](/zh/guide/agent-spend-controls)，了解预算、审批和
  loop limits。
- 阅读 [错误处理](/zh/guide/error-handling)，了解 `EndpointResult.kind` 处理。
- 阅读 [可观测性与审计日志](/zh/guide/observability)，了解 audit events、脱敏和
  dashboards。
- 阅读 [SDK API 参考](/zh/api/sdk#x402mastratoolconfig)，查看完整
  `x402MastraTool()` 类型。
