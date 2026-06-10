import { x402Client, x402HTTPClient } from "@x402/core/client";
import type {
  Network,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import { prepareEndpointRequest } from "./endpoint.js";
import { X402ConfigError, X402PaymentError } from "./errors.js";
import { createLogger, type Logger, type LogLevel } from "./logger.js";
import { endpointErrorResult, toEndpointResult } from "./result.js";
import type {
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
} from "./types.js";

export type { Network, SettleResponse };

export interface X402ClientOptions {
  network: Network;
  logLevel?: LogLevel | undefined;
  logger?: Logger | undefined;
  fetch?: typeof fetch | undefined;
  maxAmount?: bigint | undefined;
  rpcUrl?: string | undefined;
}

export interface X402CallOptions {
  signal?: AbortSignal | undefined;
  maxAmount?: bigint | undefined;
  throwOnError?: boolean | undefined;
}

interface Runtime {
  httpClient: x402HTTPClient;
  fetchWithPayment: typeof fetch;
}

const defaultMaxAmount = 100_000n;
const privateKeyPattern = /^(?:0x)?[0-9a-fA-F]{64}$/u;

export class X402Client {
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;
  readonly #network: Network;
  readonly #privateKey: Hex;
  readonly #rpcUrl: string | undefined;
  readonly #defaultMaxAmount: bigint;
  readonly #runtimes = new Map<string, Runtime>();

  constructor(privateKey: string, options: X402ClientOptions) {
    if (!isEip155Network(options.network)) {
      throw new X402ConfigError("X402Client only supports eip155:* networks.", {
        network: options.network,
      });
    }

    this.#network = options.network;
    this.#privateKey = normalizePrivateKey(privateKey);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#logger = createLogger(options.logLevel ?? "info", options.logger);
    this.#defaultMaxAmount = options.maxAmount ?? defaultMaxAmount;
    this.#rpcUrl = options.rpcUrl;

    if (typeof this.#fetch !== "function") {
      throw new X402ConfigError("A fetch implementation is required.");
    }
  }

  get network(): Network {
    return this.#network;
  }

  get maxAmount(): bigint {
    return this.#defaultMaxAmount;
  }

  async call(
    endpoint: EndpointInput,
    init?: EndpointRequestInit | undefined,
    opts: X402CallOptions = {},
  ): Promise<EndpointResult> {
    const prepared = prepareEndpointRequest(endpoint, {
      request: init,
      signal: opts.signal,
    });

    try {
      this.#logger.debug("Calling x402 endpoint.", {
        method: prepared.method,
        url: prepared.url,
      });

      const runtime = this.#runtime(opts.maxAmount ?? this.#defaultMaxAmount);
      const response = await runtime.fetchWithPayment(
        prepared.input,
        prepared.init,
      );
      const result = toEndpointResult(
        await runtime.httpClient.processResponse(response),
      );

      result.metadata.method = prepared.method;

      if (opts.throwOnError && !result.ok) {
        throw new X402PaymentError(
          `x402 endpoint request failed with ${result.kind}.`,
          result.status,
          {
            result,
          },
        );
      }

      return result;
    } catch (error) {
      if (opts.throwOnError && error instanceof X402PaymentError) {
        throw error;
      }

      const normalized =
        error instanceof X402PaymentError
          ? error
          : new X402PaymentError("x402 endpoint request failed.", 0, {
              cause: error,
            });

      if (opts.throwOnError) {
        throw normalized;
      }

      this.#logger.warn("x402 endpoint request failed.", {
        error: normalized.message,
      });

      return endpointErrorResult(normalized, {
        method: prepared.method,
        status: normalized.status,
        url: prepared.url,
      });
    }
  }

  #runtime(maxAmount: bigint): Runtime {
    const key = maxAmount.toString();
    const existing = this.#runtimes.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const signer = privateKeyToAccount(this.#privateKey);
    const client = new x402Client((version, requirements) =>
      selectCheapestRequirement(
        version,
        requirements,
        this.#network,
        maxAmount,
      ),
    );

    client.registerPolicy((_version, requirements) =>
      requirements.filter(
        (requirement) =>
          requirement.network === this.#network &&
          amountOf(requirement) <= maxAmount,
      ),
    );

    registerExactEvmScheme(client, {
      signer,
      networks: [this.#network],
      ...(this.#rpcUrl === undefined
        ? {}
        : {
            schemeOptions: {
              rpcUrl: this.#rpcUrl,
            },
          }),
    });

    const httpClient = new x402HTTPClient(client);
    const runtime = {
      httpClient,
      fetchWithPayment: wrapFetchWithPayment(this.#fetch, httpClient),
    };

    this.#runtimes.set(key, runtime);
    return runtime;
  }
}

function selectCheapestRequirement(
  _version: number,
  requirements: PaymentRequirements[],
  network: Network,
  maxAmount: bigint,
): PaymentRequirements {
  const eligible = requirements
    .filter(
      (requirement) =>
        requirement.network === network && amountOf(requirement) <= maxAmount,
    )
    .toSorted((left, right) => compareBigint(amountOf(left), amountOf(right)));

  const selected = eligible[0];

  if (selected === undefined) {
    throw new X402PaymentError(
      "No compatible x402 payment requirements were available.",
      0,
      {
        maxAmount: maxAmount.toString(),
        network,
      },
    );
  }

  return selected;
}

function amountOf(requirement: PaymentRequirements): bigint {
  const maybeLegacyRequirement = requirement as PaymentRequirements & {
    maxAmountRequired?: string | undefined;
  };

  return BigInt(
    maybeLegacyRequirement.amount ?? maybeLegacyRequirement.maxAmountRequired,
  );
}

function compareBigint(left: bigint, right: bigint): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function isEip155Network(network: Network): boolean {
  return network.startsWith("eip155:");
}

function normalizePrivateKey(privateKey: string): Hex {
  if (!privateKeyPattern.test(privateKey)) {
    throw new X402ConfigError(
      "Private key must be a 32-byte hex string with an optional 0x prefix.",
    );
  }

  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
}
