/**
 * **T-18 contract half** — the product page's structured data against the page it describes
 * (spec 009 §6 "Schema types", §13 Q8, AC-18, AC-31, AC-36; T-32's schema case; TASK-130).
 *
 * Two fixtures, both written **from the builders** (`WRITE_SCHEMA_FIXTURES=1 pnpm test:contract`)
 * and compared on every run, so the documents `pnpm seo:validate` reads are the route's own:
 *
 *  - `pdp-phase0.json` — Amber Hour to Poland in `en` as every PDP is today: no florist, so the
 *    picker is `preview` and the gate is shut. `BreadcrumbList` only.
 *  - `pdp-live.json` — the same page with the gate open: a florist in Poland (spec 007's provider
 *    seam), so the picker is `live`; the destination's corridor state and the product's
 *    indexability term switched on (Phase 0 commits no `live` corridor content and no reviewed
 *    product copy, so neither has a corpus example; each is made switchable as one term, the
 *    `product-route.test.tsx` seam). Exactly one
 *    `Offer`, whose price, currency, shipping rate, cutoff and return policy are asserted against
 *    the **rendered** buy section, not against a literal (TASK-228: the bare page's `Offer` is the
 *    default tier's all-in price).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { NextIntlClientProvider, createTranslator } from "next-intl";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** The one switchable term: whether the product's copy is reviewed in this locale. */
const reads: { indexable: boolean } = { indexable: false };
vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    isProductIndexable: async (
      ...args: Parameters<typeof actual.isProductIndexable>
    ) => reads.indexable || (await actual.isProductIndexable(...args)),
  };
});

/**
 * The destination's live term. `corridorState()` is live only with a florist **and** a `live`-state
 * corridor content file for the locale, and no such file is committed (Phase 0 writes guides
 * only), so the conjunction is switched here as one term rather than by authoring content.
 */
const corridor: { live: boolean } = { live: false };
vi.mock("../../src/modules/geo/corridor.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/geo/corridor.ts")>();
  return {
    ...actual,
    corridorState: (...args: Parameters<typeof actual.corridorState>) =>
      corridor.live ? "live" : actual.corridorState(...args),
  };
});

// Poland is `demo` on committed data (spec 007 §14 A-founder-2026-10-14c clause 5; TASK-239), so
// the live fixture takes the registry-live row as well: with the florist and the corridor switch
// below, it is spec 007's Poland-open fixture.
vi.mock("../../src/config/countries.ts", async (importOriginal) =>
  (await import("../fixtures/poland-registry.ts")).withPolandLive(
    await importOriginal(),
  ),
);

const { DEFAULT_DIR, collectTypedNodes, typeProblem } =
  await import("../../scripts/seo/validate-schema.ts");
const { localeConfig } = await import("../../src/config/locales.ts");
const { isCurrencyCode } = await import("../../src/config/currencies.ts");
const {
  ListingBreadcrumb,
  productJsonLd,
  productOfferGateOpen,
  productOfferNode,
  productView,
} = await import("../../src/modules/catalog/index.ts");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");
const { formatMoney, loadMessages } =
  await import("../../src/modules/i18n/index.ts");
const { jsonLdDocument } = await import("../../src/modules/seo/index.ts");
const { CANONICAL_HOST, deploymentDescriptor } =
  await import("../../src/modules/seo/environment.ts");
const { ProductPage } =
  await import("../../src/modules/ui/product/ProductPage.tsx");
const { runSeoCli } = await import("../unit/support/seo-cli.ts");

type ProductView = NonNullable<Awaited<ReturnType<typeof productView>>>;

const repoRoot = resolve(__dirname, "../..");
const BASE = { baseUrl: `https://${CANONICAL_HOST}` } as const;
const LOCALE = "en";
const SKU = "FO-BQ-001";
/** Wednesday 9 September 2026, 09:00 Warsaw: inside the committed FX snapshot's window. */
const NOW = new Date("2026-09-09T07:00:00Z");
/** Monday 8 March 2027, 09:00 Warsaw: Women's Day, a peak day, is the first selectable date. */
const PEAK = new Date("2027-03-08T07:00:00Z");

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

const partnered = { hasActivePartners: (iso2: string) => iso2 === "PL" };

/** The indexing deployment: production on the canonical host, where only the page's terms decide. */
const deployment = deploymentDescriptor({
  APP_ENV: "production",
  NEXT_PUBLIC_SITE_URL: `https://${CANONICAL_HOST}`,
});

async function viewAt(
  now: Date,
  options: { live: boolean; indexable: boolean },
): Promise<ProductView> {
  reads.indexable = options.indexable;
  corridor.live = options.live;
  try {
    const ask = () =>
      productView(
        { locale: LOCALE, countryIso: "PL", sku: SKU },
        { parameterised: false, productLinks: true, now, deployment },
      );
    const view = options.live
      ? await withActivePartnersProvider(partnered, ask)
      : await ask();
    if (view === undefined) throw new Error(`${SKU} to PL must be a page`);
    return view;
  } finally {
    reads.indexable = false;
    corridor.live = false;
  }
}

