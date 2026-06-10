import { defineConfig } from "vitepress";

const rootNav = [
  { text: "Guide", link: "/guide/concepts" },
  { text: "Tutorial", link: "/tutorial/x402-ai-tool" },
  { text: "API Reference", link: "/api/sdk" },
  { text: "Releases", link: "/releases/" },
];

const zhNav = [
  { text: "指南", link: "/zh/guide/concepts" },
  { text: "教程", link: "/zh/tutorial/x402-ai-tool" },
  { text: "API 参考", link: "/zh/api/sdk" },
  { text: "发布", link: "/zh/releases/" },
];

const rootSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Concepts", link: "/guide/concepts" },
      { text: "Getting Started", link: "/guide/getting-started" },
      { text: "Wallets and Networks", link: "/guide/wallets-and-networks" },
      { text: "Error Handling", link: "/guide/error-handling" },
      { text: "Production", link: "/guide/production" },
      { text: "Agent Spend Controls", link: "/guide/agent-spend-controls" },
      { text: "Observability", link: "/guide/observability" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" },
    ],
  },
  {
    text: "Tutorial",
    items: [
      { text: "Build an Agent Payment Tool", link: "/tutorial/x402-ai-tool" },
    ],
  },
  {
    text: "API Reference",
    items: [{ text: "SDK API", link: "/api/sdk" }],
  },
];

const zhSidebar = [
  {
    text: "指南",
    items: [
      { text: "核心概念", link: "/zh/guide/concepts" },
      { text: "快速开始", link: "/zh/guide/getting-started" },
      { text: "钱包与网络", link: "/zh/guide/wallets-and-networks" },
      { text: "错误处理", link: "/zh/guide/error-handling" },
      { text: "生产部署", link: "/zh/guide/production" },
    ],
  },
  {
    text: "教程",
    items: [{ text: "构建 Agent 支付工具", link: "/zh/tutorial/x402-ai-tool" }],
  },
  {
    text: "API 参考",
    items: [{ text: "SDK API", link: "/zh/api/sdk" }],
  },
];

export default defineConfig({
  title: "Avery SDK",
  description: "Agent Payment SDK for the AI Agent era.",
  cleanUrls: true,
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      description: "Agent Payment SDK for the AI Agent era.",
      themeConfig: {
        nav: rootNav,
        sidebar: rootSidebar,
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      description: "AI Agent 时代的 Agent 支付 SDK。",
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
      },
    },
  },
  themeConfig: {
    nav: rootNav,
    sidebar: rootSidebar,
    socialLinks: [],
  },
});
