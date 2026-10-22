/**
 * The listing card says its price once (spec 004 §14 A-founder-2026-10-19b clauses 1 to 4; spec 008
 * AC-6 as amended there, T-06 and T-07 amended, and A21's amended test bullet; TASK-285).
 *
 * Rendered against the real `messages/*.json`, so every expected string is the one that ships:
 *
 *  1. a priced card prints `formatMoney(card.price)` and, beside it, the locale's resolved
 *     `catalog.price.inclusive`, and nothing else in the price element;
 *  2. no card prints an equivalents line, and neither card schema can carry one;
 *  3. a hub card prints the photograph and the name only: no `shop.card.noPrice`, no price element;
 *  4. the example label's three modes (`gridProvenanceMode`) and what the grid does with each card's
 *     own label: hidden at every width in an all-example grid, from `md` up in a mixed one, and
 *     the lead figure's own from `md` up in either. The label stays in the HTML in every mode.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import type { LocaleCode } from "../../src/config/locales.ts";
import { formatMoney, loadMessages } from "../../src/modules/i18n";
import { GridProvenance } from "../../src/modules/ui/shop/GridProvenance.tsx";
import { ListingGrid } from "../../src/modules/ui/shop/ListingGrid.tsx";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";
import { equivalentsMessageValues } from "../../src/modules/ui/shop/equivalents.ts";
import { gridProvenanceMode } from "../../src/modules/ui/shop/gridProvenanceMode.ts";
import {
  HubCardViewSchema,
  ProductCardViewSchema,
  type HubCardView,
  type ProductCardView,
} from "../../src/modules/ui/shop/viewModel.ts";

import {
  BAND_ASSET,
  PRODUCT_ASSET,
  SECOND_PRODUCT_ASSET,
  mediaFixture,
} from "./support/media-fixture.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const MANIFEST = mediaFixture();

function render(node: React.ReactElement, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["shop", "catalog", "media", "a11y"])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** The resolved message at `path` in `locale`'s catalogue (the one the card renders from). */
function message(
  locale: LocaleCode,
  namespace: "catalog" | "shop" | "media",
  path: string,
): string {
  let node: unknown = loadMessages(locale, [namespace])[namespace];
  for (const part of path.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== "string") {
    throw new Error(`${locale}: ${namespace}.${path} must be a string`);
  }
  return node;
}

function decode(html: string): string {
  return html
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');
}

/** The text of the card's price element, tags stripped, or `undefined` when there is none. */
function priceText(html: string): string | undefined {
  const at = html.indexOf('data-fo-price="card"');
  if (at < 0) return undefined;
  const open = html.lastIndexOf("<span", at);
  let depth = 0;
  let cursor = open;
  const tag = /<(\/?)span\b[^>]*>/gu;
  tag.lastIndex = open;
  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    depth += match[1] === "/" ? -1 : 1;
    cursor = tag.lastIndex;
    if (depth === 0) break;
  }
  return decode(html.slice(open, cursor).replace(/<[^>]+>/gu, ""));
}

/** €45.90 charged, a fixture asset shown. */
const EUR_CARD: ProductCardView = {
  productId: "FO-BQ-001",
  name: "Amber Hour",
  photo: { kind: "asset", assetId: PRODUCT_ASSET, alt: "x", slot: "grid" },
  price: { amountMinor: 4590, currency: "EUR" },
  priceLabelKey: "catalog.price.inclusive",
  provenance: "ai",
};

const HUB_CARD: HubCardView = {
  productId: "FO-BQ-001",
  name: "Amber Hour",
  photo: { kind: "asset", assetId: PRODUCT_ASSET, alt: "x", slot: "grid" },
  provenance: "ai",
};

/** One amount per locale, so each case pins its own `formatMoney` output. */
const CHARGED = {
  en: { amountMinor: 4590, currency: "EUR" },
  "en-gb": { amountMinor: 3885, currency: "GBP" },
  de: { amountMinor: 4590, currency: "EUR" },
  pl: { amountMinor: 22_900, currency: "PLN" },
} as const;

