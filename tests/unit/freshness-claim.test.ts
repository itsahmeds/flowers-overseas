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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DAY_ARGUMENT,
  FRESHNESS_TERMS,
  FRESHNESS_WINDOW,
  type FreshnessTerms,
  GUARANTEE_TERMS,
  SEVEN_DAY,
  freshnessClaims,
  guaranteeDayClaims,
  guaranteeTextViolations,
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

/**
 * The breaker's and reviewer's round-1 sentences (PR 265): ICU arguments of any name, digits in
 * any script, format characters, every dash, decomposed and case-folded letters, and a word or a
 * `+` between the number and the day word. Each passed the scan on `e6a4fa76`.
 */
const ROUND_1_MUST_FAIL = [
  // An ICU argument of any name, and a plural's `#`.
  "Fresh for {count} days.",
  "Stays fresh for {n, number} days after delivery.",
  "Fresh for {n, plural, one {# day} other {# days}}.",
  "{n, plural, other {fresh for # days}}",
  "fresh for {tage}",
  "świeże przez {dni}",
  // Digits in any script.
  "fresh for \u0667 days",
  "fresh for \u096d days",
  "fresh for \uff17 days",
  "Frisch für \u0667 Tage.",
  // Format characters and entities between the number and the day word.
  "Fresh for 7\u200bdays.",
  "Fresh for 7\u2060days.",
  "fresh for 7\u00addays",
  "fresh for 7&nbsp;days",
  "fresh for 7&#160;days",
  // Every dash, spaced or not.
  "fresh for 7\u2011days",
  "7\u2012days fresh",
  "7\u2014day freshness",
  "7 \u2013 day freshness",
  "7\u2015day freshness",
  "7\u2212days fresh",
  // Decomposed and case-folded letters.
  "świeże przez 7 dni".normalize("NFD"),
  "Siebentägige Frische".normalize("NFD"),
  "DREISSIG TAGE FRISCH",
  "dreissig Tage frisch",
  "DREI\u1e9eIG TAGE FRISCH",
  "FRESH FOR SEVEN DAYS",
  // A word or a `+` between the number and the day word.
  "Fresh for 7 full days.",
  "7 volle Tage frisch",
  "fresh for 7+ days",
  "fresh for seven long days",
  "fresh for 7 business days",
  "7\u00bd days fresh",
] as const;

