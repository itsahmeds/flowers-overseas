/**
 * T-15 (unit half): each hard rule of spec 012b §2.5 has a fixture that the shared validators
 * (the admin save's) and a file gate (`catalogue:check` or `seed:check`) reject with the same
 * rule id; each soft rule is soft (AC-15; TASK-297). The admin save's own refusal and the audit
 * row's reason are the integration half (`tests/integration/catalog-cms.test.ts`).
 */
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  type CopyShape,
  HARD_RULES,
  SOFT_RULES,
  copyViolations,
  hardViolations,
  openPriceViolations,
  priceViolations,
  slugUniqueViolations,
  slugViolations,
  softViolations,
  tierViolations,
} from "../../src/modules/catalog/validate/index.ts";
import {
  catalogueCheckInput,
  checkCatalogue,
} from "../../scripts/catalogue-check.ts";
import { checkSeedDataset, readSeedTree } from "../../seed/check.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

const SIXTY_WORDS = Array.from({ length: 70 }, () => "bloom").join(" ");
const COPY: CopyShape = {
  name: "Amber Hour",
  description: SIXTY_WORDS,
  seoTitle: "Amber Hour: hand-tied orange roses",
  seoDescription: "Orange roses hand-tied with eucalyptus.",
};
const NO_FLORISTS = { floristTerms: [] as string[] };

function ids(list: readonly { readonly rule: string }[]): string[] {
  return [...new Set(list.map((item) => item.rule))].sort();
}

