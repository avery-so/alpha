import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

import type {
  paymentProxyFromHTTPServer as PaymentProxyFromHTTPServer,
  withX402FromHTTPServer as WithX402FromHTTPServer,
} from "@x402/next";
import type { NextRequest, NextResponse } from "next/server.js";

import { AlphaPaymentConfigError } from "./errors.js";
import { normalizeFrameworkResponse } from "./framework-web.js";
import {
  getAlphaRuntimeState,
  getRuntimeContext,
  handleRuntimeAlipayRequest,
  type AlphaPaymentRuntime,
} from "./runtime.js";
import type { AlphaPaymentContext } from "./types.js";

interface X402NextModule {
  paymentProxyFromHTTPServer: typeof PaymentProxyFromHTTPServer;
  withX402FromHTTPServer: typeof WithX402FromHTTPServer;
}

const { paymentProxyFromHTTPServer, withX402FromHTTPServer } = createRequire(import.meta.url)(
  "@x402/next",
) as X402NextModule;

export type AlphaNextHandler<RouteContext = unknown> = (
  request: NextRequest,
  paymentContext: AlphaPaymentContext,
  routeContext: RouteContext,
) => Response | Promise<Response>;

export type AlphaNextRouteHandler<RouteContext = unknown> = (
  request: NextRequest,
  routeContext: RouteContext,
) => Promise<Response>;

export function withAlphaNext<RouteContext = unknown>(
  runtime: AlphaPaymentRuntime,
  handler: AlphaNextHandler<RouteContext>,
): AlphaNextRouteHandler<RouteContext> {
  const state = getAlphaRuntimeState(runtime);
  assertHandler(handler);

  if (state.provider === "x402" && state.direction === "inbound") {
    const routeContexts = new AsyncLocalStorage<RouteContext>();
    const wrapped = withX402FromHTTPServer(
      async (request) => {
        const response = await handler(request, state.context, requiredRouteContext(routeContexts));
        return (await normalizeFrameworkResponse(response)) as NextResponse;
      },
      state.httpServer,
      state.paywallConfig,
      state.paywall,
      false,
    );

    return async (request, routeContext) => {
      await runtime.initialize();
      return routeContexts.run(routeContext, () => wrapped(request));
    };
  }

  return async (request, routeContext) => {
    await runtime.initialize();
    const paymentContext = getRuntimeContext(state);
    const response =
      state.provider === "alipay" && state.direction === "inbound"
        ? await handleRuntimeAlipayRequest(state, request, (verifiedContext) =>
            handler(request, verifiedContext, routeContext),
          )
        : await handler(request, paymentContext, routeContext);
    return normalizeFrameworkResponse(response);
  };
}

export function alphaNextProxy(
  runtime: AlphaPaymentRuntime,
): (request: NextRequest) => Promise<NextResponse> {
  const state = getAlphaRuntimeState(runtime);

  if (state.provider !== "x402" || state.direction !== "inbound") {
    throw new AlphaPaymentConfigError(
      "alphaNextProxy() only supports x402 inbound payment runtimes.",
    );
  }

  const proxy = paymentProxyFromHTTPServer(
    state.httpServer,
    state.paywallConfig,
    state.paywall,
    false,
  );

  return async (request) => {
    await runtime.initialize();
    return proxy(request);
  };
}

function requiredRouteContext<RouteContext>(
  storage: AsyncLocalStorage<RouteContext>,
): RouteContext {
  const context = storage.getStore();

  if (context === undefined) {
    throw new AlphaPaymentConfigError("Next.js route context is unavailable.");
  }

  return context;
}

function assertHandler<RouteContext>(handler: AlphaNextHandler<RouteContext>): void {
  if (typeof handler !== "function") {
    throw new AlphaPaymentConfigError("withAlphaNext() requires a handler function.");
  }
}
