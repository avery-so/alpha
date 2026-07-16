import { describe, expect, it } from "vitest";

import { bufferWebResponse, bufferedResponseToWeb } from "../../src/middleware/response.js";

describe("bufferWebResponse", () => {
  it("buffers finite response bodies and preserves response metadata", async () => {
    const buffered = await bufferWebResponse(
      new Response("hello", {
        headers: { "content-length": "5", "x-test": "yes" },
        status: 201,
        statusText: "Created",
      }),
      5,
    );

    expect(buffered.status).toBe(201);
    expect(buffered.statusText).toBe("Created");
    expect(buffered.headers.get("content-length")).toBe("5");
    expect(buffered.headers.get("x-test")).toBe("yes");
    await expect(bufferedResponseToWeb(buffered).text()).resolves.toBe("hello");
  });

  it("supports empty bodies", async () => {
    const buffered = await bufferWebResponse(new Response(null, { status: 204 }), 1);

    expect(buffered.body).toHaveLength(0);
    expect(bufferedResponseToWeb(buffered).status).toBe(204);
  });

  it("rejects declared, streamed, and already consumed oversized bodies", async () => {
    await expect(
      bufferWebResponse(new Response("hello", { headers: { "content-length": "10" } }), 5),
    ).rejects.toThrow("exceeded the size limit");

    const streamed = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("123"));
          controller.enqueue(new TextEncoder().encode("456"));
          controller.close();
        },
      }),
    );
    await expect(bufferWebResponse(streamed, 5)).rejects.toThrow("exceeded the size limit");

    const consumed = new Response("hello");
    await consumed.text();
    await expect(bufferWebResponse(consumed, 10)).rejects.toThrow("already been consumed");
  });

  it.each([
    { "content-type": "text/event-stream" },
    { "transfer-encoding": "chunked" },
    { "x-accel-buffering": "no" },
  ])("rejects explicit streaming response markers", async (headers) => {
    await expect(bufferWebResponse(new Response("event", { headers }), 100)).rejects.toThrow(
      "Streaming responses are not supported",
    );
  });

  it("rejects non-Response values", async () => {
    await expect(bufferWebResponse({} as Response, 10)).rejects.toThrow(
      "must return a Web Response",
    );
  });
});
