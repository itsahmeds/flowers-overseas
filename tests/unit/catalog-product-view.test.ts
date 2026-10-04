/**
 * `productView()` over the committed data — the Phase 0 half of spec 009 **AC-16** and the model
 * half of **AC-21** (§5.2, §6, §8, §13 design round Q3/Q4; T-16 unit half, T-21, T-22; TASK-125).
 *
 * Every amount below is an **exact minor-unit integer** read off the committed dataset and the
 * committed ECB snapshot (`fxAsOf 2026-09-08`), and every one of them is the figure
 * `docs/design/wireframes/product-desktop.dc.html` prints: Amber Hour (`FO-BQ-001`) to Poland is
 * 199 / 229 / 259 zł, projected to £40.90 / £46.90 / £52.90 for `en-gb`; the add-on column is
 * 25 / 35 / 18 / 39 / 0 zł at 23 %; the stale-FX state quotes PLN 229.00. `Intl` appears nowhere
 * in these assertions — formatting is the page's, and a formatted string would hide a
 * one-minor-unit error behind rounding.
 *
 * The states that need a fixture registry (`preview`, `live`) are in
 * `tests/unit/catalog-product-view-live.test.ts`, which mocks `countries.ts` and therefore needs its
 * own module graph; the term-by-term wiring of the descriptor is in
 * `tests/unit/catalog-product-view-wiring.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DATE_TOTALS_MAX_BYTES,
  DATE_TOTALS_MAX_DATES,
  DATE_TOTALS_MAX_TIERS,
  DateTotalsSchema,
  ProductViewSchema,
  listProductPages,
  productDescriptor,
  productPageIndexability,
  productView,
} from "../../src/modules/catalog/product.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";
import { formatPercentFromBasisPoints } from "../../src/modules/i18n/format.ts";
import { isProductIndexable } from "../../src/modules/catalog/read.ts";
import { corridorState } from "../../src/modules/geo/index.ts";
import { DeliveryWindowSchema } from "../../src/modules/geo/delivery/schemas.ts";
import {
  INDEXABILITY_TERMS,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  deploymentDescriptor,
} from "../../src/modules/seo/index.ts";

/** The committed snapshot's second day: FX is live, so `en-gb` converts PLN into GBP. */
const FX_LIVE = new Date("2026-09-09T07:00:00Z");
/** Three weeks later: past the 48-hour bound, so every projection falls back to PLN. */
const FX_STALE = new Date("2026-10-01T07:00:00Z");

const AMBER = "FO-BQ-001";

/** Production on the canonical host: the one deployment in which `index,follow` is possible. */
const INDEXING = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
  VERCEL_ENV: "production",
});
const PREVIEW = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://preview.example.com",
});

async function amber(
  locale: string,
  countryIso: string,
  options: Partial<Parameters<typeof productView>[1]> = {},
) {
  const view = await productView(
    { locale, countryIso, sku: AMBER },
    { parameterised: false, now: FX_LIVE, deployment: PREVIEW, ...options },
  );
  if (view === undefined)
    throw new Error(`no view for ${locale}/${countryIso}`);
  return view;
}

