# SDK API 参考

本参考文档覆盖 Avery SDK Agent 支付工具和直接 x402 付费 HTTP 调用背后的公开 API。

所有公开 SDK API 都从 `@averyso/alpha` 导出。不要从
`packages/sdk/src/...` 内部路径导入。

支付功能不需要 Avery 账号。包仍通过 `@averyso/alpha` 安装和导入，但运行时支付
执行使用本地 x402 签名、你配置的钱包/私钥、RPC URL 和目标 x402 端点。Provider-side
结算可能在本地完成，也可能通过 provider 的 facilitator 完成，但 Avery SDK 不配置
这条路径。你不需要 Avery 账号、Avery API key、Avery 托管服务或注册。

```ts
import {
  AlipayAIPayClient,
  AlipayAIPayConfigError,
  X402Client,
  X402ConfigError,
  X402Error,
  X402Networks,
  X402PaymentError,
  WeiXinAIPayClient,
  WeiXinAIPayConfigError,
  buildAlipayAIPayPaymentNeededHeader,
  buildWeiXinAIPayPreorderRequest,
  encodeWeiXinAIPaymentRequired,
  parseAlipayAIPayPaymentProofHeader,
  resolveX402Network,
  signWeiXinAIPayPreorder,
  x402MastraTool,
  x402tool,
} from "@averyso/alpha";
```

## `WeiXinAIPayClient`

用于在 server runtime 中构建并发送 WeiXinAI Pay preorder 请求。

```ts
const client = new WeiXinAIPayClient({
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
});
```

构造函数签名：

```ts
new WeiXinAIPayClient(options);
```

`privateKey` 必须是 32 字节 SM2 私钥的 hex 字符串，可以带或不带 `0x`
前缀。该私钥应只保存在服务端。

### `WeiXinAIPayClientOptions`

```ts
interface WeiXinAIPayClientOptions {
  developerId: string;
  publicKeyId: string;
  privateKey: string;
  developerPlatform?: string;
  fetch?: typeof fetch;
  endpoint?: string;
  logLevel?: LogLevel;
  logger?: Logger;
  signatureEncoding?: "der" | "raw";
}
```

- `developerId`：WeiXinAI Pay developer identifier，会作为 `developer_id`
  发送。
- `publicKeyId`：WeiXinAI Pay public key identifier，会作为 `pub_key_id`
  发送。
- `privateKey`：本地签名使用的 SM2 私钥。
- `developerPlatform`：会作为 `developer_platform` 发送，默认 `"WXPAY"`。
- `fetch`：自定义 fetch 实现。如果没有传入且 `globalThis.fetch` 不存在，构造
  函数会抛出 `WeiXinAIPayConfigError`。
- `endpoint`：preorder 端点，默认
  `https://payapp.weixin.qq.com/palmpayminiapp/clawagentpay/preorder`。
- `logLevel`：默认 logger 的最低输出级别，默认 `"info"`。
- `logger`：自定义诊断 logger，需要提供 `debug`、`info`、`warn`、`error`
  方法。
- `signatureEncoding`：默认 `"der"`。设置为 `"raw"` 时会发送 raw `r || s`
  签名。

### `preorder(paymentRequired, options?)`

```ts
const result = await client.preorder(
  {
    appid: "wx-miniapp",
    mchid: "1900000109",
    out_trade_no: "order-1001",
    description: "AI agent request",
    amount: {
      total: 100,
      currency: "CNY",
    },
  },
  {
    signal: abortController.signal,
  },
);

result.paymentCode;
result.rawResponse.payment_code;
```

```ts
interface WeiXinAIPayPreorderOptions {
  signal?: AbortSignal;
  timestamp?: string;
  nonceStr?: string;
  developerPlatform?: string;
  endpoint?: string;
  signatureEncoding?: "der" | "raw";
}

interface WeiXinAIPayPreorderResult {
  paymentCode: string;
  rawResponse: {
    payment_code: string;
  };
}
```

`timestamp` 默认是 Unix seconds 字符串。`nonceStr` 默认是 crypto-secure
random hex string。请求会以 `POST` JSON 发送，并带上
`Content-Type: application/json`。

### Request Builder

如果由其他 HTTP 层负责发送请求，可以直接使用底层 builder：

```ts
const body = buildWeiXinAIPayPreorderRequest(paymentRequired, {
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
  timestamp: "1735689600",
  nonceStr: "abcdef0123456789abcdef0123456789",
});
```

