/**
 * The country category as markup (spec 008 §5.3 row 2, **AC-5**, AC-1, AC-6, AC-24; T-30;
 * `docs/design/wireframes/country-category-desktop.dc.html` and `-mobile.dc.html`; TASK-110).
 *
 * `tests/unit/catalog-shop-page.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json` and the **real** view model, so the asserted copy is the shipped copy and the
 * asserted prices are the seeded catalogue's own.
 *
 * What only this layer can prove: the block order the artboard draws, that the sibling row is
 * `listingView()`'s `links.chips` and nothing else, that the page's own category is a marked chip
 * rather than a link to itself, that no toolbar or pagination control renders (§14 **A8 (c)**),
 * that the delivery-facts panel the artboard draws is absent (§14 **A9**), and that the page
 * claims nothing in any locale it exists in.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ListingView, listingView } from "../../src/modules/catalog";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import {
  expectedPreloads,
  firstCardPhotograph,
  lcpNominations,
  nominatedImageCard,
} from "../support/lcp-nomination.ts";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

/** A fixed window start, so a rendered date is assertable without freezing a clock. */
const FROM = "2026-09-15";

/** Every namespace a country-category document resolves. */
const NAMESPACES = [
  "shop",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
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

async function viewFor(
  locale: string,
  country: string,
  entity: string,
): Promise<ListingView> {
  const view = await listingView(
    { locale, pageType: "countryCategory", country, entity },
    { from: FROM },
  );
  if (view === undefined) {
    throw new Error(`the ${locale} ${country}/${entity} category must exist`);
  }
  return view;
}

const roses = await viewFor("en", "poland", "roses");

describe("the populated country category (§5.3 row 2)", () => {
  const html = render(<CountryCategoryPage view={roses} />, "en");
  const text = textOf(html);

  it("renders one `<h1>`, and it names the category and the destination", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).toContain("Roses we make for Poland");
  });

  it("follows the artboard's block order: crumbs, hero, siblings, grid, intro", () => {
    const crumbs = html.indexOf("data-fo-breadcrumb");
    const siblings = html.indexOf("sibling-categories");
    const grid = html.indexOf("data-fo-listing-grid");
    const intro = html.indexOf("data-fo-shop-intro");
    expect(crumbs).toBeGreaterThan(-1);
    expect(crumbs).toBeLessThan(siblings);
    expect(siblings).toBeLessThan(grid);
    expect(grid).toBeLessThan(intro);
  });

  it("carries the counted lede and the demo sentence", () => {
    expect(roses.resultCount).toBeGreaterThan(1);
    expect(text).toContain(`${String(roses.resultCount)} of ours`);
    expect(text).toContain("You cannot order yet");
  });

  it("prices every card, through `formatMoney` and nowhere else", () => {
    const cards = html.match(/data-fo-product-card="/gu) ?? [];
    expect(cards.length).toBe(roses.items.length);
    expect(cards.length).toBeGreaterThan(0);
    const prices =
      html.match(/(?:[€£]\s?[\d ,.]+|[\d ,.]+\s?(?:PLN|zł))/gu) ?? [];
    expect(prices.length).toBeGreaterThanOrEqual(cards.length);
    expect(text).toContain("Includes VAT and delivery");
    // The committed FX snapshot is older than spec 005's ceiling, so every projection falls back
    // to the destination's own currency — and the page says so, once (spec 005 §14 A3).
    expect(roses.fxFallback).toBe(true);
    expect(text).toContain("currency of the delivery country");
  });

  it("renders the sibling row from `links.chips` and nothing else", () => {
    expect(roses.links.chips.length).toBeGreaterThan(1);
    expect(text).toContain("Also for Poland");
    for (const chip of roses.links.chips) {
      expect(text, chip.key).toContain(chip.name);
    }
    // Every chip that is not this page is a link to a page that exists; the current one is marked
    // and is not a link to itself.
    const links = html.match(/href="\/en\/poland\/flowers\/[a-z-]+"/gu) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(
      roses.links.chips.length - 1 /* the current chip */,
    );
    expect(html).not.toContain('href="/en/poland/flowers/roses"><');
    expect(html).toContain('aria-current="page"');
  });

  it("is a breadcrumb of five crumbs, the leaf marked and not a link", () => {
    expect(roses.breadcrumb.map((crumb) => crumb.labelKey)).toEqual([
      "common.homeLink",
      "breadcrumb.destinations",
      "destinations.pl.name",
      "breadcrumb.shopRoot",
      "breadcrumb.entity",
    ]);
    const trail = textOf(html.slice(0, html.indexOf("</nav>")));
    expect(trail).toContain("Poland");
    expect(trail).toContain("Roses");
  });

  it("renders no toolbar and no pagination control (§14 A8 (c))", () => {
    expect(html).not.toMatch(/<form/iu);
    expect(html).not.toMatch(/<select/iu);
    expect(html).not.toMatch(/<button/iu);
    expect(html).not.toContain("Pages of products");
    // Nothing on the page links to a parameterised URL (AC-15's half this task can hold).
    expect(html).not.toMatch(/href="[^"]*[?&](?:page|sort)=/iu);
  });

  it("omits the delivery-facts panel the artboard draws (§14 A9)", () => {
    expect(text).not.toContain("What we can say about delivering here today");
    expect(text).not.toContain("Order-by time");
    expect(text).not.toContain("Soonest date");
  });

  it("renders no category tiles and no occasion table (§5.3 row 2: minus the tiles)", () => {
    expect(html).not.toContain("data-fo-category-tile");
    expect(html).not.toContain("<table");
  });

  it("adds no client island and no inline script (§5.4)", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});

