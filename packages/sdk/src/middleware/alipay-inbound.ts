import {
  ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER,
  type AlipayAIPayClientBillInput,
} from "../alipay-ai-pay/index.js";
import type { AlipayAIPayClient } from "../alipay-ai-pay/client.js";
import type { Logger } from "../x402/logger.js";
import type { CompiledAlipayRoute } from "./alipay-routes.js";
import {
  abandonReplay,
  claimReplay,
  errorName,
  genericError,
  logAndReturn,
  logDetails,
  paymentRequired,
  requireResponse,
} from "./alipay-support.js";
import {
  bufferWebResponse,
  bufferedResponseToWeb,
  type AlphaBufferedResponse,
} from "./response.js";
import type {
  AlipayRouteConfig,
  AlphaAlipayInboundPaymentContext,
  AlphaReplayStore,
  AlphaRequestContext,
} from "./types.js";

const defaultMaxResponseBytes = 1024 * 1024;

export interface AlphaAlipayInboundRuntimeState {
  client: AlipayAIPayClient;
  context: AlphaAlipayInboundPaymentContext;
  logger: Logger;
  replayStore: AlphaReplayStore | undefined;
  routes: CompiledAlipayRoute[];
}

export type AlphaAlipayHandler = (
  context: AlphaAlipayInboundPaymentContext,
) => Response | Promise<Response>;

export async function handleAlipayInboundRequest(
  state: AlphaAlipayInboundRuntimeState,
  request: Request,
  handler: AlphaAlipayHandler,
): Promise<Response> {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const concreteRoute = `${method} ${url.pathname}`;
  const route = state.routes.find((candidate) => candidate.matches(method, url.pathname));

  if (route === undefined) {
    return requireResponse(await handler(state.context));
  }

  const requestContext: AlphaRequestContext = {
    direction: "inbound",
    provider: "alipay",
    request,
    route: concreteRoute,
  };
  const bill = await resolveBill(route.config, requestContext);
  const challenge = state.client.buildPaymentNeededHeader(bill).header;
  const proofHeader = request.headers.get(ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER);

  if (proofHeader === null || proofHeader.trim().length === 0) {
    return logAndReturn(state, concreteRoute, startedAt, paymentRequired(challenge));
  }

  let proof;

  try {
    proof = state.client.parsePaymentProofHeader(proofHeader);
  } catch (error) {
    state.logger.warn(
      "Alpha Alipay payment proof parsing failed.",
      logDetails(concreteRoute, {
        errorType: errorName(error),
        status: 402,
      }),
    );
    return logAndReturn(state, concreteRoute, startedAt, paymentRequired(challenge));
  }

  let verification;

  try {
    verification = await state.client.verifyPayment(proof, {
      expect: {
        amount: bill.amount,
        outTradeNo: bill.outTradeNo,
        resourceId: bill.resourceId,
      },
      signal: request.signal,
    });
  } catch (error) {
    state.logger.warn(
      "Alpha Alipay payment verification failed.",
      logDetails(concreteRoute, {
        errorType: errorName(error),
        status: 402,
      }),
    );
    return logAndReturn(state, concreteRoute, startedAt, paymentRequired(challenge));
  }

  if (!verification.verified) {
    return logAndReturn(state, concreteRoute, startedAt, paymentRequired(challenge));
  }

  const replayInput = {
    provider: "alipay" as const,
    route: concreteRoute,
    tradeNo: verification.tradeNo,
  };
  const claimResponse = await claimReplay(state, replayInput, concreteRoute, startedAt);

  if (claimResponse !== null) {
    return claimResponse;
  }

  const paymentContext: AlphaAlipayInboundPaymentContext = {
    direction: "inbound",
    payment: {
      active: verification.active,
      amount: verification.amount,
      outTradeNo: verification.outTradeNo,
      resourceId: verification.resourceId,
      tradeNo: verification.tradeNo,
    },
    provider: "alipay",
  };

  let response: Response;

  try {
    response = requireResponse(await handler(paymentContext));
  } catch (error) {
    await abandonReplay(state, replayInput, concreteRoute);
    throw error;
  }

  if (response.status >= 400) {
    await abandonReplay(state, replayInput, concreteRoute);
    return logAndReturn(
      state,
      concreteRoute,
      startedAt,
      genericError("resource_handler_failed", response.status),
    );
  }

  let buffered: AlphaBufferedResponse;

  try {
    buffered = await bufferWebResponse(
      response,
      route.config.maxResponseBytes ?? defaultMaxResponseBytes,
    );
  } catch (error) {
    await abandonReplay(state, replayInput, concreteRoute);
    state.logger.warn(
      "Alpha Alipay resource response was rejected.",
      logDetails(concreteRoute, {
        errorType: errorName(error),
        status: 500,
      }),
    );
    return logAndReturn(
      state,
      concreteRoute,
      startedAt,
      genericError("resource_response_failed", 500),
    );
  }

  try {
    await state.client.confirmFulfillment(verification.tradeNo, { signal: request.signal });
  } catch (error) {
    state.logger.error(
      "Alpha Alipay fulfillment confirmation failed.",
      logDetails(concreteRoute, {
        errorType: errorName(error),
        status: 502,
      }),
    );
    return logAndReturn(
      state,
      concreteRoute,
      startedAt,
      genericError("fulfillment_confirmation_failed", 502),
    );
  }

  if (state.replayStore !== undefined) {
    try {
      await state.replayStore.complete(replayInput);
    } catch (error) {
      state.logger.error(
        "Alpha Alipay replay completion failed.",
        logDetails(concreteRoute, {
          errorType: errorName(error),
          status: 502,
        }),
      );
      return logAndReturn(
        state,
        concreteRoute,
        startedAt,
        genericError("fulfillment_state_failed", 502),
      );
    }
  }

  return logAndReturn(state, concreteRoute, startedAt, bufferedResponseToWeb(buffered));
}

function resolveBill(
  config: AlipayRouteConfig,
  context: AlphaRequestContext,
): AlipayAIPayClientBillInput | Promise<AlipayAIPayClientBillInput> {
  return typeof config.bill === "function" ? config.bill(context) : config.bill;
}
