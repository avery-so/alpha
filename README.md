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

## Packages

- `packages/sdk`: Node-only TypeScript SDK.
- `docs`: VitePress documentation site.
