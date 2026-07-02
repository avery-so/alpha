import { base16, base64 } from "@scure/base";
import smCrypto from "sm-crypto";
import { describe, expect, it, vi } from "vitest";

import {
  WeiXinAIPayClient,
  WeiXinAIPayConfigError,
  WeiXinAIPayRequestError,
  WeiXinAIPayResponseError,
  buildWeiXinAIPayPreorderRequest,
  encodeWeiXinAIPaymentRequired,
  signWeiXinAIPayPreorder,
} from "../../src/index.js";

const privateKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const normalizedPrivateKey = privateKey.slice(2);
const publicKey = smCrypto.sm2.getPublicKeyFromPrivateKey(normalizedPrivateKey);
const timestamp = "1735689600";
const nonceStr = "abcdef0123456789abcdef0123456789";
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const paymentRequired = {
  appid: "wx-miniapp",
  mchid: "1900000109",
  out_trade_no: "order-1001",
  description: "Alpha preorder",
  amount: {
    total: 100,
    currency: "CNY",
  },
};

describe("WeiXinAI Pay preorder request builder", () => {
  it("encodes payment_required as Base64 JSON", () => {
    const encoded = encodeWeiXinAIPaymentRequired(paymentRequired);
    const decoded = JSON.parse(textDecoder.decode(base64.decode(encoded)));

    expect(decoded).toEqual(paymentRequired);
  });

  it("builds the preorder body and signs the trailing-newline sign string", () => {
    const request = buildWeiXinAIPayPreorderRequest(paymentRequired, {
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      timestamp,
      nonceStr,
    });

    expect(request).toMatchObject({
      signature_type: "WEIXINAIPAY-SM2-WITH-SM3",
      developer_platform: "WXPAY",
      developer_id: "developer-123",
      pub_key_id: "pub-key-456",
      nonce_str: nonceStr,
      timestamp,
      payment_required: encodeWeiXinAIPaymentRequired(paymentRequired),
    });

    const signString = `${timestamp}\n${nonceStr}\n${request.payment_required}\n`;

    expect(verifySignature(request.signature, signString, "der")).toBe(true);
    expect(verifySignature(request.signature, signString.slice(0, -1), "der")).toBe(false);
  });

  it("generates default timestamp and nonce values", () => {
    const before = Math.floor(Date.now() / 1000);
    const request = buildWeiXinAIPayPreorderRequest(paymentRequired, {
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey: normalizedPrivateKey,
      developerPlatform: "CUSTOM_PLATFORM",
    });
    const after = Math.floor(Date.now() / 1000);

    expect(Number(request.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Number(request.timestamp)).toBeLessThanOrEqual(after);
    expect(request.nonce_str).toMatch(/^[0-9a-f]{32}$/u);
    expect(request.developer_platform).toBe("CUSTOM_PLATFORM");
    expect(
      verifySignature(
        request.signature,
        `${request.timestamp}\n${request.nonce_str}\n${request.payment_required}\n`,
        "der",
      ),
    ).toBe(true);
  });

  it("creates verifiable DER and raw SM2 signatures over the SM3 digest", () => {
    const paymentRequiredBase64 = encodeWeiXinAIPaymentRequired(paymentRequired);
    const input = {
      timestamp,
      nonceStr,
      paymentRequired: paymentRequiredBase64,
    };
    const signString = `${timestamp}\n${nonceStr}\n${paymentRequiredBase64}\n`;

    const derSignature = signWeiXinAIPayPreorder(input, {
      privateKey,
      signatureEncoding: "der",
    });
    const rawSignature = signWeiXinAIPayPreorder(input, {
      privateKey,
      signatureEncoding: "raw",
    });

    expect(base64.decode(derSignature)[0]).toBe(0x30);
    expect(base64.decode(rawSignature)).toHaveLength(64);
    expect(verifySignature(derSignature, signString, "der")).toBe(true);
    expect(verifySignature(rawSignature, signString, "raw")).toBe(true);
  });

  it("throws WeiXinAI-specific errors for invalid build inputs", () => {
    expect(() =>
      buildWeiXinAIPayPreorderRequest(paymentRequired, {
        developerId: "developer-123",
        publicKeyId: "pub-key-456",
        privateKey: "not-a-private-key",
        timestamp,
        nonceStr,
      }),
    ).toThrow(WeiXinAIPayConfigError);

    expect(() => encodeWeiXinAIPaymentRequired(undefined)).toThrow(WeiXinAIPayRequestError);
    expect(() =>
      signWeiXinAIPayPreorder(
        {
          timestamp,
          nonceStr,
          paymentRequired: encodeWeiXinAIPaymentRequired(paymentRequired),
        },
        {
          privateKey,
          signatureEncoding: "pem" as "der",
        },
      ),
    ).toThrow(WeiXinAIPayConfigError);
    expect(() =>
      signWeiXinAIPayPreorder(
        {
          timestamp,
          nonceStr: " ",
          paymentRequired: encodeWeiXinAIPaymentRequired(paymentRequired),
        },
        {
          privateKey,
        },
      ),
    ).toThrow(WeiXinAIPayConfigError);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => encodeWeiXinAIPaymentRequired(circular)).toThrow(WeiXinAIPayRequestError);
  });
});

