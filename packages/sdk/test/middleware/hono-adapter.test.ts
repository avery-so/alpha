import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { alphaHonoMiddleware, getAlphaPaymentContext, withAlphaHono } from "../../src/hono.js";
import {
  createAlipayInboundRuntime,
  createWeiXinOutboundRuntime,
  createX402InboundRuntime,
  createX402OutboundRuntime,
} from "./framework-fixtures.js";

describe("alphaHonoMiddleware", () => {
  it("delegates x402 inbound requests to the official Hono adapter", async () => {
    const { getSupported, runtime } = createX402InboundRuntime();
    const app = new Hono();
    const handler = vi.fn((context) => context.json({ protected: true }));
    app.use(alphaHonoMiddleware(runtime));
    app.get("/paid", handler);

    const response = await app.request("https://api.example.test/paid");

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(getSupported).toHaveBeenCalledTimes(1);
  });

  it("writes outbound context into the Hono context", async () => {
    const app = new Hono();
    app.use(alphaHonoMiddleware(createX402OutboundRuntime()));
    app.get("/context", (context) => {
      const payment = getAlphaPaymentContext(context);
      return context.json({ direction: payment.direction, provider: payment.provider });
    });

    const response = await app.request("https://api.example.test/context");
    await expect(response.json()).resolves.toEqual({ direction: "outbound", provider: "x402" });
  });

  it("rejects direct Alipay middleware and missing context", () => {
    expect(() => alphaHonoMiddleware(createAlipayInboundRuntime())).toThrow(
      "require withAlphaHono",
    );
    expect(() => getAlphaPaymentContext({ get: () => undefined } as never)).toThrow(
      "context is unavailable",
    );
  });
});

describe("withAlphaHono", () => {
  it("returns complete Web responses with outbound context", async () => {
    const app = new Hono();
    app.post(
      "/wrapped",
      withAlphaHono(createX402OutboundRuntime(), async (request, payment) =>
        Response.json(
          { body: await request.json(), provider: payment.provider },
          { headers: { "x-alpha": "ready" }, status: 201 },
        ),
      ),
    );

    const response = await app.request("https://api.example.test/wrapped", {
      body: JSON.stringify({ value: 42 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("x-alpha")).toBe("ready");
    await expect(response.json()).resolves.toEqual({ body: { value: 42 }, provider: "x402" });
  });

  it("exposes the initialized WeiXin client without intercepting fetch", async () => {
    const { fetchMock, runtime } = createWeiXinOutboundRuntime();
    const app = new Hono();
    app.get(
      "/preorder",
      withAlphaHono(runtime, async (request, payment) => {
        if (payment.provider !== "weixin") {
          throw new Error("Expected WeiXin context.");
        }

        const result = await payment.client.preorder(
          { order: "order-1" },
          {
            endpoint: "https://pay.example.test/preorder",
            nonceStr: "0123456789abcdef0123456789abcdef",
            signal: request.signal,
            timestamp: "1735689600",
          },
        );
        return Response.json({ paymentCode: result.paymentCode });
      }),
    );

    const response = await app.request("https://api.example.test/preorder");

    await expect(response.json()).resolves.toEqual({ paymentCode: "weixin-code-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pay.example.test/preorder",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps Alipay and x402 handlers behind their challenges", async () => {
    const alipay = new Hono();
    const alipayHandler = vi.fn(async () => Response.json({ protected: true }));
    alipay.get("/paid", withAlphaHono(createAlipayInboundRuntime(), alipayHandler));

    const alipayResponse = await alipay.request("https://api.example.test/paid");
    expect(alipayResponse.status).toBe(402);
    expect(alipayResponse.headers.get("payment-needed")).toBeTruthy();
    expect(alipayHandler).not.toHaveBeenCalled();

    const x402 = new Hono();
    const x402Handler = vi.fn(async () => Response.json({ protected: true }));
    x402.get("/paid", withAlphaHono(createX402InboundRuntime().runtime, x402Handler));

    const x402Response = await x402.request("https://api.example.test/paid");
    expect(x402Response.status).toBe(402);
    expect(x402Handler).not.toHaveBeenCalled();
  });

  it("rejects invalid handlers at wrapper creation", () => {
    expect(() => withAlphaHono(createX402OutboundRuntime(), null as never)).toThrow(
      "requires a handler",
    );
  });
});
