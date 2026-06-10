# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace for the Alpha TypeScript SDK and documentation.
`packages/sdk` contains the published Node-only SDK: source lives in
`packages/sdk/src`, tests in `packages/sdk/test`, and generated build output in
`packages/sdk/dist`. `docs` contains the VitePress documentation site, including
guide pages under `docs/guide` and API docs under `docs/api`. Root-level config
files define shared TypeScript, linting, formatting, release, and commit rules.

## Build, Test, and Development Commands

Use Node from `.nvmrc` for local development; package metadata supports Node
`>=20.19.0`. Install dependencies with:

```sh
pnpm install
```

Common commands:

- `pnpm dev`: run the SDK build in watch mode.
- `pnpm build`: build all workspace packages.
- `pnpm test`: run workspace tests.
- `pnpm test:coverage`: run SDK Vitest coverage checks.
- `pnpm typecheck`: run TypeScript checks across workspaces.
- `pnpm lint` and `pnpm format:check`: enforce oxlint and oxfmt.
- `pnpm verify`: run the full local and CI quality gate.
- `pnpm docs:dev` / `pnpm docs:build`: develop or build the VitePress docs.

## Coding Style & Naming Conventions

Use TypeScript ES modules and keep public SDK exports centralized through
`packages/sdk/src/index.ts`. Formatting is handled by oxfmt: 2-space
indentation, LF endings, UTF-8, and final newlines are enforced by
`.editorconfig`. Prefer descriptive camelCase variables and functions,
PascalCase classes and types, and `*.test.ts` for tests. Keep generated
directories such as `dist`, `coverage`, and VitePress caches out of commits.

## Testing Guidelines

The SDK uses Vitest in a Node environment. Place tests under
`packages/sdk/test/**/*.test.ts`, mirroring the behavior or module under test.
Coverage is collected from `packages/sdk/src/**/*.ts` and must meet 90%
thresholds for branches, functions, lines, and statements. Use focused unit
tests with explicit assertions for error paths, external request construction,
and public API behavior.

## Commit & Pull Request Guidelines

Commit messages follow Conventional Commits and are enforced by commitlint, for
example `feat(sdk): add payment helper` or `ci: tighten package verification`.
Before opening a pull request, run `pnpm verify` and include a short summary,
test results, linked issues when applicable, and screenshots for documentation
or UI-visible docs changes. Add a Changeset for SDK releases when public package
behavior or API surface changes.

## Security & Configuration Tips

Never commit real `.env` files, private keys, OAuth tokens, RPC credentials, or
database connection strings. Keep x402 private keys and RPC URLs server-side.
Use package dry runs (`pnpm pack:check`) to confirm publish contents before
release work.
