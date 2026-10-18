/**
 * The product page's JSON-LD, unit half (spec 009 §6 "Schema types", §13 Q8, AC-18, AC-36; T-18;
 * TASK-130). The contract half (`tests/contract/pdp-schema.test.ts`) holds the live fixture's
 * price, currency, shipping, cutoff and return-policy identities against the rendered page; the
 * e2e half (`tests/e2e/schema.spec.ts`) scans the served HTML of every PDP.
 *
 * Here:
 *
 *  1. **The builder's refusals** — a name with an em dash, a spaced hyphen or a spaced en dash
 *     (AC-36), a non-zero shipping rate, a shipping rate in another currency, an empty price.
 *  2. **Phase 0 emits `BreadcrumbList` only**, on every product in every locale and every published
 *     destination: none of the eight types and properties AC-18 forbids, and no `Product`.
 *  3. **The `BreadcrumbList` is the visible trail**: its names are the `<li>`s `ListingBreadcrumb`
 *     renders from the same view, in order, in every locale; `item` exactly where the trail links.
 */
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ListingBreadcrumb,
  type ProductView,
  listProductPages,
  productJsonLd,
  productOfferGateOpen,
  productOfferNode,
  productView,
} from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";
import {
  type ProductOfferInput,
  jsonLdDocument,
  jsonLdScript,
  productOffer,
} from "../../src/modules/seo";
import { pdpJsonLdProblems } from "../support/pdp-jsonld-scan";

const BASE = { baseUrl: "https://flowersoverseas.com" } as const;
const NOW = new Date("2026-09-09T07:00:00Z");
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const NAMESPACES = [
  "breadcrumb",
  "a11y",
  "destinations",
  "shop",
  "common",
] as const;

/** AC-18's eight, as the spec writes them, for the scanner-bites case. */
const AC_18_EIGHT = [
  "Product",
  "Offer",
  "AggregateOffer",
  "aggregateRating",
  "review",
  "Event",
  "LocalBusiness",
  "FloristShop",
] as const;

/** The served `<script>` of a node list, exactly as `<JsonLd>` renders it. */
function served(nodes: Parameters<typeof jsonLdScript>[0]): string {
  return `<script type="application/ld+json">${jsonLdScript(nodes) ?? ""}</script>`;
}

function labelFor(locale: string) {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale as never, [...NAMESPACES]),
  }) as unknown as (
    key: string,
    values?: Readonly<Record<string, string>>,
  ) => string;
  return (key: string, values?: Readonly<Record<string, string>>) =>
    t(key, values);
}

async function viewOf(
  locale: string,
  countryIso: string,
  sku: string,
): Promise<ProductView> {
  const view = await productView(
    { locale, countryIso, sku },
    { parameterised: false, now: NOW },
  );
  if (view === undefined) throw new Error(`${locale}/${countryIso}/${sku}`);
  return view;
}

/* -------------------------------------------------------------------------- */

const OFFER: ProductOfferInput = {
  name: "Amber Hour",
  sku: "FO-BQ-001",
  path: "/en/poland/product/amber-hour",
  offer: {
    price: "54.90",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    eligibleRegion: "PL",
    priceValidUntil: null,
    shippingRate: { value: "0.00", currency: "EUR" },
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  },
  cutoffTime: "14:00",
};

