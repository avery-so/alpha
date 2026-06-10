import type { x402PaymentResult } from "@x402/core/client";

import type { EndpointResult, EndpointResultMetadata } from "./types.js";

export function toEndpointResult(result: x402PaymentResult): EndpointResult {
  switch (result.kind) {
    case "success": {
      return {
        kind: "success",
        paid: true,
        ok: true,
        status: result.response.status,
        body: result.body,
        paymentResponse: result.settleResponse,
        metadata: responseMetadata(result.response),
      };
    }
    case "settle_failed": {
      return {
        kind: "settle_failed",
        paid: false,
        ok: false,
        status: result.response.status,
        body: result.body,
        paymentResponse: result.settleResponse,
        metadata: responseMetadata(result.response),
      };
    }
    case "payment_required": {
      return {
        kind: "payment_required",
        paid: false,
        ok: false,
        status: result.response.status,
        body: null,
        paymentResponse: null,
        metadata: responseMetadata(result.response),
      };
    }
    case "error": {
      return {
        kind: "error",
        paid: false,
        ok: false,
        status: result.status,
        body: result.body,
        paymentResponse: null,
        metadata: responseMetadata(result.response),
      };
    }
    case "passthrough": {
      return {
        kind: "passthrough",
        paid: false,
        ok: true,
        status: result.response.status,
        body: result.body,
        paymentResponse: null,
        metadata: responseMetadata(result.response),
      };
    }
  }
}

export function endpointErrorResult(
  error: unknown,
  metadata?: Partial<EndpointResultMetadata> | undefined,
): EndpointResult {
  return {
    kind: "error",
    paid: false,
    ok: false,
    status: metadata?.status ?? 0,
    body: errorBody(error),
    paymentResponse: null,
    metadata: {
      url: metadata?.url ?? "",
      method: metadata?.method ?? "",
      status: metadata?.status ?? 0,
      statusText: metadata?.statusText ?? "",
      headers: metadata?.headers ?? {},
    },
  };
}

function responseMetadata(response: Response): EndpointResultMetadata {
  return {
    url: response.url,
    method: "",
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
  };
}

function errorBody(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: error.message,
      name: error.name,
    };
  }

  return {
    error: String(error),
  };
}
