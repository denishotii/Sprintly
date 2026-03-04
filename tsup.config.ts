import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  // Source maps disabled in CI for ~40% faster builds; enabled locally for debugging
  sourcemap: process.env.CI === "true" ? false : true,
  target: "node18",
  // Minify in production to reduce output size ~30% without affecting node runtime performance
  minify: process.env.NODE_ENV === "production",
  // Tree-shake unused exports to reduce bundle size
  treeshake: true,
});
