/**
 * The fresh-flower promise, never a number of days (spec 009 §14 A11; spec 041 AC-16's three-key
 * half; TASK-172).
 *
 * Two halves:
 *
 *  1. **The scan's own fixture case.** A11's pass and fail sentences, every spelled-out number
 *     `one`…`thirty`, `ein`…`dreißig`, `jeden`…`trzydzieści`, every day, week and freshness word,
 *     and the three-word window on both sides. Then every single-branch deletion of the scan's two
 *     patterns (`branchDeletions`) must let at least one must-fail sentence through: a term
 *     deleted from the scan turns this case red.
 *  2. **The message and content scan, four locales.** Every guarantee-related value (the three
 *     keys A11 names, the PDP guarantee key, any key whose path names a guarantee, a freshness
 *     claim or a promise, every `infoPages.*` value) and every `content/pages/<locale>/guarantee.md`
 *     contains no "7-day", no freshness claim and no ICU argument naming days. The same scan run
 *     over the catalogue with "7-day", `{days}` or `{freshnessDays}` restored in any of the named
 *     keys, in any locale, reports it.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DAY_ARGUMENT,
  FRESHNESS_TERMS,
  FRESHNESS_WINDOW,
  type FreshnessTerms,
  freshnessClaims,
} from "../../src/config/freshness-claim.ts";
import { resolveCatalogue } from "../../src/modules/i18n/messages.ts";
import { branchDeletions } from "./support/regex-branches.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/* -------------------------------------------------------------------------- */
/* 1. The scan's own fixture case                                              */
/* -------------------------------------------------------------------------- */

/** A11 and T-16, word for word: these pass. */
const MUST_PASS = [
  "14-day right to cancel",
  "14 days to change your mind",
  "14 Tage",
  "14 dni",
  "fresh flowers are one of them",
  "we do not promise a number of days",
  "Fresh flowers are an exception to the usual 14-day right to cancel",
  // The shipped promise and its 72-hour window.
  "Fresh-flower promise",
  "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
  "Frische-Versprechen",
  "Obietnica świeżych kwiatów",
  // A day claim and a freshness word in different sentences.
  "Fresh flowers, hand-made. Delivered in 2 days.",
] as const;

/** A11 and T-16, word for word: these fail. */
const SPEC_MUST_FAIL = [
  "fresh for 7 days",
  "7-day freshness",
  "7 Tage frisch",
  "świeże przez 7 dni",
  "lasts a week",
  "fresh for {days} days",
] as const;

/** `one`…`thirty`, written out here, not read from the module. */
const EN_SPELLED = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
  "twenty-three",
  "twenty-four",
  "twenty-five",
  "twenty-six",
  "twenty-seven",
  "twenty-eight",
  "twenty-nine",
  "thirty",
];
const DE_UNITS = [
  "ein",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
];
const DE_SPELLED = [
  ...DE_UNITS,
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
  "zwanzig",
  ...DE_UNITS.map((unit) => `${unit}undzwanzig`),
  "dreißig",
];
const PL_SPELLED = [
  "jeden",
  "dwa",
  "trzy",
  "cztery",
  "pięć",
  "sześć",
  "siedem",
  "osiem",
  "dziewięć",
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
  "dwadzieścia",
  "dwadzieścia siedem",
  "trzydzieści",
];
/** Polish combining forms, as in "siedmiodniowa" (a seven-day …). */
const PL_COMBINING = [
  "jedno",
  "dwu",
  "trzy",
  "cztero",
  "pięcio",
  "sześcio",
  "siedmio",
  "ośmio",
  "dziewięcio",
  "dziesięcio",
  "czternasto",
  "trzydziesto",
];