describe("one price, VAT and delivery included (§8, AC-21 model half)", () => {
  it("prints each tier's own all-in price, projected into the locale's currency (en-gb → GBP)", async () => {
    const view = await amber("en-gb", "PL");
    expect(view.tiers.map((tier) => [tier.tierKey, tier.price])).toEqual([
      ["stems_12", { amountMinor: 4090, currency: "GBP" }],
      ["stems_18", { amountMinor: 4690, currency: "GBP" }],
      ["stems_24", { amountMinor: 5290, currency: "GBP" }],
    ]);
    expect(view.fx).toEqual({ state: "converted" });
  });

  it("quotes the destination's own amounts where the locale's currency is the destination's (pl → PLN)", async () => {
    const view = await amber("pl", "PL");
    expect(view.tiers.map((tier) => tier.price)).toEqual([
      { amountMinor: 19_900, currency: "PLN" },
      { amountMinor: 22_900, currency: "PLN" },
      { amountMinor: 25_900, currency: "PLN" },
    ]);
    expect(view.fx).toEqual({ state: "native" });
  });

  it("prints the x-default locale's own figures (en → EUR), each tier projected on its own", async () => {
    const view = await amber("en", "PL");
    expect(view.tiers.map((tier) => [tier.tierKey, tier.price])).toEqual([
      ["stems_12", { amountMinor: 4790, currency: "EUR" }],
      ["stems_18", { amountMinor: 5490, currency: "EUR" }],
      ["stems_24", { amountMinor: 6190, currency: "EUR" }],
    ]);
    expect(view.price.displayPrice).toEqual({
      amountMinor: 5490,
      currency: "EUR",
    });
    expect(view.fx).toEqual({ state: "converted" });
  });

  it("prices the related row on the page's clock: GBP beside a GBP summary, PLN beside a PLN one", async () => {
    // The wall clock is not the page's: priced on it, the cards would quote whatever today's FX
    // state is, whatever the summary beside them says (`/review 101` RC-1).
    const converted = await amber("en-gb", "PL", { now: FX_LIVE });
    expect(converted.price.displayPrice.currency).toBe("GBP");
    expect(converted.related.map((card) => card.price.currency)).toEqual(
      Array.from({ length: 6 }, () => "GBP"),
    );

    const stale = await amber("en-gb", "PL", { now: FX_STALE });
    expect(stale.price.displayPrice.currency).toBe("PLN");
    expect(stale.related.map((card) => card.price.currency)).toEqual(
      Array.from({ length: 6 }, () => "PLN"),
    );
  });

  it("preselects the default tier, and its price is the one price the page quotes", async () => {
    const view = await amber("en-gb", "PL");
    expect(view.selectedTierKey).toBe("stems_18");
    expect(view.price.displayPrice).toEqual({
      amountMinor: 4690,
      currency: "GBP",
    });
    expect(view.price.vatRateBp).toBe(800);
    expect(view.price.deliveryIncluded).toBe(true);
    expect(view.price.vatLabelKey).toBe("catalog.price.inclusive");
  });

  it("honours a valid `?tier=` and falls back to the default on an unknown one — never an error", async () => {
    const chosen = await amber("en-gb", "PL", {
      selection: { tierKey: "stems_24" },
    });
    expect(chosen.selectedTierKey).toBe("stems_24");
    expect(chosen.price.displayPrice.amountMinor).toBe(5290);

    const unknown = await amber("en-gb", "PL", {
      selection: { tierKey: "stems_99", date: "2026-09-10" },
    });
    expect(unknown.selectedTierKey).toBe("stems_18");
    expect(unknown.price.displayPrice.amountMinor).toBe(4690);
    // No date can be chosen where the picker is `unavailable`, so the parameter is ignored.
    expect(unknown.selectedDate).toBeUndefined();
  });

  it("falls back to the destination's currency on stale FX, says so, and moves every figure with it", async () => {
    const view = await amber("en-gb", "PL", { now: FX_STALE });
    expect(view.fx).toEqual({
      state: "fallback",
      noticeKey: "catalog.availability.fxUnavailable",
    });
    expect(view.price.displayPrice).toEqual({
      amountMinor: 22_900,
      currency: "PLN",
    });
    expect(view.price.fxReasonKey).toBe("catalog.availability.fxUnavailable");
    // One clock, one currency: no tier is left quoting GBP beside a PLN summary.
    expect(view.tiers.map((tier) => tier.price.currency)).toEqual([
      "PLN",
      "PLN",
      "PLN",
    ]);
  });
});

