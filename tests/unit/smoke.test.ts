import { describe, expect, it } from "vitest";

// Baseline smoke test proving `pnpm test` runs Vitest in the node environment (spec 001, TASK-001).
describe("vitest baseline", () => {
  it("runs in the node environment", () => {
    expect(typeof process.version).toBe("string");
    expect(typeof window).toBe("undefined");
  });
});
