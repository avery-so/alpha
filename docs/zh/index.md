# Alpha

`@averyso/alpha` 是面向 Node.js 的 TypeScript SDK，用于调用 Alpha 服务和受
x402 保护的付费 HTTP 端点。

适合以下场景：

- 使用 EVM 或 Solana 凭证完成 x402 支付并调用付费端点；
- 通过 `maxAmount` 限制单次支付上限；
- 将付费端点包装成兼容 Vercel AI SDK 的工具；
- 通过轻量级 `AlphaClient` 检查 Alpha 服务状态。

## 安装

```sh
pnpm add @averyso/alpha
```

## 快速示例

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const result = await client.call("https://api.example.com/weather", {
  query: { city: "San Francisco" },
});

if (result.kind === "success") {
  console.log(result.body);
}
```

真实集成需要 x402-protected endpoint、所选网络对应的凭证、必要时提供 RPC
URL，以及足够的测试网或主网资金。EVM 网络使用 32 字节 hex 私钥；Solana 网络
使用 base58 编码的 64 字节 Solana secret key。

选择网络时可以使用 `X402Networks` 常量、friendly name（如
`"Base Sepolia"`）、primary slug（如 `"base-sepolia"`），或原始 CAIP-2 字符串
（如 `"eip155:84532"`）。`client.network` 始终返回标准化后的 CAIP-2。

## 下一步

- [快速开始](/zh/guide/getting-started)
- [构建 x402 AI 工具](/zh/tutorial/x402-ai-tool)
- [API 参考](/zh/api/sdk)
- [发布](/zh/releases/)
