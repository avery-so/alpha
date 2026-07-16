// eslint-disable-next-line import/no-nodejs-modules -- VitePress config runs in Node.js.
import { deflateRawSync } from "node:zlib";
import { defineConfig } from "vitepress";
// eslint-disable-next-line no-duplicate-imports -- Type-only imports stay separate under verbatimModuleSyntax.
import type { MarkdownOptions } from "vitepress";
import createAnalyticsHeadEntries from "./analytics";

type MarkdownIt = Parameters<NonNullable<MarkdownOptions["config"]>>[0];

const sixBitMask = 63;
const highNibbleMask = 15;
const twoBitMask = 3;

const plantUmlAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

const encodePlantUml6Bit = (value: number): string => plantUmlAlphabet[value & sixBitMask] ?? "";

const encodePlantUml3Bytes = (byte1: number, byte2: number, byte3: number) => {
  const char1 = byte1 >> 2;
  const char2 = ((byte1 & twoBitMask) << 4) | (byte2 >> 4);
  const char3 = ((byte2 & highNibbleMask) << 2) | (byte3 >> 6);
  const char4 = byte3 & sixBitMask;

  return (
    encodePlantUml6Bit(char1) +
    encodePlantUml6Bit(char2) +
    encodePlantUml6Bit(char3) +
    encodePlantUml6Bit(char4)
  );
};

const encodePlantUmlSource = (source: string) => {
  const compressed = deflateRawSync(source);
  let encoded = "";

  for (let index = 0; index < compressed.length; index += 3) {
    encoded += encodePlantUml3Bytes(
      compressed[index] ?? 0,
      compressed[index + 1] ?? 0,
      compressed[index + 2] ?? 0,
    );
  }

  return encoded;
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const repositoryUrl = "https://github.com/avery-so/alpha";
const editLinkPattern = `${repositoryUrl}/edit/main/docs/:path`;

const usePlantUmlFence = (md: MarkdownIt) => {
  const defaultFenceRenderer = md.renderer.rules.fence;

  md.renderer.rules.fence = (...rendererArgs) => {
    const [tokens, idx] = rendererArgs;
    const token = tokens[idx];
    const info = token?.info.trim() ?? "";
    const language = info.split(/\s+/u, 1)[0]?.toLowerCase();

    if (!token || language !== "plantuml") {
      return defaultFenceRenderer?.(...rendererArgs) ?? "";
    }

    const encodedSource = encodePlantUmlSource(token.content);
    const alt = escapeHtmlAttribute(info || "plantuml diagram");

    return `<figure class="plantuml-diagram"><img src="https://www.plantuml.com/plantuml/svg/${encodedSource}" alt="${alt}" loading="lazy" decoding="async"></figure>\n`;
  };
};

const rootNav = [
  { text: "Guide", link: "/guide/getting-started" },
  { text: "Tutorial", link: "/tutorial/x402-ai-tool" },
  { text: "API Reference", link: "/api/sdk" },
  { text: "Releases", link: "/releases/" },
];

const zhNav = [
  { text: "指南", link: "/zh/guide/getting-started" },
  { text: "教程", link: "/zh/tutorial/x402-ai-tool" },
  { text: "API 参考", link: "/zh/api/sdk" },
  { text: "发布", link: "/zh/releases/" },
];

const rootSidebar = [
  {
    text: "Guide",
    items: [
      {
        text: "Start Here",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Concepts", link: "/guide/concepts" },
          { text: "Wallets and Networks", link: "/guide/wallets-and-networks" },
          { text: "Avery Developer Skill", link: "/guide/avery-developer-skill" },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "Payment Middleware", link: "/guide/payment-middleware" },
          { text: "Next.js App Router", link: "/guide/nextjs-app-router" },
          { text: "Mastra", link: "/guide/mastra" },
        ],
      },
      {
        text: "Operate",
        items: [
          { text: "Production", link: "/guide/production" },
          { text: "Agent Spend Controls", link: "/guide/agent-spend-controls" },
          { text: "Error Handling", link: "/guide/error-handling" },
          { text: "Observability", link: "/guide/observability" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
    ],
  },
  {
    text: "Tutorial",
    items: [
      { text: "Build an Agent Payment Tool", link: "/tutorial/x402-ai-tool" },
      { text: "Base Sepolia Payment Test", link: "/tutorial/base-sepolia-nextjs-payment-test" },
    ],
  },
  {
    text: "API Reference",
    items: [
      { text: "SDK API", link: "/api/sdk" },
      { text: "Middleware API", link: "/api/middleware" },
    ],
  },
];

const zhSidebar = [
  {
    text: "指南",
    items: [
      {
        text: "开始使用",
        items: [
          { text: "快速开始", link: "/zh/guide/getting-started" },
          { text: "核心概念", link: "/zh/guide/concepts" },
          { text: "钱包与网络", link: "/zh/guide/wallets-and-networks" },
          { text: "Avery Developer Skill", link: "/zh/guide/avery-developer-skill" },
        ],
      },
      {
        text: "集成",
        items: [
          { text: "支付 Middleware", link: "/zh/guide/payment-middleware" },
          { text: "Next.js App Router", link: "/zh/guide/nextjs-app-router" },
          { text: "Mastra", link: "/zh/guide/mastra" },
        ],
      },
      {
        text: "生产运维",
        items: [
          { text: "生产部署", link: "/zh/guide/production" },
          { text: "Agent Spend Controls", link: "/zh/guide/agent-spend-controls" },
          { text: "错误处理", link: "/zh/guide/error-handling" },
          { text: "可观测性与审计日志", link: "/zh/guide/observability" },
          { text: "故障排查", link: "/zh/guide/troubleshooting" },
        ],
      },
    ],
  },
  {
    text: "教程",
    items: [
      { text: "构建 Agent 支付工具", link: "/zh/tutorial/x402-ai-tool" },
      { text: "Base Sepolia 支付测试", link: "/zh/tutorial/base-sepolia-nextjs-payment-test" },
    ],
  },
  {
    text: "API 参考",
    items: [
      { text: "SDK API", link: "/zh/api/sdk" },
      { text: "Middleware API", link: "/zh/api/middleware" },
    ],
  },
];

export default defineConfig({
  title: "Avery SDK",
  description: "Agent Payment SDK for the AI Agent era.",
  cleanUrls: true,
  head: createAnalyticsHeadEntries(),
  markdown: {
    config(md) {
      usePlantUmlFence(md);
    },
  },
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      description: "Agent Payment SDK for the AI Agent era.",
      themeConfig: {
        nav: rootNav,
        sidebar: rootSidebar,
        editLink: {
          pattern: editLinkPattern,
          text: "Edit this page on GitHub",
        },
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
        editLink: {
          pattern: editLinkPattern,
          text: "在 GitHub 上编辑此页",
        },
      },
    },
  },
  themeConfig: {
    nav: rootNav,
    sidebar: rootSidebar,
    socialLinks: [{ icon: "github", link: repositoryUrl }],
  },
});
