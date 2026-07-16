import { generateKeyPairSync } from "node:crypto";

import { base64 } from "@scure/base";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlipayAIPayClient, createAlphaPayment } from "../../src/index.js";
import { getAlphaRuntimeState, handleRuntimeAlipayRequest } from "../../src/middleware/runtime.js";
import type { AlipayAIPayPaymentVerifyResult, AlphaReplayStore, Logger } from "../../src/index.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const textEncoder = new TextEncoder();

const bill = {
  amount: "0.01",
  goodsName: "Paid resource",
  outTradeNo: "order-1",
  payBefore: "2026-07-17T00:00:00+08:00",
  resourceId: "resource-1",
  sellerId: "seller-1",
  sellerName: "Seller",
  serviceId: "service-1",
};

const verification: AlipayAIPayPaymentVerifyResult = {
  active: true,
  amount: bill.amount,
  mismatches: [],
  outTradeNo: bill.outTradeNo,
  rawResponse: {
    active: true,
    amount: bill.amount,
    code: "10000",
    out_trade_no: bill.outTradeNo,
    resource_id: bill.resourceId,
    trade_no: "trade-1",
  },
  resourceId: bill.resourceId,
  tradeNo: "trade-1",
  verified: true,
};

function proofHeader(overrides: Record<string, unknown> = {}): string {
  return base64.encode(
    textEncoder.encode(
      JSON.stringify({
        protocol: {
          payment_proof: "proof-1",
          trade_no: verification.tradeNo,
          ...overrides,
        },
      }),
    ),
  );
}

function logger(): Logger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function replayStore(claim: "claimed" | "in_progress" | "completed" = "claimed") {
  return {
    abandon: vi.fn(async () => undefined),
    claim: vi.fn(async () => claim),
    complete: vi.fn(async () => undefined),
  } satisfies AlphaReplayStore;
}

function createHarness(options: {
  maxResponseBytes?: number;
  replay?: ReturnType<typeof replayStore>;
  route?: string;
}) {
  const sink = logger();
  const client = new AlipayAIPayClient({
    appId: "app-id",
    logLevel: "silent",
    privateKey,
  });
  const verifyPayment = vi.spyOn(client, "verifyPayment").mockResolvedValue(verification);
  const confirmFulfillment = vi.spyOn(client, "confirmFulfillment").mockResolvedValue({
    rawResponse: { code: "10000", trade_no: verification.tradeNo },
    tradeNo: verification.tradeNo,
  });
  const runtime = createAlphaPayment({
    client,
    direction: "inbound",
    logger: sink,
    logLevel: "debug",
    provider: "alipay",
    replayStore: options.replay,
    routes: {
      [options.route ?? "GET /paid"]: {
        bill,
        maxResponseBytes: options.maxResponseBytes,
      },
    },
  });
  const state = getAlphaRuntimeState(runtime);

  return { client, confirmFulfillment, runtime, sink, state, verifyPayment };
}

