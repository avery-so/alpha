import { defineConfig } from "tsdown";

export default defineConfig({
  attw: true,
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  hash: false,
  outDir: "dist",
  publint: true,
  sourcemap: true,
  target: "node20",
});
