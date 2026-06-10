# Production

Alpha is a Node-only SDK. Run it on a server-side Node.js runtime with Node.js
`>=20.19.0`, keep private keys out of client bundles, and treat every
agent-triggered paid call as real spend.

## Supported Runtimes

| Runtime | Support | Notes |
|---|---|---|
| Vercel Node.js Functions | Supported | Use the Node.js runtime for API routes or functions. |
| Next.js App Router route handlers | Supported | Keep Alpha in server-only modules and use the Node.js runtime. |
| Next.js Server Actions | Supported | Use only from server-side code paths. |
| Docker, Fly.io, or a regular Node server | Supported | Inject secrets at runtime and run Node.js `>=20.19.0`. |
| Browser or client component | Not supported | Private keys and payment signing must not ship to the client. |
| Static frontend bundle | Not supported | There is no secure server-side signing boundary. |
| Next.js Edge runtime | Not recommended | Edge runtime has a limited API set and does not provide full Node.js compatibility. |
| Cloudflare Workers direct Alpha SDK usage | Not recommended | Use Cloudflare native x402 and Agents support, or call a Node service that runs Alpha. |

## Next.js Pattern

Put `X402Client` in a server-only module:

```ts
// lib/x402-client.ts
import "server-only";

import { X402Client, X402Networks } from "@averyso/alpha";

export const x402Client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: process.env.X402_NETWORK ?? X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: BigInt(process.env.X402_MAX_AMOUNT ?? "50000"),
  logLevel: process.env.X402_LOG_LEVEL === "debug" ? "debug" : "info",
});
```

Use it from a route handler, server action, or backend service:

```ts
// app/api/paid-weather/route.ts
import { x402Client } from "@/lib/x402-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city") ?? "Lisbon";
  const result = await x402Client.call(
    {
      url: "https://api.example.com/weather",
      query: { city },
    },
    undefined,
    { maxAmount: 50_000n },
  );

  if (result.kind !== "success") {
    return Response.json({ error: result.kind }, { status: result.status || 500 });
  }

  return Response.json(result.body);
}
```

Do not import this module from a `"use client"` component. Do not prefix private
variables with `NEXT_PUBLIC_`; that opt-in exposes values to the browser bundle.

## Environment Variables

Use environment variables or runtime secrets for deployment-specific values:

```sh
X402_PRIVATE_KEY=0x...
X402_NETWORK=base-sepolia
X402_RPC_URL=https://example-rpc
X402_MAX_AMOUNT=50000
X402_LOG_LEVEL=info
```

Suggested handling:

- `X402_PRIVATE_KEY`: Required. Store in the platform secret manager.
- `X402_NETWORK`: Required by your app config. Match endpoint requirements.
- `X402_RPC_URL`: Recommended in production. Treat as secret when it contains an
  API key.
- `X402_MAX_AMOUNT`: Store as an atomic-unit integer string.
- `X402_LOG_LEVEL`: Use `info` in production unless actively debugging.

## Platform Configuration

On Vercel, use Project Environment Variables and deploy Alpha only in Node.js
Functions or Next.js server routes with `runtime = "nodejs"`.

On Fly.io, inject sensitive values with `fly secrets set`:

```sh
fly secrets set X402_PRIVATE_KEY=0x... X402_RPC_URL=https://example-rpc
```

On Docker or Docker Compose, use runtime secrets or environment injection. Do
not write private keys, RPC API keys, or `.env` contents into a `Dockerfile`,
image layer, or build argument. Docker secrets are commonly mounted as files, so
read the secret file at process startup when your deployment uses that model.

## Private Key Rotation

Use a small hot wallet and make rotation routine:

1. Create a new hot wallet for the same network family.
2. Inject the new key through the deployment secret manager.
3. Deploy to a low-traffic environment and run a low-value paid request.
4. Gradually shift traffic to the new key.
5. Transfer, drain, or abandon the old hot wallet balance according to your
   treasury policy.
6. Review logs for unexpected failures or duplicate payments.
7. Remove the old key from every environment.

## Hot Wallet Balance

Keep only enough funds for near-term payment needs. A practical starting
estimate is:

```txt
hot_wallet_balance =
  maxAmount * expected_paid_calls_during_refill_window
  + gas_or_network_fees
  + operational_buffer
```

Monitor wallet balances, failed settlement counts, RPC error rates, and payment
failure rates. Alert before the wallet reaches the minimum balance required for
the next refill window. Do not store funds beyond short-term operating needs in
the hot wallet.

## Redaction

Redact sensitive fields before logging or sending errors to observability tools:

- Private keys, seeds, and Solana secret keys.
- RPC URLs with query strings, account ids, or API keys.
- `Authorization` and `Cookie` headers.
- `X-PAYMENT` and `X-PAYMENT-RESPONSE` headers.
- Payment payloads and signed authorization data.
- Raw provider responses that include signed payment data.

Addresses can usually be logged in shortened form, such as the first and last
few characters. Use `debug` logs for detailed payment diagnostics and keep
production `info` logs focused on endpoint name, result kind, status, redacted
network, and request id.

## References

- [Next.js Edge Runtime](https://nextjs.org/docs/app/api-reference/edge)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Fly.io Secrets](https://fly.io/docs/apps/secrets/)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [Cloudflare x402 Workers support](https://developers.cloudflare.com/agents/tools/payments/x402/)
