import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import type {
  NextFunction,
  Request as ExpressRequest,
  RequestHandler,
  Response as ExpressResponse,
} from "express";

import { AlphaPaymentConfigError } from "./errors.js";
import { expressRequestToWeb, writeExpressWebResponse } from "./framework-web.js";
import {
  getAlphaRuntimeState,
  getRuntimeContext,
  handleRuntimeAlipayRequest,
  type AlphaPaymentRuntime,
} from "./runtime.js";
import type { AlphaPaymentContext, AlphaWebHandler } from "./types.js";

const alphaExpressContext = Symbol("@averyso/alpha/express-context");

type RequestWithAlphaContext = ExpressRequest & {
  [alphaExpressContext]?: AlphaPaymentContext;
};

export function alphaExpressMiddleware(runtime: AlphaPaymentRuntime): RequestHandler {
  const state = getAlphaRuntimeState(runtime);

  if (state.provider === "alipay") {
    throw new AlphaPaymentConfigError(
      "Alipay inbound routes require withAlphaExpress() so fulfillment can precede delivery.",
    );
  }

  if (state.provider === "x402" && state.direction === "inbound") {
    const middleware = paymentMiddlewareFromHTTPServer(
      state.httpServer,
      state.paywallConfig,
      state.paywall,
      false,
    );

    return async (request, response, next) => {
      try {
        await runtime.initialize();
        attachExpressContext(request, state.context);
        await middleware(request, response, next);
      } catch (error) {
        next(error);
      }
    };
  }

  return async (request, _response, next) => {
    try {
      await runtime.initialize();
      attachExpressContext(request, getRuntimeContext(state));
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function withAlphaExpress(
  runtime: AlphaPaymentRuntime,
  handler: AlphaWebHandler,
): RequestHandler {
  const state = getAlphaRuntimeState(runtime);
  assertHandler(handler);

  if (state.provider === "x402" && state.direction === "inbound") {
    const middleware = paymentMiddlewareFromHTTPServer(
      state.httpServer,
      state.paywallConfig,
      state.paywall,
      false,
    );

    return async (request, response, next) => {
      try {
        await runtime.initialize();
        attachExpressContext(request, state.context);
        await runX402Wrapper(middleware, request, response, next, handler, state.context);
      } catch (error) {
        next(error);
      }
    };
  }

  return async (request, response, next) => {
    try {
      await runtime.initialize();
      const webRequest = expressRequestToWeb(request);
      const context = getRuntimeContext(state);
      attachExpressContext(request, context);
      const webResponse =
        state.provider === "alipay" && state.direction === "inbound"
          ? await handleRuntimeAlipayRequest(state, webRequest, (paymentContext) =>
              handler(webRequest, paymentContext),
            )
          : await handler(webRequest, context);
      await writeExpressWebResponse(request, response, webResponse);
    } catch (error) {
      next(error);
    }
  };
}

export function getAlphaPaymentContext(request: ExpressRequest): AlphaPaymentContext {
  const context = (request as RequestWithAlphaContext)[alphaExpressContext];

  if (context === undefined) {
    throw new AlphaPaymentConfigError(
      "Alpha payment context is unavailable. Install Alpha middleware before this handler.",
    );
  }

  return context;
}

async function runX402Wrapper(
  middleware: ReturnType<typeof paymentMiddlewareFromHTTPServer>,
  request: ExpressRequest,
  response: ExpressResponse,
  next: NextFunction,
  handler: AlphaWebHandler,
  context: AlphaPaymentContext,
): Promise<void> {
  const webRequest = expressRequestToWeb(request);
  const continuation = (async (error?: unknown) => {
    if (error !== undefined) {
      next(error);
      return;
    }

    const webResponse = await handler(webRequest, context);
    await writeExpressWebResponse(request, response, webResponse);
  }) as NextFunction;

  await middleware(request, response, continuation);
}

function attachExpressContext(request: ExpressRequest, context: AlphaPaymentContext): void {
  Object.defineProperty(request, alphaExpressContext, {
    configurable: true,
    enumerable: false,
    value: context,
  });
}

function assertHandler(handler: AlphaWebHandler): void {
  if (typeof handler !== "function") {
    throw new AlphaPaymentConfigError("withAlphaExpress() requires a handler function.");
  }
}