describe("productOffer(): one Product, one Offer, and its refusals (AC-18, AC-36)", () => {
  it("builds one Offer with the shipping rate, cutoff and return policy it is given", () => {
    const node = productOffer(OFFER, BASE);
    expect(node["@type"]).toBe("Product");
    expect(node["url"]).toBe(
      "https://flowersoverseas.com/en/poland/product/amber-hour",
    );
    const offer = node["offers"] as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer["price"]).toBe("54.90");
    expect(offer["priceCurrency"]).toBe("EUR");
    expect(offer["eligibleRegion"]).toBe("PL");
    expect(offer["shippingDetails"]).toStrictEqual({
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: "0.00",
        currency: "EUR",
      },
      deliveryTime: { "@type": "ShippingDeliveryTime", cutoffTime: "14:00" },
    });
    expect(offer["hasMerchantReturnPolicy"]).toStrictEqual({
      "@type": "MerchantReturnPolicy",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    });
  });

  it("carries priceValidUntil when the offer has one, and only then (`/break 258` hole 5)", () => {
    const dated = productOffer(
      { ...OFFER, offer: { ...OFFER.offer, priceValidUntil: "2026-12-31" } },
      BASE,
    )["offers"] as Record<string, unknown>;
    expect(dated["priceValidUntil"]).toBe("2026-12-31");
    const undated = productOffer(OFFER, BASE)["offers"] as Record<
      string,
      unknown
    >;
    expect("priceValidUntil" in undated).toBe(false);
  });

  it("states no deliveryTime where the page renders no cutoff", () => {
    const offer = productOffer({ ...OFFER, cutoffTime: undefined }, BASE)[
      "offers"
    ] as Record<string, Record<string, unknown>>;
    expect(offer["shippingDetails"]?.["deliveryTime"]).toBeUndefined();
  });

  it("refuses a name with an em dash, a spaced hyphen or a spaced en dash (AC-36)", () => {
    for (const name of [
      "Amber Hour—roses",
      "Amber Hour — roses",
      "Amber Hour - roses",
      "Amber Hour -roses",
      "Amber Hour – roses",
    ]) {
      expect(() => productOffer({ ...OFFER, name }, BASE), name).toThrow(
        /AC-36/u,
      );
    }
    expect(
      productOffer({ ...OFFER, name: "Forget-me-not" }, BASE)["name"],
    ).toBe("Forget-me-not");
  });

  it("refuses a non-zero shipping rate, and one in another currency", () => {
    expect(() =>
      productOffer(
        {
          ...OFFER,
          offer: {
            ...OFFER.offer,
            shippingRate: { value: "0.01", currency: "EUR" },
          },
        },
        BASE,
      ),
    ).toThrow(/not zero/u);
    expect(() =>
      productOffer(
        {
          ...OFFER,
          offer: {
            ...OFFER.offer,
            shippingRate: { value: "0", currency: "PLN" },
          },
        },
        BASE,
      ),
    ).toThrow(/one page, one currency/u);
  });

  it("refuses an empty price, currency or availability", () => {
    for (const field of ["price", "priceCurrency", "availability"] as const) {
      expect(
        () =>
          productOffer(
            { ...OFFER, offer: { ...OFFER.offer, [field]: " " } },
            BASE,
          ),
        field,
      ).toThrow(new RegExp(`Offer\\.${field} is empty`, "u"));
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("Phase 0: every PDP emits BreadcrumbList and none of AC-18's forbidden types", () => {
  it("scans one product per published destination in every locale, and every product to Poland in en", async () => {
    const pages = await listProductPages();
    const sample = new Map<string, (typeof pages)[number]>();
    for (const page of pages) {
      const key = `${page.locale}|${page.countryIso}`;
      if (!sample.has(key)) sample.set(key, page);
      if (page.locale === "en" && page.countryIso === "PL") {
        sample.set(`${key}|${page.sku}`, page);
      }
    }
    // Four locales x seven destinations, plus the 84 products to Poland in `en`.
    expect(sample.size).toBeGreaterThanOrEqual(28 + 80);

    for (const page of sample.values()) {
      const view = await viewOf(page.locale, page.countryIso, page.sku);
      const where = `${page.locale}/${page.countryIso}/${page.sku}`;
      expect(productOfferGateOpen(view), where).toBe(false);

      // The e2e scan's own function, over the bytes the route would serve.
      expect(
        pdpJsonLdProblems(
          served(productJsonLd(view, labelFor(view.locale), BASE)),
          where,
        ),
      ).toStrictEqual([]);
    }
    // ~110 views at ~60 ms each: the whole Poland catalogue is AC-36's "every SKU" in `en`.
  }, 60_000);

  it("the scanner bites: each of AC-18's eight, planted at any depth, is reported", () => {
    const trail = {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" },
        { "@type": "ListItem", position: 2, name: "Amber Hour" },
      ],
    };
    expect(pdpJsonLdProblems(served([trail]), "clean")).toStrictEqual([]);
    for (const term of AC_18_EIGHT) {
      const planted = /^[A-Z]/u.test(term)
        ? { ...trail, about: { "@type": term, name: "x" } }
        : { ...trail, about: { "@type": "Thing", [term]: { name: "x" } } };
      expect(pdpJsonLdProblems(served([planted]), term), term).toContain(
        /^[A-Z]/u.test(term) ? `${term}: @type ${term}` : `${term}: ${term}`,
      );
    }
    // The two properties' own types, planted as types with no property key beside them
    // (`/break 258` hole 2): dropping `AggregateRating` or `Review` from the list goes red here.
    for (const type of ["AggregateRating", "Review"]) {
      const planted = { ...trail, about: { "@type": type, name: "x" } };
      expect(pdpJsonLdProblems(served([planted]), type)).toStrictEqual([
        `${type}: @type ${type}`,
      ]);
    }
    // Inside `@graph` and inside arrays (`/break 258` hole 3): a `Product` beside the trail in a
    // two-node graph, and an `Offer` in an array-valued property.
    expect(
      pdpJsonLdProblems(
        served([trail, { "@type": "Product", name: "Amber Hour" }]),
        "graph",
      ),
    ).toStrictEqual(["graph: @type Product"]);
    expect(
      pdpJsonLdProblems(
        served([{ ...trail, about: [{ "@type": "Offer", price: "1" }] }]),
        "array",
      ),
    ).toStrictEqual(["array: @type Offer"]);
    // A dashed name anywhere in the trail (AC-36, `/break 258` hole 6).
    expect(
      pdpJsonLdProblems(
        served([
          {
            ...trail,
            itemListElement: [
              trail.itemListElement[0],
              {
                "@type": "ListItem",
                position: 2,
                name: "Amber Hour \u2014 roses",
              },
            ],
          },
        ]),
        "dash",
      ),
    ).toStrictEqual([
      'dash: name "Amber Hour \u2014 roses" carries a dash (AC-36)',
    ]);
    // Every branch of the rule, one side at a time (`/break 258` round 2): a spaced hyphen and a
    // spaced en dash, each with the space only before, only after, and on both sides.
    const named = (name: string): string =>
      served([
        {
          ...trail,
          itemListElement: [
            trail.itemListElement[0],
            { "@type": "ListItem", position: 2, name },
          ],
        },
      ]);
    for (const name of [
      "Amber Hour - roses",
      "Amber Hour -roses",
      "Amber Hour- roses",
      "Amber Hour \u2013 roses",
      "Amber Hour \u2013roses",
      "Amber Hour\u2013 roses",
    ]) {
      expect(pdpJsonLdProblems(named(name), name), name).toStrictEqual([
        `${name}: name ${JSON.stringify(name)} carries a dash (AC-36)`,
      ]);
    }
    // An unspaced hyphen or en dash inside a word or a range is not a dash between phrases.
    for (const name of [
      "Hand-tied roses",
      "Forget-me-not",
      "12\u201318 stems",
    ]) {
      expect(pdpJsonLdProblems(named(name), name), name).toStrictEqual([]);
    }
    // And a second block, or a missing trail, is a problem too.
    expect(
      pdpJsonLdProblems(served([trail]) + served([trail]), "two").length,
    ).toBeGreaterThan(0);
    expect(pdpJsonLdProblems("<p>no script</p>", "none").length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The view with the gate open (a florist, a live picker, an indexable page). Phase 0's view of a
 * `preview` destination has no preselected date, so its `price` is the selected tier's own.
 */
function gateOpen(view: ProductView): ProductView {
  return {
    ...view,
    country: { ...view.country, state: "live" },
    delivery: { ...view.delivery, state: "live" },
    indexability: { ...view.indexability, indexable: true },
  };
}

describe("productOfferNode(): the Offer is the buy section's price, or nothing (AC-31, `/break 258` holes 4, 5)", () => {
  it("emits on the open gate when the view's price is the selected tier's", async () => {
    const open = gateOpen(await viewOf("en", "PL", "FO-BQ-001"));
    expect(productOfferNode(open, BASE)?.["@type"]).toBe("Product");
  });

  it("emits nothing when the selected tier is quoted in another currency at the same amount", async () => {
    const open = gateOpen(await viewOf("en", "PL", "FO-BQ-001"));
    const other: ProductView["price"]["displayPrice"]["currency"] =
      open.price.displayPrice.currency === "PLN" ? "EUR" : "PLN";
    const tiers = open.tiers.map((tier) =>
      tier.tierKey === open.selectedTierKey
        ? { ...tier, price: { ...tier.price, currency: other } }
        : tier,
    );
    const selected = tiers.find(
      (tier) => tier.tierKey === open.selectedTierKey,
    );
    // Same digits, other currency: only the currency term can tell them apart.
    expect(selected?.price.amountMinor).toBe(
      open.price.displayPrice.amountMinor,
    );
    expect(productOfferNode({ ...open, tiers }, BASE)).toBeUndefined();
  });

  it("emits nothing for a destination with no offer (not `live` in the registry), even with the gate forced open", async () => {
    // Germany is a `demo` destination: `offerProjection()` answers `null` there.
    const open = gateOpen(await viewOf("en", "DE", "FO-BQ-001"));
    expect(productOfferNode(open, BASE)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */

/** The visible trail as `ListingBreadcrumb` renders it: each `<li>`'s text, its `href` if any. */
function visibleTrail(
  view: ProductView,
): { name: string; href: string | undefined }[] {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={view.locale}
      messages={loadMessages(view.locale as never, [...NAMESPACES])}
      timeZone="UTC"
    >
      <ListingBreadcrumb crumbs={view.breadcrumb} phone="trail" />
    </NextIntlClientProvider>,
  );
  const trail = html.slice(html.indexOf("data-fo-breadcrumb-trail"));
  return [...trail.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gu)].map((match) => {
    const inner = match[1] ?? "";
    const href = /href="([^"]+)"/u.exec(inner)?.[1];
    const name = inner
      .replaceAll(/<[^>]+>/gu, "")
      .replaceAll("&#x27;", "'")
      .replaceAll("&amp;", "&")
      .replace(/^\s*\/\s*/u, "")
      .trim();
    return { name, href };
  });
}

describe("the BreadcrumbList is the visible trail, in order and label (AC-18)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: names, positions and links equal the rendered <li>s`, async () => {
      const view = await viewOf(locale, "PL", "FO-BQ-001");
      const visible = visibleTrail(view);
      expect(visible.length).toBeGreaterThanOrEqual(3);

      const document = jsonLdDocument(
        productJsonLd(view, labelFor(locale), BASE),
      );
      const items = (document?.["itemListElement"] ?? []) as readonly Record<
        string,
        unknown
      >[];
      expect(items.map((item) => item["name"])).toStrictEqual(
        visible.map((crumb) => crumb.name),
      );
      expect(items.map((item) => item["position"])).toStrictEqual(
        visible.map((_, index) => index + 1),
      );
      expect(items.map((item) => item["item"])).toStrictEqual(
        visible.map((crumb) =>
          crumb.href === undefined
            ? undefined
            : `https://flowersoverseas.com${crumb.href}`,
        ),
      );
      // The last item is the product's own name, the `<h1>`'s (AC-36's "the breadcrumb's last
      // item is the product name").
      expect(items.at(-1)?.["name"]).toBe(view.h1.name);
    });
  }
});
