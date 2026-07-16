import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import type { Context, Handler, MiddlewareHandler } from "hono";

import { AlphaPaymentConfigError } from "./errors.js";
import { normalizeFrameworkResponse } from "./framework-web.js";
import {
  getAlphaRuntimeState,
  getRuntimeContext,
  handleRuntimeAlipayRequest,
  type AlphaPaymentRuntime,
} from "./runtime.js";
import type { AlphaPaymentContext, AlphaWebHandler } from "./types.js";

const alphaHonoContextKey = "alphaPayment";

export function alphaHonoMiddleware(runtime: AlphaPaymentRuntime): MiddlewareHandler {
  const state = getAlphaRuntimeState(runtime);

  if (state.provider === "alipay") {
    throw new AlphaPaymentConfigError(
      "Alipay inbound routes require withAlphaHono() so fulfillment can precede delivery.",
    );
  }

  if (state.provider === "x402" && state.direction === "inbound") {
    const middleware = paymentMiddlewareFromHTTPServer(
      state.httpServer,
      state.paywallConfig,
      state.paywall,
      false,
    );

    return async (context, next) => {
      await runtime.initialize();
      attachHonoContext(context, state.context);
      return middleware(context, next);
    };
  }

  return async (context, next) => {
    await runtime.initialize();
    attachHonoContext(context, getRuntimeContext(state));
    await next();
  };
}

export function withAlphaHono(runtime: AlphaPaymentRuntime, handler: AlphaWebHandler): Handler {
  const state = getAlphaRuntimeState(runtime);
  assertHandler(handler);

  if (state.provider === "x402" && state.direction === "inbound") {
    const middleware = paymentMiddlewareFromHTTPServer(
      state.httpServer,
      state.paywallConfig,
      state.paywall,
      false,
    );

    return async (context) => {
      await runtime.initialize();
      attachHonoContext(context, state.context);
      const middlewareResponse = await middleware(context, async () => {
        context.res = await normalizeFrameworkResponse(
          await handler(context.req.raw, state.context),
        );
      });

      if (middlewareResponse instanceof Response) {
        return middlewareResponse;
      }

      return context.res;
    };
  }

  return async (context) => {
    await runtime.initialize();
    const paymentContext = getRuntimeContext(state);
    attachHonoContext(context, paymentContext);
    const response =
      state.provider === "alipay" && state.direction === "inbound"
        ? await handleRuntimeAlipayRequest(state, context.req.raw, (verifiedContext) =>
            handler(context.req.raw, verifiedContext),
          )
        : await handler(context.req.raw, paymentContext);
    return normalizeFrameworkResponse(response);
  };
}

export function getAlphaPaymentContext(context: Context): AlphaPaymentContext {
  const paymentContext = (context.get as (key: string) => unknown)(alphaHonoContextKey);

  if (!isPaymentContext(paymentContext)) {
    throw new AlphaPaymentConfigError(
      "Alpha payment context is unavailable. Install Alpha middleware before this handler.",
    );
  }

  return paymentContext;
}

function attachHonoContext(context: Context, paymentContext: AlphaPaymentContext): void {
  (context.set as (key: string, value: unknown) => void)(alphaHonoContextKey, paymentContext);
}

function isPaymentContext(value: unknown): value is AlphaPaymentContext {
  return typeof value === "object" && value !== null && "provider" in value && "direction" in value;
}

function assertHandler(handler: AlphaWebHandler): void {
  if (typeof handler !== "function") {
    throw new AlphaPaymentConfigError("withAlphaHono() requires a handler function.");
  }
}
