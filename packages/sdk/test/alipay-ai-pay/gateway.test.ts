import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  alipayAIPayResponseKeyForMethod,
  extractAlipayAIPayResponseNode,
} from "../../src/alipay-ai-pay/gateway-response.js";
import {
  normalizeAlipayAIPayPrivateKey,
  normalizeAlipayAIPayPublicKey,
} from "../../src/alipay-ai-pay/rsa.js";
import {
  AlipayAIPayConfigError,
  AlipayAIPayRequestError,
  AlipayAIPayResponseError,
  alipayAIPayGatewayTimestamp,
  buildAlipayAIPayGatewayRequest,
  parseAlipayAIPayGatewayResponse,
  signAlipayAIPayRsa2,
  verifyAlipayAIPayRsa2,
} from "../../src/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const privateKeyBase64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

const METHOD = "alipay.aipay.agent.payment.verify";
const RESPONSE_KEY = "alipay_aipay_agent_payment_verify_response";
const ENDPOINT = "https://openapi.alipay.com/gateway.do";

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function signedEnvelope(node: Record<string, unknown>, responseKey = RESPONSE_KEY): string {
  const nodeJson = JSON.stringify(node);
  const sign = signAlipayAIPayRsa2(nodeJson, privateKey);

  return `{"${responseKey}":${nodeJson},"sign":"${sign}"}`;
}

describe("Alipay AI Pay RSA helpers", () => {
  it("normalizes PEM, bare Base64 PKCS#8, and PKCS#1 private keys", () => {
    const pkcs1Base64 = privateKey.export({ format: "der", type: "pkcs1" }).toString("base64");

    for (const input of [privateKeyPem, privateKeyBase64, pkcs1Base64, privateKey]) {
      const key = normalizeAlipayAIPayPrivateKey(input);

      expect(key.type).toBe("private");
      expect(key.asymmetricKeyType).toBe("rsa");
    }
  });

  it("normalizes PEM and bare Base64 SPKI public keys", () => {
    for (const input of [publicKeyPem, publicKeyBase64, publicKey]) {
      const key = normalizeAlipayAIPayPublicKey(input);

      expect(key.type).toBe("public");
      expect(key.asymmetricKeyType).toBe("rsa");
    }
  });

  it("rejects invalid key material", () => {
    expect(() => normalizeAlipayAIPayPrivateKey("")).toThrow(AlipayAIPayConfigError);
    expect(() => normalizeAlipayAIPayPrivateKey("not-a-key")).toThrow(AlipayAIPayConfigError);
    expect(() =>
      normalizeAlipayAIPayPrivateKey(
        "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----",
      ),
    ).toThrow(AlipayAIPayConfigError);
    expect(() => normalizeAlipayAIPayPublicKey("")).toThrow(AlipayAIPayConfigError);
    expect(() => normalizeAlipayAIPayPublicKey("not-a-key")).toThrow(AlipayAIPayConfigError);
    expect(() =>
      normalizeAlipayAIPayPublicKey("-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----"),
    ).toThrow(AlipayAIPayConfigError);
    expect(() => normalizeAlipayAIPayPrivateKey({} as never)).toThrow("not a KeyObject");
    expect(() => normalizeAlipayAIPayPublicKey({} as never)).toThrow("not a KeyObject");
  });

  it("rejects keys of the wrong type or algorithm", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

    expect(() => normalizeAlipayAIPayPrivateKey(ec.privateKey)).toThrow(
      "must be an RSA private key",
    );
    expect(() => normalizeAlipayAIPayPublicKey(ec.publicKey)).toThrow("must be an RSA public key");
    expect(() => normalizeAlipayAIPayPrivateKey(publicKey)).toThrow("must be an RSA private key");
    expect(() => normalizeAlipayAIPayPublicKey(privateKey)).toThrow("must be an RSA public key");
  });

  it("round-trips key objects created from exported material", () => {
    expect(normalizeAlipayAIPayPrivateKey(createPrivateKey(privateKeyPem)).asymmetricKeyType).toBe(
      "rsa",
    );
    expect(normalizeAlipayAIPayPublicKey(createPublicKey(publicKeyPem)).asymmetricKeyType).toBe(
      "rsa",
    );
  });

  it("signs and verifies RSA2 content", () => {
    const signature = signAlipayAIPayRsa2("content", privateKeyBase64);

    expect(verifyAlipayAIPayRsa2("content", signature, publicKeyBase64)).toBe(true);
    expect(verifyAlipayAIPayRsa2("other", signature, publicKeyBase64)).toBe(false);
    expect(verifyAlipayAIPayRsa2("content", "AAAA", publicKeyBase64)).toBe(false);
  });

  it("interoperates with independent Node crypto SHA256withRSA", () => {
    const signature = signAlipayAIPayRsa2("知识就是力量 content", privateKeyPem);
    const verifier = createVerify("RSA-SHA256");
    verifier.update("知识就是力量 content", "utf8");
    verifier.end();

    expect(verifier.verify(publicKey, signature, "base64")).toBe(true);

    const signer = createSign("RSA-SHA256");
    signer.update("知识就是力量 content", "utf8");
    signer.end();
    const independentSignature = signer.sign(privateKey, "base64");

    expect(verifyAlipayAIPayRsa2("知识就是力量 content", independentSignature, publicKeyPem)).toBe(
      true,
    );
  });
});

