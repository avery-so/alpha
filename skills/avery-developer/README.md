# avery-developer skill

An agent skill that teaches AI coding agents to build x402 payment agents with the **Avery SDK** (`@averyso/alpha`) — creating a paid tool, configuring networks and wallets, enforcing spend controls, handling payment results, and integrating with Next.js.

## Install

With the [skills CLI](https://www.skills.sh):

```sh
# from this repo
npx skills add averyso/alpha --skill avery-developer

# or target a specific agent
npx skills add averyso/alpha --skill avery-developer -a claude-code
```

## What it covers

- `X402Client` and `x402tool()` — the two entry points for paid x402 calls
- Network selection, wallets/keys, and atomic-unit `maxAmount` caps
- Server-side spend controls: budget ledgers, loop limits, approvals, prompt-injection defenses
- `EndpointResult` handling and retry strategy
- A complete Next.js App Router streaming-chat example

## Layout

```
avery-developer/
├── SKILL.md                      # core workflow + mental model (loaded on trigger)
└── references/                   # loaded on demand
    ├── api.md                    # full API surface
    ├── networks.md               # network table, wallets, atomic units
    ├── spend-controls.md         # production spend safety
    ├── error-handling.md         # result kinds + retry strategy
    └── nextjs.md                 # Next.js App Router quickstart
```

The skill is self-contained — it does not depend on this repo's `docs/` and works when installed into any project.
