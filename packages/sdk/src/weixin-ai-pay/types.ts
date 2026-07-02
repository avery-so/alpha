import type { Logger, LogLevel } from "../x402/logger.js";

export const WEIXIN_AI_PAY_PREORDER_ENDPOINT =
  "https://payapp.weixin.qq.com/palmpayminiapp/clawagentpay/preorder" as const;
export const WEIXIN_AI_PAY_SIGNATURE_TYPE = "WEIXINAIPAY-SM2-WITH-SM3" as const;
export const WEIXIN_AI_PAY_DEFAULT_DEVELOPER_PLATFORM = "WXPAY" as const;

export type WeiXinAIPaySignatureEncoding = "der" | "raw";
export type WeiXinAIPaymentRequired = unknown;

export interface WeiXinAIPayClientOptions {
  developerId: string;
  publicKeyId: string;
  privateKey: string;
  developerPlatform?: string | undefined;
  fetch?: typeof fetch | undefined;
  endpoint?: string | undefined;
  logLevel?: LogLevel | undefined;
  logger?: Logger | undefined;
  signatureEncoding?: WeiXinAIPaySignatureEncoding | undefined;
}

export interface WeiXinAIPayPreorderOptions {
  signal?: AbortSignal | undefined;
  timestamp?: string | undefined;
  nonceStr?: string | undefined;
  developerPlatform?: string | undefined;
  endpoint?: string | undefined;
  signatureEncoding?: WeiXinAIPaySignatureEncoding | undefined;
}

export interface WeiXinAIPayPreorderBuildOptions {
  developerId: string;
  publicKeyId: string;
  privateKey: string;
  developerPlatform?: string | undefined;
  timestamp?: string | undefined;
  nonceStr?: string | undefined;
  signatureEncoding?: WeiXinAIPaySignatureEncoding | undefined;
}

export interface WeiXinAIPayPreorderSigningInput {
  timestamp: string;
  nonceStr: string;
  paymentRequired: string;
}

export interface WeiXinAIPayPreorderSigningOptions {
  privateKey: string;
  signatureEncoding?: WeiXinAIPaySignatureEncoding | undefined;
}

export interface WeiXinAIPayPreorderRequest {
  signature_type: typeof WEIXIN_AI_PAY_SIGNATURE_TYPE;
  developer_platform: string;
  developer_id: string;
  pub_key_id: string;
  nonce_str: string;
  timestamp: string;
  signature: string;
  payment_required: string;
}

export interface WeiXinAIPayPreorderWireResponse {
  payment_code: string;
  [key: string]: unknown;
}

export interface WeiXinAIPayPreorderResult {
  paymentCode: string;
  rawResponse: WeiXinAIPayPreorderWireResponse;
}
