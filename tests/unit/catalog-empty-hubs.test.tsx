/**
 * Empty hubs (spec 008 §14 A-orchestrator-2026-11-04a; **AC-93**, the data half of **AC-94**,
 * **AC-95**'s rule 3 and `thinCoreHubs()` clause; T-94's unit half, T-95's and T-96's unit parts
 * that need no copy fixture; TASK-438).
 *
 * Every hub set here is **computed from the data**, never typed: a hub's core products are the
 * slugged products of `coreRange(locale)` that the catalogue's own facet reader (`listProducts()`)
 * says are tagged to it, and the rule a zero-core hub takes follows the entity's kind (the
 * category's `kind`; an occasion hub whose tagged products are all funeral pieces, Q-04a-2). The
 * named hubs of the ACs are asserted to be **members** of the computed sets, and each set is
 * asserted non-empty, so an empty set cannot pass.
 *
 * The indexing-deployment halves (a reviewed copy fixture: `noindex` under the indexing
 * environment, `categories.xml`, clusters) and the provider-swap flips are in
 * `catalog-empty-hubs-indexing.test.ts`. The browser halves (chooser links answering 200, the
 * `<head>` on the preview) are T-94/T-95's e2e and stay CI's.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ListingView,
  coreRange,
  homeView,
  listingPages,
  listingView,
} from "../../src/modules/catalog";
import {
  hubCoreState,
  listingAlternatePaths,
  listingPageIndexability,
  photoFor,
  thinCoreHubs,
} from "../../src/modules/catalog/listing.ts";
import { listingItemListEntries } from "../../src/modules/catalog/listingSchema.ts";
import { catalogProviders } from "../../src/modules/catalog/providers.ts";
import { listProducts } from "../../src/modules/catalog/read.ts";
import { slugFor } from "../../src/modules/catalog/slugs.ts";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { committedMegaMenuData } from "../../src/modules/catalog/mega-menu.ts";
import { pageAlternatePaths } from "../../src/modules/catalog/alternates.ts";
import { loadMessages } from "../../src/modules/i18n";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  INDEXABILITY_TERMS,
  OPTIONAL_INDEXABILITY_TERMS,
  indexability,
  pageIndexability,
} from "../../src/modules/seo";
import { robotsTxt } from "../../src/modules/seo/robots.ts";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";

const FROM = "2026-10-01";
const LOCALES = ["en", "en-gb"] as const;
type Locale = (typeof LOCALES)[number];
const NAMESPACES = [
  "home",
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
] as const;

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: `https://${CANONICAL_HOST}`,
};

/** Money in any shape the launch locales print it (spec 004 AC-75). */
const MONEY = /[€£$]|\bPLN\b|\bEUR\b|\bGBP\b|\bUSD\b|zł/u;

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

/* -------------------------------------------------------------------------- */
/* The expected sets, from the data.                                          */
/* -------------------------------------------------------------------------- */

const categoryKind = new Map(
  (await catalogProviders().catalogue.categories()).map((row) => [
    row.key,
    row.kind,
  ]),
);

interface Hub {
  readonly locale: Locale;
  readonly pageType: "categoryHub" | "occasionHub";
  readonly entityKey: string;
  readonly path: string;
  /** The slugged core range, in rank order. */
  readonly range: readonly string[];
  /** The hub's own core products (slugged core range ∩ tagged), in rank order. */
  readonly core: readonly string[];
  /** Every product tagged to the hub, by the catalogue's facet reader. */
  readonly tagged: readonly { sku: string; productType: string }[];
  readonly view: ListingView;
}

const HUBS: Hub[] = [];
for (const locale of LOCALES) {
  const range = (await coreRange(locale))
    .map((entry) => entry.sku)
    .filter((sku) => slugFor("product", sku, locale) !== undefined);
  for (const page of await listingPages(locale)) {
    if (page.pageType !== "categoryHub" && page.pageType !== "occasionHub") {
      continue;
    }
    const key = page.entityKey ?? "";
    const facet =
      page.pageType === "occasionHub"
        ? "occasion"
        : (categoryKind.get(key) ?? "");
    const tagged = await listProducts({ facets: { [facet]: [key] } });
    const taggedSkus = new Set(tagged.map((product) => product.sku));
    const view = await listingView(
      { locale, pageType: page.pageType, entity: page.slug },
      { from: FROM },
    );
    if (view === undefined) throw new Error(`${page.path} must render`);
    HUBS.push({
      locale,
      pageType: page.pageType,
      entityKey: key,
      path: page.path,
      range,
      core: range.filter((sku) => taggedSkus.has(sku)),
      tagged: tagged.map((p) => ({ sku: p.sku, productType: p.productType })),
      view,
    });
  }
}