/** Every day, week and freshness word, and the joins, each in a sentence that must fail. */
const TERM_MUST_FAIL = [
  // Day words.
  "fresh for 1 day",
  "fresh for 7 days",
  "1 Tag frisch",
  "einen Tag frisch",
  "7 Tage frisch",
  "nach 7 Tagen noch frisch",
  "7-tägige Frische-Garantie",
  "siebentägige Frische",
  "świeże przez 1 dzień",
  "świeże przez 7 dni",
  "7-dniowa gwarancja świeżości",
  // Week words, on their own and in compounds.
  "lasts a week",
  "fresh for two weeks",
  "eine Woche frisch",
  "zwei Wochen frisch",
  "zweiwöchige Frische",
  "tydzień świeżości",
  "świeże przez dwa tygodnie",
  "świeże przez pięć tygodni",
  "dwutygodniowa świeżość",
  // Freshness words, each beside a day claim.
  "freshness for 7 days",
  "last 7 days",
  "lasts 7 days",
  "long-lasting for 7 days",
  "7 Tage Frische",
  "hält 7 Tage",
  "halten 7 Tage",
  "haltbar 7 Tage",
  "Haltbarkeit 7 Tage",
  "świeżość przez 7 dni",
  "trwałość 7 dni",
  "wytrzymają 7 dni",
  // Joins: a hyphen, a space, a no-break space, nothing.
  "7 Tage frisch",
  "7days fresh",
  "fresh for seven-day",
  // ICU arguments naming days.
  "fresh for {freshnessDays}",
  "{days, plural, one {# day} other {# days}} of freshness",
  // The window on both sides: three words between them still fail.
  "fresh for at least 7 days",
  "7 days and still fresh",
] as const;

const MUST_FAIL: readonly string[] = [
  ...SPEC_MUST_FAIL,
  ...TERM_MUST_FAIL,
  ...EN_SPELLED.map((n) => `fresh for ${n} days`),
  ...DE_SPELLED.map((n) => `${n} Tage frisch`),
  ...PL_SPELLED.map((n) => `świeże przez ${n} dni`),
  ...PL_COMBINING.map((n) => `${n}dniowa świeżość`),
];

