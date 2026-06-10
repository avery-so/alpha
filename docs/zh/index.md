---
layout: home

hero:
  name: Alpha
  text: AI Agent 时代最好用的 Agent 支付 SDK
  tagline: 将付费 x402 端点变成安全、带上限、可由模型调用的服务端 Agent 工具。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: x402 AI 工具
      link: /zh/tutorial/x402-ai-tool
    - theme: alt
      text: API 参考
      link: /zh/api/sdk

features:
  - title: Agent-native tools
    details: 使用 x402tool() 将付费端点包装成兼容 Vercel AI SDK、可由模型调用的工具。
  - title: x402 pay-per-request access
    details: 使用 X402Client 为受 x402 保护的 HTTP 资源签名、支付并重试请求。
  - title: Payment caps
    details: 通过 client、call 或 tool 层的 maxAmount 控制 Agent 的单次支付上限。
  - title: Multi-network credentials
    details: 将 EVM 和 Solana 私钥、RPC URL 与支付签名流程保留在服务端。
---
