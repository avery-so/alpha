import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";
import { describe, expect, it, vi } from "vitest";

import {
  alphaExpressMiddleware,
  getAlphaPaymentContext,
  withAlphaExpress,
} from "../../src/express.js";
import {
  createAlipayInboundRuntime,
  createX402InboundRuntime,
  createX402OutboundRuntime,
} from "./framework-fixtures.js";

describe("alphaExpressMiddleware", () => {
  it("delegates x402 inbound requests to the official Express adapter", async () => {
    const { getSupported, runtime } = createX402InboundRuntime();
    const app = express();
    const handler = vi.fn((_request, response) => response.json({ protected: true }));
    app.use(alphaExpressMiddleware(runtime));
    app.get("/paid", handler);

    await withServer(app, async (origin) => {
      const response = await fetch(`${origin}/paid`);

      expect(response.status).toBe(402);
      expect(response.headers.get("payment-required")).toBeTruthy();
      expect(handler).not.toHaveBeenCalled();
    });
    expect(getSupported).toHaveBeenCalledTimes(1);
  });

  it("injects one reusable outbound context on the Express request", async () => {
    const runtime = createX402OutboundRuntime();
    const app = express();
    app.use(alphaExpressMiddleware(runtime));
    app.get("/context", (request, response) => {
      const context = getAlphaPaymentContext(request);
      response.json({
        direction: context.direction,
        hasCall:
          context.provider === "x402" &&
          context.direction === "outbound" &&
          typeof context.client.call === "function",
        provider: context.provider,
      });
    });

    await withServer(app, async (origin) => {
      await expect(fetch(`${origin}/context`).then((response) => response.json())).resolves.toEqual(
        {
          direction: "outbound",
          hasCall: true,
          provider: "x402",
        },
      );
    });
  });

  it("rejects direct Alipay middleware and missing request context", () => {
    expect(() => alphaExpressMiddleware(createAlipayInboundRuntime())).toThrow(
      "require withAlphaExpress",
    );
    expect(() => getAlphaPaymentContext({} as never)).toThrow("context is unavailable");
  });
});

describe("withAlphaExpress", () => {
  it("converts parsed Express requests and complete Web responses", async () => {
    const runtime = createX402OutboundRuntime();
    const app = express();
    app.use(express.json());
    app.post(
      "/wrapped",
      withAlphaExpress(runtime, async (request, context) =>
        Response.json(
          { body: await request.json(), provider: context.provider },
          { headers: { "x-alpha": "ready" }, status: 201 },
        ),
      ),
    );

    await withServer(app, async (origin) => {
      const response = await fetch(`${origin}/wrapped`, {
        body: JSON.stringify({ value: 42 }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("x-alpha")).toBe("ready");
      await expect(response.json()).resolves.toEqual({
        body: { value: 42 },
        provider: "x402",
      });
    });
  });

  it("keeps an Alipay resource handler behind the 402 challenge", async () => {
    const runtime = createAlipayInboundRuntime();
    const app = express();
    const handler = vi.fn(async () => Response.json({ protected: true }));
    app.get("/paid", withAlphaExpress(runtime, handler));

    await withServer(app, async (origin) => {
      const response = await fetch(`${origin}/paid`);

      expect(response.status).toBe(402);
      expect(response.headers.get("payment-needed")).toBeTruthy();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it("uses the official x402 wrapper before invoking the Web handler", async () => {
    const { runtime } = createX402InboundRuntime();
    const app = express();
    const handler = vi.fn(async () => Response.json({ protected: true }));
    app.get("/paid", withAlphaExpress(runtime, handler));

    await withServer(app, async (origin) => {
      const response = await fetch(`${origin}/paid`);
      expect(response.status).toBe(402);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it("rejects invalid handlers at wrapper creation", () => {
    expect(() => withAlphaExpress(createX402OutboundRuntime(), null as never)).toThrow(
      "requires a handler",
    );
  });
});

async function withServer(
  app: ReturnType<typeof express>,
  callback: (origin: string) => Promise<void>,
): Promise<void> {
  const server = await listen(app);
  const address = server.address() as AddressInfo;

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await close(server);
  }
}

function listen(app: ReturnType<typeof express>): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
