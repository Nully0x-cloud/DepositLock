import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": src },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Next.js never picks these up; they live beside their source modules.
    exclude: ["node_modules", ".next"],
  },
});
