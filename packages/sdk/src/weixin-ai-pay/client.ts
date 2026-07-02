import {
  buildWeiXinAIPayPreorderRequest,
  normalizeWeiXinAIPayPrivateKey,
  normalizeWeiXinAIPaySignatureEncoding,
} from "./builder.js";
import {
  WeiXinAIPayConfigError,
  WeiXinAIPayRequestError,
  WeiXinAIPayResponseError,
} from "./errors.js";
import { createLogger, type Logger } from "../x402/logger.js";
import {
  WEIXIN_AI_PAY_DEFAULT_DEVELOPER_PLATFORM,
  WEIXIN_AI_PAY_PREORDER_ENDPOINT,
  type WeiXinAIPaymentRequired,
  type WeiXinAIPayClientOptions,
  type WeiXinAIPayPreorderOptions,
  type WeiXinAIPayPreorderResult,
  type WeiXinAIPayPreorderWireResponse,
  type WeiXinAIPaySignatureEncoding,
} from "./types.js";

export class WeiXinAIPayClient {
  readonly #developerId: string;
  readonly #publicKeyId: string;
  readonly #privateKey: string;
  readonly #developerPlatform: string;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;
  readonly #signatureEncoding: WeiXinAIPaySignatureEncoding;

  constructor(options: WeiXinAIPayClientOptions) {
    this.#developerId = requiredText(options.developerId, "developerId");
    this.#publicKeyId = requiredText(options.publicKeyId, "publicKeyId");
    this.#privateKey = normalizeWeiXinAIPayPrivateKey(options.privateKey);
    this.#developerPlatform = optionalText(
      options.developerPlatform,
      WEIXIN_AI_PAY_DEFAULT_DEVELOPER_PLATFORM,
      "developerPlatform",
    );
    this.#endpoint = optionalText(options.endpoint, WEIXIN_AI_PAY_PREORDER_ENDPOINT, "endpoint");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#logger = createLogger(options.logLevel ?? "info", options.logger);
    this.#signatureEncoding = normalizeWeiXinAIPaySignatureEncoding(options.signatureEncoding);

    if (typeof this.#fetch !== "function") {
      throw new WeiXinAIPayConfigError("A fetch implementation is required.");
    }
  }

  async preorder(
    paymentRequired: WeiXinAIPaymentRequired,
    options: WeiXinAIPayPreorderOptions = {},
  ): Promise<WeiXinAIPayPreorderResult> {
    const endpoint = options.endpoint ?? this.#endpoint;
    const developerPlatform = options.developerPlatform ?? this.#developerPlatform;
    const signatureEncoding = options.signatureEncoding ?? this.#signatureEncoding;
    const request = buildWeiXinAIPayPreorderRequest(paymentRequired, {
      developerId: this.#developerId,
      publicKeyId: this.#publicKeyId,
      privateKey: this.#privateKey,
      developerPlatform,
      timestamp: options.timestamp,
      nonceStr: options.nonceStr,
      signatureEncoding,
    });

    this.#logger.debug("Creating WeiXinAI Pay preorder request.", {
      endpoint,
      developerId: this.#developerId,
      publicKeyId: this.#publicKeyId,
      developerPlatform: request.developer_platform,
      timestamp: request.timestamp,
      nonceStr: request.nonce_str,
      signatureEncoding,
      paymentRequiredLength: request.payment_required.length,
    });

    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      };

      if (options.signal !== undefined) {
        init.signal = options.signal;
      }

      const response = await this.#fetch(endpoint, init);
      const result = await parsePreorderResponse(response, endpoint);

      this.#logger.info("WeiXinAI Pay preorder request completed.", {
        endpoint,
        status: response.status,
        paymentCodeLength: result.paymentCode.length,
      });

      return result;
    } catch (error) {
      const normalized =
        error instanceof WeiXinAIPayResponseError || error instanceof WeiXinAIPayRequestError
          ? error
          : new WeiXinAIPayRequestError("WeiXinAI Pay preorder request failed.", {
              cause: error,
            });

      this.#logger.warn("WeiXinAI Pay preorder request failed.", {
        endpoint,
        error: normalized.message,
        status: normalized instanceof WeiXinAIPayResponseError ? normalized.status : 0,
      });

      throw normalized;
    }
  }
}

async function parsePreorderResponse(
  response: Response,
  endpoint: string,
): Promise<WeiXinAIPayPreorderResult> {
  if (!response.ok) {
    throw new WeiXinAIPayResponseError(
      `WeiXinAI Pay preorder request failed with HTTP ${response.status}.`,
      response.status,
      {
        body: await readResponseBody(response),
        endpoint,
        statusText: response.statusText,
      },
    );
  }

  const body = await readJsonResponseBody(response, endpoint);

  if (!isPreorderWireResponse(body)) {
    throw new WeiXinAIPayResponseError(
      "WeiXinAI Pay preorder response was missing payment_code.",
      response.status,
      {
        body,
        endpoint,
      },
    );
  }

  return {
    paymentCode: body.payment_code,
    rawResponse: body,
  };
}

async function readJsonResponseBody(response: Response, endpoint: string): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    throw new WeiXinAIPayResponseError(
      "WeiXinAI Pay preorder response body was empty.",
      response.status,
      {
        endpoint,
      },
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WeiXinAIPayResponseError(
      "WeiXinAI Pay preorder response body was not valid JSON.",
      response.status,
      {
        bodyLength: text.length,
        cause: error,
        contentType: response.headers.get("content-type") ?? "",
        endpoint,
      },
    );
  }
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

function isPreorderWireResponse(value: unknown): value is WeiXinAIPayPreorderWireResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "payment_code" in value &&
    typeof value.payment_code === "string" &&
    value.payment_code.length > 0
  );
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
