import type {
  EndpointConfig,
  EndpointInput,
  EndpointRequestInit,
  HeadersInput,
  JsonValue,
  RequestBody,
} from "./types.js";

const bodyMethods = new Set(["POST", "PUT", "PATCH"]);
const queryMethods = new Set(["GET", "HEAD", "DELETE"]);

export interface PreparedEndpointRequest {
  input: Parameters<typeof fetch>[0] | URL;
  init: RequestInit;
  url: string;
  method: string;
}

interface PrepareEndpointRequestOptions {
  request?: EndpointRequestInit | EndpointConfig | undefined;
  toolInput?: unknown;
  signal?: AbortSignal | undefined;
}

export function prepareEndpointRequest(
  endpoint: EndpointInput,
  options: PrepareEndpointRequestOptions = {},
): PreparedEndpointRequest {
  const endpointConfig = normalizeEndpoint(endpoint);
  const requestConfig = normalizeRequestOverride(options.request);
  const method = normalizeMethod(
    requestConfig?.method ?? endpointConfig.method ?? "GET",
  );
  const url = new URL(String(requestConfig?.url ?? endpointConfig.url));

  mergeQuery(url, endpointConfig.query);

  if (requestConfig?.query !== undefined) {
    mergeQuery(url, requestConfig.query);
  } else if (requestConfig === undefined && shouldDefaultQuery(method)) {
    mergePlainObjectQuery(url, options.toolInput);
  }

  const headers = new Headers(endpointConfig.headers);
  mergeHeaders(headers, requestConfig?.headers);

  const init: RequestInit = {
    method,
    headers,
  };

  const body =
    requestConfig?.body ??
    endpointConfig.body ??
    (requestConfig === undefined && shouldDefaultBody(method)
      ? options.toolInput
      : undefined);

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = encodeBody(body, headers);
  }

  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  const passthrough = mergePassthroughInit(endpointConfig, requestConfig);
  Object.assign(init, passthrough);

  return {
    input: url,
    init,
    url: url.toString(),
    method,
  };
}

function normalizeEndpoint(endpoint: EndpointInput): EndpointConfig {
  if (typeof endpoint === "string" || endpoint instanceof URL) {
    return {
      url: endpoint,
    };
  }

  return endpoint;
}

function normalizeRequestOverride(
  request: EndpointRequestInit | EndpointConfig | undefined,
): EndpointConfig | undefined {
  if (request === undefined) {
    return undefined;
  }

  if ("url" in request && request.url !== undefined) {
    return request as EndpointConfig;
  }

  return request as EndpointConfig;
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

function shouldDefaultQuery(method: string): boolean {
  return queryMethods.has(method);
}

function shouldDefaultBody(method: string): boolean {
  return bodyMethods.has(method);
}

function mergeQuery(
  url: URL,
  query: URLSearchParams | Record<string, unknown> | undefined,
): void {
  if (query === undefined) {
    return;
  }

  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) {
      url.searchParams.set(key, value);
    }
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

function mergePlainObjectQuery(url: URL, input: unknown): void {
  if (!isPlainObject(input)) {
    return;
  }

  mergeQuery(url, input);
}

function mergeHeaders(
  headers: Headers,
  overrides: HeadersInput | undefined,
): void {
  if (overrides === undefined) {
    return;
  }

  const overrideHeaders = new Headers(
    overrides as ConstructorParameters<typeof Headers>[0],
  );
  for (const [key, value] of overrideHeaders) {
    headers.set(key, value);
  }
}

function encodeBody(
  body: RequestBody | JsonValue | unknown,
  headers: Headers,
): RequestBody {
  if (isBodyInit(body)) {
    return body;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

function isBodyInit(value: unknown): value is RequestBody {
  return (
    typeof value === "string" ||
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function mergePassthroughInit(
  endpointConfig: EndpointConfig,
  requestConfig: EndpointConfig | undefined,
): Omit<RequestInit, "body" | "headers" | "method" | "signal"> {
  const init: Record<string, unknown> = {};

  for (const config of [endpointConfig, requestConfig]) {
    if (config === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(config)) {
      if (
        key === "url" ||
        key === "method" ||
        key === "headers" ||
        key === "query" ||
        key === "body" ||
        key === "signal" ||
        value === undefined
      ) {
        continue;
      }

      init[key] = value;
    }
  }

  return init;
}
