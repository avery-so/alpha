# 错误处理

Avery SDK 默认返回 `EndpointResult`。先按 `result.kind` 分支，再结合 `status`、
`metadata`、`paymentResponse` 和错误详情决定用户提示与运维日志。

## 结果类型

| `kind`             | 含义                                                                   | 常见原因                                                                                                        | 用户提示                                   | 开发者动作                                                                            | 是否重试                                                |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `success`          | 支付已结算，并返回付费响应。                                           | 正常付费访问。                                                                                                  | 展示付费结果。                             | 按需记录 endpoint、status 和已脱敏的 payment response。                               | 不需要重试。                                            |
| `payment_required` | 端点要求支付，但 Avery SDK 没有完成兼容支付。                          | 网络不匹配、金额超过 `maxAmount`、支付要求不受支持或不兼容、余额不足、资产错误。                                | 提示用户调整支付配置，或尝试更低成本请求。 | 检查端点要求、配置网络、资产、钱包余额和 cap。                                        | 不要用相同配置重试。                                    |
| `settle_failed`    | 端点完成支付处理后返回响应，但结算被报告为失败。                       | Provider-side 结算路径失败，包括本地结算或 provider 的 facilitator；payment 过期；provider 问题；端点拒绝结算。 | 告知用户支付无法确认，稍后重试或联系支持。 | 记录 `paymentResponse`、endpoint、status 和 request id。重放前检查 provider 状态。    | 仅在请求幂等且 provider 状态清楚时重试。                |
| `error`            | 请求、SDK、签名、fetch、RPC、端点或 x402 flow 在正常结果路径之外失败。 | 配置错误、签名失败、fetch 失败、RPC 错误、端点 5xx、x402 响应格式异常。                                         | 展示通用失败提示和 support reference。     | 使用 `X402PaymentError.status`、`details.cause`、`result.metadata` 和服务端日志定位。 | 只重试 transient network、RPC、rate limit 或 5xx 失败。 |
| `passthrough`      | 端点返回非 `402` 响应，因此 Avery SDK 没有付款。                       | 免费端点、URL 错误、测试环境未启用 x402、middleware 顺序错误、provider 配置错误。                               | 如果预期免费访问，直接展示响应。           | 如果预期付费，检查 URL、环境、middleware 顺序和 provider 配置。                       | 不做支付重试；先修复路由或配置。                        |

## `payment_required`

`payment_required` 不是一次 transient payment attempt。Avery SDK 在签名和带支付重试前
停止，因为它无法在当前 policy 下选择兼容支付要求。

常见修复：

- 将 client network 设置为端点声明的网络。
- 在要求的网络上为钱包充值要求的资产。
- 只有在把端点价格当作真实支出上限审查后，才提高 `maxAmount`。
- 使用支持目标网络和 token 的端点或 provider。

使用相同 wallet、network 和 cap 盲目重试，通常会得到相同结果。

## `settle_failed`

不要把 `settle_failed` 当作成功访问。也不要假设它证明没有资金移动。结算状态取决于
provider-side 结算路径，包括本地结算或 provider 的 facilitator，也取决于 network 和
payment response。

Buyer side 可以检查配置网络、要求资产、`maxAmount`、钱包余额和 RPC URL。你不能通过
Avery SDK 切换 provider 的 facilitator；这条结算路径由 provider 控制。

面向用户时，提示支付确认失败，请稍后重试或联系 provider。开发者日志建议记录：

- `result.paymentResponse`
- `result.metadata.url`
- `result.metadata.status`
- Endpoint 或 tool name
- 内部 request id

只有当端点操作是幂等的，并且 provider 状态足够明确、不会造成重复副作用时才重试。

## `error`

用 error path 区分配置问题和 transient runtime failure。

配置和签名失败通常不可重试：

- 私钥格式无效。
- 网络输入不受支持。
- 缺少 `fetch`。
- Solana secret key 编码错误。

运行时失败可以用 backoff 重试：

- 临时 fetch 失败。
- RPC timeout 或 rate limit。
- Endpoint 5xx response。
- 临时 provider-side 结算错误。

设置 `throwOnError: true` 后，付费端点失败会抛出 `X402PaymentError`。该错误包含
`status` 和可选 `details`。当 Avery SDK 归一化非预期失败时，`details.cause` 会包含
原始错误。

## `passthrough`

对于免费、公开或条件解锁的端点，`passthrough` 是正常结果。它表示没有付款。

如果你预期发生付费 x402 flow，检查：

- Endpoint URL 和 method。
- 是否调用了预期的测试或生产环境。
- x402 middleware 是否安装在返回内容的 route handler 之前。
- 如果你运营该端点，provider-side 结算是否已为该 route 启用，包括本地结算或通过
  provider 的 facilitator。
- 是否有其他 auth layer 在 x402 运行前就返回了响应。

## `throwOnError`

在 route handler 或 server-side service 中，如果希望使用统一异常路径，可以设置
`throwOnError: true`：

```ts
try {
  const result = await client.call(endpoint, init, { throwOnError: true });
  return Response.json(result.body);
} catch (error) {
  if (error instanceof X402PaymentError) {
    return Response.json({ error: "Payment failed" }, { status: 402 });
  }

  throw error;
}
```

Agent tool execution 默认建议保留 `EndpointResult` 流程，并通过 `execute` 返回适合
模型消费的输出。这样可以避免把原始错误、payment payload、header 和 provider 细节
暴露给模型上下文。

```ts
x402tool({
  client,
  inputSchema,
  endpoint,
  execute: ({ endpoint }) => {
    if (endpoint.kind !== "success") {
      return {
        ok: false,
        reason: endpoint.kind,
      };
    }

    return {
      ok: true,
      data: endpoint.body,
    };
  },
});
```

## 重试策略

对 transient fetch、RPC、5xx 和 rate limit 失败使用有界 exponential backoff。若
provider 支持 idempotency key 或 request id，重试时保持一致。

不要直接重试：

- 配置错误。
- 无效私钥。
- 超过 cap 的失败。
- 网络不匹配的失败。
- 不受支持的支付要求。

对于 `settle_failed`，只有在请求幂等且 provider 状态足够明确、不会造成重复支付或
重复业务处理时才重试。

完整结果联合类型和错误类见 [SDK API 参考](/zh/api/sdk#endpointresult)。