describe("add-on rows in the destination's currency at their own VAT rate (design round Q4, AC-23)", () => {
  it("prints Poland's five offerable add-ons in PLN on an en-gb page quoting GBP", async () => {
    const view = await amber("en-gb", "PL");
    expect(view.price.displayPrice.currency).toBe("GBP");
    expect(
      view.addons.map((line) => [line.key, line.price, line.vatRateBp]),
    ).toEqual([
      ["chocolates", { amountMinor: 2500, currency: "PLN" }, 2300],
      ["vase", { amountMinor: 3500, currency: "PLN" }, 2300],
      ["balloon", { amountMinor: 1800, currency: "PLN" }, 2300],
      ["plush", { amountMinor: 3900, currency: "PLN" }, 2300],
      // The card is free and still a line (spec 005 §2).
      ["card", { amountMinor: 0, currency: "PLN" }, 2300],
    ]);
    // Wine is absent because `addon.wine.PL` is off, and the add-on rate is not the flowers' 8 %.
    expect(view.addons.map((line) => line.key)).not.toContain("wine");
    expect(view.addons.every((line) => line.vatRateBp !== 800)).toBe(true);
  });

  it("states each add-on's own VAT rate in words — 23 %, never the flowers' 8 % beside it", async () => {
    const view = await amber("en-gb", "PL");
    // The expected text is pinned as well as derived, so a formatter that printed nothing would
    // not pass by agreeing with itself.
    const twentyThree = formatPercentFromBasisPoints(2300, "en-gb");
    expect(twentyThree).toBe("23%");
    expect(view.addons.map((line) => [line.key, line.vatRateText])).toEqual([
      ["chocolates", twentyThree],
      ["vase", twentyThree],
      ["balloon", twentyThree],
      ["plush", twentyThree],
      ["card", twentyThree],
    ]);
  });

  it("carries no selection state of any kind on a row — nothing can arrive pre-ticked", async () => {
    const view = await amber("en-gb", "PL");
    for (const line of view.addons) {
      expect(Object.keys(line).sort()).toEqual([
        "key",
        "nameKey",
        "price",
        "vatRateBp",
        "vatRateText",
      ]);
    }
  });
});

describe("the delivery block in Phase 0 (§2, AC-8's model half)", () => {
  it("lists no date in a destination with no `operations` block, and the totals table is empty per tier", async () => {
    // Germany: TASK-124 authors Poland's block "and **no other country's**" (§13 Q3).
    const view = await amber("en", "DE");
    expect(view.delivery.state).toBe("unavailable");
    expect(view.delivery.dates).toEqual([]);
    expect(view.selectedDate).toBeUndefined();
    expect(view.totals).toEqual({ stems_12: {}, stems_18: {}, stems_24: {} });
    expect(view.trust).toEqual(["substitution", "freshnessGuarantee"]);
    // The calendar's own honesty refinements accept what the view carries.
    expect(DeliveryWindowSchema.safeParse(view.delivery).success).toBe(true);
  });
});

