/**
 * The v3 home's sections as server markup (spec 004 §14 A-founder-2026-10-24a items 2, 4 and 8;
 * TASK-386, TASK-387): the country-less card (AC-75's markup, spec 008 AC-6's first form), the
 * sections' order and their last-element rule (AC-96's unit half), the occasion tabs with no
 * script (AC-97's unit half), the price words with no amount, and the example label once per grid
 * with each section's `ItemList` equal to its cards and carrying no price (AC-107).
 *
 * Rendered with `react-dom/server` against the real catalogues and the committed `homeView()`.
 * The browser halves (JavaScript off, clicks and keys, boxes) are `tests/e2e/home-v3-products.spec.ts`.
 */
import { readFileSync } from "node:fs";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import { homeView } from "../../src/modules/catalog/home.ts";
import { type MessageNamespace, loadMessages } from "../../src/modules/i18n";
import { itemList } from "../../src/modules/seo";
import { HomeComingUp } from "../../src/modules/ui/home/HomeComingUp.tsx";
import { HomeHero } from "../../src/modules/ui/home/HomeHero.tsx";
import { HomeOccasionTabs } from "../../src/modules/ui/home/HomeOccasionTabs.tsx";
import { HomePriceWords } from "../../src/modules/ui/home/HomePriceWords.tsx";
import { HomeSelection } from "../../src/modules/ui/home/HomeSelection.tsx";
import {
  type HomeView,
  homeItemListEntries,
} from "../../src/modules/ui/home/home-view.ts";

const NAMESPACES = Object.keys(en) as MessageNamespace[];
const NOW = new Date("2026-10-25T09:00:00Z");

function render(node: React.ReactElement, locale = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** The `data-fo-home-section` values in document order. */
function sections(html: string): string[] {
  return [...html.matchAll(/data-fo-home-section="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

/** The product ids of the cards inside the element that opens at `start`. */
function cardIdsIn(html: string): string[] {
  return [...html.matchAll(/data-fo-product-card="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

let view: HomeView;
let page: string;

beforeAll(async () => {
  view = await homeView("en", { now: NOW });
  page = render(
    <>
      <HomeHero locale="en" picker={view.picker} notOpen={view.notOpen} />
      <HomeSelection selection={view.selection} />
      <HomeOccasionTabs occasions={view.occasions} />
      <HomePriceWords bands={view.priceBands} />
      <HomeComingUp comingUp={view.comingUp} />
    </>,
  );
});

describe("the country-less card (AC-75's markup; spec 008 AC-6's first form)", () => {
  it("prints the photograph, the name, the price box's ask and the action line, and links through the chooser", () => {
    const selection = render(<HomeSelection selection={view.selection} />);
    const first = view.selection.cards[0];
    expect(first).toBeDefined();
    const start = selection.indexOf(
      `data-fo-product-card="${first?.productId ?? ""}"`,
    );
    const card = selection.slice(start, selection.indexOf("</article>", start));
    expect(card).toMatch(
      new RegExp(
        `<a [^>]*href="${first?.href ?? ""}"[^>]*rel="nofollow"|<a [^>]*rel="nofollow"[^>]*href="${first?.href ?? ""}"`,
        "u",
      ),
    );
    expect(card).toContain("data-fo-card-ask");
    expect(text(card)).toContain("Choose a country to see the price");
    expect(text(card)).toContain("Choose where to send");
    expect(card).toContain('data-fo-product-card-money="none"');
  });

  it("prints no amount, no currency and no add-to-basket on any card of the home", () => {
    const words = text(page);
    expect(words).not.toMatch(/[€£$]|\bPLN\b|\bzł\b|\bEUR\b|\bGBP\b|\bUSD\b/u);
    expect(words).not.toMatch(/\d+[.,]\d{2}/u);
    expect(page).not.toMatch(/data-fo-product-card-money="priced"/u);
    expect(page).not.toMatch(/basket/iu);
  });
});

describe("the sections (AC-96's unit half)", () => {
  it("are in the spec's DOM order, after the first screen", () => {
    const order = sections(page);
    expect(order.slice(0, 3)).toStrictEqual([
      "selection",
      "occasions",
      "price",
    ]);
    if (view.comingUp.length > 0) expect(order[3]).toBe("coming-up");
    expect(page.indexOf("data-fo-hero")).toBeLessThan(
      page.indexOf('data-fo-home-section="selection"'),
    );
    // The sentence picker is gone.
    expect(page).not.toContain("data-fo-sentence");
  });

  it("shows the whole core range in Our selection, with How we sort closed and See all to the chooser", () => {
    const html = render(<HomeSelection selection={view.selection} />);
    expect(cardIdsIn(html)).toStrictEqual(
      view.selection.cards.map((card) => card.productId),
    );
    expect(html).toMatch(/<details class="[^"]*" data-fo-how-we-sort="">/u);
    expect(html).not.toMatch(/<details[^>]* open/u);
    expect(text(html)).toContain(
      `See all ${String(view.selection.cards.length)}`,
    );
    expect(html).toMatch(
      /<a [^>]*href="\/en\/choose-country"[^>]*rel="nofollow"[^>]*data-fo-see-all="selection"/u,
    );
  });

  it("ends each product section with its list, followed only by its See all (item 4)", () => {
    const html = render(<HomeSelection selection={view.selection} />);
    const list = html.lastIndexOf("</ul>");
    const tail = html.slice(list + "</ul>".length);
    expect(tail).toMatch(
      /^<div[^>]*><a [^>]*data-fo-see-all="selection"[^>]*>[^<]*<\/a><\/div><\/section>$/u,
    );
  });

  it("labels the price bands in words only, each a chooser link to its band (red with an amount)", () => {
    const html = render(<HomePriceWords bands={view.priceBands} />);
    const links = [
      ...html.matchAll(
        /<a [^>]*href="([^"]+)"[^>]*rel="nofollow"[^>]*>([^<]*)<\/a>/gu,
      ),
    ].map((match) => [match[1], match[2]]);
    expect(links).toStrictEqual([
      ["/en/choose-country/price/low", "Lower prices"],
      ["/en/choose-country/price/mid", "Middle prices"],
      ["/en/choose-country/price/high", "Higher prices"],
    ]);
    expect(text(html)).not.toMatch(/\d/u);
    // The board's eyebrow and heading: "By price", then "Shop by price" (`home.price.heading`).
    expect(text(html).startsWith("By price Shop by price ")).toBe(true);
  });
});

describe("the occasion tabs: one native radio group, no script (AC-97's unit half)", () => {
  it("draws one radio per tab in one group, the first checked, each named by its occasion", () => {
    const html = render(<HomeOccasionTabs occasions={view.occasions} />);
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/gu)].map(
      (match) => match[0],
    );
    expect(radios).toHaveLength(view.occasions.length);
    for (const radio of radios) expect(radio).toContain('name="home-occasion"');
    expect(radios.filter((radio) => radio.includes("checked"))).toHaveLength(1);
    expect(radios[0]).toContain("checked");
    expect(html).toMatch(
      /role="radiogroup" aria-labelledby="occasions-heading"/u,
    );
    const labels = [
      ...html.matchAll(/<label [^>]*><input [^>]*>([^<]*)<\/label>/gu),
    ].map((match) => match[1]);
    expect(labels).toStrictEqual([
      "Birthday",
      "Sympathy",
      "Thank you",
      "Anniversary",
      "Get well",
    ]);
  });

  it("puts every panel in the HTML, each a named group, and no script in the section", () => {
    const html = render(<HomeOccasionTabs occasions={view.occasions} />);
    const panels = [
      ...html.matchAll(
        /<div role="group" aria-label="([^"]+)" data-fo-occasion-panel="(\d)">/gu,
      ),
    ];
    expect(panels.map((match) => match[1])).toStrictEqual([
      "Birthday",
      "Sympathy",
      "Thank you",
      "Anniversary",
      "Get well",
    ]);
    expect(panels.map((match) => match[2])).toStrictEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/\son[a-z]+=/u);
  });

  it("shows only the checked tab's panel, by CSS alone (globals.css)", () => {
    const css = readFileSync("src/app/globals.css", "utf8").replaceAll(
      /\s+/gu,
      " ",
    );
    expect(css).toMatch(
      /\[data-fo-occasion-tabs\] \[data-fo-occasion-panel\] \{ display: none; \}/u,
    );
    for (let index = 0; index < 6; index += 1) {
      expect(css).toContain(
        `[data-fo-occasion-tabs]:has([data-fo-occasion-tab="${String(index)}"]:checked) [data-fo-occasion-panel="${String(index)}"]`,
      );
    }
  });
});

