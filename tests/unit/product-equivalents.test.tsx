/**
 * The approximate-equivalents lines on the product page (spec 004 §14 A21 clause 6 (b)–(e); spec
 * 009 AC-21 amended; TASK-179, after TASK-178's helper).
 *
 * `productView()` computes two lines at its one `now`: `equivalents.price`, under the H1's tier
 * price, and `equivalents.total`, under the summary's total. `ProductPage` and `PriceSummary` print
 * each through `catalog.price.equivalents` with `equivalentsMessageValues()` (the `format.ts` list
 * formatter, a disjunction). The cases, each watched red by mutating its subject:
 *
 *  - **The line is printed** (a stripped line): every locale, at a clock inside the committed
 *    snapshot's window, carries exactly one line under the price and one under the total, and the
 *    English one is the one string the helper gives.
 *  - **One stale leg**: the rate rows are swapped (the provider seam, as
 *    `catalog-pricing-equivalents-legs.test.ts` does) so the charged price still converts but one
 *    leg is old or missing; the page shows the converted price and no line at all.
 *  - **Two clocks**: a `Date` that is current on its first reading and past the 48-hour bound on
 *    every later one (`catalog-listing-one-clock.test.ts`). A view that read the clock twice would
 *    print a converted price with no line, or a line beside the stale-rate fallback; the schema
 *    also refuses a fallback view that carries a line.
 *  - **The price and the total are different amounts**: with a date fee chosen, the H1 line is the
 *    tier's and the summary line is the total's.
 *  - **Add-ons stay in the destination's currency**, and carry no line.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT } from "../../src/config/catalogue/fx.data.ts";
import type { FxRateData } from "../../src/config/catalogue/schemas.ts";

/** The rate rows the catalogue reads, swapped per case. */
let rateRows: readonly FxRateData[] = FX_SNAPSHOT;

vi.mock("../../src/modules/catalog/providers.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/catalog/providers.ts")
  >("../../src/modules/catalog/providers.ts");
  return {
    ...actual,
    catalogProviders: () => ({
      ...actual.catalogProviders(),
      fx: { fxRates: () => Promise.resolve(rateRows) },
    }),
  };
});

const { ProductViewSchema, productView } =
  await import("../../src/modules/catalog");
const { priceEquivalents } =
  await import("../../src/modules/catalog/pricing/equivalents.ts");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");
const { loadMessages } = await import("../../src/modules/i18n");
const { ProductPage } =
  await import("../../src/modules/ui/product/ProductPage.tsx");

type ProductView = NonNullable<Awaited<ReturnType<typeof productView>>>;

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const AMBER = "FO-BQ-001";

/** The committed snapshot's `as_of`, a clock inside its 48-hour window, and one past it. */
const CURRENT = "2026-09-08";
const FRESH = new Date("2026-09-09T12:00:00Z");
const STALE = new Date("2026-09-11T00:00:01Z");
/** A publication date well past the bound at `FRESH`. */
const OLD = "2026-08-31";

const NAMESPACES = [
  "product",
  "delivery",
  "catalog",
  "corridor",
  "breadcrumb",
  "shop",
  "media",
  "a11y",
  "destinations",
  "occasions",
  "common",
] as const;

const LINE = "data-fo-price-equivalents";

