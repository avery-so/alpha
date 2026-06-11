# 钱包与网络

Avery SDK 会使用服务端钱包签名 x402 支付。钱包、网络、资产、RPC provider 和
`maxAmount` 上限都必须匹配目标端点返回的支付要求。

多数首次测试建议从 `Base Sepolia` 开始。本文档示例使用它，x402 和 CDP 的测试网
流程支持它，测试网 USDC 获取路径也更成熟。如果目标端点明确要求 Solana，则使用
`Solana Devnet`。

## 选择网络

最终网络选择应由端点支付要求决定。如果端点只接受 `eip155:84532`，就配置 Base
Sepolia。如果端点只接受 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`，就配置
Solana Devnet。

Avery SDK 支持内置常量、friendly name、primary slug 和受支持的 CAIP-2 字符串：

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 50_000n,
});
```

等价的 Base Sepolia 输入包括 `"Base Sepolia"`、`"base-sepolia"` 和
`"eip155:84532"`。

## 创建测试钱包

测试网使用专门的开发钱包。不要复用主钱包、曾经持有真实资金的钱包，或与其他环境
共享过的 seed phrase。

EVM 网络需要 32 字节 hex 私钥，可带或不带 `0x` 前缀：

```sh
X402_PRIVATE_KEY=0x...
X402_NETWORK=base-sepolia
```

Solana 网络需要 base58 编码的 64 字节 Solana secret key：

```sh
X402_PRIVATE_KEY=...
X402_NETWORK=solana-devnet
```

私钥必须保留在服务端。不要把它传给浏览器、client component、静态前端包、模型
prompt、analytics event 或错误上报系统。

## 为钱包充值

先读取端点支付要求，再为对应网络和资产充值。只有 Base Sepolia ETH、但没有端点要求
的测试网 USDC，无法支付以 USDC 计价的端点。Solana Devnet 上的余额也不能支付 Base
Sepolia 的支付要求。

常见测试网入口：

- [Coinbase Developer Platform Faucet](https://www.coinbase.com/developer-platform/products/faucet)
  可获取受支持的 Ethereum Sepolia、Base Sepolia 和 Solana Devnet 测试资金。
- [Circle Testnet Faucet](https://faucet.circle.com/) 可获取受支持的测试网
  stablecoin。

Faucet 限额、支持资产和领取规则可能变化。以官方 faucet 页面为准，不要在测试或文档
中硬编码预期领取额度。

## 理解 `maxAmount`

`maxAmount` 是原子单位上限，不是十进制 token 数量。具体资产和 decimals 由端点支付
要求决定。

换算公式：

```ts
atomic = tokenAmount * 10 ** decimals;
tokenAmount = atomic / 10 ** decimals;
```

对于六位小数的 USDC 类资产：

| 原子单位金额 |  Token 金额 |
| -----------: | ----------: |
|    `50_000n` | `0.05` USDC |
|   `100_000n` |  `0.1` USDC |
| `1_000_000n` |    `1` USDC |

生产环境不要用 floating-point math 计算支付上限。建议把十进制字符串解析成整数原子
单位，并把每个 cap 当作真实支出上限审查。

## 配置 RPC

SDK 配置里的 `rpcUrl` 是可选项，因为部分 scheme 和 provider 可以在没有显式 RPC URL
的情况下运行。生产环境建议显式配置，除非你已经验证所选 network、scheme 和 provider
确实不需要。

以下场景必须提供可用 RPC URL：

- 所选 network、scheme 或 provider 需要链上读取。
- 默认 RPC 路径不可用或被限流。
- Solana 或 EVM provider 要求调用方提供 RPC 配置。
- 生产环境需要可预期的 latency、quota、observability 或 failover。

当 RPC URL 包含 API key 或账户标识时，把它当作 secret 处理。

## 主网上线检查

从测试网切换到主网前：

- 确认配置网络与端点支付要求完全一致。
- 从官方来源核对资产地址、token standard 和 decimals。
- 将每个 `maxAmount` cap 作为真实支出上限审查。
- 在开放 agent-triggered traffic 前，先用真实资金做一次小额付费请求。
- 检查钱包余额、gas 或 fee 余额，以及 RPC 健康状态。
- 日志中脱敏 key、RPC 凭据、支付 header 和 payment payload。
- 准备回滚和 private key rotation 流程。
- Hot wallet 只保留短期 refill window 所需资金。

## 参考

- [x402 Networks and Token Support](https://docs.x402.org/core-concepts/network-and-token-support)
- [Coinbase x402 Network Support](https://docs.cdp.coinbase.com/x402/network-support)
- [CDP Faucet](https://www.coinbase.com/developer-platform/products/faucet)
- [Circle Testnet Faucet](https://faucet.circle.com/)