/**
 * **AC-24: one nomination, and it is the first card's photograph** (§5.4, **AC-24**, T-24).
 *
 * `/en/poland/flowers/roses` is the one page type in the corpus whose first card does carry a
 * photograph — three of its twelve cards do (TASK-080's bytes) — so the count it ships with is
 * pinned as a stated number rather than recomputed from the page's own output, and the two
 * fabricated views below prove that the nomination follows the *first card's* photograph rather
 * than the page having one anywhere. The occasion twin is
 * `tests/unit/catalog-occasion-page.test.tsx`, where the corpus has no photograph at all;
 * `tests/support/lcp-nomination.ts` carries the reading of AC-24 both assert, and the byte
 * budgets of its second half are `tests/e2e/media-budgets.spec.ts`'s.
 */
describe("the one LCP nomination (§5.4, AC-24, T-24)", () => {
  const shipped = render(<CountryCategoryPage view={roses} />, "en");

  /** `roses` with the named cards' photographs withdrawn — the state TASK-080 reversed. */
  function withoutPhotographAt(...indices: readonly number[]): ListingView {
    return {
      ...roses,
      items: roses.items.map((card, index) =>
        indices.includes(index)
          ? { ...card, photo: { kind: "placeholder", slot: "grid" } as const }
          : card,
      ),
    };
  }

  it("nominates exactly one on the page as it ships: three of twelve cards are photographs, and the first is one", () => {
    // The pin. Stated numbers, read from the view model: if the corpus changes, this line goes
    // red and the new numbers are written here deliberately.
    expect(
      roses.items.filter((card) => card.photo.kind === "asset"),
    ).toHaveLength(3);
    expect(roses.items[0]?.photo.kind).toBe("asset");
    const nominated = lcpNominations(shipped);
    expect(nominated.images).toBe(3);
    // One of the three, never two: the preload's `imagesrcset`/`imagesizes` are the first card's
    // own `<source>`, which is AC-24's "built from the same manifest lookup as its `srcset`".
    expect(nominated.eager).toBe(1);
    expect(nominated.high).toBe(1);
    expect(nominated.preloaded).toHaveLength(1);
    expect(nominated.preloaded).toEqual(
      expectedPreloads(firstCardPhotograph(shipped)),
    );
    // And it is the **first card's** image, not merely one of the three.
    expect(nominatedImageCard(shipped)).toBe(0);
  });

  it("withdraws the nomination with the first card's photograph, and promotes nothing in its place", () => {
    // The data flip AC-20 promises, in the direction nobody tests: withdraw the first card's
    // image and the page must nominate **nothing** — not the next photograph down the grid,
    // whose box is not the LCP element. Two photographs remain, both lazy.
    const markup = render(
      <CountryCategoryPage view={withoutPhotographAt(0)} />,
      "en",
    );
    const nominated = lcpNominations(markup);
    expect(nominated.images).toBe(2);
    expect(firstCardPhotograph(markup)).toBeUndefined();
    expect(nominated.preloaded).toEqual(expectedPreloads(undefined));
    expect(nominated.eager).toBe(0);
    expect(nominated.high).toBe(0);
  });

  it("nominates the first card even when every card carries a photograph", () => {
    const every: ListingView = {
      ...roses,
      items: roses.items.map((card) => ({
        ...card,
        photo: roses.items[0]?.photo ?? card.photo,
      })),
    };
    const markup = render(<CountryCategoryPage view={every} />, "en");
    const nominated = lcpNominations(markup);
    expect(nominated.images).toBe(roses.items.length);
    expect(nominated.eager).toBe(1);
    expect(nominated.high).toBe(1);
    expect(nominated.preloaded).toEqual(
      expectedPreloads(firstCardPhotograph(markup)),
    );
    expect(nominatedImageCard(markup)).toBe(0);
  });
});

describe("the honesty rules over the rendered page (AC-6)", () => {
  // `de` and `pl` have no authored category slug yet (§13 Q10, TASK-106), so the page exists in
  // the two English locales and the pseudo-locales only — and a locale with no page is asserted
  // as a 404 in `tests/e2e/country-category.spec.ts` rather than rendered here.
  for (const [locale, country, entity] of [
    ["en", "poland", "roses"],
    ["en-gb", "poland", "roses"],
    ["en", "germany", "hand-tied-bouquets"],
    ["en-gb", "romania", "mixed-flowers"],
  ] as const) {
    it(`${locale} ${country}/${entity}: no rating, badge, countdown, old price or basket`, async () => {
      const view = await viewFor(locale, country, entity);
      const html = render(<CountryCategoryPage view={view} />, locale);
      expect(listingHonestyViolations({ text: textOf(html), html })).toEqual(
        [],
      );
    });
  }
});

describe("the plural of the lede (T-30)", () => {
  it("declines with the count in `en`", async () => {
    const one: ListingView = { ...roses, resultCount: 1 };
    const many: ListingView = { ...roses, resultCount: 15 };
    expect(textOf(render(<CountryCategoryPage view={one} />, "en"))).toContain(
      "One of ours",
    );
    expect(textOf(render(<CountryCategoryPage view={many} />, "en"))).toContain(
      "15 of ours",
    );
  });

  it("declines one/few/many in `pl`", () => {
    const pl = loadMessages("pl", ["shop"]) as {
      shop: { category: { lede: string } };
    };
    const lede = pl.shop.category.lede;
    for (const form of ["one {", "few {", "many {", "other {"]) {
      expect(lede, form).toContain(form);
    }
  });
});
