import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaClient, AlphaError } from "../src/index.js";

describe("AlphaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests the status endpoint with auth headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );
    const client = new AlphaClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/api",
      fetch: fetchMock,
    });

    await expect(client.getStatus()).resolves.toEqual({
      ok: true,
      service: "alpha",
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url, init] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://example.test/status");
    expect(init?.method).toBe("GET");

    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBe("Bearer test-key");
  });

  it("throws TypeError when no fetch implementation is available", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => new AlphaClient()).toThrow(TypeError);
    expect(() => new AlphaClient()).toThrow(
      "A fetch implementation is required.",
    );
  });

  it("omits the authorization header when no API key is provided", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );
    const client = new AlphaClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await client.getStatus();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [, init] = call as Parameters<typeof fetch>;
    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBeNull();
  });

  it("resolves status URLs from custom base URLs with paths", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );
    const client = new AlphaClient({
      baseUrl: "https://example.test/nested/api/",
      fetch: fetchMock,
    });

    await client.getStatus();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://example.test/status");
  });

  it("throws AlphaError when the status request fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const client = new AlphaClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    let thrown: unknown;

    try {
      await client.getStatus();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AlphaError);
    expect(thrown).toMatchObject({
      name: "AlphaError",
      status: 503,
    } satisfies Partial<AlphaError>);
  });
});
