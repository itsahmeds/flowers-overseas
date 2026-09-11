/**
 * **T-17 / AC-15's grep half** — "no review, rating, star, testimonial, review count, Trustpilot
 * mark, partner name, partner photo, delivery-photo claim or florist count anywhere rendered …
 * and a repo grep over `messages/en.json` for the forbidden claim shapes" (spec 004 §8, §9 AC-15;
 * `plan/07` §7; `plan/09` Phase 0 AC 6; TASK-053).
 *
 * This is the Phase 0 acceptance criterion that a single well-meaning line of copy breaks, which
 * is why it is a test and not a review note. The DOM half — the same claim shapes asserted over
 * all four locale homes and the footer, served — is `tests/e2e/honesty.spec.ts`; this half reads
 * the catalogue, because a forbidden sentence that no component renders **today** is still a
 * sentence a component will render the week somebody needs a subtitle.
 *
 * ## The one exception, and why it is not a hole
 *
 * `common.floristCount` is a plural message with no call site. It keeps `retained: true` in
 * `messages/en.meta.json` **precisely because nothing renders it** (the spec §2 "Messages" note
 * and the TASK-040 carry-forward): the key is the shape a count would take when there are
 * florists to count, kept so that the day it is used it is already translated and already
 * plural-correct in Polish. The test asserts both halves of that — the key exists, and no file
 * under `src/` reads it — so the exception cannot quietly become a rendered count.
 *
 * ## Why the patterns are word-bounded
 *
 * "Start again from the home page" contains `star`. A substring grep for the forbidden shapes
 * fires on innocent copy, a reviewer adds an ignore list, and the gate stops meaning anything.
 * Every pattern below is anchored on word boundaries and each one is exercised against a sentence
 * that must fire and one that must not.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { launchLocales } from "../../src/config/locales.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

/**
 * The forbidden claim shapes of AC-15, as `plan/09` Phase 0 AC 6 lists them. Each is a *claim we
 * cannot support in Phase 0*: there are no reviews, no ratings, no Trustpilot profile, no named
 * partner, no delivery photograph to show and no florists to count.
 */
const FORBIDDEN: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: "review", pattern: /\breviews?\b/iu },
  { name: "rating", pattern: /\bratings?\b|\brated\b/iu },
  { name: "star", pattern: /\bstars?\b|★|⭐/iu },
  { name: "testimonial", pattern: /\btestimonials?\b/iu },
  { name: "review count", pattern: /\d[\d\s,.]*\s*(reviews?|ratings?)\b/iu },
  {
    name: "out-of-five score",
    pattern: /\b\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/iu,
  },
  { name: "Trustpilot mark", pattern: /trustpilot|feefo|reviews\.io/iu },
  { name: "florist count", pattern: /\d[\d\s,.]*\s*florists?\b/iu },
  {
    name: "customer count",
    pattern: /\d[\d\s,.]*\s*(customers?|orders? delivered|deliveries)\b/iu,
  },
  {
    name: "partner name",
    pattern: /\b(kwiaciarnia|blumen|fleurs|interflora|euroflorist|fleurop)\b/iu,
  },
  // A photograph shown, as opposed to the promise that one is taken and sent: "see the photo
  // below", "photo gallery", "photos of our deliveries".
  {
    name: "delivery-photo gallery claim",
    pattern: /\b(photo|picture)\s+(gallery|below|of (our|recent)\s+deliver)/iu,
  },
];

/** The one retained-but-unrendered key, and the only exception this gate allows. */
const RETAINED_UNRENDERED = "common.floristCount";

function flat(
  tree: unknown,
  prefix = "",
  into: Record<string, string> = {},
): Record<string, string> {
  if (typeof tree !== "object" || tree === null) return into;
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") into[path] = value;
    else flat(value, path, into);
  }
  return into;
}

function catalogue(locale: string): Record<string, string> {
  return flat(
    JSON.parse(
      readFileSync(resolve(repoRoot, `messages/${locale}.json`), "utf8"),
    ),
  );
}