const MUST_FAIL: readonly string[] = [
  ...SPEC_MUST_FAIL,
  ...TERM_MUST_FAIL,
  ...ROUND_1_MUST_FAIL,
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
        // The sentence as the scan read it: normalised and lower-cased.
        sentence: "our bouquets stay fresh for 7 days.",
      },
    ]);
  });

  it("fails every round-1 dodge: any ICU argument, any digit, format characters, any dash, NFD, \u00df, a word between", () => {
    for (const sentence of ROUND_1_MUST_FAIL) {
      expect(freshnessClaims(sentence).length, sentence).toBeGreaterThan(0);
    }
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

/** Each guarantee word beside a day count, and the retired string in every hyphen and locale. */
const GUARANTEE_MUST_FAIL = [
  "7 day guarantee",
  "7\u2011day guarantee",
  "Seven-day guarantee",
  "a guaranteed 7 days",
  "7-Tage-Garantie",
  "Garantie für 7 Tage",
  "7-dniowa gwarancja",
  "Gwarancja 7 dni",
  "our 7-day promise",
  "Unser 7-Tage-Versprechen",
  "obietnica 7 dni",
] as const;

describe("A11: one guarantee value, all four checks (guaranteeTextViolations)", () => {
  it("passes the shipped promise in every language", () => {
    for (const text of [
      ...MUST_PASS,
      "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
      "We redeliver or refund, your choice.",
      "The guarantee",
    ]) {
      expect(guaranteeTextViolations(text), text).toEqual([]);
    }
  });

  it("each check fires on the value only it reads, so deleting any one turns this red", () => {
    const checks = (text: string): readonly string[] =>
      [...new Set(guaranteeTextViolations(text).map((v) => v.check))].sort();
    // The retired "7-day" with no freshness or guarantee word beside it.
    expect(checks("Your 7-day plan.")).toEqual(["sevenDay"]);
    expect(checks("Your 7\u2011day plan.")).toEqual(["sevenDay"]);
    // `{days}` in a value with no freshness word, no guarantee word and no day word after it.
    expect(checks("Delivered within {days}.")).toEqual(["dayArgument"]);
    // A freshness claim with no 7 and no guarantee word.
    expect(checks("Fresh for 5 days.")).toEqual(["freshnessClaim"]);
    // A day count beside a guarantee word, with no 7 and no freshness word.
    expect(checks("5-Tage-Garantie")).toEqual(["guaranteeDays"]);
  });

  it("catches a day count beside every guarantee word, in every locale", () => {
    for (const text of GUARANTEE_MUST_FAIL) {
      expect(guaranteeTextViolations(text).length, text).toBeGreaterThan(0);
      expect(
        guaranteeDayClaims(text).length + (SEVEN_DAY.test(text) ? 1 : 0),
        text,
      ).toBeGreaterThan(0);
    }
  });

  it("goes red when any single guarantee word is deleted", () => {
    const survivors = branchDeletions(GUARANTEE_TERMS)
      .filter(({ mutant }) =>
        GUARANTEE_MUST_FAIL.every(
          (text) => guaranteeDayClaims(text, mutant).length > 0,
        ),
      )
      .map(({ branch }) => branch);
    expect(survivors).toStrictEqual([]);
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

/** What A11 forbids in one guarantee value, as readable reasons (`guaranteeTextViolations`). */
function violations(text: string): readonly string[] {
  return guaranteeTextViolations(text).map((v) => `${v.check}: ${v.detail}`);
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

/** `content/pages/<locale>/guarantee.md` under `root`, for every locale directory that has one. */
function guaranteeContent(
  root: string = repoRoot,
): readonly (readonly [string, string])[] {
  const pages = join(root, "content/pages");
  if (!existsSync(pages)) return [];
  return readdirSync(pages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pages, entry.name, "guarantee.md"))
    .filter((file) => existsSync(file))
    .map((file) => [file, readFileSync(file, "utf8")] as const);
}

describe("A11: the readers read what they claim to (positive controls)", () => {
  it("selects every infoPages.* value and every key with a guarantee, fresh or promise segment, and nothing else", () => {
    // The shipped catalogues have no `infoPages` key and no `promise` segment yet (TASK-182 adds
    // them), so the selector is proven on a catalogue built for it.
    const catalogue = {
      infoPages: { guarantee: { body: "Fresh for 7 days." } },
      help: { promise: "Guaranteed for 7 days." },
      trust: { guarantee: { name: "7-day guarantee" } },
      product: { trust: { freshness: { title: "Fresh for {days} days" } } },
      faq: { photo: { answer: "They stay fresh for 7 days." } },
      checkout: { action: { pay: "Pay" } },
    };
    expect(guaranteeValues(catalogue).map(([key]) => key)).toStrictEqual([
      "infoPages.guarantee.body",
      "help.promise",
      "trust.guarantee.name",
      "product.trust.freshness.title",
    ]);
    expect(
      catalogueViolations(catalogue).map((line) => line.split(":")[0]),
    ).toEqual(
      expect.arrayContaining([
        "infoPages.guarantee.body",
        "help.promise",
        "trust.guarantee.name",
        "product.trust.freshness.title",
      ]),
    );
    // A11's scope: copy outside the guarantee keys (the FAQ) is not read (TASK-172 brief).
    expect(catalogueViolations(catalogue).join("\n")).not.toContain("faq.");
  });

  it("reads content/pages/<locale>/guarantee.md and nothing else under content/pages", () => {
    const root = mkdtempSync(join(tmpdir(), "fo-freshness-"));
    try {
      mkdirSync(join(root, "content/pages/de"), { recursive: true });
      mkdirSync(join(root, "content/pages/en"), { recursive: true });
      writeFileSync(
        join(root, "content/pages/de/guarantee.md"),
        "# Garantie\n\nIhre Blumen bleiben 7 Tage frisch.\n",
      );
      writeFileSync(join(root, "content/pages/en/about.md"), "# About\n");
      const found = guaranteeContent(root);
      expect(found.map(([file]) => file)).toStrictEqual([
        join(root, "content/pages/de/guarantee.md"),
      ]);
      expect(violations(found[0]?.[1] ?? "")).not.toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
          // Round 1 (PR 265): each passed the scan on `e6a4fa76`.
          "7 day guarantee",
          "7\u2011day guarantee",
          "7-Tage-Garantie",
          "7-dniowa gwarancja",
          "Delivered within {days}",
          "Fresh for {count} days.",
          "Fresh for {n, plural, one {# day} other {# days}}.",
          "Fresh for 7\u200bdays.",
          "Fresh for 7 full days.",
          "Frisch für \u0667 Tage.",
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
      expect(name, locale).toBe(
        {
          en: "Fresh-flower promise",
          "en-gb": "Fresh-flower promise",
          de: "Frische-Versprechen",
          pl: "Obietnica świeżych kwiatów",
        }[locale],
      );
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
