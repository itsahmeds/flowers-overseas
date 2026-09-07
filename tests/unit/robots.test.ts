/**
 * `src/app/robots.ts` and the environment-level `X-Robots-Tag` (spec 001 §2, §6, AC-15,
 * TASK-006).
 */
import { describe, expect, it } from "vitest";

import robots from "../../src/app/robots";
import {
  ALL_PATHS,
  NOINDEX_HEADER_NAME,
  NOINDEX_HEADER_VALUE,
  noindexHeaderRules,
} from "../../src/lib/robots-headers";

describe("robots.txt (AC-15)", () => {
  it("disallows every path for every user agent", () => {
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", disallow: "/" }],
    });
  });

  it("serialises to a body containing `Disallow: /`", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    const body = list
      .map(
        (rule) =>
          `User-agent: ${String(rule.userAgent)}\nDisallow: ${String(rule.disallow)}`,
      )
      .join("\n");
    expect(body).toContain("Disallow: /");
  });

  it("allows nothing and adds no sitemap (spec 007 owns both)", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.every((rule) => rule.allow === undefined)).toBe(true);
    expect(robots().sitemap).toBeUndefined();
  });
});

describe("next.config headers() (AC-15)", () => {
  it("adds X-Robots-Tag: noindex on all paths in preview", () => {
    expect(noindexHeaderRules("preview")).toEqual([
      {
        source: ALL_PATHS,
        headers: [{ key: NOINDEX_HEADER_NAME, value: NOINDEX_HEADER_VALUE }],
      },
    ]);
    expect(ALL_PATHS).toBe("/(.*)");
  });

  it("adds it in development and test too", () => {
    for (const environment of ["development", "test"] as const) {
      expect(noindexHeaderRules(environment)).toHaveLength(1);
    }
  });

  it("adds no header in production (robots.ts and the meta tag cover 001)", () => {
    expect(noindexHeaderRules("production")).toEqual([]);
  });
});
