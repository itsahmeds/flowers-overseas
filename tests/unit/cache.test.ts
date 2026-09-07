/**
 * `src/lib/cache.ts` (spec 001 §5.4, TASK-006): the seam exists, resolves and does nothing.
 * Specs 007/008 replace `cache` with the hosting adapter behind the same interface (plan/01 §3).
 */
import { describe, expect, it } from "vitest";

import { cache, noopCache } from "../../src/lib/cache";

describe("cache seam", () => {
  it("resolves for an empty tag list", async () => {
    await expect(noopCache.invalidate([])).resolves.toBeUndefined();
  });

  it("resolves for tags nobody serves yet", async () => {
    await expect(
      noopCache.invalidate(["catalog:pl", "occasion:birthday"]),
    ).resolves.toBeUndefined();
  });

  it("exports the no-op as the default adapter in spec 001", () => {
    expect(cache).toBe(noopCache);
  });
});
