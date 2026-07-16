# Middleware API 参考

根包导出 framework-neutral runtime、配置类型、context、replay-store contract 和
错误：

```ts
import {
  AlphaPaymentConfigError,
  AlphaPaymentRuntime,
  createAlphaPayment,
  type AlphaPaymentConfig,
  type AlphaPaymentContext,
  type AlphaPaymentDirection,
  type AlphaPaymentProvider,
  type AlphaReplayStore,
  type AlphaRequestContext,
} from "@averyso/alpha";
```

Framework adapter 使用独立入口，因此导入 `@averyso/alpha` 不会加载 Express、
Hono 或 Next.js。

## `createAlphaPayment(config)`

创建可复用 runtime，并立即校验 provider capability：

```ts
type AlphaPaymentProvider = "x402" | "alipay" | "weixin";
type AlphaPaymentDirection = "inbound" | "outbound";
```

| 配置                  | 结果                      |
| --------------------- | ------------------------- |
| `x402` + `inbound`    | 有效                      |
| `x402` + `outbound`   | 有效                      |
| `alipay` + `inbound`  | 有效                      |
| `weixin` + `outbound` | 有效                      |
| `alipay` + `outbound` | `AlphaPaymentConfigError` |
| `weixin` + `inbound`  | `AlphaPaymentConfigError` |

JavaScript 调用或绕过 public union 的 TypeScript 调用也会得到相同运行时校验。

## `AlphaPaymentRuntime`

```ts
class AlphaPaymentRuntime {
  readonly provider: AlphaPaymentProvider;
  readonly direction: AlphaPaymentDirection;
  initialize(): Promise<void>;
}
```

`initialize()` 每次都返回同一个缓存 Promise。x402 inbound 会初始化官方 HTTP
resource server、同步 facilitator capability，并校验 route scheme 支持。framework
adapter 会在处理请求前调用；应用也可以在启动时主动调用。

## x402 Inbound 配置

```ts
interface AlphaX402InboundConfig {
  provider: "x402";
  direction: "inbound";
  routes: AlphaX402RoutesConfig;
  network?: X402NetworkInput | readonly X402NetworkInput[];
  server?: x402ResourceServer;
  facilitator?: string | FacilitatorConfig;
  schemes?: "auto" | readonly AlphaX402SchemeRegistration[];
  paywallConfig?: PaywallConfig;
  paywall?: PaywallProvider;
  logLevel?: LogLevel;
  logger?: Logger;
}

interface AlphaX402SchemeRegistration {
  network: X402NetworkInput;
  server: SchemeNetworkServer;
}
```

规则：

- `routes` 保留官方 x402 `RoutesConfig` 字段，同时允许 Avery network alias。
- 顶层 `network` 是 allowlist，所有 route network 都必须在其中。
- `server` 保留自定义 facilitator、scheme、extension 和 hook。
- `server` 不能和 `facilitator` 或 `schemes` 同时配置。
- 未提供 `server` 时，`facilitator` 和 `schemes` 都是必填项。
- facilitator 字符串转换为 `new HTTPFacilitatorClient({ url })`。
- facilitator config 必须包含显式非空 `url`。
- `schemes: "auto"` 按规范化 route network 注册官方 exact EVM/Solana server
  scheme。
- 不使用默认 facilitator 地址。

## x402 Outbound 配置

```ts
interface AlphaX402OutboundConfig {
  provider: "x402";
  direction: "outbound";
  network: X402NetworkInput;
  privateKey?: string;
  client?: X402Client;
  fetch?: typeof fetch;
  maxAmount?: bigint;
  rpcUrl?: string;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

传入现有 `X402Client` 或 `privateKey`。使用 `client` 时，其规范化 network 必须和
顶层 `network` 一致。注入的 context 包含同一个可复用 client。Alpha 不替换或
包装全局 `fetch`。

## Alipay Inbound 配置

```ts
interface AlphaAlipayInboundConfig {
  provider: "alipay";
  direction: "inbound";
  client: AlipayAIPayClient | AlipayAIPayClientOptions;
  routes: Record<string, AlipayRouteConfig>;
  replayStore?: AlphaReplayStore;
  logLevel?: LogLevel;
  logger?: Logger;
}

interface AlipayRouteConfig {
  bill:
    | AlipayAIPayClientBillInput
    | ((
        context: AlphaRequestContext,
      ) => AlipayAIPayClientBillInput | Promise<AlipayAIPayClientBillInput>);
  maxResponseBytes?: number;
}

