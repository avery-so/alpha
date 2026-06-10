# Troubleshooting

Use this page when a paid x402 call fails or behaves differently than expected.
For lifecycle semantics and retry strategy, start with
[Error Handling](/guide/error-handling). For exact API shapes, see the
[SDK API Reference](/api/sdk).

## Invalid Private Key

Likely causes:

- EVM key is not a 32-byte hex string.
- EVM key contains characters outside `0-9`, `a-f`, or `A-F`.
- Solana key was provided for an EVM network, or an EVM key was provided for a
  Solana network.
- Environment variable is missing, quoted incorrectly, or includes whitespace.

Inspect:

- The configured `network`.
- Whether the key format matches the network family.
- Whether the deployed environment has the same secret as local development.

Fix:

- For EVM networks, provide a 64-character hex private key with or without a
  `0x` prefix.
- For Solana networks, provide a base58-encoded 64-byte Solana secret key.
- Keep keys server-side and redeploy after changing the secret.

See [Wallets and Networks](/guide/wallets-and-networks#create-a-test-wallet).

## Unsupported Network

Likely causes:

- Typo in a friendly name or slug.
- Unsupported raw Solana CAIP-2 network.
- Endpoint requires a network different from the client network.

Inspect:

- `client.network`.
- The value passed to `new X402Client(..., { network })`.
- The endpoint payment requirements, if your provider exposes them.
- `X402ConfigError.details.supportedNetworks`.

Fix:

- Prefer `X402Networks` constants or documented primary slugs.
- Use one of the supported Solana entries for Solana.
- Match the endpoint's advertised network and asset.

See [SDK API Reference](/api/sdk#network-selection).

## Insufficient Funds

Likely causes:

- Hot wallet does not hold the required asset on the required network.
- Wallet has token balance but not enough native token for network fees.
- You funded testnet while calling mainnet, or the reverse.
- Concurrent agent calls consumed the balance before this call settled.

Inspect:

- Wallet address on the configured network.
- Required asset and amount from the endpoint payment requirements.
- Recent paid attempts and budget reservations.
- RPC or facilitator errors in server logs.

Fix:

- Fund the hot wallet with the required asset on the exact network.
- Keep native gas or fee balance where the network requires it.
- Add balance alerts and deny new paid work before the wallet reaches the refill
  threshold.
- Use application budget reservations to avoid accepting more concurrent paid
  work than the wallet can support.

See [Production](/guide/production#hot-wallet-balance) and
[Agent Spend Controls](/guide/agent-spend-controls#budget-ledger).

## No Compatible Payment Requirements

Likely causes:

- Endpoint's network does not match `client.network`.
- Endpoint price exceeds the effective `maxAmount`.
- Endpoint requires an unsupported asset or payment scheme.
- Endpoint returned malformed or outdated x402 requirements.

Inspect:

- `EndpointResult.kind`; this often appears as `payment_required` or `error`
  depending on where incompatibility occurs.
- Effective cap precedence: tool cap, direct call cap, then client default.
- Endpoint payment requirements and advertised network.
- Server logs for `No compatible x402 payment requirements were available.`

Fix:

- Set `network` to the endpoint's supported network.
- Raise `maxAmount` only after treating it as a real spend limit.
- Choose a provider endpoint that supports your network and asset.
- Ask the endpoint provider to verify its x402 requirements.

See [Agent Spend Controls](/guide/agent-spend-controls#cap-precedence).

## RPC Failure

Likely causes:

- `rpcUrl` is missing for a network or provider that needs it.
- RPC API key is invalid, expired, rate-limited, or restricted by origin/IP.
- RPC endpoint is on the wrong network.
- Provider outage or high latency.

Inspect:

- `X402_RPC_URL` in the deployed environment.
- RPC provider dashboard for errors, rate limits, and network selection.
- Server logs at `debug` level during a focused investigation.
- Whether the failure is transient and isolated to one provider.

Fix:

- Provide a production RPC URL for the configured network.
- Rotate or correct the RPC API key.
- Add retry with bounded backoff only for transient RPC failures.
- Fail over to another RPC provider if your availability target requires it.

Keep RPC URLs with API keys out of logs. See
[Observability and Audit Logging](/guide/observability#redaction).

## Endpoint Still Returns `402`

Likely causes:

- Payment was not attempted because requirements were incompatible.
- Payment header was rejected by the provider or facilitator.
- Endpoint requires a different network, asset, method, path, or host.
- Endpoint middleware or route configuration is wrong.
- The request was sent from a browser or proxy path that bypassed the server
  payment flow.

Inspect:

- `EndpointResult.kind`, `status`, `metadata.url`, and `metadata.method`.
- Whether `result.paymentResponse` exists.
- Endpoint host/path/method after all request mapping.
- Provider logs for the same request id.

Fix:

- Match network, asset, endpoint URL, and method exactly.
- Confirm the server route uses `X402Client.call()` or an `x402tool()`.
- Keep payment signing in Node.js server code.
- Contact the provider with your request id and redacted payment summary when a
  settled payment is still rejected.

See [Error Handling](/guide/error-handling#payment_required) and
[Production](/guide/production#supported-runtimes).

## Amount Cap Too Low

Likely causes:

- `maxAmount` is below the endpoint price.
- You passed a decimal token amount instead of an atomic-unit integer.
- Tool-level `maxAmount` is lower than the client default.
- Direct `client.call()` passed a lower per-call cap than expected.

Inspect:

- Endpoint price and asset decimals.
- `x402tool({ maxAmount })` for model-triggered calls.
- `client.call(..., { maxAmount })` for direct calls.
- `client.maxAmount`.

Fix:

- Convert display token amounts to atomic units before configuring caps.
- Update the most specific cap involved in the request path.
- Keep broader user/session/day budgets separate from `maxAmount`.

See [Wallets and Networks](/guide/wallets-and-networks#understand-maxamount)
and [Agent Spend Controls](/guide/agent-spend-controls#cap-precedence).

## Missing `fetch`

Likely causes:

- Runtime does not provide `globalThis.fetch`.
- Test environment removed or mocked `fetch`.
- Custom runtime is not Node.js `>=20.19.0`.

Inspect:

- Node.js version.
- Whether `typeof globalThis.fetch === "function"` before constructing the
  client.
- Any test setup that stubs or deletes `fetch`.

Fix:

- Run Alpha in a supported Node.js runtime.
- Pass a compatible custom `fetch` implementation through `X402ClientOptions`
  when required.
- Restore `globalThis.fetch` in tests after mocking it.

See [Production](/guide/production#supported-runtimes).

## Browser or Client Bundle Imported the SDK

Likely causes:

- A Next.js `"use client"` component imports a module that creates
  `X402Client`.
- Shared utility code imports Alpha from both server and browser paths.
- Environment variables were prefixed with `NEXT_PUBLIC_`.

Inspect:

- Browser bundle errors.
- Next.js module graph and imports from client components.
- Whether private payment env vars appear in client-side code.

Fix:

- Keep `X402Client` in a server-only module.
- Add `import "server-only";` in Next.js server helpers.
- Expose your own API route or server action to the browser instead of importing
  Alpha directly.
- Rotate any key that may have been exposed.

See [Production](/guide/production#nextjs-pattern).

## Solana Key Length or Base58 Issues

Likely causes:

- Key is base64, JSON array, mnemonic, or public key instead of a base58 secret
  key.
- Base58-decoded key is not 64 bytes.
- Secret key was copied with whitespace or line breaks.
- Key belongs to a wallet format that needs export conversion before use.

Inspect:

- The thrown `X402ConfigError` message.
- `details.byteLength` when available.
- The wallet export format.
- Whether the selected network is Solana Mainnet or Solana Devnet.

Fix:

- Export the Solana 64-byte secret key and encode it as base58.
- Do not use the public address as the private key.
- Remove whitespace around the environment variable value.
- Use the exact Solana network supported by the endpoint.

See [Wallets and Networks](/guide/wallets-and-networks#create-a-test-wallet) and
[SDK API Reference](/api/sdk#network-selection).