/** Rule 2's kinds, read from the ruling: a flower type or product kind; a funeral register. */
function takesRuleTwo(hub: Hub): boolean {
  if (hub.pageType === "categoryHub") {
    const kind = categoryKind.get(hub.entityKey);
    return kind === "productType" || kind === "flowerType";
  }
  return (
    hub.tagged.length > 0 &&
    hub.tagged.every((product) => product.productType === "funeral")
  );
}

const RULE_ONE = HUBS.filter((h) => h.core.length === 0 && !takesRuleTwo(h));
const RULE_TWO = HUBS.filter((h) => h.core.length === 0 && takesRuleTwo(h));
const RULE_THREE = HUBS.filter((h) => h.core.length > 0 && h.core.length < 6);

/** "Our order" for a country-less grid: photographed first, then the core rank. */
function hubOrder(skus: readonly string[], locale: Locale): string[] {
  const photographed = skus.filter(
    (sku) => photoFor(sku, locale).photo.kind === "asset",
  );
  return [...photographed, ...skus.filter((s) => !photographed.includes(s))];
}

function htmlOf(hub: Hub): string {
  const Page =
    hub.pageType === "categoryHub" ? CategoryHubPage : OccasionHubPage;
  return render(<Page view={hub.view} />, hub.locale);
}

