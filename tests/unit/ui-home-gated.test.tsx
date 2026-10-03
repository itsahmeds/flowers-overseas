/**
 * The locale home's three **data-gated** sections and their provider seams (spec 004 §13's
 * 2026-09-08 resolution note, §3, §5.1, §8, **AC-11**, **AC-14**, **AC-15**; TASK-054).
 *
 * The gating is the deliverable, so it is what is asserted: for each section, the branch that
 * ships today, the branch a **fake provider** reaches, and the fact that swapping the provider
 * changes the rendered output with **no change at the call site** — the property spec 002/008/016
 * depend on. `tests/unit/ui-home-sections.test.tsx`'s harness, for the same reason: rendered with
 * `react-dom/server` against the real `messages/*.json`, so the asserted copy is the shipped copy.
 *
 * Two module-level swaps are exercised through `with*Provider()` (the injection hook that is
 * deliberately not exported from the barrel) rather than through the `provider` prop, because the
 * prop proves the component renders and the hook proves the **composition root** is the only
 * thing a later spec has to touch.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { COUNTRIES } from "../../src/config/countries.ts";
import { TRENDING_PICKS } from "../../src/config/trending.ts";
import { loadMessages } from "../../src/modules/i18n";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { ReviewsSection } from "../../src/modules/ui/home/ReviewsSection.tsx";
import {
  TrendingRow,
  trendingPickHref,
} from "../../src/modules/ui/home/TrendingRow.tsx";
import { listProductPages } from "../../src/modules/catalog";
import {
  destinationStatusProviderOf,
  staticDestinationStatusProvider,
  withDestinationStatusProvider,
} from "../../src/modules/ui/home/destination-status-provider.ts";
import {
  reviewsProviderOf,
  staticReviewsProvider,
  withReviewsProvider,
} from "../../src/modules/ui/home/reviews-provider.ts";
import {
  emptyTrendingProvider,
  staticTrendingProvider,
  trendingProviderOf,
  withTrendingProvider,
} from "../../src/modules/ui/home/trending-provider.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const NAMESPACES = [
  "home",
  "finder",
  "destinations",
  "destinationsHub",
  "nav",
  "media",
  "a11y",
  "common",
] as const;

function render(node: React.ReactElement, locale: string): string {
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

/** The visible text of the rendered markup: tags stripped, entities decoded. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll(/\s+/g, " ");
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/**
 * The row's two honesty lines, one exact value per locale (TASK-140). The founder chose the `en`
 * wording on 2026-10-03 (`docs/decisions-log.md`, "The trending row reads Popular choices"): the
 * heading no longer claims a sales ranking on a site with no orders ("Most sent this week"), and
 * the basis line no longer claims picks by florists who have picked nothing yet. `en-gb` inherits
 * `en` through the fallback chain; `de` and `pl` are unreviewed drafts (`reviewed: false`).
 */
const TRENDING_COPY = {
  en: {
    heading: "Popular choices",
    basis: "Our picks until real orders start.",
  },
  "en-gb": {
    heading: "Popular choices",
    basis: "Our picks until real orders start.",
  },
  de: {
    heading: "Beliebte Auswahl",
    basis: "Von uns ausgewählt, bis die ersten echten Bestellungen eingehen.",
  },
  pl: {
    heading: "Popularne wybory",
    basis: "Nasz wybór, dopóki nie pojawią się prawdziwe zamówienia.",
  },
} as const satisfies Record<
  (typeof LOCALES)[number],
  { heading: string; basis: string }
>;

/** The row's `<h2 id="trending-heading">` text, exactly as rendered. */
function trendingHeading(html: string): string | undefined {
  const inner = /id="trending-heading"[^>]*>([^<]*)</u.exec(html)?.[1];
  return inner === undefined ? undefined : text(inner).trim();
}

/** The basis line after the picks' list, or `undefined` when the row renders none. */
function trendingBasis(html: string): string | undefined {
  // v2 (TASK-177): the basis line sits under the heading, as the artboard draws it.
  const inner = /<p[^>]*data-fo-trending-basis-line[^>]*>([^<]*)<\/p>/u.exec(
    html,
  )?.[1];
  return inner === undefined ? undefined : text(inner).trim();
}

