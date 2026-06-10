import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";

export const privateKey =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const network = "eip155:84532" as const;

export function paymentRequirement(
  overrides: Partial<PaymentRequirements> = {},
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000",
    payTo: "0x1111111111111111111111111111111111111111",
    maxTimeoutSeconds: 60,
    extra: {
      name: "USDC",
      version: "2",
    },
    ...overrides,
  };
}

export function paymentRequired(
  accepts: PaymentRequirements[] = [paymentRequirement()],
): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: "https://api.example.test/paid",
      description: "Paid test endpoint",
      mimeType: "application/json",
    },
    accepts,
  };
}

export async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();

  if (text.length === 0) {
    return "";
  }

  return JSON.parse(text);
}
