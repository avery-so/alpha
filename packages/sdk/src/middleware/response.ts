import { AlphaPaymentResponseError } from "./errors.js";

export interface AlphaBufferedResponse {
  body: Uint8Array;
  headers: Headers;
  status: number;
  statusText: string;
}

export async function bufferWebResponse(
  response: Response,
  maxResponseBytes: number,
): Promise<AlphaBufferedResponse> {
  if (!(response instanceof Response)) {
    throw new AlphaPaymentResponseError("Alpha payment handlers must return a Web Response.");
  }

  if (response.bodyUsed) {
    throw new AlphaPaymentResponseError(
      "Alpha payment handler response body has already been consumed.",
    );
  }

  rejectStreamingResponse(response);

  const contentLength = response.headers.get("content-length");

  if (contentLength !== null && exceedsMaximum(contentLength, maxResponseBytes)) {
    throw responseTooLarge(maxResponseBytes);
  }

  const body = await readBody(response.body, maxResponseBytes);
  const headers = new Headers(response.headers);
  headers.delete("transfer-encoding");

  if (headers.has("content-length")) {
    headers.set("content-length", body.byteLength.toString());
  }

  return {
    body,
    headers,
    status: response.status,
    statusText: response.statusText,
  };
}

export function bufferedResponseToWeb(response: AlphaBufferedResponse): Response {
  return new Response(response.body.byteLength === 0 ? null : response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function rejectStreamingResponse(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const transferEncoding = response.headers.get("transfer-encoding");
  const buffering = response.headers.get("x-accel-buffering")?.toLowerCase();

  if (
    contentType.startsWith("text/event-stream") ||
    transferEncoding !== null ||
    buffering === "no"
  ) {
    throw new AlphaPaymentResponseError(
      "Streaming responses are not supported by Alpha payment handlers.",
    );
  }
}

function exceedsMaximum(contentLength: string, maximum: number): boolean {
  if (!/^\d+$/u.test(contentLength)) {
    return false;
  }

  return BigInt(contentLength) > BigInt(maximum);
}

async function readBody(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
): Promise<Uint8Array> {
  if (body === null) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      length += result.value.byteLength;

      if (length > maximum) {
        await reader.cancel();
        throw responseTooLarge(maximum);
      }

      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function responseTooLarge(maximum: number): AlphaPaymentResponseError {
  return new AlphaPaymentResponseError("Alpha payment handler response exceeded the size limit.", {
    maxResponseBytes: maximum,
  });
}
