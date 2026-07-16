import { base64, base64urlnopad } from "@scure/base";

import { AlipayAIPayConfigError, AlipayAIPayRequestError } from "./errors.js";
import { signAlipayAIPayRsa2 } from "./rsa.js";
import {
  ALIPAY_AI_PAY_DEFAULT_CURRENCY,
  ALIPAY_AI_PAY_SELLER_UNIQUE_ID_KEY,
  ALIPAY_AI_PAY_SIGN_TYPE,
  type AlipayAIPayBillInput,
  type AlipayAIPayBillSigningOptions,
  type AlipayAIPayPaymentNeeded,
  type AlipayAIPayPaymentNeededResult,
  type AlipayAIPayPaymentProof,
} from "./types.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function alipayAIPayBillSignContent(input: AlipayAIPayBillInput): string {
  const bill = normalizeBillInput(input);
  const fields: Record<string, string> = {
    amount: bill.amount,
    currency: bill.currency,
    goods_name: bill.goodsName,
    out_trade_no: bill.outTradeNo,
    pay_before: bill.payBefore,
    resource_id: bill.resourceId,
    seller_id: bill.sellerId,
    service_id: bill.serviceId,
  };

  return Object.entries(fields)
    .filter(([, value]) => value.length > 0)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function signAlipayAIPayBill(
  input: AlipayAIPayBillInput,
  options: AlipayAIPayBillSigningOptions,
): string {
  return signAlipayAIPayRsa2(alipayAIPayBillSignContent(input), options.privateKey);
}

export function buildAlipayAIPayPaymentNeeded(
  input: AlipayAIPayBillInput,
  options: AlipayAIPayBillSigningOptions,
): AlipayAIPayPaymentNeeded {
  const bill = normalizeBillInput(input);
  const sellerSignature = signAlipayAIPayBill(bill, options);

  return {
    protocol: {
      out_trade_no: bill.outTradeNo,
      amount: bill.amount,
      currency: bill.currency,
      resource_id: bill.resourceId,
      pay_before: bill.payBefore,
      seller_signature: sellerSignature,
      seller_sign_type: ALIPAY_AI_PAY_SIGN_TYPE,
      seller_unique_id: bill.sellerId,
    },
    method: {
      seller_name: bill.sellerName,
      seller_id: bill.sellerId,
      seller_app_id: bill.sellerAppId,
      goods_name: bill.goodsName,
      seller_unique_id_key: ALIPAY_AI_PAY_SELLER_UNIQUE_ID_KEY,
      service_id: bill.serviceId,
    },
  };
}

export function encodeAlipayAIPayPaymentNeededHeader(
  paymentNeeded: AlipayAIPayPaymentNeeded,
): string {
  return base64urlnopad.encode(textEncoder.encode(JSON.stringify(paymentNeeded)));
}

export function buildAlipayAIPayPaymentNeededHeader(
  input: AlipayAIPayBillInput,
  options: AlipayAIPayBillSigningOptions,
): AlipayAIPayPaymentNeededResult {
  const paymentNeeded = buildAlipayAIPayPaymentNeeded(input, options);

  return {
    header: encodeAlipayAIPayPaymentNeededHeader(paymentNeeded),
    paymentNeeded,
  };
}

export function parseAlipayAIPayPaymentProofHeader(header: string): AlipayAIPayPaymentProof {
  if (typeof header !== "string" || header.trim().length === 0) {
    throw new AlipayAIPayRequestError("Alipay AI Pay Payment-Proof header is required.");
  }

  let decoded = "";

  try {
    decoded = textDecoder.decode(decodeBase64Lenient(header.trim()));
  } catch (error) {
    throw new AlipayAIPayRequestError(
      "Alipay AI Pay Payment-Proof header is not valid Base64/Base64URL.",
      {
        cause: error,
      },
    );
  }

  let raw: unknown = null;

  try {
    raw = JSON.parse(decoded);
  } catch (error) {
    throw new AlipayAIPayRequestError("Alipay AI Pay Payment-Proof header is not valid JSON.", {
      cause: error,
    });
  }

  const protocol = readRecord(raw, "protocol");
  const paymentProof = protocol?.payment_proof;
  const tradeNo = protocol?.trade_no;

  if (typeof paymentProof !== "string" || paymentProof.trim().length === 0) {
    throw new AlipayAIPayRequestError(
      "Alipay AI Pay Payment-Proof header is missing protocol.payment_proof.",
      {
        raw,
      },
    );
  }

  if (typeof tradeNo !== "string" || tradeNo.trim().length === 0) {
    throw new AlipayAIPayRequestError(
      "Alipay AI Pay Payment-Proof header is missing protocol.trade_no.",
      {
        raw,
      },
    );
  }

  const method = readRecord(raw, "method");
  const clientSession = method?.client_session;

  return {
    paymentProof,
    tradeNo,
    clientSession:
      typeof clientSession === "string" && clientSession.length > 0 ? clientSession : undefined,
    raw,
  };
}

function decodeBase64Lenient(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  return base64.decode(padded);
}

function readRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const child = (value as Record<string, unknown>)[key];

  if (typeof child !== "object" || child === null) {
    return undefined;
  }

  return child as Record<string, unknown>;
}

interface NormalizedBillInput extends AlipayAIPayBillInput {
  currency: string;
}

function normalizeBillInput(input: AlipayAIPayBillInput): NormalizedBillInput {
  return {
    amount: requiredText(input.amount, "amount"),
    currency: optionalText(input.currency, ALIPAY_AI_PAY_DEFAULT_CURRENCY, "currency"),
    goodsName: requiredText(input.goodsName, "goodsName"),
    outTradeNo: requiredText(input.outTradeNo, "outTradeNo"),
    payBefore: requiredText(input.payBefore, "payBefore"),
    resourceId: requiredText(input.resourceId, "resourceId"),
    sellerAppId: requiredText(input.sellerAppId, "sellerAppId"),
    sellerId: requiredText(input.sellerId, "sellerId"),
    sellerName: requiredText(input.sellerName, "sellerName"),
    serviceId: requiredText(input.serviceId, "serviceId"),
  };
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