describe("a priced card: one price, with the locale's VAT-and-delivery words beside it (clause 1)", () => {
  it.each(LOCALES)("%s", (locale) => {
    const card: ProductCardView = { ...EUR_CARD, price: CHARGED[locale] };
    const html = render(
      <ProductCard card={card} locale={locale} manifest={MANIFEST} />,
      locale,
    );
    // The whole price element is the amount and the inclusive words: no "all in", no second
    // amount, no equivalents.
    expect(priceText(html)).toBe(
      `${formatMoney(card.price, locale)}${message(locale, "catalog", "price.inclusive")}`,
    );
    expect(html.split('data-fo-price="card"')).toHaveLength(2);
  });

  it("never prints the retired `all in` wording (the key is gone from every catalogue)", () => {
    for (const locale of LOCALES) {
      const catalog = loadMessages(locale, ["catalog"])["catalog"] as {
        price: Record<string, unknown>;
      };
      expect(catalog.price, locale).not.toHaveProperty("allIn");
      const html = render(
        <ProductCard card={EUR_CARD} locale={locale} manifest={MANIFEST} />,
        locale,
      );
      expect(decode(html), locale).not.toMatch(/\ball in\b/u);
    }
  });

  it("sets the words in leaf, beside the amount from `md` up and under it below `md` (item 7A)", () => {
    const html = render(
      <ProductCard card={EUR_CARD} locale="en" manifest={MANIFEST} />,
      "en",
    );
    const words = message("en", "catalog", "price.inclusive");
    const span = new RegExp(`<span class="([^"]*)">${words}</span>`, "u").exec(
      html,
    );
    expect(span?.[1]?.split(" ")).toEqual(
      expect.arrayContaining([
        "text-included",
        "block",
        "text-xs",
        "md:inline",
        "md:text-fine",
        "md:whitespace-nowrap",
      ]),
    );
  });
});

describe("no equivalents on a card (clause 2; A21's amended test bullet)", () => {
  it.each(LOCALES)(
    "%s: a fixture card renders no equivalents line",
    (locale) => {
      const html = render(
        <ProductCard card={EUR_CARD} locale={locale} manifest={MANIFEST} />,
        locale,
      );
      expect(html).not.toContain("data-fo-price-equivalents");
      const [before] = message(locale, "catalog", "price.equivalents").split(
        "{amounts}",
      );
      expect((before ?? "").trim()).not.toBe("");
      expect(decode(html)).not.toContain((before ?? "").trim());
    },
  );

  it("the card's view model has no field to carry them, priced or hub", () => {
    const equivalents = {
      asOf: "2026-09-08",
      amounts: [{ amountMinor: 3885, currency: "GBP" }],
    };
    expect(ProductCardViewSchema.safeParse(EUR_CARD).success).toBe(true);
    expect(
      ProductCardViewSchema.safeParse({ ...EUR_CARD, equivalents }).success,
    ).toBe(false);
    expect(HubCardViewSchema.safeParse(HUB_CARD).success).toBe(true);
    expect(
      HubCardViewSchema.safeParse({ ...HUB_CARD, equivalents }).success,
    ).toBe(false);
  });
});

describe("a hub card: the photograph and the name only (clause 4; T-07 amended)", () => {
  it.each(LOCALES)("%s", (locale) => {
    const html = render(
      <ProductCard card={HUB_CARD} locale={locale} manifest={MANIFEST} />,
      locale,
    );
    expect(html).toContain('data-fo-product-card-money="none"');
    expect(html).not.toContain("data-fo-price");
    // The whole of the card's text is its name and its example label: nothing in the price slot.
    expect(
      decode(html.replace(/<[^>]+>/gu, ""))
        .replace(message(locale, "media", "provenance.aiExample"), "")
        .trim(),
    ).toBe("Amber Hour");
    // The retired line, in the words it shipped with, and the key itself.
    expect(decode(html)).not.toContain(
      "No price here. The price depends on the destination.",
    );
    const shop = loadMessages(locale, ["shop"])["shop"] as Record<
      string,
      unknown
    >;
    expect(shop, locale).not.toHaveProperty("card");
  });
});

/** Cards over the fixture manifest: `ai` product photographs and one non-`ai` photograph. */
function card(id: string, assetId: string | undefined): ProductCardView {
  return {
    ...EUR_CARD,
    productId: id,
    name: id,
    photo:
      assetId === undefined
        ? { kind: "placeholder", slot: "grid" }
        : { kind: "asset", assetId, alt: "x", slot: "grid" },
  };
}

const ALL_EXAMPLE = [
  card("A", PRODUCT_ASSET),
  card("B", SECOND_PRODUCT_ASSET),
  card("C", undefined),
];
const MIXED = [card("A", PRODUCT_ASSET), card("B", BAND_ASSET)];
const NO_EXAMPLE = [card("A", BAND_ASSET), card("B", undefined)];

