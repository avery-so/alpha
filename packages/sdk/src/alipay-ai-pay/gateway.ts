import { AlipayAIPayConfigError, AlipayAIPayRequestError } from "./errors.js";
import { signAlipayAIPayRsa2 } from "./rsa.js";
import {
  ALIPAY_AI_PAY_SIGN_TYPE,
  type AlipayAIPayGatewayRequest,
  type AlipayAIPayGatewayRequestInput,
} from "./types.js";

export function alipayAIPayGatewayTimestamp(date: Date = new Date()): string {
  const utc8Millis = date.getTime() + 8 * 60 * 60 * 1000;
  const iso = new Date(utc8Millis).toISOString();

  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

export function buildAlipayAIPayGatewayRequest(
  input: AlipayAIPayGatewayRequestInput,
): AlipayAIPayGatewayRequest {
  const params: Record<string, string> = {
    app_id: requiredText(input.appId, "appId"),
    biz_content: serializeBizContent(input.bizContent),
    charset: "utf-8",
    format: "JSON",
    method: requiredText(input.method, "method"),
    sign_type: ALIPAY_AI_PAY_SIGN_TYPE,
    timestamp: input.timestamp ?? alipayAIPayGatewayTimestamp(),
    version: "1.0",
  };

  if (input.appAuthToken !== undefined) {
    params.app_auth_token = requiredText(input.appAuthToken, "appAuthToken");
  }

  const signContent = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const sign = signAlipayAIPayRsa2(signContent, input.privateKey);
  const signedParams = { ...params, sign };

  return {
    body: new URLSearchParams(signedParams).toString(),
    params: signedParams,
    signContent,
  };
}

function serializeBizContent(bizContent: Record<string, unknown>): string {
  let json: string | undefined = "";

  try {
    json = JSON.stringify(bizContent);
  } catch (error) {
    throw new AlipayAIPayRequestError(
      "Alipay AI Pay biz_content could not be serialized to JSON.",
      {
        cause: error,
      },
    );
  }

  if (json === undefined) {
    throw new AlipayAIPayRequestError("Alipay AI Pay biz_content must be JSON serializable.");
  }

  return json;
}

function requiredText(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AlipayAIPayConfigError(`Alipay AI Pay ${fieldName} is required.`);
  }

  return value;
}
