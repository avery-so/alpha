import { AlipayAIPayResponseError } from "./errors.js";
import { verifyAlipayAIPayRsa2 } from "./rsa.js";
import {
  ALIPAY_AI_PAY_GATEWAY_SUCCESS_CODE,
  type AlipayAIPayGatewayParseOptions,
} from "./types.js";

const GATEWAY_ERROR_RESPONSE_KEY = "error_response";

export function alipayAIPayResponseKeyForMethod(method: string): string {
  return `${method.replaceAll(".", "_")}_response`;
}

export function extractAlipayAIPayResponseNode(
  rawBody: string,
  responseKey: string,
): string | undefined {
  const keyToken = `"${responseKey}"`;
  const keyIndex = rawBody.indexOf(keyToken);

  if (keyIndex === -1) {
    return undefined;
  }

  const braceStart = rawBody.indexOf("{", keyIndex + keyToken.length);

  if (braceStart === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = braceStart; index < rawBody.length; index += 1) {
    const char = rawBody.charAt(index);

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return rawBody.slice(braceStart, index + 1);
      }
    }
  }

  return undefined;
}

export async function parseAlipayAIPayGatewayResponse(
  response: Response,
  options: AlipayAIPayGatewayParseOptions,
): Promise<Record<string, unknown>> {
  const { endpoint, method } = options;

  if (!response.ok) {
    throw new AlipayAIPayResponseError(
      `Alipay AI Pay gateway request failed with HTTP ${response.status}.`,
      response.status,
      {
        body: await readResponseBody(response),
        endpoint,
        method,
        statusText: response.statusText,
      },
    );
  }

  const text = await response.text();

  if (text.length === 0) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay gateway response body was empty.",
      response.status,
      {
        endpoint,
        method,
      },
    );
  }

  let parsed: unknown = null;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay gateway response body was not valid JSON.",
      response.status,
      {
        bodyLength: text.length,
        cause: error,
        contentType: response.headers.get("content-type") ?? "",
        endpoint,
        method,
      },
    );
  }

  const responseKey = alipayAIPayResponseKeyForMethod(method);
  const envelope = asRecord(parsed);
  const node = asRecord(envelope?.[responseKey]);

  if (node === undefined) {
    const errorNode = asRecord(envelope?.[GATEWAY_ERROR_RESPONSE_KEY]);

    if (errorNode !== undefined) {
      throw gatewayBusinessError(errorNode, response.status, endpoint, method);
    }

    throw new AlipayAIPayResponseError(
      `Alipay AI Pay gateway response was missing the ${responseKey} node.`,
      response.status,
      {
        body: parsed,
        endpoint,
        method,
      },
    );
  }

  if (options.alipayPublicKey !== undefined) {
    verifyGatewayResponseSignature(text, responseKey, envelope, node, options.alipayPublicKey, {
      endpoint,
      method,
      status: response.status,
    });
  }

  if (node.code !== ALIPAY_AI_PAY_GATEWAY_SUCCESS_CODE) {
    throw gatewayBusinessError(node, response.status, endpoint, method);
  }

  return node;
}

function verifyGatewayResponseSignature(
  rawBody: string,
  responseKey: string,
  envelope: Record<string, unknown> | undefined,
  node: Record<string, unknown>,
  alipayPublicKey: NonNullable<AlipayAIPayGatewayParseOptions["alipayPublicKey"]>,
  context: { endpoint: string; method: string; status: number },
): void {
  const sign = envelope?.sign;

  if (typeof sign !== "string" || sign.length === 0) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay gateway response was missing the sign field.",
      context.status,
      context,
    );
  }

  const signedText = extractAlipayAIPayResponseNode(rawBody, responseKey);

  if (signedText === undefined || !verifyAlipayAIPayRsa2(signedText, sign, alipayPublicKey)) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay gateway response signature verification failed.",
      context.status,
      context,
    );
  }

  // Bind the signed bytes to the node handed back to the caller.
  // JSON.parse keeps the last duplicate key; raw extraction finds the first.
  // Reject spliced envelopes whose signed node differs from the parsed node.
  if (!signedTextMatchesNode(signedText, node)) {
    throw new AlipayAIPayResponseError(
      "Alipay AI Pay gateway response signature does not cover the returned response node.",
      context.status,
      context,
    );
  }
}

function signedTextMatchesNode(signedText: string, node: Record<string, unknown>): boolean {
  try {
    return deepJsonEquals(JSON.parse(signedText), node);
  } catch {
    return false;
  }
}

function deepJsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepJsonEquals(item, right[index]))
    );
  }

  if (
    typeof left === "object" &&
    left !== null &&
    !Array.isArray(left) &&
    typeof right === "object" &&
    right !== null &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);

    return (
      leftKeys.length === Object.keys(rightRecord).length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(rightRecord, key) && deepJsonEquals(leftRecord[key], rightRecord[key]),
      )
    );
  }

  return false;
}

function gatewayBusinessError(
  node: Record<string, unknown>,
  status: number,
  endpoint: string,
  method: string,
): AlipayAIPayResponseError {
  const code = typeof node.code === "string" ? node.code : "";
  const subCode = typeof node.sub_code === "string" ? node.sub_code : "";
  const subMsg = typeof node.sub_msg === "string" ? node.sub_msg : "";
  const suffix = subCode.length > 0 ? ` (${subCode}: ${subMsg})` : "";

  return new AlipayAIPayResponseError(
    `Alipay AI Pay gateway call failed with code ${code}${suffix}.`,
    status,
    {
      body: node,
      code,
      endpoint,
      method,
      subCode,
      subMsg,
    },
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
