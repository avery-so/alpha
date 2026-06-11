# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Avery SDK (`@averyso/alpha`) — an agent payment SDK that turns paid [x402](https://x402.org) HTTP endpoints into callable resources and AI-agent tools. The SDK signs and settles x402 payments locally using a configured wallet/private key + RPC URL; there is no Avery account, API key, or hosted service involved.

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

Run a single test (the SDK is the only package with tests):
```sh
pnpm --filter @averyso/alpha exec vitest run test/x402/client.test.ts   # one file
pnpm --filter @averyso/alpha exec vitest run -t "rejects unsupported"   # by test name
pnpm --filter @averyso/alpha exec vitest                                # watch mode
```

## Architecture

All SDK code lives under `packages/sdk/src/x402/`. The public surface is centralized: `src/index.ts` re-exports `src/x402/index.ts`, which is the single explicit export manifest. **Anything new that should be public must be added to `src/x402/index.ts`** — nothing is exported by file convention.

The SDK is a thin, opinionated wrapper over the `@x402/*` packages (`core`, `evm`, `svm`, `fetch`) plus `viem` (EVM signing) and `@solana/kit` (Solana signing). The flow:

- **`X402Client` (`client.ts`)** — the entry point. Constructed with `(privateKey, { network, maxAmount?, rpcUrl?, ... })`. On construction it resolves the network to a family (`eip155` or `solana`) and normalizes the matching key type. `call()` prepares the request, runs it through a payment-aware `fetch`, and returns a normalized result. It **lazily builds and caches a "Runtime" per distinct `maxAmount`** (a `Map` keyed by the amount string) — each Runtime holds an `x402HTTPClient` with a policy that filters payment requirements to the configured network + amount cap, and a selector that picks the *cheapest* eligible requirement.

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

## Conventions that bite

- **Relative imports use explicit `.js` extensions** (e.g. `from "./errors.js"`). Required by NodeNext + `verbatimModuleSyntax`; the source files are `.ts`. Same rule forces `import type` for type-only imports.
- **TypeScript is strict-plus**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` are all on (`tsconfig.base.json`). Optional fields are typed `T | undefined`, not just `?`.
- **Two Node targets**: the workspace develops on Node 24, but the shipped SDK supports Node `>=20.19.0` (build target `node20`, separate CI job). Don't use SDK runtime APIs unavailable in Node 20.19.
- **Conventional Commits** are enforced by a commitlint `commit-msg` hook. `pre-commit` runs lint-staged (oxfmt + oxlint on staged files); `pre-push` runs typecheck + tests.
- **Changesets**: add one (`pnpm changeset`) whenever public SDK behavior or API surface changes. `@averyso/alpha-docs` is ignored by changesets.
- Keep private keys and RPC URLs server-side; never commit real `.env` files or credentials.
