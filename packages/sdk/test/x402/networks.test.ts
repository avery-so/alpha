import type { Network } from "@x402/core/types";
import { describe, expect, it } from "vitest";

import { resolveX402Network, X402ConfigError, X402Networks } from "../../src/x402/index.js";
import type { X402NetworkName, X402NetworkSlug } from "../../src/x402/index.js";
import { getSupportedX402Networks } from "../../src/x402/networks.js";

const expectedNetworks = [
  {
    name: "Solana Mainnet",
    slug: "solana",
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
  {
    name: "Base Mainnet",
    slug: "base",
    network: "eip155:8453",
  },
  {
    name: "Polygon Mainnet",
    slug: "polygon",
    network: "eip155:137",
  },
  {
    name: "xLayer Mainnet",
    slug: "xlayer",
    network: "eip155:196",
  },
  {
    name: "Peaq Mainnet",
    slug: "peaq",
    network: "eip155:3338",
  },
  {
    name: "Sei Mainnet",
    slug: "sei",
    network: "eip155:1329",
  },
  {
    name: "SKALE Base",
    slug: "skale-base",
    network: "eip155:1187947933",
  },
  {
    name: "KiteAI Mainnet",
    slug: "kiteai",
    network: "eip155:2366",
  },
  {
    name: "Arbitrum One",
    slug: "arbitrum",
    network: "eip155:42161",
  },
  {
    name: "Solana Devnet",
    slug: "solana-devnet",
    network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  },
  {
    name: "Base Sepolia",
    slug: "base-sepolia",
    network: "eip155:84532",
  },
  {
    name: "Avalanche Fuji",
    slug: "avalanche-fuji",
    network: "eip155:43113",
  },
  {
    name: "Polygon Amoy",
    slug: "polygon-amoy",
    network: "eip155:80002",
  },
  {
    name: "xLayer Testnet",
    slug: "xlayer-testnet",
    network: "eip155:1952",
  },
  {
    name: "Sei Testnet",
    slug: "sei-testnet",
    network: "eip155:713715",
  },
  {
    name: "SKALE Base Sepolia",
    slug: "skale-base-sepolia",
    network: "eip155:324705682",
  },
  {
    name: "Arbitrum Sepolia",
    slug: "arbitrum-sepolia",
    network: "eip155:421614",
  },
] as const satisfies readonly {
  name: X402NetworkName;
  slug: X402NetworkSlug;
  network: Network;
}[];

describe("resolveX402Network", () => {
  it("maps every canonical friendly name", () => {
    for (const { name, network } of expectedNetworks) {
      expect(resolveX402Network(name)).toBe(network);
    }
  });

  it("maps every primary slug", () => {
    for (const { slug, network } of expectedNetworks) {
      expect(resolveX402Network(slug)).toBe(network);
    }
  });

  it("passes through raw eip155 networks", () => {
    expect(resolveX402Network("eip155:84532")).toBe("eip155:84532");
    expect(resolveX402Network("eip155:1")).toBe("eip155:1");
  });

  it("passes through supported raw Solana CAIP-2 networks", () => {
    expect(resolveX402Network(X402Networks.solana)).toBe(X402Networks.solana);
    expect(resolveX402Network(X402Networks.solanaDevnet)).toBe(X402Networks.solanaDevnet);
  });

  it("supports runtime aliases without widening canonical slug hints", () => {
    expect(resolveX402Network("base-mainnet")).toBe(X402Networks.base);
    expect(resolveX402Network("X Layer Testnet")).toBe(X402Networks.xLayerTestnet);
    expect(resolveX402Network("kite-ai")).toBe(X402Networks.kiteAI);
  });

  it("throws X402ConfigError for unknown friendly names", () => {
    expect(() => resolveX402Network("Ethereum Mainnet")).toThrow(X402ConfigError);
  });

  it("throws X402ConfigError for unsupported raw Solana CAIP-2 values", () => {
    expect(() => resolveX402Network("solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z")).toThrow(
      X402ConfigError,
    );
  });

  it("exposes registry metadata", () => {
    expect(getSupportedX402Networks()).toMatchObject(expectedNetworks);
  });
});
