import { x402HTTPResourceServer } from "@x402/core/server";

import { X402Client } from "../x402/client.js";
import { AlphaPaymentConfigError } from "./errors.js";
import type { AlphaX402InboundConfig, AlphaX402OutboundConfig } from "./types.js";
import {
  normalizeX402InboundConfig,
  redactX402Network,
  resolveAlphaX402Network,
  x402ConfigError,
} from "./x402-config.js";

export interface AlphaX402InboundRuntimeState {
  context: {
    direction: "inbound";
    provider: "x402";
  };
  httpServer: x402HTTPResourceServer;
  paywall: AlphaX402InboundConfig["paywall"];
  paywallConfig: AlphaX402InboundConfig["paywallConfig"];
  redactedNetworks: string[];
}

export interface AlphaX402OutboundRuntimeState {
  client: X402Client;
  context: {
    client: X402Client;
    direction: "outbound";
    provider: "x402";
  };
  redactedNetworks: string[];
}

export function createX402InboundState(
  config: AlphaX402InboundConfig,
): AlphaX402InboundRuntimeState {
  const { networks, routes, server } = normalizeX402InboundConfig(config);

  try {
    return {
      context: { direction: "inbound", provider: "x402" },
      httpServer: new x402HTTPResourceServer(server, routes),
      paywall: config.paywall,
      paywallConfig: config.paywallConfig,
      redactedNetworks: networks.map((network) => redactX402Network(network)),
    };
  } catch (error) {
    throw new AlphaPaymentConfigError("Invalid x402 inbound route configuration.", {
      cause: error,
      direction: config.direction,
      provider: config.provider,
    });
  }
}

export function createX402OutboundState(
  config: AlphaX402OutboundConfig,
): AlphaX402OutboundRuntimeState {
  const network = resolveAlphaX402Network(config.network, "network");
  let client = config.client;

  if (client === undefined) {
    if (typeof config.privateKey !== "string" || config.privateKey.trim().length === 0) {
      throw x402ConfigError(config, "privateKey is required for x402 outbound payments.");
    }

    try {
      client = new X402Client(config.privateKey, {
        network,
        ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
        ...(config.logger === undefined ? {} : { logger: config.logger }),
        ...(config.logLevel === undefined ? {} : { logLevel: config.logLevel }),
        ...(config.maxAmount === undefined ? {} : { maxAmount: config.maxAmount }),
        ...(config.rpcUrl === undefined ? {} : { rpcUrl: config.rpcUrl }),
      });
    } catch (error) {
      throw new AlphaPaymentConfigError("Invalid x402 outbound client configuration.", {
        cause: error,
        direction: config.direction,
        provider: config.provider,
      });
    }
  } else {
    if (!(client instanceof X402Client)) {
      throw x402ConfigError(config, "client must be an X402Client instance.");
    }

    if (client.network !== network) {
      throw x402ConfigError(config, "client network does not match the configured network.");
    }
  }

  return {
    client,
    context: { client, direction: "outbound", provider: "x402" },
    redactedNetworks: [redactX402Network(network)],
  };
}