/** The route's label: the catalogue's translator, with the crumb's value as `{name}`. */
const translator = createTranslator({
  locale: LOCALE,
  messages: loadMessages(LOCALE, [...NAMESPACES]),
});
function label(key: string, values?: Readonly<Record<string, string>>) {
  return (
    translator as unknown as (
      key: string,
      values?: Readonly<Record<string, string>>,
    ) => string
  )(key, values);
}

/** The page as the route mounts it, rendered to HTML. */
function render(view: ProductView): string {
  const page = createElement(ProductPage, {
    breadcrumb: createElement(ListingBreadcrumb, {
      crumbs: view.breadcrumb,
      phone: "trail",
    }),
    // No delivery-facts slot: the PDP mounts none (spec 009 AC-35; TASK-229).
    view,
  });
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      // `children` is the third argument, which the props type cannot see.
      {
        locale: view.locale,
        messages: loadMessages(LOCALE, [...NAMESPACES]),
        timeZone: "UTC",
      } as ComponentProps<typeof NextIntlClientProvider>,
      page,
    ),
  );
}

/** The buy section's price string: the `<bdi>` inside `[data-fo-pdp-price]`. */
function renderedPrice(html: string): string {
  // The `<bdi>` carries the island's slot name since TASK-228 (`data-fo-tier-slot="price"`).
  const match = /data-fo-pdp-price[^>]*>[\s\S]*?<bdi[^>]*>([^<]+)<\/bdi>/u.exec(
    html,
  );
  if (match?.[1] === undefined) throw new Error("no buy-section price");
  return match[1];
}

/** The live picker's cutoff line, as text. */
function renderedCutoffLine(html: string): string {
  const match = /data-fo-cutoff[^>]*>\s*<p[^>]*>([^<]+)<\/p>/u.exec(html);
  if (match?.[1] === undefined) throw new Error("no cutoff line");
  return match[1].replaceAll("&#x27;", "'");
}

/** Every clock time in a string (`product-page.spec.ts`'s `ANY_TIME`). */
const ANY_TIME = /(?<![\d.,])\d{1,2}(?:[:.]|\s?h\s?)\d{2}(?![\d.,])/gu;

function documentOf(view: ProductView): Record<string, unknown> {
  const document = jsonLdDocument(productJsonLd(view, label, BASE));
  if (document === undefined) throw new Error("the PDP emitted no JSON-LD");
  return document;
}

function nodesOfType(document: unknown, type: string) {
  return collectTypedNodes(document).filter((node) =>
    node.types.includes(type),
  );
}

/** A decimal string as integer minor units, by its digits (never through a float). */
function minorOf(decimal: string): number {
  const [whole = "", fraction = ""] = decimal.split(".");
  return Number.parseInt(`${whole}${fraction.padEnd(2, "0")}`, 10);
}

const phase0 = await viewAt(NOW, { live: false, indexable: false });
const live = await viewAt(NOW, { live: true, indexable: true });
const liveHtml = render(live);

const FIXTURES = {
  "pdp-phase0.json": { jsonld: documentOf(phase0) },
  "pdp-live.json": {
    jsonld: documentOf(live),
    // The amount and currency as the buy section prints them: `€56.90` -> `56.90`, EUR.
    visiblePrice: renderedPrice(liveHtml).replace(/[^0-9.,]/gu, ""),
    visibleCurrency: localeConfig(LOCALE).currencyDefault,
  },
} as const;

if (process.env["WRITE_SCHEMA_FIXTURES"] === "1") {
  for (const [file, fixture] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(repoRoot, DEFAULT_DIR, file),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  }
}

describe("Phase 0: the PDP emits BreadcrumbList and nothing else (AC-18, §13 Q8)", () => {
  it("the gate is shut on today's page: no florist, so no purchase path", () => {
    expect(phase0.country.state).toBe("guide");
    expect(phase0.delivery.state).toBe("preview");
    expect(productOfferGateOpen(phase0)).toBe(false);
    expect(productOfferNode(phase0, BASE)).toBeUndefined();
  });

  it("emits exactly one node, a BreadcrumbList", () => {
    const document = FIXTURES["pdp-phase0.json"].jsonld;
    expect(document["@type"]).toBe("BreadcrumbList");
    const types = collectTypedNodes(document).flatMap((node) => node.types);
    expect(new Set(types)).toStrictEqual(
      new Set(["BreadcrumbList", "ListItem"]),
    );
  });
});

