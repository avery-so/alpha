# @averyso/alpha

Node-only TypeScript SDK for Alpha.

## Install

```sh
pnpm add @averyso/alpha
```

## Usage

```ts
import { AlphaClient } from "@averyso/alpha";

const client = new AlphaClient({ apiKey: process.env.ALPHA_API_KEY });
const status = await client.getStatus();

console.log(status.ok);
```
