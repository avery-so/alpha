# @averyso/alpha

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
