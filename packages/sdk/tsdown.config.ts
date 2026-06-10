import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  hash: false,
  outDir: "dist",
  sourcemap: true,
  target: "node20",
});
