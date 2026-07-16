import type { KeyObject } from "node:crypto";

import type { Logger, LogLevel } from "../x402/logger.js";

export const ALIPAY_AI_PAY_GATEWAY_ENDPOINT = "https://openapi.alipay.com/gateway.do" as const;
export const ALIPAY_AI_PAY_PAYMENT_VERIFY_METHOD = "alipay.aipay.agent.payment.verify" as const;
export const ALIPAY_AI_PAY_FULFILLMENT_CONFIRM_METHOD =
  "alipay.aipay.agent.fulfillment.confirm" as const;
export const ALIPAY_AI_PAY_SIGN_TYPE = "RSA2" as const;
export const ALIPAY_AI_PAY_GATEWAY_SUCCESS_CODE = "10000" as const;
export const ALIPAY_AI_PAY_PAYMENT_NEEDED_HEADER = "Payment-Needed" as const;
export const ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER = "Payment-Proof" as const;
export const ALIPAY_AI_PAY_DEFAULT_CURRENCY = "CNY" as const;
export const ALIPAY_AI_PAY_SELLER_UNIQUE_ID_KEY = "seller_id" as const;

export type AlipayAIPayKeyInput = string | KeyObject;

export interface AlipayAIPayClientOptions {
  appId: string;
  privateKey: AlipayAIPayKeyInput;
  alipayPublicKey?: AlipayAIPayKeyInput | undefined;
  appAuthToken?: string | undefined;
  gatewayEndpoint?: string | undefined;
  fetch?: typeof fetch | undefined;
  logLevel?: LogLevel | undefined;
  logger?: Logger | undefined;
}

export interface AlipayAIPayBillInput {
  outTradeNo: string;
  amount: string;
  currency?: string | undefined;
  resourceId: string;
  payBefore: string;
  sellerId: string;
  sellerName: string;
  sellerAppId: string;
  goodsName: string;
  serviceId: string;
}

export interface AlipayAIPayClientBillInput extends Omit<AlipayAIPayBillInput, "sellerAppId"> {
  sellerAppId?: string | undefined;
}

export interface AlipayAIPayBillSigningOptions {
  privateKey: AlipayAIPayKeyInput;
}

export interface AlipayAIPayPaymentNeededProtocol {
  out_trade_no: string;
  amount: string;
  currency: string;
  resource_id: string;
  pay_before: string;
  seller_signature: string;
  seller_sign_type: typeof ALIPAY_AI_PAY_SIGN_TYPE;
  seller_unique_id: string;
}

export interface AlipayAIPayPaymentNeededMethod {
  seller_name: string;
  seller_id: string;
  seller_app_id: string;
  goods_name: string;
  seller_unique_id_key: string;
  service_id: string;
}

export interface AlipayAIPayPaymentNeeded {
  protocol: AlipayAIPayPaymentNeededProtocol;
  method: AlipayAIPayPaymentNeededMethod;
}

export interface AlipayAIPayPaymentNeededResult {
  header: string;
  paymentNeeded: AlipayAIPayPaymentNeeded;
}

export interface AlipayAIPayPaymentProof {
  paymentProof: string;
  tradeNo: string;
  clientSession?: string | undefined;
  raw: unknown;
}

export interface AlipayAIPayVerifyPaymentInput {
  tradeNo: string;
  paymentProof: string;
  clientSession?: string | undefined;
}

export interface AlipayAIPayVerifyExpectation {
  amount?: string | undefined;
  outTradeNo?: string | undefined;
  resourceId?: string | undefined;
}

export interface AlipayAIPayRequestOptions {
  signal?: AbortSignal | undefined;
  timestamp?: string | undefined;
  gatewayEndpoint?: string | undefined;
  appAuthToken?: string | undefined;
}

export interface AlipayAIPayVerifyPaymentOptions extends AlipayAIPayRequestOptions {
  expect?: AlipayAIPayVerifyExpectation | undefined;
}

export interface AlipayAIPayGatewayRequestInput {
  method: string;
  bizContent: Record<string, unknown>;
  appId: string;
  privateKey: AlipayAIPayKeyInput;
  timestamp?: string | undefined;
  appAuthToken?: string | undefined;
}

export interface AlipayAIPayGatewayRequest {
  params: Record<string, string>;
  body: string;
  signContent: string;
}

export interface AlipayAIPayGatewayParseOptions {
  method: string;
  endpoint: string;
  alipayPublicKey?: AlipayAIPayKeyInput | undefined;
}

export interface AlipayAIPayGatewayResponseNode {
  code: string;
  msg?: string | undefined;
  sub_code?: string | undefined;
  sub_msg?: string | undefined;
  [key: string]: unknown;
}

export interface AlipayAIPayPaymentVerifyWireResponse extends AlipayAIPayGatewayResponseNode {
  trade_no: string;
  amount: string;
  resource_id: string;
  active: boolean;
  out_trade_no: string;
}

export interface AlipayAIPayFulfillmentConfirmWireResponse extends AlipayAIPayGatewayResponseNode {
  trade_no: string;
}

export interface AlipayAIPayPaymentVerifyResult {
  active: boolean;
  amount: string;
  outTradeNo: string;
  resourceId: string;
  tradeNo: string;
  verified: boolean;
  mismatches: string[];
  rawResponse: AlipayAIPayPaymentVerifyWireResponse;
}

export interface AlipayAIPayFulfillmentConfirmResult {
  tradeNo: string;
  rawResponse: AlipayAIPayFulfillmentConfirmWireResponse;
}
