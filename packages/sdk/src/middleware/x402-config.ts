import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorConfig,
  type RouteConfig,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";

import { getX402NetworkFamily, resolveX402Network } from "../x402/networks.js";
import { AlphaPaymentConfigError } from "./errors.js";
import type {
  AlphaX402InboundConfig,
  AlphaX402OutboundConfig,
  AlphaX402PaymentOption,
  AlphaX402RouteConfig,
  AlphaX402RoutesConfig,
} from "./types.js";

export function normalizeX402InboundConfig(config: AlphaX402InboundConfig): {
  networks: Network[];
  routes: RoutesConfig;
  server: x402ResourceServer;
} {
  const { networks, routes } = normalizeRoutes(config.routes);
  validateAllowlist(networks, config.network);
  return { networks, routes, server: createResourceServer(config, networks) };
}

export function resolveAlphaX402Network(input: unknown, field: string): Network {
  try {
    return resolveX402Network(input as never);
  } catch (error) {
    throw new AlphaPaymentConfigError(`Invalid x402 ${field}.`, { cause: error, field });
  }
}

export function redactX402Network(network: Network): string {
  const separator = network.indexOf(":");
  return separator === -1 ? "unknown:*" : `${network.slice(0, separator)}:*`;
}

export function x402ConfigError(
  config: Pick<AlphaX402InboundConfig | AlphaX402OutboundConfig, "direction" | "provider">,
  message: string,
): AlphaPaymentConfigError {
  return new AlphaPaymentConfigError(message, {
    direction: config.direction,
    provider: config.provider,
  });
}

function createResourceServer(
  config: AlphaX402InboundConfig,
  routeNetworks: Network[],
): x402ResourceServer {
  if (config.server !== undefined) {
    if (config.facilitator !== undefined || config.schemes !== undefined) {
      throw x402ConfigError(
        config,
        "server cannot be combined with facilitator or schemes configuration.",
      );
    }

    return config.server;
  }

  if (config.facilitator === undefined) {
    throw x402ConfigError(config, "facilitator is required when server is not provided.");
  }

  if (config.schemes === undefined) {
    throw x402ConfigError(config, "schemes is required when server is not provided.");
  }

  const facilitator = normalizeFacilitator(config.facilitator, config);
  const server = new x402ResourceServer(facilitator);

  if (config.schemes === "auto") {
    registerAutomaticSchemes(server, routeNetworks, config);
    return server;
  }

  registerExplicitSchemes(server, config);
  return server;
}

function registerExplicitSchemes(server: x402ResourceServer, config: AlphaX402InboundConfig): void {
  if (!Array.isArray(config.schemes) || config.schemes.length === 0) {
    throw x402ConfigError(config, 'schemes must be "auto" or a non-empty registration array.');
  }

  for (const registration of config.schemes) {
    if (typeof registration !== "object" || registration === null) {
      throw x402ConfigError(config, "Each x402 scheme registration must be an object.");
    }

    const network = resolveAlphaX402Network(registration.network, "schemes[].network");

    if (typeof registration.server !== "object" || registration.server === null) {
      throw x402ConfigError(config, "Each x402 scheme registration requires a server.");
    }

    server.register(network, registration.server);
  }
}

function normalizeFacilitator(
  facilitator: string | FacilitatorConfig,
  config: AlphaX402InboundConfig,
): HTTPFacilitatorClient {
  if (typeof facilitator === "string") {
    if (facilitator.trim().length === 0) {
      throw x402ConfigError(config, "facilitator URL must not be empty.");
    }

    return new HTTPFacilitatorClient({ url: facilitator });
  }

  if (
    typeof facilitator !== "object" ||
    facilitator === null ||
    typeof facilitator.url !== "string" ||
    facilitator.url.trim().length === 0
  ) {
    throw x402ConfigError(config, "facilitator config requires an explicit URL.");
  }

  return new HTTPFacilitatorClient(facilitator);
}

function registerAutomaticSchemes(
  server: x402ResourceServer,
  networks: Network[],
  config: AlphaX402InboundConfig,
): void {
  const evmNetworks: Network[] = [];
  const svmNetworks: Network[] = [];

  for (const network of networks) {
    const family = getX402NetworkFamily(network);

    if (family === "eip155") {
      evmNetworks.push(network);
    } else if (family === "solana") {
      svmNetworks.push(network);
    } else {
      throw x402ConfigError(config, "Automatic schemes do not support a configured route network.");
    }
  }

  if (evmNetworks.length > 0) {
    registerExactEvmScheme(server, { networks: evmNetworks });
  }

  if (svmNetworks.length > 0) {
    registerExactSvmScheme(server, { networks: svmNetworks });
  }
}

function normalizeRoutes(input: AlphaX402RoutesConfig): {
  networks: Network[];
  routes: RoutesConfig;
} {
  if (typeof input !== "object" || input === null) {
    throw new AlphaPaymentConfigError("x402 inbound routes must be an object.");
  }

  const networks = new Set<Network>();

  if (isRouteConfig(input)) {
    const route = normalizeRouteConfig(input, networks);
    return { networks: [...networks], routes: route };
  }

  const entries = Object.entries(input);

  if (entries.length === 0) {
    throw new AlphaPaymentConfigError("x402 inbound routes must not be empty.");
  }

  const routes: Record<string, RouteConfig> = {};

  for (const [route, routeConfig] of entries) {
    if (typeof routeConfig !== "object" || routeConfig === null) {
      throw new AlphaPaymentConfigError("Each x402 inbound route must have a configuration.", {
        route,
      });
    }

    routes[route] = normalizeRouteConfig(routeConfig, networks);
  }

  return { networks: [...networks], routes };
}

function normalizeRouteConfig(input: AlphaX402RouteConfig, networks: Set<Network>): RouteConfig {
  const accepts = Array.isArray(input.accepts)
    ? input.accepts.map((option) => normalizeOption(option, networks))
    : normalizeOption(input.accepts, networks);

  return { ...input, accepts } as RouteConfig;
}

function normalizeOption(
  input: AlphaX402PaymentOption,
  networks: Set<Network>,
): Exclude<RouteConfig["accepts"], unknown[]> {
  if (typeof input !== "object" || input === null) {
    throw new AlphaPaymentConfigError("Each x402 payment option must be an object.");
  }

  const network = resolveAlphaX402Network(input.network, "routes[].accepts[].network");
  networks.add(network);
  return { ...input, network } as Exclude<RouteConfig["accepts"], unknown[]>;
}

function validateAllowlist(
  routeNetworks: Network[],
  allowlist: AlphaX402InboundConfig["network"],
): void {
  if (allowlist === undefined) {
    return;
  }

  const inputs = Array.isArray(allowlist) ? allowlist : [allowlist];

  if (inputs.length === 0) {
    throw new AlphaPaymentConfigError("x402 inbound network allowlist must not be empty.");
  }

  const allowed = new Set(inputs.map((network) => resolveAlphaX402Network(network, "network")));

  for (const network of routeNetworks) {
    if (!allowed.has(network)) {
      throw new AlphaPaymentConfigError(
        "x402 inbound route network is not included in the network allowlist.",
        { network: redactX402Network(network) },
      );
    }
  }
}

function isRouteConfig(input: AlphaX402RoutesConfig): input is AlphaX402RouteConfig {
  return "accepts" in input;
}
