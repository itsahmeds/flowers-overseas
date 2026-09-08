/**
 * T-24 / AC-24 (TASK-039): the review gate.
 *
 * Four groups, in the order the AC states them:
 *
 *  1. the shipped answers — `en` and `en-gb` indexable, `de` and `pl` not, beta tags exactly on
 *     the locales above the 5 % threshold;
 *  2. the **definition** of the share (spec 003 §7, `src/modules/i18n/review.ts` header): the
 *     denominator is the resolved catalogue, and a key inherited across a language boundary is
 *     unreviewed while one inherited within a language (`en-gb` ← `en`) is not;
 *  3. the threshold table T-24 names: 0 %, 4 %, 6 % and 100 % unreviewed, measured on a synthetic
 *     100-key locale so the fractions are exact;
 *  4. **the flip with no code change**: a fixture manifest that marks every `de` key reviewed
 *     makes `de` indexable and drops its beta tag.
 *
 * `withMessageSource`/`withLocaleRegistry` are imported from the module path, never from the
 * barrel (AC-3), and `resetReviewCache()` is called on both sides of every injected scope —
 * the shares are memoised per process, which is exactly what that hook exists for.
 */
import { describe, expect, it } from "vitest";

import type { LocaleConfig } from "../../src/config/locales.ts";
import type {
  MessageCatalogue,
  MessageSource,
} from "../../src/modules/i18n/messages.ts";
import {
  repoMessageSource,
  withMessageSource,
} from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import {
  UNREVIEWED_SHARE_THRESHOLD,
  isLocaleIndexable,
  localeBetaTag,
  resetReviewCache,
  unreviewedShare,
} from "../../src/modules/i18n/review.ts";
import type { MessageMetaManifest } from "../../src/modules/i18n/schemas.ts";

/** Run `body` with a provider pair injected and the memoised shares cleared on both sides. */
async function withInjected<T>(
  {
    source,
    locales,
  }: {
    source?: MessageSource;
    locales?: readonly LocaleConfig[];
  },
  body: () => T,
): Promise<T> {
  resetReviewCache();
  try {
    const run = async (): Promise<T> =>
      source === undefined ? body() : withMessageSource(source, body);
    return locales === undefined
      ? await run()
      : await withLocaleRegistry(localeRegistryOf(locales), run);
  } finally {
    resetReviewCache();
  }
}

const REVIEWED = {
  source: "human",
  reviewed: true,
  reviewedBy: "native reviewer",
  reviewedAt: "2026-09-08T00:00:00Z",
  sourceHash: "a".repeat(64),
} as const;

const UNREVIEWED = {
  source: "machine",
  reviewed: false,
  sourceHash: "b".repeat(64),
} as const;

/** A source that answers from `base` except for the locales in `overrides`. */
function sourceWith(
  base: MessageSource,
  overrides: Readonly<
    Record<
      string,
      {
        catalogue?: MessageCatalogue | undefined;
        meta?: MessageMetaManifest | undefined;
      }
    >
  >,
): MessageSource {
  return {
    catalogue: (locale) =>
      locale in overrides
        ? overrides[locale]?.catalogue
        : base.catalogue(locale),
    meta: (locale) =>
      locale in overrides ? overrides[locale]?.meta : base.meta(locale),
  };
}

/** A locale config for a synthetic test locale, fallback `en`. */
function testLocale(code: string, bcp47: string): LocaleConfig {
  return {
    code,
    bcp47,
    formattingTag: bcp47,
    name: code,
    nativeName: code,
    dir: "ltr",
    isLaunch: true,
    // TASK-042: a pseudo-locale is a registry flag now; a fake launch locale states it.
    isPseudo: false,
    fallbackCode: "en",
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: [bcp47],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  };
}

const KEY_COUNT = 100;
const keys = Array.from(
  { length: KEY_COUNT },
  (_unused, index) => `k${String(index)}`,
);

/** A flat 100-key catalogue and the manifest that marks the first `reviewed` of them reviewed. */
function synthetic(
  reviewed: number,
  keySet: readonly string[] = keys,
): { catalogue: MessageCatalogue; meta: MessageMetaManifest } {
  return {
    catalogue: Object.fromEntries(keySet.map((key) => [key, key])),
    meta: Object.fromEntries(
      keySet.map((key, index) => [
        key,
        index < reviewed ? REVIEWED : UNREVIEWED,
      ]),
    ),
  };
}

describe("the shipped answers (AC-24)", () => {
  it("indexes `en`: the authored source language is fully reviewed", () => {
    expect(unreviewedShare("en")).toBe(0);
    expect(isLocaleIndexable("en")).toBe(true);
    expect(localeBetaTag("en")).toBe(false);
  });

  it("indexes `en-gb`, whose 24 inherited English keys are reviewed English", () => {
    // §13 Q5's thin override: one own key plus the `en` chain. Inheriting *within* a language is
    // reviewed copy; inheriting across one is not (the next describe block).
    expect(unreviewedShare("en-gb")).toBe(0);
    expect(isLocaleIndexable("en-gb")).toBe(true);
    expect(localeBetaTag("en-gb")).toBe(false);
  });

  it("refuses `de` and `pl` while their drafts are unreviewed", () => {
    for (const locale of ["de", "pl"]) {
      expect(unreviewedShare(locale), locale).toBe(1);
      expect(isLocaleIndexable(locale), locale).toBe(false);
      expect(localeBetaTag(locale), locale).toBe(true);
    }
  });

  it("beta-tags exactly the launch locales above the 5 % threshold", () => {
    const tagged = staticLocaleRegistry
      .list()
      .filter((locale) => localeBetaTag(locale.code))
      .map((locale) => locale.code);

    expect(tagged).toEqual(["de", "pl"]);
    expect(UNREVIEWED_SHARE_THRESHOLD).toBe(0.05);
  });

  it("fails closed for a locale the registry does not know", () => {
    expect(unreviewedShare("fr")).toBe(1);
    expect(isLocaleIndexable("fr")).toBe(false);
    expect(localeBetaTag("fr")).toBe(true);
  });
});

