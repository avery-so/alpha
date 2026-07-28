# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Avery SDK (`@averyso/alpha`) — a Node-only agent payment SDK covering three payment rails in both directions:

- **x402** ([x402.org](https://x402.org)) — outbound (turn paid HTTP endpoints into callable resources and AI-agent tools) and inbound (paywall your own routes). Payments are signed and settled locally with a configured wallet/private key + RPC URL.
- **Alipay AI Pay** (支付宝 AI 按量付费) — inbound only. The SDK is the _seller_: it signs bills, verifies `Payment-Proof`, and confirms fulfillment.
- **WeiXin AI Pay** (微信 AI 支付) — outbound only. The SDK is the _developer paying a bill_: it signs SM2-with-SM3 preorders.

There is no Avery account, API key, or hosted service involved — credentials always belong to the underlying rail.

This is a pnpm workspace (`pnpm-workspace.yaml`):

- `packages/sdk` — the published Node-only TypeScript SDK. **This is the heart of the repo.**
- `example/*` — Next.js apps demoing the SDK with the Vercel AI SDK and Mastra.
- `docs` — VitePress documentation site (deployed to Cloudflare Pages, root dir `docs`).
- `skills/avery-developer` — an agent skill teaching how to use the SDK.

## Commands

```sh
pnpm install                # Node 24 (see .nvmrc / engines), pnpm 11.4.0
pnpm verify                 # THE quality gate — run before every commit/PR
pnpm dev                    # SDK build in watch mode (tsdown)
pnpm build                  # build all workspace packages
pnpm test                   # all workspace tests
pnpm test:coverage          # SDK Vitest coverage (90% thresholds, enforced)
pnpm typecheck              # tsc --noEmit across workspaces
pnpm lint                   # oxlint --max-warnings=0
pnpm format / format:check  # oxfmt
pnpm docs:dev / docs:build  # VitePress docs
pnpm changeset              # add a changeset (required for SDK API/behavior changes)
```

`pnpm verify` = `lint && format:check && typecheck && test:coverage && build && pack:check`. It is the exact gate CI runs. **Run it before committing and fix anything it reports.**

Run a single test (the SDK is the only package with tests; suites live in `test/x402/`, `test/alipay-ai-pay/`, `test/weixin-ai-pay/`, `test/middleware/`):

```sh
pnpm --filter @averyso/alpha exec vitest run test/x402/client.test.ts   # one file
pnpm --filter @averyso/alpha exec vitest run -t "rejects unsupported"   # by test name
pnpm --filter @averyso/alpha exec vitest                                # watch mode
```

Every client accepts an injected `fetch` — tests must never reach a real network, gateway, or facilitator.

## Architecture

SDK code is split into four modules under `packages/sdk/src/`, each with its own explicit export manifest:

| Module           | Role                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `x402/`          | The x402 buyer side: `X402Client`, tool adapters, networks, credentials.           |
| `alipay-ai-pay/` | Alipay AI Pay seller side: bill signing, gateway calls, RSA2.                      |
| `weixin-ai-pay/` | WeiXin AI Pay developer side: preorder building, SM2/SM3.                          |
| `middleware/`    | `createAlphaPayment()` runtimes + Express/Hono/Next adapters over all three rails. |

`src/index.ts` re-exports all four `index.ts` manifests. **Anything new that should be public must be added to its module's `index.ts`** — nothing is exported by file convention. Framework code additionally has its own entry point (`src/next.ts`, `src/express.ts`, `src/hono.ts`), published as the `/next`, `/express`, `/hono` subpath exports so the root entry stays framework-independent.

### x402 (`src/x402/`)

A thin, opinionated wrapper over the `@x402/*` packages (`core`, `evm`, `svm`, `fetch`) plus `viem` (EVM signing) and `@solana/kit` (Solana signing). The flow:

- **`X402Client` (`client.ts`)** — the entry point. Constructed with `(privateKey, { network, maxAmount?, rpcUrl?, ... })`. On construction it resolves the network to a family (`eip155` or `solana`) and normalizes the matching key type. `call()` prepares the request, runs it through a payment-aware `fetch`, and returns a normalized result. It **lazily builds and caches a "Runtime" per distinct `maxAmount`** (a `Map` keyed by the amount string) — each Runtime holds an `x402HTTPClient` with a policy that filters payment requirements to the configured network + amount cap, and a selector that picks the _cheapest_ eligible requirement.

- **Spend caps cascade.** Client-level `maxAmount` (default `100_000n` atomic units) is overridable per `call()` and per tool. The cap is enforced in two places inside the Runtime: a `registerPolicy` filter and `selectCheapestRequirement`. This is the SDK's core safety property — preserve it when touching `client.ts`.

- **Results are non-throwing by default.** `call()` returns an `EndpointResult` discriminated union (`result.ts`, `types.ts`) with `kind`: `success | settle_failed | payment_required | error | passthrough` (plus `ok`, `paid`, `status`, `body`, `paymentResponse`, `metadata`). Callers branch on `result.kind`/`result.ok`. Pass `throwOnError: true` to instead throw `X402PaymentError`. Errors are caught and normalized into an `error` result rather than propagated.

- **`endpoint.ts`** — request normalization shared by `call()` and tools. Method defaults to `GET`. For `GET`/`HEAD`/`DELETE`, plain-object tool input is mapped to query params; for `POST`/`PUT`/`PATCH` it becomes a JSON body. Endpoint config and per-request overrides are merged (query, headers, passthrough `RequestInit` fields).

- **Tool adapters** wrap a client into framework-native tools, both delegating to `executeX402EndpointTool` in `tool.ts`:
  - `x402tool()` (`tool.ts`) — Vercel AI SDK tool.
  - `x402MastraTool()` (`mastra.ts`) — Mastra tool (tagged with the `mastra.core.tool.Tool` symbol).
  - Both accept an optional `execute` result-mapper to transform the `EndpointResult` into the tool's output.

- **Networks (`networks.ts` + `network-registry.ts`)** — `resolveX402Network()` accepts `X402Networks` constants, friendly names (`"Base Sepolia"`), slugs (`"base-sepolia"`), and raw CAIP-2 (`"eip155:84532"`); `client.network` always returns normalized CAIP-2. The registry is the source of truth for the supported network table.

- **Credentials (`credentials.ts`)** — EVM keys are 32-byte hex (optional `0x`); Solana keys are base58-encoded 64-byte secret keys. The network family selects which is required.

- **Errors (`errors.ts`)** — `X402Error` base, with `X402ConfigError` (bad config/network/key) and `X402PaymentError` (carries an HTTP `status`).

### Alipay AI Pay (`src/alipay-ai-pay/`)

Seller-side only. `AlipayAIPayClient` builds the `Payment-Needed` challenge (`bill.ts`), parses the buyer's `Payment-Proof`, then calls two open-gateway methods: `alipay.aipay.agent.payment.verify` and `alipay.aipay.agent.fulfillment.confirm`.

- **Signing is RSA2** (`rsa.ts`). Both the bill signature and the gateway request sign a sorted, `&`-joined `key=value` string of non-empty fields. The `Payment-Needed` header is **Base64URL without padding**; incoming `Payment-Proof` is decoded leniently (standard Base64 or Base64URL, padding optional).
- **`alipayPublicKey` is optional but security-critical** (`gateway-response.ts`). Without it, gateway responses are not verified at all. The parser also binds the signed bytes to the parsed node, rejecting spliced envelopes that exploit duplicate-key parsing.
- **`verifyPayment` takes an `expect`** (amount / outTradeNo / resourceId); `verified` requires `active === true` **and** zero mismatches. Omitting `expect` silently degrades to "any valid payment".

### WeiXin AI Pay (`src/weixin-ai-pay/`)

Developer-side only, and **throwing** rather than returning a result union. `WeiXinAIPayClient.preorder()` takes the upstream `payment_required` payload verbatim (typed `unknown` on purpose), Base64-encodes it, signs `` `${timestamp}\n${nonceStr}\n${paymentRequired}\n` `` with SM3-then-SM2 (`sm-crypto.ts`), and returns a `paymentCode`. Private keys here are **32-byte hex SM2 scalars**, not PEM — unlike Alipay's RSA keys.

### Payment middleware (`src/middleware/`)

`createAlphaPayment(config)` returns an `AlphaPaymentRuntime` scoped to exactly one `provider` × `direction`. The matrix is deliberately partial and enforced at construction: x402 both ways, alipay inbound only, weixin outbound only. Anything else throws `AlphaPaymentConfigError`.

- **x402 inbound delegates to the official adapters** (`@x402/express|hono|next`) — Alpha does not implement a second protocol stack. It requires either a prebuilt `x402ResourceServer` **or** `facilitator` + `schemes`, never both.
- **Alipay inbound owns a strict sequence** (`alipay-inbound.ts`): validate bill → verify → atomic replay claim → handler → buffer + size check → confirm fulfillment → complete claim → release bytes. The buyer never receives the resource before fulfillment is confirmed. On confirmation failure the claim is deliberately **not** released — that is uncertain payment state needing reconciliation, not a retry.
- **The 402 challenge is signed lazily.** Bills are validated on every request via `client.assertBill()` so a malformed one always fails as `AlipayAIPayConfigError`, but the RSA signature is only computed in the branches that return 402 — a request carrying a valid proof must not pay for a challenge it discards.
- **`AlphaReplayStore` ships no default implementation** on purpose; an in-process `Map` is unsafe across workers and restarts. `claim()` must be atomic.
- **Alipay requires the wrapper form.** `alphaExpressMiddleware()`/`alphaHonoMiddleware()` throw for an alipay runtime because only `withAlpha*()` can buffer the response until fulfillment is confirmed. `alphaNextProxy()` is x402-inbound-only.
- **Logging is redacted by contract** — provider, direction, route, status, latency, error type, redacted network family. Never `Payment-Proof`, `Payment-Needed`, `PAYMENT-*`, keys, signatures, or raw gateway bodies.

## Conventions that bite

- **Relative imports use explicit `.js` extensions** (e.g. `from "./errors.js"`). Required by NodeNext + `verbatimModuleSyntax`; the source files are `.ts`. Same rule forces `import type` for type-only imports.
- **TypeScript is strict-plus**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` are all on (`tsconfig.base.json`). Optional fields are typed `T | undefined`, not just `?`.
- **Two Node targets**: the workspace develops on Node 24, but the shipped SDK supports Node `>=20.19.0` (build target `node20`, separate CI job). Don't use SDK runtime APIs unavailable in Node 20.19.
- **Conventional Commits** are enforced by a commitlint `commit-msg` hook. `pre-commit` runs lint-staged (oxfmt + oxlint on staged files); `pre-push` runs typecheck + tests.
- **Changesets**: add one (`pnpm changeset`) whenever public SDK behavior or API surface changes. `@averyso/alpha-docs` is ignored by changesets.
- Keep private keys and RPC URLs server-side; never commit real `.env` files or credentials.
