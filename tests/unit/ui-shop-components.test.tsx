/**
 * The listing primitives, every state the sheet draws (spec 008 §5.2, §5.3, **AC-6**, §13 Q3/Q6/
 * Q8, **T-06** (DOM half), **T-30**; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing and card blocks").
 *
 * Rendered with `react-dom/server` against the **real** `messages/*.json` through the provider the
 * document layout uses (`tests/unit/ui-media-asset.test.tsx`'s pattern), so the sentences asserted
 * here are the sentences that ship, in the locale they ship in.
 *
 * The AC-6 scan is `tests/support/listing-honesty.ts` — the same patterns the `/dev/components`
 * e2e run and TASK-117's six-page-type run use, so "no rating, star, review count, badge,
 * delivery-timing claim, strike-through, old price, countdown or add-to-basket" is one assertion
 * maintained in one place.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import type { LocaleCode } from "../../src/config/locales.ts";
import { loadMessages } from "../../src/modules/i18n";
import {
  committedMediaManifest,
  setMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";
import { CategoryChipRow } from "../../src/modules/ui/shop/CategoryChipRow.tsx";
import { FromPriceChip } from "../../src/modules/ui/shop/FromPriceChip.tsx";
import { ListingEmpty } from "../../src/modules/ui/shop/ListingEmpty.tsx";
import { ListingGrid } from "../../src/modules/ui/shop/ListingGrid.tsx";
import { ListingToolbar } from "../../src/modules/ui/shop/ListingToolbar.tsx";
import { Pagination, pageHref } from "../../src/modules/ui/shop/Pagination.tsx";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";
import type { ProductCardView } from "../../src/modules/ui/shop/viewModel.ts";
import {
  listingHonestyViolations,
  textOf,
} from "../support/listing-honesty.ts";
import {
  BAND_ASSET,
  FIXTURE_ALT,
  PRODUCT_ASSET,
  mediaFixture,
} from "./support/media-fixture.ts";

const LOCALES: readonly LocaleCode[] = ["en", "en-gb", "de", "pl"];

function render(node: React.ReactElement, locale: LocaleCode = "en"): string {
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

const CARD: ProductCardView = {
  productId: "FO-BQ-001",
  name: "Amber Hour",
  photo: { kind: "placeholder", slot: "grid" },
  price: { amountMinor: 4690, currency: "GBP" },
  priceLabelKey: "catalog.price.inclusive",
  provenance: "ai",
};

const IMAGE_CARD: ProductCardView = {
  ...CARD,
  photo: {
    kind: "asset",
    assetId: PRODUCT_ASSET,
    alt: "Amber and cream roses hand-tied with kraft paper on a warm grey background",
    slot: "grid",
  },
};

function cards(count: number): ProductCardView[] {
  return Array.from({ length: count }, (_, index) => ({
    ...CARD,
    productId: `FO-BQ-${String(index).padStart(3, "0")}`,
    name: `Bouquet ${String(index)}`,
  }));
}

afterEach(() => {
  setMediaManifest(committedMediaManifest);
});

describe("ProductCard: the four states of the sheet's first row", () => {
  it("renders the placeholder state with no <img> and no <a>", () => {
    const html = render(<ProductCard card={CARD} locale="en" />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain('data-fo-product-card-kind="tile"');
    // The captioned box, from `media.placeholder.product` — never a broken image (§5.3).
    expect(html).toContain("Photography to supply");
  });

  it("renders the image state through MediaAsset, in the card's 4∶5 box", () => {
    setMediaManifest(mediaFixture());
    const html = render(<ProductCard card={IMAGE_CARD} locale="en" />);
    expect(html).toContain("<picture");
    expect(html).toContain("aspect-[4/5]");
    // The alt text is the dataset's, not the view model's and not the product name (006 AC-18).
    expect(html).toContain('alt="Amber and cream roses');
  });

  it("keeps the same 4∶5 box in every state, so both swaps cost zero layout shift", () => {
    setMediaManifest(mediaFixture());
    const boxes = [
      render(<ProductCard card={CARD} locale="en" />),
      render(<ProductCard card={IMAGE_CARD} locale="en" />),
      render(<ProductCard card={{ ...CARD, href: "/en/x" }} locale="en" />),
    ].map((html) => html.includes("aspect-[4/5]"));
    expect(boxes).toEqual([true, true, true]);
  });

  // §13 Q8 / AC-12: the flip is the element and nothing else.
  it("becomes a link when the view model carries an href, with no other markup change", () => {
    const tile = render(<ProductCard card={CARD} locale="en" />);
    const link = render(
      <ProductCard
        card={{ ...CARD, href: "/en/poland/flowers/amber" }}
        locale="en"
      />,
    );
    expect(link).toContain('href="/en/poland/flowers/amber"');
    expect(link).toContain('data-fo-product-card-kind="link"');
    expect(textOf(link)).toBe(textOf(tile));
  });

  it("shows one all-in price, through formatMoney, with the inclusive wording beside it", () => {
    const html = render(<ProductCard card={CARD} locale="en-gb" />, "en-gb");
    expect(html).toContain("£46.90");
    expect(html).toContain("Includes VAT and delivery");
    // One price and one only: no second currency figure anywhere on the card.
    expect([...textOf(html).matchAll(/£/gu)]).toHaveLength(1);
  });

  it("wraps the name and the price in <bdi> (T-30)", () => {
    const html = render(<ProductCard card={CARD} locale="en" />);
    // T-30 says the name/price **pair**; the pair is isolated by wrapping each of the two, not by
    // one `<bdi>` around both. `<bdi>` isolates its contents from the surrounding run, so a single
    // wrapper would still let a Latin name and the digits of the price reorder against *each
    // other* inside it — which is the exact failure the criterion is about, on `/ar-XB` and on
    // Arabic when it ships. Two elements isolate the name from the price as well as both from the
    // page, and the card's DOM order (heading then price) is unchanged either way.
    expect(html).toContain("<bdi>Amber Hour</bdi>");
    expect(html).toMatch(/<bdi>[^<]*46[.,]90[^<]*<\/bdi>/u);
  });

  it("carries the AI honesty label wherever a generated asset is displayed (AC-6)", () => {
    setMediaManifest(mediaFixture());
    const shown = render(<ProductCard card={IMAGE_CARD} locale="en" />);
    expect(shown).toContain('data-fo-media-provenance="ai"');
    // No generated image displayed → no label. The placeholder state shows nothing generated.
    expect(render(<ProductCard card={CARD} locale="en" />)).not.toContain(
      "data-fo-media-provenance",
    );
  });

  it("labels from the manifest, not from the view model's provenance field", () => {
    // `ProductCardView.provenance` is **data about the product's imagery**, carried for the
    // projection and for anything downstream that reasons about a catalogue row; no component
    // reads it. What is displayed decides what is labelled, and what is displayed is a manifest
    // asset, so `MediaProvenanceNote` asks the manifest. Pinned here so the two cannot be assumed
    // interchangeable: a card that *claims* `ai` while displaying the manifest's `photo` asset
    // carries no label, and a card that claims `photo` while displaying the `ai` asset does.
    setMediaManifest(mediaFixture());
    const claimsAiShowsPhoto = render(
      <ProductCard
        card={{
          ...CARD,
          photo: {
            kind: "asset",
            assetId: BAND_ASSET,
            alt: FIXTURE_ALT.en ?? "",
            slot: "grid",
          },
          provenance: "ai",
        }}
        locale="en"
      />,
    );
    expect(claimsAiShowsPhoto).not.toContain("data-fo-media-provenance");

    const claimsPhotoShowsAi = render(
      <ProductCard card={{ ...IMAGE_CARD, provenance: "photo" }} locale="en" />,
    );
    expect(claimsPhotoShowsAi).toContain('data-fo-media-provenance="ai"');
  });

  it.each(LOCALES)("says nothing AC-6 forbids in %s", (locale) => {
    setMediaManifest(mediaFixture());
    const html = render(
      <ProductCard card={IMAGE_CARD} locale={locale} />,
      locale,
    );
    expect(listingHonestyViolations({ html, text: textOf(html) })).toEqual([]);
  });
});

describe("ListingGrid: a named list, 2-up to 4-up", () => {
  it("is a <ul> of <li> with an accessible name carrying the count", () => {
    const html = render(<ListingGrid cards={cards(4)} locale="en" />);
    expect(html).toContain("<ul");
    expect([...html.matchAll(/<li>/gu)]).toHaveLength(4);
    expect(html).toContain('aria-label="4 bouquets on this page"');
    expect(html).toContain("grid-cols-2 md:grid-cols-4");
  });

  it("renders nothing at all when there are no cards — never an empty grid (AC-8)", () => {
    expect(render(<ListingGrid cards={[]} locale="en" />)).toBe("");
  });

  it("nominates exactly one priority image, and only when the page asks", () => {
    setMediaManifest(mediaFixture());
    const grid = render(
      <ListingGrid
        cards={[IMAGE_CARD, { ...IMAGE_CARD, productId: "FO-BQ-002" }]}
        locale="en"
        priority
      />,
    );
    // One eager image and one lazy one. `fetchpriority` is counted through `loading`, because
    // React also hoists the preload `<link rel="preload" fetchPriority="high">` this render emits
    // (spec 006 AC-19) and it carries the same attribute.
    expect([...grid.matchAll(/loading="eager"/gu)]).toHaveLength(1);
    expect([...grid.matchAll(/loading="lazy"/gu)]).toHaveLength(1);
    expect(grid).toMatch(/rel="preload"/u);
    const lazy = render(<ListingGrid cards={[IMAGE_CARD]} locale="en" />);
    expect(lazy).not.toMatch(/fetchpriority="high"/iu);
    expect(lazy).toContain('loading="lazy"');
  });

  it("asks the grid slot for its sizes (§5.4)", () => {
    setMediaManifest(mediaFixture());
    const html = render(<ListingGrid cards={[IMAGE_CARD]} locale="en" />);
    expect(html).toContain('sizes="(min-width: 768px) 25vw, 50vw"');
  });
});

describe("ListingToolbar: a GET form, a plain default label and a disclosure", () => {
  it("is a form with method=get, a visible label, a select and a submit button", () => {
    const html = render(
      <ListingToolbar
        page={1}
        pageCount={7}
        productCount={84}
        sort="default"
      />,
    );
    expect(html).toMatch(/<form class="[^"]*" method="get"/u);
    expect(html).toContain('for="listing-sort"');
    expect(html).toContain('name="sort"');
    expect(html).toContain('type="submit"');
    // No island, no auto-submit: nothing here is a client control.
    expect(html).not.toContain("onchange");
  });

  it("marks the current order selected — default and sorted (the sheet's two states)", () => {
    const sorted = render(
      <ListingToolbar
        page={1}
        pageCount={7}
        productCount={84}
        sort="price-asc"
      />,
    );
    expect(sorted).toMatch(
      /<option selected="" value="price-asc">|value="price-asc" selected/u,
    );
    expect(sorted).toContain('data-fo-listing-toolbar="price-asc"');
    expect(sorted).toContain("Price: low to high");
  });

  it("renders the ranking disclosure and no banned ranking phrase (§13 Q3, AC-9)", () => {
    const html = render(
      <ListingToolbar
        page={1}
        pageCount={7}
        productCount={84}
        sort="default"
      />,
    );
    expect(html).toContain("Our order");
    expect(textOf(html)).toContain("It is not a ranking by sales");
    expect(listingHonestyViolations({ html, text: textOf(html) })).toEqual([]);
  });

  it("drops the page clause on a single-page listing", () => {
    const html = render(
      <ListingToolbar page={1} pageCount={1} productCount={9} sort="default" />,
    );
    expect(textOf(html)).toContain("9 bouquets");
    expect(textOf(html)).not.toContain("page 1 of 1");
  });

  // T-30: `pl` has four plural categories and English has two. A catalogue that echoed English
  // would read "2 bukiet" to a Polish buyer.
  it.each([
    [1, "1 bukiet"],
    [2, "2 bukiety"],
    [12, "12 bukietów"],
  ])("gets the Polish plural right for %i", (count, expected) => {
    const html = render(
      <ListingToolbar
        page={1}
        pageCount={1}
        productCount={count}
        sort="default"
      />,
      "pl",
    );
    expect(textOf(html)).toContain(expected);
  });

  it("gets the English plural right for one and many", () => {
    for (const [count, expected] of [
      [1, "1 bouquet"],
      [84, "84 bouquets"],
    ] as const) {
      const html = render(
        <ListingToolbar
          page={1}
          pageCount={1}
          productCount={count}
          sort="default"
        />,
      );
      expect(textOf(html)).toContain(expected);
    }
  });
});

describe("Pagination: real links, page 1 bare, nothing on a single page", () => {
  it("links page 1 to the bare URL and page N to ?page=N", () => {
    expect(pageHref("/en/poland/flowers", 1)).toBe("/en/poland/flowers");
    expect(pageHref("/en/poland/flowers", 3)).toBe("/en/poland/flowers?page=3");
  });

  it("is a labelled <nav> of <a>s with aria-current on the current page", () => {
    const html = render(
      <Pagination
        baseHref="/en/poland/flowers"
        locale="en"
        page={1}
        pageCount={7}
      />,
    );
    expect(html).toContain('aria-label="Pages of products"');
    expect(html).toContain('aria-current="page"');
    expect([...html.matchAll(/<a /gu)]).toHaveLength(7); // pages 2–7 plus Next
    expect(html).toContain('href="/en/poland/flowers?page=2"');
    expect(html).not.toContain("?page=1");
    expect(html).not.toContain("<button");
  });

  it("drops Next on the last page and Previous on the first", () => {
    const first = render(
      <Pagination
        baseHref="/en/poland/flowers"
        locale="en"
        page={1}
        pageCount={7}
      />,
    );
    const last = render(
      <Pagination
        baseHref="/en/poland/flowers"
        locale="en"
        page={7}
        pageCount={7}
      />,
    );
    expect(textOf(first)).toContain("Next");
    expect(textOf(first)).not.toContain("Previous");
    expect(textOf(last)).toContain("Previous");
    expect(textOf(last)).not.toContain("Next");
  });

  it("renders nothing when the listing fits on one page", () => {
    expect(
      render(
        <Pagination
          baseHref="/en/poland/flowers"
          locale="en"
          page={1}
          pageCount={1}
        />,
      ),
    ).toBe("");
  });
});

describe("ListingEmpty: an honest sentence and the ways out (AC-8)", () => {
  const LINKS = [
    {
      id: "corridor",
      href: "/en/send-flowers-to/poland",
      label: "Read the Poland guide",
    },
    { id: "destinations", href: "/en/destinations", label: "All destinations" },
  ];

  it("names the country, offers the links and renders no grid, skeleton or card", () => {
    const html = render(<ListingEmpty country="Poland" links={LINKS} />);
    expect(textOf(html)).toContain("Nothing we can deliver in Poland yet");
    expect(html).toContain('href="/en/send-flowers-to/poland"');
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("data-fo-product-card");
    expect(html).not.toContain("animate-pulse");
    expect(html).not.toContain("<img");
  });

  it("renders the sentence alone when the caller has no link it can resolve", () => {
    const html = render(<ListingEmpty country="Poland" />);
    expect(html).not.toContain("<a ");
  });

  it.each(LOCALES)("says nothing AC-6 forbids in %s", (locale) => {
    const html = render(
      <ListingEmpty country="Poland" links={LINKS} />,
      locale,
    );
    expect(listingHonestyViolations({ html, text: textOf(html) })).toEqual([]);
  });
});

describe("FromPriceChip: the only from-price on the site", () => {
  it("labels the lowest payable price as a from-price", () => {
    const html = render(
      <FromPriceChip
        locale="en-gb"
        price={{ amountMinor: 3090, currency: "GBP" }}
      />,
      "en-gb",
    );
    expect(textOf(html)).toBe("from £30.90");
    expect(html).toContain("<bdi>");
  });

  it("says which currency it is quoting when the FX snapshot is stale (005 §14 A3)", () => {
    const html = render(
      <FromPriceChip
        fxFallback
        locale="en"
        price={{ amountMinor: 22900, currency: "PLN" }}
      />,
    );
    expect(textOf(html)).toContain(
      "We are showing this price in the currency of the delivery country",
    );
    expect(html).toContain('data-fo-from-price="fx-fallback"');
  });

  it("renders nothing where there is no destination, so a hub quotes no money (AC-7)", () => {
    expect(render(<FromPriceChip locale="en" />)).toBe("");
  });
});

describe("CategoryChipRow: links to pages that exist, in collator order", () => {
  const ITEMS = [
    { key: "zz", name: "Żonkile", href: "/pl/polska/kwiaty/zonkile" },
    { key: "aa", name: "Astry", href: "/pl/polska/kwiaty/astry" },
    { key: "ll", name: "Łubin", href: "/pl/polska/kwiaty/lubin" },
  ];

  it("orders by collator(locale), so ł sorts where a Polish reader expects it (T-30)", () => {
    const html = render(
      <CategoryChipRow heading="Także dla Polski" items={ITEMS} locale="pl" />,
      "pl",
    );
    const order = [...html.matchAll(/>([^<>]+)<\/a>/gu)].map((m) => m[1]);
    expect(order).toEqual(["Astry", "Łubin", "Żonkile"]);
  });

  it("renders the current category as text with aria-current, not as a link", () => {
    const html = render(
      <CategoryChipRow
        heading="Also for Poland"
        items={[{ ...ITEMS[0]!, current: true }, ITEMS[1]!]}
        locale="en"
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect([...html.matchAll(/<a /gu)]).toHaveLength(1);
  });

  it("renders nothing when no sibling clears the floor", () => {
    expect(
      render(
        <CategoryChipRow heading="Also for Poland" items={[]} locale="en" />,
      ),
    ).toBe("");
  });
});
