---
"@averyso/alpha": patch
---

Upgrade `sm-crypto` to 0.5.3 to fix a critical SM2 signing weakness (GHSA-vh45-f885-3848).

`sm-crypto` 0.4.0 derived SM2 private keys **and per-signature ephemeral scalars** from jsbn's `SecureRandom`, which only reaches a CSPRNG through `window.crypto`. Under Node — the only runtime this SDK supports — that branch is skipped and the pool falls back to `Math.random()` plus the wall clock, making every signing nonce predictable. A predictable nonce lets an observer recover the signing key from signatures.

This affects `WeiXinAIPayClient` and the `signWeiXinAIPayPreorder` / `buildWeiXinAIPayPreorderRequest` helpers, which sign preorders with SM2. **If you signed WeiXin AI Pay preorders with any release up to 1.2.0, treat the SM2 private key as potentially compromised and rotate it.** 0.5.3 sources randomness from `crypto.getRandomValues` and throws instead of silently falling back when no CSPRNG is available.

Also resolves the remaining Dependabot alerts across the workspace via `pnpm-workspace.yaml` overrides: `@hono/node-server`, `body-parser`, `brace-expansion`, `fast-uri`, `hono`, `js-yaml`, `next`, `postcss`, and `sharp`. Those are development and example dependencies only — they do not reach the published package.
