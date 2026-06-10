# Alpha

Alpha is a Node-only TypeScript SDK published as `@averyso/alpha`.

## Usage

ESM:

```ts
import { AlphaClient } from "@averyso/alpha";
```

CommonJS:

```js
const { AlphaClient } = require("@averyso/alpha");
```

## Development

```sh
pnpm install
pnpm verify
pnpm docs:build
```

`pnpm verify` is the local and CI quality gate. It runs linting, formatting
checks, type checking, SDK coverage tests with 90% thresholds, package builds,
and the SDK package dry run.

Development uses Node 24 (see `.nvmrc`); the minimum supported runtime is Node
20.19.0 (see the `engines` field). CI runs the quality gate against both.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
and are enforced by a `commit-msg` hook (commitlint).

## Deployment

Cloudflare Pages uses `docs` as the root directory. The build command is
`npx vitepress build`, and the build output directory is `.vitepress/dist`.
The Pages build Node version is pinned by `docs/.nvmrc`.

## Packages

- `packages/sdk`: Node-only TypeScript SDK.
- `docs`: VitePress documentation site.
