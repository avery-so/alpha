import { defineConfig } from "tsdown";

export default defineConfig({
  attw: {
    level: "error",
  },
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  hash: false,
  outDir: "dist",
  publint: true,
  sourcemap: true,
  target: "node20",
});
