import type { Network } from "@x402/core/types";

export const X402Networks = {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  base: "eip155:8453",
  polygon: "eip155:137",
  xLayer: "eip155:196",
  peaq: "eip155:3338",
  sei: "eip155:1329",
  skaleBase: "eip155:1187947933",
  kiteAI: "eip155:2366",
  arbitrum: "eip155:42161",
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  baseSepolia: "eip155:84532",
  avalancheFuji: "eip155:43113",
  polygonAmoy: "eip155:80002",
  xLayerTestnet: "eip155:1952",
  seiTestnet: "eip155:713715",
  skaleBaseSepolia: "eip155:324705682",
  arbitrumSepolia: "eip155:421614",
} as const satisfies Record<string, Network>;

const canonicalNetworkNames = [
  "Solana Mainnet",
  "Base Mainnet",
  "Polygon Mainnet",
  "xLayer Mainnet",
  "Peaq Mainnet",
  "Sei Mainnet",
  "SKALE Base",
  "KiteAI Mainnet",
  "Arbitrum One",
  "Solana Devnet",
  "Base Sepolia",
  "Avalanche Fuji",
  "Polygon Amoy",
  "xLayer Testnet",
  "Sei Testnet",
  "SKALE Base Sepolia",
  "Arbitrum Sepolia",
] as const;

const primaryNetworkSlugs = [
  "solana",
  "base",
  "polygon",
  "xlayer",
  "peaq",
  "sei",
  "skale-base",
  "kiteai",
  "arbitrum",
  "solana-devnet",
  "base-sepolia",
  "avalanche-fuji",
  "polygon-amoy",
  "xlayer-testnet",
  "sei-testnet",
  "skale-base-sepolia",
  "arbitrum-sepolia",
] as const;

export type X402NetworkName = (typeof canonicalNetworkNames)[number];
export type X402NetworkSlug = (typeof primaryNetworkSlugs)[number];
export type X402NetworkFamily = "eip155" | "solana";

export interface X402NetworkInfo {
  name: X402NetworkName;
  slug: X402NetworkSlug;
  network: Network;
  family: X402NetworkFamily;
  aliases: readonly string[];
}

export const x402NetworkRegistry = [
  {
    name: "Solana Mainnet",
    slug: "solana",
    network: X402Networks.solana,
    family: "solana",
    aliases: ["solana-mainnet"],
  },
  {
    name: "Base Mainnet",
    slug: "base",
    network: X402Networks.base,
    family: "eip155",
    aliases: ["base-mainnet"],
  },
  {
    name: "Polygon Mainnet",
    slug: "polygon",
    network: X402Networks.polygon,
    family: "eip155",
    aliases: ["polygon-mainnet"],
  },
  {
    name: "xLayer Mainnet",
    slug: "xlayer",
    network: X402Networks.xLayer,
    family: "eip155",
    aliases: [
      "xlayer-mainnet",
      "x-layer",
      "x-layer-mainnet",
      "X Layer Mainnet",
    ],
  },
  {
    name: "Peaq Mainnet",
    slug: "peaq",
    network: X402Networks.peaq,
    family: "eip155",
    aliases: ["peaq-mainnet"],
  },
  {
    name: "Sei Mainnet",
    slug: "sei",
    network: X402Networks.sei,
    family: "eip155",
    aliases: ["sei-mainnet"],
  },
  {
    name: "SKALE Base",
    slug: "skale-base",
    network: X402Networks.skaleBase,
    family: "eip155",
    aliases: ["skale-base-mainnet"],
  },
  {
    name: "KiteAI Mainnet",
    slug: "kiteai",
    network: X402Networks.kiteAI,
    family: "eip155",
    aliases: [
      "kiteai-mainnet",
      "kite-ai",
      "kite-ai-mainnet",
      "Kite AI Mainnet",
    ],
  },
  {
    name: "Arbitrum One",
    slug: "arbitrum",
    network: X402Networks.arbitrum,
    family: "eip155",
    aliases: ["arbitrum-one", "arbitrum-mainnet"],
  },
  {
    name: "Solana Devnet",
    slug: "solana-devnet",
    network: X402Networks.solanaDevnet,
    family: "solana",
    aliases: [],
  },
  {
    name: "Base Sepolia",
    slug: "base-sepolia",
    network: X402Networks.baseSepolia,
    family: "eip155",
    aliases: [],
  },
  {
    name: "Avalanche Fuji",
    slug: "avalanche-fuji",
    network: X402Networks.avalancheFuji,
    family: "eip155",
    aliases: [],
  },
  {
    name: "Polygon Amoy",
    slug: "polygon-amoy",
    network: X402Networks.polygonAmoy,
    family: "eip155",
    aliases: [],
  },
  {
    name: "xLayer Testnet",
    slug: "xlayer-testnet",
    network: X402Networks.xLayerTestnet,
    family: "eip155",
    aliases: ["x-layer-testnet", "X Layer Testnet"],
  },
  {
    name: "Sei Testnet",
    slug: "sei-testnet",
    network: X402Networks.seiTestnet,
    family: "eip155",
    aliases: [],
  },
  {
    name: "SKALE Base Sepolia",
    slug: "skale-base-sepolia",
    network: X402Networks.skaleBaseSepolia,
    family: "eip155",
    aliases: [],
  },
  {
    name: "Arbitrum Sepolia",
    slug: "arbitrum-sepolia",
    network: X402Networks.arbitrumSepolia,
    family: "eip155",
    aliases: [],
  },
] as const satisfies readonly X402NetworkInfo[];