describe("the gated builder on a live fixture (AC-18, AC-31, T-18)", () => {
  it("the fixture is live: indexable, destination live, picker live", () => {
    expect(live.indexability.indexable).toBe(true);
    expect(live.country.state).toBe("live");
    expect(live.delivery.state).toBe("live");
    expect(productOfferGateOpen(live)).toBe(true);
  });

  it("each term alone shuts the gate", () => {
    expect(
      productOfferGateOpen({
        ...live,
        indexability: { ...live.indexability, indexable: false },
      }),
    ).toBe(false);
    expect(
      productOfferGateOpen({
        ...live,
        country: { ...live.country, state: "guide" },
      }),
    ).toBe(false);
    expect(
      productOfferGateOpen({
        ...live,
        delivery: { ...live.delivery, state: "preview" },
      }),
    ).toBe(false);
  });

  const document = FIXTURES["pdp-live.json"].jsonld;
  const products = nodesOfType(document, "Product");
  const offers = nodesOfType(document, "Offer");
  const offer = offers[0]?.node ?? {};

  it("emits one Product with exactly one Offer, beside the BreadcrumbList", () => {
    expect(products).toHaveLength(1);
    expect(offers).toHaveLength(1);
    expect(nodesOfType(document, "BreadcrumbList")).toHaveLength(1);
    expect(products[0]?.node["name"]).toBe(live.h1.name);
  });

  it("Offer.price and priceCurrency reproduce the buy section's rendered price to the cent", () => {
    const price = String(offer["price"]);
    const currency = String(offer["priceCurrency"]);
    if (!isCurrencyCode(currency))
      throw new Error(`${currency} is no currency`);
    // The HTML's string, rebuilt from the Offer alone: a price one minor unit off, or a currency
    // that is not the page's (the destination's PLN on an `en` page quoting EUR), cannot print it.
    expect(formatMoney({ amountMinor: minorOf(price), currency }, LOCALE)).toBe(
      renderedPrice(liveHtml),
    );
    expect(currency).toBe(localeConfig(LOCALE).currencyDefault);
  });

  it("shippingRate is 0 in the offer's currency: delivery is in the price", () => {
    const shipping = offer["shippingDetails"] as Record<string, unknown>;
    expect(shipping["shippingRate"]).toStrictEqual({
      "@type": "MonetaryAmount",
      value: "0.00",
      currency: offer["priceCurrency"],
    });
  });

  it("deliveryTime.cutoffTime is the cutoff the live picker renders", () => {
    const shipping = offer["shippingDetails"] as Record<string, unknown>;
    const cutoff = (shipping["deliveryTime"] as Record<string, unknown>)[
      "cutoffTime"
    ];
    const times = renderedCutoffLine(liveHtml).match(ANY_TIME) ?? [];
    expect(times).toStrictEqual([cutoff]);
  });

  it("hasMerchantReturnPolicy is MerchantReturnNotPermitted", () => {
    expect(offer["hasMerchantReturnPolicy"]).toStrictEqual({
      "@type": "MerchantReturnPolicy",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    });
  });

  it("eligibleRegion is the destination, and no add-on, equivalent or rating reaches the markup", () => {
    expect(offer["eligibleRegion"]).toBe("PL");
    const serialised = JSON.stringify(document);
    for (const addon of live.addons) {
      expect(serialised).not.toContain(addon.nameKey);
    }
    for (const property of ["aggregateRating", "review", "AggregateOffer"]) {
      expect(serialised).not.toContain(property);
    }
    for (const type of collectTypedNodes(document).flatMap((n) => n.types)) {
      expect(typeProblem(type)).toBeNull();
    }
  });

  it("emits no Product when the preselected date's total is not the buy section's price (a peak day)", async () => {
    const peak = await viewAt(PEAK, { live: true, indexable: true });
    expect(productOfferGateOpen(peak)).toBe(true);
    const selected = peak.tiers.find(
      (tier) => tier.tierKey === peak.selectedTierKey,
    );
    // The case is real only if the dated total differs from the tier's own price.
    expect(peak.price.displayPrice.amountMinor).not.toBe(
      selected?.price.amountMinor,
    );
    expect(productOfferNode(peak, BASE)).toBeUndefined();
  });
});

describe("the committed fixtures are the builders' own documents", () => {
  for (const [file, fixture] of Object.entries(FIXTURES)) {
    it(`${file} equals what the builders emit today`, () => {
      const committed = JSON.parse(
        readFileSync(join(repoRoot, DEFAULT_DIR, file), "utf8"),
      ) as unknown;
      expect(
        committed,
        `${file} is stale: regenerate it with \`WRITE_SCHEMA_FIXTURES=1 pnpm test:contract\``,
      ).toStrictEqual(fixture);
    });
  }

  it("`pnpm seo:validate` (schema) passes on both", () => {
    const result = runSeoCli("validate-schema.ts", join(repoRoot, DEFAULT_DIR));
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
