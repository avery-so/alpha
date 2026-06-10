import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlphaClient,
  AlphaError,
  AveryClient,
  AveryError,
} from "../src/index.js";

describe("AveryClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests the default Avery status endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ok: true },
        {
          status: 200,
        },
      ),
    );
    const client = new AveryClient({
      fetch: fetchMock,
    });

    await expect(client.getStatus()).resolves.toEqual({
      ok: true,
      service: "avery",
    });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://api.avery.so/avery/status");
  });

  it("requests the status endpoint with auth headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ok: true },
        {
          status: 200,
        },
      ),
    );
    const client = new AveryClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/api",
      fetch: fetchMock,
    });

    await expect(client.getStatus()).resolves.toEqual({
      ok: true,
      service: "avery",
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url, init] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://example.test/api/status");
    expect(init?.method).toBe("GET");

    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBe("Bearer test-key");
  });

  it("throws TypeError when no fetch implementation is available", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => new AveryClient()).toThrow(TypeError);
    expect(() => new AveryClient()).toThrow(
      "A fetch implementation is required.",
    );
  });

  it("omits the authorization header when no API key is provided", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ok: true },
        {
          status: 200,
        },
      ),
    );
    const client = new AveryClient({
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
      Response.json(
        { ok: true },
        {
          status: 200,
        },
      ),
    );
    const client = new AveryClient({
      baseUrl: "https://example.test/nested/api/",
      fetch: fetchMock,
    });

    await client.getStatus();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://example.test/nested/api/status");
  });

  it("throws AveryError when the status request fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const client = new AveryClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    let thrown: unknown;

    try {
      await client.getStatus();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AveryError);
    expect(thrown).toMatchObject({
      name: "AveryError",
      status: 503,
    } satisfies Partial<AveryError>);
  });
});

describe("AlphaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the legacy Alpha status behavior", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ok: true },
        {
          status: 200,
        },
      ),
    );
    const client = new AlphaClient({
      fetch: fetchMock,
    });

    await expect(client.getStatus()).resolves.toEqual({
      ok: true,
      service: "alpha",
    });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url] = call as Parameters<typeof fetch>;
    expect(String(url)).toBe("https://api.avery.so/alpha/status");
  });

  it("throws AlphaError when the legacy status request fails", async () => {
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
