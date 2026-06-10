import { defineConfig } from "vitepress";

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
    items: [{ text: "Getting Started", link: "/guide/getting-started" }],
  },
  {
    text: "Tutorial",
    items: [{ text: "Build an x402 AI Tool", link: "/tutorial/x402-ai-tool" }],
  },
  {
    text: "API Reference",
    items: [{ text: "SDK API", link: "/api/sdk" }],
  },
];

const zhSidebar = [
  {
    text: "指南",
    items: [{ text: "快速开始", link: "/zh/guide/getting-started" }],
  },
  {
    text: "教程",
    items: [{ text: "构建 x402 AI 工具", link: "/zh/tutorial/x402-ai-tool" }],
  },
  {
    text: "API 参考",
    items: [{ text: "SDK API", link: "/zh/api/sdk" }],
  },
];

export default defineConfig({
  title: "Alpha",
  description: "Node-only TypeScript SDK for Alpha.",
  cleanUrls: true,
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: rootNav,
        sidebar: rootSidebar,
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
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
