# Repository Guidelines

## Project Structure & Module Organization

This pnpm workspace contains the Alpha TypeScript SDK, docs, and examples.
`packages/sdk` is the published Node-only package: source lives in
`packages/sdk/src`, tests in `packages/sdk/test`, and generated build output in
`packages/sdk/dist`. `docs` is the VitePress site, with English pages under
`docs/guide`, `docs/api`, and `docs/tutorial`, plus Chinese mirrors under
`docs/zh`. Example apps live in `example/nextjs-ai-x402-exa` and
`example/nextjs-mastra-x402-exa`.

## Build, Test, and Development Commands

Use Node from `.nvmrc` for workspace development and install with
`pnpm install`.

- `pnpm dev`: run the SDK build in watch mode.
- `pnpm build`: build all workspace packages and examples.
- `pnpm typecheck`: run TypeScript checks across the workspace.
- `pnpm test`: run workspace tests.
- `pnpm test:coverage`: run SDK Vitest coverage checks.
- `pnpm lint` / `pnpm format:check`: enforce oxlint and oxfmt.
- `pnpm verify`: run the full local and CI quality gate.
- `pnpm docs:dev` / `pnpm docs:build`: develop or build the VitePress docs.

## Coding Style & Naming Conventions

Use TypeScript ES modules. Keep public SDK exports centralized through
`packages/sdk/src/index.ts`. Formatting is controlled by oxfmt and
`.editorconfig`: 2-space indentation, LF endings, UTF-8, and final newlines.
Prefer descriptive camelCase variables and functions, PascalCase classes and
types, and `*.test.ts` for tests. Do not commit generated `dist`, `coverage`,
or VitePress cache output unless explicitly required.

## Testing Guidelines

The SDK uses Vitest in a Node environment. Place tests under
`packages/sdk/test/**/*.test.ts`, mirroring the module or behavior under test.
Coverage is collected from `packages/sdk/src/**/*.ts` and must meet 90%
thresholds for branches, functions, lines, and statements. Use focused
assertions for error paths, payment request construction, agent tools, and
public API behavior.

## Commit & Pull Request Guidelines

Commit messages follow Conventional Commits, for example
`feat(sdk): add payment helper` or `docs: clarify x402 setup`. Before opening a
pull request, run `pnpm verify`. Include a concise summary, test results,
linked issues when applicable, and screenshots for visible docs or example UI
changes. Add a Changeset only for published SDK API, behavior, dependency, or
package-content changes.

## Security & Configuration Tips

Never commit real `.env` files, private keys, OAuth tokens, RPC credentials,
database connection strings, payment payloads, or local private configuration.
Keep x402 private keys and RPC URLs server-side. Report vulnerabilities through
`SECURITY.md`, not public issues.
