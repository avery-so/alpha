# 故障排查

当付费 x402 call 失败或行为与预期不一致时，使用本页。生命周期语义和 retry strategy
请先看 [错误处理](/zh/guide/error-handling)。精确 API shape 见
[SDK API 参考](/zh/api/sdk)。

## Invalid Private Key

可能原因：

- EVM key 不是 32 字节 hex string。
- EVM key 包含 `0-9`、`a-f` 或 `A-F` 之外的字符。
- 为 EVM network 提供了 Solana key，或为 Solana network 提供了 EVM key。
- Environment variable 缺失、引号错误，或包含 whitespace。

检查：

- 配置的 `network`。
- Key format 是否匹配 network family。
- 部署环境是否和本地开发环境使用同一个 secret。

修复：

- 对 EVM networks，提供 64-character hex private key，可带或不带 `0x` prefix。
- 对 Solana networks，提供 base58-encoded 64-byte Solana secret key。
- Key 保留在服务端，修改 secret 后重新部署。

见 [钱包与网络](/zh/guide/wallets-and-networks)。

## Unsupported Network

可能原因：

- Friendly name 或 slug 拼写错误。
- 使用了不受支持的 raw Solana CAIP-2 network。
- Endpoint 要求的 network 和 client network 不一致。

检查：

- `client.network`。
- 传给 `new X402Client(..., { network })` 的值。
- Endpoint payment requirements，如果 provider 暴露了这些信息。
- `X402ConfigError.details.supportedNetworks`。

修复：

- 优先使用 `X402Networks` constants 或文档列出的 primary slugs。
- Solana 只使用受支持的 Solana entries。
- 匹配 endpoint advertised network 和 asset。

