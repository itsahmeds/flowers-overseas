/**
 * `src/lib/cache.ts` (spec 001 §5.4, TASK-006): the seam exists, resolves and does nothing.
 * Specs 007/008 replace `cache` with the hosting adapter behind the same interface (plan/01 §3).
 */
import { describe, expect, it } from "vitest";

import { cache, homeCacheTag, noopCache } from "../../src/lib/cache";

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

describe("homeCacheTag (plan/01 §3, spec 003 §5.4, TASK-034)", () => {
  it("is the reserved `home:{locale}` shape, one entry per locale", () => {
    expect(homeCacheTag("en")).toBe("home:en");
    expect(homeCacheTag("en-gb")).toBe("home:en-gb");
    expect(homeCacheTag("pl")).toBe("home:pl");
  });

  it("keeps locales apart, so purging one cannot purge another", () => {
    const tags = ["en", "en-gb", "de", "pl"].map(homeCacheTag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("is accepted by the invalidation seam unchanged", async () => {
    await expect(
      noopCache.invalidate([homeCacheTag("de")]),
    ).resolves.toBeUndefined();
  });
});