describe("the page's other blocks come from the one model (§5.2, §5.3)", () => {
  it("prints the artboard's six-level trail, the product as a linked leaf, from the parent page's own crumbs", async () => {
    const view = await amber("en-gb", "PL");
    expect(
      view.breadcrumb.map((crumb) => [
        crumb.labelKey,
        crumb.labelValue,
        crumb.href,
        crumb.current,
      ]),
    ).toEqual([
      ["common.homeLink", undefined, "/en-gb", false],
      ["breadcrumb.destinations", undefined, "/en-gb/send-flowers-to", false],
      [
        "destinations.pl.name",
        undefined,
        "/en-gb/send-flowers-to/poland",
        false,
      ],
      ["breadcrumb.shopRoot", undefined, "/en-gb/poland/flowers", false],
      ["breadcrumb.entity", "Roses", "/en-gb/poland/flowers/roses", false],
      [
        "breadcrumb.entity",
        "Amber Hour",
        "/en-gb/poland/product/amber-hour",
        true,
      ],
    ]);
    expect(view.path).toBe("/en-gb/poland/product/amber-hour");
  });

  it("links the category crumb under the locale's own slug (pl authored `roze` in TASK-106)", async () => {
    const view = await amber("pl", "PL");
    expect(view.breadcrumb.map((crumb) => crumb.href)).toEqual([
      "/pl",
      "/pl/wyslij-kwiaty",
      undefined,
      "/pl/polska/kwiaty",
      "/pl/polska/kwiaty/roze",
      "/pl/polska/produkt/amber-hour",
    ]);
    // The country crumb was a 404 (`/pl/wyslij-kwiaty/polska`) until TASK-113's corridor rule; the category crumb this case is about is unchanged.
    expect(view.breadcrumb[2]).toStrictEqual({
      labelKey: "destinations.pl.name",
      current: false,
    });
    expect(view.breadcrumb[2]?.href).toBe(undefined);
  });

  it("links the country to its corridor guide only where that guide has a page in the view's locale (TASK-113)", async () => {
    // `pl` has no corridor page, so no `corridorPath`; `en` keeps the published guide.
    const pl = await amber("pl", "PL");
    expect("corridorPath" in pl.country).toBe(false);
    expect(pl.country.corridorPath).toBe(undefined);
    const en = await amber("en", "PL");
    expect(en.country.corridorPath).toBe("/en/send-flowers-to/poland");
    // `/review 98` round 4, HOLE 5 ACCEPTABLE (TASK-127's carry-forward): `en-gb` has its own
    // published guide, so a gate that dropped every locale but `en` must go red here too.
    expect((await amber("en-gb", "PL")).country.corridorPath).toBe(
      "/en-gb/send-flowers-to/poland",
    );
  });

  it("shows at most six related products, never itself, in spec 005's deterministic order", async () => {
    const view = await amber("en-gb", "PL");
    expect(view.related.map((card) => card.productId)).toEqual([
      "FO-GS-001",
      "FO-PT-005",
      "FO-BQ-013",
      "FO-PT-008",
      "FO-BQ-003",
      "FO-GS-002",
    ]);
    // Tiles, not links, until spec 009's `product` link id is published (008 §13 Q8).
    expect(view.related.every((card) => card.href === undefined)).toBe(true);
  });

  it("composes the heading from the untranslated name and the localised descriptor keys", async () => {
    const view = await amber("en-gb", "PL");
    expect(view.h1).toEqual({
      key: "catalog.descriptor.name",
      name: "Amber Hour",
      formKey: "catalog.descriptor.form.bouquet",
      flowerKey: "catalog.descriptor.flower.roses",
    });
    const messages = JSON.parse(
      readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    const lookup = (key: string): unknown =>
      key
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node !== null && typeof node === "object"
              ? (node as Record<string, unknown>)[part]
              : undefined,
          messages,
        );
    for (const key of [view.h1.key, view.h1.formKey, view.h1.flowerKey]) {
      expect(typeof lookup(key ?? ""), key).toBe("string");
    }
  });

  it("answers `undefined` for every shape that is not a page — never a substitute", async () => {
    for (const identity of [
      { locale: "en", countryIso: "PL", sku: "FO-BQ-999" },
      { locale: "xx", countryIso: "PL", sku: AMBER },
      { locale: "en", countryIso: "GB", sku: AMBER },
      { locale: "en", countryIso: "PL" },
      "not an identity",
    ]) {
      await expect(
        productView(identity, { parameterised: false, now: FX_LIVE }),
      ).resolves.toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* ProductViewSchema: strict, with no field for a dishonest claim (AC-21/22). */
/* -------------------------------------------------------------------------- */

/** Every field §5.2 names as absent, plus the review-shaped ones AC-22 lists. */
const FORBIDDEN_FIELDS = [
  "fromPrice",
  "oldPrice",
  "rating",
  "reviewCount",
  "aggregateRating",
  "review",
  "badge",
  "countdownSeconds",
  "relativeDayLabel",
  "ctaAddToBasket",
] as const;

describe("`ProductViewSchema` refuses every field it has no business carrying (T-21, T-22)", () => {
  it("accepts the real view unchanged — the control, so a refusal below is the key's doing", async () => {
    const view = await amber("en-gb", "PL");
    expect(ProductViewSchema.safeParse(view).success).toBe(true);
  });

  for (const field of FORBIDDEN_FIELDS) {
    it(`refuses \`${field}\` at the top level and inside every nested object`, async () => {
      const view = await amber("en-gb", "PL");
      const planted = structuredClone(view) as Record<string, unknown>;
      const places: readonly (readonly [string, (v: never) => void])[] = [
        ["view", (v: Record<string, unknown>) => (v[field] = 1)],
        [
          "price",
          (v: { price: Record<string, unknown> }) => (v.price[field] = 1),
        ],
        [
          "tiers[0]",
          (v: { tiers: Record<string, unknown>[] }) => {
            const tier = v.tiers[0];
            if (tier !== undefined) tier[field] = 1;
          },
        ],
        [
          "addons[0]",
          (v: { addons: Record<string, unknown>[] }) => {
            const line = v.addons[0];
            if (line !== undefined) line[field] = 1;
          },
        ],
        [
          "product",
          (v: { product: Record<string, unknown> }) => (v.product[field] = 1),
        ],
        [
          "delivery",
          (v: { delivery: Record<string, unknown> }) => (v.delivery[field] = 1),
        ],
        ["h1", (v: { h1: Record<string, unknown> }) => (v.h1[field] = 1)],
        ["fx", (v: { fx: Record<string, unknown> }) => (v.fx[field] = 1)],
        [
          "indexability",
          (v: { indexability: Record<string, unknown> }) =>
            (v.indexability[field] = 1),
        ],
      ];
      for (const [where, plant] of places) {
        const copy = structuredClone(planted);
        plant(copy as never);
        const result = ProductViewSchema.safeParse(copy);
        expect(result.success, `${field} in ${where}`).toBe(false);
        expect(
          result.error?.issues.some(
            (issue) =>
              issue.code === "unrecognized_keys" && issue.keys.includes(field),
          ),
          `${field} in ${where}`,
        ).toBe(true);
      }
    });
  }

  it("refuses a view whose price is not the selected configuration's — one minor unit is enough", async () => {
    const view = await amber("en-gb", "PL");
    const off = structuredClone(view);
    off.price = {
      ...off.price,
      displayPrice: { ...off.price.displayPrice, amountMinor: toMinor(4691) },
    };
    const result = ProductViewSchema.safeParse(off);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "price",
      "displayPrice",
      "amountMinor",
    ]);
  });

  it("refuses a tier quoting a second currency beside the summary's", async () => {
    const view = await amber("en-gb", "PL");
    const mixed = structuredClone(view);
    const [first, ...rest] = mixed.tiers;
    if (first === undefined) throw new Error("no tier");
    mixed.tiers = [
      { ...first, price: { amountMinor: toMinor(19_900), currency: "PLN" } },
      ...rest,
    ];
    const result = ProductViewSchema.safeParse(mixed);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "tiers",
      0,
      "price",
      "currency",
    ]);
  });

  it("refuses a stale-FX state the projection does not have, and a fallback without its sentence", async () => {
    const converted = await amber("en-gb", "PL");
    const lied = structuredClone(converted);
    lied.fx = {
      state: "fallback",
      noticeKey: "catalog.availability.fxUnavailable",
    };
    expect(ProductViewSchema.safeParse(lied).success).toBe(false);

    const stale = await amber("en-gb", "PL", { now: FX_STALE });
    const silent = structuredClone(stale);
    silent.fx = { state: "fallback" };
    expect(ProductViewSchema.safeParse(silent).success).toBe(false);
  });
});

describe("`DateTotalsSchema`'s bounds (§5.2: ≤ 5 tiers × ≤ 21 dates, ≤ 4 096 B)", () => {
  /** `count` consecutive October days from the 1st. */
  const days = (count: number): string[] =>
    Array.from(
      { length: count },
      (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
    );
  const table = (
    tiers: number,
    dates: number,
    amount = 123_456,
    prefix = "stems_",
  ) =>
    Object.fromEntries(
      Array.from({ length: tiers }, (_, tier) => [
        `${prefix}${String(tier)}`,
        Object.fromEntries(days(dates).map((date) => [date, amount])),
      ]),
    );

  it("accepts the largest table the spec allows", () => {
    expect(
      DateTotalsSchema.safeParse(
        table(DATE_TOTALS_MAX_TIERS, DATE_TOTALS_MAX_DATES),
      ).success,
    ).toBe(true);
  });

  it("refuses a sixth tier, a twenty-second date and a table over the byte budget", () => {
    expect(
      DateTotalsSchema.safeParse(table(DATE_TOTALS_MAX_TIERS + 1, 1)).success,
    ).toBe(false);
    expect(
      DateTotalsSchema.safeParse(table(1, DATE_TOTALS_MAX_DATES + 1)).success,
    ).toBe(false);
    // Inside both counts and every value a safe integer — outside the bytes only, so the byte
    // refinement is the one that has to catch it.
    const heavy = table(
      DATE_TOTALS_MAX_TIERS,
      DATE_TOTALS_MAX_DATES,
      Number.MAX_SAFE_INTEGER,
      "x".repeat(200),
    );
    expect(
      new TextEncoder().encode(JSON.stringify(heavy)).length,
    ).toBeGreaterThan(DATE_TOTALS_MAX_BYTES);
    const result = DateTotalsSchema.safeParse(heavy);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      expect.stringMatching(/serialises to \d+ B/),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Indexability: spec 007's engine, and a matrix that can fail (AC-16, T-16). */
/* -------------------------------------------------------------------------- */

/**
 * §6's terms, each named so a red case says which gate broke. `locale` and `environment` are the
 * two the engine gathers itself: `en` is indexable and `de` is not (spec 003's review gate), and
 * only production on the canonical host is an indexing environment.
 */
const DIMENSIONS = [
  "exists",
  "countryLive",
  "productIndexable",
  "unparameterised",
  "localeIndexable",
  "indexingEnvironment",
] as const;

interface MatrixCase {
  readonly name: string;
  readonly terms: {
    readonly exists: boolean;
    readonly countryLive: boolean;
    readonly productIndexable: boolean;
    readonly unparameterised: boolean;
  };
  readonly locale: "en" | "de";
  readonly deployment: typeof INDEXING;
  readonly expected: typeof INDEX_FOLLOW | typeof NOINDEX_FOLLOW;
}

/** Every combination, named by the terms that fail — `all hold` is the one index case. */
const MATRIX: readonly MatrixCase[] = Array.from(
  { length: 1 << DIMENSIONS.length },
  (_, mask) => {
    const on = (term: (typeof DIMENSIONS)[number]): boolean =>
      (mask & (1 << DIMENSIONS.indexOf(term))) !== 0;
    const failing = DIMENSIONS.filter((term) => !on(term));
    return {
      name: failing.length === 0 ? "all hold" : `fails: ${failing.join(" + ")}`,
      terms: {
        exists: on("exists"),
        countryLive: on("countryLive"),
        productIndexable: on("productIndexable"),
        unparameterised: on("unparameterised"),
      },
      locale: on("localeIndexable") ? "en" : "de",
      deployment: on("indexingEnvironment") ? INDEXING : PREVIEW,
      expected: failing.length === 0 ? INDEX_FOLLOW : NOINDEX_FOLLOW,
    };
  },
);

describe("the PDP descriptor resolves through spec 007's `indexability()` (§6, AC-16, T-16)", () => {
  it("covers all 64 combinations of the six terms, exactly one of which indexes", () => {
    expect(MATRIX).toHaveLength(64);
    expect(MATRIX.filter((row) => row.expected === INDEX_FOLLOW)).toHaveLength(
      1,
    );
  });

  it.each(MATRIX)("$name → $expected", (row) => {
    const verdict = productPageIndexability(
      row.locale,
      row.terms,
      row.deployment,
    );
    expect(verdict.directive).toBe(row.expected);
    expect(verdict.indexable).toBe(row.expected === INDEX_FOLLOW);
  });

  it("states every term of the conjunction — none left to an omission (the fail-open shape of PR 93)", () => {
    for (const row of MATRIX) {
      const verdict = productPageIndexability(
        row.locale,
        row.terms,
        row.deployment,
      );
      for (const term of INDEXABILITY_TERMS) {
        expect(typeof verdict.terms[term], `${row.name}: ${term}`).toBe(
          "boolean",
        );
      }
    }
    const descriptor = productDescriptor("en", {
      exists: true,
      countryLive: false,
      productIndexable: true,
      unparameterised: true,
    });
    expect(descriptor).toEqual({
      pageType: "product",
      locale: "en",
      exists: true,
      reviewed: true,
      operational: false,
      unparameterised: true,
    });
  });

  it("answers `noindex,follow` for every PDP in every locale by **data**, even in the indexing environment", async () => {
    const pages = await listProductPages();
    // 84 products × 7 destinations × four locales (TASK-121's pin).
    expect(pages).toHaveLength(84 * 7 * 4);
    for (const page of pages) {
      const verdict = productPageIndexability(
        page.locale,
        {
          exists: true,
          countryLive: corridorState(page.countryIso, page.locale) === "live",
          productIndexable: await isProductIndexable(
            page.sku,
            page.locale,
            page.countryIso,
          ),
          unparameterised: true,
        },
        INDEXING,
      );
      expect(verdict.directive, page.path).toBe(NOINDEX_FOLLOW);
    }
  });

  it("marks the rendered view `noindex,follow` from the same one answer, in all four locales", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const view = await amber(locale, "PL", { deployment: INDEXING });
      expect(view.indexability, locale).toEqual({
        indexable: false,
        directive: NOINDEX_FOLLOW,
      });
    }
  });

  it("writes no robots directive anywhere in `src/modules/` outside `modules/seo`, nor in the PDP route (AC-16's grep)", () => {
    // A walk, not a list: a literal planted in any module — `pricing/resolve.ts`, which this task
    // touches, or a file nobody thought to name — is a second `noindex` branch (`/break 101` G4).
    // `src/app/` and `src/lib/` carry robots literals that predate spec 009 (layouts, health,
    // basic auth, the robots headers), so of `src/app/` the walk takes the one file spec 009 adds
    // a page to: the depth-4 route that serves the PDP (`/review 101` HOLE 12, TASK-127).
    const modules = fileURLToPath(
      new URL("../../src/modules/", import.meta.url),
    );
    const route = fileURLToPath(
      new URL(
        "../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx",
        import.meta.url,
      ),
    );
    const seo = join(modules, "seo");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return path === seo ? [] : walk(path);
        return /\.(?:ts|tsx)$/.test(name) ? [path] : [];
      });
    const files = [...walk(modules), route];
    // The walk reaches the files the AC names, and steps over the one module allowed to spell it.
    expect(files).toContain(join(modules, "catalog/product.ts"));
    expect(files).toContain(join(modules, "catalog/pricing/resolve.ts"));
    expect(files).toContain(join(modules, "geo/delivery/calendar.ts"));
    expect(files.some((file) => file.startsWith(`${seo}/`))).toBe(false);
    expect(files.length).toBeGreaterThan(100);
    for (const path of files) {
      const file = relative(modules, path);
      expect(robotsDirectivesIn(readFileSync(path, "utf8")), file).toEqual([]);
    }
  });

  it("the robots scan catches every spelling it claims to (its own control)", () => {
    // The scan above passes on a clean tree, so it is proved here on the shapes it must refuse:
    // any casing of a directive, and the object form Next's `Metadata` takes.
    for (const planted of [
      'const robots = "noindex,follow";',
      'return { robots: "NoIndex, Follow" };',
      "export const metadata = { robots: { index: false } };",
      "meta({ robots: { index: true, follow: true } });",
      'headers.set("X-Robots-Tag", "NOFOLLOW");',
      'const directive = "Index, Follow";',
    ]) {
      expect(robotsDirectivesIn(planted), planted).not.toEqual([]);
    }
    // …and lets through what it must: comments, and the engine's imported constants.
    expect(
      robotsDirectivesIn(
        "// a noindex page\n/* robots: { index: false } */\nconst d = NOINDEX_FOLLOW ?? INDEX_FOLLOW;",
      ),
    ).toEqual([]);
  });

  it('builds the PDP\'s descriptor in one place: no hand-built `pageType: "product"` reaches `pageIndexability()` (`/review 101` HOLE 12)', () => {
    // `productDescriptor()` is the one builder, and it fails closed on an omitted term (F1). A
    // second `{ pageType: "product", … }` object handed straight to spec 007's engine would skip
    // that, so outside `modules/seo` no file may both spell the product page type and call the
    // engine — and `product.ts` spells it exactly once, inside `productDescriptor()`.
    const src = fileURLToPath(new URL("../../src/", import.meta.url));
    const seo = join(src, "modules/seo");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return path === seo ? [] : walk(path);
        return /\.(?:ts|tsx)$/.test(name) ? [path] : [];
      });
    const files = walk(src);
    const builder = join(src, "modules/catalog/product.ts");
    expect(files).toContain(builder);
    expect(files).toContain(
      join(src, "app/[locale]/[segment]/[child]/[grandchild]/page.tsx"),
    );
    for (const path of files) {
      const code = codeOf(readFileSync(path, "utf8"));
      const spelled = code.match(PRODUCT_PAGE_TYPE) ?? [];
      if (path === builder) {
        expect(spelled, relative(src, path)).toHaveLength(1);
        const inBuilder =
          /export function productDescriptor\([\s\S]*?\n\}\n/u.exec(
            code,
          )?.[0] ?? "";
        expect(inBuilder.match(PRODUCT_PAGE_TYPE) ?? []).toHaveLength(1);
        continue;
      }
      if (spelled.length === 0) continue;
      // The engine's *name*, not only a call to it: an aliased import (`pageIndexability as x`)
      // or a namespace read (`seo["pageIndexability"]`) still has to spell it once.
      expect(code, relative(src, path)).not.toMatch(/\bpageIndexability\b/u);
    }
    // Its control: the shape it refuses, planted.
    expect(
      handBuiltProductDescriptor(
        'pageIndexability({ pageType: "product", locale, exists: true }, deployment);',
      ),
    ).toBe(true);
    expect(
      handBuiltProductDescriptor(
        "const d = { pageType: 'product' };\nreturn seo.pageIndexability(d, env);",
      ),
    ).toBe(true);
    expect(
      handBuiltProductDescriptor(
        'import { pageIndexability as judge } from "@/modules/seo";\njudge({ pageType: "product" }, env);',
      ),
    ).toBe(true);
    expect(
      handBuiltProductDescriptor(
        "pageIndexability(productDescriptor(locale, terms), deployment);",
      ),
    ).toBe(false);
  });
});

