// eslint-disable-next-line import/no-nodejs-modules -- VitePress config runs in Node.js.
import { deflateRawSync } from "node:zlib";
import { defineConfig } from "vitepress";
// eslint-disable-next-line no-duplicate-imports -- Type-only imports stay separate under verbatimModuleSyntax.
import type { MarkdownOptions } from "vitepress";

type MarkdownIt = Parameters<NonNullable<MarkdownOptions["config"]>>[0];

const sixBitMask = 63;
const highNibbleMask = 15;
const twoBitMask = 3;

const plantUmlAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

const encodePlantUml6Bit = (value: number): string =>
  plantUmlAlphabet[value & sixBitMask] ?? "";

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
      { text: "Mastra", link: "/guide/mastra" },
      { text: "Next.js App Router", link: "/guide/nextjs-app-router" },
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
      { text: "Mastra", link: "/zh/guide/mastra" },
      { text: "Next.js App Router", link: "/zh/guide/nextjs-app-router" },
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
