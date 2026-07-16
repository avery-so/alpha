import { Readable } from "node:stream";

import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

import { bufferWebResponse, bufferedResponseToWeb } from "./response.js";

const maximumFrameworkResponseBytes = Number.MAX_SAFE_INTEGER;

export async function normalizeFrameworkResponse(response: Response): Promise<Response> {
  return bufferedResponseToWeb(await bufferWebResponse(response, maximumFrameworkResponseBytes));
}

export function expressRequestToWeb(request: ExpressRequest): Request {
  const host = request.get("host") ?? "localhost";
  const url = `${request.protocol}://${host}${request.originalUrl || request.url}`;
  const headers = expressHeadersToWeb(request);
  const method = request.method.toUpperCase();
  const controller = new AbortController();

  if (request.aborted) {
    controller.abort();
  } else {
    request.once("aborted", () => controller.abort());
  }

  const body = method === "GET" || method === "HEAD" ? undefined : expressBody(request, headers);
  const init: RequestInit & { duplex?: "half" } = {
    ...(body === undefined ? {} : { body }),
    headers,
    method,
    signal: controller.signal,
  };

  if (body instanceof ReadableStream) {
    init.duplex = "half";
  }

  return new Request(url, init);
}

export async function writeExpressWebResponse(
  request: ExpressRequest,
  response: ExpressResponse,
  webResponse: Response,
): Promise<void> {
  const buffered = await bufferWebResponse(webResponse, maximumFrameworkResponseBytes);

  response.status(buffered.status);

  if (buffered.statusText.length > 0) {
    response.statusMessage = buffered.statusText;
  }

  setExpressHeaders(response, buffered.headers);

  if (request.method.toUpperCase() === "HEAD" || buffered.body.byteLength === 0) {
    response.end();
    return;
  }

  response.end(Buffer.from(buffered.body));
}

function expressHeadersToWeb(request: ExpressRequest): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function expressBody(
  request: ExpressRequest,
  headers: Headers,
): NonNullable<RequestInit["body"]> | undefined {
  const body: unknown = request.body;

  if (body === undefined) {
    if (!request.readableEnded && request.readable) {
      return Readable.toWeb(request) as ReadableStream<Uint8Array>;
    }

    return undefined;
  }

  if (typeof body === "string" || body instanceof URLSearchParams || body instanceof Blob) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return new Uint8Array(body);
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

function setExpressHeaders(response: ExpressResponse, headers: Headers): void {
  const setCookies = headers.getSetCookie();

  for (const [name, value] of headers) {
    if (name.toLowerCase() !== "set-cookie") {
      response.setHeader(name, value);
    }
  }

  if (setCookies.length > 0) {
    response.setHeader("set-cookie", setCookies);
  }
}