describe("WeiXinAIPayClient.preorder", () => {
  it("posts the preorder JSON body and returns payment_code", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) =>
      Response.json({
        payment_code: "wx-pay-code-123",
      }),
    );
    const client = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: fetchMock,
      endpoint: "https://pay.example.test/preorder",
      logLevel: "silent",
    });

    await expect(
      client.preorder(paymentRequired, {
        timestamp,
        nonceStr,
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      paymentCode: "wx-pay-code-123",
      rawResponse: {
        payment_code: "wx-pay-code-123",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://pay.example.test/preorder");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(controller.signal);
    expect(headers.get("content-type")).toBe("application/json");
    expect(body).toMatchObject({
      signature_type: "WEIXINAIPAY-SM2-WITH-SM3",
      developer_platform: "WXPAY",
      developer_id: "developer-123",
      pub_key_id: "pub-key-456",
      nonce_str: nonceStr,
      timestamp,
      payment_required: encodeWeiXinAIPaymentRequired(paymentRequired),
    });
    expect(
      verifySignature(
        body.signature,
        `${timestamp}\n${nonceStr}\n${body.payment_required}\n`,
        "der",
      ),
    ).toBe(true);
  });

  it("supports call-level endpoint, developer platform, and raw signature encoding overrides", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) =>
      Response.json({
        payment_code: "wx-pay-code-raw",
      }),
    );
    const client = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: fetchMock,
      developerPlatform: "WXPAY",
      logLevel: "silent",
    });

    await client.preorder(paymentRequired, {
      endpoint: "https://pay.example.test/raw",
      developerPlatform: "CUSTOM_PLATFORM",
      signatureEncoding: "raw",
      timestamp,
      nonceStr,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://pay.example.test/raw");
    expect(body.developer_platform).toBe("CUSTOM_PLATFORM");
    expect(base64.decode(body.signature)).toHaveLength(64);
    expect(
      verifySignature(
        body.signature,
        `${timestamp}\n${nonceStr}\n${body.payment_required}\n`,
        "raw",
      ),
    ).toBe(true);
  });

  it("throws WeiXinAIPayConfigError for invalid private keys and missing fetch", () => {
    expect(
      () =>
        new WeiXinAIPayClient({
          developerId: "developer-123",
          publicKeyId: "pub-key-456",
          privateKey: "not-a-private-key",
          fetch: vi.fn<typeof fetch>(),
        }),
    ).toThrow(WeiXinAIPayConfigError);

    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal("fetch", undefined);

      expect(
        () =>
          new WeiXinAIPayClient({
            developerId: "developer-123",
            publicKeyId: "pub-key-456",
            privateKey,
          }),
      ).toThrow(WeiXinAIPayConfigError);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("uses global fetch and the default preorder endpoint when no fetch or endpoint is configured", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        payment_code: "wx-pay-code-default",
      }),
    );

    try {
      vi.stubGlobal("fetch", fetchMock);

      const client = new WeiXinAIPayClient({
        developerId: "developer-123",
        publicKeyId: "pub-key-456",
        privateKey,
        logLevel: "silent",
      });

      await expect(
        client.preorder(paymentRequired, {
          timestamp,
          nonceStr,
        }),
      ).resolves.toMatchObject({
        paymentCode: "wx-pay-code-default",
      });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://payapp.weixin.qq.com/palmpayminiapp/clawagentpay/preorder",
      );
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("wraps fetch failures in WeiXinAIPayRequestError", async () => {
    const cause = new TypeError("network down");
    const client = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(async () => {
        throw cause;
      }),
      logLevel: "silent",
    });

    await expect(
      client.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      name: "WeiXinAIPayRequestError",
      details: {
        cause,
      },
    });
  });

  it("throws WeiXinAIPayResponseError for non-2xx responses", async () => {
    const client = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            errcode: "INVALID_REQUEST",
          },
          {
            status: 400,
            statusText: "Bad Request",
          },
        ),
      ),
      logLevel: "silent",
    });

    const preorder = client.preorder(paymentRequired, {
      timestamp,
      nonceStr,
    });

    await expect(preorder).rejects.toBeInstanceOf(WeiXinAIPayResponseError);
    await expect(preorder).rejects.toMatchObject({
      name: "WeiXinAIPayResponseError",
      status: 400,
      details: {
        body: {
          errcode: "INVALID_REQUEST",
        },
      },
    });

    const textBodyClient = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response("upstream failed", {
            status: 500,
          }),
      ),
      logLevel: "silent",
    });

    await expect(
      textBodyClient.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      details: {
        body: "upstream failed",
      },
      status: 500,
    });
  });

  it("throws WeiXinAIPayResponseError for malformed, empty, and invalid success bodies", async () => {
    const malformedClient = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response("{", {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }),
      ),
      logLevel: "silent",
    });

    await expect(
      malformedClient.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      name: "WeiXinAIPayResponseError",
      status: 200,
    });

    const emptyBodyClient = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response("", {
            status: 200,
          }),
      ),
      logLevel: "silent",
    });

    await expect(
      emptyBodyClient.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      name: "WeiXinAIPayResponseError",
      status: 200,
    });

    const missingCodeClient = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json({
          ok: true,
        }),
      ),
      logLevel: "silent",
    });

    await expect(
      missingCodeClient.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      name: "WeiXinAIPayResponseError",
      status: 200,
    });

    const emptyCodeClient = new WeiXinAIPayClient({
      developerId: "developer-123",
      publicKeyId: "pub-key-456",
      privateKey,
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json({
          payment_code: "",
        }),
      ),
      logLevel: "silent",
    });

    await expect(
      emptyCodeClient.preorder(paymentRequired, {
        timestamp,
        nonceStr,
      }),
    ).rejects.toMatchObject({
      name: "WeiXinAIPayResponseError",
      status: 200,
    });
  });
});

function verifySignature(
  signatureBase64: string,
  signString: string,
  signatureEncoding: "der" | "raw",
): boolean {
  const signatureHex = base16.encode(base64.decode(signatureBase64)).toLowerCase();
  const digestHex = smCrypto.sm3(textEncoder.encode(signString));
  const digest = base16.decode(digestHex.toUpperCase());

  return smCrypto.sm2.doVerifySignature(digest, signatureHex, publicKey, {
    der: signatureEncoding === "der",
    hash: false,
  });
}
