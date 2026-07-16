import { ALIPAY_AI_PAY_PAYMENT_NEEDED_HEADER } from "../alipay-ai-pay/index.js";
import { AlphaPaymentResponseError } from "./errors.js";
import type { AlphaAlipayInboundRuntimeState } from "./alipay-inbound.js";
import type { AlphaReplayStore } from "./types.js";

export async function claimReplay(
  state: AlphaAlipayInboundRuntimeState,
  input: Parameters<AlphaReplayStore["claim"]>[0],
  route: string,
  startedAt: number,
): Promise<Response | null> {
  if (state.replayStore === undefined) {
    return null;
  }

  try {
    const result = await state.replayStore.claim(input);

    if (result === "claimed") {
      return null;
    }

    return logAndReturn(state, route, startedAt, genericError("payment_replay", 409));
  } catch (error) {
    state.logger.error(
      "Alpha Alipay replay claim failed.",
      logDetails(route, {
        errorType: errorName(error),
        status: 503,
      }),
    );
    return logAndReturn(state, route, startedAt, genericError("payment_state_unavailable", 503));
  }
}

export async function abandonReplay(
  state: AlphaAlipayInboundRuntimeState,
  input: Parameters<AlphaReplayStore["abandon"]>[0],
  route: string,
): Promise<void> {
  if (state.replayStore === undefined) {
    return;
  }

  try {
    await state.replayStore.abandon(input);
  } catch (error) {
    state.logger.error(
      "Alpha Alipay replay abandon failed.",
      logDetails(route, {
        errorType: errorName(error),
        status: 500,
      }),
    );
  }
}

export function paymentRequired(challenge: string): Response {
  return Response.json(
    { error: "payment_required" },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        [ALIPAY_AI_PAY_PAYMENT_NEEDED_HEADER]: challenge,
      },
      status: 402,
    },
  );
}

export function genericError(code: string, status: number): Response {
  return Response.json(
    { error: code },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
      status,
    },
  );
}

export function requireResponse(response: Response): Response {
  if (!(response instanceof Response)) {
    throw new AlphaPaymentResponseError("Alpha payment handlers must return a Web Response.");
  }

  return response;
}

export function logAndReturn(
  state: AlphaAlipayInboundRuntimeState,
  route: string,
  startedAt: number,
  response: Response,
): Response {
  state.logger.info(
    "Alpha Alipay inbound request completed.",
    logDetails(route, {
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      status: response.status,
    }),
  );
  return response;
}

export function logDetails(
  route: string,
  details: Record<string, unknown>,
): Record<string, unknown> {
  return {
    direction: "inbound",
    provider: "alipay",
    route,
    ...details,
  };
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
