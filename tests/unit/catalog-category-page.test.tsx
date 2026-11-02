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
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

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
  // The "Categories" button's reviewed label (spec 008 §14 A-founder-2026-10-18a).
  "nav",
  "home",
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
    expect(textOf(/<h1[^>]*>(.*?)<\/h1>/su.exec(html)?.[1] ?? "")).toBe(
      "Roses to Poland",
    );
  });

  // v2 (spec 004 §14 A21; `country-category-desktop.dc.html`): the grid comes straight after the
  // hero, and "Also for Poland" moves under it.
  it("follows the block order of the founder's C3: crumbs, hero, siblings, grid, intro", () => {
    // Spec 008 §14 A-founder-2026-10-14c (AC-33; TASK-241): the siblings are above the grid at
    // every width, and none follows it; A-founder-2026-10-15c folds them into the one
    // "Categories" disclosure, and no chip line renders beside it.
    const crumbs = html.indexOf("data-fo-breadcrumb");
    const siblings = html.indexOf("data-fo-listing-categories");
    const grid = html.indexOf("data-fo-listing-grid=");
    const intro = html.indexOf("data-fo-shop-intro");
    expect(crumbs).toBeGreaterThan(-1);
    expect(crumbs).toBeLessThan(siblings);
    expect(siblings).toBeLessThan(grid);
    expect(grid).toBeLessThan(intro);
    expect(html.match(/data-fo-listing-categories/gu) ?? []).toHaveLength(1);
    expect(html).not.toContain("data-fo-listing-chips");
  });

  it("carries the counted lede, and the state once in the quiet line, no demo sentence (spec 043 AC-7)", () => {
    expect(roses.resultCount).toBeGreaterThan(1);
    expect(text).toContain(`${String(roses.resultCount)} of ours`);
    expect(text.split("Ordering opens soon")).toHaveLength(2);
    expect(text.split("Prices include delivery and VAT")).toHaveLength(2);
    expect(text).not.toContain("Every price here is the price you will pay");
  });

  it("prices every card, through `formatMoney` and nowhere else", () => {
    const cards = html.match(/data-fo-product-card="/gu) ?? [];
    expect(cards.length).toBe(roses.items.length);
    expect(cards.length).toBeGreaterThan(0);
    const prices =
      html.match(/(?:[€£]\s?[\d ,.]+|[\d ,.]+\s?(?:PLN|zł))/gu) ?? [];
    expect(prices.length).toBeGreaterThanOrEqual(cards.length);
    // Each card says "Includes VAT and delivery" beside its one price (spec 004 §14
    // A-founder-2026-10-19b clause 1; TASK-285); "all in" is retired.
    expect(
      text.split("Includes VAT and delivery").length - 1,
    ).toBeGreaterThanOrEqual(cards.length);
    expect(text).not.toMatch(/\ball in\b/u);
    // The committed FX snapshot is older than spec 005's ceiling, so every projection falls back
    // to the destination's own currency — and the page says so, once (spec 005 §14 A3).
    expect(roses.fxFallback).toBe(true);
    expect(text).toContain("currency of the delivery country");
  });

  it("renders the sibling row from `links.chips` and nothing else", () => {
    expect(roses.links.chips.length).toBeGreaterThan(1);
    // The row's name, on the disclosure panel's `<nav>` (the heading is not drawn).
    expect(html).toMatch(/<nav aria-label="Also for Poland"/u);
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

  it("labels the disclosure with the reviewed `nav.categories.label`, and no catalogue holds a key of its own (A-founder-2026-10-18a; T-39)", () => {
    const messagesDir = resolve(import.meta.dirname, "../../messages");
    const files = readdirSync(messagesDir).filter((file) =>
      file.endsWith(".json"),
    );
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      expect(
        readFileSync(resolve(messagesDir, file), "utf8"),
        file,
      ).not.toContain("chipsToggle");
    }
    const en = JSON.parse(
      readFileSync(resolve(messagesDir, "en.json"), "utf8"),
    ) as { nav: { categories: { label: string } } };
    const start = html.indexOf("data-fo-listing-categories");
    const summary = html.slice(
      html.indexOf("<summary", start),
      html.indexOf("</summary>", start),
    );
    expect(
      summary
        .replace(/<span aria-hidden="true"[^>]*>[^<]*<\/span>/gu, "")
        .replace(/<[^>]+>/gu, "")
        .trim(),
    ).toBe(en.nav.categories.label);
  });

  it('folds the siblings into a native "Categories" disclosure on the toolbar row, every link in the HTML (A-founder-2026-10-15c; TASK-241)', () => {
    // Two `<details>` on the toolbar row: "Categories" and "How we sort" (spec 043 item 2). The
    // first, before the sort form and the grid, its `<summary>` the button's words; every sibling
    // that is not this page is a real link inside it, closed, with no script.
    expect(html.match(/<details/gu) ?? []).toHaveLength(2);
    expect(
      html.match(/<details[^>]*data-fo-ranking-disclosure/gu) ?? [],
    ).toHaveLength(1);
    const start = html.indexOf("data-fo-listing-categories");
    const end = html.indexOf("</details>", start);
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(html.indexOf("<form"));
    expect(html.indexOf("<form")).toBeLessThan(
      html.indexOf("data-fo-listing-grid="),
    );
    expect(html.slice(start, end)).not.toContain(" open");
    const panel = html.slice(start, end);
    // Every sibling link is inside the `<details>`; none renders outside it (no phone chip line).
    const outside = html.slice(0, start) + html.slice(end);
    for (const chip of roses.links.chips) {
      if (chip.current !== true) {
        expect(outside, chip.key).not.toContain(`href="${chip.href}"`);
      }
    }
    expect(panel).toMatch(/<summary[^>]*>Categories</u);
    for (const chip of roses.links.chips) {
      if (chip.current === true) {
        expect(panel, chip.key).toContain('aria-current="page"');
      } else {
        expect(panel, chip.key).toContain(`href="${chip.href}"`);
      }
    }
  });

  it("groups the panel by kind: what it is, then the occasions, each under its reviewed heading (spec 043 §5.3 E)", async () => {
    const { CATEGORIES } =
      await import("../../src/config/catalogue/categories.data");
    const kindOf = new Map(CATEGORIES.map((c) => [c.key, c.kind] as const));
    const start = html.indexOf("data-fo-listing-categories");
    const panel = html.slice(start, html.indexOf("</details>", start));
    const headings = [...panel.matchAll(/<h3[^>]*>([^<]*)<\/h3>/gu)].map(
      (match) => match[1],
    );
    expect(headings).toStrictEqual(["By what it is", "Shop by occasion"]);
    // Every chip's kind, in DOM order: no occasion before a product or flower type.
    const keys = roses.links.chips.map((chip) => chip.key);
    const order = keys
      .map((key) => ({
        key,
        at: panel.indexOf(
          `>${roses.links.chips.find((c) => c.key === key)?.name ?? ""}<`,
        ),
      }))
      .sort((a, b) => a.at - b.at)
      .map((entry) => kindOf.get(entry.key));
    const firstOccasion = order.indexOf("occasion");
    expect(firstOccasion).toBeGreaterThan(0);
    expect(
      order.slice(firstOccasion).every((kind) => kind === "occasion"),
    ).toBe(true);
    expect(roses.occasionCategoryKeys?.length).toBe(
      order.length - firstOccasion,
    );
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

  it("renders the sort form above the grid and a real pager after it (spec 008 §14 A-founder-2026-10-14c; TASK-241)", () => {
    // C3 (AC-33): one `<form method="get">`, before the grid, its label "Sort by" (spec 043
    // item 3: no "Change the order"); the pager after the grid.
    expect(html.match(/<form/giu) ?? []).toHaveLength(1);
    const grid = html.indexOf("data-fo-listing-grid=");
    const form = html.indexOf("<form");
    expect(grid).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(-1);
    expect(form).toBeLessThan(grid);
    expect(html.indexOf("data-fo-pagination")).toBeGreaterThan(grid);
    expect(text).not.toContain("Change the order");
    expect(html).toMatch(
      /<label[^>]*for="listing-sort"[^>]*>Sort by<\/label>/u,
    );
    // The pager links only `?page=N`; no sorted URL is ever a crawlable link (AC-15).
    expect(html).not.toMatch(/href="[^"]*[?&]sort=/iu);
    expect(roses.pageCount).toBe(2);
    expect(html).toContain("Pages of products");
    expect(html).toContain(`href="${roses.path}?page=2"`);
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
 * `/en/poland/flowers/roses` carries a photograph on its first card — since TASK-168 approved photo
 * batch 2, all twelve of its twelve cards do (three since TASK-080) — so the count it ships with is
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

  it("nominates exactly one on the page as it ships: twelve of twelve cards are photographs, and the first is one", () => {
    // The pin. Stated numbers, read from the view model: if the corpus changes, this line goes
    // red and the new numbers are written here deliberately.
    expect(roses.items).toHaveLength(12);
    expect(
      roses.items.filter((card) => card.photo.kind === "asset"),
    ).toHaveLength(12);
    expect(roses.items[0]?.photo.kind).toBe("asset");
    const nominated = lcpNominations(shipped);
    expect(nominated.images).toBe(12);
    // One of the twelve, never two: the preload's `imagesrcset`/`imagesizes` are the first card's
    // own `<source>`, which is AC-24's "built from the same manifest lookup as its `srcset`".
    expect(nominated.eager).toBe(1);
    expect(nominated.high).toBe(1);
    expect(nominated.preloaded).toHaveLength(1);
    expect(nominated.preloaded).toEqual(
      expectedPreloads(firstCardPhotograph(shipped)),
    );
    // And it is the **first card's** image, not merely one of the twelve.
    expect(nominatedImageCard(shipped)).toBe(0);
  });

  it("withdraws the nomination with the first card's photograph, and promotes nothing in its place", () => {
    // The data flip AC-20 promises, in the direction nobody tests: withdraw the first card's
    // image and the page must nominate **nothing** — not the next photograph down the grid,
    // whose box is not the LCP element. Eleven photographs remain, all lazy.
    const markup = render(
      <CountryCategoryPage view={withoutPhotographAt(0)} />,
      "en",
    );
    const nominated = lcpNominations(markup);
    expect(nominated.images).toBe(11);
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
