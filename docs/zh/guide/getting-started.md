# 快速开始

Alpha 是面向 Node.js 的 SDK。主要运行路径是 `X402Client`：它会为支持
x402 的端点签名、选择可接受的支付要求，并完成付费请求。

## 环境要求

- Node.js `>=20.19.0`。
- 一个 x402-protected endpoint。
- 所选 x402 网络对应的凭证。
- 所选网络需要 RPC 时，提供 RPC URL。
- 在对应测试网或主网上准备足够资金。

EVM 网络需要 32 字节 hex 私钥，可带或不带 `0x` 前缀。Solana 网络需要
base58 编码的 64 字节 Solana secret key。

## 安装

```sh
pnpm add @averyso/alpha
```

## 导入

ESM:

```ts
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";
```

CommonJS:

```js
const { X402Client, x402tool } = require("@averyso/alpha");
```

## 环境变量

```sh
X402_PRIVATE_KEY=0x...
X402_RPC_URL=https://example-rpc.testnet
```

不要把 `X402_PRIVATE_KEY` 暴露到浏览器或客户端构建产物中。

## 创建客户端

```ts
import { X402Client } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

也可以使用 `X402Networks.baseSepolia`、primary slug `"base-sepolia"`，或原始
CAIP-2 字符串 `"eip155:84532"`。`client.network` 始终返回标准化后的 CAIP-2
值。

`maxAmount` 使用端点支付要求里的原子单位。比如六位小数的 USDC 类资产中，
`100000n` 表示 `0.1` USDC。SDK 默认值是 `100000n`，也可以在 client、
call 或 tool 层覆盖。

## 调用付费端点

```ts
const result = await client.call(
  {
    url: "https://api.example.com/weather",
    method: "GET",
    query: { city: "San Francisco", units: "metric" },
  },
  undefined,
  { maxAmount: 50_000n },
);

switch (result.kind) {
  case "success":
    console.log("Paid response:", result.body);
    break;
  case "payment_required":
    console.error("The endpoint required payment but no payment was made.");
    break;
  default:
    console.error("Request failed:", result.kind, result.body);
}
```

默认情况下，`client.call()` 返回 `EndpointResult` 判别联合类型。如果你更希望
用异常处理失败，可以传入 `throwOnError: true`：

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "London" } },
  { throwOnError: true },
);
```

## 直接调用还是 AI 工具

当应用自己控制请求，并希望根据 `EndpointResult.kind` 分支处理时，使用
`client.call()`。

当模型需要通过兼容 Vercel AI SDK 的工具决定何时调用付费端点时，使用
`x402tool()`：

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

export const tools = {
  getWeather: x402tool({
    client,
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
  }),
};
```