beforeEach(() => {
  rateRows = FX_SNAPSHOT;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function viewOf(
  locale: string,
  options: Partial<Parameters<typeof productView>[1]> = {},
): Promise<ProductView> {
  const view = await productView(
    { locale, countryIso: "PL", sku: AMBER },
    { parameterised: false, ...options },
  );
  if (view === undefined) throw new Error(`${locale}/PL/${AMBER} is a page`);
  return view;
}

function render(view: ProductView): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={view.locale}
      messages={loadMessages(view.locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      <ProductPage breadcrumb={null} facts={null} view={view} />
    </NextIntlClientProvider>,
  );
}

/** The markup between `data-fo-<block>` and the end of its element's subtree. */
function block(html: string, marker: string): string {
  const start = html.indexOf(marker);
  if (start === -1) return "";
  const open = html.lastIndexOf("<", start);
  const tag = /^<([a-z]+)/u.exec(html.slice(open))?.[1] ?? "div";
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}[\\s>]`, "gu");
  re.lastIndex = open;
  for (let hit = re.exec(html); hit !== null; hit = re.exec(html)) {
    depth += hit[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(open, html.indexOf(">", hit.index) + 1);
  }
  return html.slice(open);
}

/** The text of every equivalents line in `markup`, entities decoded. */
function lines(markup: string): string[] {
  return [...markup.matchAll(/data-fo-price-equivalents[^>]*>([^<]*)</gu)].map(
    (match) =>
      (match[1] ?? "")
        .replaceAll("&#x27;", "'")
        .replaceAll("&amp;", "&")
        .replaceAll(/[\u00a0\u202f]/gu, " "),
  );
}

/**
 * The lines of the page's own two amounts — the H1 price and the summary — and not the related
 * row's cards, which carry their own (TASK-178).
 */
function pageLines(html: string): string[] {
  return [
    ...lines(block(html, "data-fo-pdp-price")),
    ...lines(block(html, "data-fo-price-summary")),
  ];
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("A21 clause 6: the product page prints the equivalents under the price and the total", () => {
  it("prints the one English line the helper gives, under the H1 price and under the total", async () => {
    const view = await viewOf("en", { now: FRESH });
    expect(view.fx.state).toBe("converted");
    const html = render(view);
    const expected =
      "about 47.07 £, 237.05 PLN or 63.76 US$ at the rate of 8 September";
    expect(lines(block(html, "data-fo-pdp-price"))).toEqual([expected]);
    expect(lines(block(html, "data-fo-price-summary"))).toEqual([expected]);
    expect(pageLines(html)).toEqual([expected, expected]);
    // Never a second total: the line is text under the one total, not another amount element.
    expect(occurrences(html, "data-fo-price-total")).toBe(1);
  });

  it("prints `/pl`'s native złoty price with the line of the latest snapshot, in Polish", async () => {
    // Spec 009 T-21's native fixture: `/pl` to Poland is charged in złoty with no conversion, so
    // the line takes the latest snapshot at the page's clock (2026-09-08) for every leg.
    const view = await viewOf("pl", { now: FRESH });
    expect(view.fx.state).toBe("native");
    expect(view.price.displayPrice).toEqual({
      amountMinor: 22_900,
      currency: "PLN",
    });
    expect(view.price.fxAsOf).toBe(undefined);
    const expected =
      "ok. 53,04 €, 45,47 GBP lub 61,60 USD po kursie z 8 września";
    const html = render(view);
    expect(lines(block(html, "data-fo-pdp-price"))).toEqual([expected]);
    expect(lines(block(html, "data-fo-price-summary"))).toEqual([expected]);
  });

  it("prints exactly two lines in every locale, each a list of the other currencies", async () => {
    const conjunction: Record<(typeof LOCALES)[number], string> = {
      en: " or ",
      "en-gb": " or ",
      de: " oder ",
      pl: " lub ",
    };
    for (const locale of LOCALES) {
      const view = await viewOf(locale, { now: FRESH });
      const html = render(view);
      const found = pageLines(html);
      expect(found, locale).toHaveLength(2);
      expect(view.equivalents.price, locale).toBeDefined();
      for (const line of found) {
        expect(line, locale).toContain(conjunction[locale]);
      }
      // The page's own currency is never one of the equivalents (clause 6 (b)).
      const own = view.price.displayPrice.currency;
      expect(
        view.equivalents.price?.amounts.map((amount) => amount.currency),
        locale,
      ).not.toContain(own);
    }
  });

  it("prints no line past the 48-hour bound, converted page or native", async () => {
    for (const locale of LOCALES) {
      const view = await viewOf(locale, { now: STALE });
      // `/pl` to Poland is charged in złoty with no rate (native); every other locale falls back
      // to złoty and says so. Either way no leg is current, so no line.
      expect(view.fx.state, locale).toBe(
        locale === "pl" ? "native" : "fallback",
      );
      expect(view.equivalents, locale).toEqual({});
      const html = render(view);
      expect(occurrences(html, LINE), locale).toBe(0);
      expect(occurrences(html, "data-fo-fx-notice"), locale).toBe(
        locale === "pl" ? 0 : 1,
      );
    }
  });
});

describe("A21 clause 6 (d): one stale or missing leg hides the whole line", () => {
  /** Every row current, so only the leg a case ages is not. */
  function currentRows(): FxRateData[] {
    return FX_SNAPSHOT.map((row) => ({ ...row, asOf: CURRENT }));
  }

  it("prints both lines when every leg is current (the control)", async () => {
    rateRows = currentRows();
    const view = await viewOf("en", { now: FRESH });
    expect(view.fx.state).toBe("converted");
    expect(pageLines(render(view))).toHaveLength(2);
  });

  for (const leg of ["GBP", "USD"] as const) {
    it(`shows the converted euro price and no line when only EUR → ${leg} is stale`, async () => {
      rateRows = currentRows().map((row) =>
        row.base === "EUR" && row.quote === leg ? { ...row, asOf: OLD } : row,
      );
      const view = await viewOf("en", { now: FRESH });
      // The charged price still converts (EUR ↔ PLN is current): only the line goes.
      expect(view.fx.state).toBe("converted");
      expect(view.price.displayPrice.currency).toBe("EUR");
      expect(view.equivalents).toEqual({});
      expect(occurrences(render(view), LINE)).toBe(0);
    });

    it(`shows no line when the EUR → ${leg} rate is missing`, async () => {
      rateRows = currentRows().filter(
        (row) => !(row.base === "EUR" && row.quote === leg),
      );
      const view = await viewOf("en", { now: FRESH });
      expect(view.fx.state).toBe("converted");
      expect(view.equivalents).toEqual({});
      expect(occurrences(render(view), LINE)).toBe(0);
    });
  }
});

/**
 * A `Date` whose argument-less readings tick across the bound: the first is `first`, every later
 * one is `later`. Dates built from a value (parsing, arithmetic) are untouched.
 */
function stubTickingClock(first: Date, later: Date): () => number {
  const RealDate = Date;
  let readings = 0;
  class TickingDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) {
        readings += 1;
        super((readings === 1 ? first : later).getTime());
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
  }
  vi.stubGlobal("Date", TickingDate);
  return () => readings;
}

describe("one clock for the price, the fallback, the line and the date window", () => {
  it("a view built without `now` agrees with itself when the clock crosses the bound mid-render", async () => {
    const readings = stubTickingClock(FRESH, STALE);
    const view = await viewOf("en");
    expect(readings()).toBeGreaterThan(0);
    // The first reading was the current one, so the whole view is the converted state: the
    // price, the absence of the fallback sentence, both lines and the window's first day.
    expect(view.fx.state).toBe("converted");
    expect(view.price.displayPrice.currency).toBe("EUR");
    expect(view.equivalents.price?.asOf).toBe(CURRENT);
    expect(view.equivalents.total?.asOf).toBe(CURRENT);
    expect(view.delivery.dates[0]?.date).toBe("2026-09-09");
    const html = render(view);
    expect(pageLines(html)).toHaveLength(2);
    expect(html).not.toContain("data-fo-fx-notice");
  });

  /**
   * The schema's three refusals, each tried on one line at a time — `{ price }` alone and
   * `{ total }` alone — so a refinement that checked only one of the two lines goes red (`/break`
   * round 1 hole 1 on PR 170). Each injected line breaks exactly one rule.
   */
  type Line = NonNullable<ProductView["equivalents"]["price"]>;
  const refusals: readonly {
    readonly rule: string;
    readonly subject: () => Promise<{ page: ProductView; line: Line }>;
  }[] = [
    {
      rule: "a fallback price carries no line",
      subject: async () => {
        const page = await viewOf("en", { now: STALE });
        expect(page.fx.state).toBe("fallback");
        expect(page.price.fxAsOf).toBe(undefined);
        // `/pl`'s current line names no złoty, so only the one-clock rule can refuse it.
        const line = (await viewOf("pl", { now: FRESH })).equivalents.price;
        expect(line?.amounts.map((amount) => amount.currency)).not.toContain(
          "PLN",
        );
        return { page, line: line! };
      },
    },
    {
      rule: "no line names the page's own currency",
      subject: async () => {
        const page = await viewOf("en", { now: FRESH });
        // `/pl`'s line names euros, on the same snapshot date as the euro page's price.
        const line = (await viewOf("pl", { now: FRESH })).equivalents.price;
        expect(line?.amounts.map((amount) => amount.currency)).toContain("EUR");
        expect(line?.asOf).toBe(page.price.fxAsOf);
        return { page, line: line! };
      },
    },
    {
      rule: "a converted price's line is dated by the snapshot that converted it",
      subject: async () => {
        const page = await viewOf("en", { now: FRESH });
        expect(page.price.fxAsOf).toBe(CURRENT);
        const own = page.equivalents.price!;
        return { page, line: { ...own, asOf: "2026-09-07" } };
      },
    },
    {
      // The realistic bug: a helper that dates the line by the latest snapshot instead of the
      // one that converted the price (`/break` round 2 hole S2 on PR 170).
      rule: "a converted price's line is not dated by a later snapshot either",
      subject: async () => {
        const page = await viewOf("en", { now: FRESH });
        expect(page.price.fxAsOf).toBe(CURRENT);
        const own = page.equivalents.price!;
        return { page, line: { ...own, asOf: "2026-09-09" } };
      },
    },
  ];

  for (const { rule, subject } of refusals) {
    for (const which of ["price", "total"] as const) {
      it(`refuses a bad \`${which}\` line on its own: ${rule}`, async () => {
        const { page, line } = await subject();
        // The page as built parses; only the injected line is wrong.
        expect(ProductViewSchema.safeParse(page).success).toBe(true);
        const other = which === "price" ? "total" : "price";
        const equivalents = {
          ...(page.equivalents[other] === undefined
            ? {}
            : { [other]: page.equivalents[other] }),
          [which]: line,
        };
        const result = ProductViewSchema.safeParse({ ...page, equivalents });
        expect(result.success).toBe(false);
        expect(
          result.error?.issues.map((issue) => issue.path.join(".")),
        ).toContainEqual(
          expect.stringMatching(new RegExp(`^equivalents\\.${which}`, "u")),
        );
      });
    }
  }
});

