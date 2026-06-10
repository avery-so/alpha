interface AveryClientOptions {
  apiKey?: string | undefined;
  baseUrl?: string | URL | undefined;
  fetch?: typeof fetch | undefined;
}

interface AveryStatus {
  ok: boolean;
  service: "avery";
}

/**
 * @deprecated Use `AveryClientOptions` instead.
 */
type AlphaClientOptions = AveryClientOptions;

/**
 * @deprecated Use `AveryStatus` instead.
 */
interface AlphaStatus {
  ok: boolean;
  service: "alpha";
}

interface StatusClientConfig<ServiceName extends string> {
  defaultBaseUrl: string;
  errorMessagePrefix: string;
  ErrorClass: new (message: string, status: number) => Error;
  service: ServiceName;
}

class StatusClient<ServiceName extends string> {
  readonly #apiKey: string | undefined;
  readonly #baseUrl: URL;
  readonly #config: StatusClientConfig<ServiceName>;
  readonly #fetch: typeof fetch;

  constructor(
    config: StatusClientConfig<ServiceName>,
    options: AveryClientOptions = {},
  ) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = new URL(options.baseUrl ?? config.defaultBaseUrl);
    this.#config = config;
    this.#fetch = options.fetch ?? globalThis.fetch;

    if (typeof this.#fetch !== "function") {
      throw new TypeError("A fetch implementation is required.");
    }
  }

  async getStatus(): Promise<{ ok: boolean; service: ServiceName }> {
    const requestUrl = new URL("status", ensureTrailingSlash(this.#baseUrl));
    const response = await this.#fetch(requestUrl, {
      headers: this.#headers(),
      method: "GET",
    });

    if (!response.ok) {
      throw new this.#config.ErrorClass(
        `${this.#config.errorMessagePrefix} status request failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    return {
      ok: true,
      service: this.#config.service,
    };
  }

  #headers(): Headers {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": "@averyso/alpha",
    });

    if (this.#apiKey) {
      headers.set("authorization", `Bearer ${this.#apiKey}`);
    }

    return headers;
  }
}

const ensureTrailingSlash = (url: URL): URL => {
  const normalizedUrl = new URL(url);

  if (!normalizedUrl.pathname.endsWith("/")) {
    normalizedUrl.pathname = `${normalizedUrl.pathname}/`;
  }

  return normalizedUrl;
};

class AveryClient extends StatusClient<"avery"> {
  constructor(options: AveryClientOptions = {}) {
    super(
      {
        defaultBaseUrl: "https://api.avery.so/avery",
        errorMessagePrefix: "Avery",
        ErrorClass: AveryError,
        service: "avery",
      },
      options,
    );
  }

  override getStatus(): Promise<AveryStatus> {
    return super.getStatus();
  }
}

/**
 * @deprecated Use `AveryClient` instead.
 */
class AlphaClient extends StatusClient<"alpha"> {
  constructor(options: AlphaClientOptions = {}) {
    super(
      {
        defaultBaseUrl: "https://api.avery.so/alpha",
        errorMessagePrefix: "Alpha",
        ErrorClass: AlphaError,
        service: "alpha",
      },
      options,
    );
  }

  override getStatus(): Promise<AlphaStatus> {
    return super.getStatus();
  }
}

class AveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AveryError";
  }
}

/**
 * @deprecated Use `AveryError` instead.
 */
class AlphaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AlphaError";
  }
}

export { AlphaClient, AlphaError, AveryClient, AveryError };
export type {
  AlphaClientOptions,
  AlphaStatus,
  AveryClientOptions,
  AveryStatus,
};
export * from "./x402/index.js";
