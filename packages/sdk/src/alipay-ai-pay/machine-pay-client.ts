import { AlipayAIPayConfigError, AlipayAIPayRequestError } from "./errors.js";
import { createLogger, type Logger } from "../x402/logger.js";
import {
  ALIPAY_AI_PAY_PAYMENT_NEEDED_HEADER,
  ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER,
  type AlipayAIPayMachinePayClientOptions,
  type AlipayAIPayMachinePayer,
} from "./types.js";

const emptyPaymentProofMessage = "Alipay AI Pay machine payer returned an empty payment proof.";

export class AlipayAIPayMachinePayClient {
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;
  readonly #payer: AlipayAIPayMachinePayer;

  constructor(options: AlipayAIPayMachinePayClientOptions) {
    if (typeof options !== "object" || options === null) {
      throw new AlipayAIPayConfigError("Alipay AI Pay machine payment options are required.");
    }

    if (
      typeof options.payer !== "object" ||
      options.payer === null ||
      typeof options.payer.createPaymentProof !== "function"
    ) {
      throw new AlipayAIPayConfigError(
        "Alipay AI Pay machine payment requires a payer with createPaymentProof().",
      );
    }

    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#logger = createLogger(options.logLevel ?? "info", options.logger);
    this.#payer = options.payer;

    if (typeof this.#fetch !== "function") {
      throw new AlipayAIPayConfigError("A fetch implementation is required.");
    }
  }

  async fetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1] | undefined,
  ): Promise<Response> {
    let request: Request;

    try {
      request = new Request(input, init);
    } catch (error) {
      const normalized = toRequestError(
        error,
        "Alipay AI Pay machine payment request could not be prepared.",
      );
      this.#logFailure(normalized);
      throw normalized;
    }

    const details = requestDetails(request);

    try {
      this.#logger.debug("Calling Alipay AI Pay machine payment endpoint.", details);
      const firstResponse = await this.#fetch(request.clone());

      if (firstResponse.status !== 402) {
        this.#logger.debug("Alipay AI Pay machine payment endpoint responded.", {
          ...details,
          status: firstResponse.status,
        });
        return firstResponse;
      }

      const paymentNeeded = firstResponse.headers.get(ALIPAY_AI_PAY_PAYMENT_NEEDED_HEADER);

      if (paymentNeeded === null || paymentNeeded.trim().length === 0) {
        this.#logger.warn("Alipay AI Pay machine payment challenge was unavailable.", {
          ...details,
          status: firstResponse.status,
        });
        return firstResponse;
      }

      if (request.headers.has(ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER)) {
        this.#logger.warn(
          "Alipay AI Pay machine payment retry was skipped because the request already has a proof.",
          {
            ...details,
            status: firstResponse.status,
          },
        );
        return firstResponse;
      }

      this.#logger.info("Alipay AI Pay machine payment proof requested.", details);
      const payment = await this.#payer.createPaymentProof({
        paymentNeeded,
        request: {
          method: request.method,
          url: request.url,
        },
        signal: request.signal,
      });
      const paymentProofHeader = payment?.paymentProofHeader;

      if (typeof paymentProofHeader !== "string" || paymentProofHeader.trim().length === 0) {
        throw new AlipayAIPayRequestError(emptyPaymentProofMessage);
      }

      const retryRequest = request.clone();
      retryRequest.headers.set(ALIPAY_AI_PAY_PAYMENT_PROOF_HEADER, paymentProofHeader);

      this.#logger.debug("Retrying Alipay AI Pay machine payment endpoint with a proof.", details);
      const retryResponse = await this.#fetch(retryRequest);
      this.#logger.info("Alipay AI Pay machine payment request completed.", {
        ...details,
        status: retryResponse.status,
      });

      return retryResponse;
    } catch (error) {
      const normalized = toRequestError(error, "Alipay AI Pay machine payment request failed.");
      this.#logFailure(normalized, details);
      throw normalized;
    }
  }

  #logFailure(error: AlipayAIPayRequestError, details: Record<string, unknown> = {}): void {
    this.#logger.warn("Alipay AI Pay machine payment request failed.", {
      ...details,
      errorType: error.details?.causeType ?? error.name,
    });
  }
}

function requestDetails(request: Request): Record<string, unknown> {
  return {
    method: request.method,
    url: request.url,
  };
}

function toRequestError(error: unknown, message: string): AlipayAIPayRequestError {
  if (
    error instanceof AlipayAIPayRequestError &&
    error.message === emptyPaymentProofMessage &&
    error.details === undefined
  ) {
    return error;
  }

  return new AlipayAIPayRequestError(message, {
    causeType: errorType(error),
  });
}

function errorType(error: unknown): string {
  if (error instanceof TypeError) {
    return "TypeError";
  }

  if (error instanceof Error) {
    return "Error";
  }

  return typeof error;
}
