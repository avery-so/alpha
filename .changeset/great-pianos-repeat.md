---
"@averyso/alpha": patch
---

Raise the `@hono/node-server` override to 2.0.12. The previous bump targeted 2.0.5, the patched version named by the advisory covering the 1.x line, but a separate advisory covers `>= 2.0.0, <= 2.0.9` — so 2.0.5 landed back inside a vulnerable range. This is a development and example dependency; it does not reach the published package.
