import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { describe, expect, it, vi } from "vitest";

import {
  X402Client,
  X402ConfigError,
  X402PaymentError,
} from "../../src/x402/index.js";
import {
  network,
  paymentRequired,
  paymentRequirement,
  privateKey,
  readRequestBody,
} from "./fixtures.js";

describe("X402Client configuration", () => {
  it("constructs offline with an anvil-style private key", () => {
    const client = new X402Client(privateKey, {
      network,
      fetch: vi.fn<typeof fetch>(),
    });

    expect(client.network).toBe(network);
    expect(client.maxAmount).toBe(100_000n);
  });

  it("normalizes private keys without a 0x prefix", () => {
    const client = new X402Client(privateKey.slice(2), {
      network,
      fetch: vi.fn<typeof fetch>(),
    });

    expect(client.network).toBe(network);
  });

  it("throws X402ConfigError for invalid private keys", () => {
    expect(
      () =>
        new X402Client("not-a-private-key", {
          network,
          fetch: vi.fn<typeof fetch>(),
        }),
    ).toThrow(X402ConfigError);
  });

  it("throws X402ConfigError for non-eip155 networks", () => {
    expect(
      () =>
        new X402Client(privateKey, {
          network: "solana:devnet",
          fetch: vi.fn<typeof fetch>(),
        }),
    ).toThrow(X402ConfigError);
  });

  it("throws X402ConfigError when fetch is missing", () => {
    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal("fetch", undefined);

      expect(
        () =>
          new X402Client(privateKey, {
            network,
          }),
      ).toThrow(X402ConfigError);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});

describe("X402Client.call", () => {
  it("returns passthrough JSON responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          ok: true,
        },
        {
          status: 200,
        },
      ),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });

    await expect(
      client.call("https://example.test/free"),
    ).resolves.toMatchObject({
      kind: "passthrough",
      ok: true,
      paid: false,
      body: {
        ok: true,
      },
    });
  });

  it("uses default maxAmount and normalizes too-expensive requirements", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            paymentRequired([
              paymentRequirement({
                amount: "100001",
              }),
            ]),
          ),
        },
      }),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
      logLevel: "silent",
    });

    await expect(
      client.call("https://example.test/paid"),
    ).resolves.toMatchObject({
      kind: "error",
      ok: false,
      status: 0,
      metadata: {
        url: "https://example.test/paid",
        method: "GET",
      },
    });
  });

  it("uses client-level maxAmount to select a requirement", async () => {
    const fetchMock = payingFetch("100001");
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
      maxAmount: 100_001n,
    });

    await expect(
      client.call("https://example.test/paid"),
    ).resolves.toMatchObject({
      kind: "success",
      ok: true,
      paid: true,
      paymentResponse: {
        success: true,
        transaction: "0xpaid",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses call-level maxAmount override", async () => {
    const fetchMock = payingFetch("150000");
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
      maxAmount: 1000n,
    });

    await expect(
      client.call("https://example.test/paid", undefined, {
        maxAmount: 150_000n,
      }),
    ).resolves.toMatchObject({
      kind: "success",
      paid: true,
    });
  });

  it("filters requirements by network", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            paymentRequired([
              paymentRequirement({
                network: "eip155:1",
              }),
            ]),
          ),
        },
      }),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
      logLevel: "silent",
    });

    await expect(
      client.call("https://example.test/paid"),
    ).resolves.toMatchObject({
      kind: "error",
      ok: false,
      status: 0,
    });
  });

  it("throws X402PaymentError when throwOnError is true", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("failed", {
        status: 500,
      }),
    );
    const client = new X402Client(privateKey, {
      network,
      fetch: fetchMock,
    });

    await expect(
      client.call("https://example.test/fail", undefined, {
        throwOnError: true,
      }),
    ).rejects.toBeInstanceOf(X402PaymentError);
  });
});

function payingFetch(amount: string): typeof fetch {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const request = new Request(input);

    if (!request.headers.has("PAYMENT-SIGNATURE")) {
      return new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            paymentRequired([
              paymentRequirement({
                amount,
              }),
              paymentRequirement({
                amount: String(BigInt(amount) + 100n),
              }),
            ]),
          ),
        },
      });
    }

    const payment = decodePaymentSignatureHeader(
      request.headers.get("PAYMENT-SIGNATURE") ?? "",
    );

    expect(payment.accepted.amount).toBe(amount);

    return Response.json(
      {
        ok: true,
        body: await readRequestBody(request),
      },
      {
        headers: {
          "PAYMENT-RESPONSE": encodePaymentResponseHeader({
            success: true,
            transaction: "0xpaid",
            network,
          }),
        },
      },
    );
  });

  return fetchMock;
}