describe("the definition of the share", () => {
  it("counts keys inherited across a language boundary as unreviewed", async () => {
    // `nl` translates 50 of 100 keys and reviews them; the other 50 render as English through the
    // `en` fallback, which is not reviewed Dutch — the AC-31 case in miniature.
    const half = synthetic(50, keys.slice(0, 50));
    const share = await withInjected(
      {
        locales: [...staticLocaleRegistry.list(), testLocale("nl", "nl")],
        source: sourceWith(repoMessageSource, {
          en: synthetic(KEY_COUNT),
          nl: half,
        }),
      },
      () => unreviewedShare("nl"),
    );

    expect(share).toBe(0.5);
  });

  it("counts keys inherited within a language as reviewed", async () => {
    // The `en-gb` mechanism, isolated: `en-us` owns nothing and inherits 100 reviewed `en` keys.
    const share = await withInjected(
      {
        locales: [...staticLocaleRegistry.list(), testLocale("en-us", "en-US")],
        source: sourceWith(repoMessageSource, { en: synthetic(KEY_COUNT) }),
      },
      () => unreviewedShare("en-us"),
    );

    expect(share).toBe(0);
  });

  it("scores a locale with no catalogue and no manifest at 1", async () => {
    const share = await withInjected(
      {
        locales: [...staticLocaleRegistry.list(), testLocale("nl", "nl")],
        source: sourceWith(repoMessageSource, { en: synthetic(KEY_COUNT) }),
      },
      () => unreviewedShare("nl"),
    );

    expect(share).toBe(1);
  });
});

describe("the threshold table (T-24)", () => {
  const cases = [
    { reviewed: 100, share: 0, beta: false, indexable: true },
    { reviewed: 96, share: 0.04, beta: false, indexable: true },
    { reviewed: 95, share: 0.05, beta: false, indexable: true },
    { reviewed: 94, share: 0.06, beta: true, indexable: false },
    { reviewed: 0, share: 1, beta: true, indexable: false },
  ];

  for (const { reviewed, share, beta, indexable } of cases) {
    it(`answers ${String(share * 100)} % unreviewed correctly`, async () => {
      const answers = await withInjected(
        {
          locales: [...staticLocaleRegistry.list(), testLocale("nl", "nl")],
          source: sourceWith(repoMessageSource, {
            en: synthetic(KEY_COUNT),
            nl: synthetic(reviewed),
          }),
        },
        () => ({
          share: unreviewedShare("nl"),
          beta: localeBetaTag("nl"),
          indexable: isLocaleIndexable("nl"),
        }),
      );

      expect(answers).toEqual({ share, beta, indexable });
    });
  }

  it("refuses a reviewed locale that is not live, whatever its share", async () => {
    const answers = await withInjected(
      {
        locales: [
          ...staticLocaleRegistry.list(),
          { ...testLocale("nl", "nl"), isLaunch: false },
        ],
        source: sourceWith(repoMessageSource, {
          en: synthetic(KEY_COUNT),
          nl: synthetic(KEY_COUNT),
        }),
      },
      () => ({
        share: unreviewedShare("nl"),
        indexable: isLocaleIndexable("nl"),
      }),
    );

    // `isLaunch` first: the pseudo-locale exclusion of AC-29 is this clause, not a name list.
    expect(answers).toEqual({ share: 0, indexable: false });
  });
});

describe("the fixture-manifest flip (AC-24, no code change)", () => {
  it("makes `de` indexable and unmarked once every key is reviewed", async () => {
    // The shipped `de` manifest's own key set, with every entry flipped to reviewed. Nothing but
    // the manifest changes — no branch, no flag, no code path (AC-24's last clause).
    const shipped = repoMessageSource.meta("de");
    expect(Object.keys(shipped ?? {}).length).toBeGreaterThan(0);
    const reviewedDe: MessageMetaManifest = Object.fromEntries(
      Object.keys(shipped ?? {}).map((key) => [key, REVIEWED]),
    );

    const answers = await withInjected(
      {
        source: sourceWith(repoMessageSource, {
          de: {
            catalogue: repoMessageSource.catalogue("de"),
            meta: reviewedDe,
          },
        }),
      },
      () => ({
        share: unreviewedShare("de"),
        beta: localeBetaTag("de"),
        indexable: isLocaleIndexable("de"),
      }),
    );

    expect(answers).toEqual({ share: 0, beta: false, indexable: true });
  });
});
