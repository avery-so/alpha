# Networks, Wallets, and Amounts

Avery SDK signs x402 payments from a server-side wallet. The wallet, network, asset, RPC provider, and `maxAmount` cap must all match the payment requirements the endpoint returns. **Let the endpoint's requirements drive every choice.**

For first tests, start with `Base Sepolia` (mature faucets, broad x402/CDP support). Use `Solana Devnet` when the endpoint advertises Solana requirements.

## Built-in `X402Networks`

```ts
const X402Networks: {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  base: "eip155:8453";
  polygon: "eip155:137";
  xLayer: "eip155:196";
  peaq: "eip155:3338";
  sei: "eip155:1329";
  skaleBase: "eip155:1187947933";
  kiteAI: "eip155:2366";
  arbitrum: "eip155:42161";
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
  baseSepolia: "eip155:84532";
  avalancheFuji: "eip155:43113";
  polygonAmoy: "eip155:80002";
  xLayerTestnet: "eip155:1952";
  seiTestnet: "eip155:713715";
  skaleBaseSepolia: "eip155:324705682";
  arbitrumSepolia: "eip155:421614";
};
```

## Friendly name / slug / CAIP-2 table

| Friendly Name | Primary Slug | CAIP-2 |
|---|---|---|
| `Solana Mainnet` | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `Base Mainnet` | `base` | `eip155:8453` |
| `Polygon Mainnet` | `polygon` | `eip155:137` |
| `xLayer Mainnet` | `xlayer` | `eip155:196` |
| `Peaq Mainnet` | `peaq` | `eip155:3338` |
| `Sei Mainnet` | `sei` | `eip155:1329` |
| `SKALE Base` | `skale-base` | `eip155:1187947933` |
| `KiteAI Mainnet` | `kiteai` | `eip155:2366` |
| `Arbitrum One` | `arbitrum` | `eip155:42161` |
| `Solana Devnet` | `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `Base Sepolia` | `base-sepolia` | `eip155:84532` |
| `Avalanche Fuji` | `avalanche-fuji` | `eip155:43113` |
| `Polygon Amoy` | `polygon-amoy` | `eip155:80002` |
| `xLayer Testnet` | `xlayer-testnet` | `eip155:1952` |
| `Sei Testnet` | `sei-testnet` | `eip155:713715` |
| `SKALE Base Sepolia` | `skale-base-sepolia` | `eip155:324705682` |
| `Arbitrum Sepolia` | `arbitrum-sepolia` | `eip155:421614` |

Friendly names, slugs, and aliases are matched case-insensitively after trimming. Raw `eip155:*` CAIP-2 values pass through. Raw Solana CAIP-2 must be one of the supported Solana entries above. Unknown names or unsupported Solana CAIP-2 throw `X402ConfigError` (with `details.network` and `details.supportedNetworks`).

```ts
new X402Client(key, { network: X402Networks.baseSepolia }); // preferred
new X402Client(key, { network: "Base Sepolia" });            // friendly name
resolveX402Network("base-sepolia");                          // "eip155:84532"
```

## Wallets and keys

Use a **development-only** wallet for testnets. Never reuse a main wallet, one that has held real funds, or a shared seed phrase.

- **EVM** networks: `X402_PRIVATE_KEY` is a 32-byte hex string, with or without `0x`.
- **Solana** networks: `X402_PRIVATE_KEY` is a base58-encoded 64-byte secret key.

Keep the key server-side. Never pass it to a browser, client component, static bundle, model prompt, analytics event, or error reporter.

## Funding

Fetch the endpoint requirements first, then fund the **exact** network and asset. A wallet with Base Sepolia ETH but no testnet USDC cannot pay a USDC-denominated endpoint; a Solana Devnet wallet cannot pay a Base Sepolia requirement.

Common testnet faucets (verify current rules on the official pages — don't hard-code amounts):

- Coinbase Developer Platform Faucet — Ethereum Sepolia, Base Sepolia, Solana Devnet.
- Circle Testnet Faucet — testnet stablecoins (USDC).

## `maxAmount` and atomic units

`maxAmount` is a `bigint` of **atomic units**, never a decimal token amount. The endpoint requirement determines the asset and its decimals.

```ts
atomic = tokenAmount * 10 ** decimals;
tokenAmount = atomic / 10 ** decimals;
```

USDC-style 6-decimal asset:

| Atomic (`bigint`) | Token |
|---:|---:|
| `50_000n` | `0.05` USDC |
| `100_000n` | `0.1` USDC |
| `1_000_000n` | `1` USDC |

In production, avoid floating-point math for caps. Parse decimal strings into integer atomic units, and review each cap as a real spend limit.

## RPC

`rpcUrl` is optional (some schemes/providers work without one), but configure it explicitly in production. You must supply a working RPC URL when the network/scheme/provider needs chain reads, the default path is unavailable or rate-limited, your provider requires caller-supplied RPC, or you need predictable latency/quota/observability/failover. Treat RPC URLs containing API keys like secrets.

## Mainnet checklist

Before switching testnet → mainnet:

- Confirm the configured network exactly matches the endpoint requirements.
- Verify asset address, token standard, and decimals from official sources.
- Review every `maxAmount` cap as a real spend limit.
- Run one small real-funds paid request before enabling agent traffic.
- Check wallet balance, gas/fee balance, and RPC health.
- Redact keys, RPC credentials, payment headers, and payloads from logs.
- Prepare rollback and key-rotation procedures.
- Keep only a short refill window of funds in the hot wallet.
