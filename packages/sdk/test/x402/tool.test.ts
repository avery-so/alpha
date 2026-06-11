import { encodePaymentResponseHeader } from "@x402/core/http";
import type { ToolSet } from "ai";
import { jsonSchema } from "ai";
import { describe, expect, it, vi } from "vitest";

import { X402Client, X402PaymentError, x402tool } from "../../src/x402/index.js";
import { network, privateKey, readRequestBody } from "./fixtures.js";

describe("x402tool", () => {
  it("returns a ToolSet-compatible tool", () => {
    const client = new X402Client(privateKey, {
      network,
      fetch: vi.fn<typeof fetch>(),
    });
    const tools = {
      weather: x402tool({
        client,
        endpoint: "https://example.test/weather",
        description: "Fetch paid weather",
        title: "Paid weather",
        inputSchema: jsonSchema<{
          city: string;
        }>({
          type: "object",
          properties: {
            city: {
              type: "string",
            },
          },
          required: ["city"],
          additionalProperties: false,
        }),
        metadata: {
          source: "x402",
        },
      }),
    } satisfies ToolSet;

    expect(tools.weather.title).toBe("Paid weather");
    expect(tools.weather.metadata).toEqual({
      source: "x402",
    });
  });

  it("passes endpoint result, input, and AI SDK options to execute", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          temperature: 72,
        },
        {
          status: 200,
        },
      ),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const execute = vi.fn().mockReturnValue({
      answer: "sunny",
    });
    const tool = x402tool({
      client,
      endpoint: "https://example.test/weather",
      inputSchema: jsonSchema<{
        city: string;
      }>({
        type: "object",
      }),
      execute,
    });
    const options = {
      toolCallId: "call-1",
      messages: [],
    };

    await expect(
      tool.execute?.(
        {
          city: "San Francisco",
        },
        options,
      ),
    ).resolves.toEqual({
      answer: "sunny",
    });

    expect(execute).toHaveBeenCalledWith(
      {
        endpoint: expect.objectContaining({
          kind: "passthrough",
          body: {
            temperature: 72,
          },
        }),
        input: {
          city: "San Francisco",
        },
      },
      options,
    );
  });

  it("builds Request URL, method, headers, and body from input", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);
      requests.push(request.clone());

      return Response.json({
        body: await readRequestBody(request),
      });
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const tool = x402tool({
      client,
      endpoint: {
        url: "https://example.test/run",
        method: "POST",
        headers: {
          "x-endpoint": "1",
        },
      },
      inputSchema: jsonSchema<{
        prompt: string;
      }>({
        type: "object",
      }),
    });

    await tool.execute?.(
      {
        prompt: "hello",
      },
      {
        toolCallId: "call-1",
        messages: [],
      },
    );

    const request = requests[0];
    expect(request).toBeDefined();
    expect(request?.url).toBe("https://example.test/run");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("x-endpoint")).toBe("1");
    expect(request?.headers.get("content-type")).toBe("application/json");
    await expect(request?.json()).resolves.toEqual({
      prompt: "hello",
    });
  });

  it("uses request override instead of automatic input mapping", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);

      return Response.json({
        url: request.url,
        body: await readRequestBody(request),
      });
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const tool = x402tool({
      client,
      endpoint: "https://example.test/default",
      request: (input: { id: string }) => ({
        url: "https://example.test/items",
        method: "POST",
        query: {
          id: input.id,
        },
        body: {
          explicit: true,
        },
      }),
      inputSchema: jsonSchema<{
        id: string;
      }>({
        type: "object",
      }),
    });

    await expect(
      tool.execute?.(
        {
          id: "42",
        },
        {
          toolCallId: "call-1",
          messages: [],
        },
      ),
    ).resolves.toMatchObject({
      body: {
        url: "https://example.test/items?id=42",
        body: {
          explicit: true,
        },
      },
    });
  });

  it("resolves function endpoints from input", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);

      return Response.json({
        url: request.url,
      });
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const tool = x402tool({
      client,
      endpoint: (input: { id: string; expand: string }) => ({
        url: `https://example.test/items/${input.id}`,
        method: "GET",
      }),
      inputSchema: jsonSchema<{
        id: string;
        expand: string;
      }>({
        type: "object",
      }),
      execute: async ({ endpoint }) => endpoint.body,
    });

    await expect(
      tool.execute?.(
        {
          id: "42",
          expand: "details",
        },
        {
          toolCallId: "call-1",
          messages: [],
        },
      ),
    ).resolves.toEqual({
      url: "https://example.test/items/42?id=42&expand=details",
    });
  });

  it("returns 500 results by default and throws when configured", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: "failed",
        },
        {
          status: 500,
        },
      ),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const defaultTool = x402tool({
      client,
      endpoint: "https://example.test/fail",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
      }),
    });
    const throwingTool = x402tool({
      client,
      endpoint: "https://example.test/fail",
      throwOnError: true,
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
      }),
    });

    await expect(
      defaultTool.execute?.(
        {},
        {
          toolCallId: "call-1",
          messages: [],
        },
      ),
    ).resolves.toMatchObject({
      kind: "error",
      status: 500,
    });
    await expect(
      throwingTool.execute?.(
        {},
        {
          toolCallId: "call-1",
          messages: [],
        },
      ),
    ).rejects.toBeInstanceOf(X402PaymentError);
  });

  it("passes abort signals to fetch", async () => {
    const controller = new AbortController();
    const capturedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);
      capturedSignals.push(request.signal);

      return Response.json({
        ok: true,
      });
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const tool = x402tool({
      client,
      endpoint: "https://example.test/abort",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
      }),
    });

    await tool.execute?.(
      {},
      {
        toolCallId: "call-1",
        messages: [],
        abortSignal: controller.signal,
      },
    );

    const signal = capturedSignals[0];
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it("uses tool-level maxAmount override", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);

      if (!request.headers.has("PAYMENT-SIGNATURE")) {
        const { encodePaymentRequiredHeader } = await import("@x402/core/http");
        const { paymentRequired, paymentRequirement } = await import("./fixtures.js");

        return new Response(null, {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
              paymentRequired([
                paymentRequirement({
                  amount: "200000",
                }),
              ]),
            ),
          },
        });
      }

      return Response.json(
        {
          ok: true,
        },
        {
          headers: {
            "PAYMENT-RESPONSE": encodePaymentResponseHeader({
              success: true,
              transaction: "0xtool",
              network,
            }),
          },
        },
      );
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
      maxAmount: 1000n,
    });
    const tool = x402tool({
      client,
      endpoint: "https://example.test/paid",
      maxAmount: 200_000n,
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
      }),
    });

    await expect(
      tool.execute?.(
        {},
        {
          toolCallId: "call-1",
          messages: [],
        },
      ),
    ).resolves.toMatchObject({
      kind: "success",
      paid: true,
      paymentResponse: {
        transaction: "0xtool",
      },
    });
  });
});
