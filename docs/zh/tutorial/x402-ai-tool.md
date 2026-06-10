# 使用 x402 构建 Agent 支付工具

这是 Alpha 的核心 Agent payment 工作流：把 x402-protected HTTP 端点包装成
兼容 Vercel AI SDK 的工具，限制 Agent 的单次支付上限，并把凭证保留在服务端。
模型负责提供 tool input，SDK 负责准备请求，`X402Client` 负责完成付费的 x402
调用。

## 前置条件

- Node.js `>=20.19.0`。
- 已安装 `@averyso/alpha`。
- 一个 x402-protected endpoint。
- `X402_PRIVATE_KEY` 设置为所选网络对应的凭证。
- 所选网络需要 RPC 时，设置 `X402_RPC_URL`。
- 对应网络上有足够资金。

EVM 网络使用 32 字节 hex 私钥。Solana 网络使用 base58 编码的 64 字节
Solana secret key。

优先使用 `X402Networks` 常量或 `"Base Sepolia"` 这样的 friendly name。原始
CAIP-2 字符串（如 `"eip155:84532"`）仍然支持，但更适合配置文件和兼容路径。

## 创建客户端

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

client 层的 `maxAmount` 是默认支付上限。单个 tool 可以继续覆盖它。

## 定义 Agent 工具

```ts
import { jsonSchema } from "ai";
import { X402Client, x402tool } from "@averyso/alpha";

interface WeatherInput {
  city: string;
  units?: "metric" | "imperial";
}

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
  rpcUrl: process.env.X402_RPC_URL,
});

export const tools = {
  getWeather: x402tool<WeatherInput>({
    client,
    title: "Paid weather",
    description: "Get current weather from a paid x402 endpoint.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
  }),
};
```

没有提供 `request` 时，`x402tool()` 会自动映射 plain object input：

- `GET`、`HEAD`、`DELETE` 会把 input 映射到 query string。
- `POST`、`PUT`、`PATCH` 会把 input 映射为 JSON body。

上面的示例使用默认 `GET` 方法，因此
`{ city: "Paris", units: "metric" }` 会变成
`?city=Paris&units=metric`。tool 层的 `maxAmount` 会限制这一次由模型触发的
付费调用。

## 使用动态端点

`endpoint` 也可以根据 tool input 动态生成：

```ts
const tools = {
  getForecast: x402tool<WeatherInput>({
    client,
    description: "Get a paid forecast for a city.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: (input) => ({
      url: `https://api.example.com/weather/${encodeURIComponent(input.city)}`,
      method: "GET",
      query: { units: input.units ?? "metric" },
    }),
    maxAmount: 50_000n,
  }),
};
```

## 覆盖请求

当端点需要额外 header、非默认 method，或者请求 body 和模型输入结构不一致时，
使用 `request`：

```ts
const tools = {
  summarizeReport: x402tool<{ reportId: string; detail: "short" | "full" }>({
    client,
    description: "Buy and summarize a report.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        reportId: { type: "string" },
        detail: { type: "string", enum: ["short", "full"] },
      },
      required: ["reportId", "detail"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/reports",
    request: (input) => ({
      method: "POST",
      headers: {
        "x-report-id": input.reportId,
      },
      body: {
        detail: input.detail,
      },
    }),
    maxAmount: 250_000n,
    throwOnError: true,
  }),
};
```

一旦提供 `request`，自动 input mapping 会被禁用。`request` 返回的对象就是
发送给端点的请求形状。

## 返回适合模型消费的结果

不提供 `execute` 时，tool 会直接返回原始 `EndpointResult`。提供 `execute`
可以把输出收敛成更稳定、更适合模型理解的对象，而不是把完整支付和 HTTP 结果
直接交给模型。

```ts
const tools = {
  getWeather: x402tool<
    WeatherInput,
    { ok: true; weather: unknown } | { ok: false; reason: string }
  >({
    client,
    description: "Get current weather from a paid x402 endpoint.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["metric", "imperial"] },
      },
      required: ["city"],
      additionalProperties: false,
    }),
    endpoint: "https://api.example.com/weather",
    maxAmount: 50_000n,
    execute: ({ endpoint }) => {
      if (endpoint.kind === "success") {
        return { ok: true, weather: endpoint.body };
      }

      return { ok: false, reason: endpoint.kind };
    },
  }),
};
```

`execute` 接收 `{ endpoint, input }`。其中 `endpoint` 是
`X402Client.call()` 返回的 `EndpointResult`，`input` 是原始 tool input。

## 将支付工具传给 AI SDK

```ts
import { generateText, jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const tools = {
  getWeather: x402tool<{ city: string }>({
    client,
    title: "Paid weather",
    description: "Get current weather for a city.",
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
    throwOnError: true,
  }),
};

const response = await generateText({
  model,
  tools,
  prompt: "What is the weather in Lisbon?",
});
```

`model` 来自你的 AI SDK 模型 provider。私钥、RPC URL 和支付凭证应始终保留在
服务端。
