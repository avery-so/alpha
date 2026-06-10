# SDK API

The SDK exposes a single public entry point from `@averyso/alpha`.

## `AlphaClient`

ESM:

```ts
import { AlphaClient } from "@averyso/alpha";
```

CommonJS:

```js
const { AlphaClient } = require("@averyso/alpha");
```

### Constructor

```ts
const client = new AlphaClient({
  apiKey: process.env.ALPHA_API_KEY,
  baseUrl: "https://api.avery.so/alpha",
});
```

Options:

- `apiKey`: Optional bearer token sent with SDK requests.
- `baseUrl`: Optional API base URL. Defaults to `https://api.avery.so/alpha`.
- `fetch`: Optional `fetch` implementation for tests or custom runtimes.

### `getStatus()`

```ts
const status = await client.getStatus();
```

Returns:

```ts
interface AlphaStatus {
  ok: boolean;
  service: "alpha";
}
```

Throws `AlphaError` when the HTTP response is not successful.

## API Documentation Strategy

Keep this page synchronized with `packages/sdk/src/index.ts`. Each exported type,
class, and function should have an example that imports from `@averyso/alpha`,
not from internal source paths. The package supports both ESM `import` and
CommonJS `require` consumers.
