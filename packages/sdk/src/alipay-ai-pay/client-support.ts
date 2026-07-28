import { AlipayAIPayConfigError, AlipayAIPayResponseError } from "./errors.js";
import type {
  AlipayAIPayFulfillmentConfirmWireResponse,
  AlipayAIPayPaymentVerifyWireResponse,
  AlipayAIPayVerifyExpectation,
} from "./types.js";

export function assertPaymentVerifyWireResponse(
  node: Record<string, unknown>,
  status: number,
): AlipayAIPayPaymentVerifyWireResponse {
  if (
    !isNonEmptyString(node.trade_no) ||
    !isNonEmptyString(node.amount) ||
    !isNonEmptyString(node.resource_id) ||
    !isNonEmptyString(node.out_trade_no) ||
    typeof node.active !== "boolean"
  ) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay payment verify response was missing required business fields.",
      status,
      {
        body: node,
      },
    );
  }

  return node as AlipayAIPayPaymentVerifyWireResponse;
}

export function assertFulfillmentConfirmWireResponse(
  node: Record<string, unknown>,
  status: number,
): AlipayAIPayFulfillmentConfirmWireResponse {
  if (!isNonEmptyString(node.trade_no)) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay fulfillment confirm response was missing trade_no.",
      status,
      {
        body: node,
      },
    );
  }

  return node as AlipayAIPayFulfillmentConfirmWireResponse;
}

export function collectExpectationMismatches(
  wire: AlipayAIPayPaymentVerifyWireResponse,
  expect: AlipayAIPayVerifyExpectation | undefined,
): string[] {
  if (expect === undefined) {
    return [];
  }

  const mismatches: string[] = [];

  if (expect.amount !== undefined && expect.amount !== wire.amount) {
    mismatches.push("amount");
  }

  if (expect.outTradeNo !== undefined && expect.outTradeNo !== wire.out_trade_no) {
    mismatches.push("out_trade_no");
  }

  if (expect.resourceId !== undefined && expect.resourceId !== wire.resource_id) {
    mismatches.push("resource_id");
  }

  return mismatches;
}

export function requiredText(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AlipayAIPayConfigError(`Alipay AI Pay ${fieldName} is required.`);
  }

  return value;
}

export function optionalText(
  value: string | undefined,
  fallback: string,
  fieldName: string,
): string {
  if (value === undefined) {
    return fallback;
  }

  return requiredText(value, fieldName);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