describe("the example label once per grid, and each section's ItemList (AC-107)", () => {
  it("prints the reviewed label once per section, and keeps every generated card's own label hidden in the HTML", () => {
    const html = render(<HomeSelection selection={view.selection} />);
    const grid = [...html.matchAll(/data-fo-grid-label=""/gu)];
    expect(grid).toHaveLength(1);
    expect(text(html)).toContain(
      "Example arrangement · our florist hand-makes each one",
    );
    const generated = view.selection.cards.filter(
      (card) => card.photo.kind === "asset" && card.provenance === "ai",
    );
    expect(generated.length).toBeGreaterThan(0);
    const hidden = [...html.matchAll(/data-fo-card-provenance="hidden"/gu)];
    expect(hidden.length).toBe(generated.length);
    // The label's text is unchanged: the reviewed `media.provenance.aiExample`.
    expect(en.media.provenance.aiExample).toBe(
      "Example arrangement · our florist hand-makes each one",
    );
  });

  it("gives each section an ItemList equal to its displayed cards by count, order, name and URL, with no price", () => {
    const lists = homeItemListEntries(view);
    expect(lists[0]?.map((entry) => entry.name)).toStrictEqual(
      view.selection.cards.map((card) => card.name),
    );
    expect(lists[0]?.map((entry) => entry.href)).toStrictEqual(
      view.selection.cards.map((card) => card.href),
    );
    // The occasion section's list is the checked (first) panel's cards.
    const tabs = render(<HomeOccasionTabs occasions={view.occasions} />);
    const firstPanel = tabs.slice(
      tabs.indexOf('data-fo-occasion-panel="0"'),
      tabs.indexOf('data-fo-occasion-panel="1"'),
    );
    expect(lists[1]?.map((entry) => entry.href)).toStrictEqual(
      [...firstPanel.matchAll(/<a class="group[^"]*" href="([^"]+)"/gu)].map(
        (match) => match[1],
      ),
    );
    const node = itemList(lists[0] ?? [], {
      baseUrl: "https://flowersoverseas.com",
    });
    const serialised = JSON.stringify(node);
    expect(serialised).toContain(
      '"numberOfItems":' + String(view.selection.cards.length),
    );
    for (const field of ["price", "offers", "Offer", "priceCurrency"]) {
      expect(serialised, field).not.toContain(field);
    }
  });
});