describe("the H1 line is the tier's, the summary line is the total's", () => {
  it("with Women's Day chosen, the two lines convert two different amounts", async () => {
    // Every rate re-dated into a window around 1 March 2027, so the Women's Day week is current.
    rateRows = FX_SNAPSHOT.map((row) => ({ ...row, asOf: "2027-02-28" }));
    const now = new Date("2027-03-01T08:00:00Z");
    const view = await withActivePartnersProvider(
      { hasActivePartners: (iso2: string) => iso2 === "PL" },
      () => viewOf("en", { now, selection: { date: "2027-03-08" } }),
    );
    expect(view.selectedDate).toBe("2027-03-08");
    const tier = view.tiers.find(
      (option) => option.tierKey === view.selectedTierKey,
    );
    expect(tier).toBeDefined();
    // The fee makes the total larger than the tier's own price.
    expect(view.price.displayPrice.amountMinor).toBeGreaterThan(
      Number(tier?.price.amountMinor),
    );
    const base = await priceEquivalents(
      {
        displayPrice: tier!.price,
        destinationCurrencyPrice: view.price.destinationCurrencyPrice,
        fxAsOf: "2027-02-28",
      },
      now,
    );
    const total = await priceEquivalents(view.price, now);
    expect(view.equivalents.price).toEqual(base);
    expect(view.equivalents.total).toEqual(total);
    expect(view.equivalents.price).not.toEqual(view.equivalents.total);
    const html = render(view);
    const [priceLine] = lines(block(html, "data-fo-pdp-price"));
    const [totalLine] = lines(block(html, "data-fo-price-summary"));
    expect(priceLine).toBeDefined();
    expect(totalLine).toBeDefined();
    expect(priceLine).not.toBe(totalLine);
  });
});

describe("add-ons stay in the destination's currency (spec 009 E-1)", () => {
  it("prices every add-on in złoty on a euro page, with no equivalents line in the list", async () => {
    const view = await viewOf("en", { now: FRESH });
    expect(view.price.displayPrice.currency).toBe("EUR");
    expect(view.addons.length).toBeGreaterThan(0);
    expect(new Set(view.addons.map((addon) => addon.price.currency))).toEqual(
      new Set(["PLN"]),
    );
    const addons = block(render(view), "data-fo-pdp-addons");
    expect(addons).toContain("PLN");
    expect(occurrences(addons, LINE)).toBe(0);
  });
});
