/**
 * T-40 / AC-40, the scope registry's pins of T-42 / AC-42 and T-44 / AC-44 (spec 003 §14 A17;
 * TASK-224).
 *
 * `unreviewedShare()` counts only the keys a page that can be indexed may render. Each case below
 * is watched red under the mutation A17 names for it:
 *
 *  - `review.ts` ignores the scope: fixture (a) reads 54/150 and is not indexable;
 *  - an unmatched key is dropped instead of counted: fixture (c) reads 4/100 and is indexable;
 *  - non-counted keys stay in the denominator: fixture (b) reads 6/150 = 0.04 and is indexable.
 *
 * The fixtures are injected with `withMessageSource` and `withReviewScope` (module path, never the
 * barrel, AC-3) over the real `en` registry entry; the exact values are asserted, not a range.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  MessageCatalogue,
  MessageSource,
} from "../../src/modules/i18n/messages.ts";
import { withMessageSource } from "../../src/modules/i18n/messages.ts";
import {
  UNREVIEWED_SHARE_THRESHOLD,
  isLocaleIndexable,
  localeBetaTag,
  resetReviewCache,
  reviewBreakdown,
  unreviewedShare,
} from "../../src/modules/i18n/review.ts";
import {
  NON_INDEXABLE_SCOPE,
  SCOPE_SURFACES,
  ScopeEntrySchema,
  isCounted,
  matchReaches,
  scopeEntryFor,
  withReviewScope,
} from "../../src/modules/i18n/review-scope.ts";
import type { MessageMetaManifest } from "../../src/modules/i18n/schemas.ts";

const REVIEWED = {
  source: "human",
  reviewed: true,
  reviewedBy: "founder",
  reviewedAt: "2026-10-05T00:00:00Z",
  sourceHash: "a".repeat(64),
} as const;
const UNREVIEWED = {
  source: "machine",
  reviewed: false,
  sourceHash: "b".repeat(64),
} as const;

const CHECKOUT = [
  { match: "checkout", surface: "checkout", paths: ["src/checkout/**"] },
] as const;

interface Fixture {
  readonly source: MessageSource;
}

/**
 * An `en` catalogue of `counted` keys under `shared.` (the first `unreviewed` of them
 * unreviewed), `checkout` keys under `checkout.` and `stray` keys under `zzz.` that no entry
 * matches.
 */
function fixture(spec: {
  readonly counted: number;
  readonly unreviewed: number;
  readonly checkout: number;
  readonly checkoutReviewed: boolean;
  readonly stray?: number;
}): Fixture {
  const catalogue: Record<string, Record<string, string>> = {
    shared: {},
    checkout: {},
    zzz: {},
  };
  const meta: Record<string, typeof REVIEWED | typeof UNREVIEWED> = {};
  const add = (
    namespace: string,
    count: number,
    reviewedAt: (index: number) => boolean,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const name = `k${String(index)}`;
      (catalogue[namespace] as Record<string, string>)[name] = name;
      meta[`${namespace}.${name}`] = reviewedAt(index) ? REVIEWED : UNREVIEWED;
    }
  };
  add("shared", spec.counted, (index) => index >= spec.unreviewed);
  add("checkout", spec.checkout, () => spec.checkoutReviewed);
  add("zzz", spec.stray ?? 0, () => false);
  const manifest: MessageMetaManifest = meta;
  return {
    source: {
      catalogue: (locale) =>
        locale === "en" ? (catalogue as MessageCatalogue) : undefined,
      meta: (locale) => (locale === "en" ? manifest : undefined),
    },
  };
}

async function within<T>(
  { source }: Fixture,
  entries: readonly unknown[],
  body: () => T,
): Promise<T> {
  resetReviewCache();
  try {
    return await withMessageSource(source, () =>
      withReviewScope(entries, body),
    );
  } finally {
    resetReviewCache();
  }
}

const fixtureA = fixture({
  counted: 100,
  unreviewed: 4,
  checkout: 50,
  checkoutReviewed: false,
});

