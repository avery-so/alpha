# 快速开始

Alpha 是 AI Agent 时代的 Agent 支付 SDK。当模型需要调用付费 x402 端点时，
优先使用 `x402tool()` 构建带支付上限、运行在服务端的工具。当请求完全由应用
自己控制时，再直接使用 `X402Client.call()`。

如果你还不熟悉 x402-protected endpoint，请先阅读
[核心概念](/zh/guide/concepts)，了解支付生命周期和 `EndpointResult.kind` 的结果。

## 环境要求

- Node.js `>=20.19.0`。
- 一个 x402-protected endpoint。见 [核心概念](/zh/guide/concepts)，了解端点如何
  返回支付要求，以及 Alpha 如何完成兼容支付。
- 所选 x402 网络对应的凭证。测试钱包和网络配置见
  [钱包与网络](/zh/guide/wallets-and-networks)。
- 所选网络需要 RPC 时，提供 RPC URL。部署建议见
  [生产部署](/zh/guide/production)。
- 在对应测试网或主网上准备足够资金。网络和资产必须匹配端点支付要求。

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

不要把 `X402_PRIVATE_KEY` 暴露到浏览器或客户端构建产物中。私钥、RPC URL 和
支付签名流程都应保留在服务端。

## 创建客户端

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});
```

也可以使用 friendly name `"Base Sepolia"`、primary slug `"base-sepolia"`，或
原始 CAIP-2 字符串 `"eip155:84532"`。`client.network` 始终返回标准化后的
CAIP-2 值。

`maxAmount` 使用端点支付要求里的原子单位。比如六位小数的 USDC 类资产中，
`100000n` 表示 `0.1` USDC。SDK 默认值是 `100000n`，也可以在 client、
call 或 tool 层覆盖。

完整内置网络表见 [SDK API 参考](/zh/api/sdk)。原始 `eip155:*` CAIP-2 值会继续
可用；原始 Solana CAIP-2 值仅限支持的 Solana Mainnet 和 Devnet 条目。

钱包创建、faucet 选择、原子单位换算和主网上线检查见
[钱包与网络](/zh/guide/wallets-and-networks)。

## 构建 Agent 支付工具

使用 `x402tool()` 可以把付费端点暴露为兼容 Vercel AI SDK 的工具。模型提供
结构化输入，Alpha 准备 HTTP 请求，`X402Client` 负责完成 x402 支付流程。

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 100_000n,
});

export const tools = {
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
  }),
};
```

对于 `GET`、`HEAD`、`DELETE`，plain object tool input 会被映射到 query
parameters。对于 `POST`、`PUT`、`PATCH`，它会作为 JSON body 发送。使用 tool
层的 `maxAmount` 可以控制每次模型触发付费调用的上限。

将工具传给 AI SDK：

```ts
import { generateText } from "ai";

const response = await generateText({
  model,
  tools,
  prompt: "What is the weather in Lisbon?",
});
```

`model` 来自你的 AI SDK 模型 provider。动态端点、请求覆盖和适合模型消费的输出
结构见 [构建 x402 AI 工具](/zh/tutorial/x402-ai-tool)。

## 直接调用付费端点

当应用自己控制请求，并希望根据 `EndpointResult.kind` 分支处理时，使用
`client.call()`。

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
