import { AlphaPaymentConfigError } from "./errors.js";
import type { AlipayRouteConfig, AlipayRoutesConfig } from "./types.js";

export interface CompiledAlipayRoute {
  config: AlipayRouteConfig;
  key: string;
  matches(method: string, path: string): boolean;
}

export function compileAlipayRoutes(routes: AlipayRoutesConfig): CompiledAlipayRoute[] {
  if (typeof routes !== "object" || routes === null || Array.isArray(routes)) {
    throw new AlphaPaymentConfigError("Alipay inbound routes must be an object.");
  }

  const entries = Object.entries(routes);

  if (entries.length === 0) {
    throw new AlphaPaymentConfigError("Alipay inbound routes must not be empty.");
  }

  return entries.map(([key, config]) => compileRoute(key, config));
}

function compileRoute(key: string, config: AlipayRouteConfig): CompiledAlipayRoute {
  if (typeof config !== "object" || config === null || !("bill" in config)) {
    throw new AlphaPaymentConfigError("Each Alipay inbound route requires a bill.", { route: key });
  }

  validateMaximum(config.maxResponseBytes, key);
  const separator = key.indexOf(" ");

  if (separator <= 0 || separator === key.length - 1) {
    throw routeFormatError(key);
  }

  const method = key.slice(0, separator).toUpperCase();
  const path = key.slice(separator + 1);

  if (!/^(?:[A-Z]+|\*)$/u.test(method) || (path !== "*" && !path.startsWith("/"))) {
    throw routeFormatError(key);
  }

  const pathPattern = wildcardPathPattern(path);

  return {
    config,
    key,
    matches: (requestMethod, requestPath) =>
      (method === "*" || method === requestMethod) && pathPattern.test(requestPath),
  };
}

function wildcardPathPattern(path: string): RegExp {
  const source = path
    .split("*")
    .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join(".*");
  return new RegExp(`^${source}$`, "u");
}

function validateMaximum(maximum: number | undefined, route: string): void {
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum <= 0)) {
    throw new AlphaPaymentConfigError("Alipay maxResponseBytes must be a positive safe integer.", {
      route,
    });
  }
}

function routeFormatError(route: string): AlphaPaymentConfigError {
  return new AlphaPaymentConfigError('Alipay route keys must use the "METHOD /path" format.', {
    route,
  });
}
