# Contributing

Thanks for helping improve Alpha. This repository contains the published
`@averyso/alpha` TypeScript SDK, documentation, and examples.

## Setup

Use the Node version from `.nvmrc` for workspace development. The root
workspace currently uses Node 24, while the published SDK package supports Node
`>=20.19.0`.

```sh
nvm use
pnpm install
```

## Development Commands

Run the full local quality gate before opening a pull request:

```sh
pnpm verify
```

Useful focused commands:

```sh
pnpm --filter @averyso/alpha typecheck
pnpm --filter @averyso/alpha build
pnpm --filter @averyso/alpha test
pnpm --filter @averyso/alpha test:coverage
pnpm docs:build
```

`pnpm verify` runs linting, formatting checks, type checking, SDK coverage
tests, package builds, and the SDK package dry run. SDK coverage gates are 90%
for branches, functions, lines, and statements.

## Commit Messages

Commit messages must follow Conventional Commits:

```text
feat(sdk): add payment helper
fix(tools): preserve maxAmount override
docs: clarify x402 setup
```

## Changesets

Open an issue before starting large API, behavior, or architecture changes so
maintainers can align on scope first.

Add a Changeset when a change affects the published SDK API, runtime behavior,
package exports, dependencies, or other release-visible package contents.

No Changeset is required for documentation-only, example-only, test-only, or
repository maintenance changes that do not alter published SDK behavior.

## Documentation

Update the README, docs site, examples, and API docs when public behavior,
configuration, errors, or supported integrations change. Public API changes
should include focused tests and documentation updates in the same pull
request.

## Releases

Maintainers run the Changesets version and publish flow. Contributors should
not manually publish packages, create ad hoc release commits, or publish from a
local checkout outside the repository release process.

## Security

Do not open public issues or pull requests for vulnerabilities, leaked secrets,
private keys, RPC credentials, OAuth tokens, payment payloads, or agent-tool
abuse paths. Follow `SECURITY.md` and report privately through `sec@avery.so`
or a GitHub private security advisory.
