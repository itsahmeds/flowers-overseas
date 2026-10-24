/**
 * **T-17** (unit half): the listing pages' `BreadcrumbList` equals the visible trail and their
 * `ItemList` equals the rendered cards (spec 008 §2 "Schema", **AC-17**; T-31; TASK-115).
 *
 * `tests/unit/seo-schema.test.tsx`'s method, applied to the six listing types: each page is rendered
 * with `react-dom/server` over the **real** messages and the **real** `listingView()`, the visible
 * trail and the visible cards are read back out of that HTML, and the nodes `listingJsonLd()`
 * builds from the same view are compared with them item by item. Nothing here is a hand-written
 * expectation of what the page shows; the page shows it.
 *
 * The fixtures are the ones T-17 names: a **paginated** listing (page 2 of the shop root and of a
 * country category over twelve products) and a **sorted** one (price ascending and descending), on
 * top of page 1 of every type. A sort that changed the grid and not the list, or a page slice the
 * list ignored, turns a case red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { isPublished } from "../../src/config/site-links";
import {
  type ListingView,
  listingItemListEntries,
  listingJsonLd,
  listingPages,
  listingView,
  occasionsIndexGroups,
} from "../../src/modules/catalog";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { OccasionsIndexPage } from "../../src/modules/catalog/ui/OccasionsIndexPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  type JsonLdNode,
  itemList,
  jsonLdDocument,
} from "../../src/modules/seo";
import { collectTypedNodes } from "../../scripts/seo/validate-schema.ts";
import {
  type ListingKind,
  listingJsonLdProblems,
  renderedCards,
  renderedOccasionEntries,
  renderedTrail,
} from "../support/listing-jsonld-scan.ts";

const BASE = { baseUrl: "https://flowersoverseas.com" } as const;
/** A fixed window start, so the rendered dates (and the index's grouping) do not move with the day. */
const FROM = "2026-09-15";

const NAMESPACES = [
  "shop",
  "categoryHub",
  "occasionHub",
  "occasionsIndex",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
  "nav",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** The route's label: next-intl's own formatter over the same catalogue, `{name}` passed through. */
function labelFor(locale: string): BreadcrumbLabel {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, [...NAMESPACES]),
  });
  return (key, values) => (t as unknown as BreadcrumbLabel)(key, values);
}

interface ListItemNode {
  readonly "@type": string;
  readonly position: number;
  readonly name: string;
  readonly item?: string;
  readonly url?: string;
}

function nodeOf(
  nodes: readonly (JsonLdNode | undefined)[],
  type: string,
): JsonLdNode | undefined {
  return nodes.find((node) => node?.["@type"] === type);
}

function listItems(node: JsonLdNode | undefined): readonly ListItemNode[] {
  if (node === undefined) throw new Error("the builder emitted no node");
  return node["itemListElement"] as readonly ListItemNode[];
}

function absolute(href: string | undefined): string | undefined {
  return href === undefined ? undefined : `${BASE.baseUrl}${href}`;
}

const productLinks = isPublished("product");

async function view(
  identity: Record<string, string>,
  options: { page?: number; sort?: "price-asc" | "price-desc" } = {},
): Promise<ListingView> {
  const found = await listingView(identity, {
    from: FROM,
    productLinks,
    ...options,
  });
  if (found === undefined) {
    throw new Error(`no listing for ${JSON.stringify(identity)}`);
  }
  return found;
}

const PAGES: Readonly<Record<string, (view: ListingView) => ReactElement>> = {
  countryShopRoot: (v) => <CountryShopRootPage view={v} />,
  countryCategory: (v) => <CountryCategoryPage view={v} />,
  countryOccasion: (v) => <CountryOccasionPage view={v} />,
  categoryHub: (v) => <CategoryHubPage view={v} />,
  occasionHub: (v) => <OccasionHubPage view={v} />,
  occasionsIndex: (v) => <OccasionsIndexPage view={v} />,
};

