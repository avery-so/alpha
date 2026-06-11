# Agent Spend Controls

生产支付 agent 需要服务端支出策略。`maxAmount` 是 SDK 针对单次支付的安全上限，
但它本身不是用户预算、session 预算、每日限额或审批系统。

把 Avery SDK 的 cap 当作单次 x402 请求的最后一道支付护栏；更广义的 spend policy
应在任何付费 tool 执行前由应用自己强制执行。

## Cap Precedence

Avery SDK 会对付费请求路径应用最具体的 cap：

1. `x402tool({ maxAmount })` 限制该 tool 内部的 `client.call()` 执行。
2. `client.call(..., { maxAmount })` 限制应用直接控制的这次调用。
3. `new X402Client(..., { maxAmount })` 是 client 默认值。

如果没有配置 cap，SDK 默认值是 `100000n`。

`maxAmount` 使用端点支付要求里的原子单位。比如六位小数的 USDC 类资产中，
`100000n` 表示 `0.1` USDC。端点通过自己的 x402 支付要求决定资产和 decimals，
因此不要把这个值当作十进制 token 数量。

`maxAmount` 只限制一次 x402 支付。它不会限制 agent 可以调用 tool 多少次、用户一天
可以花多少、或 hot wallet 可以被并发请求消耗多少余额。

## Recommended Pattern

从保守默认值开始，并让每一次提高都显式可审查：

- 设置较低的 client default 作为 fallback。
- 为每个付费 `x402tool()` 设置显式 `maxAmount`。
- 对应用完全控制的直接 `client.call()` 请求使用更严格的 per-call cap。
- 为 user、session、conversation、tool 和 time window 维护独立 budget ledger。
- 接受新的付费任务前检查 wallet balance 或 provider balance，并在 hot wallet 达到
  refill threshold 前告警。

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 25_000n,
});

export const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 10_000n,
  }),
};
```

对于 direct call，把 cap 保留在当前 operation 内：

```ts
const result = await client.call(endpoint, init, {
  maxAmount: 5_000n,
});
```

## Budget Ledger

在 SDK 外维护应用预算。常见 scope 包括：

- `user`：单个账号或组织的总风险敞口。
- `session`：一次 authenticated session 内的风险敞口。
- `conversation`：一个 agent thread 内的风险敞口。
- `day`：日历日或 rolling-window spend limit。
- `tool`：针对昂贵或高风险 tool 的更严格限制。

使用 reserve、commit 和 refund 状态，避免并发 agent 调用竞争同一份预算。

```ts
const reservation = await budgetLedger.reserve({
  userId,
  sessionId,
  conversationId,
  toolName: "lookupReport",
  amountCap: 10_000n,
  network: client.network,
});

try {
  const result = await tools.lookupReport.execute(input, options);

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

  throw error;
}
```

当预算已用尽、无法创建 reservation、请求 cap 超过 policy，或 wallet balance 低于
本次请求和 refill window 所需最低值时，应在调用 Avery SDK 之前拒绝付费执行。

## Loop Controls

即使每次支付都被 cap 限制，agent loop 仍可能反复支出。请在服务端代码中加入 loop
limit：

- 使用 AI SDK `stopWhen` 条件，例如 `stepCountIs(...)`，限制模型 step。
- 按 request、conversation、user 和 time window 统计 paid tool call。
- 当重复的 tool 和 input 组合不太可能提供新增价值时，拒绝重复调用。
- 遇到重复 `payment_required`、`settle_failed` 或 `error` 结果时停止，而不是让模型用
  同一配置重试。
- 在 tool execution path 中强制拒绝，而不只依赖 prompt instructions。

```ts
import { generateText, stepCountIs } from "ai";

const paidToolLimiter = createPaidToolLimiter({
  maxPaidToolCalls: 3,
  duplicateWindowMs: 60_000,
});

const response = await generateText({
  model,
  tools: paidToolLimiter.wrap(tools),
  stopWhen: stepCountIs(6),
  messages,
});
```

Prompt instructions 有助于模型行为，但 spend controls 必须存在于确定性的服务端代码中，
并且可以拒绝执行。

## Approvals

当付费 tool 需要在执行前暂停，等待应用或人工授权时，使用 `needsApproval`。适合触发
审批的情况包括：

- 用户、组织或 conversation 第一次使用付费 tool。
- `maxAmount` 相对用户常规支出偏高。
- 会写入数据、解锁 premium content 或暴露敏感数据的 endpoint。
- 模型置信度低或用户意图不明确。
- Budget exception，或请求会消耗较大预算比例。
- 面向用户可见购买的确认。
- 可疑或类似 prompt-injection 的 tool input。

`x402tool()` 接受 AI SDK 风格的 `needsApproval` 字段，并会透传到 tool object。对于
始终需要审批的 tool，可以使用 boolean 形式；对于动态函数，使用你应用安装的 AI SDK
版本提供的签名。在当前 AI SDK approval flow 中，`generateText()` 或 `streamText()`
会返回 approval request，而不是执行 tool。应用记录决策，把 approval response 加到
messages 中，然后发起第二次模型调用。若批准，tool 会在第二次调用期间执行；若拒绝，
模型会收到 denial，不应再重试同一个 tool call。

```ts
const tools = {
  lookupReport: x402tool<{ reportId: string }>({
    client,
    description: "Fetch a paid report.",
    inputSchema,
    endpoint: "https://api.example.com/reports",
    maxAmount: 25_000n,
    needsApproval: true,
  }),
};
```

动态审批策略应使用已安装 AI SDK 版本的 callback shape 读取 tool input，并在应用代码
中完成判断。

## Human Confirmation

请求用户批准支出时，渲染服务端生成的固定文案。不要让模型生成最终授权文案。

应包含：

- Tool name。
- Endpoint host 和 path。
- Network。
- Atomic-unit cap，以及应用已知 asset decimals 时的用户可读金额。
- Budget impact，例如批准后剩余的 daily 或 session budget。
- Authorization scope，例如一次调用、当前 conversation、当前 session，或限时允许
  当前 tool。
- Expiry time 和撤销路径。

存储 authorization decision 时，记录 approving user、request id、tool call id、
scope、expiry、cap、network、endpoint host 和不可变 confirmation text。在服务端
tool execution path 中再次校验这条已存储决策。

## Prompt-Injection Defenses

把付费 tool 当作 privileged server action。模型或检索文档可以请求支出，但不能定义
spending policy。

使用以下控制：

- 在服务端代码中强制 caps、budgets、approvals、endpoint allowlists 和 method
  allowlists。
- 使用严格 schema 校验每个 tool input，再构造 endpoint request。
- 优先使用静态 endpoint URL，或只从 allowlisted hosts 和 paths 构造动态 URL。
- 不要把 private keys、seed phrases、Solana secret keys、RPC URLs、`X-PAYMENT`
  headers 和 `X-PAYMENT-RESPONSE` values 放进模型上下文。
- 当响应可能包含 payment details 或 secrets 时，通过 `execute` 返回已脱敏、
  model-friendly 的 tool output，而不是原始 endpoint response。
- 拒绝 user-controlled headers，除非每个 header name 和 value 都被显式允许。

部署 secret 处理见 [生产部署](/zh/guide/production)。这些决策周边的 diagnostic events
和 audit logging 见 [可观测性与审计日志](/zh/guide/observability)。

## 参考

- [AI SDK tool approvals](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-approval)
- [AI SDK loop control](https://ai-sdk.dev/docs/agents/loop-control)
