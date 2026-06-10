---
"@averyso/alpha": major
---

Remove the unused Avery and Alpha status clients from the public SDK API. This
removes `AveryClient`, `AveryError`, `AveryClientOptions`, `AveryStatus`, and
the legacy `Alpha*` status API aliases.

Clarify that x402 payment features do not require an Avery account or API key.
Payment execution uses local x402 signing with the developer's configured
wallet/private key, RPC URL, and target x402 endpoint or facilitator flow.
