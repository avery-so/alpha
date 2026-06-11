import type { Network } from "@x402/core/types";

import { X402ConfigError } from "./errors.js";
import {
  X402Networks,
  x402NetworkRegistry,
  type X402NetworkFamily,
  type X402NetworkInfo,
  type X402NetworkName,
  type X402NetworkSlug,
} from "./network-registry.js";

export { X402Networks };
export type {
  X402NetworkFamily,
  X402NetworkInfo,
  X402NetworkName,
  X402NetworkSlug,
};

export type X402NetworkInput =
  | X402NetworkName
  | X402NetworkSlug
  | Network
  | (string & Record<never, never>);

const supportedNetworkSummary = x402NetworkRegistry.map(
  ({ name, slug, network }) => ({
    name,
    slug,
    network,
  }),
);

const networkAliases = new Map<string, Network>();
const supportedSolanaNetworks = new Set<Network>(
  x402NetworkRegistry
    .filter((info) => info.family === "solana")
    .map((info) => info.network),
);

for (const info of x402NetworkRegistry) {
  networkAliases.set(normalizeAlias(info.name), info.network);
  networkAliases.set(normalizeAlias(info.slug), info.network);

  for (const alias of info.aliases) {
    networkAliases.set(normalizeAlias(alias), info.network);
  }
}

export function resolveX402Network(input: X402NetworkInput): Network {
  if (typeof input !== "string") {
    throwUnsupportedNetwork(input);
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throwUnsupportedNetwork(input);
  }

  if (trimmed.includes(":")) {
    const network = trimmed as Network;

    if (
      network.startsWith("solana:") &&
      !supportedSolanaNetworks.has(network)
    ) {
      throwUnsupportedSolanaNetwork(input);
    }

    return network;
  }

  const network = networkAliases.get(normalizeAlias(trimmed));

  if (network === undefined) {
    throwUnsupportedNetwork(input);
  }

  return network;
}

export function getX402NetworkFamily(
  network: Network,
): X402NetworkFamily | undefined {
  if (network.startsWith("eip155:")) {
    return "eip155";
  }

  if (supportedSolanaNetworks.has(network)) {
    return "solana";
  }

  return undefined;
}

export function getSupportedX402Networks(): readonly X402NetworkInfo[] {
  return x402NetworkRegistry;
}

export function getSupportedX402NetworkDetails(): readonly {
  name: X402NetworkInfo["name"];
  slug: X402NetworkInfo["slug"];
  network: Network;
}[] {
  return supportedNetworkSummary;
}

function normalizeAlias(input: string): string {
  return input.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}

function throwUnsupportedNetwork(input: unknown): never {
  throw new X402ConfigError("Unsupported x402 network.", {
    network: input,
    supportedNetworks: supportedNetworkSummary,
  });
}

function throwUnsupportedSolanaNetwork(input: unknown): never {
  throw new X402ConfigError("Unsupported Solana x402 network.", {
    network: input,
    supportedNetworks: supportedNetworkSummary,
  });
}