describe("AC-15: the message catalogues carry no claim we cannot support", () => {
  for (const locale of launchLocales) {
    it(`${locale}.json contains none of the forbidden claim shapes`, () => {
      const offences: string[] = [];
      for (const [key, value] of Object.entries(catalogue(locale))) {
        if (key === RETAINED_UNRENDERED) continue;
        for (const { name, pattern } of FORBIDDEN) {
          if (pattern.test(value)) offences.push(`${key}: ${name} — ${value}`);
        }
      }
      expect(offences).toEqual([]);
    });
  }

  it("fires on each shape the criterion names", () => {
    for (const claim of [
      "Rated 4.8 out of 5 by our customers",
      "Read the reviews from buyers in Warsaw",
      "★★★★★ — the bouquet was perfect",
      "See our Trustpilot score",
      "A testimonial from a buyer in Berlin",
      "1,240 customers have sent flowers with us",
      "We work with 47 florists across Europe",
      "Made by Kwiaciarnia Rosa in Warszawa",
      "See the photo gallery of our deliveries",
    ]) {
      expect(
        FORBIDDEN.some(({ pattern }) => pattern.test(claim)),
        claim,
      ).toBe(true);
    }
  });

  it("leaves the shipped copy's innocent prose alone", () => {
    for (const allowed of [
      // `star` inside a word, which is what a substring grep gets wrong.
      "That page does not exist. Start again from the home page.",
      // The promise that a photograph is taken — true, and not a photograph shown.
      "We photograph it at the door",
      "A picture arrives when the flowers do, so you know it happened.",
      "Our florist in the recipient's town makes it and hands it over in person.",
      "7-day freshness guarantee",
    ]) {
      expect(
        FORBIDDEN.filter(({ pattern }) => pattern.test(allowed)).map(
          (entry) => entry.name,
        ),
        allowed,
      ).toEqual([]);
    }
  });
});

describe("AC-16: this spec's message additions change no indexability answer", () => {
  it("keeps `en`/`en-gb` indexable and `de`/`pl` out of the index", async () => {
    const { isLocaleIndexable, unreviewedShare } =
      await import("../../src/modules/i18n");

    for (const locale of ["en", "en-gb"] as const) {
      expect(isLocaleIndexable(locale), locale).toBe(true);
      expect(unreviewedShare(locale), locale).toBe(0);
    }
    // The recomputed share is the only thing this task moves, and it moves it the honest way:
    // 57 new English keys, echoed into `de`/`pl` as machine drafts, so both stay non-indexable.
    for (const locale of ["de", "pl"] as const) {
      expect(isLocaleIndexable(locale), locale).toBe(false);
      expect(unreviewedShare(locale), locale).toBeGreaterThan(0.05);
    }
  });

  it("emits no hreflang page for a locale whose copy is a draft", async () => {
    const { alternatesFor } = await import("../../src/modules/i18n");
    const pages = alternatesFor(
      { pageType: "home" },
      { baseUrl: "https://flowersoverseas.com" },
    );

    // `tests/unit/i18n-alternates.test.ts` owns the generator's properties; what is asserted
    // here is that TASK-053's 57 keys did not move the answer — two indexable pages, and the
    // German and Polish homes still absent.
    expect(pages.map((page) => page.url)).toEqual([
      "https://flowersoverseas.com/en",
      "https://flowersoverseas.com/en-gb",
    ]);
  });
});

describe("`common.floristCount` keeps `retained: true` because nothing renders it", () => {
  it("is present in the catalogue and flagged retained", () => {
    const meta = JSON.parse(
      readFileSync(resolve(repoRoot, "messages/en.meta.json"), "utf8"),
    ) as Record<string, { retained?: boolean }>;

    expect(catalogue("en")[RETAINED_UNRENDERED]).toBeDefined();
    expect(meta[RETAINED_UNRENDERED]?.retained).toBe(true);
  });

  it("is read by no file under `src/`", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    await walk(resolve(repoRoot, "src"));

    const readers: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      // Either spelling a call site could use: the flattened key, or `t("floristCount")` in a
      // file bound to the `common` namespace.
      if (
        source.includes("common.floristCount") ||
        (source.includes('useTranslations("common")') &&
          source.includes('"floristCount"'))
      ) {
        readers.push(file);
      }
    }
    expect(readers).toEqual([]);
  });
});
