# SDK API 参考

本参考文档覆盖 Alpha Agent 支付工具和直接 x402 付费 HTTP 调用背后的公开 API。

所有公开 SDK API 都从 `@averyso/alpha` 导出。不要从
`packages/sdk/src/...` 内部路径导入。

```ts
import {
  AlphaClient,
  AlphaError,
  X402Client,
  X402ConfigError,
  X402Error,
  X402Networks,
  X402PaymentError,
  resolveX402Network,
  x402tool,
} from "@averyso/alpha";
```

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

| Friendly Name | Primary Slug | CAIP-2 |
|---|---:|---|
| `Solana Mainnet` | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet` | `base` | `eip155:8453` |
| `Polygon Mainnet` | `polygon` | `eip155:137` |
| `xLayer Mainnet` | `xlayer` | `eip155:196` |
| `Peaq Mainnet` | `peaq` | `eip155:3338` |
| `Sei Mainnet` | `sei` | `eip155:1329` |
| `SKALE Base` | `skale-base` | `eip155:1187947933` |
| `KiteAI Mainnet` | `kiteai` | `eip155:2366` |
| `Arbitrum One` | `arbitrum` | `eip155:42161` |
| `Solana Devnet` | `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia` | `base-sepolia` | `eip155:84532` |
| `Avalanche Fuji` | `avalanche-fuji` | `eip155:43113` |
| `Polygon Amoy` | `polygon-amoy` | `eip155:80002` |
| `xLayer Testnet` | `xlayer-testnet` | `eip155:1952` |
| `Sei Testnet` | `sei-testnet` | `eip155:713715` |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `eip155:324705682` |
| `Arbitrum Sepolia` | `arbitrum-sepolia` | `eip155:421614` |

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
interface EndpointRequestInit
  extends Omit<RequestInit, "body" | "headers" | "method"> {
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
[核心概念](/zh/guide/concepts#endpointresult-kind)。

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

## `AlphaClient`

`AlphaClient` 是轻量级 Alpha 状态客户端。它仍然从包根导出，但 x402 集成应使用
`X402Client`。

```ts
import { AlphaClient } from "@averyso/alpha";
```

### 构造函数

```ts
const client = new AlphaClient({
  apiKey: process.env.ALPHA_API_KEY,
  baseUrl: "https://api.avery.so/alpha",
});
```

### `AlphaClientOptions`

```ts
interface AlphaClientOptions {
  apiKey?: string;
  baseUrl?: string | URL;
  fetch?: typeof fetch;
}
```

- `apiKey`：可选 bearer token，会随状态请求发送。
- `baseUrl`：可选 API base URL，默认 `https://api.avery.so/alpha`。
- `fetch`：可选 fetch 实现。

### `getStatus()`

```ts
const status = await client.getStatus();
```

返回：

```ts
interface AlphaStatus {
  ok: boolean;
  service: "alpha";
}
```

HTTP 响应不成功时抛出 `AlphaError`。

## `AlphaError`

```ts
import { AlphaError } from "@averyso/alpha";
```

`AlphaClient.getStatus()` 收到非成功状态响应时抛出 `AlphaError`。错误实例包含
HTTP status code。

```ts
try {
  await client.getStatus();
} catch (error) {
  if (error instanceof AlphaError) {
    console.error(error.status);
  }
}
```

## CommonJS

包也支持 CommonJS 使用方式：

```js
const { AlphaClient, X402Client, x402tool } = require("@averyso/alpha");
```
