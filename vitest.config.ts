import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` -> `src/*` paths of tsconfig.json so tests can import application
    // modules that use it (TASK-005: `src/middleware.ts` imports `@/lib/logger`).
    alias: {
      "@/": `${fileURLToPath(new URL("./src", import.meta.url))}/`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
