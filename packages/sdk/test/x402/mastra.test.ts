import { describe, expect, it, vi } from "vitest";

import { X402Client, X402PaymentError, x402MastraTool } from "../../src/x402/index.js";
import type { EndpointResult, X402MastraToolExecutionContext } from "../../src/x402/index.js";
import { network, privateKey, readRequestBody } from "./fixtures.js";

const inputSchema = {
  type: "object",
  properties: {
    city: {
      type: "string",
    },
  },
  required: ["city"],
  additionalProperties: false,
} as const;

const outputSchema = {
  type: "object",
  properties: {
    ok: {
      type: "boolean",
    },
  },
  required: ["ok"],
  additionalProperties: false,
} as const;

describe("x402MastraTool", () => {
  it("returns a Mastra-compatible tool object", () => {
    const client = new X402Client(privateKey, {
      network,
      fetch: vi.fn<typeof fetch>(),
    });
    const transform = {
      display: {
        output: vi.fn(),
      },
    };
    const toModelOutput = vi.fn();
    const tool = x402MastraTool({
      id: "paid-weather",
      client,
      endpoint: "https://example.test/weather",
      description: "Fetch paid weather",
      inputSchema,
      outputSchema,
      requireApproval: true,
      strict: true,
      providerOptions: {
        openai: {
          strict: true,
        },
      },
      toModelOutput,
      transform,
      inputExamples: [
        {
          input: {
            city: "Lisbon",
          },
        },
      ],
      mcp: {
        annotations: {
          title: "Paid weather",
          readOnlyHint: true,
        },
      },
      mcpMetadata: {
        serverName: "avery-test",
      },
    });

    const marker = Symbol.for("mastra.core.tool.Tool");

    expect(tool.id).toBe("paid-weather");
    expect(tool.description).toBe("Fetch paid weather");
    expect(tool.inputSchema).toBe(inputSchema);
    expect(tool.outputSchema).toBe(outputSchema);
    expect(tool.requireApproval).toBe(true);
    expect(tool.strict).toBe(true);
    expect(tool.providerOptions).toEqual({
      openai: {
        strict: true,
      },
    });
    expect(tool.toModelOutput).toBe(toModelOutput);
    expect(tool.transform).toBe(transform);
    expect(tool.inputExamples).toEqual([
      {
        input: {
          city: "Lisbon",
        },
      },
    ]);
    expect(tool.mcp).toEqual({
      annotations: {
        title: "Paid weather",
        readOnlyHint: true,
      },
    });
    expect(tool.mcpMetadata).toEqual({
      serverName: "avery-test",
    });
    expect(marker in tool).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(tool, marker)).toBe(false);
  });

  it("returns the endpoint result by default", async () => {
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
    const tool = x402MastraTool<{ city: string }>({
      id: "paid-weather",
      client,
      endpoint: "https://example.test/weather",
      description: "Fetch paid weather",
      inputSchema,
    });

    await expect(
      tool.execute({
        city: "San Francisco",
      }),
    ).resolves.toMatchObject({
      kind: "passthrough",
      body: {
        temperature: 72,
      },
    });
  });

  it("passes endpoint result, input, and Mastra context to execute", async () => {
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
    const execute = vi.fn(
      (
        context: {
          endpoint: EndpointResult;
          input: {
            city: string;
          };
        },
        options: X402MastraToolExecutionContext,
      ) => ({
        ok: context.endpoint.ok,
        city: context.input.city,
        toolCallId: options.toolCallId,
        requestContext: options.requestContext,
      }),
    );
    const requestContext = {
      userId: "user-1",
    };
    const tool = x402MastraTool<
      {
        city: string;
      },
      {
        ok: boolean;
        city: string;
        toolCallId: string | undefined;
        requestContext: unknown;
      }
    >({
      id: "paid-weather",
      client,
      endpoint: "https://example.test/weather",
      description: "Fetch paid weather",
      inputSchema,
      execute,
    });

    await expect(
      tool.execute(
        {
          city: "San Francisco",
        },
        {
          toolCallId: "call-1",
          requestContext,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      city: "San Francisco",
      toolCallId: "call-1",
      requestContext,
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
      {
        toolCallId: "call-1",
        requestContext,
      },
    );
  });

  it("uses request overrides and forwards abort signals", async () => {
    const controller = new AbortController();
    const requests: Request[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = new Request(input);
      requests.push(request.clone());

      return Response.json({
        url: request.url,
        body: await readRequestBody(request),
      });
    });
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });
    const tool = x402MastraTool<
      {
        id: string;
      },
      unknown
    >({
      id: "paid-item",
      client,
      endpoint: "https://example.test/default",
      description: "Fetch a paid item",
      inputSchema: {
        type: "object",
      },
      request: (input) => ({
        url: "https://example.test/items",
        method: "POST",
        query: {
          id: input.id,
        },
        body: {
          explicit: true,
        },
      }),
    });

    await expect(
      tool.execute(
        {
          id: "42",
        },
        {
          abortSignal: controller.signal,
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

    const request = requests[0];
    expect(request).toBeDefined();
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(request?.signal.aborted).toBe(false);
    controller.abort();
    expect(request?.signal.aborted).toBe(true);
  });

  it("throws X402PaymentError when throwOnError is enabled", async () => {
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
    const tool = x402MastraTool<Record<string, never>>({
      id: "paid-weather",
      client,
      endpoint: "https://example.test/fail",
      description: "Fetch paid weather",
      inputSchema: {
        type: "object",
      },
      throwOnError: true,
    });

    await expect(tool.execute({})).rejects.toBeInstanceOf(X402PaymentError);
  });
});