describe("the share counts only keys an indexable page can render (AC-40)", () => {
  it("(a) leaves 50 unreviewed checkout keys out of both numbers", async () => {
    await within(fixtureA, CHECKOUT, () => {
      expect(unreviewedShare("en")).toBe(4 / 100);
      expect(unreviewedShare("en")).toBe(0.04);
      expect(isLocaleIndexable("en")).toBe(true);
      expect(localeBetaTag("en")).toBe(false);
      expect(reviewBreakdown("en")).toEqual({
        counted: 100,
        notCounted: 50,
        unreviewedCounted: 4,
      });
    });
  });

  it("(a) counts them all once the entry is removed", async () => {
    await within(fixtureA, [], () => {
      expect(unreviewedShare("en")).toBe(54 / 150);
      expect(isLocaleIndexable("en")).toBe(false);
      expect(localeBetaTag("en")).toBe(true);
    });
  });

  it("(b) 6 unreviewed counted keys are 0.06 whatever the checkout keys say", async () => {
    await within(
      fixture({
        counted: 100,
        unreviewed: 6,
        checkout: 50,
        checkoutReviewed: true,
      }),
      CHECKOUT,
      () => {
        expect(unreviewedShare("en")).toBe(6 / 100);
        expect(isLocaleIndexable("en")).toBe(false);
        expect(localeBetaTag("en")).toBe(true);
      },
    );
  });

  it("(c) counts a key no entry matches: 10 stray keys make 14/110", async () => {
    await within(
      fixture({
        counted: 100,
        unreviewed: 4,
        checkout: 50,
        checkoutReviewed: false,
        stray: 10,
      }),
      CHECKOUT,
      () => {
        expect(unreviewedShare("en")).toBe(14 / 110);
        expect(isLocaleIndexable("en")).toBe(false);
      },
    );
  });

  it("(d) a scope that matches every key scores 1 and fails closed", async () => {
    await within(
      fixture({
        counted: 100,
        unreviewed: 0,
        checkout: 50,
        checkoutReviewed: true,
      }),
      [
        ...CHECKOUT,
        { match: "shared", surface: "demo", paths: ["src/demo/**"] },
      ],
      () => {
        expect(unreviewedShare("en")).toBe(1);
        expect(isLocaleIndexable("en")).toBe(false);
      },
    );
  });

  it("answers from the committed registry again after a scope has been swapped", async () => {
    const before = unreviewedShare("en");
    await within(fixtureA, CHECKOUT, () => {
      expect(unreviewedShare("en")).toBe(0.04);
    });
    expect(unreviewedShare("en")).toBe(before);
  });
});

describe("the registry (AC-41's module-load half, A17 clause 2)", () => {
  it("parses at load, and today holds no entry", () => {
    expect(NON_INDEXABLE_SCOPE).toEqual([]);
    for (const entry of NON_INDEXABLE_SCOPE) {
      expect(ScopeEntrySchema.safeParse(entry).success).toBe(true);
    }
    expect(SCOPE_SURFACES).toEqual([
      "checkout",
      "orderConfirmation",
      "orderTracking",
      "florist",
      "admin",
      "demo",
      "dev",
      "email",
    ]);
  });

  it("refuses a malformed entry rather than skipping it", async () => {
    const entry = { match: "checkout", surface: "checkout", paths: ["a/**"] };
    await expect(
      withReviewScope([{ ...entry, surface: "billing" }], () => 0),
    ).rejects.toThrow();
    for (const match of ["*", "a.b", "", "checkout.", ".*", "1abc"]) {
      await expect(
        withReviewScope([{ ...entry, match }], () => 0),
        match,
      ).rejects.toThrow();
    }
    await expect(
      withReviewScope([{ ...entry, paths: [] }], () => 0),
    ).rejects.toThrow();
    await expect(
      withReviewScope([{ ...entry, extra: true }], () => 0),
    ).rejects.toThrow();
  });

  it("matches a namespace or a dot prefix and nothing wider", () => {
    expect(matchReaches("checkout", "checkout.step.review")).toBe(true);
    expect(matchReaches("checkout", "checkout")).toBe(true);
    expect(matchReaches("checkout", "checkoutFoo.step")).toBe(false);
    expect(matchReaches("meta.checkout.*", "meta.checkout.title")).toBe(true);
    expect(matchReaches("meta.checkout.*", "meta.checkoutX.title")).toBe(false);
    expect(matchReaches("meta.checkout.*", "meta.home.title")).toBe(false);
  });

  it("counts a key unless an entry matches it", async () => {
    await withReviewScope(CHECKOUT, () => {
      expect(isCounted("checkout.step.review")).toBe(false);
      expect(isCounted("common.back")).toBe(true);
      expect(isCounted("checkoutTypo.step")).toBe(true);
      expect(scopeEntryFor("checkout.step.review")?.surface).toBe("checkout");
    });
  });
});

describe("what AC-42 keeps (A17 clause 3)", () => {
  it("leaves the threshold at 5 %", () => {
    expect(UNREVIEWED_SHARE_THRESHOLD).toBe(0.05);
  });

  it("keeps de and pl out of the index on the committed tree", () => {
    for (const locale of ["de", "pl"]) {
      expect(isLocaleIndexable(locale), locale).toBe(false);
      expect(localeBetaTag(locale), locale).toBe(true);
    }
  });
});

describe("the docs state the scope rule (AC-44)", () => {
  const root = resolve(__dirname, "../..");
  const squash = (text: string): string => text.replace(/\s+/g, " ");
  const runbook = squash(
    readFileSync(resolve(root, "docs/runbooks/i18n-translations.md"), "utf8"),
  );
  const header = squash(
    readFileSync(resolve(root, "src/modules/i18n/review.ts"), "utf8"),
  );

  it("names the registry, check 11 and the counted default in the runbook", () => {
    expect(runbook).toContain("src/modules/i18n/review-scope.ts");
    expect(runbook).toContain("check 11");
    expect(runbook).toContain("A key that no entry matches counts");
  });

  it("carries the first two sentences of A17 clause 5", () => {
    expect(runbook).toContain("Not counted is not exempt from review.");
    expect(runbook).toContain(
      "Checkout, confirmation, tracking and buyer emails state prices, dates, cutoffs, withdrawal terms and what the buyer agrees to.",
    );
  });

  it("names the registry in the review.ts header", () => {
    expect(header).toContain("review-scope.ts");
    expect(header).toContain("The scope rule");
  });
});
