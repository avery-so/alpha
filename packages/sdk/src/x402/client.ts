import { x402Client, x402HTTPClient } from "@x402/core/client";
import type {
  Network,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import {
  createSolanaSigner,
  normalizeEvmPrivateKey,
  normalizeSolanaSecretKey,
  requiredEvmPrivateKey,
  requiredSolanaSecretKey,
} from "./credentials.js";
import { prepareEndpointRequest } from "./endpoint.js";
import { X402ConfigError, X402PaymentError } from "./errors.js";
import { createLogger, type Logger, type LogLevel } from "./logger.js";
import {
  getSupportedX402NetworkDetails,
  getX402NetworkFamily,
  resolveX402Network,
  type X402NetworkFamily,
  type X402NetworkInput,
} from "./networks.js";
import { endpointErrorResult, toEndpointResult } from "./result.js";
import type {
  EndpointInput,
  EndpointRequestInit,
  EndpointResult,
} from "./types.js";

export type { Network, SettleResponse };

export interface X402ClientOptions {
  network: X402NetworkInput;
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

export class X402Client {
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;
  readonly #network: Network;
  readonly #networkFamily: X402NetworkFamily;
  readonly #evmPrivateKey: Hex | undefined;
  readonly #solanaSecretKey: Uint8Array | undefined;
  readonly #rpcUrl: string | undefined;
  readonly #defaultMaxAmount: bigint;
  readonly #runtimes = new Map<string, Promise<Runtime>>();

  constructor(privateKey: string, options: X402ClientOptions) {
    const network = resolveX402Network(options.network);
    const networkFamily = getX402NetworkFamily(network);

    if (networkFamily === undefined) {
      throw new X402ConfigError("Unsupported x402 network.", {
        network,
        supportedNetworks: getSupportedX402NetworkDetails(),
      });
    }

    this.#network = network;
    this.#networkFamily = networkFamily;
    this.#evmPrivateKey =
      networkFamily === "eip155"
        ? normalizeEvmPrivateKey(privateKey)
        : undefined;
    this.#solanaSecretKey =
      networkFamily === "solana"
        ? normalizeSolanaSecretKey(privateKey)
        : undefined;
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

      const runtime = await this.#runtime(
        opts.maxAmount ?? this.#defaultMaxAmount,
      );
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

  #runtime(maxAmount: bigint): Promise<Runtime> {
    const key = maxAmount.toString();
    const existing = this.#runtimes.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const runtime = this.#createRuntime(maxAmount);
    this.#runtimes.set(key, runtime);

    return runtime;
  }

  async #createRuntime(maxAmount: bigint): Promise<Runtime> {
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

    if (this.#networkFamily === "eip155") {
      const signer = privateKeyToAccount(
        requiredEvmPrivateKey(this.#evmPrivateKey),
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
    } else {
      const signer = await createSolanaSigner(
        requiredSolanaSecretKey(this.#solanaSecretKey),
      );

      client.register(
        this.#network,
        new ExactSvmScheme(
          signer,
          this.#rpcUrl === undefined ? undefined : { rpcUrl: this.#rpcUrl },
        ),
      );
    }

    const httpClient = new x402HTTPClient(client);

    return {
      httpClient,
      fetchWithPayment: wrapFetchWithPayment(this.#fetch, httpClient),
    };
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
