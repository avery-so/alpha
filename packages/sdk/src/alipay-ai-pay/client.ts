import { buildAlipayAIPayPaymentNeededHeader, parseAlipayAIPayPaymentProofHeader } from "./bill.js";
import {
  AlipayAIPayConfigError,
  AlipayAIPayRequestError,
  AlipayAIPayResponseError,
} from "./errors.js";
import { buildAlipayAIPayGatewayRequest } from "./gateway.js";
import { parseAlipayAIPayGatewayResponse } from "./gateway-response.js";
import { normalizeAlipayAIPayPrivateKey, normalizeAlipayAIPayPublicKey } from "./rsa.js";
import { createLogger, type Logger } from "../x402/logger.js";
import {
  ALIPAY_AI_PAY_FULFILLMENT_CONFIRM_METHOD,
  ALIPAY_AI_PAY_GATEWAY_ENDPOINT,
  ALIPAY_AI_PAY_PAYMENT_VERIFY_METHOD,
  type AlipayAIPayClientBillInput,
  type AlipayAIPayClientOptions,
  type AlipayAIPayFulfillmentConfirmResult,
  type AlipayAIPayFulfillmentConfirmWireResponse,
  type AlipayAIPayPaymentNeededResult,
  type AlipayAIPayPaymentProof,
  type AlipayAIPayPaymentVerifyResult,
  type AlipayAIPayPaymentVerifyWireResponse,
  type AlipayAIPayRequestOptions,
  type AlipayAIPayVerifyExpectation,
  type AlipayAIPayVerifyPaymentInput,
  type AlipayAIPayVerifyPaymentOptions,
} from "./types.js";
import type { KeyObject } from "node:crypto";

export class AlipayAIPayClient {
  readonly #appId: string;
  readonly #privateKey: KeyObject;
  readonly #alipayPublicKey: KeyObject | undefined;
  readonly #appAuthToken: string | undefined;
  readonly #gatewayEndpoint: string;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;

  constructor(options: AlipayAIPayClientOptions) {
    this.#appId = requiredText(options.appId, "appId");
    this.#privateKey = normalizeAlipayAIPayPrivateKey(options.privateKey);
    this.#alipayPublicKey =
      options.alipayPublicKey === undefined
        ? undefined
        : normalizeAlipayAIPayPublicKey(options.alipayPublicKey);
    this.#appAuthToken =
      options.appAuthToken === undefined
        ? undefined
        : requiredText(options.appAuthToken, "appAuthToken");
    this.#gatewayEndpoint = optionalText(
      options.gatewayEndpoint,
      ALIPAY_AI_PAY_GATEWAY_ENDPOINT,
      "gatewayEndpoint",
    );
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#logger = createLogger(options.logLevel ?? "info", options.logger);