describe("the shared rules (spec 012b §2.5)", () => {
  it("clean copy, slug, sizes and price pass", () => {
    expect(copyViolations(COPY, NO_FLORISTS)).toEqual([]);
    expect(slugViolations("amber-hour")).toEqual([]);
    expect(
      tierViolations([
        { tierKey: "stems_9", stems: 9, isDefault: false },
        { tierKey: "stems_15", stems: 15, isDefault: true },
      ]),
    ).toEqual([]);
    expect(
      priceViolations({
        amountMinor: 22900,
        currency: "PLN",
        countryCurrency: "PLN",
      }),
    ).toEqual([]);
  });

  const copyCases: readonly [string, Partial<CopyShape>, string][] = [
    [
      "copy.banned_word",
      { description: `${SIXTY_WORDS} partner` },
      "description",
    ],
    ["copy.price_literal", { name: "Roses 229 zł" }, "name"],
    [
      "copy.contact",
      { description: `${SIXTY_WORDS} hello@example.com` },
      "description",
    ],
    [
      "copy.contact",
      { seoDescription: "Call +48 22 123 45 67" },
      "seoDescription",
    ],
    [
      "copy.contact",
      { seoDescription: "See www.example.org" },
      "seoDescription",
    ],
    ["copy.competitor", { name: "Better than Interflora" }, "name"],
    ["copy.seo_title_length", { seoTitle: "x".repeat(61) }, "seoTitle"],
    [
      "copy.seo_description_length",
      { seoDescription: "y".repeat(156) },
      "seoDescription",
    ],
  ];
  it.each(copyCases)(
    "%s is hard and names its field",
    (rule, change, field) => {
      const found = copyViolations({ ...COPY, ...change }, NO_FLORISTS);
      expect(found).toContainEqual({ rule, field, severity: "hard" });
    },
  );

  it("copy.florist_name: a non-demo florist's legal name or city label is refused", () => {
    const terms = { floristTerms: ["Kwiaciarnia pod Lipą", "Kraków"] };
    expect(
      ids(
        copyViolations({ ...COPY, name: "Kwiaciarnia pod Lipą roses" }, terms),
      ),
    ).toEqual(["copy.florist_name"]);
    expect(
      ids(copyViolations({ ...COPY, seoTitle: "Roses from Kraków" }, terms)),
    ).toEqual(["copy.florist_name"]);
  });

  it("the limits are exact: 60 and 155 characters pass", () => {
    expect(
      copyViolations(
        { ...COPY, seoTitle: "x".repeat(60), seoDescription: "y".repeat(155) },
        NO_FLORISTS,
      ),
    ).toEqual([]);
  });

  it("copy.description_words is soft at 59 and 91 words, and passes at 60 and 90", () => {
    const words = (n: number): string =>
      Array.from({ length: n }, () => "rose").join(" ");
    for (const n of [59, 91]) {
      expect(
        softViolations(
          copyViolations({ ...COPY, description: words(n) }, NO_FLORISTS),
        ),
      ).toEqual([
        {
          rule: "copy.description_words",
          field: "description",
          severity: "soft",
        },
      ]);
    }
    for (const n of [60, 90]) {
      expect(
        copyViolations({ ...COPY, description: words(n) }, NO_FLORISTS),
      ).toEqual([]);
    }
  });

  it("slug.shape and slug.unique", () => {
    for (const slug of [
      "Amber-Hour",
      "amber_hour",
      "amber/hour",
      "amber--hour",
      "różа",
      "",
    ]) {
      expect(ids(slugViolations(slug))).toEqual(["slug.shape"]);
    }
    expect(
      ids(slugUniqueViolations("amber-hour", new Set(["amber-hour"]))),
    ).toEqual(["slug.unique"]);
    expect(slugUniqueViolations("amber-hour", new Set(["sun-hour"]))).toEqual(
      [],
    );
  });

  it("sizes: none, no or two defaults, even, thirteen, a key that misnames the stems", () => {
    expect(ids(tierViolations([]))).toEqual(["tier.none"]);
    expect(
      ids(tierViolations([{ tierKey: "stems_9", stems: 9, isDefault: false }])),
    ).toEqual(["tier.default_one"]);
    expect(
      ids(
        tierViolations([
          { tierKey: "stems_9", stems: 9, isDefault: true },
          { tierKey: "stems_11", stems: 11, isDefault: true },
        ]),
      ),
    ).toEqual(["tier.default_one"]);
    expect(
      tierViolations([{ tierKey: "stems_16", stems: 16, isDefault: true }]),
    ).toEqual([
      { rule: "tier.stem_count_odd", field: "tiers.0.stems", severity: "hard" },
    ]);
    expect(
      ids(
        tierViolations([{ tierKey: "stems_13", stems: 13, isDefault: true }]),
      ),
    ).toEqual(["tier.stem_count_thirteen"]);
    expect(
      ids(
        tierViolations([{ tierKey: "stems_12", stems: 11, isDefault: true }]),
      ),
    ).toEqual(["tier.stem_key"]);
  });

  it("prices: integer minor units, the country's currency, one open row; band and ending soft", () => {
    const base = { currency: "PLN", countryCurrency: "PLN" } as const;
    expect(ids(priceViolations({ ...base, amountMinor: 229.5 }))).toEqual([
      "price.integer_minor",
    ]);
    expect(ids(priceViolations({ ...base, amountMinor: 0 }))).toEqual([
      "price.integer_minor",
    ]);
    expect(
      ids(
        priceViolations({
          amountMinor: 22900,
          currency: "EUR",
          countryCurrency: "PLN",
        }),
      ),
    ).toEqual(["price.currency"]);
    expect(priceViolations({ ...base, amountMinor: 22950 })).toEqual([
      { rule: "price.rounding", field: "amount", severity: "soft" },
    ]);
    expect(
      priceViolations({
        ...base,
        amountMinor: 99900,
        band: { fromMinor: 9900, toMinor: 39900 },
      }),
    ).toEqual([{ rule: "price.band", field: "amount", severity: "soft" }]);
    expect(
      ids(
        openPriceViolations([
          { key: "a", activeTo: null },
          { key: "a", activeTo: null },
        ]),
      ),
    ).toEqual(["price.one_open"]);
    expect(
      openPriceViolations([
        { key: "a", activeTo: "2026-11-01" },
        { key: "a", activeTo: null },
      ]),
    ).toEqual([]);
  });

  it("every rule id is either hard or soft, never both", () => {
    expect(
      HARD_RULES.filter((rule) =>
        (SOFT_RULES as readonly string[]).includes(rule),
      ),
    ).toEqual([]);
  });
});

