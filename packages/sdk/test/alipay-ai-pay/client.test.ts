import { generateKeyPairSync } from "node:crypto";

import { base64 } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALIPAY_AI_PAY_GATEWAY_ENDPOINT,
  AlipayAIPayClient,
  AlipayAIPayConfigError,
  AlipayAIPayRequestError,
  AlipayAIPayResponseError,
  alipayAIPayBillSignContent,
  signAlipayAIPayRsa2,
  verifyAlipayAIPayRsa2,
} from "../../src/index.js";
import type { AlipayAIPayClientOptions } from "../../src/index.js";

const merchantKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const alipayKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const merchantPrivateKeyPem = merchantKeys.privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();
const alipayPublicKeyPem = alipayKeys.publicKey.export({ format: "pem", type: "spki" }).toString();
const textEncoder = new TextEncoder();

const APP_ID = "2026000123456789";
const VERIFY_RESPONSE_KEY = "alipay_aipay_agent_payment_verify_response";
const CONFIRM_RESPONSE_KEY = "alipay_aipay_agent_fulfillment_confirm_response";

const verifyNode = {
  code: "10000",
  msg: "Success",
  trade_no: "20260324008281172041220000012182",
  amount: "0.01",
  resource_id: "RES_1739836600000_abc123",
  active: true,
  out_trade_no: "ORDER_1739836600000_abc123",
};

const proofInput = {
  tradeNo: verifyNode.trade_no,
  paymentProof: "62922589b11acfc70faf4ebab1da7a9bbc438554e40d0a1dcdc7f35b3085aaaa",
  clientSession: "ImNsaWVudFNlc3N",
};

function envelope(responseKey: string, node: Record<string, unknown>, signed = false): string {
  const nodeJson = JSON.stringify(node);
  const sign = signed ? signAlipayAIPayRsa2(nodeJson, alipayKeys.privateKey) : "unchecked";

  return `{"${responseKey}":${nodeJson},"sign":"${sign}"}`;
}

function createClient(
  overrides: Partial<AlipayAIPayClientOptions> = {},
  body = envelope(VERIFY_RESPONSE_KEY, verifyNode),
  status = 200,
) {
  const fetchMock = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) => new Response(body, { status }),
  );

  const client = new AlipayAIPayClient({
    appId: APP_ID,
    fetch: fetchMock as unknown as typeof fetch,
    logLevel: "silent",
    privateKey: merchantPrivateKeyPem,
    ...overrides,
  });

  return { client, fetchMock };
}

