# Error Handling

`X402Client.call()` and `x402tool()` return an `EndpointResult` by default. **Branch on `result.kind` first**, then use `status`, `metadata`, `paymentResponse`, and error details to decide what to show the user and what to log.

## Result kinds

| `kind`             | Meaning                                                                               | Common causes                                                                                           | User message                                                   | Developer action                                                                            | Retry?                                          |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `success`          | Payment settled, paid response returned.                                              | Normal paid access.                                                                                     | Show the paid result.                                          | Record endpoint, status, redacted payment response if needed for audit.                     | No.                                             |
| `payment_required` | Endpoint required payment, but no compatible payment completed.                       | Network mismatch, amount over `maxAmount`, unsupported requirements, insufficient balance, wrong asset. | Ask user to adjust setup or try a lower-cost request.          | Inspect endpoint requirements, configured network, asset, balance, cap.                     | **No** — same config gives same result.         |
| `settle_failed`    | Endpoint responded after payment handling, but settlement reported as failed.         | Provider settlement path failure, expired payment, provider issue, settlement rejection.                | Payment couldn't be confirmed; retry later or contact support. | Log `paymentResponse`, endpoint, status, request id. Check provider state before replaying. | Only if idempotent and provider state is clear. |
| `error`            | Request/SDK/signing/fetch/RPC/endpoint/x402 flow failed outside a normal result path. | Invalid config, signing failure, fetch failure, RPC error, endpoint 5xx, malformed x402 response.       | Generic failure with a support reference.                      | Use `X402PaymentError.status`, `details.cause`, `metadata`, server logs.                    | Only transient network/RPC/rate-limit/5xx.      |
| `passthrough`      | Non-`402` response, so no payment was made.                                           | Free endpoint, wrong URL, no x402 in test env, middleware order, provider config.                       | Show the response if free access is expected.                  | If payment was expected, verify URL, environment, middleware order, provider config.        | No payment retry; fix routing/config first.     |

## Notes per kind

- **`payment_required` is not transient.** The SDK stopped before signing because it couldn't select a compatible requirement within policy. Fixes: set the client network to what the endpoint advertises; fund the wallet with the required asset on the required network; raise `maxAmount` only after reviewing the endpoint price as a real limit; use a provider that supports your intended network/token. Blindly retrying the same wallet/network/cap reproduces the result.
- **`settle_failed` is not success, and does not prove no funds moved.** On the buyer side you can check network, asset, `maxAmount`, balance, RPC URL — you cannot switch the provider's settlement path. Report that confirmation failed; retry only for idempotent operations with clear provider state.
- **`error`** — separate config/signing failures (invalid key, unsupported network, missing `fetch`, bad Solana key encoding — not retryable) from runtime failures (transient fetch, RPC timeout/rate-limit, 5xx, transient settlement — retry with backoff).
- **`passthrough`** is normal for free/public/conditionally-unlocked endpoints. If you expected payment, check URL/method, environment, whether x402 middleware runs before the route, and whether another auth layer responded first.

## `throwOnError`

Use `throwOnError: true` in route handlers/services when you want one centralized exception path:

```ts
try {
  const result = await client.call(endpoint, init, { throwOnError: true });
  return Response.json(result.body);
} catch (error) {
  if (error instanceof X402PaymentError) {
    return Response.json({ error: "Payment failed" }, { status: 402 });
  }
  throw error;
}
```

`X402PaymentError` includes `status` and optional `details`; `details.cause` holds the original error when the SDK normalized an unexpected failure.

For agent tools, prefer the **default `EndpointResult` flow** and shape output with `execute`, so raw errors, payment payloads, headers, and provider details stay out of model context:

```ts
x402tool({
  client,
  inputSchema,
  endpoint,
  execute: ({ endpoint }) => {
    if (endpoint.kind !== "success") return { ok: false, reason: endpoint.kind };
    return { ok: true, data: endpoint.body };
  },
});
```

## Retry strategy

Retry with bounded exponential backoff for transient fetch, RPC, 5xx, and rate-limit failures; preserve idempotency keys/request ids when the provider supports them.

**Do not directly retry:** configuration errors, invalid private keys, cap-exceeded failures, network-mismatch failures, unsupported payment requirements. For `settle_failed`, retry only when idempotent and provider state is clear enough to avoid duplicate payment or work.
