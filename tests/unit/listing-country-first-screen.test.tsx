/**
 * The three country listings' first screens, unit layer (spec 008 §14 **A15**, **A16**, AC-29 to
 * AC-31, T-33 to T-35; spec 004 §14 **A24** clause 2, rebound AC-34, AC-38 for A9 and A10, T-49,
 * T-40; TASK-187).
 *
 * The geometry (what lies inside the first viewport at 1440 × 900, 1280 × 800 and 390 × 844) is
 * the e2e layer's, `tests/e2e/listing-first-screen.spec.ts`. This file pins what the server HTML
 * and the view model decide: which product leads, how many products a page holds, where page 2
 * starts, that the occasion's lead is one element, that the state line reads the view, that every
 * card price carries its inclusive marker, the tile noun, and the approved strings byte for byte.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CATEGORIES } from "../../src/config/catalogue/categories.data";
import { PRODUCTS } from "../../src/config/catalogue/products.data";
import {
  type ListingView,
  listingView,
  productCardView,
} from "../../src/modules/catalog";
import { LISTING_PAGE_SIZE } from "../../src/modules/catalog/listing";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { formatMoney, loadMessages } from "../../src/modules/i18n";
import { textOf } from "../support/listing-honesty";

const FROM = "2026-10-14";

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

function readable(html: string): string {
  return textOf(html)
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

async function view(
  pageType: "countryShopRoot" | "countryCategory" | "countryOccasion",
  entity: string | undefined,
  options: { page?: number; locale?: string } = {},
): Promise<ListingView> {
  const result = await listingView(
    {
      locale: options.locale ?? "en-gb",
      pageType,
      country: "poland",
      ...(entity === undefined ? {} : { entity }),
    },
    { from: FROM, page: options.page ?? 1, productLinks: true },
  );
  if (result === undefined) throw new Error(`${pageType} ${entity ?? ""}`);
  return result;
}

/** Every product a page renders, by its card hook, in DOM order. */
function cardsIn(html: string): string[] {
  return [...html.matchAll(/data-fo-product-card="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

const roses = await view("countryCategory", "roses");
const rosesPage2 = await view("countryCategory", "roses", { page: 2 });
const shopRoot = await view("countryShopRoot", undefined);
const shopRootPage2 = await view("countryShopRoot", undefined, { page: 2 });
const mothersDay = await view("countryOccasion", "mothers-day");

describe("spec 008 T-35: the lead is `items[0]`, and page 1 is twelve products (AC-31, AC-29)", () => {
  it("pages the 15 roses as 12 then 3, page 2 starting at the thirteenth", async () => {
    expect(LISTING_PAGE_SIZE).toBe(12);
    expect(roses.resultCount).toBe(15);
    expect(roses.items).toHaveLength(12);
    expect(rosesPage2.items).toHaveLength(3);
    // The whole set in the default order, as one page of 15 would hold it: page 2 is exactly
    // items 12 to 14 of it, and the union of the two pages is the count, each product once.
    const all = [...roses.items, ...rosesPage2.items].map(
      (card) => card.productId,
    );
    expect(new Set(all).size).toBe(15);
    expect(rosesPage2.items[0]?.productId).not.toBe(roses.items[0]?.productId);
  });

  it("renders page 1 with `items[0]` as the grid's first card and twelve products, each once", () => {
    for (const [page, subject] of [
      [<CountryCategoryPage key="c" view={roses} />, roses],
      [<CountryShopRootPage key="s" view={shopRoot} />, shopRoot],
      [<CountryOccasionPage key="o" view={mothersDay} />, mothersDay],
    ] as const) {
      const html = render(page, "en-gb");
      const cards = cardsIn(html);
      expect(cards, subject.path).toStrictEqual(
        subject.items.map((card) => card.productId),
      );
      expect(cards[0], subject.path).toBe(subject.items[0]?.productId);
      expect(cards.length, subject.path).toBe(
        Math.min(12, subject.resultCount),
      );
      // No product URL twice in `<main>` (AC-31's last bullet): each card's link once.
      for (const card of subject.items) {
        if (card.href === undefined) continue;
        expect(
          html.split(`href="${card.href}"`).length - 1,
          `${subject.path} ${card.href}`,
        ).toBe(1);
      }
    }
  });

  it("draws the country occasion's lead figure from `items[0]` itself: one element, its URL once (A16 (b))", () => {
    const html = render(<CountryOccasionPage view={mothersDay} />, "en-gb");
    const lead = mothersDay.items[0];
    if (lead === undefined) throw new Error("the occasion must have a lead");
    // One `<li>` is the lead, it is the grid's first, and it holds `items[0]`'s one card.
    expect(html.match(/data-fo-lead-item/gu) ?? []).toHaveLength(1);
    const item = html.slice(html.indexOf("data-fo-lead-item"));
    expect(
      item.indexOf(`data-fo-product-card="${lead.productId}"`),
    ).toBeLessThan(
      item.indexOf("data-fo-product-card=", item.indexOf("</li>")),
    );
    expect(
      html.match(
        new RegExp(`data-fo-product-card="${lead.productId}"`, "gu"),
      ) ?? [],
    ).toHaveLength(1);
    expect(html).not.toMatch(/display:\s*none/u);
    // The figure's box is an empty placeholder, never a second copy of the product.
    const box = html.slice(
      html.indexOf("data-fo-lead-box"),
      html.indexOf("</div>", html.indexOf("data-fo-lead-box")),
    );
    expect(box).not.toContain(lead.name);
    expect(box).not.toContain("<img");
  });

  it("renders no hero on page 2: the H1 alone, then the results (A15 (a), A23 clause 5)", () => {
    for (const [page, path] of [
      [<CountryCategoryPage key="c" view={rosesPage2} />, rosesPage2.path],
      [
        <CountryShopRootPage key="s" view={shopRootPage2} />,
        shopRootPage2.path,
      ],
    ] as const) {
      const html = render(page, "en-gb");
      expect(html, path).not.toContain("data-fo-listing-hero");
      expect(html, path).not.toContain("data-fo-lead");
      expect(html, path).not.toContain("data-fo-listing-state-line");
      expect(html, path).toContain("data-fo-listing-page-head");
      expect(html.match(/<h1/gu) ?? [], path).toHaveLength(1);
      // The first card of page 2 is the page's one `priority` candidate (spec 008 §14 A11): its
      // photograph if it has one, and nothing at all if it does not.
      const first = (page.props as { view: ListingView }).view.items[0];
      const photographed = first?.photo.kind === "asset" ? 1 : 0;
      expect(
        html.match(/<img[^>]*fetchpriority="high"/giu) ?? [],
        path,
      ).toHaveLength(photographed);
    }
  });
});

describe("spec 004 T-49, unit half: no lead figure on two types, the state line and the price marker", () => {
  it("draws no lead figure on the shop root and the country category", () => {
    for (const [page, path] of [
      [<CountryCategoryPage key="c" view={roses} />, roses.path],
      [<CountryShopRootPage key="s" view={shopRoot} />, shopRoot.path],
    ] as const) {
      const html = render(page, "en-gb");
      expect(html, path).not.toContain("data-fo-lead");
      expect(html, path).not.toContain("data-fo-lead-tag");
    }
  });

  it("prints the state the view carries, and a fixture flipped to `live` prints the other", () => {
    for (const subject of [roses, shopRoot, mothersDay]) {
      expect(subject.country?.state, subject.path).toBe("guide");
      const page = (v: ListingView): ReactElement =>
        v.pageType === "countryCategory" ? (
          <CountryCategoryPage view={v} />
        ) : v.pageType === "countryOccasion" ? (
          <CountryOccasionPage view={v} />
        ) : (
          <CountryShopRootPage view={v} />
        );
      const guide = readable(render(page(subject), "en-gb"));
      expect(guide, subject.path).toContain("Ordering opens soon");
      expect(guide, subject.path).not.toContain("Delivering now");
      const live: ListingView = {
        ...subject,
        country: { ...(subject.country ?? roses.country!), state: "live" },
      };
      const html = render(page(live), "en-gb");
      expect(html, subject.path).toContain('data-fo-listing-state-line="live"');
      expect(readable(html), subject.path).toContain("Delivering now");
      // The state line itself: the shop's demo notice opens with the same three words
      // (`shop.root.demoNotice`, a site-wide sentence spec 007 A-founder-2026-10-14c leaves alone).
      const stateLine =
        /data-fo-listing-state-line="live"[^>]*>([\s\S]*?)<\/p>/u.exec(
          html,
        )?.[1] ?? "";
      expect(readable(stateLine), subject.path).toContain("Delivering now");
      expect(readable(stateLine), subject.path).not.toContain(
        "Ordering opens soon",
      );
    }
  });

  it("puts the state line directly under the H1", () => {
    for (const [page, path] of [
      [<CountryCategoryPage key="c" view={roses} />, roses.path],
      [<CountryShopRootPage key="s" view={shopRoot} />, shopRoot.path],
      [<CountryOccasionPage key="o" view={mothersDay} />, mothersDay.path],
    ] as const) {
      const html = render(page, "en-gb");
      const h1End = html.indexOf("</h1>");
      expect(h1End, path).toBeGreaterThan(-1);
      expect(html.slice(h1End + 5).trimStart(), path).toMatch(
        /^<p[^>]*data-fo-listing-state-line=/u,
      );
    }
  });

  it('prices every card through `formatMoney` with "Includes VAT and delivery" beside it, in the same card', () => {
    for (const [page, subject] of [
      [<CountryCategoryPage key="c" view={roses} />, roses],
      [<CountryShopRootPage key="s" view={shopRoot} />, shopRoot],
      [<CountryOccasionPage key="o" view={mothersDay} />, mothersDay],
    ] as const) {
      const html = render(page, "en-gb");
      const articles = html.split("<article").slice(1);
      expect(articles.length, subject.path).toBe(subject.items.length);
      articles.forEach((article, index) => {
        const card = subject.items[index];
        if (card === undefined) throw new Error("card");
        const body = readable(
          `<article${article.slice(0, article.indexOf("</article>"))}`,
        ).replaceAll("\u00a0", " ");
        const price = formatMoney(card.price, "en-gb").replaceAll(
          "\u00a0",
          " ",
        );
        expect(body, card.productId).toContain(price);
        // Never a bare number: the inclusive words follow the price inside the same card
        // (spec 004 §14 A-founder-2026-10-19b clause 1; TASK-285).
        expect(body.slice(body.indexOf(price)), card.productId).toMatch(
          /^\S[^]*?Includes VAT and delivery/u,
        );
      });
    }
  });

  it("prints the occasion's date once as a sentence and once as the parts of that value", () => {
    const html = render(<CountryOccasionPage view={mothersDay} />, "en-gb");
    const text = readable(html);
    expect(mothersDay.occasionDates?.[0]?.date).toBe("2027-05-26");
    expect(text).toContain("Mother's Day in Poland is Wednesday, 26 May 2027.");
    const card = readable(
      html.slice(
        html.indexOf("data-fo-date-card"),
        html.indexOf("data-fo-listing-note"),
      ),
    );
    expect(card).toContain("26");
    expect(card).toContain("May · Wednesday · 2027");
  });

  it("gives the country occasion band its occasion's register from the registry", () => {
    expect(mothersDay.entity?.register).toBe("dated");
    const html = render(<CountryOccasionPage view={mothersDay} />, "en-gb");
    expect(html).toMatch(/data-fo-listing-hero[^>]*data-register="dated"/u);
    const flipped: ListingView = {
      ...mothersDay,
      entity: { ...mothersDay.entity!, register: "quiet" },
    };
    expect(render(<CountryOccasionPage view={flipped} />, "en-gb")).toMatch(
      /data-fo-listing-hero[^>]*data-register="quiet"/u,
    );
  });

  it('prints the "Example arrangement" label once above the grid, at every width, and keeps every card\'s hidden', () => {
    for (const [page, subject] of [
      [<CountryCategoryPage key="c" view={roses} />, roses],
      [<CountryShopRootPage key="s" view={shopRoot} />, shopRoot],
    ] as const) {
      const html = render(page, "en-gb");
      const slot = html.indexOf("data-fo-grid-provenance");
      const grid = html.indexOf("data-fo-listing-grid=");
      expect(slot, subject.path).toBeGreaterThan(-1);
      expect(slot, subject.path).toBeLessThan(grid);
      expect(readable(html.slice(slot, grid)), subject.path).toContain(
        "Example arrangement",
      );
      // One grid label element (spec 004 §14 A-founder-2026-10-19b clause 3; TASK-285).
      expect(
        html.match(/data-fo-grid-provenance=/gu)?.length ?? 0,
        subject.path,
      ).toBe(1);
      // The per-card labels stay in the HTML, hidden by CSS at every width in an all-example grid.
      expect(
        html.match(/data-fo-card-provenance="hidden"/gu)?.length ?? 0,
        subject.path,
      ).toBe(
        subject.items.filter((item) => item.photo.kind === "asset").length,
      );
      expect(html, subject.path).not.toContain('data-fo-card-provenance="md"');
    }
  });
});

describe("spec 008 T-34: the tile noun (AC-30)", () => {
  const tile = (locale: "en" | "pl") => {
    const t = createTranslator({
      locale,
      messages: loadMessages(locale, ["shop"]),
      namespace: "shop",
    });
    return (count: number, noun: string): string =>
      t("root.tileCount", { count, noun, country: "Poland" });
  };

  it("uses each category's registry noun on the shop root", () => {
    const html = render(<CountryShopRootPage view={shopRoot} />, "en-gb");
    const text = readable(html);
    const plants = shopRoot.tiles.find((entry) => entry.key === "plant");
    const arrangements = shopRoot.tiles.find(
      (entry) => entry.key === "arrangement",
    );
    const bouquets = shopRoot.tiles.find((entry) => entry.key === "bouquet");
    expect(plants?.countNoun).toBe("plant");
    expect(arrangements?.countNoun).toBe("arrangement");
    expect(bouquets?.countNoun).toBe("bouquet");
    const tileText = (key: string): string => {
      const at = html.indexOf(`data-fo-category-tile="${key}"`);
      return readable(html.slice(at, html.indexOf("</a>", at)));
    };
    expect(tileText("plant")).toContain(
      `${String(plants?.count)} plants we can make for Poland`,
    );
    expect(tileText("arrangement")).toContain(
      `${String(arrangements?.count)} arrangements we can make for Poland`,
    );
    expect(tileText("bouquet")).toContain(
      `${String(bouquets?.count)} bouquets we can make for Poland`,
    );
    expect(text).toContain("plants we can make for Poland");
  });

  it("gives every noun its own plural in `en` and Polish one/few/many/other", () => {
    const en = tile("en");
    expect(en(1, "plant")).toBe("1 plant we can make for Poland");
    expect(en(8, "plant")).toBe("8 plants we can make for Poland");
    expect(en(14, "arrangement")).toBe(
      "14 arrangements we can make for Poland",
    );
    expect(en(40, "bouquet")).toBe("40 bouquets we can make for Poland");
    const pl = tile("pl");
    expect(pl(2, "plant")).toBe("2 rośliny, które możemy wykonać dla Poland");
    expect(pl(5, "plant")).toBe("5 roślin, które możemy wykonać dla Poland");
    expect(pl(22, "plant")).toBe("22 rośliny, które możemy wykonać dla Poland");
    expect(pl(2, "arrangement")).toBe(
      "2 kompozycje, które możemy wykonać dla Poland",
    );
    expect(pl(5, "arrangement")).toBe(
      "5 kompozycji, które możemy wykonać dla Poland",
    );
    expect(pl(22, "bouquet")).toBe(
      "22 bukiety, które możemy wykonać dla Poland",
    );
    expect(pl(5, "bouquet")).toBe(
      "5 bukietów, które możemy wykonać dla Poland",
    );
  });

  it("names every category with one of the three nouns", async () => {
    const { categoryPresentation } =
      await import("../../src/config/catalogue/listing-presentation");
    for (const category of CATEGORIES) {
      expect(["bouquet", "plant", "arrangement"], category.key).toContain(
        categoryPresentation(category.key).countNoun,
      );
    }
  });
});

describe("spec 004 T-40: A9 and A10 byte for byte, unreviewed (AC-38)", () => {
  const messages = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../messages/en.json"),
      "utf8",
    ),
  ) as {
    shop: { toolbar: Record<string, string>; root: Record<string, string> };
  };
  const meta = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../messages/en.meta.json"),
      "utf8",
    ),
  ) as Record<
    string,
    { reviewed: boolean; reviewedBy?: string; sourceHash: string }
  >;

  it('A10: the label of the toolbar under the grid is "Change the order"', () => {
    expect(messages.shop.toolbar.reorderLabel).toBe("Change the order");
    const html = render(<CountryCategoryPage view={roses} />, "en-gb");
    const form = html.indexOf("data-fo-listing-sort-form");
    expect(readable(html.slice(form, html.indexOf("</form>", form)))).toContain(
      "Change the order",
    );
  });

  it('A9: "{count} {noun} we can make for {country}" for the three approved examples', () => {
    const t = createTranslator({
      locale: "en",
      messages: loadMessages("en", ["shop"]),
      namespace: "shop",
    });
    for (const [count, noun, text] of [
      [8, "plant", "8 plants we can make for Poland"],
      [14, "arrangement", "14 arrangements we can make for Poland"],
      [40, "bouquet", "40 bouquets we can make for Poland"],
    ] as const) {
      expect(t("root.tileCount", { count, noun, country: "Poland" })).toBe(
        text,
      );
    }
  });

  it("ships every key it adds or changes `reviewed: false`, with the hash of the value it ships", () => {
    const flat: Record<string, string> = {
      "shop.root.tileCount": messages.shop.root.tileCount ?? "",
      "shop.toolbar.reorderLabel": messages.shop.toolbar.reorderLabel ?? "",
    };
    for (const [key, value] of Object.entries(flat)) {
      // Unreviewed, unless the founder's own `record-approval-batch4.py` run recorded it.
      const recorded =
        /^founder, \d{4}-\d{2}-\d{2}: ran record-approval-batch4\.py /u.test(
          meta[key]?.reviewedBy ?? "",
        );
      expect(meta[key]?.reviewed, key).toBe(recorded);
      expect(meta[key]?.sourceHash, key).toBe(
        createHash("sha256").update(value, "utf8").digest("hex"),
      );
    }
  });
});

describe("the withdrawn photographs lead with the honest placeholder (`/review 202` carry-forward)", () => {
  it("renders Peace Lily (FO-PT-004) and Olive Sapling (FO-PT-006) with no photograph", async () => {
    for (const sku of ["FO-PT-004", "FO-PT-006"]) {
      const product = PRODUCTS.find((entry) => entry.sku === sku);
      if (product === undefined) throw new Error(sku);
      const card = await productCardView(
        product as Parameters<typeof productCardView>[0],
        "en-gb",
        "PL",
      );
      expect(card.photo.kind, sku).toBe("placeholder");
    }
  });
});