function request(path = "/paid", proof: string | null = proofHeader()): Request {
  return new Request(`https://api.example.test${path}`, {
    ...(proof === null ? {} : { headers: { "Payment-Proof": proof } }),
    method: "GET",
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Alipay inbound challenge and verification", () => {
  it("returns a fresh 402 challenge when Payment-Proof is missing", async () => {
    const harness = createHarness({ replay: replayStore() });
    const handler = vi.fn(async () => Response.json({ secret: true }));
    const response = await handleRuntimeAlipayRequest(
      harness.state,
      request("/paid", null),
      handler,
    );

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-needed")).toMatch(/^[\w-]+$/u);
    await expect(response.json()).resolves.toEqual({ error: "payment_required" });
    expect(handler).not.toHaveBeenCalled();
    expect(harness.verifyPayment).not.toHaveBeenCalled();
  });

  it.each(["not-base64", proofHeader({ payment_proof: "" })])(
    "returns 402 without leaking malformed proof details",
    async (proof) => {
      const harness = createHarness({ replay: replayStore() });
      const response = await handleRuntimeAlipayRequest(
        harness.state,
        request("/paid", proof),
        async () => Response.json({ secret: true }),
      );

      expect(response.status).toBe(402);
      expect(await response.text()).toBe('{"error":"payment_required"}');
      expect(harness.verifyPayment).not.toHaveBeenCalled();
    },
  );

  it("checks the current bill expectations and preserves the request signal", async () => {
    const harness = createHarness({ replay: replayStore() });
    const incoming = request();

    await handleRuntimeAlipayRequest(harness.state, incoming, async () =>
      Response.json({ ok: true }),
    );

    expect(harness.verifyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentProof: "proof-1", tradeNo: verification.tradeNo }),
      {
        expect: {
          amount: bill.amount,
          outTradeNo: bill.outTradeNo,
          resourceId: bill.resourceId,
        },
        signal: incoming.signal,
      },
    );
  });

  it("returns 402 for expectation mismatches and gateway failures", async () => {
    const mismatch = createHarness({ replay: replayStore() });
    mismatch.verifyPayment.mockResolvedValue({
      ...verification,
      mismatches: ["amount"],
      verified: false,
    });
    const mismatchHandler = vi.fn(async () => Response.json({ secret: true }));

    const mismatchResponse = await handleRuntimeAlipayRequest(
      mismatch.state,
      request(),
      mismatchHandler,
    );
    expect(mismatchResponse.status).toBe(402);
    expect(mismatchHandler).not.toHaveBeenCalled();

    const gateway = createHarness({ replay: replayStore() });
    gateway.verifyPayment.mockRejectedValue(new Error("raw gateway failure"));
    const response = await handleRuntimeAlipayRequest(gateway.state, request(), async () =>
      Response.json({ secret: true }),
    );

    expect(response.status).toBe(402);
    expect(await response.text()).not.toContain("raw gateway failure");
  });

  it("evaluates dynamic bills with the concrete request route", async () => {
    const harness = createHarness({ replay: replayStore(), route: "GET /reports/*" });
    const state = harness.state;

    if (state.provider !== "alipay") {
      throw new Error("Expected Alipay state.");
    }

    const factory = vi.fn(async () => bill);
    state.routes[0]!.config.bill = factory;
    await handleRuntimeAlipayRequest(state, request("/reports/weekly"), async () =>
      Response.json({ ok: true }),
    );

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "inbound",
        provider: "alipay",
        route: "GET /reports/weekly",
      }),
    );
  });

  it("passes unmatched routes through with a null payment context", async () => {
    const harness = createHarness({ replay: replayStore() });
    const handler = vi.fn(async (context) => Response.json(context));
    const response = await handleRuntimeAlipayRequest(
      harness.state,
      request("/public", null),
      handler,
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({
      direction: "inbound",
      payment: null,
      provider: "alipay",
    });
    expect(harness.verifyPayment).not.toHaveBeenCalled();
  });
});

