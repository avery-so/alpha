import type { SettleResponse } from "@x402/core/types";

import type { EndpointResult, EndpointResultMetadata } from "./types.js";

type X402ProcessResponseResult = LegacyX402PaymentResult | CurrentX402ResourceResponse;

type LegacyX402PaymentResult =
  | {
      kind: "success";
      response: Response;
      body: unknown;
      settleResponse: SettleResponse;
    }
  | {
      kind: "settle_failed";
      response: Response;
      body: unknown;
      settleResponse: SettleResponse;
    }
  | {
      kind: "payment_required";
      response: Response;
      paymentRequired: unknown;
    }
  | {
      kind: "error";
      response: Response;
      status: number;
      body: unknown;
    }
  | {
      kind: "passthrough";
      response: Response;
      body: unknown;
    };

interface CurrentX402ResourceResponse {
  status: number;
  paymentStatus: "settled" | "settle_failed" | "payment_required" | "none";
  body: unknown;
  header?: unknown;
}

export function toEndpointResult(
  result: X402ProcessResponseResult,
  response?: Response | undefined,
): EndpointResult {
  if ("kind" in result) {
    return legacyEndpointResult(result);
  }

  return currentEndpointResult(result, response);
}

function legacyEndpointResult(result: LegacyX402PaymentResult): EndpointResult {
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

function currentEndpointResult(
  result: CurrentX402ResourceResponse,
  response?: Response | undefined,
): EndpointResult {
  const metadata = responseMetadata(response, result.status);

  switch (result.paymentStatus) {
    case "settled": {
      if (!isSettleResponse(result.header)) {
        return invalidSettleHeaderResult(result, metadata);
      }

      return {
        kind: "success",
        paid: true,
        ok: true,
        status: result.status,
        body: result.body,
        paymentResponse: result.header,
        metadata,
      };
    }
    case "settle_failed": {
      if (!isSettleResponse(result.header)) {
        return invalidSettleHeaderResult(result, metadata);
      }

      return {
        kind: "settle_failed",
        paid: false,
        ok: false,
        status: result.status,
        body: result.body,
        paymentResponse: result.header,
        metadata,
      };
    }
    case "payment_required": {
      return {
        kind: "payment_required",
        paid: false,
        ok: false,
        status: result.status,
        body: null,
        paymentResponse: null,
        metadata,
      };
    }
    case "none": {
      if (isOkStatus(result.status)) {
        return {
          kind: "passthrough",
          paid: false,
          ok: true,
          status: result.status,
          body: result.body,
          paymentResponse: null,
          metadata,
        };
      }

      return {
        kind: "error",
        paid: false,
        ok: false,
        status: result.status,
        body: result.body,
        paymentResponse: null,
        metadata,
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

function responseMetadata(response: Response | undefined, status = 0): EndpointResultMetadata {
  return {
    url: response?.url ?? "",
    method: "",
    status: response?.status ?? status,
    statusText: response?.statusText ?? "",
    headers: response === undefined ? {} : Object.fromEntries(response.headers),
  };
}

function invalidSettleHeaderResult(
  result: CurrentX402ResourceResponse,
  metadata: EndpointResultMetadata,
): EndpointResult {
  return {
    kind: "error",
    paid: false,
    ok: false,
    status: result.status,
    body: {
      error: "Missing x402 settlement response header.",
      paymentStatus: result.paymentStatus,
      body: result.body,
    },
    paymentResponse: null,
    metadata,
  };
}

function isSettleResponse(value: unknown): value is SettleResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    typeof value.success === "boolean"
  );
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
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