interface AlphaRequestContext {
  provider: "alipay";
  direction: "inbound";
  request: Request;
  route: string;
}
```

Route key 使用 `METHOD /path`，method 或 path 可包含 `*`。默认
`maxResponseBytes` 为 `1_048_576` bytes，配置值必须是正 safe integer。

Alipay 和 WeiXin 配置中出现已定义的 `network` 字段会在创建时抛错。

## WeiXin Outbound 配置

```ts
interface AlphaWeiXinOutboundConfig {
  provider: "weixin";
  direction: "outbound";
  client: WeiXinAIPayClient | WeiXinAIPayClientOptions;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

传入 options 时，runtime 会创建现有 `WeiXinAIPayClient`。注入的 client 保留完整
`preorder(paymentRequired, options?)` contract，包括 call-level abort signal 和
endpoint options。

## Payment Context

```ts
type AlphaPaymentContext =
  | {
      provider: "x402";
      direction: "inbound";
    }
  | {
      provider: "x402";
      direction: "outbound";
      client: X402Client;
    }
  | {
      provider: "alipay";
      direction: "inbound";
      payment: AlphaAlipayPaymentVerification | null;
    }
  | {
      provider: "weixin";
      direction: "outbound";
      client: WeiXinAIPayClient;
    };
```

Alipay wrapper 收到未命中 protected route 的请求时，`payment` 为 `null`。已验证
context 包含 `active`、`amount`、`outTradeNo`、`resourceId` 和 `tradeNo`，不包含
gateway raw response 或 proof material。

## `AlphaReplayStore`

```ts
interface AlphaReplayStore {
  claim(input: {
    provider: "alipay";
    tradeNo: string;
    route: string;
  }): Promise<"claimed" | "in_progress" | "completed">;

  complete(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;

  abandon(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;
}
```

`claim()` 必须在所有应用 worker 之间保持原子性。`complete()` 记录已经确认的履约。
`abandon()` 只释放明确发生在履约确认前的失败。确认 timeout 或其他不确定状态发生
后，Alpha 不会 abandon claim。

## Express 导出

```ts
import {
  alphaExpressMiddleware,
  getAlphaPaymentContext,
  withAlphaExpress,
} from "@averyso/alpha/express";
```

### `alphaExpressMiddleware(runtime)`

- x402 inbound 委托 `@x402/express`。
- x402 或 WeiXin outbound context 注入 request。
- Alipay inbound 立即抛错，因为普通 `res.send()`/`res.json()` 无法保证
  fulfillment-before-delivery。

### `withAlphaExpress(runtime, handler)`

handler 接收 `(request: Request, context: AlphaPaymentContext)`，并必须返回完整 Web
`Response`。Express output 会在 wrapper 完整缓存并校验 response 后才提交。Alipay
还会先完成履约和 replay completion。

### `getAlphaPaymentContext(request)`

返回 Alpha 注入的 context；middleware 未执行时抛 `AlphaPaymentConfigError`。

## Hono 导出

```ts
import { alphaHonoMiddleware, getAlphaPaymentContext, withAlphaHono } from "@averyso/alpha/hono";
```

Hono API 与 Express provider behavior 一致。context 存储在 Hono 的
`alphaPayment` variable。wrapper handler 接收 raw Web `Request` 并返回 Web
`Response`。

## Next.js 导出

```ts
import { alphaNextProxy, withAlphaNext } from "@averyso/alpha/next";
```

### `withAlphaNext(runtime, handler)`

包装 App Router route handler，callback 签名为：

```ts
type AlphaNextHandler<RouteContext = unknown> = (
  request: NextRequest,
  paymentContext: AlphaPaymentContext,
  routeContext: RouteContext,
) => Response | Promise<Response>;
```

x402 inbound 使用官方 `withX402FromHTTPServer` 语义。原生 Web response 会在交给
官方 settlement wrapper 前完整缓存。Alipay 使用相同的履约后交付 contract。

### `alphaNextProxy(runtime)`

返回用于页面或通配路径的 Next.js proxy handler。仅接受
`provider: "x402", direction: "inbound"`，不是 Alipay 或 WeiXin Edge adapter。

## Response Contract

Wrapper handler 必须返回尚未消费、有限大小的 Web `Response`。以下响应会被拒绝：

- 非 `Response` 值；
- body 已经消费；
- 超过 Alipay 配置上限；
- SSE (`text/event-stream`)、`Transfer-Encoding` 或显式 no-buffering 响应。

Alipay fulfillment confirmation 或 replay completion 失败时，资源 body 永远不会
发送。

## 错误与日志

`AlphaPaymentConfigError` 覆盖不支持的 provider/direction、非法凭据、禁止的
`network` 字段、冲突的 x402 server 配置、非法 route 和 adapter 误用。

Middleware 复用现有 `Logger`/`LogLevel` contract，只记录 provider、direction、
route、status、latency、error type 和脱敏 network family；不记录 payment proof、
payment challenge、x402 payment header、私钥、签名或 raw gateway response。
