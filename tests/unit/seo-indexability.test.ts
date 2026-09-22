/**
 * T-10, unit half — the indexability rule engine (spec 007 §6 "Indexability", AC-9; `plan/02` §7,
 * §10, §12; ADR-0007; TASK-090).
 *
 * AC-9 asks for "a table-driven test [that] covers all sixteen combinations" of exists ×
 * reviewed × `isLocaleIndexable` × `isIndexingEnvironment`. The table below is generated from the
 * four booleans rather than typed out, so it cannot be fifteen cases with a typo, and the expected
 * answer is computed from AC-9's own sentence ("`index,follow` **only when** all four hold")
 * instead of being copied from the implementation.
 *
 * Three things are proved beyond the table:
 *
 *  - **the page-type policy**: a page type that can never be indexed (`/`, `/dev/components`) is
 *    `noindex,follow` in all sixteen combinations, so no data flip can open it (`plan/02` §7, spec
 *    004 AC-28);
 *  - **the gathering**: `pageIndexability()` reaches the real `isLocaleIndexable()` and the real
 *    environment gate, so a caller cannot forget a term — which is what makes the sitemap
 *    membership of AC-14 and the robots meta of AC-9 the *same* answer;
 *  - **the shape**: `indexable` is `directive === "index,follow"` and nothing else, so TASK-094's
 *    sitemap query and TASK-091's `<meta>` cannot drift apart.
 *
 * The e2e half of T-10 (rendered `<meta name="robots">`, sitemap membership and the observed
 * header agreeing for every case) is parked in `tests/e2e/seo-indexability.spec.ts` until
 * TASK-091 creates a corridor route to observe.
 */
import { describe, expect, it } from "vitest";

import {
  INDEXABILITY_TERMS,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  OPTIONAL_INDEXABILITY_TERMS,
  PAGE_TYPE_POLICY,
  type IndexabilityTerms,
  type SeoPageType,
  indexability,
  indexabilityVerdict,
  pageIndexability,
} from "../../src/modules/seo/index.ts";

/** AC-9's four terms, in the order the spec sentence names them. */
const AC9_TERMS = [
  "exists",
  "reviewed",
  "localeIndexable",
  "indexingEnvironment",
] as const;

type Ac9Term = (typeof AC9_TERMS)[number];

/** The sixteen combinations, as `{ exists, reviewed, localeIndexable, indexingEnvironment }`. */
const SIXTEEN: readonly Readonly<Record<Ac9Term, boolean>>[] = Array.from(
  { length: 16 },
  (_unused, mask) =>
    Object.fromEntries(
      AC9_TERMS.map((term, index) => [term, (mask & (1 << index)) !== 0]),
    ) as Record<Ac9Term, boolean>,
);

const terms = (
  four: Readonly<Record<Ac9Term, boolean>>,
  pageTypeIndexable = true,
): IndexabilityTerms => ({ ...four, pageTypeIndexable });

const label = (four: Readonly<Record<Ac9Term, boolean>>): string =>
  AC9_TERMS.map((term) => `${term}=${String(four[term])}`).join(" ");

describe("indexability(): the sixteen-case table (AC-9, T-10)", () => {
  it("builds exactly sixteen distinct combinations", () => {
    expect(SIXTEEN).toHaveLength(16);
    expect(new Set(SIXTEEN.map((four) => label(four))).size).toBe(16);
  });

  for (const four of SIXTEEN) {
    // AC-9 verbatim: `index,follow` **only when** it exists, is reviewed, the locale is indexable
    // and the deployment is an indexing environment; otherwise `noindex,follow`.
    const expected = AC9_TERMS.every((term) => four[term])
      ? INDEX_FOLLOW
      : NOINDEX_FOLLOW;

    it(`${label(four)} -> ${expected}`, () => {
      expect(indexability(terms(four))).toBe(expected);
    });
  }

  it("says `index,follow` in exactly one of the sixteen", () => {
    const indexed = SIXTEEN.filter(
      (four) => indexability(terms(four)) === INDEX_FOLLOW,
    );
    expect(indexed).toHaveLength(1);
    expect(indexed[0]).toEqual({
      exists: true,
      reviewed: true,
      localeIndexable: true,
      indexingEnvironment: true,
    });
  });

  it("never emits `nofollow` (plan/02 §7: a noindex page is still crawled)", () => {
    for (const four of SIXTEEN) {
      expect(indexability(terms(four))).toMatch(/,follow$/);
    }
  });

  it("carries the terms on the verdict, and `indexable` is the directive", () => {
    for (const four of SIXTEEN) {
      const verdict = indexabilityVerdict(terms(four));
      expect(verdict.terms).toEqual(terms(four));
      expect(verdict.indexable).toBe(verdict.directive === INDEX_FOLLOW);
    }
  });

  /**
   * Spec 007 §14 **A7**. `terms[term] ?? true` read *any* absent term as satisfied, so a terms
   * object that lost a required gate — an unvalidated object, a refactor, a provider returning
   * `undefined` — bought itself an `index,follow`. An absent **optional** term is not asserted by
   * this page type and leaves the conjunction; an absent **required** one is a gate nobody
   * answered, and the answer to that is `noindex`.
   */
  it("treats an absent optional term as not asserted, and an absent required term as unmet", () => {
    const all = Object.fromEntries(
      INDEXABILITY_TERMS.map((term) => [term, true]),
    ) as IndexabilityTerms;

    const withoutOptional: Record<string, boolean> = { ...all };
    delete withoutOptional["operational"];
    expect(indexability(withoutOptional as unknown as IndexabilityTerms)).toBe(
      INDEX_FOLLOW,
    );
    expect(indexability({ ...all, operational: false })).toBe(NOINDEX_FOLLOW);

    for (const term of INDEXABILITY_TERMS) {
      const optional: readonly string[] = OPTIONAL_INDEXABILITY_TERMS;
      if (optional.includes(term)) continue;
      const missing: Record<string, boolean> = { ...all };
      delete missing[term];
      expect(indexability(missing as unknown as IndexabilityTerms), term).toBe(
        NOINDEX_FOLLOW,
      );
    }
  });

  it("is a conjunction over the declared term list, with no hidden term", () => {
    const all = Object.fromEntries(
      INDEXABILITY_TERMS.map((term) => [term, true]),
    ) as IndexabilityTerms;
    expect(indexability(all)).toBe(INDEX_FOLLOW);
    for (const term of INDEXABILITY_TERMS) {
      expect(indexability({ ...all, [term]: false })).toBe(NOINDEX_FOLLOW);
    }
  });
});