function renderView(v: ListingView): string {
  const page = PAGES[v.pageType];
  if (page === undefined) throw new Error(`no page for ${v.pageType}`);
  return render(page(v), v.locale);
}

/** The first country occasion that exists in `en`, read from the existence set, not named here. */
const countryOccasion = (await listingPages("en")).find(
  (page) => page.pageType === "countryOccasion",
);
if (
  countryOccasion?.countrySlug === undefined ||
  countryOccasion.slug === undefined
) {
  throw new Error("the en corpus has a country occasion page");
}

/** Every case: page 1 of each type, plus T-17's paginated and sorted fixtures. */
const CASES: readonly { readonly label: string; readonly view: ListingView }[] =
  [
    {
      label: "/en/poland/flowers (shop root, page 1)",
      view: await view({
        locale: "en",
        pageType: "countryShopRoot",
        country: "poland",
      }),
    },
    {
      label: "/en/poland/flowers?page=2 (paginated)",
      view: await view(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { page: 2 },
      ),
    },
    {
      label: "/en/poland/flowers?sort=price-asc (sorted)",
      view: await view(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { sort: "price-asc" },
      ),
    },
    {
      label: "/en-gb/poland/flowers/roses (country category, page 1)",
      view: await view({
        locale: "en-gb",
        pageType: "countryCategory",
        country: "poland",
        entity: "roses",
      }),
    },
    {
      label: "/en-gb/poland/flowers/roses?page=2 (paginated)",
      view: await view(
        {
          locale: "en-gb",
          pageType: "countryCategory",
          country: "poland",
          entity: "roses",
        },
        { page: 2 },
      ),
    },
    {
      label: "/en-gb/poland/flowers/roses?sort=price-desc (sorted)",
      view: await view(
        {
          locale: "en-gb",
          pageType: "countryCategory",
          country: "poland",
          entity: "roses",
        },
        { sort: "price-desc" },
      ),
    },
    {
      label: `${countryOccasion.path} (country occasion)`,
      view: await view({
        locale: "en",
        pageType: "countryOccasion",
        country: countryOccasion.countrySlug,
        entity: countryOccasion.slug,
      }),
    },
    {
      label: "/pl/polska/kwiaty (shop root, pl)",
      view: await view({
        locale: "pl",
        pageType: "countryShopRoot",
        country: "polska",
      }),
    },
    {
      label: "/en/flowers/hand-tied-bouquets (category hub)",
      view: await view({
        locale: "en",
        pageType: "categoryHub",
        entity: "hand-tied-bouquets",
      }),
    },
    {
      label: "/en/occasions/mothers-day (occasion hub)",
      view: await view({
        locale: "en",
        pageType: "occasionHub",
        entity: "mothers-day",
      }),
    },
    {
      label: "/en/occasions (occasions index)",
      view: await view({ locale: "en", pageType: "occasionsIndex" }),
    },
    {
      label: "/de/anlaesse (occasions index, de)",
      view: await view({ locale: "de", pageType: "occasionsIndex" }),
    },
  ];

describe("BreadcrumbList equals the visible trail on all six listing types (AC-17, T-17)", () => {
  for (const { label, view: v } of CASES) {
    it(`${label}: same names, same order, an item exactly where the trail links`, () => {
      const trail = renderedTrail(renderView(v));
      const built = listItems(
        nodeOf(listingJsonLd(v, labelFor(v.locale), BASE), "BreadcrumbList"),
      );

      expect(trail.length).toBeGreaterThanOrEqual(2);
      expect(
        built.map((item) => [
          item["@type"],
          item.position,
          item.name,
          item.item,
        ]),
      ).toStrictEqual(
        trail.map((crumb, index) => [
          "ListItem",
          index + 1,
          crumb.name,
          absolute(crumb.href),
        ]),
      );
    });
  }

  it("covers every listing page type", () => {
    expect(new Set(CASES.map((c) => c.view.pageType))).toStrictEqual(
      new Set(Object.keys(PAGES)),
    );
  });
});

