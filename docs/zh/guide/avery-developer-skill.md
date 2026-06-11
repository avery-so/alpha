# Avery Developer Skill 使用指南

`avery-developer` skill 用来帮助 AI coding agents 使用 Avery SDK 构建 x402
payment agents。它是给 coding agent 使用的开发期辅助说明，不是应用运行时依赖，
也不是部署后的应用需要 import 的包。

当你希望 AI coding agent 把一个 x402-protected endpoint 接入到 `X402Client` 或
`x402tool()`，并正确配置 network、wallet、spend limits 和服务端 secret 时，可以
使用这个 skill。

## 安装

使用 [skills CLI](https://www.skills.sh/docs) 安装：

```sh
npx skills add averyso/alpha --skill avery-developer
```

也可以指定要安装到的 agent：

```sh
npx skills add averyso/alpha --skill avery-developer -a claude-code
```

## 覆盖范围

这个 skill 会为 agent 提供 Avery SDK 相关的开发指导，包括：

- `X402Client` 和 `x402tool()`，也就是付费 x402 调用的主要入口。
- Network 和 wallet 配置，包括 `Base Sepolia` 这样的 friendly name，以及
  `X402Networks.baseSepolia` 这样的常量。
- 原子单位的 `maxAmount` cap 和服务端 spend controls。
- `EndpointResult` 分支处理和 error handling。
- Next.js App Router 示例，并确保支付签名保留在 Node.js runtime。

它不会新增 Avery account、API key、hosted service 或 facilitator 配置。Resource
server 控制自己的 settlement path；Avery SDK 只负责使用你配置的钱包完成
buyer-side x402 payment execution。

## 准备 Agent 上下文

让 agent 实现付费 tool 前，先准备好这些信息：

- x402-protected endpoint URL。
- 目标 network，例如 `Base Sepolia` 或 `X402Networks.baseSepolia`。
- 使用 endpoint asset 原子单位表示的 `maxAmount` 预算。
- 模型需要提供的 tool input schema。
- 服务端环境变量名称，例如 `X402_PRIVATE_KEY`、`X402_RPC_URL`。

不要把真实私钥、RPC secret、token 或本地 `.env` 内容粘进 prompt、文档、issue
或生成示例。只提供变量名称和预期格式。

## 启动 Prompt

```text
请使用 $avery-developer 帮我把 <endpoint> 接入成 Avery SDK x402 payment agent，网络是 <network>，maxAmount 是 <atomic-units>，并且只使用服务端环境变量。
```

Agent 生成代码后，在部署前检查 network、endpoint URL、`maxAmount`、server-only
module 边界和 `EndpointResult` 处理是否符合预期。
