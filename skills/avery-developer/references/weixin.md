# WeiXin AI Pay (微信 AI 支付)

The SDK implements the **developer/payer side** of WeiXin AI Pay: it takes an upstream `payment_required` challenge, signs a preorder with **SM2-with-SM3**, posts it to the WeiXin preorder endpoint, and returns a `paymentCode`. There is no seller-side (inbound) WeiXin support — `direction: "inbound"` with `provider: "weixin"` throws `AlphaPaymentConfigError`.

Unlike x402's non-throwing result union, this client **throws on every failure**. Wrap calls in `try`/`catch`.

## Credentials and options

```ts
import { WeiXinAIPayClient } from "@averyso/alpha";

const client = new WeiXinAIPayClient({
  developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
  publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
  privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
});
```

| Option                | Required | Notes                                                      |
| --------------------- | -------- | ---------------------------------------------------------- |
| `developerId`         | yes      | Your WeiXin developer id → `developer_id`                  |
| `publicKeyId`         | yes      | Id of the registered public key → `pub_key_id`             |
| `privateKey`          | yes      | **SM2 private key as 32-byte hex**, `0x` prefix optional   |
| `developerPlatform`   | no       | Defaults to `"WXPAY"`                                      |
| `endpoint`            | no       | Defaults to the constant `WEIXIN_AI_PAY_PREORDER_ENDPOINT` |
| `signatureEncoding`   | no       | `"der"` (default) or `"raw"`                               |
| `fetch`               | no       | Injected `fetch` — see `testing.md`                        |
| `logLevel` / `logger` | no       | Defaults to `info`                                         |

### Private key format — the most common failure

`privateKey` must match `/^(?:0x)?[0-9a-fA-F]{64}$/`. It is normalized to lowercase without the `0x` prefix.

A **PEM block, a base64 string, or a DER file will be rejected** with `WeiXinAIPayConfigError: WeiXinAI Pay privateKey must be a 32-byte hex string with an optional 0x prefix.` This is an SM2 scalar, not an RSA/PKCS#8 key — do not reuse the Alipay key handling here. If you hold the key in another encoding, convert it to raw hex before passing it in.

## Making a preorder

```ts
const { paymentCode, rawResponse } = await client.preorder(paymentRequired);
```

`paymentRequired` is **the payload from the upstream 402 challenge, forwarded unchanged**. The SDK JSON-serializes and Base64-encodes it, then signs it — it does not author or validate the contents. Its type is `unknown` precisely because the shape is defined by whoever issued the challenge:

```ts
// what an upstream challenge might look like — you pass it through, you don't build it
const paymentRequired = {
  appid: "wx-miniapp",
  mchid: "1900000109",
  out_trade_no: "order-1001",
  description: "Alpha preorder",
  amount: { total: 100, currency: "CNY" }, // total is in FEN (整数分), not yuan
};
```

Amounts inside that payload follow WeiXin's convention — **integer fen**, so `100` means ¥1.00. This differs from Alipay's decimal yuan string (`"0.01"`) and x402's `bigint` atomic units. Don't carry a convention across rails.

Per-call overrides:

```ts
await client.preorder(paymentRequired, {
  signal: controller.signal, // abort
  endpoint: stagingEndpoint, // override the endpoint for one call
  developerPlatform: "WXPAY",
  timestamp: "1735689600", // pin for reproducible tests
  nonceStr: "abcdef0123456789abcdef0123456789",
  signatureEncoding: "raw",
});
```

`timestamp` and `nonceStr` default to a fresh Unix-seconds string and 16 random bytes as lowercase hex. Only pin them in tests.

### Result

```ts
interface WeiXinAIPayPreorderResult {
  paymentCode: string; // the value you forward upstream
  rawResponse: { payment_code: string; [key: string]: unknown };
}
```

A `2xx` response without a non-empty `payment_code` is treated as a failure, not as a partial success.

## Signing (what happens inside)

Signature type is the constant `WEIXINAIPAY-SM2-WITH-SM3`. The steps:

1. `payment_required` = **standard Base64** (with padding) of the JSON payload. Note this differs from Alipay's Base64URL-without-padding headers.
2. Build the sign string — three values, each followed by `\n`, **including a trailing newline**:

   ```
   {timestamp}\n{nonceStr}\n{payment_required}\n
   ```

3. **SM3** digest of the sign string's UTF-8 bytes.
4. **SM2** signature over that digest (`hash: false`, because it is already digested).
5. `signature` = Base64 of the signature bytes.

The posted body:

```json
{
  "signature_type": "WEIXINAIPAY-SM2-WITH-SM3",
  "developer_platform": "WXPAY",
  "developer_id": "...",
  "pub_key_id": "...",
  "nonce_str": "...",
  "timestamp": "...",
  "signature": "...",
  "payment_required": "..."
}
```

Posted as `POST` with `Content-Type: application/json`.

### `signatureEncoding`: `"der"` vs `"raw"`

- **`"der"` (default)** — ASN.1 DER-encoded `(r, s)`, variable length.
- **`"raw"`** — the plain 64-byte `r || s` concatenation.

Both are then Base64-encoded. If the platform rejects an otherwise-correct signature, this is the first thing to flip. Anything other than these two values throws `WeiXinAIPayConfigError`.

### Standalone helpers

Exported for debugging or for building the request without sending it:

```ts
import {
  encodeWeiXinAIPaymentRequired, // payload  -> Base64 string
  signWeiXinAIPayPreorder, // {timestamp, nonceStr, paymentRequired} -> Base64 signature
  buildWeiXinAIPayPreorderRequest, // payload + options -> the full request body
} from "@averyso/alpha";
```

Use `buildWeiXinAIPayPreorderRequest` to diff your body against a working reference (e.g. the official example) without making a network call.

## Using it through the middleware runtime

A WeiXin runtime is **outbound only** — it injects a ready client into handlers rather than protecting a route:

```ts
import { createAlphaPayment } from "@averyso/alpha";
import { alphaHonoMiddleware, getAlphaPaymentContext } from "@averyso/alpha/hono";

const payment = createAlphaPayment({
  provider: "weixin",
  direction: "outbound",
  client: {
    developerId: process.env.WEIXIN_AI_DEVELOPER_ID!,
    publicKeyId: process.env.WEIXIN_AI_PUBLIC_KEY_ID!,
    privateKey: process.env.WEIXIN_AI_SM2_PRIVATE_KEY!,
  },
});

app.use(alphaHonoMiddleware(payment));

app.post("/pay", async (c) => {
  const context = getAlphaPaymentContext(c);

  if (context.provider !== "weixin" || context.direction !== "outbound") {
    throw new Error("unexpected payment context");
  }

  const { paymentCode } = await context.client.preorder(await c.req.json());
  return c.json({ paymentCode });
});
```

The context exposes only `client` — never the private key, the generated signature, or the raw response. Passing `network` to a weixin config is a configuration error (it is x402-only).

## Errors

All extend `WeiXinAIPayError` and carry optional `details`:

| Class                      | When                                                                                         | Action                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `WeiXinAIPayConfigError`   | Bad key format, missing `developerId`/`publicKeyId`, invalid `signatureEncoding`, no `fetch` | Fix config; never retry.                                  |
| `WeiXinAIPayRequestError`  | Transport failure, or a `payment_required` payload that isn't JSON-serializable              | Retry transport failures with backoff.                    |
| `WeiXinAIPayResponseError` | Non-2xx, empty body, non-JSON body, or missing `payment_code`. Has `.status`.                | Inspect `details.body`; 5xx may be retryable, 4xx is not. |

```ts
import { WeiXinAIPayConfigError, WeiXinAIPayResponseError } from "@averyso/alpha";

try {
  const { paymentCode } = await client.preorder(paymentRequired);
} catch (error) {
  if (error instanceof WeiXinAIPayConfigError) {
    throw error; // deployment bug — fail loudly
  }
  if (error instanceof WeiXinAIPayResponseError && error.status >= 500) {
    return retryLater(); // upstream trouble
  }
  throw error;
}
```

A circular reference in `paymentRequired` surfaces as `WeiXinAIPayRequestError` from `JSON.stringify`, so don't hand it live objects with parent links.

## Observability

`debug` logs endpoint, developer id, public key id, platform, timestamp, nonce, signature encoding, and the **length** of `payment_required` — never its content, and never the signature or key. `info` logs completion with status and payment-code length. Keep the same discipline in your own logging.

## Checklist

- [ ] `privateKey` is 32-byte hex, not PEM/base64/DER.
- [ ] `paymentRequired` is forwarded from the upstream challenge, not hand-built.
- [ ] Amounts inside it are integer **fen**.
- [ ] Every `preorder()` call is inside `try`/`catch` — this client throws.
- [ ] `timestamp`/`nonceStr` are left to the SDK outside of tests.
- [ ] `signatureEncoding` is only changed if the platform rejects the default DER.
- [ ] Keys stay in env vars, server-side; Node runtime in Next.js.