describe("ItemList equals the rendered cards: count, order, names and URLs (AC-17, T-17)", () => {
  for (const { label, view: v } of CASES) {
    it(`${label}: one ListItem per rendered card, in rendered order`, () => {
      const html = renderView(v);
      const cards =
        v.pageType === "occasionsIndex"
          ? renderedOccasionEntries(html)
          : renderedCards(html);
      const node = nodeOf(
        listingJsonLd(v, labelFor(v.locale), BASE),
        "ItemList",
      );
      const built = listItems(node);

      expect(cards.length).toBeGreaterThan(0);
      expect(node?.["numberOfItems"]).toBe(cards.length);
      expect(
        built.map((item) => [
          item["@type"],
          item.position,
          item.name,
          item.url,
        ]),
      ).toStrictEqual(
        cards.map((card, index) => [
          "ListItem",
          index + 1,
          card.name,
          absolute(card.href),
        ]),
      );
    });
  }

  it("lists page 2's own slice, not page 1's (paginated fixture)", () => {
    const [first, second] = [CASES[0], CASES[1]].map((c) =>
      listItems(
        nodeOf(
          listingJsonLd(c?.view as ListingView, labelFor("en"), BASE),
          "ItemList",
        ),
      ),
    );
    const firstUrls = new Set(first?.map((item) => item.url ?? item.name));
    expect(second?.length).toBeGreaterThan(0);
    for (const item of second ?? []) {
      expect(firstUrls.has(item.url ?? item.name), item.name).toBe(false);
    }
  });

  it("follows the sort: the price-ascending list is the grid's price order (sorted fixture)", () => {
    const sorted = CASES[2]?.view as ListingView;
    const amounts = sorted.items.map((card) => BigInt(card.price.amountMinor));
    expect(amounts).toStrictEqual(
      [...amounts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(
      listItems(
        nodeOf(listingJsonLd(sorted, labelFor("en"), BASE), "ItemList"),
      ).map((item) => item.name),
    ).toStrictEqual(sorted.items.map((card) => card.name));
  });

  it("puts the lead, items[0], at position 1 on a country page (spec 008 §14 A15 (c), A16 (b))", () => {
    for (const { view: v } of CASES.filter((c) => c.view.items.length > 0)) {
      const first = listItems(
        nodeOf(listingJsonLd(v, labelFor(v.locale), BASE), "ItemList"),
      )[0];
      expect(first?.name).toBe(v.items[0]?.name);
    }
  });

  it("lists the hub's grid and not its lead figure twice", () => {
    const hub = CASES.find((c) => c.view.pageType === "categoryHub")
      ?.view as ListingView;
    const names = listingItemListEntries(hub).map((entry) => entry.name);
    expect(names).toStrictEqual(hub.hubItems.map((card) => card.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("lists each occasions-index entry once, dated then undated then everyday", () => {
    const index = CASES.find((c) => c.view.pageType === "occasionsIndex")
      ?.view as ListingView;
    const { dated, undated, everyday } = occasionsIndexGroups(index);
    expect(dated.length).toBeGreaterThan(0);
    expect(everyday.length).toBeGreaterThan(0);
    expect(
      listingItemListEntries(index).map((entry) => entry.href),
    ).toStrictEqual(
      [...dated, ...undated, ...everyday].map((entry) => entry.href),
    );
    expect(listingItemListEntries(index)).toHaveLength(
      index.occasions?.length ?? -1,
    );
  });
});

describe("the ItemList carries an order and nothing else (AC-17, AC-18)", () => {
  it("has no price, image, offer or rating at any depth on any listing", () => {
    for (const { label, view: v } of CASES) {
      const document = jsonLdDocument(
        listingJsonLd(v, labelFor(v.locale), BASE),
      );
      const serialised = JSON.stringify(document);
      for (const key of [
        "price",
        "priceCurrency",
        "offers",
        "image",
        "aggregateRating",
        "review",
      ]) {
        expect(serialised, `${label}: ${key}`).not.toContain(`"${key}"`);
      }
      const types = collectTypedNodes(document).flatMap((node) => node.types);
      expect(new Set(types), label).toStrictEqual(
        new Set(["BreadcrumbList", "ItemList", "ListItem"]),
      );
    }
  });

  it("gives every ListItem exactly position, name and url (url only where the card links)", () => {
    const shop = CASES[0]?.view as ListingView;
    for (const item of listItems(
      nodeOf(listingJsonLd(shop, labelFor("en"), BASE), "ItemList"),
    )) {
      expect(Object.keys(item).sort()).toStrictEqual(
        productLinks
          ? ["@type", "name", "position", "url"]
          : ["@type", "name", "position"],
      );
    }
    const hub = CASES.find((c) => c.view.pageType === "occasionHub")
      ?.view as ListingView;
    for (const item of listItems(
      nodeOf(listingJsonLd(hub, labelFor("en"), BASE), "ItemList"),
    )) {
      // A hub card is a tile with no `<a>` (no destination, no product page): no url.
      expect(Object.keys(item).sort()).toStrictEqual([
        "@type",
        "name",
        "position",
      ]);
    }
  });
});

describe('itemList() (spec 008 §2 "Schema")', () => {
  it("numbers the entries 1..n in the order given and makes each link absolute", () => {
    expect(
      itemList(
        [
          { name: "Amber Hour", href: "/en/poland/product/amber-hour" },
          { name: "Forget-me-not" },
        ],
        BASE,
      ),
    ).toStrictEqual({
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Amber Hour",
          url: "https://flowersoverseas.com/en/poland/product/amber-hour",
        },
        { "@type": "ListItem", position: 2, name: "Forget-me-not" },
      ],
    });
  });

  it("emits nothing for a listing with no cards", () => {
    expect(itemList([], BASE)).toBeUndefined();
  });

  it("refuses an entry with no name", () => {
    expect(() => itemList([{ name: "Rose" }, { name: "  " }], BASE)).toThrow(
      /entry 2 has no name/,
    );
  });
});

/** The page and its JSON-LD, as the route serves them together. */
function served(
  v: ListingView,
  nodes = listingJsonLd(v, labelFor(v.locale), BASE),
): string {
  return `${renderView(v)}${renderToStaticMarkup(<JsonLd nodes={nodes} />)}`;
}

function kindOf(v: ListingView): ListingKind {
  return v.pageType === "occasionsIndex" ? "occasions" : "cards";
}

describe("the e2e scanner holds on every rendered fixture, and bites (AC-17, AC-18, T-18)", () => {
  for (const { label, view: v } of CASES) {
    it(`${label}: no problem in the served document`, () => {
      expect(listingJsonLdProblems(served(v), label, kindOf(v))).toStrictEqual(
        [],
      );
    });
  }

  const shop = CASES[0]?.view as ListingView;
  const index = CASES.find((c) => c.view.pageType === "occasionsIndex")
    ?.view as ListingView;
  const nodes = listingJsonLd(shop, labelFor("en"), BASE);
  const breadcrumb = nodeOf(nodes, "BreadcrumbList") as JsonLdNode;
  const list = nodeOf(nodes, "ItemList") as JsonLdNode;
  const entries = listItems(list);
  const withEntries = (
    next: readonly unknown[],
    count = next.length,
  ): JsonLdNode => ({
    ...list,
    numberOfItems: count,
    itemListElement: next,
  });

  const MUTATIONS: Readonly<
    Record<string, readonly (JsonLdNode | undefined)[]>
  > = {
    "one card dropped": [
      breadcrumb,
      withEntries(entries.slice(1).map((e, i) => ({ ...e, position: i + 1 }))),
    ],
    "two cards swapped": [
      breadcrumb,
      withEntries([
        { ...entries[1], position: 1 },
        { ...entries[0], position: 2 },
        ...entries.slice(2),
      ]),
    ],
    "a url changed": [
      breadcrumb,
      withEntries([
        { ...entries[0], url: `${BASE.baseUrl}/en/poland/product/elsewhere` },
        ...entries.slice(1),
      ]),
    ],
    "a name changed": [
      breadcrumb,
      withEntries([
        { ...entries[0], name: "Something else" },
        ...entries.slice(1),
      ]),
    ],
    "numberOfItems wrong": [
      breadcrumb,
      withEntries(entries, entries.length + 1),
    ],
    "a price inside an entry": [
      breadcrumb,
      withEntries([{ ...entries[0], price: "45.90" }, ...entries.slice(1)]),
    ],
    "no ItemList": [breadcrumb],
    "no BreadcrumbList": [list],
    "a crumb renamed": [
      {
        ...breadcrumb,
        itemListElement: listItems(breadcrumb).map((crumb, i) =>
          i === 0 ? { ...crumb, name: "Start" } : crumb,
        ),
      },
      list,
    ],
    ...Object.fromEntries(
      [
        "Product",
        "Offer",
        "AggregateOffer",
        "Event",
        "LocalBusiness",
        "FloristShop",
      ].map((type) => [
        `a ${type} node`,
        [breadcrumb, list, { "@type": type, name: "x" }],
      ]),
    ),
    "an aggregateRating": [
      breadcrumb,
      { ...list, aggregateRating: { "@type": "Thing" } },
    ],
    "a review": [breadcrumb, { ...list, review: [] }],
  };

  for (const [name, mutated] of Object.entries(MUTATIONS)) {
    it(`reports ${name}`, () => {
      expect(
        listingJsonLdProblems(served(shop, mutated), name, "cards"),
      ).not.toStrictEqual([]);
    });
  }

  it("reports a second JSON-LD block", () => {
    const html = `${served(shop)}${renderToStaticMarkup(<JsonLd nodes={[list]} />)}`;
    expect(
      listingJsonLdProblems(html, "two blocks", "cards").join(" "),
    ).toContain("2 JSON-LD blocks");
  });

  it("reports an occasions-index list in another order than the page's", () => {
    const indexNodes = listingJsonLd(index, labelFor("en"), BASE);
    const indexList = nodeOf(indexNodes, "ItemList") as JsonLdNode;
    const reversed = [...listItems(indexList)]
      .reverse()
      .map((entry, i) => ({ ...entry, position: i + 1 }));
    const mutated = [
      nodeOf(indexNodes, "BreadcrumbList"),
      { ...indexList, itemListElement: reversed },
    ];
    expect(
      listingJsonLdProblems(served(index, mutated), "reversed", "occasions"),
    ).not.toStrictEqual([]);
  });
});

/**
 * The routes mount the nodes beside the page, from the same `view` (T-31's wiring half). The e2e
 * scan proves it on the served HTML; this proves it without a build, so a route that drops the
 * mount goes red in the cheap gates too.
 */
describe("every listing route mounts ListingJsonLd with the view its page renders", () => {
  const routes = [
    "src/app/[locale]/country-shop-root.tsx",
    "src/app/[locale]/country-listing.tsx",
    "src/app/[locale]/[segment]/[child]/page.tsx",
    "src/app/[locale]/[segment]/page.tsx",
  ].map((file) => readFileSync(resolve(__dirname, "../..", file), "utf8"));

  for (const page of Object.keys(PAGES).map((type) =>
    type === "countryShopRoot"
      ? "CountryShopRootPage"
      : `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}Page`,
  )) {
    it(`${page} is followed by <ListingJsonLd view={view} />`, () => {
      const mounts = routes.flatMap((source) => [
        ...source.matchAll(
          new RegExp(
            `<${page} view=\\{view\\} />\\s*(<ListingJsonLd view=\\{view\\} />)?`,
            "g",
          ),
        ),
      ]);
      expect(mounts.length, page).toBeGreaterThan(0);
      for (const mount of mounts) expect(mount[1], page).toBeDefined();
    });
  }
});