/** Source with its comments removed: comments explain the rules and have to say the words. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Every robots directive spelled in `source`'s code, in any casing, and in the object form Next's
 * `Metadata` takes (`robots: { index: false }`). The engine's imported constants (`NOINDEX_FOLLOW`,
 * `INDEX_FOLLOW`) are the sanctioned way to name one, so they are removed before the
 * case-insensitive match rather than excused by a case-sensitive one.
 */
function robotsDirectivesIn(source: string): string[] {
  const code = codeOf(source).replace(/\b(?:NO)?INDEX_FOLLOW\b/g, "");
  return [
    /noindex/giu,
    /\bindex\s*,\s*follow/giu,
    /nofollow/giu,
    /["']robots["']/giu,
    /x-robots-tag/giu,
    /\brobots\s*:/giu,
    /\bindex\s*:\s*(?:true|false)\b/giu,
  ].flatMap((pattern) => code.match(pattern) ?? []);
}

/** `pageType: "product"` in any quoting or spacing. */
const PRODUCT_PAGE_TYPE = /\bpageType\s*:\s*["'`]product["'`]/gu;

/** A file that spells the product page type and calls spec 007's engine itself. */
function handBuiltProductDescriptor(source: string): boolean {
  const code = codeOf(source);
  return (
    (code.match(PRODUCT_PAGE_TYPE) ?? []).length > 0 &&
    /\bpageIndexability\b/u.test(code)
  );
}
