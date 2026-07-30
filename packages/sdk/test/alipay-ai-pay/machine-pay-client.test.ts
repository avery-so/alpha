import { describe, expect, it, vi } from "vitest";

import {
  AlipayAIPayConfigError,
  AlipayAIPayMachinePayClient,
  AlipayAIPayRequestError,
} from "../../src/index.js";
import type { AlipayAIPayMachinePayer, Logger } from "../../src/index.js";

const challenge = "payment-needed-sensitive-value";
const proof = "payment-proof-sensitive-value";

function createPayer(
  implementation: AlipayAIPayMachinePayer["createPaymentProof"] = async () => ({
    paymentProofHeader: proof,
  }),
) {
  return {
    createPaymentProof: vi.fn(implementation),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } satisfies Logger;
}

function createClient(
  fetchMock: typeof fetch,
  payer = createPayer(),
  logger: Logger = createLogger(),
): AlipayAIPayMachinePayClient {
  return new AlipayAIPayMachinePayClient({
    fetch: fetchMock,
    logger,
    payer,
  });
}

function paymentRequired(paymentNeeded: string | undefined = challenge): Response {
  if (paymentNeeded === undefined) {
    return paymentRequiredResponse();
  }

  return new Response(null, {
    headers: { "Payment-Needed": paymentNeeded },
    status: 402,
  });
}