describe("Alipay inbound replay and fulfillment ordering", () => {
  it("confirms fulfillment and completes the claim before returning the resource", async () => {
    const store = replayStore();
    const harness = createHarness({ replay: store });
    const order: string[] = [];
    harness.confirmFulfillment.mockImplementation(async () => {
      order.push("confirm");
      return {
        rawResponse: { code: "10000", trade_no: verification.tradeNo },
        tradeNo: verification.tradeNo,
      };
    });
    store.complete.mockImplementation(async () => {
      order.push("complete");
    });

    const response = await handleRuntimeAlipayRequest(harness.state, request(), async (context) => {
      order.push("handler");
      expect(context.payment).toEqual({
        active: true,
        amount: bill.amount,
        outTradeNo: bill.outTradeNo,
        resourceId: bill.resourceId,
        tradeNo: verification.tradeNo,
      });
      return new Response("protected", { headers: { "x-resource": "ready" } });
    });

    order.push("returned");
    expect(order).toEqual(["handler", "confirm", "complete", "returned"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-resource")).toBe("ready");
    await expect(response.text()).resolves.toBe("protected");
    expect(store.claim).toHaveBeenCalledWith({
      provider: "alipay",
      route: "GET /paid",
      tradeNo: verification.tradeNo,
    });
    expect(store.abandon).not.toHaveBeenCalled();
  });

  it.each(["in_progress", "completed"] as const)(
    "rejects %s replay claims without running the handler",
    async (claim) => {
      const store = replayStore(claim);
      const harness = createHarness({ replay: store });
      const handler = vi.fn(async () => new Response("protected"));
      const response = await handleRuntimeAlipayRequest(harness.state, request(), handler);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "payment_replay" });
      expect(handler).not.toHaveBeenCalled();
      expect(harness.confirmFulfillment).not.toHaveBeenCalled();
    },
  );

  it("returns 503 when the replay store cannot atomically claim", async () => {
    const store = replayStore();
    store.claim.mockRejectedValue(new Error("database unavailable"));
    const harness = createHarness({ replay: store });
    const handler = vi.fn(async () => new Response("protected"));
    const response = await handleRuntimeAlipayRequest(harness.state, request(), handler);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("abandons the claim when the handler throws or returns an error", async () => {
    const throwingStore = replayStore();
    const throwing = createHarness({ replay: throwingStore });

    await expect(
      handleRuntimeAlipayRequest(throwing.state, request(), async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    expect(throwingStore.abandon).toHaveBeenCalledTimes(1);
    expect(throwing.confirmFulfillment).not.toHaveBeenCalled();

    const errorStore = replayStore();
    const failed = createHarness({ replay: errorStore });
    const response = await handleRuntimeAlipayRequest(failed.state, request(), async () =>
      Response.json({ internal: "not exposed" }, { status: 422 }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "resource_handler_failed" });
    expect(errorStore.abandon).toHaveBeenCalledTimes(1);
    expect(failed.confirmFulfillment).not.toHaveBeenCalled();
  });

  it("abandons oversized and explicitly streaming responses without fulfillment", async () => {
    const oversizedStore = replayStore();
    const oversized = createHarness({ maxResponseBytes: 4, replay: oversizedStore });
    const oversizedResponse = await handleRuntimeAlipayRequest(
      oversized.state,
      request(),
      async () => new Response("12345"),
    );

    expect(oversizedResponse.status).toBe(500);
    expect(oversizedStore.abandon).toHaveBeenCalledTimes(1);
    expect(oversized.confirmFulfillment).not.toHaveBeenCalled();

    const streamStore = replayStore();
    const streaming = createHarness({ replay: streamStore });
    const streamResponse = await handleRuntimeAlipayRequest(
      streaming.state,
      request(),
      async () => new Response("event", { headers: { "content-type": "text/event-stream" } }),
    );

    expect(streamResponse.status).toBe(500);
    expect(streamStore.abandon).toHaveBeenCalledTimes(1);
    expect(streaming.confirmFulfillment).not.toHaveBeenCalled();
  });

  it("keeps the claim when fulfillment enters an uncertain state", async () => {
    const store = replayStore();
    const harness = createHarness({ replay: store });
    harness.confirmFulfillment.mockRejectedValue(new Error("gateway timeout"));
    const response = await handleRuntimeAlipayRequest(
      harness.state,
      request(),
      async () => new Response("protected"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "fulfillment_confirmation_failed" });
    expect(store.abandon).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("withholds the resource when replay completion fails after fulfillment", async () => {
    const store = replayStore();
    store.complete.mockRejectedValue(new Error("completion failed"));
    const harness = createHarness({ replay: store });
    const response = await handleRuntimeAlipayRequest(
      harness.state,
      request(),
      async () => new Response("protected"),
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain("protected");
    expect(harness.confirmFulfillment).toHaveBeenCalledTimes(1);
    expect(store.abandon).not.toHaveBeenCalled();
  });

  it("continues withholding the resource when replay abandon itself fails", async () => {
    const store = replayStore();
    store.abandon.mockRejectedValue(new Error("abandon failed"));
    const harness = createHarness({ replay: store });

    await expect(
      handleRuntimeAlipayRequest(harness.state, request(), async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    expect(harness.sink.error).toHaveBeenCalledWith(
      "Alpha Alipay replay abandon failed.",
      expect.objectContaining({ errorType: "Error", route: "GET /paid", status: 500 }),
    );
  });
});

describe("Alipay inbound route validation", () => {
  it.each([
    [{}, "must not be empty"],
    [{ "/paid": { bill } }, "METHOD /path"],
    [{ "GET paid": { bill } }, "METHOD /path"],
    [{ "GET /paid": { bill, maxResponseBytes: 0 } }, "positive safe integer"],
  ])("rejects invalid route configuration", (routes, message) => {
    const client = new AlipayAIPayClient({ appId: "app-id", privateKey });

    expect(() =>
      createAlphaPayment({
        client,
        direction: "inbound",
        provider: "alipay",
        routes,
      }),
    ).toThrow(message);
  });
});