返回的 JSON body wire shape 如下：

```ts
interface WeiXinAIPayPreorderRequest {
  signature_type: "WEIXINAIPAY-SM2-WITH-SM3";
  developer_platform: string;
  developer_id: string;
  pub_key_id: string;
  nonce_str: string;
  timestamp: string;
  signature: string;
  payment_required: string;
}
```

`encodeWeiXinAIPaymentRequired(value)` 会执行 `JSON.stringify(value)`，并将
UTF-8 JSON bytes 做 Base64 编码。`signWeiXinAIPayPreorder(input, options)`
严格使用 WeiXinAI 签名规则：

```ts
const signString = `${timestamp}\n${nonceStr}\n${paymentRequired}\n`;
```

SDK 会计算该字符串的 SM3 digest，用 SM2 对 digest 签名，并将签名字节做
Base64 编码。

## `AlipayAIPayClient`

实现支付宝 AI 按量付费（Alipay Agent 支付的基于 402 的 A2M 方案）的商家侧
流程：为 `402 Payment Required` 响应构建带签名的 `Payment-Needed` 账单、通过
支付宝 OpenAPI 网关验证 `Payment-Proof` 支付凭证，并在资源交付后发送履约
回执。

```ts
const client = new AlipayAIPayClient({
  appId: process.env.ALIPAY_APP_ID!,
  privateKey: process.env.ALIPAY_APP_PRIVATE_KEY!,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
});
```

`privateKey` 是支付宝应用 RSA 私钥，可以是 PEM 字符串，也可以是从支付宝
控制台复制的裸 Base64 PKCS#8/PKCS#1 内容（也接受 Node `KeyObject`）。该私钥
应只保存在服务端。

### `AlipayAIPayClientOptions`

```ts
interface AlipayAIPayClientOptions {
  appId: string;
  privateKey: string | KeyObject;
  alipayPublicKey?: string | KeyObject;
  appAuthToken?: string;
  gatewayEndpoint?: string;
  fetch?: typeof fetch;
  logLevel?: LogLevel;
  logger?: Logger;
}
```

- `appId`：支付宝应用 ID。会作为 `app_id` 发送，同时是 `Payment-Needed`
  账单中 `seller_app_id` 的默认值。
- `privateKey`：应用 RSA 私钥，用于账单和网关请求的 RSA2（SHA256withRSA）
  签名。
- `alipayPublicKey`：支付宝公钥。提供后会验证网关响应签名，验签失败抛出
  `AlipayAIPayResponseError`。
- `appAuthToken`：第三方代调用的授权 token，会作为 `app_auth_token` 发送。
- `gatewayEndpoint`：支付宝 OpenAPI 网关，默认
  `https://openapi.alipay.com/gateway.do`。
- `fetch`、`logLevel`、`logger`：语义与其他 client 一致。

### `buildPaymentNeededHeader(input)`

为 `402 Payment Required` 响应构建 Base64URL（无 padding）编码的
`Payment-Needed` header。账单中的 `seller_signature` 是对 `amount`、
`currency`、`goods_name`、`out_trade_no`、`pay_before`、`resource_id`、
`seller_id`、`service_id` 按 key 字典序拼接 `key=value&...` 后的 RSA2 签名。
加签只在本地完成，不会请求支付宝服务端。

```ts
const { header, paymentNeeded } = client.buildPaymentNeededHeader({
  outTradeNo: "ORDER_1739836600000_abc123",
  amount: "0.01",
  resourceId: "/market/antgroup/trend",
  payBefore: "2026-03-25T12:00:00+08:00",
  sellerId: "2088123456789012",
  sellerName: "测试商家",
  goodsName: "AI 生成内容服务",
  serviceId: "service_ai_content_001",
});

// 返回 HTTP 402，并设置 `Payment-Needed: ${header}`
```

`currency` 默认 `"CNY"`，`seller_unique_id_key` 固定为 `"seller_id"`，
`sellerAppId` 默认使用 client 的 `appId`（第三方代调用时需显式传入三方应用的
app_id）。

### `parsePaymentProofHeader(header)`

解码 `Payment-Proof` 请求头（标准 Base64 或 Base64URL，带不带 padding 均可）
并校验分层结构。

```ts
const proof = client.parsePaymentProofHeader(request.headers["payment-proof"]);

proof.paymentProof; // protocol.payment_proof
proof.tradeNo; // protocol.trade_no
proof.clientSession; // method.client_session，可选
```

