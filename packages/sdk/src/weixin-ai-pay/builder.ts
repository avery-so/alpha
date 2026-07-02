import { base16, base64 } from "@scure/base";

import { WeiXinAIPayConfigError, WeiXinAIPayRequestError } from "./errors.js";
import { signSm2Digest, sm3Digest } from "./sm-crypto.js";
import {
  WEIXIN_AI_PAY_DEFAULT_DEVELOPER_PLATFORM,
  WEIXIN_AI_PAY_SIGNATURE_TYPE,
  type WeiXinAIPaymentRequired,
  type WeiXinAIPayPreorderBuildOptions,
  type WeiXinAIPayPreorderRequest,
  type WeiXinAIPayPreorderSigningInput,
  type WeiXinAIPayPreorderSigningOptions,
  type WeiXinAIPaySignatureEncoding,
} from "./types.js";

const textEncoder = new TextEncoder();
const privateKeyPattern = /^(?:0x)?[0-9a-fA-F]{64}$/u;

export function encodeWeiXinAIPaymentRequired(paymentRequired: WeiXinAIPaymentRequired): string {
  let json: string | undefined = "";

  try {
    json = JSON.stringify(paymentRequired);
  } catch (error) {
    throw new WeiXinAIPayRequestError(
      "WeiXinAI Pay payment_required payload could not be serialized to JSON.",
      {
        cause: error,
      },
    );
  }

  if (json === undefined) {
    throw new WeiXinAIPayRequestError(
      "WeiXinAI Pay payment_required payload must be JSON serializable.",
    );
  }

  return base64.encode(textEncoder.encode(json));
}

export function signWeiXinAIPayPreorder(
  input: WeiXinAIPayPreorderSigningInput,
  options: WeiXinAIPayPreorderSigningOptions,
): string {
  const privateKey = normalizeWeiXinAIPayPrivateKey(options.privateKey);
  const signatureEncoding = normalizeWeiXinAIPaySignatureEncoding(options.signatureEncoding);
  const signString = weiXinAIPayPreorderSignString({
    timestamp: requiredText(input.timestamp, "timestamp"),
    nonceStr: requiredText(input.nonceStr, "nonceStr"),
    paymentRequired: requiredText(input.paymentRequired, "paymentRequired"),
  });
  const digest = sm3Digest(textEncoder.encode(signString));
  const signature = signSm2Digest(digest, privateKey, signatureEncoding);

  return base64.encode(signature);
}

export function buildWeiXinAIPayPreorderRequest(
  paymentRequired: WeiXinAIPaymentRequired,
  options: WeiXinAIPayPreorderBuildOptions,
): WeiXinAIPayPreorderRequest {
  const timestamp = options.timestamp ?? defaultTimestamp();
  const nonceStr = options.nonceStr ?? defaultNonceStr();
  const encodedPaymentRequired = encodeWeiXinAIPaymentRequired(paymentRequired);
  const signature = signWeiXinAIPayPreorder(
    {
      timestamp,
      nonceStr,
      paymentRequired: encodedPaymentRequired,
    },
    {
      privateKey: options.privateKey,
      signatureEncoding: options.signatureEncoding,
    },
  );

  return {
    signature_type: WEIXIN_AI_PAY_SIGNATURE_TYPE,
    developer_platform: optionalText(
      options.developerPlatform,
      WEIXIN_AI_PAY_DEFAULT_DEVELOPER_PLATFORM,
      "developerPlatform",
    ),
    developer_id: requiredText(options.developerId, "developerId"),
    pub_key_id: requiredText(options.publicKeyId, "publicKeyId"),
    nonce_str: requiredText(nonceStr, "nonceStr"),
    timestamp: requiredText(timestamp, "timestamp"),
    signature,
    payment_required: encodedPaymentRequired,
  };
}

export function normalizeWeiXinAIPayPrivateKey(privateKey: string): string {
  if (!privateKeyPattern.test(privateKey)) {
    throw new WeiXinAIPayConfigError(
      "WeiXinAI Pay privateKey must be a 32-byte hex string with an optional 0x prefix.",
    );
  }

  return (privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey).toLowerCase();
}

export function normalizeWeiXinAIPaySignatureEncoding(
  signatureEncoding: WeiXinAIPaySignatureEncoding | undefined,
): WeiXinAIPaySignatureEncoding {
  if (signatureEncoding === undefined) {
    return "der";
  }

  if (signatureEncoding !== "der" && signatureEncoding !== "raw") {
    throw new WeiXinAIPayConfigError(
      'WeiXinAI Pay signatureEncoding must be either "der" or "raw".',
      {
        signatureEncoding,
      },
    );
  }

  return signatureEncoding;
}

export function weiXinAIPayPreorderSignString(input: WeiXinAIPayPreorderSigningInput): string {
  return `${input.timestamp}\n${input.nonceStr}\n${input.paymentRequired}\n`;
}

function defaultTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function defaultNonceStr(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  return base16.encode(bytes).toLowerCase();
}

function requiredText(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WeiXinAIPayConfigError(`WeiXinAI Pay ${fieldName} is required.`);
  }

  return value;
}

function optionalText(value: string | undefined, fallback: string, fieldName: string): string {
  if (value === undefined) {
    return fallback;
  }

  return requiredText(value, fieldName);
}