describe("catalogue:check refuses the same faults with the same ids (AC-15)", () => {
  const clean = catalogueCheckInput();
  const firstTier = clean.tiers.find((tier) => tier.stems !== null);
  if (firstTier === undefined) throw new Error("the dataset has a stem tier");

  function rulesAfter(
    change: (
      input: ReturnType<typeof catalogueCheckInput>,
    ) => ReturnType<typeof catalogueCheckInput>,
  ): string[] {
    return ids(
      checkCatalogue(change(clean)).filter(
        (problem): problem is typeof problem & { rule: string } =>
          problem.rule !== undefined,
      ),
    );
  }

  it("the clean dataset carries no shared-rule problem", () => {
    expect(rulesAfter((input) => input)).toEqual([]);
  });

  const stemCases: readonly [string, number, string][] = [
    ["tier.stem_count_odd", 16, "stems_16"],
    ["tier.stem_count_thirteen", 13, "stems_13"],
    ["tier.stem_key", 11, "stems_12"],
  ];
  it.each(stemCases)("%s", (rule, stems, tierKey) => {
    const admin = tierViolations([{ tierKey, stems, isDefault: true }]).map(
      (item) => item.rule,
    );
    expect(admin).toContain(rule);
    const gate = rulesAfter((input) => ({
      ...input,
      tiers: input.tiers.map((tier) =>
        tier === firstTier ? { ...tier, stems, tierKey } : tier,
      ),
    }));
    expect(gate).toContain(rule);
  });

  it("tier.default_one", () => {
    const gate = rulesAfter((input) => ({
      ...input,
      tiers: input.tiers.map((tier) =>
        tier.sku === firstTier.sku ? { ...tier, isDefault: true } : tier,
      ),
    }));
    expect(gate).toContain("tier.default_one");
  });

  it("price.integer_minor, price.currency, price.one_open", () => {
    const row = clean.countryPrices.find(
      (price) => price.activeTo === null && price.surchargeKind === null,
    );
    if (row === undefined) throw new Error("the dataset has an open price");
    expect(
      rulesAfter((input) => ({
        ...input,
        countryPrices: input.countryPrices.map((price) =>
          price === row ? { ...price, retailMinor: 229.5 } : price,
        ),
      })),
    ).toContain("price.integer_minor");
    const other = row.currency === "EUR" ? "PLN" : "EUR";
    expect(
      rulesAfter((input) => ({
        ...input,
        countryPrices: input.countryPrices.map((price) =>
          price === row ? { ...price, currency: other } : price,
        ),
      })),
    ).toContain("price.currency");
    expect(
      rulesAfter((input) => ({
        ...input,
        countryPrices: [...input.countryPrices, row],
      })),
    ).toContain("price.one_open");
  });
});

describe("seed:check refuses the same copy and slug faults with the same ids (AC-15)", () => {
  const faults: readonly [string, Record<string, string>][] = [
    ["slug.shape", { slug: "Amber_Hour" }],
    ["copy.banned_word", { name: "Amber partner" }],
    ["copy.price_literal", { seoDescription: "Only 229 zł" }],
    ["copy.contact", { seoDescription: "Write to hello@example.com" }],
    ["copy.competitor", { seoDescription: "Like Interflora" }],
    ["copy.seo_title_length", { seoTitle: `Amber Hour: ${"x".repeat(60)}` }],
    ["copy.seo_description_length", { seoDescription: "y".repeat(156) }],
  ];
  let found: Map<string, string[]>;

  beforeAll(async () => {
    const tree0 = await readSeedTree(repoRoot);
    const file = tree0.raw.get("copy/en/products.json") as {
      rows: Record<string, unknown>[];
    };
    const rows = file.rows.map((row, index) => {
      const fault = faults[index];
      return fault === undefined ? row : { ...row, ...fault[1] };
    });
    const tree = await readSeedTree(
      repoRoot,
      new Map([["copy/en/products.json", { ...file, rows }]]),
    );
    found = new Map();
    for (const problem of checkSeedDataset(tree)) {
      const list = found.get(problem.key) ?? [];
      list.push(problem.rule);
      found.set(problem.key, list);
    }
    file.rows.slice(0, faults.length).forEach((row, index) => {
      found.set(
        `fault:${String(index)}`,
        found.get(`product:${String(row["key"])} (en)`) ?? [],
      );
    });
  }, 60_000);

  it.each(faults.map((fault, index) => [fault[0], index] as const))(
    "%s",
    (rule, index) => {
      expect(found.get(`fault:${String(index)}`)).toContain(rule);
      const row = { ...COPY, ...faults[index]?.[1] };
      const admin = [
        ...slugViolations(faults[index]?.[1]["slug"] ?? "amber-hour"),
        ...hardViolations(copyViolations(row, NO_FLORISTS)),
      ].map((item) => item.rule);
      expect(admin).toContain(rule);
    },
  );
});