describe("the trending row is gated on real orders", () => {
  it("renders the five florists' picks by name, with no price element of any kind", () => {
    const html = render(<TrendingRow locale="en" />, "en");
    const rendered = text(html);

    expect([...html.matchAll(/<li/g)]).toHaveLength(TRENDING_PICKS.length);
    // v2 (TASK-177): the eyebrow is the destination, in the catalogue's own word ("For Poland").
    expect(html).toMatch(/<p class="eyebrow[^"]*">Poland<\/p>/);
    // Spec §3/§8: nothing here knows what a product is and no price is rendered — not a figure,
    // not a "starting at", not a currency symbol, not the canvas's grey price bar.
    expect(rendered).not.toMatch(/starting at|from\s*€|€|zł|£|\bfrom \d/iu);
    expect(html).not.toContain("data-fo-price");
  });

  it("heads the row with its own locale's heading and basis line while the basis is picks (TASK-140)", () => {
    for (const locale of LOCALES) {
      const html = render(<TrendingRow locale={locale} />, locale);

      expect(html, locale).toContain('data-fo-trending-basis="picks"');
      expect(trendingHeading(html), locale).toBe(TRENDING_COPY[locale].heading);
      expect(trendingBasis(html), locale).toBe(TRENDING_COPY[locale].basis);
    }
  });

  it("drops the label the moment the ranking is real, with no call-site change", () => {
    const ranked = trendingProviderOf(
      [{ id: "one", name: "Amber Hour", assetId: "fo-bq-001-hero" }],
      "orders",
    );
    const html = render(<TrendingRow locale="en" provider={ranked} />, "en");

    expect(html).toContain('data-fo-trending-basis="orders"');
    // The sentence is only true while the row is picks; a ranked row must not keep claiming it.
    expect(trendingBasis(html)).toBeUndefined();
    expect(text(html)).not.toContain(TRENDING_COPY.en.basis);
    expect(text(html)).toContain("Amber Hour");
  });

  it("renders no section at all when the provider answers with nothing", () => {
    expect(
      render(
        <TrendingRow locale="en" provider={emptyTrendingProvider} />,
        "en",
      ),
    ).toBe("");
  });

  it("links nothing without the product existence set, and gives every pick one `trending` box (AC-14)", () => {
    const html = render(<TrendingRow locale="en" />, "en");

    expect(hrefs(html)).toEqual([]);
    expect([...html.matchAll(/data-fo-media-slot="trending"/g)]).toHaveLength(
      TRENDING_PICKS.length,
    );
    expect(html).not.toContain('data-fo-media-slot="grid"');
    // A pick shows its photograph or the captioned placeholder and **no `<img>`** — never a
    // broken image and never a picture of something else (`plan/10` §3, spec 006 AC-18). Since
    // TASK-168 approved photo batch 2 every pick has its photograph: five of five.
    const images = [...html.matchAll(/<img/g)].length;
    const placeholders = [...html.matchAll(/data-fo-media-placeholder="/g)]
      .length;
    expect(TRENDING_PICKS).toHaveLength(5);
    expect(images).toBe(5);
    expect(placeholders).toBe(0);
  });

  it("captions a pick with no photograph as a product, in its `trending` box, with no <img> (TASK-168)", () => {
    // Every shipped pick is photographed since batch 2, so the placeholder branch needs its own
    // subject: a pick whose asset the manifest does not hold. Its caption is the product one —
    // the box holds a bouquet, not an occasion or a hero band (`MediaAsset`'s `PLACEHOLDER_KEY`).
    const unphotographed = trendingProviderOf([
      { id: "missing", name: "Quiet Blush", assetId: "fo-no-such-asset-hero" },
    ]);
    const html = render(
      <TrendingRow locale="en" provider={unphotographed} />,
      "en",
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('data-fo-media-slot="trending"');
    expect(html).toContain('data-fo-media-placeholder="unknownAsset"');
    expect(text(html)).toContain(
      "Photography to supply · this bouquet as our florist makes it",
    );
    expect(text(html)).not.toContain(
      "Photography to supply · flowers sent for this occasion",
    );
  });

  it("tells the browser the card's rendered width, not the listing grid's (TASK-168, AC-15)", () => {
    // `MEDIA_SLOT_SPECS.trending`, written out: the row is 2-up below `md` and 5-up from it,
    // inside `HOME_BLEED`, so the browser picks the rung that fits a ~178 px phone card rather
    // than the 640 w one the listing grid's 50vw asked for.
    const TRENDING_SIZES =
      "(min-width: 768px) calc(20vw - 41.6px), calc(50vw - 28px)";
    const html = render(<TrendingRow locale="en" />, "en");
    const sizes = [...html.matchAll(/\bsizes="([^"]*)"/g)].map(
      (match) => match[1],
    );
    // Every `<source>` and the `<img>` of each of the five pictures carry it, and nothing else.
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(sizes)).toEqual(new Set([TRENDING_SIZES]));
  });

  it("links every card to its product page in the demo destination, in every locale (TASK-173)", async () => {
    // Spec 008 §14 A14 (e): the founder clicked five bouquets on the live home and none went
    // anywhere while their pages answered 200. The home hands the row the catalogue's product
    // existence set; each card is then an `<a>` to the **Polish** page of its own SKU.
    for (const locale of LOCALES) {
      const pages = await listProductPages(locale);
      const html = render(
        <TrendingRow locale={locale} productPages={pages} />,
        locale,
      );
      const expected = TRENDING_PICKS.map(
        (pick) =>
          pages.find(
            (page) => page.sku === pick.sku && page.countryIso === "PL",
          )?.path,
      );
      expect(
        expected.every((path) => path !== undefined),
        locale,
      ).toBe(true);
      expect(hrefs(html), locale).toEqual(expected);
      // Exactly one link per card, and the card's name and photo box are inside it.
      for (const pick of TRENDING_PICKS) {
        const card = html.slice(
          html.indexOf(`data-fo-trending-pick="${pick.id}"`),
        );
        expect(card.slice(0, card.indexOf("</li>")), pick.id).toMatch(
          /<a class="block no-underline[^"]*" href="[^"]+">[\s\S]*data-fo-media-slot[\s\S]*<\/a>/u,
        );
      }
    }
    // The one value, pinned: the first pick's English page, in Poland.
    const english = render(
      <TrendingRow locale="en" productPages={await listProductPages("en")} />,
      "en",
    );
    expect(hrefs(english)[0]).toMatch(/^\/en\/poland\/product\/[a-z0-9-]+$/u);
  });

  it("does not link a card whose page does not exist, nor one in another destination", () => {
    const pages = [
      { sku: "FO-BQ-001", countryIso: "PL", path: "/en/poland/product/a" },
      { sku: "FO-BQ-002", countryIso: "DE", path: "/en/germany/product/b" },
    ];
    expect(trendingPickHref("FO-BQ-001", pages)).toBe("/en/poland/product/a");
    expect(trendingPickHref("FO-BQ-002", pages)).toBeUndefined();
    expect(trendingPickHref("FO-BQ-003", pages)).toBeUndefined();
    expect(trendingPickHref(undefined, pages)).toBeUndefined();
    const html = render(<TrendingRow locale="en" productPages={pages} />, "en");
    expect(hrefs(html)).toEqual(["/en/poland/product/a"]);
  });

  it("links no card while the `product` link id is unpublished, whatever pages exist (`/break 162` hole 1)", async () => {
    // Permission and existence are both required: a full product existence set must not turn
    // a card into a link if the registry withdraws the product page. The registry is flipped in
    // a mocked module, and the row re-imported so it reads the mock.
    const pages = await listProductPages("en");
    vi.resetModules();
    const actual = await vi.importActual<
      typeof import("../../src/config/site-links.ts")
    >("../../src/config/site-links.ts");
    vi.doMock("../../src/config/site-links.ts", () => ({
      ...actual,
      isPublished: (id: Parameters<typeof actual.isPublished>[0]) =>
        id !== "product" && actual.isPublished(id),
    }));
    try {
      const row = await import("../../src/modules/ui/home/TrendingRow.tsx");
      const html = render(
        <row.TrendingRow locale="en" productPages={pages} />,
        "en",
      );
      expect(html).toContain("data-fo-trending-pick");
      expect([...html.matchAll(/<a\s/g)]).toHaveLength(0);
      expect(row.trendingPickHref("FO-BQ-001", pages)).toBeUndefined();
    } finally {
      vi.doUnmock("../../src/config/site-links.ts");
      vi.resetModules();
    }
    // …and the same pages with the committed registry link all five, so the case above is not
    // vacuous.
    const linked = render(
      <TrendingRow locale="en" productPages={pages} />,
      "en",
    );
    expect([...linked.matchAll(/<a\s/g)]).toHaveLength(5);
  });

  it("takes its names from the committed catalogue, so none of them is invented", () => {
    const rendered = text(render(<TrendingRow locale="en" />, "en"));
    for (const pick of staticTrendingProvider.list()) {
      expect(rendered, pick.name).toContain(pick.name);
    }
    expect(staticTrendingProvider.basis()).toBe("picks");
  });

  it("swaps at the composition root: the module-level provider changes the output", async () => {
    const before = render(<TrendingRow locale="en" />, "en");
    const after = await withTrendingProvider(emptyTrendingProvider, () =>
      render(<TrendingRow locale="en" />, "en"),
    );
    const restored = render(<TrendingRow locale="en" />, "en");

    expect(before).not.toBe("");
    expect(after).toBe("");
    expect(restored).toBe(before);
  });
});

describe("the verified-reviews section renders nothing until a review exists", () => {
  it("renders nothing in every locale with the shipped provider (AC-15)", () => {
    for (const locale of LOCALES) {
      expect(render(<ReviewsSection locale={locale} />, locale), locale).toBe(
        "",
      );
    }
    expect(staticReviewsProvider.list()).toEqual([]);
  });

  it("renders the artboard's band once a provider answers with real reviews", () => {
    const provider = reviewsProviderOf([
      {
        id: "r1",
        body: "Fixture text, not a review.",
        authorFirstName: "Fixture",
        place: "Warszawa",
        date: "2026-09-01",
        kind: "order",
      },
    ]);
    const html = render(
      <ReviewsSection locale="en" provider={provider} />,
      "en",
    );
    const rendered = text(html);

    expect(rendered).toContain("What buyers and recipients say");
    expect(rendered).toContain("Fixture · sent to Warszawa · 01/09/2026");
    expect(rendered).toContain("verified order");
    // The Trustpilot slot is a *named region with nothing in it*: no score, no logo, no script.
    expect(html).toContain("data-fo-reviews-trustpilot");
    expect(html).toContain('role="region"');
    expect(rendered).not.toMatch(/\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/u);
    // No star row, no rating widget and no third-party mark in the markup.
    expect(html).not.toMatch(/★|⭐|itemprop="ratingValue"/u);
  });

  it("never renders the canvas's placeholder attribution rows", () => {
    const html = render(<ReviewsSection locale="en" />, "en");
    expect(html).not.toContain("[Buyer first name]");
    expect(html).not.toContain("[date]");
  });

  it("swaps at the composition root, with no call-site change", async () => {
    const populated = await withReviewsProvider(
      reviewsProviderOf([
        {
          id: "r1",
          body: "Fixture text, not a review.",
          authorFirstName: "Fixture",
          place: "Kraków",
          date: "2026-09-02",
          kind: "delivery",
        },
      ]),
      () => render(<ReviewsSection locale="en" />, "en"),
    );

    expect(populated).not.toBe("");
    expect(text(populated)).toContain("verified delivery");
    // Restored: the page is back to rendering nothing.
    expect(render(<ReviewsSection locale="en" />, "en")).toBe("");
  });
});

describe("the destinations grid", () => {
  const grid = (locale: string): string =>
    render(<DestinationsGrid locale={locale} />, locale);

  it("names all seven destinations with their state word (AC-14, spec 007 AC-20)", () => {
    const html = grid("en");
    const rendered = text(html);

    for (const country of COUNTRIES) {
      expect(html, country.iso2).toContain(
        `data-fo-destination="${country.iso2}"`,
      );
    }
    expect(rendered).toContain("Delivering now");
    expect(rendered).toContain("Guide · not delivering yet");
    // TASK-092 published the seven corridor targets: every destination whose guide exists in
    // this locale is a link, from the same loop and with no markup change (spec 007 AC-20).
    expect(hrefs(html).length).toBe(COUNTRIES.length);
    for (const href of hrefs(html)) {
      expect(href).toMatch(/^\/en\/send-flowers-to\/[a-z-]+$/);
    }
  });

  it("links nothing in a locale with no authored guide (spec 007 §13 Q1, AC-17)", () => {
    // `/de` and `/pl` have no corridor page, so every destination is text — the same component,
    // the same DOM shape, one element different.
    for (const locale of ["de", "pl"]) {
      const html = grid(locale);
      expect(hrefs(html), locale).toEqual([]);
      for (const country of COUNTRIES) {
        expect(html, `${locale}/${country.iso2}`).toContain(
          `data-fo-destination="${country.iso2}"`,
        );
      }
    }
  });

  it("names no city at all: the v2 chips claim no coverage (plan/10 §3)", () => {
    const rendered = text(grid("en"));

    // The opening rule is stated as a rule, not as a fact Poland already meets (2026-10-04).
    expect(rendered).toContain(
      "We open each country only once we have local florists there we can stand behind.",
    );
    expect(rendered).not.toContain("met enough florists");

    for (const city of ["Warszawa", "Kraków", "Berlin", "Paris", "Madrid"]) {
      expect(rendered, city).not.toContain(city);
    }
  });

  it("puts the delivering destination first and collates the rest per locale", () => {
    const order = (locale: string): string[] =>
      [...grid(locale).matchAll(/data-fo-destination="([A-Z]{2})"/g)].map(
        (match) => match[1] ?? "",
      );

    expect(order("en")[0]).toBe("PL");
    expect(order("pl")[0]).toBe("PL");
    // The six guides are collated, not registry-ordered (which is DE, FR, ES, IT, RO, NL).
    expect(order("en").slice(1)).toEqual(["FR", "DE", "IT", "NL", "RO", "ES"]);
    expect(order("en")).toHaveLength(COUNTRIES.length);
  });

  it("links the delivering destination's poppy chip to its shop root when the page hands one in", () => {
    const html = render(
      <DestinationsGrid locale="en" shopHref="/en/poland/flowers" />,
      "en",
    );
    const poland = html.slice(html.indexOf('data-fo-destination="PL"'));

    expect(poland.slice(0, poland.indexOf("</li>"))).toMatch(
      /<a class="[^"]*bg-accent[^"]*" href="\/en\/poland\/flowers">Poland/u,
    );
    // The six others still go to their guides, and nothing on the section asks for input.
    expect(
      hrefs(html).filter((href) => href.includes("send-flowers-to")),
    ).toHaveLength(6);
    for (const tag of ["<input", "<form", "<button", "<select", "<textarea"]) {
      expect(html, tag).not.toContain(tag);
    }
  });

  it('keeps the `destinations` id, the home\'s anchor for every "where" question', () => {
    expect(grid("en")).toContain('id="destinations"');
  });

  it("renders the published destination as a link, from the same loop (AC-11)", () => {
    const provider = destinationStatusProviderOf(COUNTRIES, (iso2) =>
      iso2 === "PL" ? "/en/send-flowers-to/poland" : undefined,
    );
    const html = render(
      <DestinationsGrid locale="en" provider={provider} />,
      "en",
    );

    expect(hrefs(html)).toEqual(["/en/send-flowers-to/poland"]);
    expect(html).toContain('data-fo-destination="DE"');
  });

  it("swaps at the composition root, with no call-site change", async () => {
    const published = await withDestinationStatusProvider(
      destinationStatusProviderOf(COUNTRIES, (iso2) =>
        iso2 === "PL" ? "/en/send-flowers-to/poland" : undefined,
      ),
      () => grid("en"),
    );

    expect(hrefs(published)).toEqual(["/en/send-flowers-to/poland"]);
    // Restored: the shipped provider answers from the registry again — seven links in `en`, none
    // in `de`, which is the existence rule and not a second flag.
    expect(hrefs(grid("en")).length).toBe(COUNTRIES.length);
    expect(
      staticDestinationStatusProvider
        .list("de", (key) => key)
        .filter((destination) => destination.href !== undefined),
    ).toEqual([]);
  });
});