describe("AlipayAIPayMachinePayClient", () => {
  it("requires a payer and a fetch implementation", () => {
    expect(() => new AlipayAIPayMachinePayClient(null as never)).toThrow(AlipayAIPayConfigError);
    expect(() => new AlipayAIPayMachinePayClient({ payer: {} as AlipayAIPayMachinePayer })).toThrow(
      "createPaymentProof",
    );
  });

  it("returns a non-402 response without asking the payer", async () => {
    const response = new Response("ready", { status: 201 });
    const fetchMock = vi.fn<typeof fetch>(async () => response);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(client.fetch("https://api.example.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payer.createPaymentProof).not.toHaveBeenCalled();
  });

  it("returns a 402 without a challenge", async () => {
    const response = paymentRequiredResponse();
    const fetchMock = vi.fn<typeof fetch>(async () => response);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(client.fetch("https://api.example.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payer.createPaymentProof).not.toHaveBeenCalled();
  });

  it("returns a 402 with a blank challenge", async () => {
    const response = paymentRequired("   ");
    const fetchMock = vi.fn<typeof fetch>(async () => response);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(client.fetch("https://api.example.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payer.createPaymentProof).not.toHaveBeenCalled();
  });

  it("passes the original challenge to the payer and retries a POST exactly once", async () => {
    const firstResponse = paymentRequired();
    const paidResponse = new Response("paid", { status: 201 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(paidResponse);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(
      client.fetch("https://api.example.test/resource", {
        body: JSON.stringify({ report: "weekly" }),
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "request-1",
        },
        method: "POST",
      }),
    ).resolves.toBe(paidResponse);

    expect(payer.createPaymentProof).toHaveBeenCalledOnce();
    expect(payer.createPaymentProof).toHaveBeenCalledWith({
      paymentNeeded: challenge,
      request: {
        method: "POST",
        url: "https://api.example.test/resource",
      },
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = fetchMock.mock.calls[0]?.[0] as Request;
    const retryRequest = fetchMock.mock.calls[1]?.[0] as Request;
    expect(firstRequest).toBeInstanceOf(Request);
    expect(retryRequest).toBeInstanceOf(Request);
    expect(firstRequest.method).toBe("POST");
    expect(retryRequest.method).toBe("POST");
    expect(await firstRequest.clone().text()).toBe(JSON.stringify({ report: "weekly" }));
    expect(await retryRequest.clone().text()).toBe(JSON.stringify({ report: "weekly" }));
    expect(firstRequest.headers.get("content-type")).toBe("application/json");
    expect(retryRequest.headers.get("content-type")).toBe("application/json");
    expect(firstRequest.headers.get("x-request-id")).toBe("request-1");
    expect(retryRequest.headers.get("x-request-id")).toBe("request-1");
    expect(firstRequest.headers.get("payment-proof")).toBeNull();
    expect(retryRequest.headers.get("payment-proof")).toBe(proof);
  });

  it("does not replace a caller-supplied payment proof", async () => {
    const response = paymentRequired();
    const fetchMock = vi.fn<typeof fetch>(async () => response);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(
      client.fetch("https://api.example.test/resource", {
        headers: { "Payment-Proof": "caller-provided-proof" },
      }),
    ).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payer.createPaymentProof).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0]![0] as Request).headers.get("payment-proof")).toBe(
      "caller-provided-proof",
    );
  });

  it("rejects an empty proof returned by the payer without retrying", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => paymentRequired());
    const payer = createPayer(async () => ({ paymentProofHeader: " " }));
    const client = createClient(fetchMock, payer);

    await expect(client.fetch("https://api.example.test/resource")).rejects.toThrow(
      "empty payment proof",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payer.createPaymentProof).toHaveBeenCalledOnce();
  });

  it("normalizes payer and fetch failures without exposing payment material", async () => {
    const logger = createLogger();
    const payerFailure = new AlipayAIPayRequestError(`payer failed for ${challenge}`, {
      paymentNeeded: challenge,
    });
    const payer = createPayer(async () => {
      throw payerFailure;
    });
    const payerFetch = vi.fn<typeof fetch>(async () => paymentRequired());
    const payerClient = createClient(payerFetch, payer, logger);

    const payerError = await payerClient
      .fetch("https://api.example.test/resource")
      .catch((error: unknown) => error);
    expect(payerError).toBeInstanceOf(AlipayAIPayRequestError);
    expect((payerError as Error).message).not.toContain(challenge);

    const fetchFailure = new Error(`network failed with ${proof}`);
    const failingFetch = vi.fn<typeof fetch>(async () => {
      throw fetchFailure;
    });
    const fetchClient = createClient(failingFetch, createPayer(), logger);

    const fetchError = await fetchClient
      .fetch("https://api.example.test/resource")
      .catch((error: unknown) => error);
    expect(fetchError).toBeInstanceOf(AlipayAIPayRequestError);
    expect((fetchError as Error).message).not.toContain(proof);
    expect(serializedLogs(logger)).not.toContain(challenge);
    expect(serializedLogs(logger)).not.toContain(proof);
  });

  it("does not log payer-controlled error names", async () => {
    const logger = createLogger();
    const failure = new Error("payer failure");
    failure.name = `payer failure ${challenge} ${proof}`;
    const payer = createPayer(async () => {
      throw failure;
    });
    const client = createClient(
      vi.fn<typeof fetch>(async () => paymentRequired()),
      payer,
      logger,
    );

    const caughtError = await client
      .fetch("https://api.example.test/resource")
      .catch((error: unknown) => error);

    expect(caughtError).toBeInstanceOf(AlipayAIPayRequestError);
    expect((caughtError as AlipayAIPayRequestError).details).toEqual({ causeType: "Error" });
    expect(serializedLogs(logger)).not.toContain(challenge);
    expect(serializedLogs(logger)).not.toContain(proof);
  });

  it("normalizes invalid requests and retry failures", async () => {
    const client = createClient(vi.fn<typeof fetch>());

    await expect(client.fetch({} as never)).rejects.toThrow("could not be prepared");

    const retryFailure = new Error(`retry failed with ${proof}`);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(paymentRequired())
      .mockRejectedValueOnce(retryFailure);
    const payer = createPayer();
    const retryClient = createClient(fetchMock, payer);

    await expect(retryClient.fetch("https://api.example.test/resource")).rejects.toBeInstanceOf(
      AlipayAIPayRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payer.createPaymentProof).toHaveBeenCalledOnce();
  });

  it("passes the effective abort signal to the payer", async () => {
    const controller = new AbortController();
    let payerSignal: AbortSignal | undefined;
    const payer = createPayer(async ({ signal }) => {
      payerSignal = signal;
      return { paymentProofHeader: proof };
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(paymentRequired())
      .mockResolvedValueOnce(new Response("paid"));
    const client = createClient(fetchMock, payer);

    await client.fetch("https://api.example.test/resource", { signal: controller.signal });

    expect(payerSignal).toBeInstanceOf(AbortSignal);
    expect(payerSignal?.aborted).toBe(false);
    controller.abort();
    expect(payerSignal?.aborted).toBe(true);
  });

  it("returns the second 402 without a second payment attempt", async () => {
    const firstResponse = paymentRequired();
    const secondResponse = paymentRequired("different-payment-needed");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    const payer = createPayer();
    const client = createClient(fetchMock, payer);

    await expect(client.fetch("https://api.example.test/resource")).resolves.toBe(secondResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payer.createPaymentProof).toHaveBeenCalledOnce();
  });

  it("does not log the payment challenge or payment proof", async () => {
    const logger = createLogger();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(paymentRequired())
      .mockResolvedValueOnce(new Response("paid"));
    const client = createClient(fetchMock, createPayer(), logger);

    await client.fetch("https://api.example.test/resource");

    const logs = serializedLogs(logger);
    expect(logs).not.toContain(challenge);
    expect(logs).not.toContain(proof);
  });
});

function paymentRequiredResponse(): Response {
  return new Response(null, { status: 402 });
}

function serializedLogs(logger: ReturnType<typeof createLogger>): string {
  return [logger.debug, logger.error, logger.info, logger.warn]
    .flatMap((method) => method.mock.calls)
    .map((call) => JSON.stringify(call))
    .join("\n");
}
