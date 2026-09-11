/**
 * Cache tags (spec 005 §5.2 `cache.ts`, §5.4, AC-25, T-23; `plan/01` §3; TASK-069).
 *
 * Three assertions, in the order AC-25 states them:
 *
 *  1. `cacheTagsFor()` returns exactly `plan/01` §3's tag names per entity kind — checked against
 *     a **transcription** of that table, not against the module's own constants, so a tag renamed
 *     in the module fails here instead of agreeing with itself;
 *  2. **no module string-builds a tag** — a source scan over `src/` for the three prefixes
 *     followed by an interpolation or a colon, allowing exactly the two files that are the seam
 *     (`src/modules/catalog/cache.ts` and `src/lib/cache.ts`, which owns `home:{locale}`);
 *  3. `docs/runbooks/pricing.md` carries the mutation → tag map that 007/008/012 inherit, and it
 *     agrees with the function — a runbook that drifts from the code is worse than no runbook.
 *
 * And the fourth, from §5.4: **spec 005 calls `invalidate()` nowhere.** The first callers are
 * spec 012's admin edit and TASK-071's `fx.refresh`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cacheTagsFor } from "../../src/modules/catalog/cache.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");

const RUNBOOK = "docs/runbooks/pricing.md";

/**
 * `plan/01` §3's reserved tag names, transcribed. The table's rows:
 *
 * | Category / collection | ISR | 1 h + on-demand tag `catalog:{country}` |
 * | Product `/{locale}/flowers/{slug}` | ISR | 1 h + on-demand tag `product:{id}` |
 * | …"Flipping to `live` triggers `invalidate(['country:PL'])`" |
 */
const PLAN_01_TAGS = {
  catalog: (iso: string): string => `catalog:${iso}`,
  product: (id: string): string => `product:${id}`,
  country: (iso: string): string => `country:${iso}`,
} as const;

const SKU = "FO-BQ-001";
const LIVE = "PL" as const;

describe("cacheTagsFor() is the only tag builder (AC-25, T-23)", () => {
  it("returns plan/01 §3's names for each entity kind", () => {
    expect(cacheTagsFor({ kind: "product", productId: SKU })).toEqual([
      PLAN_01_TAGS.product(SKU),
    ]);
    expect(cacheTagsFor({ kind: "catalog", countryIso: LIVE })).toEqual([
      PLAN_01_TAGS.catalog(LIVE),
    ]);
    expect(
      cacheTagsFor({ kind: "price", productId: SKU, countryIso: LIVE }),
    ).toEqual([PLAN_01_TAGS.catalog(LIVE), PLAN_01_TAGS.product(SKU)]);
    expect(cacheTagsFor({ kind: "country", countryIso: LIVE })).toEqual([
      PLAN_01_TAGS.catalog(LIVE),
      PLAN_01_TAGS.country(LIVE),
    ]);
  });

  it("is deduplicated, sorted and stable, so two purges compare", () => {
    const first = cacheTagsFor({
      kind: "price",
      productId: SKU,
      countryIso: LIVE,
    });
    const second = cacheTagsFor({
      kind: "price",
      productId: SKU,
      countryIso: LIVE,
    });

    expect(first).toEqual(second);
    expect([...first]).toEqual([...first].sort());
    expect(new Set(first).size).toBe(first.length);
  });

  it("refuses an unparsable destination or sku rather than building `catalog:undefined`", () => {
    expect(() =>
      cacheTagsFor({
        kind: "catalog",
        countryIso: "XX" as never,
      }),
    ).toThrow();
    expect(() =>
      cacheTagsFor({ kind: "product", productId: "not a sku" }),
    ).toThrow();
  });
});

/** Every `.ts`/`.tsx` file under `src/`, repo-relative. */
function sourceFiles(directory: string, into: string[] = []): string[] {
  for (const entry of readdirSync(resolve(repoRoot, directory))) {
    const path = join(directory, entry);
    if (statSync(resolve(repoRoot, path)).isDirectory()) {
      sourceFiles(path, into);
      continue;
    }
    if (/\.tsx?$/.test(entry)) into.push(path);
  }
  return into;
}

describe("no module string-builds a cache tag (AC-25's source scan)", () => {
  /** The two files that are allowed to spell a tag: the builder and the seam. */
  const TAG_BUILDERS = ["src/modules/catalog/cache.ts", "src/lib/cache.ts"];

  /** A tag literal: one of the reserved prefixes, a colon, then an interpolation or a value. */
  const TAG_LITERAL = /["'`](?:catalog|product|country|home):\$?\{?[^"'`\s]/;

  it("has a scanner that fires on a hand-built tag", () => {
    expect(TAG_LITERAL.test("await invalidate([`catalog:${iso}`]);")).toBe(
      true,
    );
    expect(TAG_LITERAL.test('invalidate(["product:FO-BQ-001"]);')).toBe(true);
    // …and not on the prose and the identifiers that legitimately carry the words.
    expect(TAG_LITERAL.test("const catalogTags = cacheTagsFor(entity);")).toBe(
      false,
    );
    expect(TAG_LITERAL.test('const key = "country";')).toBe(false);
  });

  it("finds no tag literal in `src/` outside the two builders", () => {
    const offenders = sourceFiles("src")
      .filter((file) => !TAG_BUILDERS.includes(file))
      .filter((file) => {
        const code = read(file)
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/^\s*\/\/.*$/gm, " ");
        return TAG_LITERAL.test(code);
      });

    expect(offenders).toEqual([]);
  });

  it("calls `invalidate()` nowhere in spec 005's module (§5.4)", () => {
    const moduleFiles = sourceFiles("src/modules/catalog").concat(
      sourceFiles("src/config/catalogue"),
    );
    for (const file of moduleFiles) {
      // Comments are stripped: `cache.ts` *documents* who the first callers are, which is the
      // point of the rule, and a docstring that says "005 calls `invalidate()` nowhere" must not
      // be what makes the scan fire.
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      expect(code, file).not.toMatch(/\binvalidate\s*\(/);
    }
  });
});

describe("the runbook carries the mutation → tag map (AC-25, AC-26)", () => {
  const runbook = read(RUNBOOK);

  /** One row of the map: the call a caller makes, and what this function purges for it. */
  const MAP = [
    {
      call: 'cacheTagsFor({ kind: "product", productId })',
      tags: cacheTagsFor({ kind: "product", productId: SKU }),
    },
    {
      call: 'cacheTagsFor({ kind: "price", productId, countryIso })',
      tags: cacheTagsFor({ kind: "price", productId: SKU, countryIso: LIVE }),
    },
    {
      call: 'cacheTagsFor({ kind: "catalog", countryIso })',
      tags: cacheTagsFor({ kind: "catalog", countryIso: LIVE }),
    },
    {
      call: 'cacheTagsFor({ kind: "country", countryIso })',
      tags: cacheTagsFor({ kind: "country", countryIso: LIVE }),
    },
  ] as const;

  it("names each mutation, its call and every tag that call purges", () => {
    for (const { call, tags } of MAP) {
      expect(runbook, call).toContain(call);
      for (const tag of tags) {
        // The runbook writes tags as templates (`catalog:{iso}`), because the map is read by a
        // human with a different country in hand.
        const prefix = tag.split(":")[0] ?? "";
        expect(runbook, tag).toContain(`${prefix}:{`);
      }
    }
  });

  it("points at the one builder and at the invalidation seam", () => {
    expect(runbook).toContain("cacheTagsFor(");
    expect(runbook).toContain("invalidate(");
    expect(runbook).toContain("src/lib/cache.ts");
  });
});
