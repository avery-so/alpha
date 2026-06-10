# Alpha

Alpha is a Node-only TypeScript SDK for integrating with Alpha services.

## Install

```sh
pnpm add @averyso/alpha
```

## Quick Start

```ts
import { AlphaClient } from "@averyso/alpha";

const client = new AlphaClient({
  apiKey: process.env.ALPHA_API_KEY,
});

const status = await client.getStatus();

console.log(status.ok);
```

## Next Steps

- [Getting Started](/guide/getting-started)
- [SDK API](/api/sdk)
- [Releases](/releases/)
