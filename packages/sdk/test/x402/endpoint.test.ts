import { describe, expect, it } from "vitest";

import { prepareEndpointRequest } from "../../src/x402/endpoint.js";
import { toEndpointResult } from "../../src/x402/result.js";
import type { EndpointConfig } from "../../src/x402/types.js";

describe("prepareEndpointRequest", () => {
  it("parses string, URL, and config endpoints", () => {
    expect(prepareEndpointRequest("https://example.test/path").url).toBe(
      "https://example.test/path",
    );
    expect(
      prepareEndpointRequest(new URL("https://example.test/url")).url,
    ).toBe("https://example.test/url");
    expect(
      prepareEndpointRequest({
        url: "https://example.test/config",
        method: "post",
      }).method,
    ).toBe("POST");
  });

  it("maps plain object input to GET query and skips undefined values", () => {
    const prepared = prepareEndpointRequest(
      {
        url: "https://example.test/search?existing=1",
        method: "GET",
      },
      {
        toolInput: {
          q: "coffee",
          page: 2,
          omitted: undefined,
        },
      },
    );

    expect(prepared.url).toBe(
      "https://example.test/search?existing=1&q=coffee&page=2",
    );
    expect(prepared.init.body).toBeUndefined();
  });

  it("maps POST, PUT, and PATCH plain object input to JSON body", async () => {
    for (const method of ["POST", "PUT", "PATCH"] as const) {
      const prepared = prepareEndpointRequest(
        {
          url: "https://example.test/body",
          method,
        },
        {
          toolInput: {
            value: method,
          },
        },
      );

      expect((prepared.init.headers as Headers).get("content-type")).toBe(
        "application/json",
      );
      expect(prepared.init.body).toBe(JSON.stringify({ value: method }));
    }
  });

  it("lets request overrides disable automatic mapping", () => {
    const prepared = prepareEndpointRequest(
      {
        url: "https://example.test/default",
        method: "GET",
      },
      {
        request: {
          method: "POST",
          body: {
            from: "override",
          },
        },
        toolInput: {
          q: "ignored",
        },
      },
    );

    expect(prepared.url).toBe("https://example.test/default");
    expect(prepared.method).toBe("POST");
    expect(prepared.init.body).toBe(JSON.stringify({ from: "override" }));
  });

  it("merges headers and query with later values winning", () => {
    const prepared = prepareEndpointRequest(
      {
        url: "https://example.test/merge",
        headers: {
          accept: "application/json",
          "x-source": "endpoint",
        },
        query: {
          page: 1,
          q: "endpoint",
        },
      },
      {
        request: {
          headers: {
            "x-source": "request",
            "x-extra": "1",
          },
          query: {
            q: "request",
          },
        },
      },
    );

    expect(prepared.url).toBe("https://example.test/merge?page=1&q=request");
    expect(Object.fromEntries(prepared.init.headers as Headers)).toMatchObject({
      accept: "application/json",
      "x-extra": "1",
      "x-source": "request",
    });
  });

  it("preserves explicit content-type for JSON bodies", () => {
    const prepared = prepareEndpointRequest({
      url: "https://example.test/body",
      method: "POST",
      headers: {
        "content-type": "application/vnd.api+json",
      },
      body: {
        ok: true,
      },
    });

    expect((prepared.init.headers as Headers).get("content-type")).toBe(
      "application/vnd.api+json",
    );
    expect(prepared.init.body).toBe(JSON.stringify({ ok: true }));
  });

  it("supports endpoint config returned from request override", () => {
    const returned: EndpointConfig = {
      url: "https://example.test/override",
      method: "DELETE",
      query: new URLSearchParams([["id", "42"]]),
    };

    const prepared = prepareEndpointRequest("https://example.test/original", {
      request: returned,
      toolInput: {
        ignored: true,
      },
    });

    expect(prepared.url).toBe("https://example.test/override?id=42");
    expect(prepared.method).toBe("DELETE");
  });
});

describe("toEndpointResult", () => {
  it("maps success results", () => {
    const result = toEndpointResult({
      kind: "success",
      response: Response.json({ ok: true }, { status: 200 }),
      body: {
        ok: true,
      },
      settleResponse: {
        success: true,
        transaction: "0xabc",
        network: "eip155:84532",
      },
    });

    expect(result).toMatchObject({
      kind: "success",
      paid: true,
      ok: true,
      status: 200,
      paymentResponse: {
        success: true,
      },
    });
  });

  it("maps settle_failed results", () => {
    const result = toEndpointResult({
      kind: "settle_failed",
      response: Response.json({ ok: false }, { status: 402 }),
      body: {
        ok: false,
      },
      settleResponse: {
        success: false,
        transaction: "0xabc",
        network: "eip155:84532",
        errorReason: "failed",
      },
    });

    expect(result).toMatchObject({
      kind: "settle_failed",
      paid: false,
      ok: false,
      status: 402,
      paymentResponse: {
        success: false,
      },
    });
  });

  it("maps payment_required results", () => {
    const result = toEndpointResult({
      kind: "payment_required",
      response: new Response(null, { status: 402 }),
      paymentRequired: {
        x402Version: 2,
        resource: {
          url: "https://example.test",
        },
        accepts: [],
      },
    });

    expect(result).toMatchObject({
      kind: "payment_required",
      paid: false,
      ok: false,
      status: 402,
      body: null,
      paymentResponse: null,
    });
  });

  it("maps error results", () => {
    const result = toEndpointResult({
      kind: "error",
      response: Response.json({ error: "failed" }, { status: 500 }),
      status: 500,
      body: {
        error: "failed",
      },
    });

    expect(result).toMatchObject({
      kind: "error",
      paid: false,
      ok: false,
      status: 500,
      paymentResponse: null,
    });
  });

  it("maps passthrough results", () => {
    const result = toEndpointResult({
      kind: "passthrough",
      response: Response.json({ ok: true }, { status: 200 }),
      body: {
        ok: true,
      },
    });

    expect(result).toMatchObject({
      kind: "passthrough",
      paid: false,
      ok: true,
      status: 200,
      paymentResponse: null,
    });
  });
});
