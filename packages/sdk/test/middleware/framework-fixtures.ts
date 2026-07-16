import { generateKeyPairSync } from "node:crypto";

import { x402ResourceServer as X402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { vi } from "vitest";

import { AlipayAIPayClient, WeiXinAIPayClient, createAlphaPayment } from "../../src/index.js";
import type { AlphaPaymentRuntime } from "../../src/index.js";
import { network, privateKey } from "../x402/fixtures.js";

const { privateKey: alipayPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export const alipayBill = {
  amount: "0.01",
  goodsName: "Paid resource",
  outTradeNo: "order-1",
  payBefore: "2026-07-17T00:00:00+08:00",
  resourceId: "resource-1",
  sellerId: "seller-1",
  sellerName: "Seller",
  serviceId: "service-1",
};

export function createX402InboundRuntime(): {
  getSupported: ReturnType<typeof vi.fn>;
  runtime: AlphaPaymentRuntime;
} {
  const getSupported = vi.fn(async () => ({
    extensions: [],
    kinds: [{ network, scheme: "exact", x402Version: 2 }],
    signers: {},
  }));
  const facilitator = {
    getSupported,
    settle: vi.fn(),
    verify: vi.fn(),
  } as unknown as FacilitatorClient;
  const server = new X402ResourceServer(facilitator).register(network, new ExactEvmScheme());
  const runtime = createAlphaPayment({
    direction: "inbound",
    logLevel: "silent",
    provider: "x402",
    routes: {
      "GET /paid": {
        accepts: {
          network,
          payTo: "0x1111111111111111111111111111111111111111",
          price: "$0.01",
          scheme: "exact",
        },
        description: "Paid test resource",
        mimeType: "application/json",
      },
    },
    server,
  });

  return { getSupported, runtime };
}

export function createX402OutboundRuntime(): AlphaPaymentRuntime {
  return createAlphaPayment({
    direction: "outbound",
    logLevel: "silent",
    network,
    privateKey,
    provider: "x402",
  });
}

export function createAlipayInboundRuntime(): AlphaPaymentRuntime {
  const client = new AlipayAIPayClient({
    appId: "app-id",
    logLevel: "silent",
    privateKey: alipayPrivateKey,
  });

  return createAlphaPayment({
    client,
    direction: "inbound",
    logLevel: "silent",
    provider: "alipay",
    routes: { "GET /paid": { bill: alipayBill } },
  });
}

export function createWeiXinOutboundRuntime(): {
  fetchMock: ReturnType<typeof vi.fn>;
  runtime: AlphaPaymentRuntime;
} {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ payment_code: "weixin-code-1" }),
  );
  const client = new WeiXinAIPayClient({
    developerId: "developer-id",
    fetch: fetchMock,
    logLevel: "silent",
    privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    publicKeyId: "public-key-id",
  });

  return {
    fetchMock,
    runtime: createAlphaPayment({
      client,
      direction: "outbound",
      logLevel: "silent",
      provider: "weixin",
    }),
  };
}