见 [SDK API 参考](/zh/api/sdk#network-selection)。

## Insufficient Funds

可能原因：

- Hot wallet 在要求的 network 上没有要求的 asset。
- Wallet 有 token balance，但没有足够 native token 支付 network fees。
- 你给 testnet 充值却调用 mainnet，或反过来。
- 并发 agent calls 在本次调用结算前消耗了余额。

检查：

- 配置 network 上的 wallet address。
- Endpoint payment requirements 中要求的 asset 和 amount。
- 最近的 paid attempts 和 budget reservations。
- Buyer-side server logs 中的 RPC errors。如果你运营 endpoint，也检查 provider-side
  settlement logs，包括 local settlement 或 provider 的 facilitator。

修复：

- 在精确 network 上为 hot wallet 充值要求的 asset。
- 在 network 需要时保留 native gas 或 fee balance。
- 添加 balance alerts，并在 wallet 达到 refill threshold 前拒绝新的 paid work。
- 使用 application budget reservations，避免接受超过 wallet 支撑能力的并发 paid
  work。

见 [生产部署](/zh/guide/production) 和
[Agent Spend Controls](/zh/guide/agent-spend-controls#budget-ledger)。

## No Compatible Payment Requirements

可能原因：

- Endpoint network 和 `client.network` 不一致。
- Endpoint price 超过 effective `maxAmount`。
- Endpoint 要求不受支持的 asset 或 payment scheme。
- Endpoint 返回了 malformed 或 outdated x402 requirements。

检查：

- `EndpointResult.kind`；这通常表现为 `payment_required` 或 `error`，取决于不兼容发生
  的位置。
- Effective cap precedence：tool cap、direct call cap，然后是 client default。
- Endpoint payment requirements 和 advertised network。
- Server logs 中的 `No compatible x402 payment requirements were available.`。

修复：

- 把 `network` 设置为 endpoint 支持的 network。
- 只有在把 `maxAmount` 当作真实 spend limit 审查后，才提高它。
- 选择支持你的 network 和 asset 的 provider endpoint。
- 请 endpoint provider 检查它的 x402 requirements。

见 [Agent Spend Controls](/zh/guide/agent-spend-controls#cap-precedence)。

## RPC Failure

可能原因：

- 某个 network 或 provider 需要 `rpcUrl`，但没有配置。
- RPC API key 无效、过期、rate-limited，或受 origin/IP 限制。
- RPC endpoint 指向错误 network。
- Provider outage 或 high latency。

检查：

- 部署环境中的 `X402_RPC_URL`。
- RPC provider dashboard 中的 errors、rate limits 和 network selection。
- 聚焦排查时，把 server logs 临时调到 `debug` level。
- Failure 是否 transient，且是否只影响一个 provider。

修复：

- 为配置的 network 提供 production RPC URL。
- 轮换或修正 RPC API key。
- 只对 transient RPC failures 使用 bounded backoff retry。
- 如果 availability target 需要，fail over 到另一个 RPC provider。

不要把带 API keys 的 RPC URLs 写入日志。见
[可观测性与审计日志](/zh/guide/observability#redaction)。

## Endpoint Still Returns `402`

可能原因：

- Requirements 不兼容，因此没有尝试 payment。
- Payment header 被 provider-side settlement path 拒绝，包括 local settlement 或
  provider 的 facilitator。
- Endpoint 要求不同 network、asset、method、path 或 host。
- Endpoint middleware 或 route configuration 有误。
- 请求从 browser 或 proxy path 发送，绕过了 server payment flow。

检查：

- `EndpointResult.kind`、`status`、`metadata.url` 和 `metadata.method`。
- `result.paymentResponse` 是否存在。
- 完成所有 request mapping 后的 endpoint host/path/method。
- 如果你运营 endpoint，使用同一个 request id 检查 provider 和 facilitator logs。如果
  你只是 buyer，请带着 request id 和 redacted `paymentResponse` summary 联系
  provider。

修复：

- 精确匹配 network、asset、endpoint URL 和 method。
- 确认 server route 使用 `X402Client.call()` 或 `x402tool()`。
- 把 payment signing 保留在 Node.js server code。
- 当 settled payment 仍被拒绝时，带 request id 和 redacted payment summary 联系
  provider。

见 [错误处理](/zh/guide/error-handling#payment_required) 和
[生产部署](/zh/guide/production)。

## Amount Cap Too Low

可能原因：

- `maxAmount` 低于 endpoint price。
- 传入的是 decimal token amount，而不是 atomic-unit integer。
- Tool-level `maxAmount` 低于 client default。
- Direct `client.call()` 传入了比预期更低的 per-call cap。

检查：

- Endpoint price 和 asset decimals。
- Model-triggered calls 中的 `x402tool({ maxAmount })`。
- Direct calls 中的 `client.call(..., { maxAmount })`。
- `client.maxAmount`。

修复：

- 配置 cap 前，把 display token amounts 转换为 atomic units。
- 更新 request path 中最具体的 cap。
- 把更广义的 user/session/day budgets 与 `maxAmount` 分开维护。

见 [钱包与网络](/zh/guide/wallets-and-networks) 和
[Agent Spend Controls](/zh/guide/agent-spend-controls#cap-precedence)。

## Missing `fetch`

可能原因：

- Runtime 没有提供 `globalThis.fetch`。
- Test environment 删除或 mock 了 `fetch`。
- Custom runtime 不是 Node.js `>=20.19.0`。

检查：

- Node.js version。
- 构造 client 前，`typeof globalThis.fetch === "function"` 是否为 true。
- 是否有 test setup stub 或删除了 `fetch`。

修复：

- 在受支持的 Node.js runtime 中运行 Avery SDK。
- 必要时通过 `X402ClientOptions` 传入兼容的 custom `fetch` implementation。
- Tests 中 mock 后恢复 `globalThis.fetch`。

见 [生产部署](/zh/guide/production)。

## Browser or Client Bundle Imported the SDK

可能原因：

- Next.js `"use client"` component 导入了创建 `X402Client` 的 module。
- Shared utility code 同时从 server 和 browser paths 导入 Avery SDK。
- Environment variables 使用了 `NEXT_PUBLIC_` 前缀。

检查：

- Browser bundle errors。
- Next.js module graph，以及来自 client components 的 imports。
- Private payment env vars 是否出现在 client-side code 中。

修复：

- 把 `X402Client` 保留在 server-only module。
- 在 Next.js server helpers 中添加 `import "server-only";`。
- 让浏览器调用你自己的 API route 或 server action，而不是直接 import Avery SDK。
- 轮换任何可能已经暴露的 key。

见 [生产部署](/zh/guide/production)。

## Solana Key Length or Base58 Issues

可能原因：

- Key 是 base64、JSON array、mnemonic 或 public key，而不是 base58 secret key。
- Base58-decoded key 不是 64 bytes。
- Secret key 复制时包含 whitespace 或 line breaks。
- Key 来自某种需要先 export conversion 的 wallet format。

检查：

- 抛出的 `X402ConfigError` message。
- 可用时检查 `details.byteLength`。
- Wallet export format。
- 所选 network 是否为 Solana Mainnet 或 Solana Devnet。

修复：

- Export Solana 64-byte secret key，并编码为 base58。
- 不要把 public address 当作 private key。
- 移除 environment variable value 周围的 whitespace。
- 使用 endpoint 支持的精确 Solana network。

见 [钱包与网络](/zh/guide/wallets-and-networks) 和
[SDK API 参考](/zh/api/sdk#network-selection)。
