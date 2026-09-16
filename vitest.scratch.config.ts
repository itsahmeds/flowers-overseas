import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const alias = {
  "@/": `${fileURLToPath(new URL("./src", import.meta.url))}/`,
};
export default defineConfig({
  resolve: { alias },
  test: { environment: "node", include: ["/private/tmp/**/dump*.test.ts"] },
});