格式非法时抛出 `AlipayAIPayRequestError`。

### `verifyPayment(input, options?)`

发送签名后的网关请求调用 `alipay.aipay.agent.payment.verify`。可以直接传入
解析后的 `Payment-Proof` 对象。

```ts
const result = await client.verifyPayment(proof, {
  expect: {
    amount: "0.01",
    outTradeNo: order.outTradeNo,
    resourceId: "/market/antgroup/trend",
  },
});

if (!result.verified) {
  // 返回新的 402 Payment-Needed 账单
}
```

```ts
interface AlipayAIPayVerifyPaymentOptions {
  signal?: AbortSignal;
  timestamp?: string;
  gatewayEndpoint?: string;
  appAuthToken?: string;
  expect?: {
    amount?: string;
    outTradeNo?: string;
    resourceId?: string;
  };
}

interface AlipayAIPayPaymentVerifyResult {
  active: boolean;
  amount: string;
  outTradeNo: string;
  resourceId: string;
  tradeNo: string;
  verified: boolean;
  mismatches: string[];
  rawResponse: AlipayAIPayPaymentVerifyWireResponse;
}
```

只有当 `active` 为 `true` 且提供的每个 `expect` 字段都与网关响应一致时，
`verified` 才为 `true`（`expect` 按字符串精确比较）。业务失败（例如
`PAYMENT_PROOF_NOT_FOUND`）会抛出 `AlipayAIPayResponseError`，`details` 中
带有 `code`、`subCode`、`subMsg`。`trade_no` 的防重复履约仍需由商家侧
持久化保证。

### `confirmFulfillment(tradeNo, options?)`

资源交付后调用 `alipay.aipay.agent.fulfillment.confirm`。可以直接传交易号
字符串，也可以传 `{ tradeNo }`。

```ts
await client.confirmFulfillment(result.tradeNo);
```

### Request Builders

如果由其他 HTTP 层负责发送网关请求，可以使用底层 helper：
`buildAlipayAIPayGatewayRequest()` 为任意 OpenAPI method 返回签名后的表单
参数、body 和 sign content；`signAlipayAIPayBill()` 和
`alipayAIPayBillSignContent()` 暴露账单加签；
`parseAlipayAIPayGatewayResponse()` 解析并按需验签网关 `Response`；
`alipayAIPayGatewayTimestamp()` 生成网关要求的 UTC+8
`yyyy-MM-dd HH:mm:ss` 时间戳。

错误类型与其他 client 保持同样的层级：`AlipayAIPayError` 是基类，
`AlipayAIPayConfigError` 覆盖配置和密钥错误，`AlipayAIPayRequestError` 覆盖
请求构建和传输失败，`AlipayAIPayResponseError` 携带 HTTP `status` 以及网关
`code`/`sub_code` 详情。

## `X402Client`

用于支付并调用 x402-protected HTTP 端点。

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});
```

构造函数签名：

```ts
new X402Client(privateKey, options);
```

EVM 网络的 `privateKey` 必须是 32 字节 hex 字符串，可以带或不带 `0x`
前缀。Solana 网络的 `privateKey` 必须是 base58 编码的 64 字节 Solana secret
key。

### `X402ClientOptions`

```ts
interface X402ClientOptions {
  network: X402NetworkInput;
  logLevel?: LogLevel;
  logger?: Logger;
  fetch?: typeof fetch;
  maxAmount?: bigint;
  rpcUrl?: string;
}
```

- `network`：必填 x402 网络。可传 `X402Networks` 常量、friendly name、primary
  slug，或原始 CAIP-2 `Network` 字符串。
- `logLevel`：默认 logger 的最低输出级别，默认 `"info"`。
- `logger`：自定义 logger，需要提供 `debug`、`info`、`warn`、`error` 方法。
- `fetch`：自定义 fetch 实现。如果没有传入且 `globalThis.fetch` 不存在，构造
  函数会抛出 `X402ConfigError`。
- `maxAmount`：默认支付上限，默认 `100000n`。
- `rpcUrl`：可选 RPC URL，会传给 payment scheme。

这里有意没有 `facilitator` 选项。`X402ClientOptions` 配置 buyer-side wallet、
network、cap、fetch、logging 和 RPC 行为。Resource server 控制它接受的资产、
payment scheme、定价和 provider-side 结算路径。

`maxAmount` 是原子单位的支付上限，不是十进制字符串。

### 网络选择

```ts
new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: "Base Sepolia",
});

