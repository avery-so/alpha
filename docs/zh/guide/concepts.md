# 核心概念

Avery SDK 帮助 agent 和应用调用受 x402 保护的 HTTP 端点，而不需要把支付签名逻辑放进
模型 prompt 或浏览器代码里。SDK 会把支付流程保留在服务端，应用支付上限，并返回
一个类型化结果，说明请求最终如何结束。

如果你还不熟悉 “x402-protected endpoint” 这个概念，建议先阅读本页，再进入环境
配置。

## 核心术语

**端点请求** 是 agent tool 或应用想发出的 HTTP 请求。

**支付要求** 是受 x402 保护的端点返回 `402 Payment Required` 时附带的支付选项。

**配置网络** 是 `X402Client` 上选择的网络，例如内置 `X402Networks` 条目，或受支持
的 CAIP-2 值。

`maxAmount` 是单次调用的支付上限，单位是端点支付要求里的原子单位。SDK 不会完成
超过本次调用有效 `maxAmount` 的支付。

## 支付生命周期

标准 x402 流程包含两次 HTTP 请求：第一次发现支付要求，第二次带着已签名支付凭证
重试。

1. agent tool 或应用通过 `x402tool()` 或 `X402Client.call()` 发起端点请求。
2. 端点返回 `402 Payment Required`，并附带支付要求。
3. SDK 过滤支付要求，并选择一个与配置网络和本次有效 `maxAmount` 兼容的要求。
4. SDK 在服务端签名支付凭证，并带着支付信息重试请求。
5. 端点验证并结算支付，然后返回付费响应，或报告结算失败。
6. SDK 返回 `EndpointResult`，让应用根据结果处理后续逻辑。

如果端点第一次返回的是普通的非 `402` 响应，SDK 不会付款，而是以 passthrough
结果返回该响应。

## 支付选择

支付选择是保守的。支付要求必须匹配配置网络，并且金额不超过 `maxAmount`。这样可以
确保由 agent 触发的请求始终受 client、call 或 tool 层配置的预算约束。

如果没有可兼容的支付要求，Avery SDK 会返回 `payment_required`，不会签名凭证，也不会
带支付重试。常见原因包括网络不匹配、支付要求不受支持，或要求金额超过配置上限。

## `EndpointResult.kind`

`EndpointResult.kind` 表示生命周期在哪一步停止：

- `success`：付费请求已结算，端点返回了付费响应。
- `settle_failed`：端点返回了响应，但结算被报告为失败。
- `payment_required`：端点要求支付，但 SDK 无法完成兼容支付，例如网络不匹配或超过
  支付上限。
- `passthrough`：端点返回普通的非 `402` 响应，因此 SDK 没有付款。
- `error`：请求、SDK、签名、fetch 或 x402 流程在正常端点结果路径之外失败。

应用代码应优先根据 `kind` 分支处理。每个结果变体的完整 TypeScript 结构见
[SDK API 参考](/zh/api/sdk#endpointresult)。面向生产的处理策略、用户提示和重试建议
见 [错误处理](/zh/guide/error-handling)。

## 安全边界

支付签名应保留在服务端。不要把私钥、RPC URL 或 `X402Client` 构建逻辑放进浏览器或
客户端构建产物中。Agent tool 只应暴露允许模型提供的结构化输入；端点选择、支付上
限、凭证和请求签名都应由服务端控制。
