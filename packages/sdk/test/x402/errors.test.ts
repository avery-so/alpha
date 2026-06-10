import { describe, expect, it } from "vitest";

import {
  X402ConfigError,
  X402Error,
  X402PaymentError,
} from "../../src/x402/index.js";

describe("x402 errors", () => {
  it("sets names, instanceof chains, and details", () => {
    const configError = new X402ConfigError("bad config", {
      field: "network",
    });
    const paymentError = new X402PaymentError("payment failed", 402, {
      requirement: "too-expensive",
    });

    expect(configError).toBeInstanceOf(Error);
    expect(configError).toBeInstanceOf(X402Error);
    expect(configError).toMatchObject({
      name: "X402ConfigError",
      message: "bad config",
      details: {
        field: "network",
      },
    });

    expect(paymentError).toBeInstanceOf(Error);
    expect(paymentError).toBeInstanceOf(X402Error);
    expect(paymentError).toMatchObject({
      name: "X402PaymentError",
      message: "payment failed",
      status: 402,
      details: {
        requirement: "too-expensive",
      },
    });
  });
});
