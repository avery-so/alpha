import { describe, expect, it, vi } from "vitest";

import { AlphaClient, AlphaError } from "../src/index.js";

describe("AlphaClient", () => {
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

  it("throws AlphaError when the status request fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const client = new AlphaClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await expect(client.getStatus()).rejects.toMatchObject({
      name: "AlphaError",
      status: 503,
    } satisfies Partial<AlphaError>);
  });
});
