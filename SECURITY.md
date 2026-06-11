# Security Policy

## Supported Versions

Security fixes are provided for the latest published `@averyso/alpha` release
line and the current `main` branch for unreleased fixes.

Older release lines may receive fixes at the maintainers' discretion when the
risk, exploitability, and upgrade path justify it.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through one of these channels:

- Email `sec@avery.so`.
- Open a GitHub private security advisory for this repository.

Do not open a public issue, pull request, discussion, or social post for an
uncoordinated vulnerability report. We aim to provide an initial response
within 7 days. If the report is valid, we will coordinate impact assessment,
fix development, release timing, and public disclosure with the reporter.

## Scope

Security-sensitive areas include:

- payment signing and payment authorization logic;
- private key handling for EVM and Solana wallets;
- RPC URL handling and request routing;
- x402 payment discovery, settlement, retry, and response handling;
- agent tools, including Vercel AI SDK and Mastra integrations;
- abuse paths where an agent tool could trigger unintended paid requests,
  bypass `maxAmount`, leak credentials, or expose payment payloads.

## Disclosure Guidelines

Before coordinated disclosure, do not publicly share:

- vulnerability details or proof-of-concept exploit steps;
- private keys, seed material, RPC credentials, OAuth tokens, or local private
  configuration;
- payment payloads, signed authorizations, settlement responses, or facilitator
  credentials;
- agent-tool prompts, schemas, inputs, or traces that demonstrate an abuse
  path.

If you discover leaked credentials in this repository or in an example derived
from it, report them privately and rotate the affected credentials immediately.
Security issues should be handled through this policy, not through regular
support channels.
