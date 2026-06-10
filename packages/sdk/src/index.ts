export interface AlphaClientOptions {
  apiKey?: string | undefined;
  baseUrl?: string | URL | undefined;
  fetch?: typeof fetch | undefined;
}

export interface AlphaStatus {
  ok: boolean;
  service: "alpha";
}

export class AlphaClient {
  readonly #apiKey: string | undefined;
  readonly #baseUrl: URL;
  readonly #fetch: typeof fetch;

  constructor(options: AlphaClientOptions = {}) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.avery.so/alpha");
    this.#fetch = options.fetch ?? globalThis.fetch;

    if (typeof this.#fetch !== "function") {
      throw new TypeError("A fetch implementation is required.");
    }
  }

  async getStatus(): Promise<AlphaStatus> {
    const requestUrl = new URL("/status", this.#baseUrl);
    const response = await this.#fetch(requestUrl, {
      headers: this.#headers(),
      method: "GET",
    });

    if (!response.ok) {
      throw new AlphaError(
        `Alpha status request failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    return {
      ok: true,
      service: "alpha",
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

export class AlphaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AlphaError";
  }
}
