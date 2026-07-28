---
"@averyso/alpha": patch
---

Warn when an `AlipayAIPayClient` is constructed without `alipayPublicKey`. Gateway response signatures are not verified in that configuration, so the client now surfaces it at `warn` level instead of failing silently.
