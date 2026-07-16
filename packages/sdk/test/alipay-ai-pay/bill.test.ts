import { generateKeyPairSync } from "node:crypto";

import { base64, base64urlnopad } from "@scure/base";
import { describe, expect, it } from "vitest";

import {
  AlipayAIPayConfigError,
  AlipayAIPayRequestError,
  alipayAIPayBillSignContent,
  buildAlipayAIPayPaymentNeeded,
  buildAlipayAIPayPaymentNeededHeader,
  encodeAlipayAIPayPaymentNeededHeader,
  parseAlipayAIPayPaymentProofHeader,
  signAlipayAIPayBill,
  verifyAlipayAIPayRsa2,
} from "../../src/index.js";
import type { AlipayAIPayBillInput } from "../../src/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const billInput: AlipayAIPayBillInput = {
  outTradeNo: "ORDER_1739836600000_abc123",
  amount: "0.01",
  resourceId: "RES_1739836600000_abc123",
  payBefore: "2026-03-25T12:00:00+08:00",
  sellerId: "2088123456789012",
  sellerName: "测试商家",
  sellerAppId: "2026000123456789",
  goodsName: "测试商品",
  serviceId: "service_ai_content_001",
};

describe("Alipay AI Pay bill sign content", () => {
  it("joins the signed fields sorted by key", () => {
    expect(alipayAIPayBillSignContent(billInput)).toBe(
      "amount=0.01&currency=CNY&goods_name=测试商品&out_trade_no=ORDER_1739836600000_abc123&" +
        "pay_before=2026-03-25T12:00:00+08:00&resource_id=RES_1739836600000_abc123&" +
        "seller_id=2088123456789012&service_id=service_ai_content_001",
    );
  });

  it("uses an explicit currency when provided", () => {
    expect(alipayAIPayBillSignContent({ ...billInput, currency: "USD" })).toContain("currency=USD");
  });

  it("rejects missing required fields", () => {
    expect(() => alipayAIPayBillSignContent({ ...billInput, outTradeNo: " " })).toThrow(
      AlipayAIPayConfigError,
    );
    expect(() => alipayAIPayBillSignContent({ ...billInput, currency: "" })).toThrow(
      AlipayAIPayConfigError,
    );
  });
});

describe("Alipay AI Pay Payment-Needed builder", () => {
  it("signs the bill with RSA2 over the sign content", () => {
    const signature = signAlipayAIPayBill(billInput, { privateKey });

    expect(verifyAlipayAIPayRsa2(alipayAIPayBillSignContent(billInput), signature, publicKey)).toBe(
      true,
    );
    expect(verifyAlipayAIPayRsa2("tampered", signature, publicKey)).toBe(false);
  });

  it("builds the layered Payment-Needed payload", () => {
    const paymentNeeded = buildAlipayAIPayPaymentNeeded(billInput, { privateKey });

    expect(paymentNeeded.protocol).toMatchObject({
      out_trade_no: billInput.outTradeNo,
      amount: billInput.amount,
      currency: "CNY",
      resource_id: billInput.resourceId,
      pay_before: billInput.payBefore,
      seller_sign_type: "RSA2",
      seller_unique_id: billInput.sellerId,
    });
    expect(paymentNeeded.method).toEqual({
      seller_name: billInput.sellerName,
      seller_id: billInput.sellerId,
      seller_app_id: billInput.sellerAppId,
      goods_name: billInput.goodsName,
      seller_unique_id_key: "seller_id",
      service_id: billInput.serviceId,
    });
    expect(
      verifyAlipayAIPayRsa2(
        alipayAIPayBillSignContent(billInput),
        paymentNeeded.protocol.seller_signature,
        publicKey,
      ),
    ).toBe(true);
  });

  it("encodes the header as unpadded Base64URL JSON", () => {
    const { header, paymentNeeded } = buildAlipayAIPayPaymentNeededHeader(billInput, {
      privateKey,
    });

    expect(header).toMatch(/^[\w-]+$/u);
    expect(header).toBe(encodeAlipayAIPayPaymentNeededHeader(paymentNeeded));
    expect(JSON.parse(textDecoder.decode(base64urlnopad.decode(header)))).toEqual(paymentNeeded);
  });
});

describe("Alipay AI Pay Payment-Proof parser", () => {
  const proofPayload = {
    protocol: {
      payment_proof: "62922589b11acfc70faf4ebab1da7a9bbc438554e40d0a1dcdc7f35b3085aaaa",
      trade_no: "20260324008281172041220000012182",
    },
    method: {
      client_session: "ImNsaWVudFNlc3N",
    },
  };

  it("parses a standard Base64 header", () => {
    const header = base64.encode(textEncoder.encode(JSON.stringify(proofPayload)));
    const proof = parseAlipayAIPayPaymentProofHeader(header);

    expect(proof.paymentProof).toBe(proofPayload.protocol.payment_proof);
    expect(proof.tradeNo).toBe(proofPayload.protocol.trade_no);
    expect(proof.clientSession).toBe(proofPayload.method.client_session);
    expect(proof.raw).toEqual(proofPayload);
  });

  it("parses an unpadded Base64URL header", () => {
    const header = base64urlnopad.encode(textEncoder.encode(JSON.stringify(proofPayload)));

    expect(parseAlipayAIPayPaymentProofHeader(header).tradeNo).toBe(proofPayload.protocol.trade_no);
  });

  it("returns undefined clientSession when the method layer is absent", () => {
    const header = base64.encode(
      textEncoder.encode(JSON.stringify({ protocol: proofPayload.protocol })),
    );

    expect(parseAlipayAIPayPaymentProofHeader(header).clientSession).toBeUndefined();
  });

  it("rejects empty, non-Base64, and non-JSON headers", () => {
    expect(() => parseAlipayAIPayPaymentProofHeader("  ")).toThrow(AlipayAIPayRequestError);
    expect(() => parseAlipayAIPayPaymentProofHeader("!!!!")).toThrow("not valid Base64/Base64URL");
    expect(() =>
      parseAlipayAIPayPaymentProofHeader(base64.encode(textEncoder.encode("not json"))),
    ).toThrow("not valid JSON");
  });

  it("rejects headers missing protocol fields", () => {
    const withoutProof = base64.encode(
      textEncoder.encode(JSON.stringify({ protocol: { trade_no: "2026" } })),
    );
    const withoutTradeNo = base64.encode(
      textEncoder.encode(JSON.stringify({ protocol: { payment_proof: "abc" } })),
    );
    const withoutProtocol = base64.encode(textEncoder.encode(JSON.stringify({ method: {} })));

    expect(() => parseAlipayAIPayPaymentProofHeader(withoutProof)).toThrow(
      "missing protocol.payment_proof",
    );
    expect(() => parseAlipayAIPayPaymentProofHeader(withoutTradeNo)).toThrow(
      "missing protocol.trade_no",
    );
    expect(() => parseAlipayAIPayPaymentProofHeader(withoutProtocol)).toThrow(
      "missing protocol.payment_proof",
    );
  });

  it("ignores a non-string client_session", () => {
    const header = base64.encode(
      textEncoder.encode(
        JSON.stringify({ protocol: proofPayload.protocol, method: { client_session: 42 } }),
      ),
    );

    expect(parseAlipayAIPayPaymentProofHeader(header).clientSession).toBeUndefined();
  });
});
