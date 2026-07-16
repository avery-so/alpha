# 支付 Middleware

当应用需要用支付要求保护 HTTP 资源，或需要在 route 中调用支付服务商 client
时，可使用 Alpha payment middleware。每个 `createAlphaPayment()` runtime 固定
对应一个 provider 和一个 direction，并可跨请求复用。

首版能力矩阵如下：

| Provider | `inbound`        | `outbound`       |
| -------- | ---------------- | ---------------- |
| `x402`   | 支持             | 支持             |
| `alipay` | 支持             | 创建时抛配置错误 |
| `weixin` | 创建时抛配置错误 | 支持             |

Alpha 将 x402 验证、结算、facilitator 通信及 wire headers 委托给官方
`@x402/express`、`@x402/hono` 和 `@x402/next`，不会重新实现另一套 x402
协议栈。

## Runtime 要求

所有 middleware 都运行在 Node.js `>=20.19.0`。私钥、facilitator 凭据、支付宝
gateway 凭据和微信签名凭据必须保留在服务端。Next.js 必须显式选择 Node runtime：

```ts
export const runtime = "nodejs";
```

只安装应用实际使用的 framework peer：

```sh
pnpm add @averyso/alpha express
pnpm add @averyso/alpha hono
pnpm add @averyso/alpha next
```

根入口 `@averyso/alpha` 不依赖具体 framework。适配器分别由
`@averyso/alpha/express`、`@averyso/alpha/hono` 和 `@averyso/alpha/next`
提供。

## 创建 x402 Inbound Runtime

x402 inbound runtime 需要 protected routes，以及以下二选一配置：现成的
`x402ResourceServer`；或显式 facilitator 加 scheme 注册。Alpha 不提供隐式
facilitator URL。

```ts
import { createAlphaPayment } from "@averyso/alpha";

export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  facilitator: {
    url: process.env.X402_FACILITATOR_URL!,
  },
  schemes: "auto",
  network: ["base-sepolia"],
  routes: {
    "GET /api/report": {
      accepts: {
        scheme: "exact",
        network: "Base Sepolia",
        price: "$0.01",
        payTo: process.env.X402_PAY_TO!,
      },
      description: "Generate one report",
      mimeType: "application/json",
    },
  },
});
```

`schemes: "auto"` 会按 route network 注册官方 EVM/Solana exact server
scheme。Route network alias 使用与 `X402Client` 相同的 registry 规范化。可选
顶层 `network` 只是 allowlist，不会替换 `accepts[].network`。

需要自定义 hook、多 facilitator 或自定义 scheme 时，直接传入官方 server：

```ts
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const server = new x402ResourceServer([primaryFacilitator, fallbackFacilitator])
  .register("eip155:84532", new ExactEvmScheme())
  .onAfterSettle(auditSettlement);

export const payment = createAlphaPayment({
  provider: "x402",
  direction: "inbound",
  routes,
  server,
});
```

`server` 不能与 `facilitator` 或 `schemes` 同时配置。factory 会在开始服务前
拒绝冲突。`payment.initialize()` 始终返回同一个缓存 Promise，因此应用可在启动
时主动调用，adapter 后续重复调用也是安全的。

## Express

x402 inbound 或 outbound context 可配合普通 Express handler 使用：

```ts
import express from "express";
import { alphaExpressMiddleware, getAlphaPaymentContext } from "@averyso/alpha/express";
import { payment } from "./payment.js";

const app = express();

app.use(alphaExpressMiddleware(payment));

app.get("/api/report", (req, res) => {
  const context = getAlphaPaymentContext(req);
  res.json({ provider: context.provider, report: buildReport() });
});
```

如果 handler 希望接收 Web `Request` 并返回 Web `Response`，使用
`withAlphaExpress()`。Alipay inbound 必须使用该 wrapper，因为资源响应需要在
履约确认前完整缓存：

```ts
import { withAlphaExpress } from "@averyso/alpha/express";

app.get(
  "/api/report",
  withAlphaExpress(payment, async (request, context) => {
    return Response.json({
      paid: context.provider === "alipay" && context.payment !== null,
      report: await buildReport(request.signal),
    });
  }),
);
```

若 handler 需要解析后的 body，应把 `express.json()` 等 body parser 放在 wrapper
之前。若 body 未被 parser 消费，Alpha 会把 Node request stream 转为 Web
`Request`。

## Hono

`alphaHonoMiddleware()` 会把初始化后的 outbound client 或 inbound context 写入
Hono context，并将 x402 保护委托给官方 Hono adapter：

