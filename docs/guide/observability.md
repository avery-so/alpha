# Observability and Audit Logging

Production payment agents need two kinds of visibility:

- Diagnostic logs for SDK and runtime troubleshooting.
- Application audit events for spend decisions, approvals, paid attempts, and
  user-visible outcomes.

Alpha's `Logger` interface is diagnostic. It is useful for SDK-level messages,
but it is not a complete audit trail. Build your audit trail around the
application decision points before and after every paid call.

## Diagnostic Logger

Pass `logger` and `logLevel` to `X402ClientOptions` when you want Alpha's
internal diagnostic messages to use your logging system.

```ts
const client = new X402Client(process.env.X402_PRIVATE_KEY!, {
  network: X402Networks.baseSepolia,
  rpcUrl: process.env.X402_RPC_URL,
  logLevel: process.env.X402_LOG_LEVEL === "debug" ? "debug" : "info",
  logger,
});
```

The logger shape is:

```ts
interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
```

Use `info` in production by default, `debug` only during focused
investigations, and `silent` only when another layer captures all necessary
diagnostics.

## Logger Adapters

The built-in `console` object already matches the interface:

```ts
const client = new X402Client(privateKey, {
  network,
  logger: console,
});
```

For `pino`, adapt Alpha's `(message, details)` call shape explicitly. Pino's
common structured logging style usually accepts the object first and the message
second.

```ts
import pino from "pino";

const pinoLogger = pino();

const logger = {
  debug: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.debug(details ?? {}, message),
  info: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.info(details ?? {}, message),
  warn: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.warn(details ?? {}, message),
  error: (message: string, details?: Record<string, unknown>) =>
    pinoLogger.error(details ?? {}, message),
};
```

For `winston`, pass the message and spread details as metadata:

```ts
import winston from "winston";

const winstonLogger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

const logger = {
  debug: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.debug(message, details ?? {}),
  info: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.info(message, details ?? {}),
  warn: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.warn(message, details ?? {}),
  error: (message: string, details?: Record<string, unknown>) =>
    winstonLogger.error(message, details ?? {}),
};
```

## Audit Events

Emit application audit events around paid calls. A useful sequence is:

- `payment_tool_requested`: the model or app requested paid execution.
- `payment_budget_reserved`: the app reserved budget for the cap.
- `payment_approval_requested`: the app asked for authorization.
- `payment_approval_recorded`: a user or policy approved or denied execution.
- `payment_call_started`: the server started the Alpha request.
- `payment_call_finished`: the server received an `EndpointResult`.
- `payment_budget_committed` or `payment_budget_refunded`: the ledger resolved
  the reservation.

These events should be emitted by your application because they include user,
conversation, budget, and approval context that Alpha does not know.

## Recommended Fields

Capture enough fields to reconstruct what happened without storing secrets:

- `eventName` and `timestamp`.
- `requestId`, trace id, or span id.
- `toolName`.
- `userId`, `sessionId`, and `conversationId`.
- AI SDK `toolCallId`.
- Endpoint host, path, method, and environment.
- Network and asset identifier when available.
- Amount cap in atomic units.
- Budget reservation id and budget scope.
- Approval decision, approver id, authorization scope, and expiry.
- `EndpointResult.kind`, `ok`, `paid`, HTTP status, and latency.
- Redacted `paymentResponse` summary for success and settlement failures.
- Error class, error message, retry classification, and redacted cause summary.

For high-volume systems, keep hot-path logs compact and write the full audit
record to a durable store with retention controls.

## Redaction

Never log:

- Private keys, seed phrases, or Solana secret keys.
- Full wallet signatures, signed authorization payloads, or payment payloads.
- `X-PAYMENT` or `X-PAYMENT-RESPONSE` headers.
- Authorization cookies, bearer tokens, or session cookies.
- RPC URLs that contain API keys, account ids, or signed query strings.
- Sensitive request or response bodies.
- Raw provider responses that include signed payment data.

Usually safe after review:

- Network id.
- Endpoint host and path without sensitive query parameters.
- Shortened wallet addresses.
- Atomic-unit caps and budget reservation ids.
- `EndpointResult.kind`, `status`, `paid`, and latency.

When storing a `paymentResponse` summary, keep only the fields your support and
finance workflows need. Redact signatures and payloads by default.

```ts
function summarizePaymentResponse(paymentResponse: unknown) {
  if (paymentResponse === null || typeof paymentResponse !== "object") {
    return null;
  }

  return redactDeep(paymentResponse, [
    "signature",
    "authorization",
    "payload",
    "x-payment",
    "x-payment-response",
  ]);
}
```

## Tool Wrapper Pattern

Wrap paid tool execution so audit events and budget transitions happen even
when the tool fails.

```ts
async function executePaidTool<INPUT>(
  input: INPUT,
  options: X402ToolExecutionOptions,
) {
  const startedAt = performance.now();
  const reservation = await budgetLedger.reserve({
    userId,
    conversationId,
    toolName: "lookupReport",
    amountCap: 10_000n,
    network: client.network,
  });

  audit.info("payment_call_started", {
    requestId,
    toolName: "lookupReport",
    toolCallId: options.toolCallId,
    reservationId: reservation.id,
  });

  try {
    const result = await client.call(endpoint, init, {
      maxAmount: 10_000n,
      signal: options.abortSignal,
    });

    audit.info("payment_call_finished", {
      requestId,
      toolName: "lookupReport",
      toolCallId: options.toolCallId,
      reservationId: reservation.id,
      kind: result.kind,
      paid: result.paid,
      status: result.status,
      latencyMs: Math.round(performance.now() - startedAt),
      paymentResponse: summarizePaymentResponse(result.paymentResponse),
    });

    await budgetLedger.commit({
      reservationId: reservation.id,
      paid: result.paid,
      resultKind: result.kind,
    });

    return result;
  } catch (error) {
    await budgetLedger.refund({
      reservationId: reservation.id,
      reason: "tool_execution_failed",
    });

    audit.error("payment_call_failed", {
      requestId,
      toolName: "lookupReport",
      toolCallId: options.toolCallId,
      reservationId: reservation.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

## Dashboard and Alerts

Build dashboards that aggregate by:

- User, organization, session, and conversation.
- Tool and endpoint host.
- Day, hour, and deployment environment.
- Network and asset.
- Result kind, HTTP status, and retry classification.
- Approved, denied, paid, failed, and settlement-failed attempts.

Useful alerts include:

- Budget exhaustion or unusually fast budget burn.
- Hot wallet balance below the refill threshold.
- Repeated `payment_required` for the same network or endpoint.
- Spikes in `settle_failed`, RPC errors, 5xx responses, or latency.
- Repeated approval denials followed by similar tool attempts.
- Unexpected paid attempts from a new tool, endpoint, or environment.

For result interpretation and retry policy, see
[Error Handling](/guide/error-handling). For symptom-based operator fixes, see
[Troubleshooting](/guide/troubleshooting).
