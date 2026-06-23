# Avery Developer Skill

The `avery-developer` skill helps AI coding agents build x402 payment agents
with Avery SDK. It is a development-time guide for coding agents, not an
application runtime dependency and not a package your deployed app imports.

Use it when you want an AI coding agent to wire an x402-protected endpoint into
`X402Client` or `x402tool()` with the right network, wallet, spend limits, and
server-side secret handling.

## Install

Install it with the [skills CLI](https://www.skills.sh/docs):

```sh
npx skills add avery-so/alpha --skill avery-developer
```

To install it for a specific agent:

```sh
npx skills add avery-so/alpha --skill avery-developer -a claude-code
```

## What It Covers

The skill gives the agent focused Avery SDK guidance for:

- `X402Client` and `x402tool()`, the primary entry points for paid x402 calls.
- Network and wallet configuration, including friendly names such as
  `Base Sepolia` and constants such as `X402Networks.baseSepolia`.
- Atomic-unit `maxAmount` caps and server-side spend controls.
- `EndpointResult` branching and error handling.
- Next.js App Router examples that keep payment signing in the Node.js runtime.

It does not add an Avery account, API key, hosted service, or facilitator
configuration. The resource server controls its own settlement path; Avery SDK
handles buyer-side x402 payment execution from your configured wallet.

## Prepare Agent Context

Before asking the agent to implement a paid tool, collect the details it needs:

- The x402-protected endpoint URL.
- The target network, for example `Base Sepolia` or
  `X402Networks.baseSepolia`.
- The `maxAmount` budget in the endpoint asset's atomic units.
- The tool input schema the model should provide.
- The server-side environment variable names, such as `X402_PRIVATE_KEY` and
  `X402_RPC_URL`.

Do not paste real private keys, RPC secrets, tokens, or local `.env` contents
into prompts, docs, issues, or generated examples. Give the agent variable names
and expected formats only.

## Start With This Prompt

```text
Use $avery-developer to help me build an Avery SDK x402 payment agent for <endpoint>, on <network>, with maxAmount <atomic-units>, using server-side env vars only.
```

After the agent produces code, review the chosen network, endpoint URL,
`maxAmount`, server-only module boundaries, and `EndpointResult` handling before
deploying.
