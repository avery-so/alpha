# Getting Started

## Requirements

Alpha targets Node.js 20.19 or newer.

## Installation

```sh
pnpm add @averyso/alpha
```

## Create a Client

```ts
import { AlphaClient } from "@averyso/alpha";

const client = new AlphaClient({
  apiKey: process.env.ALPHA_API_KEY,
});
```

## Check Service Status

```ts
const status = await client.getStatus();

if (status.ok) {
  console.log("Alpha is reachable.");
}
```
