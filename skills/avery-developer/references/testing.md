# Testing and local development

Every client in the SDK accepts an injected `fetch`. That is the seam: **no test should ever touch a real payment network, gateway, or facilitator.**

| Client                               | Inject via                                |
| ------------------------------------ | ----------------------------------------- |
| `X402Client`                         | `new X402Client(key, { network, fetch })` |
| `AlipayAIPayClient`                  | `new AlipayAIPayClient({ ..., fetch })`   |
| `WeiXinAIPayClient`                  | `new WeiXinAIPayClient({ ..., fetch })`   |
| `createAlphaPayment` (x402 outbound) | `{ fetch }` on the config                 |
| `createAlphaPayment` (alipay/weixin) | pass a preconstructed client instance     |

A test that hits the network is a test that fails in CI, leaks credentials, or spends real money. Assume all three.

## Test credentials

Never use a funded key in a test. Generate throwaway material:

```ts
// EVM (x402) — any 32-byte hex is a structurally valid key
const evmKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// WeiXin — same shape, an SM2 scalar
const weixinKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Alipay — a real RSA keypair, generated in the test
import { generateKeyPairSync } from "node:crypto";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
```

For Alipay, generating a real keypair lets you verify your own signatures end to end — sign a bill with `privateKey`, verify with `verifyAlipayAIPayRsa2` and `publicKey`.

## Make signatures deterministic

Both signing rails mix in a timestamp, and WeiXin also mixes in a nonce. Pin them, or you cannot assert on a signature:

```ts
// WeiXin — pin both
const request = buildWeiXinAIPayPreorderRequest(paymentRequired, {
  developerId: "developer-123",
  publicKeyId: "pub-key-456",
  privateKey: weixinKey,
  timestamp: "1735689600",
  nonceStr: "abcdef0123456789abcdef0123456789",
});

// Alipay — pin the gateway timestamp per call
await client.verifyPayment(proof, { timestamp: "2026-01-01 00:00:00" });
```

Prefer asserting on **decoded structure** over raw signature strings — decode `payment_required` back to JSON and compare objects, rather than pinning a base64 blob that any harmless field-order change would break.

## Faking a paid x402 endpoint

Drive `X402Client.call()` through a `fetch` stub that returns a 402 and then the paid response:

```ts
import { vi } from "vitest";

const fetchStub = vi
  .fn()
  .mockResolvedValueOnce(
    new Response(JSON.stringify({ accepts: [paymentRequirement] }), {
      status: 402,
      headers: { "content-type": "application/json" },
    }),
  )
  .mockResolvedValueOnce(
    new Response(JSON.stringify({ temp: 21 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

const client = new X402Client(evmKey, { network: "base-sepolia", fetch: fetchStub });
```

Cases worth covering, one per `EndpointResult.kind`:

| Stub returns                                                | Expected `kind`    |
| ----------------------------------------------------------- | ------------------ |
| 200 on the first call                                       | `passthrough`      |
| 402 with a requirement over your cap, or on another network | `payment_required` |
| 402 → 200 with a settle header                              | `success`          |
| 402 → 200 with a failed settlement                          | `settle_failed`    |
| a rejected promise                                          | `error`            |

Assert on `result.kind` rather than `result.ok` alone — `ok` collapses four distinct failures into one boolean.

## Faking the Alipay gateway

The gateway wraps its answer in a `<method with dots replaced by underscores>_response` node:

```ts
const gatewayResponse = (node: Record<string, unknown>) =>
  new Response(
    JSON.stringify({ alipay_aipay_agent_payment_verify_response: { code: "10000", ...node } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const client = new AlipayAIPayClient({
  appId: "test-app",
  privateKey, // no alipayPublicKey → response signature checks are skipped
  fetch: vi.fn().mockResolvedValue(
    gatewayResponse({
      trade_no: "2026010100001",
      out_trade_no: "order-1",
      amount: "0.01",
      resource_id: "/api/report",
      active: true,
    }),
  ),
});
```

