# 生产部署

Avery SDK 是 Node-only SDK。请在服务端 Node.js runtime 中运行，Node.js 版本要求
`>=20.19.0`。不要把私钥放进客户端构建产物，并把每次 agent-triggered paid call
当作真实支出处理。

本页聚焦 deployment、runtime 和 secret handling。生产 agent spend policy 见
[Agent Spend Controls](/zh/guide/agent-spend-controls)。Audit logs 和 dashboards 见
[可观测性与审计日志](/zh/guide/observability)。按症状排查的 operator fixes 见
[故障排查](/zh/guide/troubleshooting)。

## 支持的运行时

| Runtime | 支持情况 | 说明 |
|---|---|---|
| Vercel Node.js Functions | 支持 | API routes 或 functions 使用 Node.js runtime。 |
| Next.js App Router route handlers | 支持 | Avery SDK 放在 server-only module，并使用 Node.js runtime。 |
| Next.js Server Actions | 支持 | 仅从服务端代码路径使用。 |
| Docker、Fly.io 或普通 Node server | 支持 | 运行时注入 secrets，并使用 Node.js `>=20.19.0`。 |
| Browser 或 client component | 不支持 | 私钥和支付签名不能发送到客户端。 |
| Static frontend bundle | 不支持 | 缺少安全的服务端签名边界。 |
| Next.js Edge runtime | 不推荐 | Edge runtime 的 API 集合有限，不提供完整 Node.js 兼容性。 |
| Cloudflare Workers 直接运行 Avery SDK | 不推荐 | 使用 Cloudflare 原生 x402 和 Agents 支持，或调用运行 Avery SDK 的 Node 服务。 |

## Next.js 模式

将 `X402Client` 放在 server-only module：

```ts
// lib/x402-client.ts
import "server-only";

import { X402Client, X402Networks } from "@averyso/alpha";

export const x402Client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: process.env.X402_NETWORK ?? X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: BigInt(process.env.X402_MAX_AMOUNT ?? "50000"),
  logLevel: process.env.X402_LOG_LEVEL === "debug" ? "debug" : "info",
});
```

从 route handler、server action 或 backend service 中使用：

```ts
// app/api/paid-weather/route.ts
import { x402Client } from "@/lib/x402-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city") ?? "Lisbon";
  const result = await x402Client.call(
    {
      url: "https://api.example.com/weather",
      query: { city },
    },
    undefined,
    { maxAmount: 50_000n },
  );

  if (result.kind !== "success") {
    return Response.json({ error: result.kind }, { status: result.status || 500 });
  }

  return Response.json(result.body);
}
```

不要从 `"use client"` component 导入这个模块。不要给私钥变量加 `NEXT_PUBLIC_` 前缀；
该前缀会把变量暴露给浏览器 bundle。

## 环境变量

使用环境变量或 runtime secrets 存放部署相关配置：

```sh
X402_PRIVATE_KEY=0x...
X402_NETWORK=base-sepolia
X402_RPC_URL=https://example-rpc
X402_MAX_AMOUNT=50000
X402_LOG_LEVEL=info
```

建议处理方式：

- `X402_PRIVATE_KEY`：必填，存入平台 secret manager。
- `X402_NETWORK`：由应用配置要求，必须匹配端点支付要求。
- `X402_RPC_URL`：生产环境建议配置；包含 API key 时按 secret 处理。
- `X402_MAX_AMOUNT`：使用原子单位整数字符串。
- `X402_LOG_LEVEL`：生产环境使用 `info`，除非正在主动调试。

## 平台配置

Vercel 使用 Project Environment Variables，并且只在 Node.js Functions 或设置
`runtime = "nodejs"` 的 Next.js server routes 中部署 Avery SDK。

Fly.io 使用 `fly secrets set` 注入敏感值：

```sh
fly secrets set X402_PRIVATE_KEY=0x... X402_RPC_URL=https://example-rpc
```

Docker 或 Docker Compose 使用 runtime secrets 或运行时环境变量注入。不要把私钥、
RPC API key 或 `.env` 内容写进 `Dockerfile`、image layer 或 build argument。Docker
secrets 通常以文件形式挂载，因此如果部署使用这种模型，应在进程启动时读取 secret
file。

## Private Key Rotation

使用小额 hot wallet，并把 rotation 变成常规流程：

1. 为同一 network family 创建新的 hot wallet。
2. 通过部署平台的 secret manager 注入新 key。
3. 部署到低流量环境，并执行一次低金额付费请求。
4. 逐步把流量切到新 key。
5. 按 treasury policy 转移、消耗或废弃旧 hot wallet 余额。
6. 审查日志，确认没有异常失败或重复支付。
7. 从所有环境移除旧 key。

## Hot Wallet 余额

Hot wallet 只保留近期支付所需资金。一个实用估算方式是：

```txt
hot_wallet_balance =
  maxAmount * expected_paid_calls_during_refill_window
  + gas_or_network_fees
  + operational_buffer
```

监控钱包余额、settlement failure 数量、RPC error rate 和 payment failure rate。在余额
低于下一个 refill window 所需最低值前触发告警。生产 hot wallet 不要存放超过短期
运营需求的资金。使用 application budget ledger 和 reservation flow，避免接受超过
hot wallet 支撑能力的并发 paid work；见
[Agent Spend Controls](/zh/guide/agent-spend-controls#budget-ledger)。

## 脱敏

写日志或上报错误前，脱敏以下字段：

- Private keys、seeds 和 Solana secret keys。
- 带 query string、account id 或 API key 的 RPC URLs。
- `Authorization` 和 `Cookie` headers。
- `X-PAYMENT` 和 `X-PAYMENT-RESPONSE` headers。
- Payment payloads 和 signed authorization data。
- 包含 signed payment data 的原始 provider responses。

地址通常可以缩写记录，例如只保留前后几位。详细支付诊断使用 `debug` 日志；生产
`info` 日志聚焦 endpoint name、result kind、status、脱敏后的 network 和 request id。
Logger adapters、audit fields、redaction rules 和 dashboard patterns 见
[可观测性与审计日志](/zh/guide/observability)。

## 参考

- [Next.js Edge Runtime](https://nextjs.org/docs/app/api-reference/edge)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Fly.io Secrets](https://fly.io/docs/apps/secrets/)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [Cloudflare x402 Workers support](https://developers.cloudflare.com/agents/tools/payments/x402/)
