import { NextRequest } from "next/server.js";
import { describe, expect, it, vi } from "vitest";

import { alphaNextProxy, withAlphaNext } from "../../src/next.js";
import {
  createAlipayInboundRuntime,
  createX402InboundRuntime,
  createX402OutboundRuntime,
} from "./framework-fixtures.js";

describe("withAlphaNext", () => {
  it("uses the official x402 route wrapper before the App Router handler", async () => {
    const { getSupported, runtime } = createX402InboundRuntime();
    const handler = vi.fn(async () => Response.json({ protected: true }));
    const wrapped = withAlphaNext(runtime, handler);
    const response = await wrapped(new NextRequest("https://api.example.test/paid"), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(getSupported).toHaveBeenCalledTimes(1);
  });

  it("injects outbound context without mutating NextRequest and forwards route context", async () => {
    const request = new NextRequest("https://api.example.test/outbound");
    const routeContext = { params: Promise.resolve({ id: "42" }) };
    const handler = vi.fn(async (_request, payment, receivedRouteContext) => {
      const params = await receivedRouteContext.params;
      return Response.json({
        id: params.id,
        provider: payment.provider,
      });
    });
    const wrapped = withAlphaNext(createX402OutboundRuntime(), handler);
    const response = await wrapped(request, routeContext);

    await expect(response.json()).resolves.toEqual({ id: "42", provider: "x402" });
    expect(handler).toHaveBeenCalledWith(request, expect.any(Object), routeContext);
    expect(Object.getOwnPropertySymbols(request)).not.toContain(
      Symbol.for("@averyso/alpha/payment-context"),
    );
  });

  it("keeps the Alipay route handler behind Payment-Needed", async () => {
    const handler = vi.fn(async () => Response.json({ protected: true }));
    const wrapped = withAlphaNext(createAlipayInboundRuntime(), handler);
    const response = await wrapped(new NextRequest("https://api.example.test/paid"), {});

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-needed")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects invalid handlers at wrapper creation", () => {
    expect(() => withAlphaNext(createX402OutboundRuntime(), null as never)).toThrow(
      "requires a handler",
    );
  });
});

describe("alphaNextProxy", () => {
  it("delegates page protection to the official x402 proxy", async () => {
    const { runtime } = createX402InboundRuntime();
    const proxy = alphaNextProxy(runtime);
    const response = await proxy(new NextRequest("https://api.example.test/paid"));

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBeTruthy();
  });

  it("rejects non-x402-inbound runtimes", () => {
    expect(() => alphaNextProxy(createX402OutboundRuntime())).toThrow("only supports x402 inbound");
    expect(() => alphaNextProxy(createAlipayInboundRuntime())).toThrow(
      "only supports x402 inbound",
    );
  });
});