new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
});

resolveX402Network("base-sepolia"); // "eip155:84532"
```

`client.network` 始终返回标准化后的 CAIP-2，因此
`new X402Client(key, { network: "Base Sepolia" }).network` 是
`"eip155:84532"`。既有的原始 CAIP-2 输入，例如 `"eip155:84532"`，仍然可用。

friendly name、primary slug 和内置 alias 会先 trim、合并连续空白并忽略大小写后
匹配。原始 `eip155:*` CAIP-2 值会继续透传以保持兼容；原始 Solana CAIP-2 值
必须是下表中受支持的 Solana 条目之一。

```ts
const X402Networks: {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  base: "eip155:8453";
  polygon: "eip155:137";
  xLayer: "eip155:196";
  peaq: "eip155:3338";
  sei: "eip155:1329";
  skaleBase: "eip155:1187947933";
  kiteAI: "eip155:2366";
  arbitrum: "eip155:42161";
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
  baseSepolia: "eip155:84532";
  avalancheFuji: "eip155:43113";
  polygonAmoy: "eip155:80002";
  xLayerTestnet: "eip155:1952";
  seiTestnet: "eip155:713715";
  skaleBaseSepolia: "eip155:324705682";
  arbitrumSepolia: "eip155:421614";
};

type X402NetworkInput = X402NetworkName | X402NetworkSlug | Network | string;