```ts
import { Hono } from "hono";
import { alphaHonoMiddleware, getAlphaPaymentContext } from "@averyso/alpha/hono";
import { payment } from "./payment.js";

const app = new Hono();

app.use(alphaHonoMiddleware(payment));
app.get("/api/report", (c) => {
  const context = getAlphaPaymentContext(c);
  return c.json({ provider: context.provider, report: buildReport() });
});
```

Alipay inbound 或统一 Web handler 使用 `withAlphaHono()`：

```ts
import { withAlphaHono } from "@averyso/alpha/hono";

app.get(
  "/api/report",
  withAlphaHono(payment, async (_request, context) =>
    Response.json({ provider: context.provider, report: await buildReport() }),
  ),
);
```

## Next.js App Router

`withAlphaNext()` 用于包装 App Router route handler。Alpha 把 payment context
作为 callback 第二个参数传入，而不是修改不可变的 `NextRequest`；Next 原生 route
context 位于第三个参数。

```ts
// app/api/report/route.ts
import { withAlphaNext } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const runtime = "nodejs";

export const GET = withAlphaNext(payment, async (_request, context) => {
  return Response.json({ provider: context.provider, report: await buildReport() });
});
```

页面或通配路径可在 `proxy.ts` 中使用 `alphaNextProxy()`。该 API 只接受 x402
inbound runtime：

```ts
// proxy.ts
import { alphaNextProxy } from "@averyso/alpha/next";
import { payment } from "@/server/payment";

export const proxy = alphaNextProxy(payment);

export const config = {
  matcher: ["/reports/:path*"],
};
```

不要把 Alipay 或 WeiXin 逻辑放进 Edge-only proxy。首版不支持 Pages Router。

## Outbound Context

Outbound middleware 只注入配置完成的 client，不会修改全局 `fetch`：

```ts
const x402Outbound = createAlphaPayment({
  provider: "x402",
  direction: "outbound",
  network: "base-sepolia",
  privateKey: process.env.X402_PRIVATE_KEY!,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 50_000n,
});

const weixinOutbound = createAlphaPayment({
  provider: "weixin",
  direction: "outbound",
  client: {
    developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
    publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
    privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
  },
});
```

x402 outbound context 暴露 `context.client.call()`；WeiXin outbound context 暴露
`context.client.preorder()`。context 不包含私钥、生成的签名、支付 headers 或 raw
gateway response。

## Alipay Inbound 与 Replay Protection

每个 `METHOD path` route 可配置静态 bill 或 async bill factory：

```ts
const alipayInbound = createAlphaPayment({
  provider: "alipay",
  direction: "inbound",
  client: {
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  },
  replayStore,
  routes: {
    "GET /api/report": {
      bill: async ({ request }) => ({
        outTradeNo: await reserveOrder(request),
        amount: "0.01",
        resourceId: "/api/report",
        payBefore: new Date(Date.now() + 5 * 60_000).toISOString(),
        sellerId: process.env.ALIPAY_SELLER_ID!,
        sellerName: "Example Seller",
        goodsName: "AI report",
        serviceId: "report-v1",
      }),
      maxResponseBytes: 1024 * 1024,
    },
  },
});
```

请求严格按以下顺序执行：

1. 缺失或非法 `Payment-Proof` 获得新的签名 402 challenge。
2. 验证结果必须匹配当前 bill 的 amount、order 和 resource。
3. replay store 原子 claim `tradeNo + route`。
4. 业务 handler 返回完整 Web `Response`。
5. Alpha 完整缓存响应并检查大小。
6. 确认支付宝履约。
7. 完成 replay claim，最后才释放资源响应。

默认响应上限为 1 MiB。Streaming、SSE 和已经消费的响应会被拒绝。如果 handler
在履约确认前失败，Alpha 会调用 `replayStore.abandon()`。如果履约确认失败或进入
不确定状态，Alpha 不会自动释放 claim，也不会发送资源 body。

开发环境可以不配置 replay store，runtime 会记录一次 warning。生产环境必须使用
Redis、数据库或其他具备原子 claim 能力的持久化实现。Alpha 不提供不安全的
进程内 map，因为它无法覆盖多 worker 和重启场景。

## 运维边界

- 每个 runtime 只负责一个 provider 和 direction。
- 接受多个 payment rail 时，为它们划分不同 route scope。
- 日志中不得包含 `Payment-Proof`、`Payment-Needed`、`PAYMENT-*`、私钥、签名或
  raw gateway response。
- Alpha middleware 日志只记录 provider、direction、route、status、latency、
  error type 和脱敏后的 network family。
- 履约 timeout 应视为不确定支付状态，先完成 reconciliation 再决定是否重试。

完整类型和校验规则见 [Middleware API 参考](/zh/api/middleware)。
