/**
 * The process's one search engine and `/api/health`'s two numbers (spec 045 §11; TASK-401):
 * reading the numbers never builds the index; after the first search they report it.
 */
import { describe, expect, it } from "vitest";

import {
  searchEngine,
  searchIndexStats,
} from "../../src/modules/search/index.ts";

describe("searchIndexStats", () => {
  it("reports no index, without building one, before the first search", () => {
    expect(searchIndexStats()).toEqual({
      ageSeconds: null,
      documents: 0,
      generation: 0,
    });
    expect(searchIndexStats().generation).toBe(0);
  });

  it("reports the built index after the first search, from the one shared engine", async () => {
    expect(searchEngine()).toBe(searchEngine());
    await searchEngine().search({ locale: "en", query: "roses", to: "pl" });
    const stats = searchIndexStats();
    expect(stats.generation).toBe(1);
    expect(stats.ageSeconds).toBe(0);
    expect(stats.documents).toBeGreaterThan(0);
    expect(stats.documents).toBe(searchEngine().stats().documents);
  });
});