Omitting `alipayPublicKey` keeps stubs simple, but then you are **not** testing signature verification. Add at least one test that does supply a public key and asserts a tampered response is rejected — that path is the security-critical one.

Also cover:

- `code: "40004"` with `sub_code` → `AlipayAIPayResponseError` carrying `details.subCode`.
- A missing `_response` node → the "missing node" error.
- An `active: true` response whose `amount` disagrees with `expect` → `verified === false` and `mismatches: ["amount"]`.

## Testing the inbound Alipay runtime

Construct the runtime with a stubbed client, then drive the adapter with plain `Request` objects:

```ts
const payment = createAlphaPayment({
  provider: "alipay",
  direction: "inbound",
  client: stubbedAlipayClient,
  replayStore: memoryReplayStore(),
  routes: { "GET /api/report": { bill: staticBill } },
});

const handler = withAlphaNext(payment, async () => Response.json({ report: "ok" }));

// no proof → 402 challenge
const challenge = await handler(new NextRequest("http://localhost/api/report"), {});
expect(challenge.status).toBe(402);
expect(challenge.headers.get("Payment-Needed")).toBeTruthy();
```

**An in-process `Map` replay store is fine in tests** — single process, no restarts — even though it is unsafe in production:

```ts
function memoryReplayStore(): AlphaReplayStore {
  const state = new Map<string, "in_progress" | "completed">();
  const key = (i: { provider: string; route: string; tradeNo: string }) =>
    `${i.provider}:${i.route}:${i.tradeNo}`;

  return {
    claim: async (i) => {
      const current = state.get(key(i));
      if (current !== undefined) return current;
      state.set(key(i), "in_progress");
      return "claimed";
    },
    complete: async (i) => void state.set(key(i), "completed"),
    abandon: async (i) => void state.delete(key(i)),
  };
}
```

Sequence tests worth writing:

- Same `tradeNo` twice → second request does not reach the handler.
- Handler throws → `abandon` was called.
- Handler returns 500 → `abandon` was called, response body carries no resource data.
- `confirmFulfillment` rejects → 502 **and the claim is still held** (this is the deliberate behavior).
- Response over `maxResponseBytes` → 500, claim abandoned.

## Assert what must never leak

Payment material staying out of logs and out of model context is a property worth testing, not just reviewing:

```ts
const logs: unknown[] = [];
const logger = {
  debug: (...a) => logs.push(a),
  info: (...a) => logs.push(a),
  warn: (...a) => logs.push(a),
  error: (...a) => logs.push(a),
};

// …exercise the client with logLevel: "debug"…

const serialized = JSON.stringify(logs);
expect(serialized).not.toContain(privateKeyMaterial);
expect(serialized).not.toContain(signatureValue);
```

Do the same for tool output: a tool with an `execute` mapper should never surface `paymentResponse` or raw headers to the model.

## Local development without credentials

- **x402**: use a testnet (Base Sepolia) with a throwaway wallet and faucet funds — see `networks.md`. Never a mainnet key in a dev `.env`.
- **Alipay/WeiXin**: use sandbox credentials where available; otherwise keep the client stubbed and exercise your own routes through the SDK's builder helpers, which need no network at all.
- The runtime allows an Alipay setup with **no** `replayStore` for local work — it logs one warning. Don't let that configuration reach production.

## This repository's commands

```sh
pnpm verify                        # the full gate: lint, format, typecheck, coverage, build, pack
pnpm --filter @averyso/alpha exec vitest run test/alipay-ai-pay/bill.test.ts
pnpm --filter @averyso/alpha exec vitest run -t "rejects unsupported"
pnpm --filter @averyso/alpha exec vitest                       # watch
```

Coverage thresholds are enforced at 90%. Run `pnpm verify` before committing — it is exactly what CI runs.