function resolveX402Network(input: X402NetworkInput): Network;
```

内置 friendly name 和 primary slug：

| Friendly Name        |         Primary Slug | CAIP-2                                    |
| -------------------- | -------------------: | ----------------------------------------- |
| `Solana Mainnet`     |             `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet`       |               `base` | `eip155:8453`                             |
| `Polygon Mainnet`    |            `polygon` | `eip155:137`                              |
| `xLayer Mainnet`     |             `xlayer` | `eip155:196`                              |
| `Peaq Mainnet`       |               `peaq` | `eip155:3338`                             |
| `Sei Mainnet`        |                `sei` | `eip155:1329`                             |
| `SKALE Base`         |         `skale-base` | `eip155:1187947933`                       |
| `KiteAI Mainnet`     |             `kiteai` | `eip155:2366`                             |
| `Arbitrum One`       |           `arbitrum` | `eip155:42161`                            |
| `Solana Devnet`      |      `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia`       |       `base-sepolia` | `eip155:84532`                            |
| `Avalanche Fuji`     |     `avalanche-fuji` | `eip155:43113`                            |
| `Polygon Amoy`       |       `polygon-amoy` | `eip155:80002`                            |
| `xLayer Testnet`     |     `xlayer-testnet` | `eip155:1952`                             |
| `Sei Testnet`        |        `sei-testnet` | `eip155:713715`                           |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `eip155:324705682`                        |
| `Arbitrum Sepolia`   |   `arbitrum-sepolia` | `eip155:421614`                           |

### 属性

```ts
client.network;
client.maxAmount;
```

- `network`：标准化后的 CAIP-2 `Network`。
- `maxAmount`：client 默认支付上限。

### `call(endpoint, init?, opts?)`

```ts
const result = await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { maxAmount: 50_000n },
);
```

默认情况下，`call()` resolve 为 `EndpointResult`。设置
`throwOnError: true` 后，失败结果会抛出 `X402PaymentError`。

```ts
await client.call(
  "https://api.example.com/weather",
  { query: { city: "Tokyo" } },
  { throwOnError: true },
);
```

```ts
interface X402CallOptions {
  signal?: AbortSignal;
  maxAmount?: bigint;
  throwOnError?: boolean;
}
```

`maxAmount` 可以在 client、单次 call 或 `x402tool()` 上设置。越具体的配置优先级
越高。

## `x402tool(config)`

创建一个兼容 Vercel AI SDK `ToolSet` 的 tool，底层调用 x402 端点。

```ts
import { jsonSchema } from "ai";
import { X402Client, X402Networks, x402tool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const tools = {
  getWeather: x402tool<{ city: string }>({
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

`endpoint` 可以是静态值：

```ts
x402tool({
  client,
  inputSchema,
  endpoint: "https://api.example.com/weather",
});
```

也可以根据输入动态生成：

```ts
x402tool<{ city: string }>({
  client,
  inputSchema,
  endpoint: (input) => ({
    url: "https://api.example.com/weather",
    query: { city: input.city },
  }),
});
```

没有提供 `request` 时，tool input 会自动映射：

- `GET`、`HEAD`、`DELETE` 的 plain object input 会加入 query string。
- `POST`、`PUT`、`PATCH` 的 input 会作为 JSON body 发送。

提供 `request` 后，自动 input mapping 会被禁用：

```ts
x402tool<{ prompt: string }>({
  client,
  inputSchema,
  endpoint: "https://api.example.com/summarize",
  request: (input) => ({
    method: "POST",
    body: { text: input.prompt },
  }),
});
```

没有 `execute` 时，tool 返回 `EndpointResult`。提供 `execute` 时，该函数接收
`{ endpoint, input }`，可返回更适合模型消费的值：

```ts
x402tool<{ city: string }, { forecast: unknown }>({
  client,
  inputSchema,
  endpoint: "https://api.example.com/weather",
  execute: ({ endpoint }) => ({
    forecast: endpoint.kind === "success" ? endpoint.body : null,
  }),
});
```

### `X402ToolConfig`

```ts
type X402ToolConfig<INPUT, OUTPUT = EndpointResult> = {
  client: X402Client;
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput);
  request?: (
    input: INPUT,
  ) =>
    | EndpointRequestInit
    | EndpointConfig
    | undefined
    | PromiseLike<EndpointRequestInit | EndpointConfig | undefined>;
  maxAmount?: bigint;
  throwOnError?: boolean;
  execute?: (
    context: { endpoint: EndpointResult; input: INPUT },
    options: X402ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT>;
};
```

配置还接受 `X402Tool` 实现的 AI SDK 风格字段，例如 `description`、`title`、
`inputSchema`、`outputSchema`、`needsApproval`、`strict` 和输入流回调。

### `X402ToolExecutionOptions`

```ts
interface X402ToolExecutionOptions {
  toolCallId: string;
  messages: unknown[];
  abortSignal?: AbortSignal;
  experimental_context?: unknown;
}
```

这些选项来自 AI SDK tool 执行上下文，会透传给 tool。

## `x402MastraTool(config)`

创建一个兼容 Mastra `createTool()` 的 tool，底层调用 x402 端点。Mastra agent 使用
这个 helper；Vercel AI SDK `ToolSet` 集成继续使用 `x402tool()`。

```ts
import { z } from "zod";
import { X402Client, X402Networks, x402MastraTool } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
});

const paidWeather = x402MastraTool({
  id: "paid-weather",
  client,
  description: "Get current weather for a city from a paid x402 endpoint.",
  inputSchema: z.object({
    city: z.string(),
  }),
  endpoint: "https://api.example.com/weather",
  maxAmount: 50_000n,
  execute: ({ endpoint }) => ({
    ok: endpoint.ok,
    weather: endpoint.ok ? endpoint.body : null,
  }),
});
```

`x402MastraTool()` 不会在运行时 import `@mastra/core`，也不会把 Mastra 加成
Avery SDK 的依赖。你的应用负责安装并运行 Mastra；helper 返回结构兼容的 Mastra
tool object，并设置 Mastra tool marker。

### `X402MastraToolConfig`

```ts
type X402MastraToolConfig<INPUT, OUTPUT = EndpointResult, ID extends string = string> = {
  id: ID;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  client: X402Client;
  endpoint: EndpointInput | ((input: INPUT) => EndpointInput);
  request?: (
    input: INPUT,
  ) =>
    | EndpointRequestInit
    | EndpointConfig
    | undefined
    | PromiseLike<EndpointRequestInit | EndpointConfig | undefined>;
  maxAmount?: bigint;
  throwOnError?: boolean;
  execute?: (
    context: { endpoint: EndpointResult; input: INPUT },
    options: X402MastraToolExecutionContext,
  ) => OUTPUT | PromiseLike<OUTPUT>;
};
```

配置还接受 Mastra tool 字段，包括 `requireApproval`、`strict`、`providerOptions`、
`toModelOutput`、`transform`、`inputExamples`、`mcp`、`mcpMetadata`、
`requestContextSchema`、`suspendSchema` 和 `resumeSchema`。

`endpoint`、request override、自动 input mapping、`maxAmount` 和 `throwOnError`
行为与 `x402tool()` 一致。没有 `execute` 时，tool 返回 `EndpointResult`。提供
`execute` 时，建议返回更小、适合模型消费的结构，不要把完整 payment 和 HTTP 结果
暴露给模型。

### `X402MastraToolExecutionContext`

```ts
interface X402MastraToolExecutionContext {
  abortSignal?: AbortSignal;
  toolCallId?: string;
  messages?: unknown[];
  requestContext?: unknown;
  workspace?: unknown;
  [key: string]: unknown;
}
```

Mastra 会把这个 context 传给 tool。Avery SDK 使用其中的 `abortSignal` 控制底层
x402 HTTP 请求，并把整个对象透传给你的 `execute` mapper。

在 Mastra `Agent` 中注册 tools 时，Mastra stream 的 `toolName` 来自 object key，
不是 tool 的 `id`：

```ts
tools: {
  paidWeather, // toolName: "paidWeather"
  [paidWeather.id]: paidWeather, // toolName: "paid-weather"
}
```

## Endpoint 类型

### `EndpointConfig`

```ts
interface EndpointConfig {
  url: string | URL;
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}
```

当端点本身需要携带 method、headers、query 或 body 默认值时使用
`EndpointConfig`。

### `EndpointInput`

```ts
type EndpointInput = string | URL | EndpointConfig;
```

`X402Client.call()` 和 `x402tool()` 的 endpoint 配置都接受这个类型。

### `EndpointRequestInit`

```ts
interface EndpointRequestInit extends Omit<RequestInit, "body" | "headers" | "method"> {
  method?: EndpointMethod | Lowercase<EndpointMethod> | string;
  headers?: HeadersInput;
  query?: URLSearchParams | Record<string, unknown>;
  body?: RequestBody | JsonValue;
}
```

可作为 `client.call()` 的第二个参数，也可作为 `x402tool()` 的 `request` 函数返回值。

## `EndpointResult`

`EndpointResult` 是以 `kind` 为判别字段的联合类型。
关于每个 kind 在支付生命周期中的含义，见
[核心概念](/zh/guide/concepts#endpointresult-kind)。重试策略和面向用户的处理建议见
[错误处理](/zh/guide/error-handling)。

```ts
const result = await client.call("https://api.example.com/weather");

if (result.kind === "success") {
  console.log(result.paymentResponse, result.body);
}
```

`kind` 取值：

- `success`：端点已支付，并返回成功的 settled response。
- `settle_failed`：端点响应后，支付结算失败。
- `payment_required`：端点要求支付，但没有完成兼容支付。
- `error`：端点请求或 x402 支付流程失败。
- `passthrough`：响应不需要支付，直接透传返回。

每个变体都包含：

```ts
interface EndpointResultMetadata {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

联合类型还暴露 `ok`、`paid`、`status`、`body`、`paymentResponse` 和
`metadata`。读取支付相关字段前，建议先按 `kind` 收窄类型。

## 错误

生产环境错误处理、重试策略和安全的模型侧 tool 输出建议见
[错误处理](/zh/guide/error-handling)。

### `X402Error`

x402 SDK 错误的基类。

```ts
try {
  await client.call("https://api.example.com/weather", undefined, {
    throwOnError: true,
  });
} catch (error) {
  if (error instanceof X402Error) {
    console.error(error.details);
  }
}
```

### `X402ConfigError`

SDK 配置无效时抛出，包括私钥格式错误、不支持的网络输入、不支持的 Solana
CAIP-2 网络，或缺少 `fetch`。

### `X402PaymentError`

设置 `throwOnError: true` 后，付费端点失败时抛出。包含 `status` 和可选
`details`。

```ts
if (error instanceof X402PaymentError) {
  console.error(error.status, error.details);
}
```

### `X402ErrorDetails`

```ts
interface X402ErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}
```

供 `X402Error`、`X402ConfigError` 和 `X402PaymentError` 使用。

## 日志

### `Logger`

```ts
interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
```

### `LogLevel`

```ts
type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
```

通过 `X402ClientOptions` 的 `logger` 和 `logLevel` 传入。

## x402 Core 类型

### `Network`

从 `@x402/core/types` 重新导出。原始 CAIP-2 字符串仍然可用于向后兼容。未知
friendly name 和不支持的原始 Solana CAIP-2 值会抛出 `X402ConfigError`，并在
`details.network` 和 `details.supportedNetworks` 中提供上下文。

### `SettleResponse`

从 `@x402/core/types` 重新导出。`success` 和 `settle_failed` 类型的结果会包含
`paymentResponse: SettleResponse`。

## CommonJS

包也支持 CommonJS 使用方式：

```js
const { AlipayAIPayClient, X402Client, x402tool } = require("@averyso/alpha");
```