describe("Alipay AI Pay gateway request builder", () => {
  it("formats the timestamp as UTC+8 wall time", () => {
    expect(alipayAIPayGatewayTimestamp(new Date("2026-07-16T00:00:00Z"))).toBe(
      "2026-07-16 08:00:00",
    );
    expect(alipayAIPayGatewayTimestamp(new Date("2026-12-31T17:30:05Z"))).toBe(
      "2027-01-01 01:30:05",
    );
    expect(alipayAIPayGatewayTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u);
  });

  it("builds sorted sign content and a verifiable signature", () => {
    const request = buildAlipayAIPayGatewayRequest({
      appId: "2026000123456789",
      bizContent: { trade_no: "2026", payment_proof: "proof" },
      method: METHOD,
      privateKey: privateKeyPem,
      timestamp: "2026-07-16 08:00:00",
    });

    expect(request.signContent).toBe(
      `app_id=2026000123456789&biz_content={"trade_no":"2026","payment_proof":"proof"}&` +
        `charset=utf-8&format=JSON&method=${METHOD}&sign_type=RSA2&` +
        "timestamp=2026-07-16 08:00:00&version=1.0",
    );
    expect(request.params.sign).toBeDefined();
    expect(verifyAlipayAIPayRsa2(request.signContent, request.params.sign!, publicKey)).toBe(true);

    const body = new URLSearchParams(request.body);

    expect(body.get("method")).toBe(METHOD);
    expect(body.get("sign")).toBe(request.params.sign!);
    expect(JSON.parse(body.get("biz_content")!)).toEqual({
      trade_no: "2026",
      payment_proof: "proof",
    });
    expect(body.get("app_auth_token")).toBeNull();
  });

  it("includes app_auth_token in params and sign content when provided", () => {
    const request = buildAlipayAIPayGatewayRequest({
      appAuthToken: "auth-token-1",
      appId: "2026000123456789",
      bizContent: { trade_no: "2026" },
      method: METHOD,
      privateKey,
      timestamp: "2026-07-16 08:00:00",
    });

    expect(request.signContent).toContain("app_auth_token=auth-token-1&app_id=");
    expect(new URLSearchParams(request.body).get("app_auth_token")).toBe("auth-token-1");
  });

  it("rejects missing appId, method, and unserializable biz_content", () => {
    const base = {
      appId: "app",
      bizContent: { a: 1 },
      method: METHOD,
      privateKey,
    };

    expect(() => buildAlipayAIPayGatewayRequest({ ...base, appId: " " })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(() => buildAlipayAIPayGatewayRequest({ ...base, method: "" })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(() => buildAlipayAIPayGatewayRequest({ ...base, appAuthToken: " " })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(() =>
      buildAlipayAIPayGatewayRequest({
        ...base,
        bizContent: {
          boom: {
            toJSON() {
              throw new Error("boom");
            },
          },
        },
      }),
    ).toThrow(AlipayAIPayRequestError);
    expect(() =>
      buildAlipayAIPayGatewayRequest({
        ...base,
        bizContent: undefined as unknown as Record<string, unknown>,
      }),
    ).toThrow("must be JSON serializable");
  });
});

describe("Alipay AI Pay response node extraction", () => {
  it("maps a method to its response key", () => {
    expect(alipayAIPayResponseKeyForMethod(METHOD)).toBe(RESPONSE_KEY);
  });

  it("extracts the exact raw node substring", () => {
    const node = { code: "10000", msg: "Success", nested: { value: '{tricky\\"}' } };
    const raw = signedEnvelope(node);

    expect(extractAlipayAIPayResponseNode(raw, RESPONSE_KEY)).toBe(JSON.stringify(node));
  });

  it("returns undefined for missing keys and malformed bodies", () => {
    expect(extractAlipayAIPayResponseNode("{}", RESPONSE_KEY)).toBeUndefined();
    expect(extractAlipayAIPayResponseNode(`{"${RESPONSE_KEY}":"text"}`, RESPONSE_KEY)).toBe(
      undefined,
    );
    expect(
      extractAlipayAIPayResponseNode(`{"${RESPONSE_KEY}":{"code":"10000"`, RESPONSE_KEY),
    ).toBeUndefined();
  });
});

describe("Alipay AI Pay gateway response parser", () => {
  const options = { endpoint: ENDPOINT, method: METHOD };

  it("returns the response node on success", async () => {
    const node = { code: "10000", msg: "Success", trade_no: "2026" };
    const parsed = await parseAlipayAIPayGatewayResponse(
      jsonResponse(JSON.stringify({ [RESPONSE_KEY]: node, sign: "ignored" })),
      options,
    );

    expect(parsed).toEqual(node);
  });

  it("verifies the response signature when a public key is configured", async () => {
    const node = { code: "10000", msg: "Success", trade_no: "2026" };

    await expect(
      parseAlipayAIPayGatewayResponse(jsonResponse(signedEnvelope(node)), {
        ...options,
        alipayPublicKey: publicKeyPem,
      }),
    ).resolves.toEqual(node);
  });

  it("verifies signatures over the exact raw node bytes, not a re-serialization", async () => {
    const rawNode = '{ "code":"10000",\n  "msg":"\\u6210\\u529f",  "trade_no":"2026" }';
    const sign = signAlipayAIPayRsa2(rawNode, privateKey);
    const body = `{"${RESPONSE_KEY}":${rawNode},"sign":"${sign}"}`;

    await expect(
      parseAlipayAIPayGatewayResponse(jsonResponse(body), {
        ...options,
        alipayPublicKey: publicKeyPem,
      }),
    ).resolves.toMatchObject({ code: "10000", msg: "成功", trade_no: "2026" });
  });

  it("rejects spliced envelopes whose signed node differs from the parsed node", async () => {
    const genuine = JSON.stringify({ code: "10000", msg: "Success", active: false });
    const forged = JSON.stringify({
      code: "10000",
      msg: "Success",
      active: true,
      amount: "9999.00",
      trade_no: "2026",
      resource_id: "r",
      out_trade_no: "o",
    });
    const sign = signAlipayAIPayRsa2(genuine, privateKey);
    const body = `{"${RESPONSE_KEY}":${genuine},"${RESPONSE_KEY}":${forged},"sign":"${sign}"}`;

    await expect(
      parseAlipayAIPayGatewayResponse(jsonResponse(body), {
        ...options,
        alipayPublicKey: publicKeyPem,
      }),
    ).rejects.toThrow("does not cover the returned response node");
  });

  it("rejects tampered or unsigned bodies when a public key is configured", async () => {
    const envelope = signedEnvelope({ code: "10000", trade_no: "2026" });
    const tampered = envelope.replace('"trade_no":"2026"', '"trade_no":"9999"');

    await expect(
      parseAlipayAIPayGatewayResponse(jsonResponse(tampered), {
        ...options,
        alipayPublicKey: publicKeyPem,
      }),
    ).rejects.toThrow("signature verification failed");
    await expect(
      parseAlipayAIPayGatewayResponse(
        jsonResponse(JSON.stringify({ [RESPONSE_KEY]: { code: "10000" } })),
        { ...options, alipayPublicKey: publicKeyPem },
      ),
    ).rejects.toThrow("missing the sign field");
  });

  it("throws a business error for non-10000 codes", async () => {
    const envelope = JSON.stringify({
      [RESPONSE_KEY]: {
        code: "40004",
        msg: "Business Failed",
        sub_code: "TRADE_NOT_FOUND",
        sub_msg: "交易不存在",
      },
      sign: "x",
    });
    const caught = await parseAlipayAIPayGatewayResponse(jsonResponse(envelope), options).catch(
      (error: unknown) => error,
    );

    expect(caught).toBeInstanceOf(AlipayAIPayResponseError);
    expect((caught as AlipayAIPayResponseError).message).toContain("TRADE_NOT_FOUND");
    expect((caught as AlipayAIPayResponseError).details?.subMsg).toBe("交易不存在");
  });

  it("throws for gateway-level error_response envelopes", async () => {
    const envelope = JSON.stringify({
      error_response: { code: "40002", msg: "Invalid Arguments", sub_code: "isv.invalid-app-id" },
      sign: "x",
    });

    await expect(parseAlipayAIPayGatewayResponse(jsonResponse(envelope), options)).rejects.toThrow(
      "isv.invalid-app-id",
    );
  });

  it("throws for missing nodes, empty bodies, and invalid JSON", async () => {
    await expect(parseAlipayAIPayGatewayResponse(jsonResponse("{}"), options)).rejects.toThrow(
      `missing the ${RESPONSE_KEY} node`,
    );
    await expect(parseAlipayAIPayGatewayResponse(jsonResponse(""), options)).rejects.toThrow(
      "was empty",
    );
    await expect(
      parseAlipayAIPayGatewayResponse(jsonResponse("not json"), options),
    ).rejects.toThrow("not valid JSON");
  });

  it("throws for non-2xx responses and keeps the parsed body in details", async () => {
    const jsonError = await parseAlipayAIPayGatewayResponse(
      jsonResponse('{"reason":"bad"}', 502),
      options,
    ).catch((error: unknown) => error);

    expect(jsonError).toBeInstanceOf(AlipayAIPayResponseError);
    expect((jsonError as AlipayAIPayResponseError).status).toBe(502);
    expect((jsonError as AlipayAIPayResponseError).details?.body).toEqual({ reason: "bad" });

    const textError = await parseAlipayAIPayGatewayResponse(
      jsonResponse("gateway offline", 503),
      options,
    ).catch((error: unknown) => error);

    expect((textError as AlipayAIPayResponseError).details?.body).toBe("gateway offline");

    const emptyError = await parseAlipayAIPayGatewayResponse(jsonResponse("", 500), options).catch(
      (error: unknown) => error,
    );

    expect((emptyError as AlipayAIPayResponseError).details?.body).toBeNull();
  });
});
