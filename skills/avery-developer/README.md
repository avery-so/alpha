# avery-developer skill

An agent skill that teaches AI coding agents to build and monetize paid HTTP APIs with the **Avery SDK** (`@averyso/alpha`) — across three payment rails and both directions: paying for x402 endpoints from an agent, and charging for your own routes with x402, Alipay AI Pay (支付宝 AI 按量付费), or WeiXin AI Pay (微信 AI 支付).

## Install

With the [skills CLI](https://www.skills.sh):

```sh
# from this repo
npx skills add averyso/alpha --skill avery-developer

# or target a specific agent
npx skills add averyso/alpha --skill avery-developer -a claude-code
```

## What it covers

**Outbound — you pay**

- `X402Client` and `x402tool()` / `x402MastraTool()` for Vercel AI SDK and Mastra agents
- Network selection, wallets/keys, and atomic-unit `maxAmount` caps
- `EndpointResult` handling and retry strategy
- WeiXin AI Pay preorders with SM2-with-SM3 signing

**Inbound — you get paid**

- `createAlphaPayment()` runtimes and the provider × direction capability matrix
- Express, Hono, and Next.js App Router adapters (middleware and wrapper forms)
- Alipay AI Pay: bill signing, `Payment-Needed`/`Payment-Proof`, verification, fulfillment confirmation, replay protection

**Across both**

- Server-side spend controls: budget ledgers, loop limits, approvals, prompt-injection defenses
- Testing without touching a real network, and what must never reach logs or model context

## Layout

```
avery-developer/
├── SKILL.md                      # path router + core workflow (loaded on trigger)
└── references/                   # loaded on demand
    ├── api.md                    # x402 client/tool API surface
    ├── networks.md               # network table, wallets, atomic units
    ├── spend-controls.md         # production spend safety
    ├── error-handling.md         # result kinds + retry strategy
    ├── payment-middleware.md     # createAlphaPayment + framework adapters
    ├── alipay.md                 # Alipay AI Pay, end to end
    ├── weixin.md                 # WeiXin AI Pay preorder signing
    ├── mastra.md                 # Mastra tool adapter
    ├── nextjs.md                 # Next.js App Router quickstart
    └── testing.md                # test seams, fakes, and leak assertions
```

The skill is self-contained — it does not depend on this repo's `docs/` and works when installed into any project.