describe("the computed hub sets", () => {
  it("are non-empty and hold the hubs the ACs name", () => {
    const paths = (set: readonly Hub[]) => set.map((hub) => hub.path);
    expect(RULE_ONE.length).toBeGreaterThan(0);
    expect(RULE_TWO.length).toBeGreaterThan(0);
    expect(RULE_THREE.length).toBeGreaterThan(0);
    expect(paths(RULE_ONE)).toContain("/en/occasions/mothers-day");
    expect(paths(RULE_ONE)).toContain("/en/flowers/sorry-flowers");
    expect(paths(RULE_TWO)).toContain("/en/flowers/tulips");
    expect(paths(RULE_THREE)).toContain("/en/flowers/roses");
  });

  it("agree with `hubCoreState()`, the module's one reading", async () => {
    for (const hub of HUBS) {
      const state = await hubCoreState({
        pageType: hub.pageType,
        locale: hub.locale,
        entityKey: hub.entityKey,
      });
      expect(state?.coreCount, hub.path).toBe(hub.core.length);
      const rule =
        hub.core.length > 0
          ? "own"
          : RULE_TWO.includes(hub)
            ? "unstocked"
            : "wholeRange";
      expect(state?.rule, hub.path).toBe(rule);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-93: rule 1.                                                             */
/* -------------------------------------------------------------------------- */

describe("AC-93: a zero-core hub of occasion kind shows the whole core range (T-94)", () => {
  it("holds exactly the slugged core range, each once, in the hub grids' order", () => {
    for (const hub of RULE_ONE) {
      const ids = hub.view.hubItems.map((card) => card.productId);
      expect(ids.length, hub.path).toBeGreaterThan(0);
      expect(new Set(ids).size, hub.path).toBe(ids.length);
      expect(ids, hub.path).toEqual(hubOrder(hub.range, hub.locale));
      expect(hub.view.resultCount, hub.path).toBe(hub.range.length);
      expect(hub.view.items, hub.path).toEqual([]);
    }
  });

  it("states the number in the count line, renders the grid and lists the cards in its ItemList with no amount", () => {
    for (const hub of RULE_ONE) {
      const html = htmlOf(hub);
      expect(html, hub.path).toContain("data-fo-hub-products");
      expect(html, hub.path).toContain(
        `data-fo-hub-count="${String(hub.range.length)}"`,
      );
      expect(html.split("data-fo-product-card=").length - 1, hub.path).toBe(
        hub.view.hubItems.length,
      );
      const entries = listingItemListEntries(hub.view);
      expect(entries, hub.path).toEqual(
        hub.view.hubItems.map((card) => ({ name: card.name, href: card.href })),
      );
      expect(JSON.stringify(entries)).not.toMatch(/price|offer|amount/iu);
      expect(html.replace(/<[^>]+>/gu, " "), hub.path).not.toMatch(MONEY);
    }
  });

  it("draws each card exactly as the home draws it: no field names the occasion", async () => {
    for (const locale of LOCALES) {
      const home = await homeView(locale);
      const homeCards = new Map(
        home.selection.cards.map((card) => [card.productId, card]),
      );
      for (const hub of RULE_ONE.filter((h) => h.locale === locale)) {
        for (const card of hub.view.hubItems) {
          const twin = homeCards.get(card.productId);
          expect(twin, `${hub.path} ${card.productId}`).toBeDefined();
          expect(card, `${hub.path} ${card.productId}`).toEqual(twin);
          const props = {
            locale,
            headingLevel: "h3",
            provenance: "hidden",
            chooser: true,
          } as const;
          expect(render(<ProductCard card={card} {...props} />, locale)).toBe(
            render(<ProductCard card={twin ?? card} {...props} />, locale),
          );
        }
      }
    }
  });

  it("keeps its robots terms, its cluster and its sitemap reading as before: no `coreStocked` term", async () => {
    for (const hub of RULE_ONE) {
      const identity = {
        pageType: hub.pageType,
        locale: hub.locale,
        entityKey: hub.entityKey,
      };
      const verdict = await listingPageIndexability(identity, INDEXING);
      expect(Object.keys(verdict.terms), hub.path).not.toContain("coreStocked");
      expect(
        await listingAlternatePaths(identity, { cluster: true }),
        hub.path,
      ).toEqual(await listingAlternatePaths(identity));
      expect(
        Object.keys(await listingAlternatePaths(identity)).length,
        hub.path,
      ).toBeGreaterThan(0);
    }
  });
});

describe("rule 3: a hub with 1 to 5 core products holds exactly its own (AC-93, AC-95)", () => {
  it("is never topped up from the range", () => {
    for (const hub of RULE_THREE) {
      const ids = hub.view.hubItems.map((card) => card.productId);
      expect([...ids].sort(), hub.path).toEqual([...hub.core].sort());
      expect(ids.length, hub.path).toBeLessThan(hub.range.length);
    }
  });

  it("keeps its directive: the term it states holds", async () => {
    for (const hub of RULE_THREE) {
      const verdict = await listingPageIndexability(
        {
          pageType: hub.pageType,
          locale: hub.locale,
          entityKey: hub.entityKey,
        },
        INDEXING,
      );
      expect(verdict.terms.coreStocked ?? true, hub.path).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-94: rule 2, the page and the term (the indexing fixture is the sibling file). */
/* -------------------------------------------------------------------------- */

describe("AC-94: a zero-core hub of flower type or product kind has no grid (T-95)", () => {
  it("renders H1, noMoney once and the picker, then no grid, no card and no ItemList, then its copy", () => {
    for (const hub of RULE_TWO) {
      const html = htmlOf(hub);
      const words = loadMessages(hub.locale, ["shop"])["shop"] as {
        hub: { noMoney: string };
      };
      expect(hub.view.hubItems, hub.path).toEqual([]);
      expect(html, hub.path).not.toContain("data-fo-hub-products");
      expect(html, hub.path).not.toContain("data-fo-product-card");
      expect(html, hub.path).not.toContain("data-fo-hub-count");
      expect(listingItemListEntries(hub.view), hub.path).toEqual([]);
      expect(
        html.replace(/<[^>]+>/gu, " ").split(words.hub.noMoney).length - 1,
      ).toBe(1);
      const at = (needle: string): number => html.indexOf(needle);
      const tail = hub.path.slice(`/${hub.locale}/`.length);
      expect(html).toContain(`action="/api/choose/${hub.locale}/${tail}"`);
      const order = [
        at("<h1"),
        at("data-fo-hub-no-money"),
        at("data-fo-hub-picker"),
        ...(hub.view.intro === undefined ? [] : [at("data-fo-hub-about")]),
      ];
      for (const index of order) expect(index, hub.path).toBeGreaterThan(-1);
      expect(order, hub.path).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("states `coreStocked: false`, and is in no hreflang cluster in any environment", async () => {
    for (const hub of RULE_TWO) {
      const identity = {
        pageType: hub.pageType,
        locale: hub.locale,
        entityKey: hub.entityKey,
      };
      const verdict = await listingPageIndexability(identity, INDEXING);
      expect(verdict.terms.coreStocked, hub.path).toBe(false);
      expect(verdict.directive, hub.path).toBe("noindex,follow");
      const cluster = await listingAlternatePaths(identity, { cluster: true });
      expect(Object.values(cluster), hub.path).not.toContain(hub.path);
    }
  });

  it("keeps every link: the menu entry, the language switcher and robots.txt", async () => {
    for (const hub of RULE_TWO) {
      const kind = hub.pageType === "categoryHub" ? "category" : "occasion";
      expect(
        await committedMegaMenuData.hubPath(hub.locale, kind, hub.entityKey),
        hub.path,
      ).toBe(hub.path);
      const tail = hub.path.slice(`/${hub.locale}/`.length).split("/");
      expect(
        (await pageAlternatePaths(hub.locale, tail))[hub.locale],
        hub.path,
      ).toBe(hub.path);
    }
    const robots = robotsTxt(INDEXING);
    for (const hub of RULE_TWO) {
      for (const line of robots.split("\n")) {
        if (!line.toLowerCase().startsWith("disallow:")) continue;
        const rule = line.slice("disallow:".length).trim();
        if (rule === "") continue;
        // robots.txt's own matching: a prefix, `*` any run, `$` the end.
        const pattern = new RegExp(
          `^${rule
            .replace(/[.+?^{}()|[\]\\]/gu, "\\$&")
            .replaceAll("*", ".*")}`,
          "u",
        );
        expect(pattern.test(hub.path), `${hub.path} ${line}`).toBe(false);
      }
    }
  });
});

describe("AC-94: `coreStocked` is a term of the one engine, not a branch (AC-14 as amended)", () => {
  it("is an optional term of `INDEXABILITY_TERMS`", () => {
    expect(INDEXABILITY_TERMS).toContain("coreStocked");
    expect(OPTIONAL_INDEXABILITY_TERMS).toContain("coreStocked");
  });

  it("crosses every existing term for `categoryHub`: index iff every term holds", () => {
    const bools = [true, false] as const;
    for (const exists of bools)
      for (const reviewed of bools)
        for (const localeIndexable of [true, false] as const)
          for (const indexingEnvironment of bools)
            for (const coreStocked of [true, false, undefined] as const) {
              const terms = {
                pageTypeIndexable: true,
                exists,
                reviewed,
                localeIndexable,
                indexingEnvironment,
                ...(coreStocked === undefined ? {} : { coreStocked }),
              };
              const all =
                exists &&
                reviewed &&
                localeIndexable &&
                indexingEnvironment &&
                coreStocked !== false;
              expect(indexability(terms), JSON.stringify(terms)).toBe(
                all ? "index,follow" : "noindex,follow",
              );
            }
  });

  it("is carried by `pageIndexability()` from the descriptor", () => {
    const base = {
      pageType: "categoryHub",
      locale: "en",
      exists: true,
      reviewed: true,
    } as const;
    expect(pageIndexability(base, INDEXING).directive).toBe("index,follow");
    expect(
      pageIndexability({ ...base, coreStocked: false }, INDEXING).directive,
    ).toBe("noindex,follow");
    expect(
      pageIndexability({ ...base, coreStocked: true }, INDEXING).directive,
    ).toBe("index,follow");
  });

  it("is stated by no page but a hub that takes rule 2", async () => {
    for (const locale of LOCALES) {
      for (const page of await listingPages(locale)) {
        const verdict = await listingPageIndexability(
          {
            pageType: page.pageType,
            locale,
            ...(page.countryIso === undefined
              ? {}
              : { countryIso: page.countryIso }),
            ...(page.entityKey === undefined
              ? {}
              : { entityKey: page.entityKey }),
          },
          INDEXING,
        );
        const hub = HUBS.find((h) => h.path === page.path);
        const states = hub !== undefined && takesRuleTwo(hub);
        expect("coreStocked" in verdict.terms, page.path).toBe(states);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-95: the coverage warning.                                               */
/* -------------------------------------------------------------------------- */

describe("AC-95: `thinCoreHubs()` lists exactly the hubs under the floor, zero-core included (T-96)", () => {
  it("equals the computed set with its counts", async () => {
    const expected = HUBS.filter((hub) => hub.core.length < 6)
      .map((hub) => `${hub.path}:${String(hub.core.length)}`)
      .sort();
    const thin = (await thinCoreHubs([...LOCALES]))
      .map((hub) => `${hub.path}:${String(hub.coreCount)}`)
      .sort();
    expect(thin).toEqual(expected);
    for (const hub of [...RULE_ONE, ...RULE_TWO]) {
      expect(thin).toContain(`${hub.path}:0`);
    }
  });
});
