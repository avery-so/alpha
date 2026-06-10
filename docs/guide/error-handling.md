# Error Handling

Alpha returns an `EndpointResult` by default. Branch on `result.kind` first, then
use `status`, `metadata`, `paymentResponse`, and error details to decide what to
show the user and what to log for operators.

## Result Kinds

| `kind` | Meaning | Common Causes | User Message | Developer Action | Retry? |
|---|---|---|---|---|---|
| `success` | Payment settled and the paid response was returned. | Normal paid access. | Show the paid result. | Record the endpoint, status, and redacted payment response if needed for audit. | No retry needed. |
| `payment_required` | The endpoint required payment, but Alpha did not complete a compatible payment. | Network mismatch, amount over `maxAmount`, unsupported or incompatible requirements, insufficient balance, wrong asset. | Ask the user to adjust payment setup or try a lower-cost request. | Inspect endpoint requirements, configured network, asset, wallet balance, and cap. | Do not retry with the same configuration. |
| `settle_failed` | The endpoint responded after payment handling, but settlement was reported as failed. | Facilitator or chain settlement failure, expired payment, provider issue, endpoint settlement rejection. | Tell the user the payment could not be confirmed and to retry later or contact support. | Log `paymentResponse`, endpoint, status, and a request id if available. Check provider state before replaying. | Only for idempotent requests and only when provider state is clear. |
| `error` | The request, SDK, signing, fetch, RPC, endpoint, or x402 flow failed outside a normal endpoint result path. | Invalid config, signing failure, fetch failure, RPC error, endpoint 5xx, malformed x402 response. | Show a generic failure message with a support reference. | Use `X402PaymentError.status`, `details.cause`, `result.metadata`, and server logs. | Retry only transient network, RPC, rate-limit, or 5xx failures. |
| `passthrough` | The endpoint returned a non-`402` response, so Alpha did not pay. | Free endpoint, wrong URL, test environment without x402, middleware order issue, provider configuration issue. | Show the response if free access is expected. | If payment was expected, verify URL, environment, middleware order, and provider config. | No payment retry; fix routing or configuration first. |

## `payment_required`

`payment_required` is not a transient payment attempt. Alpha stopped before
signing and retrying because it could not select a compatible requirement within
the configured policy.

Common fixes:

- Set the client network to the network advertised by the endpoint.
- Fund the wallet with the required asset on the required network.
- Raise `maxAmount` only after reviewing the endpoint price as a real spend
  limit.
- Use an endpoint or provider that supports the network and token you intend to
  pay with.

Blindly retrying the same request with the same wallet, network, and cap should
produce the same result.

## `settle_failed`

Do not treat `settle_failed` as successful access. Also do not assume it proves
that no funds moved. Settlement status depends on the provider, facilitator,
network, and payment response.

For user-facing flows, report that payment confirmation failed and ask the user
to try again later or contact the provider. For developer logs, capture:

- `result.paymentResponse`
- `result.metadata.url`
- `result.metadata.status`
- The endpoint or tool name
- Your internal request id

Retry only if the endpoint operation is idempotent and you have enough provider
state to avoid duplicate side effects.

## `error`

Use the error path to separate configuration problems from transient runtime
failures.

Configuration and signing failures are usually not retryable:

- Invalid private key format.
- Unsupported network input.
- Missing `fetch`.
- Incorrect Solana secret key encoding.

Runtime failures may be retryable with backoff:

- Temporary fetch failures.
- RPC timeouts or rate limits.
- Endpoint 5xx responses.
- Temporary facilitator errors.

With `throwOnError: true`, failed paid endpoint results throw
`X402PaymentError`. The thrown error includes `status` and optional `details`.
When Alpha normalizes an unexpected failure, `details.cause` contains the
original error.

## `passthrough`

`passthrough` is normal for endpoints that are free, public, or conditionally
unlocked. It means no payment was made.

If you expected a paid x402 flow, check:

- The endpoint URL and method.
- Whether you are calling the test or production environment you intended.
- Whether x402 middleware is installed before the route handler that returns
  content.
- Whether the provider or facilitator is enabled for that endpoint.
- Whether another auth layer returned a response before x402 ran.

## `throwOnError`

Use `throwOnError: true` in route handlers or server-side services when you want
one centralized exception path:

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

For agent tool execution, prefer the default `EndpointResult` flow and use
`execute` to return model-friendly output. That keeps raw errors, payment
payloads, headers, and provider details out of the model context.

```ts
x402tool({
  client,
  inputSchema,
  endpoint,
  execute: ({ endpoint }) => {
    if (endpoint.kind !== "success") {
      return {
        ok: false,
        reason: endpoint.kind,
      };
    }

    return {
      ok: true,
      data: endpoint.body,
    };
  },
});
```

## Retry Strategy

Retry with bounded exponential backoff for transient fetch, RPC, 5xx, and rate
limit failures. Preserve idempotency keys or request ids when the provider
supports them.

Do not directly retry:

- Configuration errors.
- Invalid private keys.
- Cap exceeded failures.
- Network mismatch failures.
- Unsupported payment requirements.

For `settle_failed`, retry only when the request is idempotent and the provider
state is clear enough to avoid duplicate payment or duplicate work.

For the exact result union and error classes, see the
[SDK API Reference](/api/sdk#endpointresult).
