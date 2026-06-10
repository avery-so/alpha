import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Alpha",
  description: "Node-only TypeScript SDK for Alpha.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/sdk" },
      { text: "Releases", link: "/releases/" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "SDK API", link: "/api/sdk" },
          { text: "Releases", link: "/releases/" },
        ],
      },
    ],
    socialLinks: [],
  },
});