    if (typeof this.#fetch !== "function") {
      throw new AlipayAIPayConfigError("A fetch implementation is required.");
    }
  }

  buildPaymentNeededHeader(input: AlipayAIPayClientBillInput): AlipayAIPayPaymentNeededResult {
    return buildAlipayAIPayPaymentNeededHeader(
      {
        ...input,
        sellerAppId: input.sellerAppId ?? this.#appId,
      },
      {
        privateKey: this.#privateKey,
      },
    );
  }

  parsePaymentProofHeader(header: string): AlipayAIPayPaymentProof {
    return parseAlipayAIPayPaymentProofHeader(header);
  }

  async verifyPayment(
    input: AlipayAIPayVerifyPaymentInput,
    options: AlipayAIPayVerifyPaymentOptions = {},
  ): Promise<AlipayAIPayPaymentVerifyResult> {
    const bizContent: Record<string, unknown> = {
      payment_proof: requiredText(input.paymentProof, "paymentProof"),
      trade_no: requiredText(input.tradeNo, "tradeNo"),
    };

    if (typeof input.clientSession === "string" && input.clientSession.length > 0) {
      bizContent.client_session = input.clientSession;
    }

    const { node, status } = await this.#execute(
      ALIPAY_AI_PAY_PAYMENT_VERIFY_METHOD,
      bizContent,
      options,
    );
    const wire = assertPaymentVerifyWireResponse(node, status);
    const mismatches = collectExpectationMismatches(wire, options.expect);
    const result: AlipayAIPayPaymentVerifyResult = {
      active: wire.active,
      amount: wire.amount,
      mismatches,
      outTradeNo: wire.out_trade_no,
      rawResponse: wire,
      resourceId: wire.resource_id,
      tradeNo: wire.trade_no,
      verified: wire.active && mismatches.length === 0,
    };

    this.#logger.info("Alipay AI Pay payment verification completed.", {
      active: result.active,
      mismatches: result.mismatches,
      outTradeNo: result.outTradeNo,
      tradeNo: result.tradeNo,
      verified: result.verified,
    });

    return result;
  }

  async confirmFulfillment(
    input: string | { tradeNo: string },
    options: AlipayAIPayRequestOptions = {},
  ): Promise<AlipayAIPayFulfillmentConfirmResult> {
    const tradeNo = requiredText(typeof input === "string" ? input : input.tradeNo, "tradeNo");
    const { node, status } = await this.#execute(
      ALIPAY_AI_PAY_FULFILLMENT_CONFIRM_METHOD,
      {
        trade_no: tradeNo,
      },
      options,
    );
    const wire = assertFulfillmentConfirmWireResponse(node, status);

    this.#logger.info("Alipay AI Pay fulfillment confirmation completed.", {
      tradeNo: wire.trade_no,
    });

    return {
      rawResponse: wire,
      tradeNo: wire.trade_no,
    };
  }

  async #execute(
    method: string,
    bizContent: Record<string, unknown>,
    options: AlipayAIPayRequestOptions,
  ): Promise<{ node: Record<string, unknown>; status: number }> {
    const endpoint = optionalText(
      options.gatewayEndpoint,
      this.#gatewayEndpoint,
      "gatewayEndpoint",
    );
    const request = buildAlipayAIPayGatewayRequest({
      appAuthToken: options.appAuthToken ?? this.#appAuthToken,
      appId: this.#appId,
      bizContent,
      method,
      privateKey: this.#privateKey,
      timestamp: options.timestamp,
    });

    this.#logger.debug("Calling Alipay AI Pay gateway.", {
      appId: this.#appId,
      bodyLength: request.body.length,
      endpoint,
      method,
      timestamp: request.params.timestamp,
    });

    try {
      const init: RequestInit = {
        body: request.body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        method: "POST",
      };

      if (options.signal !== undefined) {
        init.signal = options.signal;
      }

      const response = await this.#fetch(endpoint, init);
      const node = await parseAlipayAIPayGatewayResponse(response, {
        alipayPublicKey: this.#alipayPublicKey,
        endpoint,
        method,
      });

      return { node, status: response.status };
    } catch (error) {
      const normalized =
        error instanceof AlipayAIPayResponseError || error instanceof AlipayAIPayRequestError
          ? error
          : new AlipayAIPayRequestError("Alipay AI Pay gateway request failed.", {
              cause: error,
            });

      this.#logger.warn("Alipay AI Pay gateway request failed.", {
        endpoint,
        error: normalized.message,
        method,
        status: normalized instanceof AlipayAIPayResponseError ? normalized.status : 0,
      });

      throw normalized;
    }
  }
}

function assertPaymentVerifyWireResponse(
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

function assertFulfillmentConfirmWireResponse(
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

function collectExpectationMismatches(
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requiredText(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AlipayAIPayConfigError(`Alipay AI Pay ${fieldName} is required.`);
  }

  return value;
}

function optionalText(value: string | undefined, fallback: string, fieldName: string): string {
  if (value === undefined) {
    return fallback;
  }

  return requiredText(value, fieldName);
}