describe("A11: the freshness-claim scan's own fixture case", () => {
  it("passes A11's statutory and promise sentences", () => {
    for (const sentence of MUST_PASS) {
      expect(freshnessClaims(sentence), sentence).toEqual([]);
    }
  });

  it("fails A11's six sentences, every spelled-out number to thirty and every term", () => {
    for (const sentence of MUST_FAIL) {
      expect(freshnessClaims(sentence).length, sentence).toBeGreaterThan(0);
    }
  });

  it(`allows at most ${String(FRESHNESS_WINDOW)} words between the claim and the freshness word, in either order`, () => {
    expect(FRESHNESS_WINDOW).toBe(3);
    expect(freshnessClaims("fresh one two three 7 days")).toHaveLength(1);
    expect(freshnessClaims("7 days one two three fresh")).toHaveLength(1);
    expect(freshnessClaims("fresh one two three four 7 days")).toEqual([]);
    expect(freshnessClaims("7 days one two three four fresh")).toEqual([]);
  });

  it("reads one sentence at a time, with markup stripped", () => {
    expect(freshnessClaims("Always fresh. 7 days a week we answer.")).toEqual(
      [],
    );
    expect(freshnessClaims("<b>7-day</b> freshness")).toHaveLength(1);
    expect(freshnessClaims("**Fresh** for 7 days.")).toHaveLength(1);
  });

  it("reports the claim, the freshness word and the sentence", () => {
    expect(freshnessClaims("Our bouquets stay fresh for 7 days.")).toEqual([
      {
        claim: "7 days",
        freshness: "fresh",
        sentence: "Our bouquets stay fresh for 7 days.",
      },
    ]);
  });

  it("goes red when any single term is deleted from either pattern", () => {
    const survivors: string[] = [];
    for (const key of ["dayClaim", "freshness"] as const) {
      const deletions = branchDeletions(FRESHNESS_TERMS[key]);
      expect(deletions.length, key).toBeGreaterThan(5);
      for (const { branch, mutant } of deletions) {
        const terms: FreshnessTerms = { ...FRESHNESS_TERMS, [key]: mutant };
        const caught = MUST_FAIL.some(
          (sentence) => freshnessClaims(sentence, terms).length === 0,
        );
        if (!caught) survivors.push(`${key}: ${branch}`);
      }
    }
    expect(survivors).toStrictEqual([]);
  });

  it("finds an ICU argument naming days, alone", () => {
    for (const value of [
      "{days}",
      "{freshnessDays}",
      "{ days, plural, other {#} }",
    ]) {
      expect(DAY_ARGUMENT.test(value), value).toBe(true);
    }
    for (const value of ["{country}", "{hours}", "72 hours"]) {
      expect(DAY_ARGUMENT.test(value), value).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The message and content scan, four locales                               */
/* -------------------------------------------------------------------------- */

/** The keys A11 names, and the PDP's guarantee key (TASK-179). */
const NAMED_KEYS = [
  "nav.utility.guarantee",
  "home.proof.guarantee.title",
  "trust.guarantee.name",
  "product.trust.freshness.title",
  "product.trust.freshness.body",
] as const;

/** A key is guarantee-related when a path segment names a guarantee, freshness or a promise. */
const GUARANTEE_SEGMENT = /guarantee|fresh|promise/iu;

function leaves(
  value: unknown,
  path: readonly string[] = [],
): readonly (readonly [string, string])[] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, [...path, key]),
  );
}

function guaranteeValues(
  catalogue: Record<string, unknown>,
): readonly (readonly [string, string])[] {
  return leaves(catalogue).filter(
    ([key]) =>
      key.startsWith("infoPages.") ||
      key.split(".").some((segment) => GUARANTEE_SEGMENT.test(segment)),
  );
}

/** What A11 forbids in one guarantee value, as readable reasons. */
function violations(text: string): readonly string[] {
  return [
    ...(/7-day/iu.test(text) ? ['"7-day"'] : []),
    ...(DAY_ARGUMENT.test(text) ? ["an ICU argument naming days"] : []),
    ...freshnessClaims(text).map(
      (claim) => `"${claim.claim}" beside "${claim.freshness}"`,
    ),
  ];
}

function catalogueViolations(
  catalogue: Record<string, unknown>,
): readonly string[] {
  return guaranteeValues(catalogue).flatMap(([key, text]) =>
    violations(text).map((reason) => `${key}: ${reason}`),
  );
}

function withValue(
  catalogue: Record<string, unknown>,
  key: string,
  value: string,
): Record<string, unknown> {
  const copy = structuredClone(catalogue);
  const path = key.split(".");
  let node = copy;
  for (const segment of path.slice(0, -1)) {
    node = node[segment] as Record<string, unknown>;
  }
  node[path.at(-1) ?? ""] = value;
  return copy;
}

/** `content/pages/<locale>/guarantee.md`, for every locale directory that has one. */
function guaranteeContent(): readonly (readonly [string, string])[] {
  const pages = join(repoRoot, "content/pages");
  if (!existsSync(pages)) return [];
  return readdirSync(pages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pages, entry.name, "guarantee.md"))
    .filter((file) => existsSync(file))
    .map((file) => [file, readFileSync(file, "utf8")] as const);
}

describe("A11: no guarantee value promises a number of days, in any locale", () => {
  for (const locale of LOCALES) {
    it(`${locale}: the named keys exist, and no guarantee value says "7-day", a day argument or a freshness claim`, () => {
      const catalogue = resolveCatalogue(locale);
      const keys = guaranteeValues(catalogue).map(([key]) => key);
      for (const named of NAMED_KEYS) expect(keys, named).toContain(named);
      expect(catalogueViolations(catalogue)).toStrictEqual([]);
    });

    it(`${locale}: restoring "7-day", {days} or {freshnessDays} in any named key turns the scan red`, () => {
      const catalogue = resolveCatalogue(locale);
      for (const key of NAMED_KEYS) {
        for (const restored of [
          "7-day freshness guarantee",
          "Fresh for {days} days",
          "Guaranteed for {freshnessDays, number} days",
        ]) {
          expect(
            catalogueViolations(withValue(catalogue, key, restored)).length,
            `${key} = ${restored}`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }

  it("the trust strip's guarantee name is the fresh-flower promise in every locale", () => {
    for (const locale of LOCALES) {
      const catalogue = resolveCatalogue(locale);
      const name = leaves(catalogue).find(
        ([key]) => key === "trust.guarantee.name",
      )?.[1];
      const nav = leaves(catalogue).find(
        ([key]) => key === "nav.utility.guarantee",
      )?.[1];
      // A11: "Fresh-flower promise" in every locale; `de` and `pl` reuse their own drafted
      // translation of it from the header (TASK-176), reviewed: false.
      expect(name, locale).toBe(nav);
    }
    expect(
      leaves(resolveCatalogue("en")).find(
        ([key]) => key === "trust.guarantee.name",
      )?.[1],
    ).toBe("Fresh-flower promise");
  });

  it('every content/pages/<locale>/guarantee.md says no "7-day" and makes no freshness claim', () => {
    for (const [file, text] of guaranteeContent()) {
      expect(violations(text), file).toStrictEqual([]);
    }
    // The reader itself: a guarantee page that restores the claim is reported.
    expect(
      violations("# Guarantee\n\nYour flowers stay fresh for 7 days."),
    ).not.toEqual([]);
  });
});
