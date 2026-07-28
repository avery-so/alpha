---
"@averyso/alpha": minor
---

Stop signing an unused payment challenge on paid Alipay requests. The inbound runtime previously built and RSA-signed a `Payment-Needed` header on every request, including ones that already carried a valid `Payment-Proof` and never needed it. Signing is now deferred to the branches that actually return 402.

Bills are still validated on every request, so a malformed bill keeps failing with `AlipayAIPayConfigError` whether or not a proof was sent. The check is exposed as `AlipayAIPayClient.assertBill()` for callers that want to validate a bill without paying for a signature.