describe("gridProvenanceMode (clause 3)", () => {
  it("all: every card that shows a photograph shows an example; a placeholder counts for neither", () => {
    expect(gridProvenanceMode(ALL_EXAMPLE, "en", MANIFEST)).toBe("all");
  });
  it("mixed: one non-`ai` photograph beside an example", () => {
    expect(gridProvenanceMode(MIXED, "en", MANIFEST)).toBe("mixed");
  });
  it("none: no card shows an example (a photograph, a placeholder, an empty grid)", () => {
    expect(gridProvenanceMode(NO_EXAMPLE, "en", MANIFEST)).toBe("none");
    expect(gridProvenanceMode([], "en", MANIFEST)).toBe("none");
  });
  it("an example that degrades to the placeholder (no alt in this locale) shows nothing", () => {
    const englishAltOnly = mediaFixture({ altLocales: ["en"] });
    expect(gridProvenanceMode(MIXED, "en", englishAltOnly)).toBe("mixed");
    expect(gridProvenanceMode(MIXED, "pl", englishAltOnly)).toBe("none");
  });
});

describe("GridProvenance: one element per grid, displayed as the mode says (clause 3)", () => {
  function label(cards: readonly ProductCardView[]): string {
    return render(
      <GridProvenance cards={cards} locale="en" manifest={MANIFEST} />,
      "en",
    );
  }

  it("all-example: one label, displayed at every width (no width class)", () => {
    const html = label(ALL_EXAMPLE);
    expect(html.split("data-fo-grid-provenance=")).toHaveLength(2);
    expect(html).toMatch(/^<div data-fo-grid-provenance="all">/u);
    expect(decode(html)).toContain(
      message("en", "media", "provenance.aiExample"),
    );
  });

  it("mixed: one label, displayed below `md` only", () => {
    const html = label(MIXED);
    expect(html.split("data-fo-grid-provenance=")).toHaveLength(2);
    expect(html).toMatch(
      /^<div class="md:hidden" data-fo-grid-provenance="mixed">/u,
    );
  });

  it("none: nothing at all", () => {
    expect(label(NO_EXAMPLE)).toBe("");
  });
});

/** Each card's own label wrapper, in grid order: its `data-fo-card-provenance` and its classes. */
function cardLabels(html: string): { mode: string; className: string }[] {
  return html
    .split("data-fo-product-card=")
    .slice(1)
    .flatMap((part) => {
      const match =
        /<div class="([^"]*)" data-fo-card-provenance="([^"]*)"><div data-fo-media-provenance="ai">/u.exec(
          part,
        );
      return match === null
        ? []
        : [{ mode: match[2] ?? "", className: match[1] ?? "" }];
    });
}

describe("ListingGrid provenance=grid: each card keeps its label in the HTML, hidden where the grid's shows", () => {
  it("all-example grid: every card's label is `display: none` at every width", () => {
    const html = render(
      <ListingGrid
        cards={ALL_EXAMPLE}
        locale="en"
        manifest={MANIFEST}
        provenance="grid"
      />,
      "en",
    );
    expect(cardLabels(html)).toEqual([
      { mode: "hidden", className: "hidden" },
      { mode: "hidden", className: "hidden" },
    ]);
    // Displayed nowhere, present in the HTML once per `ai` card (spec 006 AC-17).
    expect(html.split('data-fo-media-provenance="ai"')).toHaveLength(3);
  });

  it("mixed grid: each `ai` card displays its own from `md` up only", () => {
    const html = render(
      <ListingGrid
        cards={MIXED}
        locale="en"
        manifest={MANIFEST}
        provenance="grid"
      />,
      "en",
    );
    expect(cardLabels(html)).toEqual([
      { mode: "md", className: "max-md:hidden" },
    ]);
  });

  it("the lead figure keeps its own label from `md` up in an all-example grid", () => {
    const html = render(
      <ListingGrid
        cards={ALL_EXAMPLE}
        lead
        locale="en"
        manifest={MANIFEST}
        provenance="grid"
      />,
      "en",
    );
    expect(cardLabels(html)).toEqual([
      { mode: "md", className: "max-md:hidden" },
      { mode: "hidden", className: "hidden" },
    ]);
  });

  it("the default (`card`, the gallery's sample) leaves the label displayed under each card", () => {
    const html = render(
      <ListingGrid cards={ALL_EXAMPLE} locale="en" manifest={MANIFEST} />,
      "en",
    );
    expect(html).not.toContain("data-fo-card-provenance");
    expect(html.split('data-fo-media-provenance="ai"')).toHaveLength(3);
  });
});

describe("equivalentsMessageValues (the product page's line, unchanged)", () => {
  it("names the rate's calendar day in every locale, whatever the server's zone", () => {
    for (const [locale, date] of [
      ["en", "8 September"],
      ["en-gb", "8 September"],
      ["de", "8. September"],
      ["pl", "8 września"],
    ] as const) {
      expect(
        equivalentsMessageValues(
          {
            asOf: "2026-09-08",
            amounts: [{ amountMinor: 1, currency: "GBP" }],
          },
          locale,
        ).date,
      ).toBe(date);
    }
  });
});
