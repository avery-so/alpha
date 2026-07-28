# @averyso/alpha

## 1.2.0

### Minor Changes

- f129563: Stop signing an unused payment challenge on paid Alipay requests. The inbound runtime previously built and RSA-signed a `Payment-Needed` header on every request, including ones that already carried a valid `Payment-Proof` and never needed it. Signing is now deferred to the branches that actually return 402.

  Bills are still validated on every request, so a malformed bill keeps failing with `AlipayAIPayConfigError` whether or not a proof was sent. The check is exposed as `AlipayAIPayClient.assertBill()` for callers that want to validate a bill without paying for a signature.

### Patch Changes

- a225a4a: Warn when an `AlipayAIPayClient` is constructed without `alipayPublicKey`. Gateway response signatures are not verified in that configuration, so the client now surfaces it at `warn` level instead of failing silently.

## 1.1.0

### Minor Changes

- 9aaec11: Add an Alipay AI pay-per-use (AI 按量付费) merchant client with signed 402 Payment-Needed bill building, Payment-Proof parsing, payment verification, fulfillment confirmation, RSA2 signing helpers, and optional gateway response signature verification.
- 82c7555: Add a unified provider and direction payment runtime with x402 inbound and outbound support, Alipay inbound fulfillment and replay protection, WeiXin outbound contexts, and Express, Hono, and Next.js framework adapters.

## 1.0.1

### Patch Changes

- d4c85d0: Support both legacy `kind` and current `paymentStatus` x402 processResponse result shapes.
- f5e428f: Add a WeiXinAI Pay preorder client, request builder, SM2/SM3 signing helpers, and typed preorder response handling.

## 1.0.0

### Major Changes

- 7025696: Remove the unused Avery and Alpha status clients from the public SDK API. This
  removes `AveryClient`, `AveryError`, `AveryClientOptions`, `AveryStatus`, and
  the legacy `Alpha*` status API aliases.

  Clarify that x402 payment features do not require an Avery account or API key.
  Payment execution uses local x402 signing with the developer's configured
  wallet/private key, RPC URL, and target x402 endpoint or facilitator flow.

### Minor Changes

- 8b16dbc: Add a Mastra-compatible x402 tool factory for paid HTTP endpoints.
- 3763495: Add an x402 client and Vercel AI SDK-compatible tool factory for paid HTTP endpoints.
