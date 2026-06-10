# Wallets and Networks

Alpha signs x402 payments from a server-side wallet. The wallet, network, asset,
RPC provider, and `maxAmount` cap must all match the payment requirements
returned by the endpoint you are calling.

For most first tests, start with `Base Sepolia`. The examples in this
documentation use it, the x402 and CDP testnet flows support it, and testnet
USDC is available through mature faucet paths. Use `Solana Devnet` instead when
the endpoint advertises Solana payment requirements.

## Choose the Network

Always let the endpoint payment requirements drive the final network choice. If
the endpoint only accepts `eip155:84532`, configure Base Sepolia. If it only
accepts `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, configure Solana Devnet.

Alpha accepts built-in constants, friendly names, primary slugs, and supported
CAIP-2 strings:

```ts
import { X402Client, X402Networks } from "@averyso/alpha";

const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  maxAmount: 50_000n,
});
```

Equivalent Base Sepolia inputs include `"Base Sepolia"`, `"base-sepolia"`, and
`"eip155:84532"`.

## Create a Test Wallet

Use a development-only wallet for testnets. Do not reuse a main wallet, a wallet
that has ever held real funds, or a seed phrase shared with another environment.

EVM networks require a 32-byte hex private key, with or without a `0x` prefix:

```sh
X402_PRIVATE_KEY=0x...
X402_NETWORK=base-sepolia
```

Solana networks require a base58-encoded 64-byte Solana secret key:

```sh
X402_PRIVATE_KEY=...
X402_NETWORK=solana-devnet
```

Keep the key on the server. Never pass it to a browser, client component, static
frontend bundle, model prompt, analytics event, or error reporter.

## Fund the Wallet

Fetch the endpoint requirements first, then fund the exact network and asset
they require. A wallet with Base Sepolia ETH but no required testnet USDC cannot
pay a USDC-denominated endpoint. A wallet funded on Solana Devnet cannot pay a
Base Sepolia requirement.

Common testnet paths:

- [Coinbase Developer Platform Faucet](https://www.coinbase.com/developer-platform/products/faucet)
  for supported testnet funds on Ethereum Sepolia, Base Sepolia, and Solana
  Devnet.
- [Circle Testnet Faucet](https://faucet.circle.com/) for supported testnet
  stablecoins.

Faucet limits, supported assets, and claim rules change. Use the official faucet
page as the source of truth and avoid hard-coding expected faucet amounts into
tests or documentation.

## Understand `maxAmount`

`maxAmount` is an atomic-unit cap, not a decimal token amount. The endpoint
payment requirement determines the asset and its decimals.

Use these conversions:

```ts
atomic = tokenAmount * 10 ** decimals;
tokenAmount = atomic / 10 ** decimals;
```

For USDC-style six-decimal assets:

| Atomic Amount | Token Amount |
|---:|---:|
| `50_000n` | `0.05` USDC |
| `100_000n` | `0.1` USDC |
| `1_000_000n` | `1` USDC |

In production, avoid floating-point math for payment caps. Parse decimal strings
into integer atomic units and review each cap as a spend limit.

## Configure RPC

`rpcUrl` is optional in the SDK configuration because some schemes and providers
can operate without an explicitly supplied RPC URL. For production, configure it
explicitly unless you have verified that your selected network, scheme, and
provider do not need one.

You must provide a working RPC URL when:

- The selected network, scheme, or provider needs chain reads.
- The default RPC path is unavailable or rate-limited.
- Your Solana or EVM provider requires caller-supplied RPC configuration.
- You need predictable production latency, quota, observability, or failover.

Treat RPC URLs like secrets when they contain API keys or account identifiers.

## Mainnet Checklist

Before switching from testnet to mainnet:

- Confirm the configured network exactly matches the endpoint requirements.
- Verify the asset address, token standard, and decimals from official sources.
- Review every `maxAmount` cap as a real spend limit.
- Run a small paid request with real funds before enabling agent-triggered
  traffic.
- Check wallet balance, gas or fee balance, and RPC health.
- Redact keys, RPC credentials, payment headers, and payment payloads from logs.
- Prepare rollback and private key rotation procedures.
- Keep only a short refill window of funds in the hot wallet.

## References

- [x402 Networks and Token Support](https://docs.x402.org/core-concepts/network-and-token-support)
- [Coinbase x402 Network Support](https://docs.cdp.coinbase.com/x402/network-support)
- [CDP Faucet](https://www.coinbase.com/developer-platform/products/faucet)
- [Circle Testnet Faucet](https://faucet.circle.com/)