function sentBody(fetchMock: ReturnType<typeof createClient>["fetchMock"]): URLSearchParams {
  const init = fetchMock.mock.calls[0]![1];

  return new URLSearchParams(init?.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AlipayAIPayClient constructor", () => {
  it("rejects missing configuration", () => {
    expect(() => new AlipayAIPayClient({ appId: " ", privateKey: merchantPrivateKeyPem })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(() => new AlipayAIPayClient({ appId: APP_ID, privateKey: "" })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(
      () =>
        new AlipayAIPayClient({
          appAuthToken: " ",
          appId: APP_ID,
          privateKey: merchantPrivateKeyPem,
        }),
    ).toThrow(AlipayAIPayConfigError);
    expect(
      () =>
        new AlipayAIPayClient({
          appId: APP_ID,
          gatewayEndpoint: "",
          privateKey: merchantPrivateKeyPem,
        }),
    ).toThrow(AlipayAIPayConfigError);
  });

  it("requires a fetch implementation", () => {
    vi.stubGlobal("fetch", undefined);

    expect(
      () => new AlipayAIPayClient({ appId: APP_ID, privateKey: merchantPrivateKeyPem }),
    ).toThrow("A fetch implementation is required.");
  });
});

describe("AlipayAIPayClient Payment-Needed helper", () => {
  const billInput = {
    outTradeNo: "ORDER_1739836600000_abc123",
    amount: "0.01",
    resourceId: "RES_1739836600000_abc123",
    payBefore: "2026-03-25T12:00:00+08:00",
    sellerId: "2088123456789012",
    sellerName: "测试商家",
    goodsName: "测试商品",
    serviceId: "service_ai_content_001",
  };

  it("defaults seller_app_id to the client appId and signs with the client key", () => {
    const { client } = createClient();
    const { paymentNeeded } = client.buildPaymentNeededHeader(billInput);

    expect(paymentNeeded.method.seller_app_id).toBe(APP_ID);
    expect(
      verifyAlipayAIPayRsa2(
        alipayAIPayBillSignContent({ ...billInput, sellerAppId: APP_ID }),
        paymentNeeded.protocol.seller_signature,
        merchantKeys.publicKey,
      ),
    ).toBe(true);
  });

  it("honors an explicit sellerAppId", () => {
    const { client } = createClient();

    expect(
      client.buildPaymentNeededHeader({ ...billInput, sellerAppId: "third-party-app" })
        .paymentNeeded.method.seller_app_id,
    ).toBe("third-party-app");
  });

  it("parses Payment-Proof headers", () => {
    const { client } = createClient();
    const header = base64.encode(
      textEncoder.encode(
        JSON.stringify({
          protocol: { payment_proof: proofInput.paymentProof, trade_no: proofInput.tradeNo },
          method: { client_session: proofInput.clientSession },
        }),
      ),
    );

    expect(client.parsePaymentProofHeader(header)).toMatchObject(proofInput);
  });
});

describe("AlipayAIPayClient.verifyPayment", () => {
  it("posts a signed form to the gateway and returns the normalized result", async () => {
    const { client, fetchMock } = createClient();
    const result = await client.verifyPayment(proofInput);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      ALIPAY_AI_PAY_GATEWAY_ENDPOINT,
      expect.objectContaining({
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        method: "POST",
      }),
    );

    const body = sentBody(fetchMock);

    expect(body.get("method")).toBe("alipay.aipay.agent.payment.verify");
    expect(body.get("app_id")).toBe(APP_ID);
    expect(body.get("sign_type")).toBe("RSA2");
    expect(JSON.parse(body.get("biz_content")!)).toEqual({
      client_session: proofInput.clientSession,
      payment_proof: proofInput.paymentProof,
      trade_no: proofInput.tradeNo,
    });
    expect(
      verifyAlipayAIPayRsa2(buildSignContent(body), body.get("sign")!, merchantKeys.publicKey),
    ).toBe(true);

    expect(result).toMatchObject({
      active: true,
      amount: verifyNode.amount,
      mismatches: [],
      outTradeNo: verifyNode.out_trade_no,
      resourceId: verifyNode.resource_id,
      tradeNo: verifyNode.trade_no,
      verified: true,
    });
    expect(result.rawResponse.code).toBe("10000");
  });

  it("omits client_session when not provided", async () => {
    const { client, fetchMock } = createClient();

    await client.verifyPayment({
      paymentProof: proofInput.paymentProof,
      tradeNo: proofInput.tradeNo,
    });

    expect(JSON.parse(sentBody(fetchMock).get("biz_content")!)).toEqual({
      payment_proof: proofInput.paymentProof,
      trade_no: proofInput.tradeNo,
    });
  });

  it("collects expectation mismatches without throwing", async () => {
    const { client } = createClient();
    const result = await client.verifyPayment(proofInput, {
      expect: {
        amount: "0.02",
        outTradeNo: "OTHER_ORDER",
        resourceId: verifyNode.resource_id,
      },
    });

    expect(result.mismatches).toEqual(["amount", "out_trade_no"]);
    expect(result.verified).toBe(false);
  });

  it("marks matching expectations as verified", async () => {
    const { client } = createClient();
    const result = await client.verifyPayment(proofInput, {
      expect: {
        amount: verifyNode.amount,
        outTradeNo: verifyNode.out_trade_no,
        resourceId: verifyNode.resource_id,
      },
    });

    expect(result.mismatches).toEqual([]);
    expect(result.verified).toBe(true);
  });

  it("reports inactive payment proofs as unverified", async () => {
    const { client } = createClient(
      {},
      envelope(VERIFY_RESPONSE_KEY, { ...verifyNode, active: false }),
    );
    const result = await client.verifyPayment(proofInput);

    expect(result.active).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("verifies the gateway response signature when alipayPublicKey is set", async () => {
    const signed = createClient(
      { alipayPublicKey: alipayPublicKeyPem },
      envelope(VERIFY_RESPONSE_KEY, verifyNode, true),
    );

    await expect(signed.client.verifyPayment(proofInput)).resolves.toMatchObject({
      verified: true,
    });

    const unsigned = createClient({ alipayPublicKey: alipayPublicKeyPem });

    await expect(unsigned.client.verifyPayment(proofInput)).rejects.toThrow(
      "signature verification failed",
    );
  });

  it("throws AlipayAIPayResponseError for business failures", async () => {
    const { client } = createClient(
      {},
      envelope(VERIFY_RESPONSE_KEY, {
        code: "40004",
        msg: "Business Failed",
        sub_code: "PAYMENT_PROOF_NOT_FOUND",
        sub_msg: "支付凭证过期或不存在",
      }),
    );

    await expect(client.verifyPayment(proofInput)).rejects.toThrow("PAYMENT_PROOF_NOT_FOUND");
  });

  it("throws when required business fields are missing", async () => {
    const { client } = createClient(
      {},
      envelope(VERIFY_RESPONSE_KEY, { code: "10000", msg: "Success", trade_no: "2026" }),
    );

    await expect(client.verifyPayment(proofInput)).rejects.toThrow(
      "missing required business fields",
    );
  });

  it("rejects blank verification input", async () => {
    const { client } = createClient();

    await expect(client.verifyPayment({ paymentProof: " ", tradeNo: "x" })).rejects.toThrow(
      AlipayAIPayConfigError,
    );
    await expect(client.verifyPayment({ paymentProof: "x", tradeNo: "" })).rejects.toThrow(
      AlipayAIPayConfigError,
    );
  });
});

describe("AlipayAIPayClient.confirmFulfillment", () => {
  it("accepts a plain trade number and returns the confirmation", async () => {
    const { client, fetchMock } = createClient(
      {},
      envelope(CONFIRM_RESPONSE_KEY, {
        code: "10000",
        msg: "Success",
        trade_no: verifyNode.trade_no,
      }),
    );
    const result = await client.confirmFulfillment(verifyNode.trade_no);

    expect(result.tradeNo).toBe(verifyNode.trade_no);

    const body = sentBody(fetchMock);

    expect(body.get("method")).toBe("alipay.aipay.agent.fulfillment.confirm");
    expect(JSON.parse(body.get("biz_content")!)).toEqual({ trade_no: verifyNode.trade_no });
  });

  it("accepts an object input", async () => {
    const { client } = createClient(
      {},
      envelope(CONFIRM_RESPONSE_KEY, { code: "10000", trade_no: verifyNode.trade_no }),
    );

    await expect(
      client.confirmFulfillment({ tradeNo: verifyNode.trade_no }),
    ).resolves.toMatchObject({ tradeNo: verifyNode.trade_no });
  });

  it("throws when the confirmation response is missing trade_no", async () => {
    const { client } = createClient({}, envelope(CONFIRM_RESPONSE_KEY, { code: "10000" }));

    await expect(client.confirmFulfillment(verifyNode.trade_no)).rejects.toThrow(
      "missing trade_no",
    );
  });
});

describe("AlipayAIPayClient request plumbing", () => {
  it("supports per-call gateway endpoint, app_auth_token, timestamp, and signal", async () => {
    const { client, fetchMock } = createClient({ appAuthToken: "client-token" });
    const controller = new AbortController();

    await client.verifyPayment(proofInput, {
      appAuthToken: "call-token",
      gatewayEndpoint: "https://sandbox.alipay.example/gateway.do",
      signal: controller.signal,
      timestamp: "2026-07-16 08:00:00",
    });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://sandbox.alipay.example/gateway.do");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;

    expect(init.signal).toBe(controller.signal);

    const body = sentBody(fetchMock);

    expect(body.get("app_auth_token")).toBe("call-token");
    expect(body.get("timestamp")).toBe("2026-07-16 08:00:00");
  });

  it("falls back to the client-level app_auth_token", async () => {
    const { client, fetchMock } = createClient({ appAuthToken: "client-token" });

    await client.verifyPayment(proofInput);

    expect(sentBody(fetchMock).get("app_auth_token")).toBe("client-token");
  });

  it("wraps network failures in AlipayAIPayRequestError", async () => {
    const failure = new Error("socket hang up");
    const fetchMock = vi.fn(async () => {
      throw failure;
    });
    const client = new AlipayAIPayClient({
      appId: APP_ID,
      fetch: fetchMock as unknown as typeof fetch,
      logLevel: "silent",
      privateKey: merchantPrivateKeyPem,
    });
    const caught = await client.verifyPayment(proofInput).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(AlipayAIPayRequestError);
    expect((caught as AlipayAIPayRequestError).details?.cause).toBe(failure);
  });

  it("surfaces HTTP failures as AlipayAIPayResponseError", async () => {
    const { client } = createClient({}, "gateway offline", 502);
    const caught = await client.verifyPayment(proofInput).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(AlipayAIPayResponseError);
    expect((caught as AlipayAIPayResponseError).status).toBe(502);
  });

  it("logs through a custom logger", async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const fetchMock = vi.fn(async () => new Response(envelope(VERIFY_RESPONSE_KEY, verifyNode)));
    const client = new AlipayAIPayClient({
      appId: APP_ID,
      fetch: fetchMock as unknown as typeof fetch,
      logLevel: "debug",
      logger,
      privateKey: merchantPrivateKeyPem,
    });

    await client.verifyPayment(proofInput);

    expect(logger.debug).toHaveBeenCalledWith("Calling Alipay AI Pay gateway.", expect.anything());
    expect(logger.info).toHaveBeenCalledWith(
      "Alipay AI Pay payment verification completed.",
      expect.objectContaining({ verified: true }),
    );

    const failing = new AlipayAIPayClient({
      appId: APP_ID,
      fetch: vi.fn(async () => new Response("oops", { status: 500 })) as unknown as typeof fetch,
      logLevel: "debug",
      logger,
      privateKey: merchantPrivateKeyPem,
    });

    await expect(failing.verifyPayment(proofInput)).rejects.toThrow(AlipayAIPayResponseError);
    expect(logger.warn).toHaveBeenCalledWith(
      "Alipay AI Pay gateway request failed.",
      expect.objectContaining({ status: 500 }),
    );
  });
});

function buildSignContent(body: URLSearchParams): string {
  return [...body.entries()]
    .filter(([key, value]) => key !== "sign" && value.length > 0)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
