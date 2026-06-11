# 可观测性与审计日志

生产支付 agent 需要两类可见性：

- 用于 SDK 和 runtime troubleshooting 的 diagnostic logs。
- 用于 spend decisions、approvals、paid attempts 和用户可见结果的 application audit
  events。

Avery SDK 的 `Logger` interface 是 diagnostic。它适合 SDK-level messages，但不是完整
audit trail。请围绕每次付费调用前后的应用决策点构建 audit trail。

## Diagnostic Logger

当你希望 Avery SDK 内部 diagnostic messages 使用自己的日志系统时，在
`X402ClientOptions` 中传入 `logger` 和 `logLevel`。

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  logLevel: process.env.X402_LOG_LEVEL === "debug" ? "debug" : "info",
  logger,
});
```

Logger shape 是：

```ts
interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
```

生产默认使用 `info`，只在聚焦排查时使用 `debug`。只有当其他层已经捕获所有必要诊断
信息时，才使用 `silent`。

## Logger Adapters

内置 `console` object 已经匹配该 interface：

```ts
const client = new X402Client(privateKey, {
  network,
  logger: console,
});
```

对于 `pino`，显式适配 Avery SDK 的 `(message, details)` 调用形状。Pino 常见的
structured logging style 通常是 object 在前、message 在后。

```ts
import pino from "pino";

const pinoLogger = pino();

const logger = {
  debug: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.debug(details ?? {}, message),
  info: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.info(details ?? {}, message),
  warn: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.warn(details ?? {}, message),
  error: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.error(details ?? {}, message),
};
```

对于 `winston`，传入 message，并把 details 展开为 metadata：

```ts
import winston from "winston";

const winstonLogger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

const logger = {
  debug: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.debug(message, details ?? {}),
  info: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.info(message, details ?? {}),
  warn: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.warn(message, details ?? {}),
  error: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.error(message, details ?? {}),
};
```

## Audit Events

围绕 paid calls 发出 application audit events。一个有用的 sequence 是：

- `payment_tool_requested`：模型或应用请求付费执行。
- `payment_budget_reserved`：应用为 cap 预留预算。
- `payment_approval_requested`：应用请求授权。
- `payment_approval_recorded`：用户或 policy 批准或拒绝执行。
- `payment_call_started`：服务端开始 Avery SDK request。
- `payment_call_finished`：服务端收到 `EndpointResult`。
- `payment_budget_committed` 或 `payment_budget_refunded`：ledger 结算 reservation。

这些事件应由你的应用发出，因为它们包含 Avery SDK 不知道的 user、conversation、
budget 和 approval context。

## Recommended Fields

捕获足够字段以重建事件经过，同时不要存储 secrets：

- `eventName` 和 `timestamp`。
- `requestId`、trace id 或 span id。
- `toolName`。
- `userId`、`sessionId` 和 `conversationId`。
- AI SDK `toolCallId`。
- Endpoint host、path、method 和 environment。
- Network，以及可用时的 asset identifier。
- Atomic-unit amount cap。
- Budget reservation id 和 budget scope。
- Approval decision、approver id、authorization scope 和 expiry。
- `EndpointResult.kind`、`ok`、`paid`、HTTP status 和 latency。
- Success 和 settlement failures 的 redacted `paymentResponse` summary。
- Error class、error message、retry classification 和 redacted cause summary。

对于 high-volume systems，让 hot-path logs 保持紧凑，并把完整 audit record 写入带
retention controls 的 durable store。

## Redaction

绝不要记录：

- Private keys、seed phrases 或 Solana secret keys。
- 完整 wallet signatures、signed authorization payloads 或 payment payloads。
- `X-PAYMENT` 或 `X-PAYMENT-RESPONSE` headers。
- Authorization cookies、bearer tokens 或 session cookies。
- 包含 API keys、account ids 或 signed query strings 的 RPC URLs。
- Sensitive request 或 response bodies。
- 包含 signed payment data 的原始 provider responses。

通常在 review 后可安全记录：

- Network id。
- 不含敏感 query parameters 的 endpoint host 和 path。
- 缩写后的 wallet addresses。
- Atomic-unit caps 和 budget reservation ids。
- `EndpointResult.kind`、`status`、`paid` 和 latency。

存储 `paymentResponse` summary 时，只保留 support 和 finance workflows 需要的字段。
默认脱敏 signatures 和 payloads。

```ts
function summarizePaymentResponse(paymentResponse: unknown) {
  if (paymentResponse === null || typeof paymentResponse !== "object") {
    return null;
  }

  return redactDeep(paymentResponse, [
    "signature",
    "authorization",
    "payload",
    "x-payment",
    "x-payment-response",
  ]);
}
```

## Tool Wrapper Pattern

包装 paid tool execution，确保即使 tool 失败，也会产生 audit events 和 budget
transitions。

```ts
async function executePaidTool<INPUT>(input: INPUT, options: X402ToolExecutionOptions) {
  const startedAt = performance.now();
  const reservation = await budgetLedger.reserve({
    userId,
    conversationId,
    toolName: "lookupReport",
    amountCap: 10_000n,
    network: client.network,
  });

  audit.info("payment_call_started", {
    requestId,
    toolName: "lookupReport",
    toolCallId: options.toolCallId,
    reservationId: reservation.id,
  });

  try {
    const result = await client.call(endpoint, init, {
      maxAmount: 10_000n,
      signal: options.abortSignal,
    });

    audit.info("payment_call_finished", {
      requestId,
      toolName: "lookupReport",
      toolCallId: options.toolCallId,
      reservationId: reservation.id,
      kind: result.kind,
      paid: result.paid,
      status: result.status,
      latencyMs: Math.round(performance.now() - startedAt),
      paymentResponse: summarizePaymentResponse(result.paymentResponse),
    });

    await budgetLedger.commit({
      reservationId: reservation.id,
      paid: result.paid,
      resultKind: result.kind,
    });

    return result;
  } catch (error) {
    await budgetLedger.refund({
      reservationId: reservation.id,
      reason: "tool_execution_failed",
    });

    audit.error("payment_call_failed", {
      requestId,
      toolName: "lookupReport",
      toolCallId: options.toolCallId,
      reservationId: reservation.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

## Dashboard and Alerts

构建 dashboard 时可按以下维度聚合：

- User、organization、session 和 conversation。
- Tool 和 endpoint host。
- Day、hour 和 deployment environment。
- Network 和 asset。
- Result kind、HTTP status 和 retry classification。
- Approved、denied、paid、failed 和 settlement-failed attempts。

有用的 alerts 包括：

- Budget exhaustion 或异常快速的 budget burn。
- Hot wallet balance 低于 refill threshold。
- 同一 network 或 endpoint 上重复出现 `payment_required`。
- `settle_failed`、RPC errors、5xx responses 或 latency 激增。
- 重复 approval denials 后又出现相似 tool attempts。
- 来自新 tool、endpoint 或 environment 的非预期 paid attempts。

结果解释和 retry policy 见 [错误处理](/zh/guide/error-handling)。按症状排查的
operator fixes 见 [故障排查](/zh/guide/troubleshooting)。