describe("page-type policy (plan/02 §7, spec 004 AC-28)", () => {
  const never = Object.entries(PAGE_TYPE_POLICY)
    .filter(([, policy]) => policy === "never")
    .map(([pageType]) => pageType as SeoPageType);

  it("keeps the locale chooser and the dev gallery permanently out of the index", () => {
    expect(never).toEqual(
      expect.arrayContaining(["localeChooser", "devGallery"]),
    );
  });

  it("answers `noindex,follow` for a never-indexable page type in all sixteen cases", () => {
    for (const four of SIXTEEN) {
      expect(indexability(terms(four, false))).toBe(NOINDEX_FOLLOW);
    }
  });

  it("states the specified policy for every page type it knows, and no other (TASK-143)", () => {
    // Round 1 asserted `["never", "byRule"]).toContain(policy)` over a
    // `Record<SeoPageType, "never" | "byRule">` — every value the type allows, PR 89's
    // `[200, 404]` shape. Flipping `categoryHub` to `"never"` or deleting `corridor` left it green.
    // The expected map is the specs' own answer per page type, not a copy of the module's.
    expect(PAGE_TYPE_POLICY).toStrictEqual({
      // `plan/02` §7 table: "Locale chooser `/` | `noindex,follow`"; spec 007 §6 "`/` stays
      // `noindex,follow`".
      localeChooser: "never",
      // spec 004 AC-28 / spec 007 §6: "`/dev/components` … stay `noindex`".
      devGallery: "never",
      // spec 007 §6: "The locale home lifts to `index,follow` under the same engine".
      localeHome: "byRule",
      // spec 007 §6: "The hub is indexable when at least one corridor in that locale is".
      destinationsHub: "byRule",
      // spec 007 §6: "A corridor page is indexable iff it exists … **and** `content.reviewed`…".
      corridor: "byRule",
      // spec 008 §6 "one engine, six descriptors": the three country-scoped types are
      // `index,follow` iff exists ∧ operational ∧ ≥ 6 products ∧ reviewed ∧ locale ∧ environment.
      countryShopRoot: "byRule",
      countryCategory: "byRule",
      countryOccasion: "byRule",
      // spec 008 §6: the three hubs are `index,follow` iff exists ∧ reviewed intro ∧ ≥ 1 link ∧
      // locale ∧ environment — "the page types `plan/09` Phase 0 AC 1 expects in the indexed set".
      categoryHub: "byRule",
      occasionHub: "byRule",
      occasionsIndex: "byRule",
    });
  });
});

describe("pageIndexability(): the terms are gathered, not asked for (AC-9)", () => {
  const indexingHost = {
    environment: "production",
    siteUrl: "https://flowersoverseas.com",
  } as const;
  const preview = {
    environment: "preview",
    siteUrl: "https://flowers-overseas.vercel.app",
  } as const;

  it("reads the locale gate: `en` is indexable, an unreviewed locale is not", () => {
    const page = {
      pageType: "corridor",
      exists: true,
      reviewed: true,
    } as const;

    expect(
      pageIndexability({ ...page, locale: "en" }, indexingHost).directive,
    ).toBe(INDEX_FOLLOW);
    // spec 003 §6.4 / `plan/03` §6: `de` is machine-drafted well above the 5 % share.
    const german = pageIndexability({ ...page, locale: "de" }, indexingHost);
    expect(german.directive).toBe(NOINDEX_FOLLOW);
    expect(german.terms.localeIndexable).toBe(false);
  });

  it("reads the environment gate: every non-indexing deployment is noindex (§12)", () => {
    const verdict = pageIndexability(
      { pageType: "corridor", locale: "en", exists: true, reviewed: true },
      preview,
    );
    expect(verdict.directive).toBe(NOINDEX_FOLLOW);
    expect(verdict.terms.indexingEnvironment).toBe(false);
    expect(verdict.indexable).toBe(false);
  });

  it("reads the page's own two gates", () => {
    for (const gate of ["exists", "reviewed"] as const) {
      const verdict = pageIndexability(
        {
          pageType: "corridor",
          locale: "en",
          exists: gate !== "exists",
          reviewed: gate !== "reviewed",
        },
        indexingHost,
      );
      expect(verdict.directive).toBe(NOINDEX_FOLLOW);
      expect(verdict.terms[gate]).toBe(false);
    }
  });

  it("refuses the locale chooser even with every data term true", () => {
    expect(
      pageIndexability(
        {
          pageType: "localeChooser",
          locale: "en",
          exists: true,
          reviewed: true,
        },
        indexingHost,
      ).directive,
    ).toBe(NOINDEX_FOLLOW);
  });
});
