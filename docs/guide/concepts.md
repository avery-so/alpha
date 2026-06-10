# Concepts

Avery SDK helps agents and applications call x402-protected HTTP endpoints without
putting payment signing logic in model prompts or browser code. The SDK keeps the
payment flow server-side, applies a payment cap, and returns a typed result that
shows how the request ended.

Read this page before setup if the phrase "x402-protected endpoint" is new to
you.

## Core Terms

An **endpoint request** is the HTTP request your agent tool or application wants
to make.

A **client / buyer** is the application or server-side agent tool that sends the
request, receives the `402 Payment Required` response, signs payment credentials,
and retries the request. Avery SDK runs in this role.

A **resource server / provider** is the x402-protected endpoint. It declares the
price and accepted payment requirements, verifies payment, settles payment, and
returns the protected resource.

A **facilitator** is an optional provider-side service that a resource server can
use to verify payment payloads and settle them on chain. It is part of the
provider's settlement path, not an Avery SDK client option.

A **payment requirement** is the payment option returned by an x402-protected
endpoint when it responds with `402 Payment Required`.

The **configured network** is the network selected on `X402Client`, such as a
built-in `X402Networks` entry or a supported CAIP-2 value.

`maxAmount` is the per-call payment ceiling expressed in the atomic unit required
by the endpoint payment requirement. The SDK will not complete a payment that
exceeds the effective `maxAmount` for the call.

## Payment Lifecycle

The normal x402 flow has two HTTP requests: the first discovers payment
requirements, and the second retries with signed payment credentials.

1. An agent tool or application makes an endpoint request through `x402tool()` or
   `X402Client.call()`.
2. The endpoint returns `402 Payment Required` with payment requirements.
3. The SDK filters the requirements and selects one compatible with the
   configured network and the effective `maxAmount`.
4. The SDK signs payment credentials on the server and retries the request with
   payment.
5. The endpoint verifies and settles the payment locally or through its
   configured facilitator, then returns the paid response or reports a
   settlement failure.
6. The SDK returns an `EndpointResult` so the application can handle the outcome.

If the first endpoint response is a normal non-`402` response, the SDK does not
pay. It returns that response as a passthrough result.

The SDK receives the final `PAYMENT-RESPONSE` returned by the endpoint. It does
not choose or configure the provider's settlement service.

## What Avery SDK Configures

Avery SDK configures the buyer side of an x402 call:

- Wallet or private key used to sign payment credentials.
- Network and optional RPC URL used by the payment scheme.
- `maxAmount` payment cap at the client, direct call, or tool level.
- Custom `fetch`, logger, and log level.

Avery SDK does not configure the provider's facilitator, accepted assets,
payment scheme, endpoint pricing, or resource-server middleware. There is no
`facilitator` option in `X402ClientOptions` by design for buyer-side calls.

## Payment Selection

Payment selection is intentionally conservative. A requirement must match the
configured network and fit within `maxAmount`. This keeps agent-triggered
requests bounded by the budget you configured at the client, call, or tool level.

If no compatible requirement is available, Avery SDK returns `payment_required`
instead of signing credentials or retrying with payment. Common causes include a
network mismatch, an unsupported requirement, or a required amount above the
configured cap.

## `EndpointResult.kind`

`EndpointResult.kind` describes where the lifecycle stopped:

- `success`: The paid request settled and the endpoint returned the paid
  response.
- `settle_failed`: The endpoint responded, but settlement was reported as failed.
- `payment_required`: The endpoint required payment, but the SDK could not
  complete a compatible payment, such as when the network mismatched or the cap
  was exceeded.
- `passthrough`: The endpoint returned a normal non-`402` response, so the SDK
  did not pay.
- `error`: The request, SDK, signing, fetch, or x402 flow failed outside a normal
  endpoint result path.

Use `kind` as the first branch in application code. The full TypeScript shape of
each result variant is documented in the
[SDK API Reference](/api/sdk#endpointresult). For operational handling,
user-facing messages, and retry guidance, see
[Error Handling](/guide/error-handling).

## Security Boundary

Payment signing should stay on the server. Keep private keys, RPC URLs, and
`X402Client` construction out of browsers and client-side bundles. Agent tools
should expose only the structured inputs a model is allowed to provide; the
server owns endpoint selection, payment caps, credentials, and request signing.
