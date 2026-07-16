import { generateKeyPairSync } from "node:crypto";

import { x402ResourceServer as X402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { describe, expect, it, vi } from "vitest";

import {
  AlphaPaymentConfigError,
  AlipayAIPayClient,
  WeiXinAIPayClient,
  X402Client,
  createAlphaPayment,
} from "../../src/index.js";
import { getAlphaRuntimeState } from "../../src/middleware/runtime.js";
import type { Logger } from "../../src/index.js";
import { network, privateKey } from "../x402/fixtures.js";

const { privateKey: alipayPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const weiXinPrivateKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const x402Route = {
  "GET /paid": {
    accepts: {
      network,
      payTo: "0x1111111111111111111111111111111111111111",
      price: "$0.01",
      scheme: "exact",
    },
  },
} as const;

function facilitator(): FacilitatorClient {
  return {
    getSupported: vi.fn(async () => ({
      extensions: [],
      kinds: [{ network, scheme: "exact", x402Version: 2 }],
      signers: {},
    })),
    settle: vi.fn(),
    verify: vi.fn(),
  } as unknown as FacilitatorClient;
}

function resourceServer(client = facilitator()): X402ResourceServer {
  return new X402ResourceServer(client).register(network, new ExactEvmScheme());
}

function logger(): Logger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe("createAlphaPayment", () => {
  it("creates all supported provider and direction combinations", () => {
    const alipay = new AlipayAIPayClient({
      appId: "app-id",
      logLevel: "silent",
      privateKey: alipayPrivateKey,
    });
    const weixin = new WeiXinAIPayClient({
      developerId: "developer-id",
      logLevel: "silent",
      privateKey: weiXinPrivateKey,
      publicKeyId: "public-key-id",
    });

    expect(
      createAlphaPayment({
        direction: "inbound",
        provider: "x402",
        routes: x402Route,
        server: resourceServer(),
      }),
    ).toMatchObject({ direction: "inbound", provider: "x402" });
    expect(
      createAlphaPayment({ direction: "outbound", network, privateKey, provider: "x402" }),
    ).toMatchObject({ direction: "outbound", provider: "x402" });
    expect(
      createAlphaPayment({
        client: alipay,
        direction: "inbound",
        provider: "alipay",
        routes: {
          "GET /paid": {
            bill: {
              amount: "0.01",
              goodsName: "Paid resource",
              outTradeNo: "order-1",
              payBefore: "2026-07-17T00:00:00+08:00",
              resourceId: "resource-1",
              sellerId: "seller-1",
              sellerName: "Seller",
              serviceId: "service-1",
            },
          },
        },
      }),
    ).toMatchObject({ direction: "inbound", provider: "alipay" });
    expect(
      createAlphaPayment({ client: weixin, direction: "outbound", provider: "weixin" }),
    ).toMatchObject({ direction: "outbound", provider: "weixin" });
  });

  it.each([
    { direction: "outbound", provider: "alipay" },
    { direction: "inbound", provider: "weixin" },
  ])("rejects unsupported $provider $direction runtimes", (config) => {
    expect(() => createAlphaPayment(config as never)).toThrow(AlphaPaymentConfigError);
  });

  it("validates JavaScript calls that bypass the public types", () => {
    expect(() => createAlphaPayment(null as never)).toThrow("config must be an object");
    expect(() => createAlphaPayment({ direction: "inbound", provider: "card" } as never)).toThrow(
      "Unsupported Alpha payment provider",
    );
    expect(() => createAlphaPayment({ direction: "sideways", provider: "x402" } as never)).toThrow(
      "Unsupported Alpha payment direction",
    );
    expect(() =>
      createAlphaPayment({
        client: {},
        direction: "inbound",
        network,
        provider: "alipay",
        routes: {},
      } as never),
    ).toThrow("network is only supported");
  });

  it("rejects missing and conflicting x402 inbound server configuration", () => {
    expect(() =>
      createAlphaPayment({ direction: "inbound", provider: "x402", routes: x402Route } as never),
    ).toThrow("facilitator is required");
    expect(() =>
      createAlphaPayment({
        direction: "inbound",
        facilitator: "https://facilitator.example.test",
        provider: "x402",
        routes: x402Route,
      } as never),
    ).toThrow("schemes is required");
    expect(() =>
      createAlphaPayment({
        direction: "inbound",
        facilitator: "https://facilitator.example.test",
        provider: "x402",
        routes: x402Route,
        schemes: "auto",
        server: resourceServer(),
      }),
    ).toThrow("server cannot be combined");
  });

  it("normalizes inbound aliases, enforces allowlists, and registers automatic schemes", () => {
    const runtime = createAlphaPayment({
      direction: "inbound",
      facilitator: "https://facilitator.example.test",
      network: "base-sepolia",
      provider: "x402",
      routes: {
        "GET /paid": {
          accepts: {
            network: "Base Sepolia",
            payTo: "0x1111111111111111111111111111111111111111",
            price: "$0.01",
            scheme: "exact",
          },
        },
      },
      schemes: "auto",
    });
    const state = getAlphaRuntimeState(runtime);

    expect(state.provider).toBe("x402");

    if (state.provider !== "x402" || state.direction !== "inbound") {
      throw new Error("Expected x402 inbound state.");
    }

    expect(state.httpServer.routes).toMatchObject({
      "GET /paid": { accepts: { network } },
    });
    expect(state.httpServer.server.hasRegisteredScheme(network, "exact")).toBe(true);

    expect(() =>
      createAlphaPayment({
        direction: "inbound",
        facilitator: "https://facilitator.example.test",
        network: "eip155:8453",
        provider: "x402",
        routes: x402Route,
        schemes: "auto",
      }),
    ).toThrow("not included in the network allowlist");
  });

  it("supports explicit scheme registrations and rejects implicit facilitator defaults", () => {
    const runtime = createAlphaPayment({
      direction: "inbound",
      facilitator: { url: "https://facilitator.example.test" },
      provider: "x402",
      routes: x402Route,
      schemes: [{ network: "base-sepolia", server: new ExactEvmScheme() }],
    });
    const state = getAlphaRuntimeState(runtime);

    expect(state.provider).toBe("x402");
    expect(() =>
      createAlphaPayment({
        direction: "inbound",
        facilitator: {} as never,
        provider: "x402",
        routes: x402Route,
        schemes: "auto",
      }),
    ).toThrow("explicit URL");
  });

  it("creates a reusable outbound x402 client without changing global fetch", () => {
    const originalFetch = globalThis.fetch;
    const runtime = createAlphaPayment({
      direction: "outbound",
      network: "Base Sepolia",
      privateKey,
      provider: "x402",
    });
    const state = getAlphaRuntimeState(runtime);

    if (state.provider !== "x402" || state.direction !== "outbound") {
      throw new Error("Expected x402 outbound state.");
    }

    expect(state.context.client).toBeInstanceOf(X402Client);
    expect(state.context.client.network).toBe(network);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("validates outbound x402 client credentials and network consistency", () => {
    const client = new X402Client(privateKey, { network });

    expect(() =>
      createAlphaPayment({ direction: "outbound", network, provider: "x402" } as never),
    ).toThrow("privateKey is required");
    expect(() =>
      createAlphaPayment({
        client,
        direction: "outbound",
        network: "eip155:8453",
        provider: "x402",
      }),
    ).toThrow("client network does not match");
  });

  it("validates Alipay and WeiXin client credentials at creation time", () => {
    expect(() =>
      createAlphaPayment({
        client: { appId: "", privateKey: alipayPrivateKey },
        direction: "inbound",
        provider: "alipay",
        routes: { "GET /paid": { bill: {} as never } },
      }),
    ).toThrow("Invalid Alipay inbound client configuration");
    expect(() =>
      createAlphaPayment({
        client: { developerId: "", privateKey: weiXinPrivateKey, publicKeyId: "key" },
        direction: "outbound",
        provider: "weixin",
      }),
    ).toThrow("Invalid WeiXin outbound client configuration");
  });
});

describe("AlphaPaymentRuntime.initialize", () => {
  it("returns one cached promise and initializes the x402 server once", async () => {
    const client = facilitator();
    const runtime = createAlphaPayment({
      direction: "inbound",
      provider: "x402",
      routes: x402Route,
      server: resourceServer(client),
    });
    const first = runtime.initialize();
    const second = runtime.initialize();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(client.getSupported).toHaveBeenCalledTimes(1);
  });

  it("warns only once when an Alipay replay store is not configured", async () => {
    const sink = logger();
    const runtime = createAlphaPayment({
      client: { appId: "app-id", privateKey: alipayPrivateKey },
      direction: "inbound",
      logger: sink,
      provider: "alipay",
      routes: {
        "GET /paid": {
          bill: {
            amount: "0.01",
            goodsName: "Paid resource",
            outTradeNo: "order-1",
            payBefore: "2026-07-17T00:00:00+08:00",
            resourceId: "resource-1",
            sellerId: "seller-1",
            sellerName: "Seller",
            serviceId: "service-1",
          },
        },
      },
    });

    await runtime.initialize();
    await runtime.initialize();

    expect(sink.warn).toHaveBeenCalledExactlyOnceWith(
      "Alpha Alipay inbound runtime has no replay store configured.",
      { direction: "inbound", provider: "alipay" },
    );
  });
});
